#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"
SCUMMVM_DIR="$VENDOR_DIR/scummvm"
DIST_DIR="$ROOT_DIR/dist"
PUBLIC_DIR="$ROOT_DIR/public"
GAME_ZIP="$ROOT_DIR/downloads/bass-cd-1.2.zip"
GAME_DIR_NAME="bass-cd-1.2"
DEFAULT_EMSDK_VERSION="$(sed -n 's/^EMSDK_VERSION=\"\\([^\"]*\\)\"/\\1/p' "$SCUMMVM_DIR/dists/emscripten/build.sh" 2>/dev/null | head -n 1)"
EMSDK_VERSION="${EMSDK_VERSION:-${DEFAULT_EMSDK_VERSION:-3.1.51}}"
EMSDK_DIR="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION"

if [[ ! -f "$GAME_ZIP" ]]; then
  echo "Missing game archive: $GAME_ZIP" >&2
  exit 1
fi

mkdir -p "$VENDOR_DIR"

if [[ ! -d "$SCUMMVM_DIR/.git" ]]; then
  git clone --depth 1 --branch v2.9.1 https://github.com/scummvm/scummvm.git "$SCUMMVM_DIR"
fi

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

cd "$SCUMMVM_DIR"

./dists/emscripten/build.sh setup configure make dist \
  --disable-all-engines \
  --enable-engine=sky \
  --disable-seq-midi \
  --disable-timidity

source "$EMSDK_DIR/emsdk_env.sh"
EMSDK_NPM="$(dirname "$EMSDK_NODE")/npm"

mkdir -p build-emscripten/games
rm -rf "build-emscripten/games/$GAME_DIR_NAME"
unzip -q -o "$GAME_ZIP" -d build-emscripten/games
"$EMSDK_NODE" dists/emscripten/build-make_http_index.js build-emscripten/games

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

mkdir -p "$DIST_DIR"
rm -rf "$DIST_DIR"
cp -R "$SCUMMVM_DIR/build-emscripten" "$DIST_DIR"

"$EMSDK_NODE" "$ROOT_DIR/scripts/create_launcher_metadata.mjs" \
  "$DIST_DIR/scummvm.ini" \
  "$DIST_DIR/game.json"

python3 - "$DIST_DIR" <<'PY'
from pathlib import Path
import json
import sys

dist = Path(sys.argv[1])
meta = json.loads((dist / "game.json").read_text())
title = meta["title"]
target = meta["target"]

html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
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
  </style>
</head>
<body>
  <main>
    <h1>Beneath a Steel Sky</h1>
    <p>
      This bundle runs the CD version in ScummVM's browser target. Use the launcher
      below if the game does not start automatically after the page loads.
    </p>
    <a id="play-link" href="scummvm.html#{target}">Launch Game</a>
    <p class="note">ScummVM target: <code>{target}</code></p>
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

(dist / "index.html").write_text(html)
PY

rm -rf "$PUBLIC_DIR"
cp -R "$DIST_DIR" "$PUBLIC_DIR"
rm -f "$PUBLIC_DIR/index.html"

echo "Built site in $DIST_DIR and synced deploy assets to $PUBLIC_DIR"
