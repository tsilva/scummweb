#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PUBLIC_DIR="$ROOT_DIR/public"
BUNDLE_ZIP="$ROOT_DIR/bundle/scummvm-public.zip"

if [[ ! -d "$PUBLIC_DIR" ]]; then
  echo "Missing public/. Run ./scripts/build_bass_web.sh first." >&2
  exit 1
fi

python3 - "$PUBLIC_DIR" "$BUNDLE_ZIP" <<'PY'
from pathlib import Path
import sys
import zipfile

public_dir = Path(sys.argv[1])
bundle_zip = Path(sys.argv[2])
temp_bundle_zip = bundle_zip.with_suffix(bundle_zip.suffix + ".tmp")
managed_paths = [
    "data",
    "doc",
    "favicon.ico",
    "focus-overlay.js",
    "game.json",
    "games",
    "logo.svg",
    "manifest.json",
    "scummvm-192.png",
    "scummvm-512.png",
    "scummvm.html",
    "scummvm.ini",
    "scummvm.js",
    "scummvm.wasm",
    "scummvm_fs.js",
    "source-info.json",
    "source.html",
]

required_paths = [
    "game.json",
    "scummvm.html",
    "scummvm.js",
    "scummvm.wasm",
    "scummvm_fs.js",
]

missing = [path for path in required_paths if not (public_dir / path).exists()]
if missing:
    print(
        f"Missing ScummVM web bundle assets in {public_dir}: {' '.join(missing)}",
        file=sys.stderr,
    )
    sys.exit(1)

bundle_zip.parent.mkdir(parents=True, exist_ok=True)
temp_bundle_zip.unlink(missing_ok=True)

skip_names = {".DS_Store", ".scummvm-bundle.stamp"}

with zipfile.ZipFile(
    temp_bundle_zip,
    mode="w",
    compression=zipfile.ZIP_DEFLATED,
    compresslevel=9,
) as archive:
    for managed_path in managed_paths:
        source = public_dir / managed_path
        if source.is_dir():
            for path in sorted(source.rglob("*")):
                if path.is_dir():
                    continue

                relative_path = path.relative_to(public_dir)
                if relative_path.name in skip_names:
                    continue

                archive.write(path, relative_path.as_posix())
            continue

        if source.exists() and source.name not in skip_names:
            archive.write(source, source.relative_to(public_dir).as_posix())

temp_bundle_zip.replace(bundle_zip)
PY

ls -lh "$BUNDLE_ZIP"
