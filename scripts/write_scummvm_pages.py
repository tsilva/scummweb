#!/usr/bin/env python3

from pathlib import Path
import html
import json
import os
import sys
import urllib.parse

dist = Path(sys.argv[1])
library = json.loads((dist / "games.json").read_text())
games = library["games"]
primary_target = library.get("primaryTarget")
primary_game = next((game for game in games if game.get("target") == primary_target), games[0])
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
  </style>
</head>
<body>
  <main>
    <h1>{html.escape(display_title(title))}</h1>
    <p>
      This bundle exposes {bundle_count} detected ScummVM target(s). Use the launcher below if the
      game does not start automatically after the page loads.
    </p>
    <a id="play-link" href="{html.escape(bundle_href('scummvm.html'))}#{html.escape(target)}">Launch Game</a>
    <p class="note">Primary ScummVM target: <code>{html.escape(target)}</code></p>
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
manifest["short_name"] = "scummweb"
manifest["name"] = "scummweb"
manifest["description"] = "Unofficial browser-targeted WebAssembly build forked from ScummVM."
manifest["start_url"] = "/"
manifest["background_color"] = "#1a4d1a"
manifest["theme_color"] = "#1a4d1a"

(dist / "manifest.json").write_text(json.dumps(manifest, indent=4) + "\n")
(dist / "index.html").write_text(index_html)
