#!/usr/bin/env python3
"""Validate upgrade memory, check official releases, optionally write only the pin."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

SKILL = Path(".codex/skills/scummweb_upgrade-scummvm")
PIN = Path("scripts/scummvm-version.sh")
API = "https://api.github.com/repos/scummvm/scummvm/"
TAG = re.compile(r"v(\d+)\.(\d+)\.(\d+)\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
SDK = re.compile(r"\d+\.\d+\.\d+\Z")
PIN_KEYS = {"SCUMMVM_TAG", "SCUMMVM_COMMIT", "EMSDK_VERSION"}


def version(tag):
    match = TAG.fullmatch(tag) if isinstance(tag, str) else None
    if not match:
        raise ValueError("Expected a numeric stable release tag, such as v2026.4.0")
    return tuple(map(int, match.groups()))


def read_pin(root):
    path = root / PIN
    if path.is_symlink() or not path.is_file():
        raise ValueError("Version pin must be a regular repository file")
    text = path.read_text()
    values = {}
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, raw = line.partition("=")
        parts = shlex.split(raw, comments=True)
        if not separator or key not in PIN_KEYS or key in values or len(parts) != 1 or raw != raw.lstrip():
            raise ValueError("Version pin must contain exactly three literal assignments")
        values[key] = parts[0]
    if set(values) != PIN_KEYS:
        raise ValueError("Incomplete ScummVM version pin")
    version(values["SCUMMVM_TAG"])
    if not SHA.fullmatch(values["SCUMMVM_COMMIT"]) or not SDK.fullmatch(values["EMSDK_VERSION"]):
        raise ValueError("Require a full upstream commit and numeric SDK; aliases are unsupported")
    return text, values


def validate_memory(root):
    ledger = json.loads((root / SKILL / "references/patches.json").read_text())
    if not isinstance(ledger, dict) or type(ledger.get("schema_version")) is not int or ledger["schema_version"] != 1 or not isinstance(ledger.get("adaptations"), list):
        raise ValueError("Invalid patch-memory schema")
    files = {str(p.relative_to(root)) for p in root.glob("patches/scummvm/*.patch")}
    files.update(str(p.relative_to(root)) for p in root.glob("scripts/patch_scummvm_*") if p.suffix in {".py", ".js", ".mjs", ".cjs", ".sh"})
    active, seen = set(), set()
    for entry in ledger["adaptations"]:
        if not isinstance(entry, dict):
            raise ValueError("Patch memory entries must be objects")
        path = entry.get("path")
        if not isinstance(path, str) or path in seen or Path(path).is_absolute() or ".." in Path(path).parts:
            raise ValueError("Patch memory needs unique repository-relative paths")
        seen.add(path)
        for key in ("purpose", "retire_when"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                raise ValueError(f"Missing {key} in patch memory: {path}")
        for key in ("invariants", "verification"):
            if not isinstance(entry.get(key), list) or not entry[key] or not all(isinstance(s, str) and s.strip() for s in entry[key]):
                raise ValueError(f"Missing {key} in patch memory: {path}")
        if entry.get("status") == "retired":
            if (root / path).exists() or (root / path).is_symlink() or not isinstance(entry.get("retired_in"), str) or not entry["retired_in"].strip():
                raise ValueError(f"Retired patch needs upstream evidence and no active file: {path}")
            continue
        if entry.get("status") != "active" or path not in files:
            raise ValueError(f"Active patch memory has no matching adaptation: {path}")
        file = root / path
        if file.is_symlink() or not file.is_file():
            raise ValueError(f"Adaptation must be a regular file: {path}")
        digest = hashlib.sha256(file.read_bytes()).hexdigest()
        if entry.get("sha256") != digest:
            raise ValueError(f"Review patch memory for {path}; actual SHA-256 is {digest}")
        active.add(path)
    if files != active:
        raise ValueError("Undocumented ScummVM adaptations: " + ", ".join(sorted(files - active)))
    native = sum(p.endswith(".patch") for p in active)
    return {"native_patches": native, "generated_adapters": len(active) - native}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url):
    # All URLs are constructed from fixed official origins and validated pins.
    request = urllib.request.Request(url, headers={"User-Agent": "scummweb-upgrade-check", "Accept": "application/vnd.github+json"})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=20) as response:
        body = response.read(1024 * 1024 + 1)
    if len(body) > 1024 * 1024:
        raise ValueError("Upstream metadata exceeded the size limit")
    return body.decode("utf-8")


def get_json(path):
    return json.loads(fetch(API + path))


def resolve_tag(tag, get=get_json):
    version(tag)
    data = get("git/ref/tags/" + tag)
    obj = data.get("object", {})
    seen = set()
    for _ in range(5):
        sha, kind = obj.get("sha"), obj.get("type")
        if not isinstance(sha, str) or not SHA.fullmatch(sha) or sha in seen:
            raise ValueError("Invalid or cyclic upstream tag object")
        seen.add(sha)
        if kind == "commit":
            return sha
        if kind != "tag":
            break
        obj = get("git/tags/" + sha).get("object", {})
    raise ValueError("Could not peel the release tag to an upstream commit")


def release_check(pin, get=get_json, text=fetch):
    release = get("releases/latest")
    if release.get("draft") is not False or release.get("prerelease") is not False:
        raise ValueError("Latest release is not a published stable release")
    tag = release.get("tag_name")
    latest_version = version(tag)
    sha = resolve_tag(tag, get)
    current_sha = sha if tag == pin["SCUMMVM_TAG"] else resolve_tag(pin["SCUMMVM_TAG"], get)
    if current_sha != pin["SCUMMVM_COMMIT"]:
        raise ValueError("Current pinned tag/commit disagrees with upstream; investigate before upgrading")
    current_version = version(pin["SCUMMVM_TAG"])
    status = "upgrade-available" if latest_version > current_version else "up-to-date" if latest_version == current_version else "ahead-of-latest"
    source_url = f"https://raw.githubusercontent.com/scummvm/scummvm/{sha}/dists/emscripten/build.sh"
    upstream_sdk = None
    if status == "upgrade-available":
        source = text(source_url)
        match = re.search(r'^EMSDK_VERSION=(?:"\$\{EMSDK_VERSION:-([0-9.]+)\}"|"([0-9.]+)"|([0-9.]+))\s*$', source, re.MULTILINE)
        upstream_sdk = next((s for s in match.groups() if s), None) if match else None
    return {"status": status, "latest": {"tag": tag, "commit": sha, "release_url": f"https://github.com/scummvm/scummvm/releases/tag/{tag}",
            "emscripten_source_url": source_url, "upstream_sdk_default": upstream_sdk}}


def apply_pin(root, original, pin, result, target, expected_commit, sdk):
    if result["status"] != "upgrade-available":
        raise ValueError("No newer stable engine to apply; refusing a downgrade or SDK-only change")
    latest = result["latest"]
    if target != latest["tag"] or expected_commit != latest["commit"] or not sdk or not SDK.fullmatch(sdk):
        raise ValueError("Apply requires the reviewed target tag, exact candidate commit and numeric SDK")
    updated = original
    for key, value in {"SCUMMVM_TAG": target, "SCUMMVM_COMMIT": expected_commit, "EMSDK_VERSION": sdk}.items():
        updated = re.sub(r"^" + key + r"=.*$", key + "=" + value, updated, flags=re.MULTILINE)
    path = root / PIN
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix=".scummvm-pin-", delete=False) as file:
            temporary = Path(file.name)
            file.write(updated)
        os.chmod(temporary, stat.S_IMODE(path.stat().st_mode))
        if path.read_text() != original:
            raise ValueError("Version pin changed during the check; reread it before applying")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-path", type=Path, default=Path.cwd())
    parser.add_argument("--offline", action="store_true", help="Validate pins and patch memory without network or writes")
    parser.add_argument("--apply", action="store_true", help="Write only the reviewed newer release pin")
    parser.add_argument("--target-tag")
    parser.add_argument("--expected-commit")
    parser.add_argument("--sdk")
    args = parser.parse_args()
    if args.offline and args.apply or not args.apply and any((args.target_tag, args.expected_commit, args.sdk)):
        parser.error("Apply arguments require --apply and cannot be used with --offline")
    root = Path(subprocess.check_output(["git", "-C", str(args.repo_path), "rev-parse", "--show-toplevel"], stderr=subprocess.DEVNULL, timeout=5).decode().strip())
    original, pin = read_pin(root)
    result = {"current": pin, "memory": validate_memory(root)}
    result.update({"status": "offline-validated"} if args.offline else release_check(pin))
    if args.apply:
        apply_pin(root, original, pin, result, args.target_tag, args.expected_commit, args.sdk)
        result["pin_updated"] = True
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError, KeyError, TypeError, AttributeError) as error:
        # Never print upstream bodies, credentials, proxy details or a traceback.
        message = str(error) if isinstance(error, ValueError) else f"Upgrade check failed ({type(error).__name__}); no successful check is established"
        print(json.dumps({"error": message}), file=sys.stderr)
        raise SystemExit(2)
