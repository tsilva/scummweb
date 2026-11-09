#!/usr/bin/env python3
"""Install checksum-pinned games without redetecting the existing catalog."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def install(dist, downloads):
    games = json.loads((ROOT / "data/classic-freeware.json").read_text())["games"]
    # Validate every available package before changing any game/configuration.
    available = []
    for game in games:
        archive = downloads / game["archive"]
        if not archive.is_file():
            print(f"Optional archive absent: {game['archive']}")
            continue
        sources = [(downloads / source["archive"], source["sha256"])
                   for source in game.get("sourceFiles", [])]
        for file, checksum in [(archive, game["sha256"]), *sources]:
            digest = hashlib.sha256()
            with file.open("rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != checksum:
                raise ValueError(f"Archive checksum mismatch: {file.name}")
        available.append((game, archive, sources))

    ini_path = dist / "scummvm.ini"
    ini_text = ini_path.read_text()
    (dist / "games").mkdir(parents=True, exist_ok=True)
    for game, archive, sources in available:
        destination = dist / "games" / game["gameId"]
        with tempfile.TemporaryDirectory(prefix="scummweb-freeware-") as temporary:
            with zipfile.ZipFile(archive) as package:
                for member in package.infolist():
                    member_path = Path(member.filename)
                    if member_path.is_absolute() or ".." in member_path.parts:
                        raise ValueError(f"Unsafe archive member in {archive.name}")
                package.extractall(temporary)
            if destination.is_dir():
                shutil.rmtree(destination)
            subprocess.run([
                "python3", str(ROOT / "scripts/normalize_game_archive.py"),
                temporary, str(destination),
            ], check=True)

        if sources:
            source_dir = destination / "source"
            source_dir.mkdir()
            for file, _ in sources:
                shutil.copyfile(file, source_dir / file.name)

        if game["gameId"] == "hires1":
            (destination / "readme.txt").write_text(
                "Hi-Res Adventure #1: Mystery House\n"
                "Original Apple II game by On-Line Systems (1980).\n"
                "Sierra On-Line released Mystery House into the public domain in 1987.\n"
                "The original disk image is preserved unchanged.\n"
                "Release history: https://www.scummvm.org/en/news/20160915/\n"
                f"Download: {game['url']}\n"
            )

        target = game["target"]
        settings = {
            "description": game["title"],
            "path": f"/games/{game['gameId']}",
            "engineid": game["engineId"],
            "gameid": game["gameId"],
            "platform": game["platform"],
            "extra": game["extra"],
            "language": "en",
            "subtitles": "true",
            **game.get("config", {}),
        }
        section = "\n".join([
            f"[{target}]", *(f"{key}={value}" for key, value in settings.items()), "",
        ])
        pattern = rf"(?ms)^\[{re.escape(target)}\]\n.*?(?=^\[|\Z)"
        if re.search(pattern, ini_text):
            ini_text = re.sub(pattern, lambda _: section + "\n", ini_text, count=1)
        else:
            ini_text = ini_text.rstrip() + "\n\n" + section
        # The browser unwraps a common directory at load time. Preserve the
        # exact ZIP for licensed demos and reproducibly built story packages.
        output = dist / "games" / f"{game['gameId']}.zip"
        if game.get("preserveArchive"):
            shutil.copyfile(archive, output)
        else:
            with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as package:
                for file in sorted(destination.rglob("*")):
                    if file.is_file() and file.name != "index.json":
                        package.write(file, file.relative_to(destination).as_posix())
        print(f"Installed {game['title']}")
    ini_path.write_text(ini_text.rstrip() + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dist", type=Path)
    parser.add_argument("--downloads", type=Path, default=ROOT / "downloads")
    args = parser.parse_args()
    install(args.dist, args.downloads)
