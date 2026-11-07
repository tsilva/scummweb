#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCUMMVM_DIR="${1:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"
DIST_DIR="${2:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"
SHELL_DIR="${3:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"
NODE_BIN="${4:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"

EMSDK_DIR="${5:?missing Emscripten SDK directory}"
FLAC_ARCHIVE="${6:?missing FLAC source archive}"

if [[ -d "$SHELL_DIR/launcher" ]]; then
  rm -rf "$DIST_DIR/launcher"
  cp -R "$SHELL_DIR/launcher" "$DIST_DIR/launcher"
fi
if [[ -f "$SHELL_DIR/logo-nav.png" ]]; then
  cp "$SHELL_DIR/logo-nav.png" "$DIST_DIR/logo-nav.png"
fi

if [[ "${SCUMMVM_REUSE_CATALOG:-0}" == 1 ]]; then
  cp "$SHELL_DIR/index.html" "$SHELL_DIR/manifest.json" "$DIST_DIR/"
fi
"$NODE_BIN" "$ROOT_DIR/scripts/create_launcher_metadata.mjs" \
  "$DIST_DIR/scummvm.ini" \
  "$DIST_DIR/games.json"
if [[ "${SCUMMVM_REUSE_CATALOG:-0}" != 1 ]]; then
  python3 "$ROOT_DIR/scripts/write_scummvm_pages.py" "$DIST_DIR"
fi

python3 "$ROOT_DIR/scripts/generate_logo_assets.py" \
  --source "$ROOT_DIR/branding/scummvm-logo-master.png" \
  --out-dir "$DIST_DIR"

BRAND_DIR="$ROOT_DIR/public/brand/web-seo"
cp "$BRAND_DIR/favicon/favicon.ico" "$DIST_DIR/favicon.ico"
cp "$BRAND_DIR/favicon/favicon.svg" "$DIST_DIR/favicon.svg"
cp "$BRAND_DIR/android-chrome-192.png" "$DIST_DIR/scummvm-192.png"
cp "$BRAND_DIR/android-chrome-512.png" "$DIST_DIR/scummvm-512.png"

node "$ROOT_DIR/scripts/generate-runtime-assets.mjs" "$DIST_DIR"
python3 "$ROOT_DIR/scripts/write_source_info.py" "$DIST_DIR" "$SCUMMVM_DIR" "$EMSDK_DIR" "$FLAC_ARCHIVE"
node "$ROOT_DIR/scripts/manage_scummvm_assets.mjs" validate "$DIST_DIR"
node "$ROOT_DIR/scripts/manage_scummvm_assets.mjs" sync "$DIST_DIR" "$SHELL_DIR"
