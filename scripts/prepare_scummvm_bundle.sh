#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUNDLE_ZIP="$ROOT_DIR/bundle/scummvm-public.zip"
PUBLIC_DIR="$ROOT_DIR/public"
STAMP_FILE="$PUBLIC_DIR/.scummvm-bundle.stamp"

managed_paths=(
  data
  doc
  favicon.ico
  focus-overlay.js
  game.json
  games.json
  games
  index.html
  logo.svg
  manifest.json
  scummvm-192.png
  scummvm-512.png
  scummvm.html
  scummvm.ini
  scummvm.js
  scummvm.wasm
  scummvm_fs.js
  source-info.json
  source.html
)

required_files=(
  game.json
  scummvm.html
  scummvm.js
  scummvm.wasm
  scummvm_fs.js
)

bundle_signature() {
  python3 - "$1" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
stats = path.stat()
print(f"{stats.st_size}:{stats.st_mtime_ns}")
PY
}

if [[ -f "$BUNDLE_ZIP" ]]; then
  mkdir -p "$PUBLIC_DIR"
  signature="$(bundle_signature "$BUNDLE_ZIP")"
  existing_signature="$(cat "$STAMP_FILE" 2>/dev/null || true)"

  if [[ "$signature" != "$existing_signature" ]]; then
    for managed_path in "${managed_paths[@]}"; do
      rm -rf "$PUBLIC_DIR/$managed_path"
    done
    unzip -q -o "$BUNDLE_ZIP" -d "$PUBLIC_DIR"
    printf '%s\n' "$signature" > "$STAMP_FILE"
  fi
fi

missing_files=()
for required_file in "${required_files[@]}"; do
  if [[ ! -e "$PUBLIC_DIR/$required_file" ]]; then
    missing_files+=("$required_file")
  fi
done

if (( ${#missing_files[@]} > 0 )); then
  echo "Missing ScummVM web bundle assets in $PUBLIC_DIR: ${missing_files[*]}" >&2
  if [[ -f "$BUNDLE_ZIP" ]]; then
    echo "Archive exists but did not restore the required files: $BUNDLE_ZIP" >&2
  else
    echo "Archive not found: $BUNDLE_ZIP" >&2
  fi
  exit 1
fi
