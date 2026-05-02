#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCUMMVM_DIR="${1:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"
DIST_DIR="${2:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"
SHELL_DIR="${3:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"
NODE_BIN="${4:?usage: finalize_scummvm_dist.sh <scummvm-dir> <dist-dir> <shell-dir> <node-bin>}"

source "$ROOT_DIR/scripts/build_helpers.sh"

if [[ -d "$SHELL_DIR/launcher" ]]; then
  rm -rf "$DIST_DIR/launcher"
  cp -R "$SHELL_DIR/launcher" "$DIST_DIR/launcher"
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
python3 "$ROOT_DIR/scripts/patch_scummvm_audio.py" "$DIST_DIR/scummvm.js"
node "$ROOT_DIR/scripts/manage_scummvm_assets.mjs" sync "$DIST_DIR" "$SHELL_DIR"
