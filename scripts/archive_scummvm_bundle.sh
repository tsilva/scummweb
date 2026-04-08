#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT_DIR/scripts/bundle-manager.mjs" archive

ls -lh "$ROOT_DIR/bundle/scummvm-public.zip"
