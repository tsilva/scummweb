#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCUMMVM_DIR="${1:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <public-dir> <bundle-zip> <node-bin>}"
DIST_DIR="${2:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <public-dir> <bundle-zip> <node-bin>}"
PUBLIC_DIR="${3:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <public-dir> <bundle-zip> <node-bin>}"
BUNDLE_ZIP="${4:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <public-dir> <bundle-zip> <node-bin>}"
NODE_BIN="${5:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <public-dir> <bundle-zip> <node-bin>}"

source "$ROOT_DIR/scripts/build_helpers.sh"

if [[ -f "$BUNDLE_ZIP" ]]; then
  unzip -q -o "$BUNDLE_ZIP" 'launcher/*' -d "$DIST_DIR"
fi

PROJECT_REMOTE_URL="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)"
PROJECT_REPO_URL="$(normalize_git_url "$PROJECT_REMOTE_URL")"
PROJECT_COMMIT="$(git -C "$ROOT_DIR" rev-parse HEAD 2>/dev/null || true)"
PROJECT_DIRTY="false"
if [[ -n "$(git -C "$ROOT_DIR" status --porcelain 2>/dev/null)" ]]; then
  PROJECT_DIRTY="true"
fi

SCUMMVM_REMOTE_URL="$(git -C "$SCUMMVM_DIR" remote get-url origin 2>/dev/null || true)"
SCUMMVM_REPO_URL="$(normalize_git_url "$SCUMMVM_REMOTE_URL")"
SCUMMVM_COMMIT="$(git -C "$SCUMMVM_DIR" rev-parse HEAD 2>/dev/null || true)"
SCUMMVM_VERSION="$(git -C "$SCUMMVM_DIR" describe --tags --always 2>/dev/null || true)"
SCUMMVM_DIRTY="false"
if [[ -n "$(git -C "$SCUMMVM_DIR" status --porcelain 2>/dev/null)" ]]; then
  SCUMMVM_DIRTY="true"
fi

PROJECT_REPO_URL="$PROJECT_REPO_URL" \
PROJECT_COMMIT="$PROJECT_COMMIT" \
PROJECT_DIRTY="$PROJECT_DIRTY" \
SCUMMVM_REPO_URL="$SCUMMVM_REPO_URL" \
SCUMMVM_COMMIT="$SCUMMVM_COMMIT" \
SCUMMVM_VERSION="$SCUMMVM_VERSION" \
SCUMMVM_DIRTY="$SCUMMVM_DIRTY" \
python3 "$ROOT_DIR/scripts/write_source_info.py" "$DIST_DIR"

"$NODE_BIN" "$ROOT_DIR/scripts/create_launcher_metadata.mjs" \
  "$DIST_DIR/scummvm.ini" \
  "$DIST_DIR/games.json"

python3 "$ROOT_DIR/scripts/write_scummvm_pages.py" "$DIST_DIR"

python3 "$ROOT_DIR/scripts/generate_logo_assets.py" \
  --source "$ROOT_DIR/branding/scummvm-logo-master.png" \
  --out-dir "$DIST_DIR"

python3 "$ROOT_DIR/scripts/patch_scummvm_fs.py" "$DIST_DIR/scummvm_fs.js"
python3 "$ROOT_DIR/scripts/patch_scummvm_html.py" "$DIST_DIR/scummvm.html"
"$ROOT_DIR/scripts/sync_bundle_assets.sh" "$DIST_DIR" "$PUBLIC_DIR"
