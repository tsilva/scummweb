"""Opt-in project-scoped reader. Ordinary launches never retrieve source keys."""

import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PREFIX = Path.home() / ".config/infisical"
PROFILE = PREFIX / "sentry-readers/scummweb.json"
PROJECT = "e1c358f8-0678-45d7-a2a8-270c2f29aadd"
VAULT_PROJECT = "5078c850-3f93-46d8-8afe-82107df8b931"
FILES = {
    ".infisical.json",
    "scripts/list_sentry_issues.mjs",
    "scripts/infisical/sentry_vault.py",
    "scripts/infisical/sentry_session.mjs",
    "scripts/infisical/sentry_client.mjs",
    "scripts/infisical/sentry.sb",
}
EXPECTED = {
    "version": 1,
    "repository": "scummweb",
    "repo_path": str(ROOT),
    "project_id": PROJECT,
    "environment": "dev",
    "secret_path": "/",
    "source_secret_name": "SENTRY_AUTH_TOKEN",
    "bundle": "local-scummweb-sentry-read",
    "node": str(PREFIX / "runtimes/node-v24.22.1-darwin-arm64/bin/node"),
    "infisical": str(PREFIX / "cli/0.45.6/infisical"),
    "ca_file": str(PREFIX / "agent-vault-ca.pem"),
    "ca_fingerprint": (
        "SHA256:37:B2:E0:81:45:EC:C0:58:46:2E:D1:2F:E1:2B:E6:AE:"
        "2B:78:B1:B3:F0:21:CD:8F:EC:54:CC:30:2D:36:9E:37"
    ),
}


def checksum(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def profile():
    info = PROFILE.lstat()
    if (
        not stat.S_ISREG(info.st_mode)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o077
    ):
        raise ValueError("Expected protected profile")
    data = json.loads(PROFILE.read_text())
    if (
        set(data) != set(EXPECTED) | {"code_sha256", "runtime_sha256"}
        or type(data["version"]) is not int
        or any(data[key] != value for key, value in EXPECTED.items())
    ):
        raise ValueError("Unreviewed Sentry binding")
    if (ROOT / ".infisical.yaml").exists() or json.loads(
        (ROOT / ".infisical.json").read_text()
    ) != {
        "workspaceId": PROJECT,
        "domain": "https://app.infisical.com",
    }:
        raise ValueError("Native source identity changed")
    if set(data["code_sha256"]) != FILES:
        raise ValueError("Incomplete source pins")
    for name, digest in data["code_sha256"].items():
        path = ROOT / name
        if path.is_symlink() or checksum(path) != digest:
            raise ValueError("Source changed; trusted review required")
    if set(data["runtime_sha256"]) != {"node", "infisical", "ca_file"}:
        raise ValueError("Incomplete runtime pins")
    for name, digest in data["runtime_sha256"].items():
        if checksum(Path(data[name])) != digest:
            raise ValueError("Runtime changed; trusted review required")
    return data


def sandbox(data):
    definitions = {
        "USER_HOME": str(Path.home()),
        "REPO_ROOT": str(ROOT),
        "NODE_BIN": data["node"],
        "NODE_ROOT": str(Path(data["node"]).parent.parent),
        "CA_FILE": data["ca_file"],
    }
    result = ["/usr/bin/sandbox-exec"]
    for key, value in definitions.items():
        result += ["-D", f"{key}={value}"]
    return result + ["-f", str(ROOT / "scripts/infisical/sentry.sb")]


def command(data, arguments):
    return [
        data["infisical"],
        "agent-vault",
        "run",
        "--domain=https://app.infisical.com",
        "--project-id=" + VAULT_PROJECT,
        "--access-bundle=" + data["bundle"],
        "--proxy=127.0.0.1:8283",
        "--ca-fingerprint=" + data["ca_fingerprint"],
        "--ttl=10m",
        "--no-ca-trust",
        "--no-skills",
        "--silent",
        "--telemetry=false",
        "--",
        "/usr/bin/env",
        "SENTRY_VAULT_TRANSPORT=agent-vault",
        "SENTRY_AUTH_TOKEN=sentry_read_public_placeholder",
        "SENTRY_ORG=tsilva",
        "SENTRY_PROJECT=scummweb",
        "SENTRY_BASE_URL=https://sentry.io",
        "NODE_USE_ENV_PROXY=1",
        "NO_PROXY=",
        "no_proxy=",
        "NODE_EXTRA_CA_CERTS=" + data["ca_file"],
        *sandbox(data),
        data["node"],
        "--use-env-proxy",
        str(ROOT / "scripts/infisical/sentry_client.mjs"),
        *arguments,
    ]


def main(arguments):
    if (
        not arguments
        or arguments[0] not in {"check", "issues"}
        or (arguments[0] == "check" and len(arguments) != 1)
        or any(arg.split("=", 1)[0] == "--env-file" for arg in arguments)
    ):
        raise ValueError("Use check or issues with the existing reader flags")
    data = profile()
    result = subprocess.run(
        command(data, arguments),
        cwd=ROOT,
        env={"HOME": str(Path.home()), "PATH": "/usr/bin:/bin"},
        capture_output=True,
        text=True,
        timeout=65,
    )
    if arguments[0] == "check":
        rows = [
            json.loads(line)
            for line in result.stdout.splitlines()
            if line.startswith('{"ok":')
        ]
        if len(rows) != 1:
            raise ValueError("No sanitized metadata result")
        print(json.dumps(rows[0]))
    else:
        print(result.stdout, end="")
        if result.returncode:
            print(
                "Sentry reader failed; provider diagnostics withheld", file=sys.stderr
            )
    return result.returncode


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception:  # noqa: BLE001 -- credentials and provider bodies must stay private
        print(
            json.dumps(
                {
                    "ok": False,
                    "reason": "Sentry Vault binding, login or read access unavailable",
                }
            )
        )
        sys.exit(1)
