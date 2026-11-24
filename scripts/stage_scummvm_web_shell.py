#!/usr/bin/env python3

import json
import os
from pathlib import Path
import subprocess
import sys

source = Path(__file__).resolve().parents[1] / "web-shell"
target = Path(sys.argv[1])
asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")
games_origin = os.environ.get("SCUMMVM_GAMES_ORIGIN", "https://games.scummweb.tsilva.eu").rstrip("/")

# Apply on full builds and shell-only refreshes; the adapter is idempotent.
subprocess.run([sys.executable, str(source.parent / "scripts" / "patch_scummvm_keyboard.py"),
                str(target / "scummvm.js")], check=True)
subprocess.run([sys.executable, str(source.parent / "scripts" / "patch_scummvm_lifecycle.py"),
                str(target / "scummvm.js")], check=True)
subprocess.run([sys.executable, str(source.parent / "scripts" / "patch_scummvm_speech.py"),
                str(target / "scummvm.js")], check=True)

html = (source / "scummvm.html").read_text().replace("__SCUMMWEB_ASSET_VERSION__", asset_version)
html = html.replace("/*__SCUMMWEB_FRAME_OBSERVER__*/", (source / "first-frame.mjs").read_text().replace("export ", "", 1))
html = html.replace("/*__SCUMMWEB_CANVAS_FIT__*/", (source / "canvas-fit.mjs").read_text().replace("export ", "", 1))
html = html.replace("/*__SCUMMWEB_GAME_DEFAULTS__*/", (source / "game-defaults.mjs").read_text().replace("export ", "", 1))
html = html.replace("/*__SCUMMWEB_AGENT_CONTROLS__*/", (source / "agent-controls.mjs").read_text().replace("export ", ""))
html = html.replace("/*__SCUMMWEB_PLAYER_CONTROLS__*/", (source / "player-controls.mjs").read_text().replace("export ", "", 1))
html = html.replace("/*__SCUMMWEB_DIAGNOSTIC_SAVES__*/", (source / "diagnostic-saves.mjs").read_text().replace("export ", "", 1))
html = html.replace("/*__SCUMMWEB_ROTATING_AUTOSAVES__*/", (source / "rotating-autosaves.mjs").read_text().replace("export ", ""))
save_editions = (source / "save-editions.mjs").read_text().replace("export ", "")
save_filesystem = (source.parent / "app/save-backups/filesystem.mjs").read_text()
save_filesystem = "\n".join(line for line in save_filesystem.splitlines() if not line.startswith("import "))
save_storage = "\n".join(line for line in (source / "save-storage.mjs").read_text().splitlines()
                         if not line.startswith("import "))
html = html.replace("/*__SCUMMWEB_SAVE_EDITIONS__*/", "(function(){\n" + save_editions
                    + save_filesystem.replace("export ", "")
                    + "\nconst indexedSaveStorage = (() => {\n" + save_storage.replace("export ", "")
                    + "\nreturn { ensureSaveStorage, getSaveDatabaseOpenAttempts, openSaveStorage };\n})();"
                    + "\nglobalThis.__scummwebSaveEditions = { editionKey, acquireEditionSession, initializeSaveEdition, initializeSaveRoot, saveLockName, waitForSaveSession, ...indexedSaveStorage };\n})();")
continue_saves = "\n".join(line for line in (source / "continue-saves.mjs").read_text().splitlines() if not line.startswith("import "))
html = html.replace("/*__SCUMMWEB_SAVE_BRIDGE__*/", "(function(){\n" + continue_saves.replace("export ", "") + "\nglobalThis.__scummwebInstallContinueSaves = installContinueSaves;\n})();")
filesystem = (source / "scummvm_fs.js").read_text().replace("__SCUMMWEB_GAMES_ORIGIN__", json.dumps(games_origin))

(target / "scummvm.html").write_text(html)
(target / "cloud.html").write_text((source / "cloud.html").read_text())
(target / "cloud-service.mjs").write_text((source / "cloud-service.mjs").read_text())
(target / "cloud-transfer-fetch.mjs").write_text((source / "cloud-transfer-fetch.mjs").read_text())
(target / "scummvm_fs.js").write_text(filesystem)
(target / "audio-start-control.mjs").write_text((source / "audio-start-control.mjs").read_text())
