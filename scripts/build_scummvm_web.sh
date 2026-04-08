#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"
SCUMMVM_DIR="$VENDOR_DIR/scummvm"
DIST_DIR="$ROOT_DIR/dist"
SHELL_DIR="$ROOT_DIR/scummvm-shell"
DOWNLOADS_DIR="$ROOT_DIR/downloads"
BASS_ZIP="$DOWNLOADS_DIR/bass-cd-1.2.zip"
QUEEN_ORIGINAL_ARCHIVE="$DOWNLOADS_DIR/FOTAQ_Talkie-original.zip"
QUEEN_ORIGINAL_ARCHIVE_URL="https://downloads.scummvm.org/frs/extras/Flight%20of%20the%20Amazon%20Queen/FOTAQ_Talkie-original.zip"
SCUMMVM_BUNDLE_ASSET_VERSION_RAW="${SCUMMVM_ASSET_VERSION:-${VERCEL_DEPLOYMENT_ID:-${VERCEL_URL:-${VERCEL_GIT_COMMIT_SHA:-dev}}}}"
SCUMMVM_BUNDLE_ASSET_VERSION="${SCUMMVM_BUNDLE_ASSET_VERSION_RAW//[^a-zA-Z0-9._-]/-}"
export SCUMMVM_BUNDLE_ASSET_VERSION

EMSDK_VERSION=""
EMSDK_DIR=""
EMSDK_NODE=""
EMSCRIPTEN_LIBS_BUILD_DIR=""

shopt -s nullglob
source "$ROOT_DIR/scripts/build_helpers.sh"

GAME_ARCHIVES=("$BASS_ZIP")

log_stage() {
  printf '\n==> %s\n' "$1"
}

archive_contains_path() {
  local archive_path="$1"
  local archive_member="$2"

  unzip -Z1 "$archive_path" | grep -Fxq "$archive_member"
}

resolve_queen_archive() {
  local queen_zip

  queen_zip="$(
    find_optional_archive "$DOWNLOADS_DIR" \
      'FOTAQ_Talkie-original.zip' \
      'fotaq_talkie-original.zip' \
      'FOTAQ*original*.zip' \
      'fotaq*original*.zip' \
      'Flight*Amazon*Queen*original*.zip' \
      'flight*amazon*queen*original*.zip' || true
  )"
  if [[ -n "$queen_zip" ]]; then
    printf '%s\n' "$queen_zip"
    return 0
  fi

  queen_zip="$(
    find_optional_archive "$DOWNLOADS_DIR" \
      'FOTAQ*.zip' \
      'fotaq*.zip' \
      'Flight*Amazon*Queen*.zip' \
      'flight*amazon*queen*.zip' || true
  )"
  if [[ -z "$queen_zip" ]]; then
    return 1
  fi

  if archive_contains_path "$queen_zip" 'queen.1c'; then
    echo "Queen archive $queen_zip contains compressed queen.1c data; downloading the original talkie package with uncompressed speech from ScummVM." >&2
    curl -L --fail "$QUEEN_ORIGINAL_ARCHIVE_URL" -o "$QUEEN_ORIGINAL_ARCHIVE"
    printf '%s\n' "$QUEEN_ORIGINAL_ARCHIVE"
    return 0
  fi

  printf '%s\n' "$queen_zip"
}

discover_game_archives() {
  local dreamweb_zip queen_zip lure_zip drascula_zip drascula_audio_zip sword25_zip nippon_amiga_zip

  if [[ ! -f "$BASS_ZIP" ]]; then
    echo "Missing game archive: $BASS_ZIP" >&2
    exit 1
  fi

  dreamweb_zip="$(find_optional_archive "$DOWNLOADS_DIR" 'dreamweb*.zip' 'DreamWeb*.zip' 'DREAMWEB*.zip' || true)"
  queen_zip="$(resolve_queen_archive || true)"
  lure_zip="$(find_optional_archive "$DOWNLOADS_DIR" 'lure*.zip' 'Lure*.zip' 'LURE*.zip' || true)"
  drascula_zip="$(find_optional_archive "$DOWNLOADS_DIR" 'drascula*.zip' 'Drascula*.zip' 'DRASCULA*.zip' || true)"
  drascula_audio_zip="$(
    find_optional_archive "$DOWNLOADS_DIR" \
      'drascula-audio-2.0.zip' \
      'Drascula-audio-2.0.zip' \
      'DRASCULA-AUDIO-2.0.zip' \
      'drascula-audio-*.zip' \
      'Drascula-audio-*.zip' \
      'DRASCULA-AUDIO-*.zip' || true
  )"
  sword25_zip="$(find_optional_archive "$DOWNLOADS_DIR" 'sword25*.zip' 'Sword25*.zip' 'SWORD25*.zip' || true)"
  nippon_amiga_zip="$(find_optional_archive "$DOWNLOADS_DIR" 'nippon-amiga*.zip' 'Nippon-amiga*.zip' 'NIPPON-AMIGA*.zip' 'nippon*amiga*.zip' 'Nippon*Amiga*.zip' || true)"

  GAME_ARCHIVES=("$BASS_ZIP")
  DRASCULA_AUDIO_ZIP="$drascula_audio_zip"

  if [[ -n "$dreamweb_zip" ]]; then
    GAME_ARCHIVES+=("$dreamweb_zip")
  else
    echo "DreamWeb archive not found in $DOWNLOADS_DIR; building with BASS data only." >&2
  fi

  if [[ -n "$queen_zip" ]]; then
    GAME_ARCHIVES+=("$queen_zip")
  else
    echo "Flight of the Amazon Queen archive not found in $DOWNLOADS_DIR; building without Queen." >&2
  fi

  if [[ -n "$lure_zip" ]]; then
    GAME_ARCHIVES+=("$lure_zip")
  else
    echo "Lure of the Temptress archive not found in $DOWNLOADS_DIR; building without Lure." >&2
  fi

  if [[ -n "$drascula_zip" ]]; then
    GAME_ARCHIVES+=("$drascula_zip")
  else
    echo "Drascula archive not found in $DOWNLOADS_DIR; building without Drascula." >&2
  fi

  if [[ -n "$drascula_zip" && -z "$DRASCULA_AUDIO_ZIP" ]]; then
    echo "Drascula music addon not found in $DOWNLOADS_DIR; packaging Drascula without extracted CD audio." >&2
  fi

  if [[ -n "$sword25_zip" ]]; then
    GAME_ARCHIVES+=("$sword25_zip")
  else
    echo "Broken Sword 2.5 archive not found in $DOWNLOADS_DIR; building without Sword25." >&2
  fi

  if [[ -n "$nippon_amiga_zip" ]]; then
    GAME_ARCHIVES+=("$nippon_amiga_zip")
  else
    echo "Nippon Safes Amiga archive not found in $DOWNLOADS_DIR; building without Nippon Safes." >&2
  fi
}

bootstrap_scummvm_checkout() {
  mkdir -p "$VENDOR_DIR"

  if [[ ! -d "$SCUMMVM_DIR/.git" ]]; then
    git clone --depth 1 --branch v2.9.1 https://github.com/scummvm/scummvm.git "$SCUMMVM_DIR"
  fi

  python3 "$ROOT_DIR/scripts/patch_sword25_detection.py" \
    "$SCUMMVM_DIR/engines/sword25/detection_tables.h"
  python3 "$ROOT_DIR/scripts/patch_scummvm_queen_dialogue.py" \
    "$SCUMMVM_DIR/engines/queen/talk.cpp"
  python3 "$ROOT_DIR/scripts/patch_scummvm_lure_menu.py" \
    "$SCUMMVM_DIR/engines/lure/menu.cpp"
}

bootstrap_toolchain() {
  local default_emsdk_version

  default_emsdk_version="$(sed -n 's/^EMSDK_VERSION=\"\\([^\"]*\\)\"/\\1/p' "$SCUMMVM_DIR/dists/emscripten/build.sh" | head -n 1)"
  EMSDK_VERSION="${EMSDK_VERSION:-${default_emsdk_version:-3.1.51}}"
  EMSDK_DIR="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION"
  EMSCRIPTEN_LIBS_BUILD_DIR="$SCUMMVM_DIR/dists/emscripten/libs/build"

  if [[ ! -d "$EMSDK_DIR" ]]; then
    local tmp_archive
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
  # shellcheck disable=SC1090
  source "$EMSDK_DIR/emsdk_env.sh"
}

prepare_codec_prefix() {
  local sysroot_dir vorbis_source_dir vorbis_build_dir

  # shellcheck disable=SC1090
  source "$EMSDK_DIR/emsdk_env.sh"
  sysroot_dir="$EMSDK_DIR/upstream/emscripten/cache/sysroot"
  vorbis_source_dir="$EMSDK_DIR/upstream/emscripten/cache/ports/vorbis/Vorbis-version_1"
  vorbis_build_dir="/tmp/scummweb-vorbis-build"

  cat > /tmp/scummweb-port-png.c <<'EOF'
#include <png.h>
int main(void) { return 0; }
EOF
  emcc /tmp/scummweb-port-png.c -s USE_LIBPNG=1 -o /tmp/scummweb-port-png.js >/dev/null

  cat > /tmp/scummweb-port-vorbis.c <<'EOF'
#include <ogg/ogg.h>
#include <vorbis/codec.h>
int main(void) { return 0; }
EOF
  emcc /tmp/scummweb-port-vorbis.c -s USE_OGG=1 -s USE_VORBIS=1 -o /tmp/scummweb-port-vorbis.js >/dev/null

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
}

build_scummvm_web_target() {
  local sword25_config_args=(
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

  cd "$SCUMMVM_DIR"
  ./dists/emscripten/build.sh setup configure make dist \
    --disable-all-engines \
    --enable-engine=sky \
    --enable-engine=dreamweb \
    --enable-engine=queen \
    --enable-engine=lure \
    --enable-engine=drascula \
    --enable-engine=parallaction \
    --enable-engine=sword25 \
    "${sword25_config_args[@]}" \
    --disable-seq-midi \
    --disable-timidity
}

game_archive_target_dir() {
  local archive_name_lower="$1"

  case "$archive_name_lower" in
    bass-cd-1.2.zip)
      printf 'sky\n'
      ;;
    dreamweb*.zip)
      printf 'dreamweb\n'
      ;;
    fotaq*.zip|flight*amazon*queen*.zip)
      printf 'queen\n'
      ;;
    lure*.zip)
      printf 'lure\n'
      ;;
    drascula*.zip)
      printf 'drascula\n'
      ;;
    nippon*amiga*.zip)
      printf 'nippon\n'
      ;;
    sword25*.zip)
      printf 'sword25\n'
      ;;
    *)
      return 1
      ;;
  esac
}

install_game_archives() {
  local game_archive archive_name archive_name_lower target_game_id target_dir

  # shellcheck disable=SC1090
  source "$EMSDK_DIR/emsdk_env.sh"
  cd "$SCUMMVM_DIR"
  mkdir -p build-emscripten/games
  rm -rf build-emscripten/games/*

  for game_archive in "${GAME_ARCHIVES[@]}"; do
    archive_name="$(basename "$game_archive")"
    archive_name_lower="$(printf '%s' "$archive_name" | tr '[:upper:]' '[:lower:]')"
    target_game_id="$(game_archive_target_dir "$archive_name_lower")" || {
      echo "Unsupported game archive layout for $archive_name" >&2
      exit 1
    }

    target_dir="build-emscripten/games/$target_game_id"
    rm -rf "$target_dir"
    extract_game_archive_into_game_id_dir "$game_archive" "$target_dir"

    if [[ "$target_game_id" == "drascula" && -n "${DRASCULA_AUDIO_ZIP:-}" ]]; then
      overlay_game_archive_into_dir "$DRASCULA_AUDIO_ZIP" "$target_dir/audio" "audio"
    fi
  done

  "$EMSDK_NODE" "$SCUMMVM_DIR/dists/emscripten/build-make_http_index.js" "$SCUMMVM_DIR/build-emscripten/games"
}

ensure_repo_dependencies() {
  local pnpm_bin

  pnpm_bin="${PNPM_BIN:-$(command -v pnpm || true)}"
  if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
    if [[ -z "$pnpm_bin" ]]; then
      echo "Missing pnpm. Install pnpm to prepare repo dependencies." >&2
      exit 1
    fi
    "$pnpm_bin" install
  fi
}

generate_detected_config() {
  local server_pid

  mkdir -p "$ROOT_DIR/artifacts"
  python3 -m http.server 8000 --bind 127.0.0.1 --directory "$SCUMMVM_DIR/build-emscripten" >/tmp/scummweb-build-server.log 2>&1 &
  server_pid=$!
  trap 'kill "$server_pid" 2>/dev/null || true' RETURN

  "$EMSDK_NODE" "$ROOT_DIR/scripts/generate_game_config.mjs" \
    "$SCUMMVM_DIR/build-emscripten" \
    "http://127.0.0.1:8000/scummvm.html#--add --path=/games --recursive"

  python3 "$ROOT_DIR/scripts/normalize_scummvm_shell.py" \
    "$SCUMMVM_DIR/build-emscripten/scummvm.ini" \
    "$SCUMMVM_DIR/build-emscripten/games" \
    "$SCUMMVM_DIR/build-emscripten/games/sword25/data.b25c"

  "$EMSDK_NODE" "$SCUMMVM_DIR/dists/emscripten/build-make_http_index.js" "$SCUMMVM_DIR/build-emscripten/games"
  trap - RETURN
  kill "$server_pid" 2>/dev/null || true
}

stage_dist_workspace() {
  rm -rf "$DIST_DIR"
  cp -R "$SCUMMVM_DIR/build-emscripten" "$DIST_DIR"
}

finalize_dist_workspace() {
  "$ROOT_DIR/scripts/finalize_scummvm_dist.sh" \
    "$SCUMMVM_DIR" \
    "$DIST_DIR" \
    "$SHELL_DIR" \
    "$EMSDK_NODE"
}

main() {
  log_stage "Discover game archives"
  discover_game_archives

  log_stage "Bootstrap ScummVM checkout"
  bootstrap_scummvm_checkout

  log_stage "Bootstrap toolchain"
  bootstrap_toolchain

  log_stage "Prepare codec prefix"
  prepare_codec_prefix

  log_stage "Build ScummVM web target"
  build_scummvm_web_target

  log_stage "Install game archives"
  install_game_archives

  log_stage "Generate detected game config"
  ensure_repo_dependencies
  generate_detected_config

  log_stage "Stage dist workspace"
  stage_dist_workspace

  log_stage "Finalize dist shell"
  finalize_dist_workspace

  echo "Built site in $DIST_DIR and synced managed shell assets to $SHELL_DIR"
}

main "$@"
