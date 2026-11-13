"""Placeholder-only Runbox client; no credentials, ZIP reads or direct R2 access."""

import base64
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

PLACEHOLDER = "scummweb_game_proxy_placeholder"
PROXY_ADDRESS = "127.0.0.1:8283"
RELAY_BASE = "http://127.0.0.1:61788"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        raise ValueError("Redirect refused")


class Client:
    def __init__(self, base):
        if os.environ.get("SCUMMWEB_GAME_PROXY_TOKEN") != PLACEHOLDER or any(name.startswith(("AWS_", "R2_")) for name in os.environ):
            raise ValueError("Expected placeholder-only game client")
        proxy = os.environ.get("HTTP_PROXY", "")
        parsed_proxy = urllib.parse.urlsplit(proxy)
        if parsed_proxy.scheme != "http" or parsed_proxy.netloc.rsplit("@", 1)[-1] != PROXY_ADDRESS or parsed_proxy.path or parsed_proxy.query or parsed_proxy.fragment:
            raise ValueError("Expected native Vault proxy")
        if base != RELAY_BASE:
            raise ValueError("Unexpected game relay")
        self.base = base
        self.proxy = parsed_proxy
        # Explicit proxy routing also covers loopback; NO_PROXY must never send
        # the placeholder directly to the trusted signer.
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())

    def call(self, operation):
        request = urllib.request.Request(self.base + "/games/" + operation, data=b"{}", method="POST",
            headers={"Content-Type": "application/json", "X-Scummweb-R2-Credential": PLACEHOLDER})
        request.set_proxy(PROXY_ADDRESS, "http")
        if self.proxy.username is not None:
            value = urllib.parse.unquote(self.proxy.username) + ":" + urllib.parse.unquote(self.proxy.password or "")
            request.add_header("Proxy-Authorization", "Basic " + base64.b64encode(value.encode()).decode())
        with self.opener.open(request, timeout=35) as response:
            body = response.read(4097)
        if len(body) > 4096:
            raise ValueError("Oversized game response")
        result = json.loads(body)
        if result.get("ok") is not True:
            stage, kind, status = result.get("stage"), result.get("kind"), result.get("status")
            if stage in {"prepared", "source-validation", "existing-object-check", "source-read", "conditional-upload", "public-verification"} and kind in {"http", "connection", "input", "internal"}:
                suffix = f", HTTP {status}" if type(status) is int and 100 <= status <= 599 else ""
                raise SystemExit(f"Game publishing failed at {stage} ({kind}{suffix}); provider details withheld")
            raise ValueError("Game relay refused request")
        return result


def main():
    if len(sys.argv) not in {3, 4}:
        raise ValueError("Expected mode and relay")
    mode, base = sys.argv[1:3]
    client = Client(base)
    if mode == "check" and len(sys.argv) == 3:
        result = client.call("check")
        if result != {"ok": True, "read_only": True, "credential_mode": "public-placeholder"}:
            raise ValueError("Unexpected check result")
    elif mode == "publish" and len(sys.argv) == 4 and re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", sys.argv[3]):
        deadline = time.monotonic() + 540
        result = client.call("publish")
        while result.get("state") == "running" and time.monotonic() < deadline:
            time.sleep(2)
            result = client.call("status")
        if result.get("state") != "complete" or result.get("target") != sys.argv[3]:
            raise ValueError("Game publishing did not complete")
    else:
        raise ValueError("Unexpected game command")
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Game publishing failed; credential and provider details withheld") from None
