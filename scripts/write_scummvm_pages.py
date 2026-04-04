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


readme_links = [
    (link_href(game["readmeHref"]), f"{display_title(game['title'])} Notice")
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
        Learn more about ScummVM at
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
manifest["short_name"] = "scummweb"
manifest["name"] = "scummweb"
manifest["description"] = "Unofficial browser-targeted WebAssembly build forked from ScummVM."
manifest["start_url"] = "/"
manifest["background_color"] = "#1a4d1a"
manifest["theme_color"] = "#1a4d1a"

(dist / "manifest.json").write_text(json.dumps(manifest, indent=4) + "\n")
(dist / "source.html").write_text(source_html)
(dist / "index.html").write_text(index_html)
