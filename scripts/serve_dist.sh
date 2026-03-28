#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

exec python3 -m http.server 8000 --bind 127.0.0.1 --directory "$ROOT_DIR/dist"
