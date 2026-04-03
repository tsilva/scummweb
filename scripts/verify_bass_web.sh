#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCUMMVM_DIR="$ROOT_DIR/vendor/scummvm"
DEFAULT_EMSDK_VERSION="$(sed -n 's/^EMSDK_VERSION=\"\\([^\"]*\\)\"/\\1/p' "$SCUMMVM_DIR/dists/emscripten/build.sh" 2>/dev/null | head -n 1)"
EMSDK_VERSION="${EMSDK_VERSION:-${DEFAULT_EMSDK_VERSION:-3.1.51}}"
EMSDK_DIR="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION"
DIST_DIR="$ROOT_DIR/public"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Missing public/. Run ./scripts/build_bass_web.sh first." >&2
  exit 1
fi

if [[ ! -d "$EMSDK_DIR" ]]; then
  echo "Missing emsdk. Run ./scripts/build_bass_web.sh first." >&2
  exit 1
fi

source "$EMSDK_DIR/emsdk_env.sh"
PNPM_BIN="${PNPM_BIN:-$(command -v pnpm || true)}"

if [[ -z "$PNPM_BIN" ]]; then
  echo "Missing pnpm. Install pnpm to run this verification script." >&2
  exit 1
fi

"$PNPM_BIN" build >/tmp/scummweb-next-build.log 2>&1
"$PNPM_BIN" start -- --hostname 127.0.0.1 --port 3000 >/tmp/scummweb-verify-server.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

node "$ROOT_DIR/scripts/verify_game_launch.mjs" \
  "http://127.0.0.1:3000/" \
  "$ROOT_DIR/artifacts/verify-launch.png"
