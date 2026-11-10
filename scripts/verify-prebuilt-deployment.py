"""Check one staged ScummWEB deployment before its production aliases move."""

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


class VerificationError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args):
        return None


def vercel_api(path, *, body=None):
    endpoint = f"{path}?teamId={os.environ['VERCEL_ORG_ID']}"
    command = ["vercel", "api", endpoint, "--non-interactive"]
    if body is not None:
        command.extend(["--method", "PATCH", "--input", "-"])
    result = subprocess.run(command, input=json.dumps(body) if body else None,
                            capture_output=True, text=True, timeout=45)
    if result.returncode:
        operation = "revoke access" if body and "revoke" in body else "create access" if body else "inspect"
        status = re.search(r"\(([45]\d\d)\)", result.stderr)
        code = f" ({status[1]})" if status else ""
        raise VerificationError(f"Vercel could not {operation} for {path}{code}")
    return json.loads(result.stdout)


def fetch(opener, url, path, secret, *, method="GET", byte_range=None, status=200):
    headers = {}
    if byte_range:
        headers["Range"] = byte_range
    query = urllib.parse.urlencode({"x-vercel-protection-bypass": secret})
    request = urllib.request.Request(f"{url}{path}?{query}", headers=headers, method=method)
    try:
        with opener.open(request, timeout=20) as response:
            if response.status != status:
                raise VerificationError(f"Unexpected HTTP status on {path}")
            return response.read(2_000_000), response.headers.get_content_type()
    except urllib.error.HTTPError as error:
        if error.code == status:
            return error.read(2_000_000), error.headers.get_content_type()
        raise VerificationError(f"HTTP {error.code} on {path}") from None


def verify(url, deployment_id):
    match = re.fullmatch(r"https://(scummweb-[a-z0-9-]+-tsilvas-projects\.vercel\.app)", url)
    if not match or not re.fullmatch(r"dpl_[A-Za-z0-9]+", deployment_id):
        raise VerificationError("Invalid staged deployment URL or ID")
    commit = os.environ["GITHUB_SHA"]
    deployment = vercel_api(f"/v13/deployments/{deployment_id}")
    meta = deployment.get("meta", {})
    if (deployment.get("url") != match[1] or deployment.get("projectId") != os.environ["VERCEL_PROJECT_ID"]
            or deployment.get("target") != "production" or deployment.get("readyState") != "READY"
            or deployment.get("alias") != [] or deployment.get("source") != "cli"
            or meta.get("scummwebBuildCommit") != commit
            or meta.get("scummwebBuildRun") != os.environ["GITHUB_RUN_ID"]):
        raise VerificationError("Expected the exact READY prebuilt deployment with no aliases")

    bypass_path = f"/aliases/{deployment_id}/protection-bypass"
    started = time.time_ns() // 1_000_000
    bypass = vercel_api(bypass_path, body={"ttl": 180})["protectionBypass"]
    tokens = [token for token, details in bypass.items() if details.get("scope") == "shareable-link"
              and started - 5000 <= details.get("createdAt", 0) <= started + 45_000
              and started < details.get("expires", 0) <= started + 225_000]
    if len(tokens) != 1:
        raise VerificationError("Could not identify one short-lived deployment access token")
    secret = tokens[0]
    opener = urllib.request.build_opener(NoRedirect())
    try:
        home, _ = fetch(opener, url, "/", secret)
        game, _ = fetch(opener, url, "/beneath-a-steel-sky", secret)
        shell, _ = fetch(opener, url, "/scummvm.html", secret)
        card, content_type = fetch(opener, url, "/beneath-a-steel-sky/social-card.png", secret)
        wasm, _ = fetch(opener, url, "/scummvm.wasm", secret, byte_range="bytes=0-7", status=206)
        smoke, _ = fetch(opener, url, "/api/sentry-smoke", secret, method="POST", status=404)
        if b"ScummWEB" not in home or b"Beneath a Steel Sky" not in game or commit.encode() not in game:
            raise VerificationError("The staged game page is missing its expected content or asset version")
        if (b"ScummWEB" not in shell or content_type != "image/jpeg"
                or not card.startswith(b"\xff\xd8") or wasm != b"\0asm\x01\0\0\0"):
            raise VerificationError("The staged player or social-card response is invalid")
        if json.loads(smoke) != {"ok": False}:
            raise VerificationError("The staged Sentry smoke endpoint did not enforce authentication")
    finally:
        vercel_api(bypass_path, body={"revoke": {"secret": secret, "regenerate": False}})
    print(f"Verified staged ScummWEB deployment {deployment_id}")


if __name__ == "__main__":
    try:
        verify(*sys.argv[1:])
    except VerificationError as error:
        sys.exit(str(error))
    except Exception:
        sys.exit("Staged deployment verification failed without exposing provider data")
