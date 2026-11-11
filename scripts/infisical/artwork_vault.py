"""Opt-in sandboxed artwork batches; no ordinary source-secret retrieval."""

import hashlib
import importlib.util
import json
import os
import re
import selectors
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = Path.home() / ".config/infisical"
BASE = PREFIX / "artwork-relay/scummweb"
PROJECT = "e1c358f8-0678-45d7-a2a8-270c2f29aadd"
FILES = {
    ".infisical.json",
    "scripts/upload_artwork_to_r2.py",
    "scripts/infisical/artwork_relay.py",
    "scripts/infisical/artwork_client.py",
    "scripts/infisical/artwork_batch.sb",
    "scripts/infisical/artwork_vault.py",
}
PYTHON = (
    Path.home()
    / ".local/share/uv/python/cpython-3.11-macos-aarch64-none/bin/python3.11"
).resolve()
EXPECTED = {
    "version": 1,
    "repository": "scummweb",
    "repo_path": str(ROOT),
    "project_id": PROJECT,
    "environment": "dev",
    "secret_path": "/",
    "source_names": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"],
    "bundle": "local-scummweb-artwork-batch",
    "python": str(PYTHON),
    "infisical": str(PREFIX / "cli/0.44.13/infisical"),
    "ca_fingerprint": "SHA256:37:B2:E0:81:45:EC:C0:58:46:2E:D1:2F:E1:2B:E6:AE:2B:78:B1:B3:F0:21:CD:8F:EC:54:CC:30:2D:36:9E:37",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def protected(path, directory=False):
    info = path.lstat()
    if (
        (
            not stat.S_ISDIR(info.st_mode)
            if directory
            else not stat.S_ISREG(info.st_mode)
        )
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise ValueError("Expected protected regular path")


def load():
    protected(BASE, True)
    for name in ["profile.json", "policy.json", "relay.py"]:
        protected(BASE / name)
    p = json.loads((BASE / "profile.json").read_text())
    if (
        set(p)
        != set(EXPECTED)
        | {"code_sha256", "runtime_sha256", "policy_sha256", "relay_sha256"}
        or type(p["version"]) is not int
        or any(p[k] != v for k, v in EXPECTED.items())
    ):
        raise ValueError("Unreviewed artwork binding")
    if (ROOT / ".infisical.yaml").exists() or json.loads(
        (ROOT / ".infisical.json").read_text()
    ) != {"workspaceId": PROJECT, "domain": "https://app.infisical.com"}:
        raise ValueError("Native binding changed")
    if set(p["code_sha256"]) != FILES or set(p["runtime_sha256"]) != {
        "python",
        "infisical",
    }:
        raise ValueError("Incomplete source or runtime pins")
    for name, value in p["code_sha256"].items():
        path = ROOT / name
        if path.is_symlink() or digest(path) != value:
            raise ValueError("Source changed; trusted review required")
    for name, value in p["runtime_sha256"].items():
        if digest(Path(p[name])) != value:
            raise ValueError("Runtime changed; trusted review required")
    if (
        digest(BASE / "policy.json") != p["policy_sha256"]
        or digest(BASE / "relay.py") != p["relay_sha256"]
    ):
        raise ValueError("Trusted policy changed")
    policy = json.loads((BASE / "policy.json").read_text())
    if (
        set(policy) != {"version", "listen_port", "credential_sha256", "check_object"}
        or type(policy["version"]) is not int
        or policy["version"] != 1
        or type(policy["listen_port"]) is not int
        or not 1024 <= policy["listen_port"] <= 65535
        or not re.fullmatch(r"[a-f0-9]{64}", policy["credential_sha256"])
    ):
        raise ValueError("Invalid relay policy")
    return p, policy


def module():
    spec = importlib.util.spec_from_file_location(
        "artwork_relay", ROOT / "scripts/infisical/artwork_relay.py"
    )
    relay = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(relay)
    return relay


def plan(workspace):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", workspace):
        raise ValueError("Invalid workspace")
    directory = ROOT / ".internal/evidence" / workspace
    manifest = directory / "manifest.json"
    # Reject source aliases before granting the sandbox this private object directory.
    for path in [
        ROOT / ".internal",
        ROOT / ".internal/evidence",
        directory,
        directory / "objects",
        manifest,
    ]:
        if path.is_symlink():
            raise ValueError("Workspace links are not allowed")
    if manifest.stat().st_size > 4 * 1024 * 1024:
        raise ValueError("Oversized plan")
    value = json.loads(manifest.read_text())
    if value.get("baseHash") != digest(ROOT / "data/artwork-storage.json"):
        raise ValueError("Artwork plan is stale")
    entries = module().entries(value)
    for entry in entries.values():
        source = directory / "objects" / entry["key"]
        if any(
            path.is_symlink() for path in [source, source.parent, source.parent.parent]
        ):
            raise ValueError("Object links are not allowed")
        if source.exists() and (
            source.stat().st_size != entry["bytes"] or digest(source) != entry["sha256"]
        ):
            raise ValueError("Artwork bytes changed")
    return value, manifest, directory / "objects"


def sandbox(p, manifest, objects, client=None):
    fields = {
        "USER_HOME": str(Path.home()),
        "PYTHON": p["python"],
        "PYTHON_ROOT": str(Path(p["python"]).parent.parent),
        "CLIENT": str(client or ROOT / "scripts/infisical/artwork_client.py"),
        "ADAPTER": str(ROOT / "scripts/infisical/artwork_client.py"),
        "PUBLISHER": str(ROOT / "scripts/upload_artwork_to_r2.py"),
        "MANIFEST": str(manifest),
        "OBJECT_ROOT": str(objects),
    }
    command = ["/usr/bin/sandbox-exec"]
    for k, v in fields.items():
        command += ["-D", f"{k}={v}"]
    return command + ["-f", str(ROOT / "scripts/infisical/artwork_batch.sb")]


def command(p, port, mode, workspace, manifest, objects, client=None):
    args = [
        p["infisical"],
        "agent-vault",
        "run",
        "--domain=https://app.infisical.com",
        "--access-bundle=" + p["bundle"],
        "--proxy=127.0.0.1:8283",
        "--ca-fingerprint=" + p["ca_fingerprint"],
        "--ttl=10m",
        "--no-ca-trust",
        "--no-skills",
        "--silent",
        "--telemetry=false",
        "--",
        "/usr/bin/env",
        "NO_PROXY=",
        "no_proxy=",
        "SCUMMWEB_ARTWORK_PROXY_TOKEN=scummweb_artwork_proxy_placeholder",
        "SCUMMWEB_ARTWORK_WORKSPACE=" + workspace,
        *sandbox(p, manifest, objects, client),
        p["python"],
        "-I",
        "-S",
        "-B",
        str(client or ROOT / "scripts/infisical/artwork_client.py"),
        mode,
        f"http://127.0.0.1:{port}",
    ]
    if mode == "publish":
        args += [str(manifest)]
    return args


def main(args):
    if (
        not args
        or args[0] not in {"check", "publish"}
        or len(args) != (1 if args[0] == "check" else 2)
    ):
        raise ValueError("Use check or publish WORKSPACE")
    p, policy = load()
    workspace = args[1] if len(args) == 2 else "no-artwork-read"
    value, manifest, objects = (
        plan(workspace)
        if args[0] == "publish"
        else (None, ROOT / ".vault-no-manifest", ROOT / ".vault-no-objects")
    )
    env = {"HOME": str(Path.home()), "PATH": "/usr/bin:/bin"}
    relay = subprocess.Popen(
        [
            p["python"],
            "-I",
            "-S",
            "-B",
            str(BASE / "relay.py"),
            str(BASE / "policy.json"),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=env,
        cwd="/",
        text=True,
    )
    try:
        relay.stdin.write(json.dumps(value))
        relay.stdin.close()
        with selectors.DefaultSelector() as reader:
            reader.register(relay.stdout, selectors.EVENT_READ)
            if not reader.select(8):
                raise ValueError("Relay did not become ready")
        if json.loads(relay.stdout.readline()) != {
            "ready": True,
            "port": policy["listen_port"],
        }:
            raise ValueError("Relay binding unavailable")
        result = subprocess.run(
            command(p, policy["listen_port"], args[0], workspace, manifest, objects),
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=570,
        )
        rows = [
            json.loads(line)
            for line in result.stdout.splitlines()
            if line.startswith('{"ok":')
        ]
        if (
            relay.poll() is not None
            or result.returncode
            or len(rows) != 1
            or rows[0].get("ok") is not True
        ):
            raise ValueError("Sandboxed artwork operation failed")
        print(json.dumps(rows[0]))
    finally:
        if relay.poll() is None:
            relay.terminate()
        relay.wait(timeout=5)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except Exception:  # noqa: BLE001 -- never emit credentials or captured provider output
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Artwork Vault binding, login or operation unavailable",
                }
            )
        )
        sys.exit(1)
