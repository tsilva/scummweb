#!/usr/bin/env python3

import json
from pathlib import Path
import sys


def build_index(directory):
    listing = {}
    for entry in sorted(directory.iterdir()):
        if entry.name.startswith(".") or entry.name == "index.json":
            continue
        if entry.is_dir() and not entry.is_symlink():
            listing[entry.name] = build_index(entry)
        elif entry.is_file():
            listing[entry.name] = entry.stat().st_size
    return listing


root = Path(sys.argv[1])
(root / "index.json").write_text(json.dumps(build_index(root), separators=(",", ":")) + "\n")
