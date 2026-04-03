#!/usr/bin/env python3

from pathlib import Path
import shutil
import sys

source_dir = Path(sys.argv[1])
target_dir = Path(sys.argv[2])
target_dir.mkdir(parents=True, exist_ok=True)

top_level_entries = [
    path for path in sorted(source_dir.iterdir()) if path.name != "__MACOSX"
]

if len(top_level_entries) == 1 and top_level_entries[0].is_dir():
    normalized_root = top_level_entries[0]
else:
    normalized_root = source_dir

for child in sorted(normalized_root.iterdir()):
    if child.name == "__MACOSX":
        continue

    destination = target_dir / child.name
    if destination.exists():
        if destination.is_dir():
            shutil.rmtree(destination)
        else:
            destination.unlink()

    shutil.move(str(child), destination)
