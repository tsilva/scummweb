#!/usr/bin/env bash

set -euo pipefail

DIST_DIR="$1"
PUBLIC_DIR="$2"

managed_paths=(
  data
  doc
  favicon.ico
  focus-overlay.js
  games.json
  index.html
  launcher
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
)

stale_paths=(
  game.json
  home-static.html
  source.html
  sw.js
)

mkdir -p "$PUBLIC_DIR"
for cleanup_path in "${managed_paths[@]}" "${stale_paths[@]}"; do
  rm -rf "$PUBLIC_DIR/$cleanup_path"
done

for managed_path in "${managed_paths[@]}"; do
  if [[ -e "$DIST_DIR/$managed_path" ]]; then
    cp -R "$DIST_DIR/$managed_path" "$PUBLIC_DIR/$managed_path"
  fi
done
