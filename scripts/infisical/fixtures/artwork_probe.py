"""Synthetic native-proxy integration probe; no real R2 request is made."""

import base64
import importlib.util
import json
import socket
import sys
import urllib.error
import urllib.request
from pathlib import Path

source = Path(__file__).resolve().parents[1] / "artwork_client.py"
spec = importlib.util.spec_from_file_location("adapter", source)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
publisher = adapter.publisher_module()
client = adapter.Client(sys.argv[2], publisher)
manifest = json.loads(Path(sys.argv[3]).read_text())
entry = next(iter(manifest["files"].values()))


def rejected(path, data, method="POST", status=403):
    try:
        request = urllib.request.Request(
            client.base + path,
            data=json.dumps(data).encode(),
            method=method,
            headers={"X-Scummweb-R2-Credential": adapter.PLACEHOLDER},
        )
        with client.opener.open(request, timeout=10):
            raise AssertionError("Request unexpectedly accepted")
    except urllib.error.HTTPError as error:
        assert error.code == status


assert client.call("check", {})["read_only"]
for path in [
    "/artwork/get-sibling",
    "/artwork/../artwork/get",
    "/artwork/%2e%2e/artwork/get",
    "/artwork/get?extra=1",
]:
    rejected(path, {"key": entry["key"]})
for method in ["GET", "PUT", "DELETE"]:
    rejected("/artwork/get", {"key": entry["key"]}, method)
rejected("/artwork/get", {"key": "other/secret"})
rejected("/artwork/put", {"key": entry["key"], "body": "Y2hhbmdlZA=="}, status=502)
with client.opener.open(
    urllib.request.Request(
        client.base + "/artwork/get",
        data=json.dumps({"key": entry["key"]}).encode(),
        headers={"X-Scummweb-R2-Credential": "attacker-value"},
    )
) as response:
    assert json.load(response)["missing"]  # the proxy overwrites the caller's header
result = publisher.publish(client, manifest)
assert result == {"uploaded": 2, "verified": 2}
assert publisher.publish(client, manifest) == {"uploaded": 0, "verified": 2}
data = (
    publisher.ROOT / publisher.artwork_workspace() / "objects" / entry["key"]
).read_bytes()
rejected(
    "/artwork/put",
    {"key": entry["key"], "body": base64.b64encode(data).decode()},
    status=502,
)
try:
    socket.create_connection(
        ("127.0.0.1", int(client.base.rsplit(":", 1)[1])), timeout=2
    )
    raise AssertionError("Direct network bypass allowed")
except PermissionError:
    pass
try:
    (Path.home() / ".config/infisical/proxy-tools.json").read_bytes()
    raise AssertionError("Private file access allowed")
except PermissionError:
    pass
try:
    with client.opener.open("http://example.com/unrelated", timeout=8):
        raise AssertionError("Unrelated host allowed")
except urllib.error.HTTPError as error:
    assert error.code == 403
print(
    json.dumps(
        {
            "ok": True,
            "actual_publisher": True,
            "fake_uploads": 2,
            "readback_and_idempotency": True,
            "overwrite_blocked": True,
            "plan_and_path_guards": True,
            "header_replaced": True,
            "direct_network_and_private_files_blocked": True,
            "raw_keys_in_child": False,
        }
    )
)
