"""Trusted single-demo signer; credentials arrive only from the reviewed proxy."""

import base64
import contextlib
import datetime
import hashlib
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from types import SimpleNamespace

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
CURL = "/usr/bin/curl"
TRANSFER_PROTOCOL = "=https"
HTTP_VERSIONS = {"1.1", "2"}
PART_BYTES = 5 * 1024 * 1024


def multipart_query(query):
    if query is None:
        return ""
    if query == {"uploads": ""}:
        return "uploads="
    if not isinstance(query, dict) or set(query) not in ({"uploadId"}, {"partNumber", "uploadId"}):
        raise ValueError("Unexpected multipart query")
    if not re.fullmatch(r"[A-Za-z0-9_~+/=.\-]{1,1024}", query["uploadId"]):
        raise ValueError("Invalid multipart identity")
    if "partNumber" in query and not re.fullmatch(r"[1-9][0-9]{0,3}", query["partNumber"]):
        raise ValueError("Invalid multipart number")
    return urllib.parse.urlencode(sorted(query.items()), quote_via=urllib.parse.quote, safe="~")


class TransferError(OSError):
    def __init__(self, code, uploaded):
        super().__init__("Verified HTTPS transfer failed; details withheld")
        self.code = code if type(code) is int and 0 <= code <= 999 else 0
        self.uploaded = int(uploaded) if re.fullmatch(r"[0-9]{1,12}", uploaded) else 0


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        raise ValueError("Redirect refused")


def curl_request(method, key, headers, body=None, query=None):
    """Pinned HTTPS client; signatures enter stdin, never argv, files or env."""
    if method not in {"HEAD", "PUT"} or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}\.zip", key):
        raise ValueError("Unexpected transfer request")
    if any(not isinstance(value, str) or "\r" in value or "\n" in value for value in headers.values()):
        raise ValueError("Unexpected transfer headers")
    suffix = multipart_query(query)
    options = ["http2", "tlsv1.2", "silent", "show-error", "connect-timeout = 10", "max-time = 120",
               'output = "/dev/null"', 'user-agent = "ScummWEB/1.0"',
               "proto = " + json.dumps(TRANSFER_PROTOCOL),
               "url = " + json.dumps(ENDPOINT + "/" + BUCKET + "/" + key + ("?" + suffix if suffix else ""))]
    descriptors = ()
    if method == "PUT":
        part = query is not None and set(query) == {"partNumber", "uploadId"}
        if body is None or (not part and (headers.get("if-none-match") != "*" or headers.get("content-type") != "application/zip")):
            raise ValueError("Conditional ZIP upload required")
        descriptor = body.fileno()
        size = os.fstat(descriptor).st_size
        if not 0 < size <= PART_BYTES or str(size) != headers.get("content-length"):
            raise ValueError("Transfer length differs from the source")
        descriptors = (descriptor,)
        options += ['request = "PUT"', "data-binary = " + json.dumps("@/dev/fd/" + str(descriptor)), 'header = "Expect:"',
                    'write-out = "%{http_code}|%{http_version}|%{size_upload}|%header{etag}"']
    else:
        if body is not None:
            raise ValueError("HEAD cannot carry an upload body")
        options += ["head", 'write-out = "%{http_code}|%{http_version}|%header{content-length}|%{content_type}"']
    options += ["header = " + json.dumps(name + ": " + value) for name, value in headers.items()]
    result = subprocess.run([CURL, "--disable", "--config", "-"], input="\n".join(options) + "\n",
        capture_output=True, text=True, timeout=130, pass_fds=descriptors,
        env={"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "LC_ALL": "C"})
    fields = result.stdout.strip().split("|")
    if result.returncode or len(fields) != 4 or not re.fullmatch(r"[1-5][0-9]{2}", fields[0]) or fields[1] not in HTTP_VERSIONS:
        raise TransferError(result.returncode, fields[2] if method == "PUT" and len(fields) == 4 else "0")
    status = int(fields[0])
    if not 200 <= status < 300:
        raise urllib.error.HTTPError(ENDPOINT + "/" + BUCKET + "/" + key, status, "Transfer refused", {}, None)
    response_headers = {}
    if method == "HEAD":
        if not re.fullmatch(r"[0-9]{1,12}", fields[2]) or fields[3] != "application/zip":
            raise ValueError("Unexpected game metadata")
        response_headers = {"Content-Length": fields[2], "Content-Type": fields[3]}
    elif query is not None:
        if not re.fullmatch(r'"[a-fA-F0-9]{32}"', fields[3]):
            raise ValueError("Invalid multipart checksum")
        response_headers = {"ETag": fields[3]}
    return contextlib.nullcontext(SimpleNamespace(headers=response_headers))


def signed_headers(method, key, payload_hash, credential, extra=None, query=None):
    now = datetime.datetime.now(datetime.UTC)
    date, stamp = now.strftime("%Y%m%d"), now.strftime("%Y%m%dT%H%M%SZ")
    headers = {"host": ENDPOINT.split("//", 1)[1], "x-amz-date": stamp, "x-amz-content-sha256": payload_hash, **(extra or {})}
    names = ";".join(sorted(headers))
    canonical = "".join(name + ":" + headers[name].strip() + "\n" for name in sorted(headers))
    request = f"{method}\n/{BUCKET}/{key}\n{multipart_query(query)}\n{canonical}\n{names}\n{payload_hash}"
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
        self.native_transport = opener is None
        self.lock, self.result, self.started = threading.Lock(), None, False

    def credential(self, raw):
        if len(raw) > 256 or not hmac.compare_digest(hashlib.sha256(raw.encode()).hexdigest(), self.policy["credential_sha256"]):
            raise PermissionError("Unrecognized proxy credential")
        value = json.loads(raw)
        if set(value) != {"access_key_id", "secret_access_key"} or not re.fullmatch(r"[a-f0-9]{32}", value["access_key_id"]) or not re.fullmatch(r"[a-f0-9]{64}", value["secret_access_key"]):
            raise PermissionError("Unexpected credential format")
        return value

    def request(self, method, key, credential, body=None, payload_hash=None, extra=None, query=None):
        payload_hash = payload_hash or hashlib.sha256(b"").hexdigest()
        headers = signed_headers(method, key, payload_hash, credential, extra, query)
        if self.native_transport and method in {"HEAD", "PUT"}:
            return curl_request(method, key, headers, body, query)
        suffix = multipart_query(query)
        request = urllib.request.Request(ENDPOINT + "/" + BUCKET + "/" + key + ("?" + suffix if suffix else ""), data=body, method=method,
            headers=headers)
        return self.opener.open(request, timeout=600 if method == "PUT" else 25)

    def multipart(self, stream, key, credential, metadata):
        """Resume only parts of the current checksum-pinned plan; never list/delete."""
        parent = self.root / ".internal/evidence/game-publishing" / self.plan["target"]
        path = parent / "multipart.json"
        identity = {"plan": self.plan, "partBytes": PART_BYTES}

        def save(state):
            fd, temporary = tempfile.mkstemp(dir=parent, prefix=".multipart-")
            try:
                with os.fdopen(fd, "w") as receipt:
                    json.dump(state, receipt)
                os.replace(temporary, path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)

        def xml_post(query, content=b"", extra=None):
            headers = {"content-length": str(len(content)), **(extra or {})}
            with self.request("POST", key, credential, content, hashlib.sha256(content).hexdigest(), headers, query) as response:
                raw = response.read(65537)
            if len(raw) > 65536:
                raise ValueError("Oversized multipart response")
            return ET.fromstring(raw)

        self.stage = "multipart-init"
        if path.exists():
            plan_module.owned_file(path, parent)
            if path.stat().st_mode & 0o077 or path.stat().st_size > 1024 * 1024:
                raise ValueError("Invalid multipart receipt")
            state = json.loads(path.read_text())
            if set(state) != {"plan", "partBytes", "uploadId", "parts"} or any(state[k] != v for k, v in identity.items()) or not isinstance(state["parts"], list):
                raise ValueError("Multipart receipt differs from the game plan")
            multipart_query({"uploadId": state["uploadId"]})
        else:
            root = xml_post({"uploads": ""}, extra={**metadata, "if-none-match": "*"})
            if root.tag.rsplit("}", 1)[-1] != "InitiateMultipartUploadResult":
                raise ValueError("Multipart creation refused")
            upload_id = next((item.text for item in root if item.tag.rsplit("}", 1)[-1] == "UploadId"), "")
            multipart_query({"uploadId": upload_id})
            state = {**identity, "uploadId": upload_id, "parts": []}
            save(state)
        digest, total, count, start = hashlib.sha256(), 0, 0, time.monotonic()
        for number, block in enumerate(iter(lambda: stream.read(PART_BYTES), b""), 1):
            count = number
            digest.update(block)
            total += len(block)
            part_hash = hashlib.sha256(block).hexdigest()
            if number <= len(state["parts"]):
                part = state["parts"][number - 1]
                if set(part) != {"number", "sha256", "bytes", "etag"} or part["number"] != number or part["sha256"] != part_hash or part["bytes"] != len(block) or not re.fullmatch(r'"[a-fA-F0-9]{32}"', part["etag"]):
                    raise ValueError("Multipart progress differs from the source")
                continue
            if time.monotonic() - start > 390:
                raise TimeoutError("Multipart progress preserved for another session")
            self.stage = "multipart-part"
            with tempfile.TemporaryFile() as body:
                body.write(block)
                body.seek(0)
                md5 = hashlib.md5(block, usedforsecurity=False).digest()
                headers = {"content-type": "application/octet-stream", "content-length": str(len(block)), "content-md5": base64.b64encode(md5).decode()}
                with self.request("PUT", key, credential, body, part_hash, headers, {"partNumber": str(number), "uploadId": state["uploadId"]}) as response:
                    etag = response.headers.get("ETag", "")
            if etag.lower() != '"' + md5.hex() + '"':
                raise ValueError("Multipart checksum differs from source")
            state["parts"].append({"number": number, "sha256": part_hash, "bytes": len(block), "etag": etag})
            save(state)
        if total != self.plan["bytes"] or digest.hexdigest() != self.plan["sha256"] or count != len(state["parts"]):
            raise ValueError("Source changed during multipart upload")
        root = ET.Element("CompleteMultipartUpload")
        for part in state["parts"]:
            item = ET.SubElement(root, "Part")
            ET.SubElement(item, "PartNumber").text = str(part["number"])
            ET.SubElement(item, "ETag").text = part["etag"]
        self.stage = "multipart-completion"
        try:
            result = xml_post({"uploadId": state["uploadId"]}, ET.tostring(root), {"content-type": "application/xml", "if-none-match": "*"})
            if result.tag.rsplit("}", 1)[-1] != "CompleteMultipartUploadResult":
                raise ValueError("Multipart completion refused")
        except urllib.error.HTTPError as error:
            if error.code != 412:
                raise
        # Keep the receipt until full public verification succeeds.
        return path

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
        receipt = None
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
                    if plan["bytes"] > PART_BYTES:
                        receipt = self.multipart(stream, key, credential, {"content-type": "application/zip", "cache-control": CACHE, "x-amz-meta-sha256": plan["sha256"]})
                        uploaded = True
                    else:
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
        if receipt is not None:
            receipt.unlink()
        return {"ok": True, "state": "complete", "target": plan["target"], "key": key, "uploaded": uploaded, "bytes": plan["bytes"], "sha256": plan["sha256"]}

    def worker(self, credential):
        try:
            result = self.publish(credential)
        except Exception as error:
            kind = "http" if isinstance(error, urllib.error.HTTPError) else "connection" if isinstance(error, (OSError, urllib.error.URLError)) else "input" if isinstance(error, ValueError) else "internal"
            result = {"ok": False, "state": "failed", "error": "Game upload or verification failed", "stage": self.stage, "kind": kind}
            if isinstance(error, urllib.error.HTTPError):
                result["status"] = error.code
            if isinstance(error, TransferError):
                result.update(curlCode=error.code, uploadedBytes=error.uploaded)
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
