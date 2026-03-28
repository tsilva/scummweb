#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor"
SCUMMVM_DIR="$VENDOR_DIR/scummvm"
DIST_DIR="$ROOT_DIR/dist"
PUBLIC_DIR="$ROOT_DIR/public"
DOWNLOADS_DIR="$ROOT_DIR/downloads"
BASS_ZIP="$DOWNLOADS_DIR/bass-cd-1.2.zip"
DEFAULT_EMSDK_VERSION="$(sed -n 's/^EMSDK_VERSION=\"\\([^\"]*\\)\"/\\1/p' "$SCUMMVM_DIR/dists/emscripten/build.sh" 2>/dev/null | head -n 1)"
EMSDK_VERSION="${EMSDK_VERSION:-${DEFAULT_EMSDK_VERSION:-3.1.51}}"
EMSDK_DIR="$SCUMMVM_DIR/dists/emscripten/emsdk-$EMSDK_VERSION"

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

DREAMWEB_ZIP="$(find_optional_archive 'dreamweb*.zip' 'DreamWeb*.zip' 'DREAMWEB*.zip' || true)"
GAME_ARCHIVES=("$BASS_ZIP")
MANAGED_PUBLIC_PATHS=(
  data
  doc
  favicon.ico
  focus-overlay.js
  game.json
  games.json
  index.html
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
  --enable-engine=dreamweb \
  --disable-seq-midi \
  --disable-timidity

source "$EMSDK_DIR/emsdk_env.sh"
EMSDK_NPM="$(dirname "$EMSDK_NODE")/npm"

mkdir -p build-emscripten/games
rm -rf build-emscripten/games/*
for game_archive in "${GAME_ARCHIVES[@]}"; do
  unzip -q -o "$game_archive" -d build-emscripten/games
done
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
        "gpl_license": "doc/COPYING",
        "scummvm_readme": "doc/README.md",
        "copyright": "doc/COPYRIGHT",
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
import sys

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


readme_links = [
    (link_href(game["readmeHref"]), f"{display_title(game['title'])} Readme")
    for game in games
    if game.get("readmeHref")
]

source_link_markup = "\n".join(
    f'        <a href="{html.escape(href)}">{html.escape(label)}</a>'
    for href, label in [("doc/COPYING", "GPL-3.0 License"), ("doc/README.md", "ScummVM README"), ("doc/COPYRIGHT", "ScummVM Copyright"), *readme_links]
)

index_link_markup = "\n".join(
    f'      <a href="{html.escape(href)}">{html.escape(label)}</a>'
    for href, label in [("source.html", "Corresponding Source"), ("doc/COPYING", "GPL-3.0 License"), *readme_links]
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
        This web bundle distributes a ScummVM browser build together with {bundle_count} installed
        game data set(s). This page points to the corresponding source and the bundled license texts.
      </p>
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

    fetch("source-info.json", {{ cache: "no-store" }})
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
    <a id="play-link" href="scummvm.html#{html.escape(target)}">Launch Game</a>
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

(dist / "source.html").write_text(source_html)
(dist / "index.html").write_text(index_html)
PY

python3 - "$DIST_DIR/scummvm_fs.js" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

prefix = """const DEFAULT_REMOTE_FILESYSTEMS = {\n    games: \"/_games\"\n};\n\nfunction resolveFilesystemUrl(url) {\n    if (/^[a-z]+:\\/\\//i.test(url)) {\n        return url.replace(/\\/$/, \"\");\n    }\n\n    const configured = globalThis.SCUMMVM_FILESYSTEM_BASES?.[url] || DEFAULT_REMOTE_FILESYSTEMS[url];\n    if (configured) {\n        return configured.replace(/\\/$/, \"\");\n    }\n\n    return url;\n}\n\n"""
needle = "const DEBUG = false\n\n\nexport class ScummvmFS {"
replacement = "const DEBUG = false\n\n\n" + prefix + "export class ScummvmFS {"

if prefix not in text and needle in text:
    text = text.replace(needle, replacement, 1)

text = text.replace("        this.url = _url\n", "        this.url = resolveFilesystemUrl(_url)\n", 1)
text = text.replace('        req.open("GET", _url + "/index.json", false);\n', '        req.open("GET", this.url + "/index.json", false);\n', 1)

path.write_text(text)
PY

python3 - "$DIST_DIR/scummvm.html" "$DIST_DIR/games.json" <<'PY'
from pathlib import Path
import html
import json
import sys

path = Path(sys.argv[1])
games = json.loads(Path(sys.argv[2]).read_text())["games"]
html_text = path.read_text()
readme_links = "".join(
    f'<a href="{html.escape(game["readmeHref"].lstrip("/"))}">{html.escape(game["title"])} Readme</a>'
    for game in games
    if game.get("readmeHref")
)
injection = """<style>
#compliance-panel{position:fixed;left:12px;bottom:12px;z-index:5;max-width:min(92vw,520px);padding:10px 12px;border:1px solid rgba(240,228,192,.18);background:rgba(20,14,11,.9);color:#f0e4c0;font:14px/1.4 Georgia,"Times New Roman",serif;box-shadow:0 12px 36px rgba(0,0,0,.35)}
#compliance-panel a{color:#f0e4c0;text-decoration:none;border-bottom:1px solid rgba(240,228,192,.3)}
#compliance-panel-links{display:flex;flex-wrap:wrap;gap:10px 14px;margin-top:6px}
@media (max-width:700px){#compliance-panel{left:8px;right:8px;bottom:8px;max-width:none;font-size:13px}}
</style><script>(function(){var panel=document.createElement("aside");panel.id="compliance-panel";panel.innerHTML='ScummVM is distributed here under the GPL.<div id="compliance-panel-links"><a href="source.html">Corresponding Source</a><a href="doc/COPYING">GPL-3.0 License</a>""" + readme_links + """</div>';document.body.appendChild(panel)}());</script>"""

if injection not in html_text:
    html_text = html_text.replace("</body></html>", injection + "</body></html>")
    path.write_text(html_text)
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
