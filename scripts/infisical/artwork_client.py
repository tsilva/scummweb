"""Sandbox-side adapter for the existing batch artwork publisher."""

import base64
import importlib.util
import io
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

PLACEHOLDER = "scummweb_artwork_proxy_placeholder"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        raise ValueError("Redirect refused")


class Client:
    def __init__(self, base, publisher):
        if os.environ.get("SCUMMWEB_ARTWORK_PROXY_TOKEN") != PLACEHOLDER or any(
            name in os.environ
            for name in (
                "AWS_ACCESS_KEY_ID",
                "AWS_SECRET_ACCESS_KEY",
                "AWS_SESSION_TOKEN",
            )
        ):
            raise ValueError("Expected placeholder-only artwork client")
        proxy = os.environ.get("HTTP_PROXY")
        if (
            not proxy
            or urllib.parse.urlsplit(proxy).netloc.rsplit("@", 1)[-1]
            != "127.0.0.1:8283"
        ):
            raise ValueError("Expected native Vault proxy")
        target = urllib.parse.urlsplit(base)
        if (
            target.scheme != "http"
            or target.hostname != "127.0.0.1"
            or not target.port
            or target.path
            or target.query
            or target.fragment
            or target.username
        ):
            raise ValueError("Unexpected artwork relay")
        self.base, self.publisher = base, publisher
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy}), NoRedirect()
        )

    def call(self, operation, value):
        request = urllib.request.Request(
            self.base + "/artwork/" + operation,
            data=json.dumps(value).encode(),
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Scummweb-R2-Credential": PLACEHOLDER,
            },
        )
        with self.opener.open(request, timeout=35) as response:
            raw = response.read(3 * 1024 * 1024 + 1)
        if len(raw) > 3 * 1024 * 1024:
            raise ValueError("Oversized artwork response")
        result = json.loads(raw)
        if result.get("ok") is not True:
            raise ValueError("Artwork relay refused request")
        return result

    def get_object(self, *, Bucket, Key):
        if Bucket != "scummvm-games":
            raise ValueError("Unexpected bucket")
        result = self.call("get", {"key": Key})
        if result.get("missing") is True:
            raise self.publisher.ArtworkObjectMissing()
        return {
            "Body": io.BytesIO(base64.b64decode(result["body"], validate=True)),
            "ContentType": result["contentType"],
            "CacheControl": result["cacheControl"],
        }

    def put_object(self, *, Bucket, Key, Body, ContentType, CacheControl, IfNoneMatch):
        if (
            Bucket != "scummvm-games"
            or CacheControl != self.publisher.CACHE_CONTROL
            or IfNoneMatch != "*"
            or ContentType
            not in {"image/webp", "image/png", "image/avif", "image/jpeg"}
        ):
            raise ValueError("Unexpected upload policy")
        return self.call("put", {"key": Key, "body": base64.b64encode(Body).decode()})


def publisher_module():
    source = Path(__file__).resolve().parents[1] / "upload_artwork_to_r2.py"
    spec = importlib.util.spec_from_file_location("artwork_publisher", source)
    publisher = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(publisher)
    return publisher


def main():
    mode, base = sys.argv[1:3]
    publisher = publisher_module()
    client = Client(base, publisher)
    if mode == "check":
        result = client.call("check", {})
    elif mode == "publish" and len(sys.argv) == 4:
        manifest = json.loads(Path(sys.argv[3]).read_text())
        result = {"ok": True, **publisher.publish(client, manifest)}
    else:
        raise ValueError("Unexpected command")
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 -- provider and proxy diagnostics may contain credentials
        raise SystemExit("Artwork Vault request failed; details withheld") from None
