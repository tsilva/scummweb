#!/bin/zsh

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
EMSDK_NPM="$(dirname "$EMSDK_NODE")/npm"

"$EMSDK_NPM" install --no-fund --no-audit >/dev/null
"$EMSDK_NPM" run build >/tmp/scummvm-web-next-build.log 2>&1
"$EMSDK_NPM" run start -- --hostname 127.0.0.1 --port 3000 >/tmp/scummvm-web-verify-server.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

"$EMSDK_NODE" "$ROOT_DIR/scripts/verify_game_launch.mjs" \
  "http://127.0.0.1:3000/" \
  "$ROOT_DIR/artifacts/verify-launch.png"
