"""Trusted single-demo signer; credentials arrive only from the reviewed proxy."""

import base64
import datetime
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import threading
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location("game_upload_plan", Path(__file__).with_name("plan.py"))
plan_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plan_module)
ROOT, load, validate = plan_module.ROOT, plan_module.load, plan_module.validate

BUCKET = "scummvm-games"
ENDPOINT = "https://83e1ce4a70ea388693e8525a772ccefa.r2.cloudflarestorage.com"
ORIGIN = "https://scummvm-games.tsilva.eu"
CACHE = "public, max-age=31536000, immutable"
HEADER = "X-Scummweb-R2-Credential"
SOURCE = {"instance": "https://app.infisical.com", "project-id": "e1c358f8-0678-45d7-a2a8-270c2f29aadd", "environment": "dev", "secret-path": "/"}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        raise ValueError("Redirect refused")


def signed_headers(method, key, payload_hash, credential, extra=None):
    now = datetime.datetime.now(datetime.UTC)
    date, stamp = now.strftime("%Y%m%d"), now.strftime("%Y%m%dT%H%M%SZ")
    headers = {"host": ENDPOINT.split("//", 1)[1], "x-amz-date": stamp, "x-amz-content-sha256": payload_hash, **(extra or {})}
    names = ";".join(sorted(headers))
    canonical = "".join(name + ":" + headers[name].strip() + "\n" for name in sorted(headers))
    request = f"{method}\n/{BUCKET}/{key}\n\n{canonical}\n{names}\n{payload_hash}"
    scope = date + "/auto/s3/aws4_request"
    message = "\n".join(["AWS4-HMAC-SHA256", stamp, scope, hashlib.sha256(request.encode()).hexdigest()])
    signing_key = ("AWS4" + credential["secret_access_key"]).encode()
    for item in [date, "auto", "s3", "aws4_request"]:
        signing_key = hmac.new(signing_key, item.encode(), hashlib.sha256).digest()
    signature = hmac.new(signing_key, message.encode(), hashlib.sha256).hexdigest()
    headers["authorization"] = f"AWS4-HMAC-SHA256 Credential={credential['access_key_id']}/{scope}, SignedHeaders={names}, Signature={signature}"
    return headers


def policy_from(path):
    path = Path(path)
    info = path.stat()
    if path.resolve() != path.absolute() or not path.is_file() or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 4096:
        raise ValueError("Expected an owner-only signing policy")
    policy = json.loads(path.read_text())
    if (
        set(policy) != {"version", "listen_port", "credential_sha256", "source", "check_object"}
        or type(policy["version"]) is not int or policy["version"] != 1
        or type(policy["listen_port"]) is not int or policy["listen_port"] != 61788
        or policy["source"] != SOURCE
        or not re.fullmatch(r"[a-f0-9]{64}", policy["credential_sha256"])
        or policy["check_object"] != {"key": "gob3.zip", "bytes": 1055315}
    ):
        raise ValueError("Unexpected game signing policy")
    return policy


class Bridge:
    def __init__(self, policy, plan=None, root=ROOT, opener=None):
        self.policy, self.plan, self.root = policy, plan, root
        self.stage = "prepared"
        self.opener = opener or urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        self.lock, self.result, self.started = threading.Lock(), None, False

    def credential(self, raw):
        if len(raw) > 256 or not hmac.compare_digest(hashlib.sha256(raw.encode()).hexdigest(), self.policy["credential_sha256"]):
            raise PermissionError("Unrecognized proxy credential")
        value = json.loads(raw)
        if set(value) != {"access_key_id", "secret_access_key"} or not re.fullmatch(r"[a-f0-9]{32}", value["access_key_id"]) or not re.fullmatch(r"[a-f0-9]{64}", value["secret_access_key"]):
            raise PermissionError("Unexpected credential format")
        return value

    def request(self, method, key, credential, body=None, payload_hash=None, extra=None):
        payload_hash = payload_hash or hashlib.sha256(b"").hexdigest()
        request = urllib.request.Request(ENDPOINT + "/" + BUCKET + "/" + key, data=body, method=method,
            headers=signed_headers(method, key, payload_hash, credential, extra))
        return self.opener.open(request, timeout=600 if method == "PUT" else 25)

    def head(self, key, credential):
        try:
            with self.request("HEAD", key, credential) as response:
                return dict(response.headers)
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            raise

    def verify_public(self, key):
        request = urllib.request.Request(ORIGIN + "/" + key, headers={"Cache-Control": "no-cache", "User-Agent": "ScummWEB/1.0"})
        digest, length = hashlib.sha256(), 0
        with self.opener.open(request, timeout=120) as response:
            if response.headers.get_content_type() != "application/zip" or response.headers.get("Cache-Control") != CACHE:
                raise ValueError("Unexpected public game metadata")
            while block := response.read(1024 * 1024):
                length += len(block)
                if length > self.plan["bytes"]:
                    raise ValueError("Oversized public game object")
                digest.update(block)
        if length != self.plan["bytes"] or digest.hexdigest() != self.plan["sha256"]:
            raise ValueError("Public game object differs from plan")

    def publish(self, credential):
        plan = self.plan
        self.stage = "source-validation"
        source = validate(self.root, plan)
        key = plan["gameId"] + ".zip"
        self.stage = "existing-object-check"
        existing = self.head(key, credential)
        uploaded = False
        if existing is None:
            self.stage = "source-read"
            descriptor = os.open(source, os.O_RDONLY | os.O_NOFOLLOW)
            with os.fdopen(descriptor, "rb") as stream:
                before = os.fstat(stream.fileno())
                sha, md5 = hashlib.sha256(), hashlib.md5(usedforsecurity=False)
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    sha.update(block)
                    md5.update(block)
                if before.st_size != plan["bytes"] or sha.hexdigest() != plan["sha256"]:
                    raise ValueError("Game changed before upload")
                stream.seek(0)
                extra = {"content-type": "application/zip", "content-length": str(plan["bytes"]), "content-md5": base64.b64encode(md5.digest()).decode(), "cache-control": CACHE, "if-none-match": "*", "x-amz-meta-sha256": plan["sha256"]}
                try:
                    self.stage = "conditional-upload"
                    with self.request("PUT", key, credential, stream, plan["sha256"], extra):
                        uploaded = True
                except urllib.error.HTTPError as error:
                    if error.code != 412:
                        raise
                after = os.fstat(stream.fileno())
                if (before.st_ino, before.st_size, before.st_mtime_ns) != (after.st_ino, after.st_size, after.st_mtime_ns):
                    raise ValueError("Game changed during upload")
        self.stage = "public-verification"
        self.verify_public(key)
        return {"ok": True, "state": "complete", "target": plan["target"], "key": key, "uploaded": uploaded, "bytes": plan["bytes"], "sha256": plan["sha256"]}

    def worker(self, credential):
        try:
            result = self.publish(credential)
        except Exception as error:
            kind = "http" if isinstance(error, urllib.error.HTTPError) else "connection" if isinstance(error, (OSError, urllib.error.URLError)) else "input" if isinstance(error, ValueError) else "internal"
            result = {"ok": False, "state": "failed", "error": "Game upload or verification failed", "stage": self.stage, "kind": kind}
            if isinstance(error, urllib.error.HTTPError):
                result["status"] = error.code
        with self.lock:
            self.result = result

    def call(self, operation, data, raw):
        credential = self.credential(raw)
        if data != {}:
            raise ValueError("Requests carry no arbitrary upload data")
        if operation == "check":
            item = self.policy["check_object"]
            headers = self.head(item["key"], credential)
            headers = {key.lower(): value for key, value in (headers or {}).items()}
            if headers.get("content-length") != str(item["bytes"]) or headers.get("content-type") != "application/zip":
                raise ValueError("Pinned game check failed")
            return {"ok": True, "read_only": True, "credential_mode": "public-placeholder"}
        if operation not in {"publish", "status"} or self.plan is None:
            raise PermissionError("No game plan selected")
        with self.lock:
            if operation == "publish" and not self.started:
                self.started = True
                threading.Thread(target=self.worker, args=(credential,), daemon=True).start()
            return self.result or {"ok": True, "state": "running" if self.started else "prepared"}


def server(bridge, port):
    class Server(ThreadingHTTPServer):
        daemon_threads = True

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_POST(self):
            result, status = {"ok": False, "error": "Game request refused"}, 403
            try:
                if self.path not in {"/games/check", "/games/publish", "/games/status"} or self.headers.get("Content-Type") != "application/json" or self.headers.get("Transfer-Encoding"):
                    raise PermissionError()
                lengths, keys = self.headers.get_all("Content-Length"), self.headers.get_all(HEADER)
                if not lengths or len(lengths) != 1 or not re.fullmatch(r"[0-9]{1,4}", lengths[0]) or not 0 < int(lengths[0]) <= 2048 or not keys or len(keys) != 1:
                    raise PermissionError()
                self.connection.settimeout(10)
                body = self.rfile.read(int(lengths[0]))
                if len(body) != int(lengths[0]):
                    raise PermissionError()
                result = bridge.call(self.path.rsplit("/", 1)[1], json.loads(body), keys[0])
                status = 200
            except PermissionError:
                pass
            except Exception:
                status = 502
            body = json.dumps(result).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Server(("127.0.0.1", port), Handler)


if __name__ == "__main__":
    try:
        if len(sys.argv) != 3:
            raise ValueError("Expected policy and exact game plan")
        policy = policy_from(sys.argv[1])
        plan = None if sys.argv[2] == "/dev/null" else load(ROOT, Path(sys.argv[2]))
        with server(Bridge(policy, plan), policy["listen_port"]) as http:
            print(json.dumps({"ready": True, "port": policy["listen_port"]}), flush=True)
            http.serve_forever()
    except Exception:
        raise SystemExit("Game signing relay stopped; details withheld") from None
