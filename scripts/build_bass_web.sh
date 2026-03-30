#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"
SCUMMVM_DIR="$VENDOR_DIR/scummvm"
DIST_DIR="$ROOT_DIR/dist"
PUBLIC_DIR="$ROOT_DIR/public"
BUNDLE_ZIP="$ROOT_DIR/bundle/scummvm-public.zip"
DOWNLOADS_DIR="$ROOT_DIR/downloads"
BASS_ZIP="$DOWNLOADS_DIR/bass-cd-1.2.zip"
DEFAULT_EMSDK_VERSION="$(sed -n 's/^EMSDK_VERSION=\"\\([^\"]*\\)\"/\\1/p' "$SCUMMVM_DIR/dists/emscripten/build.sh" 2>/dev/null | head -n 1)"
EMSDK_VERSION="${EMSDK_VERSION:-${DEFAULT_EMSDK_VERSION:-3.1.51}}"
EMSDK_DIR="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION"
EMSCRIPTEN_LIBS_BUILD_DIR="$SCUMMVM_DIR/dists/emscripten/libs/build"
SCUMMVM_BUNDLE_ASSET_VERSION_RAW="${SCUMMVM_ASSET_VERSION:-${VERCEL_DEPLOYMENT_ID:-${VERCEL_URL:-${VERCEL_GIT_COMMIT_SHA:-dev}}}}"
SCUMMVM_BUNDLE_ASSET_VERSION="${SCUMMVM_BUNDLE_ASSET_VERSION_RAW//[^a-zA-Z0-9._-]/-}"
export SCUMMVM_BUNDLE_ASSET_VERSION

shopt -s nullglob

normalize_git_url() {
  local url="$1"

  if [[ -z "$url" ]]; then
    echo ""
    return
  fi

  case "$url" in
    git@github.com:*)
      echo "https://github.com/${url#git@github.com:}" | sed 's/\.git$//'
      ;;
    ssh://git@github.com/*)
      echo "https://github.com/${url#ssh://git@github.com/}" | sed 's/\.git$//'
      ;;
    https://github.com/*)
      echo "${url%.git}"
      ;;
    *)
      echo "$url"
      ;;
  esac
}

if [[ ! -f "$BASS_ZIP" ]]; then
  echo "Missing game archive: $BASS_ZIP" >&2
  exit 1
fi

find_optional_archive() {
  local pattern
  local matches=()

  for pattern in "$@"; do
    matches=("$DOWNLOADS_DIR"/$pattern)
    if (( ${#matches[@]} > 0 )); then
      printf '%s\n' "${matches[0]}"
      return 0
    fi
  done

  return 1
}

extract_game_archive_into_game_id_dir() {
  local archive_path="$1"
  local target_dir="$2"
  local temp_dir

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/scummvm-web-game.XXXXXX")"
  unzip -q -o "$archive_path" -d "$temp_dir"

  python3 - "$temp_dir" "$target_dir" <<'PY'
from pathlib import Path
import shutil
import sys

source_dir = Path(sys.argv[1])
target_dir = Path(sys.argv[2])
target_dir.mkdir(parents=True, exist_ok=True)

top_level_entries = [
    path for path in sorted(source_dir.iterdir()) if path.name != "__MACOSX"
]

if len(top_level_entries) == 1 and top_level_entries[0].is_dir():
    normalized_root = top_level_entries[0]
else:
    normalized_root = source_dir

for child in sorted(normalized_root.iterdir()):
    if child.name == "__MACOSX":
        continue

    destination = target_dir / child.name
    if destination.exists():
        if destination.is_dir():
            shutil.rmtree(destination)
        else:
            destination.unlink()

    shutil.move(str(child), destination)
PY

  rm -rf "$temp_dir"
}

DREAMWEB_ZIP="$(find_optional_archive 'dreamweb*.zip' 'DreamWeb*.zip' 'DREAMWEB*.zip' || true)"
QUEEN_ZIP="$(find_optional_archive 'FOTAQ*.zip' 'fotaq*.zip' 'Flight*Amazon*Queen*.zip' 'flight*amazon*queen*.zip' || true)"
LURE_ZIP="$(find_optional_archive 'lure*.zip' 'Lure*.zip' 'LURE*.zip' || true)"
DRASCULA_ZIP="$(find_optional_archive 'drascula*.zip' 'Drascula*.zip' 'DRASCULA*.zip' || true)"
SWORD25_ZIP="$(find_optional_archive 'sword25*.zip' 'Sword25*.zip' 'SWORD25*.zip' || true)"
WAXWORKS_ZIP="$(find_optional_archive 'waxworks*.zip' 'Waxworks*.zip' 'WAXWORKS*.zip' || true)"
NIPPON_AMIGA_ZIP="$(find_optional_archive 'nippon-amiga*.zip' 'Nippon-amiga*.zip' 'NIPPON-AMIGA*.zip' 'nippon*amiga*.zip' 'Nippon*Amiga*.zip' || true)"
GAME_ARCHIVES=("$BASS_ZIP")
MANAGED_PUBLIC_PATHS=(
  data
  doc
  favicon.ico
  focus-overlay.js
  game.json
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
  source.html
)

if [[ -n "$DREAMWEB_ZIP" ]]; then
  GAME_ARCHIVES+=("$DREAMWEB_ZIP")
else
  echo "DreamWeb archive not found in $DOWNLOADS_DIR; building with BASS data only." >&2
fi

if [[ -n "$QUEEN_ZIP" ]]; then
  GAME_ARCHIVES+=("$QUEEN_ZIP")
else
  echo "Flight of the Amazon Queen archive not found in $DOWNLOADS_DIR; building without Queen." >&2
fi

if [[ -n "$LURE_ZIP" ]]; then
  GAME_ARCHIVES+=("$LURE_ZIP")
else
  echo "Lure of the Temptress archive not found in $DOWNLOADS_DIR; building without Lure." >&2
fi

if [[ -n "$DRASCULA_ZIP" ]]; then
  GAME_ARCHIVES+=("$DRASCULA_ZIP")
else
  echo "Drascula archive not found in $DOWNLOADS_DIR; building without Drascula." >&2
fi

if [[ -n "$SWORD25_ZIP" ]]; then
  GAME_ARCHIVES+=("$SWORD25_ZIP")
else
  echo "Broken Sword 2.5 archive not found in $DOWNLOADS_DIR; building without Sword25." >&2
fi

if [[ -n "$WAXWORKS_ZIP" ]]; then
  GAME_ARCHIVES+=("$WAXWORKS_ZIP")
else
  echo "Waxworks archive not found in $DOWNLOADS_DIR; building without Waxworks." >&2
fi

if [[ -n "$NIPPON_AMIGA_ZIP" ]]; then
  GAME_ARCHIVES+=("$NIPPON_AMIGA_ZIP")
else
  echo "Nippon Safes Amiga archive not found in $DOWNLOADS_DIR; building without Nippon Safes." >&2
fi

mkdir -p "$VENDOR_DIR"

if [[ ! -d "$SCUMMVM_DIR/.git" ]]; then
  git clone --depth 1 --branch v2.9.1 https://github.com/scummvm/scummvm.git "$SCUMMVM_DIR"
fi

python3 - "$SCUMMVM_DIR/engines/sword25/detection_tables.h" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
known_md5 = 'AD_ENTRY1s("data.b25c", "1f89a63e3509aa64626cc90cd2561032", 827397764)'

if known_md5 not in text:
    anchor = '''\t{
\t\t"sword25",
\t\t"Latest version",
\t\tAD_ENTRY1s("data.b25c", "880a8a67faf4a4e7ab62cf114b771428", 827397764),
\t\tCommon::UNK_LANG,
\t\tCommon::kPlatformUnknown,
\t\tADGF_NO_FLAGS,
\t\tGUIO1(GUIO_NOASPECT)
\t},
'''
    replacement = anchor + '''
\t{
\t\t"sword25",
\t\t"Latest version",
\t\tAD_ENTRY1s("data.b25c", "1f89a63e3509aa64626cc90cd2561032", 827397764),
\t\tCommon::UNK_LANG,
\t\tCommon::kPlatformUnknown,
\t\tADGF_NO_FLAGS,
\t\tGUIO1(GUIO_NOASPECT)
\t},
'''
    if anchor not in text:
        raise SystemExit("Could not find Sword25 detection anchor in vendored ScummVM source")
    path.write_text(text.replace(anchor, replacement, 1))
PY

if [[ ! -d "$EMSDK_DIR" ]]; then
  tmp_archive="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION.tar.gz"
  curl -L "https://github.com/emscripten-core/emsdk/archive/refs/tags/${EMSDK_VERSION}.tar.gz" -o "$tmp_archive"
  tar -xf "$tmp_archive" -C "$SCUMMVM_DIR/dists/emscripten"
fi

mkdir -p "$ROOT_DIR/tools/bin"

cat > "$ROOT_DIR/tools/bin/nproc" <<'EOF'
#!/bin/sh
sysctl -n hw.ncpu
EOF
chmod +x "$ROOT_DIR/tools/bin/nproc"

cat > "$ROOT_DIR/tools/bin/wget" <<'EOF'
#!/bin/sh
set -eu

url=""
out=""
use_content_disposition=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    -nc|--no-check-certificate)
      shift
      ;;
    --content-disposition)
      use_content_disposition=1
      shift
      ;;
    -O)
      out="$2"
      shift 2
      ;;
    --*)
      shift
      ;;
    -*)
      shift
      ;;
    *)
      url="$1"
      shift
      ;;
  esac
done

if [ -z "$url" ]; then
  echo "wget shim: missing URL" >&2
  exit 2
fi

if [ -n "$out" ]; then
  exec curl -L --fail -o "$out" "$url"
fi

if [ "$use_content_disposition" -eq 1 ]; then
  exec curl -L --fail -O -J "$url"
fi

exec curl -L --fail -O "$url"
EOF
chmod +x "$ROOT_DIR/tools/bin/wget"

export PATH="$ROOT_DIR/tools/bin:$PATH"

source "$EMSDK_DIR/emsdk_env.sh"
EMSDK_NPM="$(dirname "$EMSDK_NODE")/npm"
sysroot_dir="$EMSDK_DIR/upstream/emscripten/cache/sysroot"
vorbis_source_dir="$EMSDK_DIR/upstream/emscripten/cache/ports/vorbis/Vorbis-version_1"
vorbis_build_dir="/tmp/scummvm-web-vorbis-build"
SWORD25_CONFIG_ARGS=(
  --enable-ogg
  --enable-vorbis
  --enable-zlib
  --enable-png
  --enable-theoradec
  --with-ogg-prefix="$EMSCRIPTEN_LIBS_BUILD_DIR"
  --with-vorbis-prefix="$EMSCRIPTEN_LIBS_BUILD_DIR"
  --with-zlib-prefix="$EMSCRIPTEN_LIBS_BUILD_DIR"
  --with-png-prefix="$EMSCRIPTEN_LIBS_BUILD_DIR"
)

# Prime the Emscripten ports cache so the staged codec prefix can be built
# from the same versions ScummVM's Emscripten toolchain expects.
cat > /tmp/scummvm-web-port-png.c <<'EOF'
#include <png.h>
int main(void) { return 0; }
EOF
emcc /tmp/scummvm-web-port-png.c -s USE_LIBPNG=1 -o /tmp/scummvm-web-port-png.js >/dev/null

cat > /tmp/scummvm-web-port-vorbis.c <<'EOF'
#include <ogg/ogg.h>
#include <vorbis/codec.h>
int main(void) { return 0; }
EOF
emcc /tmp/scummvm-web-port-vorbis.c -s USE_OGG=1 -s USE_VORBIS=1 -o /tmp/scummvm-web-port-vorbis.js >/dev/null

mkdir -p \
  "$EMSCRIPTEN_LIBS_BUILD_DIR/include" \
  "$EMSCRIPTEN_LIBS_BUILD_DIR/include/ogg" \
  "$EMSCRIPTEN_LIBS_BUILD_DIR/include/vorbis" \
  "$EMSCRIPTEN_LIBS_BUILD_DIR/lib"

cp "$sysroot_dir/include/ogg/"*.h "$EMSCRIPTEN_LIBS_BUILD_DIR/include/ogg/"
cp "$sysroot_dir/include/vorbis/"*.h "$EMSCRIPTEN_LIBS_BUILD_DIR/include/vorbis/"
cp \
  "$sysroot_dir/include/png.h" \
  "$sysroot_dir/include/pngconf.h" \
  "$sysroot_dir/include/zlib.h" \
  "$sysroot_dir/include/zconf.h" \
  "$EMSCRIPTEN_LIBS_BUILD_DIR/include/"
cp \
  "$sysroot_dir/lib/wasm32-emscripten/libogg.a" \
  "$sysroot_dir/lib/wasm32-emscripten/libpng.a" \
  "$sysroot_dir/lib/wasm32-emscripten/libvorbis.a" \
  "$sysroot_dir/lib/wasm32-emscripten/libz.a" \
  "$EMSCRIPTEN_LIBS_BUILD_DIR/lib/"

if [[ ! -f "$EMSCRIPTEN_LIBS_BUILD_DIR/lib/libvorbisfile.a" ]]; then
  rm -rf "$vorbis_build_dir"
  emcmake cmake \
    -S "$vorbis_source_dir" \
    -B "$vorbis_build_dir" \
    -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
    -DBUILD_SHARED_LIBS=OFF \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$EMSCRIPTEN_LIBS_BUILD_DIR" \
    -DOGG_INCLUDE_DIRS="$EMSCRIPTEN_LIBS_BUILD_DIR/include" \
    -DOGG_LIBRARIES="$EMSCRIPTEN_LIBS_BUILD_DIR/lib/libogg.a" >/dev/null
  cmake --build "$vorbis_build_dir" --target vorbis vorbisfile vorbisenc -j 4 >/dev/null
  cp \
    "$vorbis_build_dir/lib/libvorbis.a" \
    "$vorbis_build_dir/lib/libvorbisenc.a" \
    "$vorbis_build_dir/lib/libvorbisfile.a" \
    "$EMSCRIPTEN_LIBS_BUILD_DIR/lib/"
  cp "$vorbis_source_dir/include/vorbis/"*.h "$EMSCRIPTEN_LIBS_BUILD_DIR/include/vorbis/"
fi

cd "$SCUMMVM_DIR"

./dists/emscripten/build.sh setup configure make dist \
  --disable-all-engines \
  --enable-engine=sky \
  --enable-engine=dreamweb \
  --enable-engine=queen \
  --enable-engine=lure \
  --enable-engine=drascula \
  --enable-engine=agos \
  --enable-engine=parallaction \
  --enable-engine=sword25 \
  "${SWORD25_CONFIG_ARGS[@]}" \
  --disable-seq-midi \
  --disable-timidity

source "$EMSDK_DIR/emsdk_env.sh"

mkdir -p build-emscripten/games
rm -rf build-emscripten/games/*
for game_archive in "${GAME_ARCHIVES[@]}"; do
  archive_name="$(basename "$game_archive")"
  archive_name_lower="$(printf '%s' "$archive_name" | tr '[:upper:]' '[:lower:]')"

  case "$archive_name_lower" in
    bass-cd-1.2.zip)
      target_game_id="sky"
      ;;
    dreamweb*.zip)
      target_game_id="dreamweb"
      ;;
    fotaq*.zip|flight*amazon*queen*.zip)
      target_game_id="queen"
      ;;
    lure*.zip)
      target_game_id="lure"
      ;;
    drascula*.zip)
      target_game_id="drascula"
      ;;
    waxworks*.zip)
      target_game_id="waxworks"
      ;;
    nippon*amiga*.zip)
      target_game_id="nippon"
      ;;
    sword25*.zip)
      target_game_id="sword25"
      ;;
    *)
      echo "Unsupported game archive layout for $archive_name" >&2
      exit 1
      ;;
  esac

  target_dir="build-emscripten/games/$target_game_id"
  rm -rf "$target_dir"
  extract_game_archive_into_game_id_dir "$game_archive" "$target_dir"
done
"$EMSDK_NODE" "$SCUMMVM_DIR/dists/emscripten/build-make_http_index.js" "$SCUMMVM_DIR/build-emscripten/games"

cd "$ROOT_DIR"
mkdir -p artifacts

cd "$ROOT_DIR"
"$EMSDK_NPM" install --no-fund --no-audit

python3 -m http.server 8000 --bind 127.0.0.1 --directory "$SCUMMVM_DIR/build-emscripten" >/tmp/scummvm-web-build-server.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

"$EMSDK_NODE" "$ROOT_DIR/scripts/generate_game_config.mjs" \
  "$SCUMMVM_DIR/build-emscripten" \
  "http://127.0.0.1:8000/scummvm.html#--add --path=/games --recursive"

python3 - "$SCUMMVM_DIR/build-emscripten/scummvm.ini" "$SCUMMVM_DIR/build-emscripten/games/sword25/data.b25c" <<'PY'
from pathlib import Path
import sys

ini_path = Path(sys.argv[1])
game_data_path = Path(sys.argv[2])

if not ini_path.is_file() or not game_data_path.is_file():
    raise SystemExit(0)

ini_text = ini_path.read_text()
if "[sword25]" in ini_text:
    raise SystemExit(0)

section = """
[sword25]
description=Broken Sword 2.5: The Return of the Templars
path=/games/sword25
engineid=sword25
gameid=sword25
guioptions=sndNoMIDI noAspect gameOption1
"""

ini_path.write_text(ini_text.rstrip() + "\n" + section.lstrip())
PY

python3 - "$SCUMMVM_DIR/build-emscripten/scummvm.ini" "$SCUMMVM_DIR/build-emscripten/games/waxworks" <<'PY'
from pathlib import Path
import sys

ini_path = Path(sys.argv[1])
game_dir = Path(sys.argv[2])

if not ini_path.is_file() or not game_dir.is_dir():
    raise SystemExit(0)

ini_text = ini_path.read_text()
if "[waxworks-demo]" in ini_text:
    raise SystemExit(0)

section = """
[waxworks-demo]
platform=pc
gameid=waxworks
description=Waxworks (Non-Interactive Demo/DOS/English)
language=en
extra=Non-Interactive Demo
path=/games/waxworks
engineid=agos
guioptions=sndNoSpeech launchNoLoad gameOption1 gameOption4 lang_English
"""

ini_path.write_text(ini_text.rstrip() + "\n" + section.lstrip())
PY

python3 - "$SCUMMVM_DIR/build-emscripten/scummvm.ini" "$SCUMMVM_DIR/build-emscripten/games" <<'PY'
from pathlib import Path
import shutil
import sys

ini_path = Path(sys.argv[1])
games_dir = Path(sys.argv[2])
allowed_engine_ids = {"dreamweb", "sky", "queen", "lure", "drascula", "agos", "parallaction", "sword25"}
seen_game_ids = set()

lines = ini_path.read_text().splitlines()
sections = []
current = None

for line in lines:
    if line.startswith("[") and line.endswith("]"):
        current = {"name": line[1:-1], "lines": [line], "values": {}}
        sections.append(current)
        continue

    if current is None:
        sections.append({"name": "", "lines": [line], "values": {}})
        continue

    current["lines"].append(line)
    if "=" in line:
        key, value = line.split("=", 1)
        current["values"][key.strip()] = value.strip()

pruned_paths = []
kept_lines = []

def normalize_section_lines(section_lines, game_id):
    normalized_path = f"path=/games/{game_id}"
    normalized_lines = []
    found_path = False

    for line in section_lines:
        if line.startswith("path="):
            normalized_lines.append(normalized_path)
            found_path = True
            continue

        normalized_lines.append(line)

    if not found_path:
        normalized_lines.append(normalized_path)

    return normalized_lines

for section in sections:
    name = section["name"]
    values = section["values"]

    if not name or name == "scummvm":
      kept_lines.extend(section["lines"])
      continue

    engine_id = values.get("engineid", "")
    game_path = values.get("path", "")
    game_id = values.get("gameid", "")

    if engine_id in allowed_engine_ids:
      if not game_id:
          raise SystemExit(f"Missing gameid for kept ScummVM target: {name}")
      if game_id in seen_game_ids:
          raise SystemExit(f"Duplicate gameid '{game_id}' for kept ScummVM target: {name}")

      seen_game_ids.add(game_id)
      kept_lines.extend(normalize_section_lines(section["lines"], game_id))
      continue

    if game_path == "/games":
      pruned_paths.append("")
    elif game_path.startswith("/games/"):
      pruned_paths.append(game_path.removeprefix("/games/"))

ini_path.write_text("\n".join(kept_lines).rstrip() + "\n")

for relative_path in sorted(set(pruned_paths)):
    if not relative_path:
        continue

    target = games_dir / relative_path
    if target.exists():
        shutil.rmtree(target)
PY

python3 - "$SCUMMVM_DIR/build-emscripten/scummvm.ini" <<'PY'
from pathlib import Path
import sys

ini_path = Path(sys.argv[1])
lines = ini_path.read_text().splitlines()

try:
    section_start = lines.index("[scummvm]")
except ValueError:
    raise SystemExit(0)

section_end = next(
    (
        index
        for index in range(section_start + 1, len(lines))
        if lines[index].startswith("[") and lines[index].endswith("]")
    ),
    len(lines),
)

for index in range(section_start + 1, section_end):
    if lines[index].startswith("gui_return_to_launcher_at_exit="):
        lines[index] = "gui_return_to_launcher_at_exit=false"
        break
else:
    lines.insert(section_end, "gui_return_to_launcher_at_exit=false")

ini_path.write_text("\n".join(lines).rstrip() + "\n")
PY

"$EMSDK_NODE" "$SCUMMVM_DIR/dists/emscripten/build-make_http_index.js" "$SCUMMVM_DIR/build-emscripten/games"

mkdir -p "$DIST_DIR"
rm -rf "$DIST_DIR"
cp -R "$SCUMMVM_DIR/build-emscripten" "$DIST_DIR"

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
SCUMMVM_DIRTY="false"
if [[ -n "$(git -C "$SCUMMVM_DIR" status --porcelain 2>/dev/null)" ]]; then
  SCUMMVM_DIRTY="true"
fi

PROJECT_REPO_URL="$PROJECT_REPO_URL" \
PROJECT_COMMIT="$PROJECT_COMMIT" \
PROJECT_DIRTY="$PROJECT_DIRTY" \
SCUMMVM_REPO_URL="$SCUMMVM_REPO_URL" \
SCUMMVM_COMMIT="$SCUMMVM_COMMIT" \
SCUMMVM_DIRTY="$SCUMMVM_DIRTY" \
python3 - "$DIST_DIR" <<'PY'
from datetime import datetime, timezone
from pathlib import Path
import json
import os
import urllib.parse
import sys

dist = Path(sys.argv[1])
asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")


def bundle_href(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme or parsed.netloc:
        return value

    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(key, val) for key, val in query if key != "v"]
    query.append(("v", asset_version))
    return urllib.parse.urlunparse(
        parsed._replace(query=urllib.parse.urlencode(query, doseq=True))
    )


def commit_url(base: str, commit: str) -> str:
    if not base or not commit:
        return ""
    if "github.com/" in base:
        return f"{base}/tree/{urllib.parse.quote(commit)}"
    return base


def archive_url(base: str, commit: str) -> str:
    if not base or not commit:
        return ""
    if "github.com/" in base:
        return f"{base}/archive/{urllib.parse.quote(commit)}.tar.gz"
    return ""


info = {
    "generated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "project": {
        "name": "scummvm-web",
        "repository_url": os.environ.get("PROJECT_REPO_URL", ""),
        "commit": os.environ.get("PROJECT_COMMIT", ""),
        "commit_url": commit_url(os.environ.get("PROJECT_REPO_URL", ""), os.environ.get("PROJECT_COMMIT", "")),
        "archive_url": archive_url(os.environ.get("PROJECT_REPO_URL", ""), os.environ.get("PROJECT_COMMIT", "")),
        "dirty": os.environ.get("PROJECT_DIRTY", "false") == "true",
    },
    "scummvm": {
        "repository_url": os.environ.get("SCUMMVM_REPO_URL", ""),
        "commit": os.environ.get("SCUMMVM_COMMIT", ""),
        "commit_url": commit_url(os.environ.get("SCUMMVM_REPO_URL", ""), os.environ.get("SCUMMVM_COMMIT", "")),
        "archive_url": archive_url(os.environ.get("SCUMMVM_REPO_URL", ""), os.environ.get("SCUMMVM_COMMIT", "")),
        "dirty": os.environ.get("SCUMMVM_DIRTY", "false") == "true",
    },
    "local_docs": {
        "gpl_license": bundle_href("doc/COPYING"),
        "scummvm_readme": bundle_href("doc/README.md"),
        "copyright": bundle_href("doc/COPYRIGHT"),
        "game_readmes": [],
    },
}

(dist / "source-info.json").write_text(json.dumps(info, indent=2) + "\n")
PY

"$EMSDK_NODE" "$ROOT_DIR/scripts/create_launcher_metadata.mjs" \
  "$DIST_DIR/scummvm.ini" \
  "$DIST_DIR/game.json" \
  "$DIST_DIR/games.json"

python3 - "$DIST_DIR" <<'PY'
from pathlib import Path
import html
import json
import os
import sys
import urllib.parse

dist = Path(sys.argv[1])
primary_game = json.loads((dist / "game.json").read_text())
library = json.loads((dist / "games.json").read_text())
games = library["games"]
title = primary_game["title"]
target = primary_game["target"]
bundle_count = len(games)


def display_title(value: str) -> str:
    if " (" in value and value.endswith(")"):
        return value.rsplit(" (", 1)[0]
    return value


def link_href(value: str) -> str:
    if value.startswith(("http://", "https://")):
        return value
    return value.lstrip("/")


asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")


def bundle_href(value: str) -> str:
    if value.startswith(("http://", "https://")):
        return value

    normalized = value.lstrip("/")
    separator = "&" if "?" in normalized else "?"
    return f"{normalized}{separator}v={urllib.parse.quote(asset_version, safe='')}"


readme_links = [
    (link_href(game["readmeHref"]), f"{display_title(game['title'])} Readme")
    for game in games
    if game.get("readmeHref")
]
official_scummvm_url = "https://www.scummvm.org/"

source_link_markup = "\n".join(
    f'        <a href="{html.escape(href)}">{html.escape(label)}</a>'
    for href, label in [
        (official_scummvm_url, "Official ScummVM Website"),
        (bundle_href("doc/COPYING"), "GPL-3.0 License"),
        (bundle_href("doc/README.md"), "ScummVM README"),
        (bundle_href("doc/COPYRIGHT"), "ScummVM Copyright"),
        *readme_links,
    ]
)

index_link_markup = "\n".join(
    f'      <a href="{html.escape(href)}">{html.escape(label)}</a>'
    for href, label in [
        (official_scummvm_url, "Official ScummVM Website"),
        (bundle_href("source.html"), "Corresponding Source"),
        (bundle_href("doc/COPYING"), "GPL-3.0 License"),
        *readme_links,
    ]
)

source_html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Source and License Information</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #120d0a;
      --panel: rgba(29, 20, 15, 0.94);
      --ink: #f0e4c0;
      --muted: #c4b18a;
      --accent: #d49754;
      --border: rgba(240, 228, 192, 0.15);
      --warn: rgba(160, 55, 22, 0.45);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at top, rgba(212, 151, 84, 0.18), transparent 36%),
        linear-gradient(180deg, #1a120d 0%, var(--bg) 100%);
      color: var(--ink);
      font: 16px/1.6 Georgia, "Times New Roman", serif;
    }}
    main {{
      width: min(92vw, 880px);
      margin: 0 auto;
      padding: 40px 0 64px;
    }}
    section {{
      margin-top: 20px;
      padding: 24px;
      border: 1px solid var(--border);
      background: var(--panel);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.3);
    }}
    h1, h2 {{
      margin: 0 0 12px;
      line-height: 1.1;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    h1 {{ font-size: clamp(2rem, 5vw, 3.4rem); }}
    h2 {{ font-size: 1.05rem; }}
    p {{
      color: var(--muted);
    }}
    a {{
      color: var(--accent);
    }}
    code {{
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      color: var(--ink);
    }}
    .warning {{
      margin-top: 16px;
      padding: 14px 16px;
      border: 1px solid rgba(244, 167, 94, 0.24);
      background: var(--warn);
      color: var(--ink);
    }}
    .links {{
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      margin-top: 14px;
    }}
    .links a {{
      text-decoration: none;
      border-bottom: 1px solid rgba(212, 151, 84, 0.6);
    }}
    .muted {{
      color: var(--muted);
    }}
  </style>
</head>
<body>
  <main>
    <section>
      <h1>Source and License Information</h1>
      <p>
        This site is not the official ScummVM website or an official ScummVM release. It distributes
        an unofficial browser-targeted WebAssembly build forked from ScummVM together with {bundle_count} installed
        game data set(s), and this page points to the corresponding source and bundled license texts.
      </p>
      <div class="warning">
        Learn more about the original project at
        <a href="{official_scummvm_url}" rel="noreferrer" target="_blank">scummvm.org</a>.
        The links below are provided to respect ScummVM&apos;s GPL licensing terms for redistributed builds.
      </div>
      <div class="links">
{source_link_markup}
      </div>
    </section>

    <section>
      <h2>Project Source</h2>
      <p id="project-summary" class="muted">Loading source metadata...</p>
      <div id="project-links" class="links"></div>
      <div id="project-warning"></div>
    </section>

    <section>
      <h2>Upstream ScummVM Source</h2>
      <p id="scummvm-summary" class="muted">Loading source metadata...</p>
      <div id="scummvm-links" class="links"></div>
      <div id="scummvm-warning"></div>
    </section>

    <section>
      <h2>Build Notes</h2>
      <p class="muted">
        The generated metadata for this bundle is recorded in <code>source-info.json</code>. For an
        exact commit-for-commit source reference, build from a clean committed checkout so the recorded
        revisions match the deployed files.
      </p>
    </section>
  </main>
  <script>
    function renderSection(prefix, entry) {{
      const summary = document.getElementById(prefix + "-summary");
      const links = document.getElementById(prefix + "-links");
      const warning = document.getElementById(prefix + "-warning");

      const commit = entry.commit ? "<code>" + entry.commit + "</code>" : "unavailable";
      summary.innerHTML = "Repository: " + (entry.repository_url ? "<a href=\\"" + entry.repository_url + "\\">" + entry.repository_url + "</a>" : "unavailable") + "<br>Revision: " + commit;

      if (entry.commit_url) {{
        const commitLink = document.createElement("a");
        commitLink.href = entry.commit_url;
        commitLink.textContent = "Browse exact revision";
        links.appendChild(commitLink);
      }}

      if (entry.archive_url) {{
        const archiveLink = document.createElement("a");
        archiveLink.href = entry.archive_url;
        archiveLink.textContent = "Download source archive";
        links.appendChild(archiveLink);
      }}

      if (entry.repository_url) {{
        const repoLink = document.createElement("a");
        repoLink.href = entry.repository_url;
        repoLink.textContent = "Repository home";
        links.appendChild(repoLink);
      }}

      if (entry.dirty) {{
        const notice = document.createElement("div");
        notice.className = "warning";
        notice.textContent = "This build was recorded from a working tree with uncommitted changes. Use the repository links together with the bundled local files if you need the precise source state.";
        warning.appendChild(notice);
      }}
    }}

    fetch("{bundle_href("source-info.json")}")
      .then(function (response) {{ return response.json(); }})
      .then(function (info) {{
        renderSection("project", info.project);
        renderSection("scummvm", info.scummvm);
      }})
      .catch(function () {{
        document.getElementById("project-summary").textContent = "Source metadata is unavailable.";
        document.getElementById("scummvm-summary").textContent = "Source metadata is unavailable.";
      }});
  </script>
</body>
</html>
"""

index_html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #0f0c09;
      --panel: #231812;
      --ink: #f0e4c0;
      --accent: #cc6600;
      --muted: #bda978;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at top, rgba(204, 102, 0, 0.18), transparent 34%),
        linear-gradient(180deg, #19120d 0%, var(--bg) 100%);
      color: var(--ink);
      font: 16px/1.5 Georgia, "Times New Roman", serif;
    }}
    main {{
      width: min(92vw, 760px);
      padding: 32px;
      border: 1px solid rgba(240, 228, 192, 0.15);
      background: linear-gradient(180deg, rgba(35, 24, 18, 0.92), rgba(18, 12, 9, 0.96));
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.42);
    }}
    h1 {{
      margin: 0 0 12px;
      font-size: clamp(2rem, 5vw, 3.6rem);
      line-height: 1;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }}
    p {{
      margin: 0 0 20px;
      color: var(--muted);
      max-width: 58ch;
    }}
    .warning {{
      margin: 0 0 20px;
      padding: 14px 16px;
      border: 1px solid rgba(240, 228, 192, 0.15);
      background: rgba(82, 49, 21, 0.48);
      color: var(--ink);
    }}
    a {{
      display: inline-block;
      padding: 14px 20px;
      color: #111;
      text-decoration: none;
      font-weight: 700;
      background: linear-gradient(180deg, #f0e4c0, #c79a58);
      border: 1px solid rgba(255,255,255,0.15);
    }}
    .note {{
      margin-top: 16px;
      font-size: 0.92rem;
    }}
    .meta-links {{
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      margin-top: 24px;
    }}
    .meta-links a {{
      padding: 0;
      color: var(--ink);
      background: none;
      border: 0;
      font-weight: 400;
      border-bottom: 1px solid rgba(240, 228, 192, 0.28);
    }}
  </style>
</head>
<body>
  <main>
    <h1>{html.escape(display_title(title))}</h1>
    <p>
      This bundle exposes {bundle_count} detected ScummVM target(s). Use the launcher below if the
      game does not start automatically after the page loads.
    </p>
    <p class="warning">
      This is not the official ScummVM website or an official ScummVM release. It is an
      unofficial WebAssembly build forked from ScummVM for browser deployment, and it links
      corresponding source and license material here to respect ScummVM's GPL terms.
    </p>
    <a id="play-link" href="{html.escape(bundle_href('scummvm.html'))}#{html.escape(target)}">Launch Game</a>
    <p class="note">Primary ScummVM target: <code>{html.escape(target)}</code></p>
    <div class="meta-links">
{index_link_markup}
    </div>
  </main>
  <script>
    window.addEventListener("load", function () {{
      window.setTimeout(function () {{
        location.href = document.getElementById("play-link").href;
      }}, 200);
    }});
  </script>
</body>
</html>
"""

manifest = json.loads((dist / "manifest.json").read_text())
manifest["icons"] = [
    {
        **icon,
        "src": bundle_href(icon["src"]),
    }
    for icon in manifest.get("icons", [])
]
manifest["short_name"] = "ScummVM Web"
manifest["name"] = "ScummVM Web"
manifest["description"] = "Unofficial browser-targeted WebAssembly build forked from ScummVM."
manifest["start_url"] = bundle_href("scummvm.html")

(dist / "manifest.json").write_text(json.dumps(manifest, indent=4) + "\n")

(dist / "source.html").write_text(source_html)
(dist / "index.html").write_text(index_html)
PY

python3 "$ROOT_DIR/scripts/generate_logo_assets.py" \
  --source "$ROOT_DIR/branding/scummvm-logo-master.png" \
  --out-dir "$DIST_DIR"

python3 - "$DIST_DIR/scummvm_fs.js" <<'PY'
import os
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
games_origin = os.environ.get("SCUMMVM_GAMES_ORIGIN", "https://scummvm-games.tsilva.eu").rstrip("/")

prefix = f"""const PRODUCTION_GAMES_ORIGIN = {games_origin!r};\n\nfunction getScummvmAssetVersion() {{\n    const search = globalThis.location?.search || \"\";\n    const searchVersion = new URLSearchParams(search).get(\"v\");\n    if (searchVersion) {{\n        return searchVersion;\n    }}\n\n    const pathname = globalThis.location?.pathname || \"\";\n    const match = pathname.match(/\\/scummvm\\/([^/]+)\\//);\n    return match ? decodeURIComponent(match[1]) : \"\";\n}}\n\nfunction withCacheKey(url, cacheKey) {{\n    if (!cacheKey) {{\n        return url;\n    }}\n\n    const resolved = new URL(url, globalThis.location?.href || \"http://localhost\");\n    resolved.searchParams.set(\"v\", cacheKey);\n    return resolved.toString();\n}}\n\nfunction buildRemoteUrl(baseUrl, remotePath) {{\n    const resolved = new URL(baseUrl, globalThis.location?.href || \"http://localhost\");\n    const normalizedPath = remotePath.startsWith(\"/\") ? remotePath : `/${{remotePath}}`;\n    resolved.pathname = `${{resolved.pathname.replace(/\\/$/, \"\")}}${{normalizedPath}}`;\n    return withCacheKey(resolved.toString(), getScummvmAssetVersion());\n}}\n\nfunction getDefaultRemoteFilesystems() {{\n    const hostname = globalThis.location?.hostname || \"\";\n    const useLocalProxy = hostname === \"localhost\" || hostname === \"127.0.0.1\";\n\n    if (useLocalProxy) {{\n        return {{\n            games: \"/games-proxy\"\n        }};\n    }}\n\n    return {{\n        games: withCacheKey(PRODUCTION_GAMES_ORIGIN, getScummvmAssetVersion())\n    }};\n}}\n\nfunction resolveFilesystemUrl(url) {{\n    if (/^[a-z]+:\\/\\//i.test(url)) {{\n        return url.replace(/\\/$/, \"\");\n    }}\n\n    const configured = globalThis.SCUMMVM_FILESYSTEM_BASES?.[url] || getDefaultRemoteFilesystems()[url];\n    if (configured) {{\n        return configured.replace(/\\/$/, \"\");\n    }}\n\n    return url;\n}}\n\n"""
needle = "const DEBUG = false\n\n\nexport class ScummvmFS {"
replacement = "const DEBUG = false\n\n\n" + prefix + "export class ScummvmFS {"

if prefix not in text and needle in text:
    text = text.replace(needle, replacement, 1)

text = text.replace("        this.url = _url\n", "        this.url = resolveFilesystemUrl(_url)\n", 1)
text = text.replace('        req.open("GET", _url + "/index.json", false);\n', '        req.open("GET", buildRemoteUrl(this.url, "/index.json"), false);\n', 1)
text = text.replace("        const url = _url + path;\n", "        const url = buildRemoteUrl(_url, path);\n", 1)

path.write_text(text)
PY

python3 - "$DIST_DIR/scummvm.html" <<'PY'
import os
from pathlib import Path
import sys

path = Path(sys.argv[1])
html_text = path.read_text()
updated_html = html_text.replace("<title>ScummVM</title>", "<title>ScummVM Web</title>", 1)
asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")
redirect_script = """<script>(function(){const exitTo=new URLSearchParams(window.location.search).get("exitTo");if(!exitTo)return;const resolvedExitHref=(()=>{try{const resolvedUrl=new URL(exitTo,window.location.href);return resolvedUrl.origin===window.location.origin?`${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`:"/"}catch{return "/"}})();let didHandleExit=false;let hasUserInteracted=false;const markUserInteraction=()=>{hasUserInteracted=true};for(const eventName of["mousedown","touchstart"]){window.addEventListener(eventName,markUserInteraction,{capture:true,passive:true})}const canvas=document.getElementById("canvas");if(canvas){const visibleCursorClass="scummvm-browser-cursor-visible";const cursorStyle=document.createElement("style");cursorStyle.textContent=`#canvas.${visibleCursorClass}{cursor:default!important}`;document.head.appendChild(cursorStyle);const showBrowserCursor=()=>{canvas.classList.add(visibleCursorClass)};const allowGameCursor=()=>{canvas.classList.remove(visibleCursorClass)};for(const eventName of["mouseenter","pointerenter","mouseleave"]){canvas.addEventListener(eventName,showBrowserCursor,{passive:true})}for(const eventName of["mousedown","touchstart"]){canvas.addEventListener(eventName,allowGameCursor,{capture:true,passive:true})}showBrowserCursor()}const handleExit=status=>{if(didHandleExit)return;didHandleExit=true;const exitMessage={type:"scummvm-exit",href:resolvedExitHref,status};if(window.parent&&window.parent!==window){try{window.parent.postMessage(exitMessage,window.location.origin);return}catch{}}try{window.location.replace(resolvedExitHref)}catch{window.location.href=resolvedExitHref}};window.Module=window.Module||{};const originalQuit=window.Module.quit;window.Module.quit=function(status,toThrow){if(hasUserInteracted){handleExit(status)}if(typeof originalQuit==="function"){return originalQuit(status,toThrow)}throw toThrow||new Error(`ScummVM exited (${status})`)}})();</script>"""
module_loader = """<script type=module>(function(){const v=new URLSearchParams(window.location.search).get("v");const moduleUrl=v?`./scummvm_fs.js?v=${encodeURIComponent(v)}`:"./scummvm_fs.js";window.ScummvmFSReady=import(moduleUrl).then(({ScummvmFS})=>{window.ScummvmFS=ScummvmFS})})();</script>"""
script_tag = "<script src=scummvm.js async></script>"
versioned_scummvm_loader = """<script>(function(){const v=new URLSearchParams(window.location.search).get("v");window.Module=window.Module||{};const originalLocateFile=window.Module.locateFile;window.Module.locateFile=function(path,prefix){const raw=typeof originalLocateFile=="function"?originalLocateFile(path,prefix):`${prefix||""}${path}`;if(!v)return raw;const resolved=new URL(raw,window.location.href);resolved.searchParams.set("v",v);return resolved.toString()};const script=document.createElement("script");script.async=true;script.src=v?`scummvm.js?v=${encodeURIComponent(v)}`:"scummvm.js";document.body.appendChild(script)})();</script>"""

updated_html = updated_html.replace(
    '<script type=module>import{ScummvmFS}from"./scummvm_fs.js";window.ScummvmFS=ScummvmFS</script>',
    module_loader,
    1,
)
updated_html = updated_html.replace(
    '<link href=manifest.json rel=manifest>',
    f'<link href=manifest.json?v={asset_version} rel=manifest>',
    1,
)
updated_html = updated_html.replace(
    '<link href=scummvm-192.png rel=apple-touch-icon>',
    f'<link href=scummvm-192.png?v={asset_version} rel=apple-touch-icon>',
    1,
)
updated_html = updated_html.replace(
    'background:url("logo.svg");',
    f'background:url("logo.svg?v={asset_version}");',
    1,
)
updated_html = updated_html.replace(
    'fetch("scummvm.ini")',
    'fetch((()=>{const e=new URL("scummvm.ini",window.location.href),t=new URLSearchParams(window.location.search).get("v");return t&&e.searchParams.set("v",t),e.toString()})())',
    1,
)
updated_html = updated_html.replace(
    'function setupFilesystem(){addRunDependency("scummvm-fs-setup"),setupLocalFilesystem().then((()=>{setupHTTPFilesystem("games"),setupHTTPFilesystem("data"),removeRunDependency("scummvm-fs-setup")}))}',
    'function setupFilesystem(){addRunDependency("scummvm-fs-setup"),Promise.all([window.ScummvmFSReady||Promise.resolve(),setupLocalFilesystem()]).then((()=>{setupHTTPFilesystem("games"),setupHTTPFilesystem("data"),removeRunDependency("scummvm-fs-setup")}))}',
    1,
)

if redirect_script not in updated_html and script_tag in updated_html:
    updated_html = updated_html.replace(script_tag, f"{redirect_script}{versioned_scummvm_loader}", 1)
else:
    updated_html = updated_html.replace(script_tag, versioned_scummvm_loader, 1)

if updated_html != html_text:
    path.write_text(updated_html)
PY

mkdir -p "$PUBLIC_DIR"
for managed_path in "${MANAGED_PUBLIC_PATHS[@]}"; do
  rm -rf "$PUBLIC_DIR/$managed_path"
done
for managed_path in "${MANAGED_PUBLIC_PATHS[@]}"; do
  if [[ -e "$DIST_DIR/$managed_path" ]]; then
    cp -R "$DIST_DIR/$managed_path" "$PUBLIC_DIR/$managed_path"
  fi
done

echo "Built site in $DIST_DIR and synced deploy assets to $PUBLIC_DIR"
