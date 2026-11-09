"""Create one R2 artwork object via a short-lived, sandboxed Infisical route."""

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import socket
import subprocess
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOMAIN = "https://app.infisical.com"
PROJECT = "e1c358f8-0678-45d7-a2a8-270c2f29aadd"
ENVIRONMENT = "dev"
BUCKET = "scummvm-games"
ENDPOINT = "https://83e1ce4a70ea388693e8525a772ccefa.r2.cloudflarestorage.com"
ORIGIN = "https://scummvm-games.tsilva.eu"
CACHE_CONTROL = "public, max-age=31536000, immutable"
VAULT_API = "/api/v1/agent-vault/access-bundles"
VAULT_PROXY = "127.0.0.1:8283"
CAPABILITY = "SCUMMWEB_ARTWORK_PROXY_TOKEN"
PLACEHOLDER = "scummweb_artwork_proxy_placeholder"
MAX_BYTES = 2 * 1024 * 1024
FORMATS = {
    "avif": "image/avif",
    "webp": "image/webp",
    "png": "image/png",
    "jpg": "image/jpeg",
}


class SafeError(Exception):
    """A diagnostic that contains no provider response or credentials."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_):
        return None


DIRECT = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def validated_plan(workspace, logical):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", workspace):
        raise SafeError("Invalid artwork workspace.")
    if not re.fullmatch(
        r"/launcher/(?:(?:responsive|optimized)/)?[a-z0-9-]+\.(?:avif|webp|png)|"
        r"/image-assets/sources/road-gameplay\.jpg",
        logical,
    ):
        raise SafeError("Invalid logical artwork path.")
    active = (ROOT / "data/artwork-storage.json").read_bytes()
    directory = ROOT / ".internal/evidence" / workspace
    manifest = json.loads((directory / "manifest.json").read_bytes())
    if manifest.get("baseHash") != sha256(active) or manifest.get("origin") != ORIGIN:
        raise SafeError("Artwork plan is stale or has an unexpected origin.")
    entry = manifest["files"][logical]
    digest = entry["sha256"]
    name = Path(logical).name
    if (
        not re.fullmatch(r"[a-f0-9]{64}", digest)
        or entry["key"] != f"artwork/{digest}/{name}"
        or entry["contentType"] != FORMATS[Path(name).suffix[1:]]
        or type(entry["bytes"]) is not int
        or not 0 < entry["bytes"] <= MAX_BYTES
    ):
        raise SafeError("Unexpected artwork object metadata.")
    filename = directory / "objects" / entry["key"]
    with filename.open("rb") as source:
        data = source.read(MAX_BYTES + 1)
    if len(data) != entry["bytes"] or sha256(data) != digest:
        raise SafeError("Artwork bytes differ from the plan.")
    return entry, filename, data


def infisical(args, env):
    command = [
        "infisical",
        *args,
        "--domain=" + DOMAIN,
        "--silent",
        "--telemetry=false",
    ]
    result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, timeout=50)
    if result.returncode or not result.stdout.strip():
        raise SafeError(
            "Infisical request failed. Check the existing login and ScummWEB project access."
        )
    return result.stdout.decode().strip()


def api(token, method, path, body=None):
    request = urllib.request.Request(
        DOMAIN + path,
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
        data=None if body is None else json.dumps(body).encode(),
    )
    try:
        with DIRECT.open(request, timeout=25) as response:
            return json.load(response) if response.status != 204 else None
    except urllib.error.HTTPError as error:
        raise SafeError(
            f"Infisical {method} {path} returned HTTP {error.code}."
        ) from None


def source_client(env):
    # This function is exclusively for the explicitly invoked trusted signing step.
    # Read only the two existing ScummWEB Development credentials and retain them in memory.
    import boto3
    from botocore.config import Config

    pair = [
        infisical(
            [
                "secrets",
                "get",
                name,
                "--plain",
                "--projectId=" + PROJECT,
                "--env=" + ENVIRONMENT,
                "--path=/",
                "--expand=false",
                "--include-imports=false",
                "--secret-overriding=false",
            ],
            env,
        )
        for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
    ]
    if not all(
        re.fullmatch(rf"[a-f0-9]{{{size}}}", value)
        for size, value in zip((32, 64), pair)
    ):
        raise SafeError(
            "The existing ScummWEB R2 credential pair has an unexpected format."
        )
    return boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        region_name="auto",
        aws_access_key_id=pair[0],
        aws_secret_access_key=pair[1],
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            proxies={},
            connect_timeout=10,
            read_timeout=15,
        ),
    )


def signed_upload(entry, data, env):
    from botocore.exceptions import ClientError

    client = source_client(env)
    active = json.loads((ROOT / "data/artwork-storage.json").read_bytes())
    existing = active["files"][
        "/launcher/optimized/sky-scummweb-generated-2026-11-05-r1-hero.avif"
    ]
    try:
        head = client.head_object(Bucket=BUCKET, Key=existing["key"])
    except ClientError as error:
        status = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        raise SafeError(
            f"Scoped R2 read check failed (HTTP {status}). Check the Infisical credential."
        ) from None
    if (
        head["ContentLength"] != existing["bytes"]
        or head["ContentType"] != existing["contentType"]
        or head.get("CacheControl") != CACHE_CONTROL
    ):
        raise SafeError("Scoped R2 read check returned unexpected object metadata.")
    print("Authenticated R2 HEAD matched the current hero.", flush=True)
    headers = {
        "Content-Type": entry["contentType"],
        "Cache-Control": CACHE_CONTROL,
        "Content-MD5": base64.b64encode(
            hashlib.md5(data, usedforsecurity=False).digest()
        ).decode(),
        "If-None-Match": "*",
    }
    signed = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": entry["key"],
            "ContentType": headers["Content-Type"],
            "CacheControl": headers["Cache-Control"],
            "ContentMD5": headers["Content-MD5"],
            "IfNoneMatch": headers["If-None-Match"],
        },
        ExpiresIn=300,
    )
    del client

    def upload(payload):
        request = urllib.request.Request(
            signed, method="PUT", headers=headers, data=payload
        )
        try:
            with DIRECT.open(request, timeout=30) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    return upload


def relay(token, expected, upload):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def do_PUT(self):
            if self.path != "/publish" or not hmac.compare_digest(
                self.headers.get("Authorization", ""), "Bearer " + token
            ):
                return self.respond(403)
            if self.headers.get_all("Content-Length") != [
                str(len(expected))
            ] or self.headers.get("Transfer-Encoding"):
                return self.respond(400)
            if self.rfile.read(len(expected)) != expected:
                return self.respond(422)
            try:
                status = upload(expected)
            except Exception:
                return self.respond(502)
            self.respond(status if status in {200, 412} else 502, status)

        def respond(self, status, upstream=None):
            payload = json.dumps({"status": status, "upstream": upstream}).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *_):
            pass

    return HTTPServer(("127.0.0.1", 0), Handler)


def run_sandboxed(admin_token, env, filename, data, upload, fake):
    capability = secrets.token_hex(32)
    bundle_name = "scummweb-artwork-" + secrets.token_hex(8)
    vault_home = Path.home() / ".config/infisical"
    cli = vault_home / "cli/0.44.13/infisical"
    settings = json.loads((vault_home / "proxy-tools.json").read_bytes())
    fingerprint = settings["ca_fingerprint"]
    if (
        settings["instance"] != DOMAIN
        or settings["proxy"] != VAULT_PROXY
        or not re.fullmatch(r"SHA256:(?:[0-9A-F]{2}:){31}[0-9A-F]{2}", fingerprint)
    ):
        raise SafeError(
            "The local Agent Vault proxy or CA binding differs from the reviewed route."
        )
    python = Path(sys.executable).resolve()
    framework = python.parent.parent / "Resources/Python.app/Contents/MacOS/Python"
    if framework.is_file():
        python = framework
    bundle_id = None
    with relay(capability, data, upload) as server:
        port = server.server_port
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            bundle = api(admin_token, "POST", VAULT_API, {"name": bundle_name})[
                "accessBundle"
            ]
            bundle_id = bundle["id"]
            api(
                admin_token,
                "POST",
                f"{VAULT_API}/{bundle_id}/services",
                {
                    "type": "http",
                    "name": "scummweb-artwork-upload",
                    "hostPattern": f"127.0.0.1:{port}",
                    "allowedMethods": ["PUT"],
                    "allowedPathPrefixes": ["/publish"],
                    "credential": {"type": "bearer", "value": capability},
                },
            )
            result = subprocess.run(
                [
                    str(cli),
                    "agent-vault",
                    "run",
                    "--domain=" + DOMAIN,
                    "--access-bundle=" + bundle_name,
                    "--proxy=" + VAULT_PROXY,
                    "--ca-fingerprint=" + fingerprint,
                    "--ttl=10m",
                    "--no-ca-trust",
                    "--no-skills",
                    "--silent",
                    "--telemetry=false",
                    "--",
                    "/usr/bin/env",
                    CAPABILITY + "=" + PLACEHOLDER,
                    "NO_PROXY=",
                    "no_proxy=",
                    "/usr/bin/sandbox-exec",
                    "-D",
                    "USER_HOME=" + str(Path.home()),
                    "-D",
                    "SCRIPT=" + str(Path(__file__).resolve()),
                    "-D",
                    "IMAGE=" + str(filename),
                    "-D",
                    "PYTHON=" + str(python),
                    "-f",
                    str(ROOT / "scripts/infisical/artwork_publisher.sb"),
                    str(python),
                    "-I",
                    __file__,
                    "--sandbox-client",
                    str(port),
                    str(filename),
                    sha256(data),
                    "fake" if fake else "publish",
                ],
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
                timeout=110,
            )
            expected = (
                "Fake broker checks passed."
                if fake
                else "Sandboxed R2 upload accepted."
            )
            if result.returncode or expected not in result.stdout.splitlines():
                messages = [
                    line
                    for line in (result.stdout + "\n" + result.stderr).splitlines()
                    if re.fullmatch(
                        r"Sandbox check [a-z-]+ failed(?: \(HTTP \d{3}\))?\.", line
                    )
                ]
                signals = {
                    "sandbox": ("sandbox-exec", "sandbox_apply"),
                    "denied": ("Operation not permitted", "Permission denied"),
                    "python": (
                        "Traceback",
                        "can't open file",
                        "Could not find platform",
                    ),
                    "session": ("mint", "session"),
                    "missing-bundle": ("bundle not found", "access bundle"),
                    "ttl": ("TTL", "ttl"),
                    "unauthorized": ("Unauthorized", "unauthorized", "forbidden"),
                    "CA": ("fingerprint", "certificate"),
                    "connection": ("Connection refused", "timed out"),
                }
                diagnostic = ", ".join(
                    name
                    for name, terms in signals.items()
                    if any(term in result.stderr for term in terms)
                )
                statuses = ", ".join(
                    re.findall(
                        r"(?i)(?:HTTP |status[ =:]+)([1-5][0-9][0-9])", result.stderr
                    )
                )
                detail = (
                    " ".join(messages)
                    or f"Exit {result.returncode}; signals: {diagnostic or 'none'}; HTTP {statuses or 'unavailable'}."
                )
                raise SafeError(
                    "Sandboxed publishing failed. "
                    + (detail or "Provider output withheld.")
                )
            print(expected, flush=True)
        finally:
            server.shutdown()
            worker.join(timeout=5)
            if bundle_id:
                api(admin_token, "DELETE", f"{VAULT_API}/{bundle_id}")


def sandbox_client(port, filename, digest, mode):
    if os.environ.get(CAPABILITY) != PLACEHOLDER or any(
        name in os.environ for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
    ):
        raise SafeError("Sandbox check placeholder failed.")
    proxy = os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    if (
        not proxy
        or urllib.parse.urlsplit(proxy).netloc.rsplit("@", 1)[-1] != VAULT_PROXY
    ):
        raise SafeError("Sandbox check proxy failed.")
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy}), NoRedirect()
    )
    url = f"http://127.0.0.1:{int(port)}/publish"
    data = Path(filename).read_bytes()
    if sha256(data) != digest:
        raise SafeError("Sandbox check digest failed.")

    def send(path, body):
        request = urllib.request.Request(
            url + path,
            data=body,
            method="PUT",
            headers={"Authorization": "Bearer " + PLACEHOLDER},
        )
        try:
            with opener.open(request, timeout=35) as response:
                return response.status
        except urllib.error.HTTPError as error:
            return error.code

    if mode == "fake":
        try:
            with socket.create_connection(("127.0.0.1", int(port)), timeout=2):
                raise SafeError("Sandbox check direct-socket failed.")
        except PermissionError:
            pass
        try:
            (Path.home() / ".config/infisical/proxy-tools.json").read_bytes()
            raise SafeError("Sandbox check private-file failed.")
        except PermissionError:
            pass
        for path, payload, status in [
            ("/../publish", data, 403),
            ("?unexpected=true", data, 403),
            ("", b"\x00" * len(data), 422),
            ("", data + b"\x00", 400),
        ]:
            observed = send(path, payload)
            if observed != status:
                raise SafeError(
                    f"Sandbox check invalid-request failed (HTTP {observed})."
                )
    observed = send("", data)
    if observed not in ({200} if mode == "fake" else {200, 412}):
        raise SafeError(f"Sandbox check upload failed (HTTP {observed}).")
    print(
        "Fake broker checks passed."
        if mode == "fake"
        else "Sandboxed R2 upload accepted."
    )


def verify_public(entry, data):
    request = urllib.request.Request(
        ORIGIN + "/" + entry["key"],
        headers={"User-Agent": "ScummWEB artwork verification/1.0"},
    )
    with DIRECT.open(request, timeout=25) as response:
        if (
            response.read(len(data) + 1) != data
            or response.headers.get("Content-Type") != entry["contentType"]
            or response.headers.get("Cache-Control") != CACHE_CONTROL
        ):
            raise SafeError("Public R2 readback failed the byte or metadata check.")
    print(f"Public R2 readback matched {entry['bytes']} bytes and immutable metadata.")


def main():
    if sys.argv[1:2] == ["--sandbox-client"]:
        sandbox_client(*sys.argv[2:])
        return
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace")
    parser.add_argument("logical_path")
    parser.add_argument(
        "--publish", action="store_true", help="authorize trusted R2 signing and upload"
    )
    args = parser.parse_args()
    if json.loads((ROOT / ".infisical.json").read_bytes()) != {
        "workspaceId": PROJECT,
        "domain": DOMAIN,
    }:
        raise SafeError("Unexpected ScummWEB Infisical project configuration.")
    if any(
        (ROOT / name).exists()
        for name in (".infisical.yaml", ".access.toml", ".access.local.toml")
    ):
        raise SafeError("An unreviewed access configuration is present.")
    entry, filename, data = validated_plan(args.workspace, args.logical_path)
    env = {
        "HOME": str(Path.home()),
        "PATH": "/opt/homebrew/bin:/usr/bin:/bin",
        "LC_ALL": "C",
    }
    admin = infisical(["user", "get", "token", "--plain"], env)
    run_sandboxed(
        admin,
        env,
        filename,
        data,
        lambda payload: 200 if payload == data else 422,
        True,
    )
    if not args.publish:
        return
    upload = signed_upload(entry, data, env)
    run_sandboxed(admin, env, filename, data, upload, False)
    verify_public(entry, data)


if __name__ == "__main__":
    try:
        main()
    except SafeError as error:
        raise SystemExit(str(error)) from None
    except Exception:
        if sys.argv[1:2] == ["--sandbox-client"]:
            raise SystemExit("Sandbox check client-runtime failed.") from None
        raise SystemExit(
            "Artwork route failed. Provider and credential details withheld."
        ) from None
