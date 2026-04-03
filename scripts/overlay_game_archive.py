#!/usr/bin/env python3

from pathlib import Path
import shutil
import sys

source_dir = Path(sys.argv[1])
target_dir = Path(sys.argv[2])
source_subdir = sys.argv[3].strip()
target_dir.mkdir(parents=True, exist_ok=True)

top_level_entries = [
    path for path in sorted(source_dir.iterdir()) if path.name != "__MACOSX"
]

if len(top_level_entries) == 1 and top_level_entries[0].is_dir():
    normalized_root = top_level_entries[0]
else:
    normalized_root = source_dir

if source_subdir:
    normalized_root = normalized_root / source_subdir
    if not normalized_root.exists():
        raise SystemExit(f"Overlay subdirectory '{source_subdir}' not found in {source_dir}")


def merge(source: Path, destination: Path) -> None:
    if source.name == "__MACOSX":
        return

    if source.is_dir():
        destination.mkdir(parents=True, exist_ok=True)
        for child in sorted(source.iterdir()):
            merge(child, destination / child.name)
        return

    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if destination.is_dir():
            shutil.rmtree(destination)
        else:
            destination.unlink()

    shutil.move(str(source), destination)


for child in sorted(normalized_root.iterdir()):
    merge(child, target_dir / child.name)
