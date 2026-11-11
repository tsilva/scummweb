"""Trusted R2 signer: credentials arrive only on the proxy-to-relay request."""

import base64
import datetime
import hashlib
import hmac
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ACCOUNT = "83e1ce4a70ea388693e8525a772ccefa"
BUCKET = "scummvm-games"
ENDPOINT = f"https://{ACCOUNT}.r2.cloudflarestorage.com"
ORIGIN = "https://scummvm-games.tsilva.eu"
CACHE = "public, max-age=31536000, immutable"
MAX_BYTES = 2 * 1024 * 1024
MAX_JSON = (MAX_BYTES * 4 // 3) + 8192
HEADER = "X-Scummweb-R2-Credential"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def entries(manifest):
    if (
        not isinstance(manifest, dict)
        or type(manifest.get("version")) is not int
        or manifest["version"] != 1
        or manifest.get("origin") != ORIGIN
        or not isinstance(manifest.get("files"), dict)
        or not 1 <= len(manifest["files"]) <= 512
    ):
        raise ValueError("Invalid artwork plan")
    result = {}
    formats = {
        "png": "image/png",
        "webp": "image/webp",
        "avif": "image/avif",
        "jpg": "image/jpeg",
    }
    for name, entry in manifest["files"].items():
        if not re.fullmatch(
            r"/launcher/(?:(?:responsive|optimized)/)?[a-z0-9-]+\.(?:webp|png|avif)|"
            r"/image-assets/sources/road-gameplay\.jpg",
            name,
        ):
            raise ValueError("Invalid logical artwork path")
        if (
            not isinstance(entry, dict)
            or not re.fullmatch(r"[a-f0-9]{64}", entry.get("sha256", ""))
            or entry.get("key")
            != f"artwork/{entry['sha256']}/{name.rsplit('/', 1)[-1]}"
            or type(entry.get("bytes")) is not int
            or not 1 <= entry["bytes"] <= MAX_BYTES
            or entry.get("contentType") != formats[name.rsplit(".", 1)[-1]]
            or entry["key"] in result
        ):
            raise ValueError("Invalid artwork entry")
        result[entry["key"]] = {
            k: entry[k] for k in ["key", "sha256", "bytes", "contentType"]
        }
    return result


def sign(method, url, body, credential, extra=None):
    now = datetime.datetime.now(datetime.UTC)
    date, stamp = now.strftime("%Y%m%d"), now.strftime("%Y%m%dT%H%M%SZ")
    target = urllib.parse.urlsplit(url)
    headers = {
        "host": target.netloc,
        "x-amz-date": stamp,
        "x-amz-content-sha256": digest(body),
    }
    headers.update(extra or {})
    names = ";".join(sorted(headers))
    canonical = "".join(k + ":" + headers[k].strip() + "\n" for k in sorted(headers))
    request = (
        f"{method}\n{target.path}\n{target.query}\n{canonical}\n{names}\n{digest(body)}"
    )
    scope = date + "/auto/s3/aws4_request"
    text = "\n".join(["AWS4-HMAC-SHA256", stamp, scope, digest(request.encode())])
    key = ("AWS4" + credential["secret_access_key"]).encode()
    for part in [date, "auto", "s3", "aws4_request"]:
        key = hmac.new(key, part.encode(), hashlib.sha256).digest()
    headers["authorization"] = (
        "AWS4-HMAC-SHA256 Credential="
        + credential["access_key_id"]
        + "/"
        + scope
        + ", SignedHeaders="
        + names
        + ", Signature="
        + hmac.new(key, text.encode(), hashlib.sha256).hexdigest()
    )
    return headers


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        raise ValueError("Redirect refused")


class Bridge:
    def __init__(self, policy, plan, upstream=ENDPOINT):
        self.policy, self.upstream = policy, upstream
        self.allowed = entries(plan) if plan is not None else {}
        check = policy["check_object"]
        entries(
            {
                "version": 1,
                "origin": ORIGIN,
                "files": {
                    "/launcher/optimized/" + check["key"].rsplit("/", 1)[-1]: check
                },
            }
        )

    def call(self, operation, data, raw):
        if not hmac.compare_digest(
            digest(raw.encode()), self.policy["credential_sha256"]
        ):
            raise PermissionError("Unrecognized proxy credential")
        credential = json.loads(raw)
        if (
            set(credential) != {"access_key_id", "secret_access_key"}
            or not re.fullmatch(r"[a-f0-9]{32}", credential["access_key_id"])
            or not re.fullmatch(r"[a-f0-9]{64}", credential["secret_access_key"])
        ):
            raise PermissionError("Unexpected credential")
        if operation == "check":
            if data != {}:
                raise ValueError("Invalid check")
            entry, body, method, extra = self.policy["check_object"], b"", "HEAD", {}
        else:
            expected = {"key", "body"} if operation == "put" else {"key"}
            if (
                operation not in {"get", "put"}
                or not isinstance(data, dict)
                or set(data) != expected
            ):
                raise ValueError("Invalid operation")
            if data["key"] not in self.allowed:
                raise PermissionError("Object outside approved plan")
            entry, body, method, extra = self.allowed[data["key"]], b"", "GET", {}
            if operation == "put":
                body = base64.b64decode(data["body"], validate=True)
                if len(body) != entry["bytes"] or digest(body) != entry["sha256"]:
                    raise ValueError("Artwork bytes changed")
                method = "PUT"
                extra = {
                    "content-type": entry["contentType"],
                    "cache-control": CACHE,
                    "if-none-match": "*",
                }
        url = (
            self.upstream
            + "/"
            + BUCKET
            + "/"
            + urllib.parse.quote(entry["key"], safe="/-_.~")
        )
        request = urllib.request.Request(
            url,
            method=method,
            data=body if method == "PUT" else None,
            headers=sign(method, url, body, credential, extra),
        )
        try:
            with urllib.request.build_opener(
                urllib.request.ProxyHandler({}), NoRedirect()
            ).open(request, timeout=25) as response:
                if method == "PUT":
                    return {"ok": True}
                if (
                    response.headers.get("Content-Type") != entry["contentType"]
                    or response.headers.get("Cache-Control") != CACHE
                    or response.headers.get("Content-Length") != str(entry["bytes"])
                ):
                    raise ValueError("R2 metadata mismatch")
                if operation == "check":
                    return {
                        "ok": True,
                        "read_only": True,
                        "metadata_matched": True,
                        "credential_mode": "public-placeholder",
                    }
                payload = response.read(entry["bytes"] + 1)
                if len(payload) != entry["bytes"] or digest(payload) != entry["sha256"]:
                    raise ValueError("R2 checksum mismatch")
                return {
                    "ok": True,
                    "body": base64.b64encode(payload).decode(),
                    "contentType": entry["contentType"],
                    "cacheControl": CACHE,
                }
        except urllib.error.HTTPError as error:
            if operation == "get" and error.code == 404:
                return {"ok": True, "missing": True}
            raise ValueError("R2 operation rejected") from None


class Server(ThreadingHTTPServer):
    daemon_threads = True
    block_on_close = True

    def handle_error(self, *_args):
        # Request headers may contain the injected credential. Never log them.
        pass


def server(bridge, port):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(30)

        def log_message(self, *_args):
            pass

        def do_POST(self):
            status, result = 403, {"ok": False}
            try:
                if self.path not in {"/artwork/get", "/artwork/put", "/artwork/check"}:
                    raise PermissionError()
                values = self.headers.get_all("Content-Length")
                if (
                    not values
                    or len(values) != 1
                    or not values[0].isdigit()
                    or not 1 <= int(values[0]) <= MAX_JSON
                    or self.headers.get("Transfer-Encoding")
                ):
                    raise ValueError()
                keys = self.headers.get_all(HEADER)
                if not keys or len(keys) != 1:
                    raise PermissionError()
                data = json.loads(self.rfile.read(int(values[0])))
                result = bridge.call(self.path.rsplit("/", 1)[-1], data, keys[0])
                status = 200
            except PermissionError:
                pass
            except Exception:  # noqa: BLE001 -- never echo credentials or provider bodies
                status = 502
            raw = json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)

    return Server(("127.0.0.1", port), Handler)


def main():
    from pathlib import Path

    if len(sys.argv) != 2:
        raise ValueError()
    policy = json.loads(Path(sys.argv[1]).read_text())
    if (
        set(policy) != {"version", "listen_port", "credential_sha256", "check_object"}
        or policy["version"] != 1
    ):
        raise ValueError()
    raw = sys.stdin.buffer.read(4 * 1024 * 1024 + 1)
    if len(raw) > 4 * 1024 * 1024:
        raise ValueError()
    plan = json.loads(raw)
    with server(Bridge(policy, plan), policy["listen_port"]) as http:
        print(json.dumps({"ready": True, "port": http.server_port}), flush=True)
        http.serve_forever()


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 -- trusted process diagnostics must stay sanitized
        raise SystemExit("Trusted artwork relay failed; details withheld") from None
