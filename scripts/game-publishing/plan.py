"""Pin one official demo or reviewed Queen FLAC package; no credentials."""

import hashlib
import json
import os
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
MAX_BYTES = 4 * 1024 * 1024 * 1024
FIELDS = ("target", "gameId", "title", "archive", "url", "sha256")
ORIGIN = "https://scummvm-games.tsilva.eu"
QUEEN_SOURCE = "9064bd0e4b26774943b1a363113f9753dff31a2dc7b152059d985b66bc5e07bb"
QUEEN_README = "d9d78411e5547be1d8fa3819e4b6d02e33a035cf5f709cb05940f1e3daa850f8"


def owned_file(path, root):
    path, root = Path(path).absolute(), Path(root).resolve()
    if path.resolve() != path or not path.is_relative_to(root):
        raise ValueError("Noncanonical game input")
    info = path.stat()
    if not path.is_file() or info.st_uid != os.getuid() or info.st_nlink != 1:
        raise ValueError("Expected an owned regular file")
    return path


def catalog_entry(root, target):
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", target):
        raise ValueError("Invalid demo target")
    catalog = owned_file(root / "data/classic-freeware.json", root)
    raw = catalog.read_bytes()
    matches = [entry for entry in json.loads(raw)["games"] if entry["target"] == target]
    if not matches and target == "queen":
        return prepared_queen(root)
    if len(matches) != 1:
        raise ValueError("Expected one catalog demo")
    entry = matches[0]
    if (
        not entry["title"].endswith("(Demo)")
        or entry.get("preserveArchive") is not True
        or not isinstance(entry.get("redistributionReview"), dict)
        or not entry["redistributionReview"].get("basis")
        or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", entry["gameId"])
        or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*\.zip", entry["archive"])
        or entry["url"] not in {
            "https://downloads.scummvm.org/frs/demos/" + entry["engineId"] + "/" + entry["archive"],
            *({"https://downloads.scummvm.org/frs/demos/scumm/he/" + entry["archive"]}
              if entry["engineId"] == "scumm" else set()),
        }
        or not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"])
    ):
        raise ValueError("Only reviewed unchanged official demo ZIPs are supported")
    return entry, hashlib.sha256(raw).hexdigest()


def prepared_queen(root):
    """The reviewed extension permits only this lossless English CD recipe."""
    manifest = owned_file(root / "data/game-downloads.json", root)
    raw = manifest.read_bytes()
    data = json.loads(raw)
    entry = data.get("games", {}).get("queen", {})
    checksum = entry.get("sha256", "")
    if (
        data.get("version") != 1 or entry.get("target") != "queen"
        or entry.get("gameId") != "queen" or entry.get("engineId") != "queen"
        or entry.get("recipe") != "queen-flac-v1"
        or not isinstance(checksum, str)
        or not re.fullmatch(r"[a-f0-9]{64}", checksum)
        or entry.get("archive") != f"queen-flac-{checksum[:12]}.zip"
        or entry.get("url") != ORIGIN + "/" + entry["archive"]
        or entry.get("source") != {"url": ORIGIN + "/queen.zip", "sha256": QUEEN_SOURCE}
        or entry.get("originalReadmeSha256") != QUEEN_README
        or not isinstance(entry.get("title"), str) or not entry["title"]
        or type(entry.get("bytes")) is not int or not 0 < entry["bytes"] <= MAX_BYTES
    ):
        raise ValueError("Unexpected prepared Queen package")
    return entry, hashlib.sha256(raw).hexdigest()


def validate(root, plan):
    version = plan.get("version")
    if type(version) is not int or version not in (1, 2) or set(plan) != {
        "version", "catalogSha256", "bytes", *FIELDS, *({"key"} if version == 2 else set())
    }:
        raise ValueError("Invalid game plan")
    entry, catalog_hash = catalog_entry(root, plan["target"])
    if plan["catalogSha256"] != catalog_hash or any(plan[key] != entry[key] for key in FIELDS):
        raise ValueError("Catalog changed after game preparation")
    prepared = entry.get("recipe") == "queen-flac-v1"
    if prepared != (version == 2) or (prepared and (plan["key"] != entry["archive"] or plan["bytes"] != entry["bytes"])):
        raise ValueError("Game plan does not match its package kind")
    source = owned_file(root / "downloads" / entry["archive"], root / "downloads")
    if type(plan["bytes"]) is not int or not 0 < plan["bytes"] <= MAX_BYTES or source.stat().st_size != plan["bytes"]:
        raise ValueError("Unexpected game size")
    digest = hashlib.sha256()
    with source.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    if digest.hexdigest() != plan["sha256"] or not zipfile.is_zipfile(source):
        raise ValueError("Game archive differs from its pinned source")
    if prepared:
        with zipfile.ZipFile(source) as archive:
            if sorted(archive.namelist()) != ["queen.1c", "readme.txt"]:
                raise ValueError("Unexpected Queen package files")
            if archive.getinfo("readme.txt").file_size > 64 * 1024:
                raise ValueError("Oversized Queen notice")
            if not 13 < archive.getinfo("queen.1c").file_size <= 256 * 1024 * 1024:
                raise ValueError("Unexpected expanded Queen data size")
            notice = archive.read("readme.txt")
            if not notice.startswith(b"MODIFIED VERSION - ScummWEB lossless audio edition\n"):
                raise ValueError("Queen modification notice is required")
            separator = b"Original readme, attribution and licence follow unchanged:\n--------------------------------------------------------\n\n"
            if notice.count(separator) != 1 or hashlib.sha256(notice.split(separator, 1)[1]).hexdigest() != entry.get("originalReadmeSha256"):
                raise ValueError("Original Queen licence changed")
            with archive.open("queen.1c") as stream:
                if stream.read(13) != b"QTBL" + b"CEM10\0" + bytes([0, 0, 3]):
                    raise ValueError("Only English CD FLAC Queen data is supported")
            if archive.testzip() is not None:
                raise ValueError("Corrupt Queen package")
    return source


def load(root, path):
    path = owned_file(path, root / ".internal/evidence/game-publishing")
    if path.stat().st_size > 8192:
        raise ValueError("Oversized game plan")
    plan = json.loads(path.read_text())
    if path != root / ".internal/evidence/game-publishing" / plan["target"] / "plan.json":
        raise ValueError("Unexpected game plan path")
    validate(root, plan)
    return plan


def prepare(root, target):
    entry, catalog_hash = catalog_entry(root, target)
    source = owned_file(root / "downloads" / entry["archive"], root / "downloads")
    prepared = entry.get("recipe") == "queen-flac-v1"
    plan = {"version": 2 if prepared else 1, "catalogSha256": catalog_hash, "bytes": source.stat().st_size,
            **{key: entry[key] for key in FIELDS}}
    if prepared:
        plan["key"] = entry["archive"]
    validate(root, plan)
    parent = root / ".internal/evidence/game-publishing" / target
    if parent.resolve() != parent:
        raise ValueError("Noncanonical game workspace")
    parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if parent.stat().st_uid != os.getuid():
        raise ValueError("Game workspace has another owner")
    path = parent / "plan.json"
    raw = (json.dumps(plan, indent=2) + "\n").encode()
    if path.exists():
        owned_file(path, parent)
        if path.read_bytes() != raw:
            raise ValueError("Existing game plan differs; review before replacing it")
    else:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
    return path


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Expected one catalog target")
        path = prepare(ROOT, sys.argv[1])
        print(json.dumps({"ok": True, "plan": str(path.relative_to(ROOT))}))
    except Exception:
        raise SystemExit("Game plan rejected; input details withheld") from None
