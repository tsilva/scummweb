"""Use the logged-in Infisical CLI without exposing credentials in tool output."""

import hmac
import json
import os
import re
from pathlib import Path
import subprocess
from uuid import UUID

ROOT = Path(__file__).resolve().parents[2]
KEYS = ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "BUCKET_DSN", "OPENROUTER_API_KEY", "SENTRY_AUTH_TOKEN", "SENTRY_SMOKE_TEST_TOKEN")
APPLICATION_KEYS = {"SENTRY_AUTH_TOKEN", "SENTRY_SMOKE_TEST_TOKEN"}
AUTH_KEYS = {"BWS_ACCESS_TOKEN", "INFISICAL_TOKEN", "INFISICAL_CLIENT_SECRET",
             "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET", "INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN"}
PUBLISHER_KEYS = ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")
PUBLISHER_PROJECT = "e1c358f8-0678-45d7-a2a8-270c2f29aadd"
PUBLISHER_TARGET = {
    "SCUMMVM_R2_BUCKET": "scummvm-games",
    "SCUMMVM_R2_ENDPOINT": "https://83e1ce4a70ea388693e8525a772ccefa.r2.cloudflarestorage.com",
}


class SecretError(Exception):
    """Only fixed, credential-free messages cross the CLI boundary."""


def cli_environment():
    # This workflow deliberately uses the human login saved by infisical login.
    return {key: value for key, value in os.environ.items()
            if key not in AUTH_KEYS and key not in KEYS and key != "INFISICAL_PROJECT_ID"}


class Infisical:
    def __init__(self, root=ROOT, *, project=PUBLISHER_PROJECT, domain="https://app.infisical.com"):
        self.root = root
        self.project, self.domain = str(UUID(project)), domain
        if domain != "https://app.infisical.com":
            raise SecretError("The trusted destination is pinned to the US cloud.")

    def command(self, args, value=None):
        command = ["infisical", *args, "--projectId", self.project,
                   "--domain", self.domain, "--env", "dev", "--path", "/",
                   "--silent", "--telemetry=false"]
        try:
            result = subprocess.run(command, cwd=self.root, env=cli_environment(),
                                    input=value, capture_output=True, text=True, timeout=120)
        except Exception:
            raise SecretError("Could not run Infisical. Check installation and login; provider details were suppressed.") from None
        if result.returncode:
            raise SecretError("Infisical request failed. Check login and project access; provider details were suppressed.")
        return result.stdout

    def read(self):
        payload = self.command(["export", "--format", "json", "--expand=false",
                                "--include-imports=false", "--secret-overriding=false"])
        try:
            rows = json.loads(payload)
            if not isinstance(rows, list):
                raise ValueError()
            values = {}
            for row in rows:
                key, value = row["key"], row["value"]
                if (not isinstance(key, str) or not isinstance(value, str)
                        or row["workspace"] != self.project
                        or row["secretPath"] != "/" or row["type"] != "shared"
                        or key in values):
                    raise ValueError()
                values[key] = value
            return values
        except Exception:
            raise SecretError("Unexpected Infisical response or duplicate secrets; raw output suppressed.") from None

    def create_and_verify(self, key, value):
        # CLI reads the exact bytes from stdin. No credential appears in argv or a file.
        # The human-login CLI resolves @/dev/stdin before issuing its request.
        current = self.read()
        if key in current:
            if matches(current[key], value):
                return "already present; verified matching"
            raise SecretError(f"Different existing value for {key}; no update made.")
        self.command(["secrets", "set", f"{key}=@/dev/stdin", "--type", "shared"], value)
        after = self.read()
        if key not in after or not matches(after[key], value):
            raise SecretError(f"Readback did not match for {key}; inspect the destination before retrying.")
        return "copied; verified matching"


def matches(left, right):
    return hmac.compare_digest(left.encode(), right.encode())
