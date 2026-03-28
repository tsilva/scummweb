#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCUMMVM_DIR="$ROOT_DIR/vendor/scummvm"
EMSDK_VERSION="${EMSDK_VERSION:-$(sed -n 's/^EMSDK_VERSION=\"\\([^\"]*\\)\"/\\1/p' "$SCUMMVM_DIR/dists/emscripten/build.sh" 2>/dev/null | head -n 1)}"
EMSDK_DIR="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION"

source "$EMSDK_DIR/emsdk_env.sh" >/dev/null
EMSDK_NPM="$(dirname "$EMSDK_NODE")/npm"
cd "$ROOT_DIR"
"$EMSDK_NPM" install --no-fund --no-audit >/dev/null

exec "$EMSDK_NPM" run dev -- --hostname 127.0.0.1 --port 3000
