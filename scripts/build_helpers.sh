#!/usr/bin/env bash

set -euo pipefail

HELPERS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

find_optional_archive() {
  local downloads_dir="$1"
  shift

  local pattern
  local matches=()

  for pattern in "$@"; do
    matches=("$downloads_dir"/$pattern)
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

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/scummweb-game.XXXXXX")"
  unzip -q -o "$archive_path" -d "$temp_dir"
  python3 "$HELPERS_DIR/normalize_game_archive.py" "$temp_dir" "$target_dir"
  rm -rf "$temp_dir"
}

overlay_game_archive_into_dir() {
  local archive_path="$1"
  local target_dir="$2"
  local source_subdir="${3:-}"
  local temp_dir

  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/scummweb-overlay.XXXXXX")"
  unzip -q -o "$archive_path" -d "$temp_dir"
  python3 "$HELPERS_DIR/overlay_game_archive.py" "$temp_dir" "$target_dir" "$source_subdir"
  rm -rf "$temp_dir"
}
