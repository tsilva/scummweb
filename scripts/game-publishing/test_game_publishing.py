"""Synthetic protocol and actual-client tests; no real credentials or R2 calls."""

import contextlib
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import zipfile
from email.message import Message

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import client
import plan
import relay

FAKE_CREDENTIAL = {"access_key_id": "a" * 32, "secret_access_key": "b" * 64}
RAW = json.dumps(FAKE_CREDENTIAL)
POLICY = {"version": 1, "listen_port": 61788, "credential_sha256": hashlib.sha256(RAW.encode()).hexdigest(), "source": relay.SOURCE, "check_object": {"key": "gob3.zip", "bytes": 1055315}}


class Response(io.BytesIO):
    def __init__(self, body=b"", headers=None):
        super().__init__(body)
        self.headers = Message()
        for key, value in (headers or {}).items():
            self.headers[key] = value


class FakeR2:
    def __init__(self, content):
        self.content, self.requests, self.exists, self.conflict = content, [], False, False

    def open(self, request, timeout):
        self.requests.append(request)
        method = request.get_method()
        if request.full_url.startswith(relay.ORIGIN):
            return Response(self.content, {"Content-Type": "application/zip", "Cache-Control": relay.CACHE})
        if method == "HEAD":
            if not self.exists:
                raise urllib.error.HTTPError(request.full_url, 404, "missing", {}, io.BytesIO())
            return Response(headers={"Content-Length": str(len(self.content)), "Content-Type": "application/zip"})
        if method == "PUT":
            body = request.data.read()
            if body != self.content:
                raise ValueError("Unexpected data")
            self.exists = True
            if self.conflict:
                raise urllib.error.HTTPError(request.full_url, 412, "exists", {}, io.BytesIO())
            return Response()
        raise AssertionError("Unexpected provider operation")


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="scummweb-game-publishing-")
        self.root = Path(self.temporary.name).resolve()
        (self.root / "data").mkdir()
        (self.root / "downloads").mkdir()
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("README.TXT", "Synthetic demo fixture, no third-party game data.")
            archive.writestr("resource.map", "synthetic")
        self.content = data.getvalue()
        self.entry = {"target": "example-demo", "gameId": "example", "engineId": "sci", "title": "Example (Demo)", "archive": "example.zip", "url": "https://downloads.scummvm.org/frs/demos/sci/example.zip", "sha256": hashlib.sha256(self.content).hexdigest(), "preserveArchive": True, "redistributionReview": {"basis": "Synthetic fixture"}}
        self.catalog = self.root / "data/classic-freeware.json"
        self.catalog.write_text(json.dumps({"games": [self.entry]}))
        self.source = self.root / "downloads/example.zip"
        self.source.write_bytes(self.content)
        self.path = plan.prepare(self.root, self.entry["target"])
        self.value = plan.load(self.root, self.path)
        self.r2 = FakeR2(self.content)
        self.bridge = relay.Bridge(POLICY, self.value, self.root, self.r2)

    def tearDown(self):
        self.temporary.cleanup()

    def test_plan_is_exact_owned_and_private(self):
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(plan.validate(self.root, self.value), self.source)
        self.assertEqual(plan.prepare(self.root, "example-demo"), self.path)

    def test_catalog_drift_rejected_before_provider_access(self):
        self.catalog.write_text(self.catalog.read_text() + " ")
        with self.assertRaises(ValueError):
            self.bridge.publish(FAKE_CREDENTIAL)
        self.assertEqual(self.r2.requests, [])

    def test_corrupt_source_rejected_before_provider_access(self):
        self.source.write_bytes(b"x" * len(self.content))
        with self.assertRaises(ValueError):
            self.bridge.publish(FAKE_CREDENTIAL)
        self.assertEqual(self.r2.requests, [])

    def test_linked_source_rejected(self):
        other = self.root / "other.zip"
        self.source.rename(other)
        self.source.symlink_to(other)
        with self.assertRaises(ValueError):
            plan.validate(self.root, self.value)

    def test_hard_linked_source_rejected(self):
        os.link(self.source, self.root / "other.zip")
        with self.assertRaises(ValueError):
            plan.validate(self.root, self.value)

    def test_foreign_source_and_non_demo_catalog_rejected(self):
        for field, value in [("url", "https://example.org/example.zip"), ("preserveArchive", False), ("title", "Full game"), ("gameId", "../artwork/key"), ("archive", "../example.zip")]:
            with self.subTest(field=field):
                entry = {**self.entry, field: value}
                self.catalog.write_text(json.dumps({"games": [entry]}))
                with self.assertRaises(ValueError):
                    plan.prepare(self.root, "example-demo")

    def test_existing_plan_not_replaced(self):
        self.path.write_text("{}")
        with self.assertRaises(ValueError):
            plan.prepare(self.root, "example-demo")
        self.assertEqual(self.path.read_text(), "{}")

    def test_conditional_streamed_upload_and_public_body_verification(self):
        result = self.bridge.publish(FAKE_CREDENTIAL)
        self.assertTrue(result["uploaded"])
        self.assertEqual(result["sha256"], self.value["sha256"])
        self.assertEqual([r.get_method() for r in self.r2.requests], ["HEAD", "PUT", "GET"])
        put = self.r2.requests[1]
        self.assertFalse(isinstance(put.data, bytes), "game body is streamed")
        headers = {key.lower(): value for key, value in put.header_items()}
        self.assertEqual(headers["if-none-match"], "*")
        self.assertEqual(headers["content-length"], str(len(self.content)))
        self.assertEqual(headers["x-amz-content-sha256"], self.value["sha256"])
        self.assertIn("content-md5", headers["authorization"])
        self.assertIn("if-none-match", headers["authorization"])

    def test_existing_exact_object_verified_without_put(self):
        self.r2.exists = True
        self.assertFalse(self.bridge.publish(FAKE_CREDENTIAL)["uploaded"])
        self.assertEqual([r.get_method() for r in self.r2.requests], ["HEAD", "GET"])

    def test_existing_different_object_rejected_without_put(self):
        self.r2.exists, self.r2.content = True, b"wrong"
        with self.assertRaises(ValueError):
            self.bridge.publish(FAKE_CREDENTIAL)
        self.assertEqual([r.get_method() for r in self.r2.requests], ["HEAD", "GET"])

    def test_creation_race_verifies_and_never_overwrites(self):
        self.r2.conflict = True
        self.assertFalse(self.bridge.publish(FAKE_CREDENTIAL)["uploaded"])
        self.assertEqual([r.get_method() for r in self.r2.requests], ["HEAD", "PUT", "GET"])

    def test_actual_provider_http_stream_has_fixed_length_and_conditional_create(self):
        received, stored = [], {}
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("synthetic.bin", b"x" * (4 * 1024 * 1024))
        content = data.getvalue()
        self.source.write_bytes(content)
        self.entry["sha256"] = hashlib.sha256(content).hexdigest()
        self.catalog.write_text(json.dumps({"games": [self.entry]}))
        self.path.unlink()
        value = plan.load(self.root, plan.prepare(self.root, "example-demo"))

        class Provider(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"
            def log_message(self, *_args):
                pass

            def do_HEAD(self):
                received.append(("HEAD", self.path))
                self.send_response(404)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_PUT(self):
                self.connection.settimeout(3)
                received.append(("PUT", self.path))
                stored["headers"] = dict(self.headers)
                stored["body"] = self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self):
                received.append(("GET", self.path))
                self.send_response(200)
                self.send_header("Content-Type", "application/zip")
                self.send_header("Cache-Control", relay.CACHE)
                self.send_header("Content-Length", str(len(stored["body"])))
                self.end_headers()
                self.wfile.write(stored["body"])

        provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        thread = threading.Thread(target=provider.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(provider.server_port)
        try:
            with patch.object(relay, "ENDPOINT", base), patch.object(relay, "ORIGIN", base), patch.object(relay, "TRANSFER_PROTOCOL", "=http"):
                result = relay.Bridge(POLICY, value, self.root).publish(FAKE_CREDENTIAL)
            self.assertTrue(result["uploaded"])
            self.assertEqual(stored["body"], content)
            headers = {key.lower(): value for key, value in stored["headers"].items()}
            self.assertEqual(headers["content-length"], str(len(content)))
            self.assertEqual(headers["if-none-match"], "*")
            self.assertNotIn("transfer-encoding", headers)
            self.assertNotIn("expect", headers)
            self.assertEqual(received, [("HEAD", "/scummvm-games/example.zip"), ("PUT", "/scummvm-games/example.zip"), ("GET", "/example.zip")])
        finally:
            provider.shutdown()
            provider.server_close()
            thread.join()

    def test_probe_is_head_only(self):
        self.r2.exists, self.r2.content = True, b"x" * 1055315
        result = self.bridge.call("check", {}, RAW)
        self.assertTrue(result["read_only"])
        self.assertEqual([r.get_method() for r in self.r2.requests], ["HEAD"])
        self.assertTrue(self.r2.requests[0].full_url.endswith("/gob3.zip"))

    def test_credential_and_arbitrary_body_rejected(self):
        for operation, body, secret in [("check", {}, client.PLACEHOLDER), ("publish", {"key": "other.zip"}, RAW), ("delete", {}, RAW)]:
            with self.subTest(operation=operation), self.assertRaises((ValueError, PermissionError)):
                self.bridge.call(operation, body, secret)
        self.assertEqual(self.r2.requests, [])

    def test_probe_cannot_publish_without_plan(self):
        with self.assertRaises(PermissionError):
            relay.Bridge(POLICY, root=self.root, opener=self.r2).call("publish", {}, RAW)

    def test_worker_redacts_provider_errors(self):
        with patch.object(self.bridge, "publish", side_effect=ValueError(RAW)):
            self.bridge.worker(FAKE_CREDENTIAL)
        self.assertNotIn("b" * 64, json.dumps(self.bridge.result))
        self.assertFalse(self.bridge.result["ok"])
        self.assertEqual(self.bridge.result["kind"], "input")

    def test_http_failure_exposes_only_safe_phase_and_status(self):
        self.bridge.stage = "conditional-upload"
        error = urllib.error.HTTPError("https://private.invalid/" + RAW, 403, RAW, {}, io.BytesIO(RAW.encode()))
        with patch.object(self.bridge, "publish", side_effect=error):
            self.bridge.worker(FAKE_CREDENTIAL)
        result = self.bridge.result
        self.assertEqual((result["stage"], result["kind"], result["status"]), ("conditional-upload", "http", 403))
        self.assertNotIn("b" * 64, json.dumps(result))
        environment = {"SCUMMWEB_GAME_PROXY_TOKEN": client.PLACEHOLDER, "HTTP_PROXY": "http://test:fake-session@127.0.0.1:8283"}
        with patch.dict(os.environ, environment, clear=True):
            actual = client.Client(client.RELAY_BASE)
        with patch.object(actual.opener, "open", return_value=contextlib.closing(io.BytesIO(json.dumps(result).encode()))):
            with self.assertRaisesRegex(SystemExit, "conditional-upload \\(http, HTTP 403\\)") as caught:
                actual.call("status")
        self.assertNotIn("b" * 64, str(caught.exception))

    def test_http2_put_keeps_signatures_in_stdin_and_reuses_the_open_source(self):
        headers = relay.signed_headers("PUT", "example.zip", self.entry["sha256"], FAKE_CREDENTIAL,
            {"if-none-match": "*", "content-type": "application/zip", "content-length": str(self.source.stat().st_size)})
        result = relay.subprocess.CompletedProcess([], 0, '200|2|5|"' + "a" * 32 + '"', "")
        with self.source.open("rb") as source, patch.object(relay.subprocess, "run", return_value=result) as run:
            with relay.curl_request("PUT", "example.zip", headers, source):
                pass
            args, options = run.call_args
            self.assertEqual(args[0], [relay.CURL, "--disable", "--config", "-"])
            self.assertEqual(options["pass_fds"], (source.fileno(),))
            self.assertIn('upload-file = "/dev/fd/', options["input"])
            self.assertIn('proto = "=https"', options["input"])
            self.assertIn('header = "Expect:"', options["input"])
            self.assertIn("http2", options["input"])
            self.assertIn("tlsv1.2", options["input"])
            self.assertNotIn("insecure", options["input"])
            self.assertNotIn(headers["authorization"], json.dumps(args))
            self.assertNotIn(headers["authorization"], json.dumps(options["env"]))
            self.assertNotIn("b" * 64, options["input"])

    def test_https_rejects_legacy_http_redirects_and_reflected_diagnostics(self):
        headers = relay.signed_headers("HEAD", "example.zip", hashlib.sha256(b"").hexdigest(), FAKE_CREDENTIAL)
        for stdout in ["200|1|5|application/zip", "200|2|5|" + RAW]:
            result = relay.subprocess.CompletedProcess([], 0, stdout, RAW)
            with patch.object(relay.subprocess, "run", return_value=result):
                with self.assertRaises((ValueError, OSError)) as caught:
                    relay.curl_request("HEAD", "example.zip", headers)
            self.assertNotIn("b" * 64, str(caught.exception))
        result = relay.subprocess.CompletedProcess([], 0, "302|2||", RAW)
        with patch.object(relay.subprocess, "run", return_value=result):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                relay.curl_request("HEAD", "example.zip", headers)
        self.assertEqual(caught.exception.code, 302)
        self.assertNotIn("b" * 64, str(caught.exception))

    def test_failed_put_exposes_only_numeric_transfer_diagnostics(self):
        headers = {"if-none-match": "*", "content-type": "application/zip", "content-length": str(self.source.stat().st_size)}
        failed = relay.subprocess.CompletedProcess([], 56, "000|1.1|5242880|", RAW)
        with self.source.open("rb") as source, patch.object(relay.subprocess, "run", return_value=failed):
            with self.assertRaises(relay.TransferError) as caught:
                relay.curl_request("PUT", "example.zip", headers, source)
        self.assertEqual((caught.exception.code, caught.exception.uploaded), (56, 5242880))
        self.assertNotIn("b" * 64, str(caught.exception))

    def test_multipart_queries_cannot_select_other_operations_or_paths(self):
        for query in [{"uploads": "", "uploadId": "other"}, {"delete": ""},
                      {"uploadId": "x\nheader"}, {"partNumber": "0", "uploadId": "id"},
                      {"partNumber": "1&delete=", "uploadId": "id"}]:
            with self.assertRaises(ValueError):
                relay.multipart_query(query)
        self.assertEqual(relay.multipart_query({"uploadId": "a+b/="}), "uploadId=a%2Bb%2F%3D")

    def test_multipart_receipt_drift_fails_before_any_part_is_sent(self):
        path = self.path.with_name("multipart.json")
        for changed in ["plan", "part"]:
            state = {"plan": dict(self.value), "partBytes": 1, "uploadId": "synthetic-id", "parts": []}
            if changed == "plan":
                state["plan"]["sha256"] = "0" * 64
            else:
                state["parts"] = [{"number": 1, "sha256": "0" * 64, "bytes": 1, "etag": '"' + "a" * 32 + '"'}]
            path.write_text(json.dumps(state))
            path.chmod(0o600)
            with patch.object(relay, "PART_BYTES", 1), self.source.open("rb") as source:
                with self.assertRaises(ValueError):
                    self.bridge.multipart(source, "example.zip", FAKE_CREDENTIAL, {})
            self.assertEqual(self.r2.requests, [])

    def test_actual_curl_multipart_resumes_exact_parts_and_completes_conditionally(self):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("synthetic.bin", b"synthetic data " * 450000)
        content = data.getvalue()
        self.source.write_bytes(content)
        self.entry["sha256"] = hashlib.sha256(content).hexdigest()
        self.catalog.write_text(json.dumps({"games": [self.entry]}))
        self.path.unlink()
        value = plan.load(self.root, plan.prepare(self.root, "example-demo"))
        state = {"parts": {}, "requests": [], "fail": True, "complete": False, "completionError": True}

        class Provider(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args):
                pass

            def reply(self, code, body=b"", headers=None):
                self.send_response(code)
                self.send_header("Content-Length", str(len(body)))
                for key, item in (headers or {}).items():
                    self.send_header(key, item)
                self.end_headers()
                self.wfile.write(body)

            def do_HEAD(self):
                self.reply(404)

            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                state["requests"].append(("POST", self.path, dict(self.headers)))
                if self.path.endswith("?uploads="):
                    self.reply(200, b"<InitiateMultipartUploadResult><UploadId>synthetic-id</UploadId></InitiateMultipartUploadResult>")
                else:
                    state["complete"] = True
                    state["completion"] = body
                    self.reply(200, b"<Error/>" if state["completionError"] else b"<CompleteMultipartUploadResult/>")

            def do_PUT(self):
                query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
                number = int(query["partNumber"][0])
                body = self.rfile.read(int(self.headers["Content-Length"]))
                state["requests"].append(("PUT", number, dict(self.headers)))
                if number == 2 and state["fail"]:
                    state["fail"] = False
                    self.reply(503)
                    return
                state["parts"][number] = body
                etag = '"' + hashlib.md5(body, usedforsecurity=False).hexdigest() + '"'
                self.reply(200, headers={"ETag": etag})

            def do_GET(self):
                self.reply(200, content, {"Content-Type": "application/zip", "Cache-Control": relay.CACHE})

        provider = ThreadingHTTPServer(("127.0.0.1", 0), Provider)
        thread = threading.Thread(target=provider.serve_forever, daemon=True)
        thread.start()
        base = "http://127.0.0.1:" + str(provider.server_port)
        try:
            with patch.object(relay, "ENDPOINT", base), patch.object(relay, "ORIGIN", base), patch.object(relay, "TRANSFER_PROTOCOL", "=http"):
                with self.assertRaises(urllib.error.HTTPError):
                    relay.Bridge(POLICY, value, self.root).publish(FAKE_CREDENTIAL)
                receipt = self.path.with_name("multipart.json")
                self.assertEqual(len(json.loads(receipt.read_text())["parts"]), 1)
                self.assertEqual(receipt.stat().st_mode & 0o777, 0o600)
                self.assertNotIn("b" * 64, receipt.read_text())
                with self.assertRaises(ValueError):
                    relay.Bridge(POLICY, value, self.root).publish(FAKE_CREDENTIAL)
                self.assertEqual(len(json.loads(receipt.read_text())["parts"]), 2)
                state["completionError"] = False
                self.assertTrue(relay.Bridge(POLICY, value, self.root).publish(FAKE_CREDENTIAL)["uploaded"])
                self.assertFalse(receipt.exists())
            self.assertTrue(state["complete"])
            self.assertEqual(b"".join(state["parts"][n] for n in sorted(state["parts"])), content)
            self.assertEqual(sum(item[:2] == ("PUT", 1) for item in state["requests"]), 1)
            for method, _, headers in state["requests"]:
                if method == "POST":
                    self.assertEqual(headers["If-None-Match"], "*")
                else:
                    self.assertIn("content-md5", {name.lower(): value for name, value in headers.items()})
                    self.assertNotIn("transfer-encoding", {name.lower(): value for name, value in headers.items()})
            self.assertIn(b"<PartNumber>2</PartNumber>", state["completion"])
        finally:
            provider.shutdown()
            provider.server_close()
            thread.join()

    def test_policy_rejects_permissions_scope_and_probe_drift(self):
        path = self.root / "policy.json"
        path.write_text(json.dumps(POLICY))
        path.chmod(0o600)
        self.assertEqual(relay.policy_from(path), POLICY)
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            relay.policy_from(path)
        path.chmod(0o600)
        path.write_text(json.dumps({**POLICY, "check_object": {"key": "other.zip", "bytes": 1}}))
        with self.assertRaises(ValueError):
            relay.policy_from(path)

    def test_placeholder_client_uses_real_http_proxy_even_with_no_proxy(self):
        received = []
        bridge = self.bridge
        signer = relay.server(bridge, 0)
        signer_thread = threading.Thread(target=signer.serve_forever, daemon=True)
        signer_thread.start()
        signer_base = "http://127.0.0.1:" + str(signer.server_port)

        class Proxy(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                received.append({"url": self.path, "credential": self.headers.get(relay.HEADER), "proxy_auth": self.headers.get("Proxy-Authorization")})
                request = urllib.request.Request(self.path, data=self.rfile.read(int(self.headers["Content-Length"])), method="POST", headers={"Content-Type": "application/json", relay.HEADER: RAW})
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request) as response:
                    body = response.read()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        proxy = ThreadingHTTPServer(("127.0.0.1", 0), Proxy)
        thread = threading.Thread(target=proxy.serve_forever, daemon=True)
        thread.start()
        address = "127.0.0.1:" + str(proxy.server_port)
        environment = {"SCUMMWEB_GAME_PROXY_TOKEN": client.PLACEHOLDER, "HTTP_PROXY": "http://test:fake-session@" + address, "NO_PROXY": "*"}
        try:
            with patch.dict(os.environ, environment, clear=True), patch.object(client, "PROXY_ADDRESS", address), patch.object(client, "RELAY_BASE", signer_base):
                actual = client.Client(signer_base)
                result = actual.call("publish")
                for _ in range(100):
                    if result.get("state") == "complete":
                        break
                    time.sleep(0.01)
                    result = actual.call("status")
            self.assertEqual(result["state"], "complete")
            self.assertTrue(received)
            self.assertTrue(all(item["credential"] == client.PLACEHOLDER for item in received))
            self.assertTrue(all(item["proxy_auth"].startswith("Basic ") for item in received))
            self.assertFalse(any("b" * 64 in json.dumps(item) for item in received))
        finally:
            proxy.shutdown()
            proxy.server_close()
            signer.shutdown()
            signer.server_close()
            thread.join()
            signer_thread.join()

    def test_client_refuses_real_keys_other_proxy_and_other_relay(self):
        environment = {"SCUMMWEB_GAME_PROXY_TOKEN": client.PLACEHOLDER, "HTTP_PROXY": "http://127.0.0.1:8283"}
        for change, base in [({"AWS_ACCESS_KEY_ID": "a" * 32}, client.RELAY_BASE), ({"HTTP_PROXY": "http://example.org:8283"}, client.RELAY_BASE), ({}, "http://127.0.0.1:61787")]:
            with self.subTest(change=list(change)), patch.dict(os.environ, {**environment, **change}, clear=True), self.assertRaises(ValueError):
                client.Client(base)


if __name__ == "__main__":
    unittest.main()
