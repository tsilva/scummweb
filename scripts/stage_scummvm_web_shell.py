#!/usr/bin/env python3

import json
import os
from pathlib import Path
import sys

source = Path(__file__).resolve().parents[1] / "web-shell"
target = Path(sys.argv[1])
asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")
games_origin = os.environ.get("SCUMMVM_GAMES_ORIGIN", "https://scummvm-games.tsilva.eu").rstrip("/")

html = (source / "scummvm.html").read_text().replace("__SCUMMWEB_ASSET_VERSION__", asset_version)
html = html.replace("/*__SCUMMWEB_FRAME_OBSERVER__*/", (source / "first-frame.mjs").read_text().replace("export ", "", 1))
filesystem = (source / "scummvm_fs.js").read_text().replace("__SCUMMWEB_GAMES_ORIGIN__", json.dumps(games_origin))

(target / "scummvm.html").write_text(html)
(target / "scummvm_fs.js").write_text(filesystem)
(target / "audio-start-control.mjs").write_text((source / "audio-start-control.mjs").read_text())
