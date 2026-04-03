#!/usr/bin/env python3

from datetime import datetime, timezone
from pathlib import Path
import json
import os
import sys
import urllib.parse

dist = Path(sys.argv[1])
asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")


def bundle_href(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme or parsed.netloc:
        return value

    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(key, val) for key, val in query if key != "v"]
    query.append(("v", asset_version))
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(query, doseq=True))
    )


def commit_url(base: str, commit: str) -> str:
    if not base or not commit:
        return ""
    if "github.com/" in base:
        return f"{base}/tree/{urllib.parse.quote(commit)}"
    return base


def archive_url(base: str, commit: str) -> str:
    if not base or not commit:
        return ""
    if "github.com/" in base:
        return f"{base}/archive/{urllib.parse.quote(commit)}.tar.gz"
    return ""


info = {
    "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "project": {
        "name": "scummweb",
        "repository_url": os.environ.get("PROJECT_REPO_URL", ""),
        "commit": os.environ.get("PROJECT_COMMIT", ""),
        "commit_url": commit_url(os.environ.get("PROJECT_REPO_URL", ""), os.environ.get("PROJECT_COMMIT", "")),
        "archive_url": archive_url(os.environ.get("PROJECT_REPO_URL", ""), os.environ.get("PROJECT_COMMIT", "")),
        "dirty": os.environ.get("PROJECT_DIRTY", "false") == "true",
    },
    "scummvm": {
        "repository_url": os.environ.get("SCUMMVM_REPO_URL", ""),
        "version": os.environ.get("SCUMMVM_VERSION", ""),
        "commit": os.environ.get("SCUMMVM_COMMIT", ""),
        "commit_url": commit_url(os.environ.get("SCUMMVM_REPO_URL", ""), os.environ.get("SCUMMVM_COMMIT", "")),
        "archive_url": archive_url(os.environ.get("SCUMMVM_REPO_URL", ""), os.environ.get("SCUMMVM_COMMIT", "")),
        "dirty": os.environ.get("SCUMMVM_DIRTY", "false") == "true",
    },
    "local_docs": {
        "gpl_license": bundle_href("doc/COPYING"),
        "scummvm_readme": bundle_href("doc/README.md"),
        "copyright": bundle_href("doc/COPYRIGHT"),
        "game_readmes": [],
    },
}

(dist / "source-info.json").write_text(json.dumps(info, indent=2) + "\n")
