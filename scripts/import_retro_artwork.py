#!/usr/bin/env python3
"""Regenerate managed WebP files from the reviewed RETRO artwork manifest."""

import argparse
import concurrent.futures
import json
import os
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "app" / "retro-game-artwork.json"
DESTINATION = ROOT / "scummvm-shell" / "launcher"
MAX_SOURCE_BYTES = 16 * 1024 * 1024
POSTER_SIZE = "540x720"
SOURCE_HOSTS = {
    "images.launchbox-app.com",
    "thumbnails.libretro.com",
    "www.gamerscreed.com",
    "www.scummvm.org",
    "scummvm-games.tsilva.eu",
}


def run_magick(*args):
    subprocess.run(
        ["magick", "-limit", "thread", "1", "-limit", "area", "48MP", *args],
        check=True,
        capture_output=True,
        text=True,
    )


def trusted_source(url):
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in SOURCE_HOSTS
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
    ):
        raise ValueError(f"Unexpected artwork URL: {url}")
    return url


class ArtworkRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        trusted_source(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, path):
    opener = urllib.request.build_opener(ArtworkRedirects)
    request = urllib.request.Request(
        trusted_source(url), headers={"User-Agent": "ScummWEB-artwork/1.0"},
    )
    with opener.open(request, timeout=25) as response:
        content = response.read(MAX_SOURCE_BYTES + 1)
    if len(content) > MAX_SOURCE_BYTES:
        raise ValueError(f"Artwork source exceeds {MAX_SOURCE_BYTES} bytes")
    path.write_bytes(content)


def render(kind, title, source, output, font):
    image = f"{source}[0]"
    if kind in {"gameplay", "title-screen"}:
        run_magick(
            image, "-auto-orient", "-strip", "-resize", "960x720>",
            "-define", "webp:lossless=true", str(output),
        )
    elif kind in {"box-scan", "title-screen-poster", "gameplay-poster", "icon-poster"}:
        # Preserve all of the scanned cover or screen. A soft background fills
        # any sidebars without cutting off logos or artwork.
        run_magick(
            image, "-auto-orient", "-resize", f"{POSTER_SIZE}^",
            "-gravity", "center", "-extent", POSTER_SIZE,
            "-blur", "0x22", "-fill", "rgba(12,17,29,0.58)", "-colorize", "58%",
            "(", image, "-auto-orient", "-resize", POSTER_SIZE, ")",
            "-gravity", "center", "-compose", "Over", "-composite",
            "-strip", "-quality", "86", str(output),
        )
    elif kind == "title-card":
        if not font:
            raise ValueError("A font is required for title cards; use --font")
        run_magick(
            "-size", POSTER_SIZE, "gradient:#33436f-#111629",
            "-font", font, "-gravity", "center", "-fill", "#e9effd",
            "-pointsize", "64", "-annotate", "0", title,
            "-strip", "-quality", "86", str(output),
        )
    else:
        raise ValueError(f"Unrecognized artwork kind: {kind}")


def generate(task, args):
    asset, source, title = task
    if not re.fullmatch(r"/launcher/retro-[a-z0-9_-]+\.webp", asset):
        raise ValueError(f"Refusing to write outside managed RETRO assets: {asset}")
    destination = DESTINATION / asset.removeprefix("/launcher/")
    if destination.exists() and not args.force:
        return False
    with tempfile.TemporaryDirectory(prefix=".retro-artwork-", dir=DESTINATION.parent) as temporary:
        temporary = Path(temporary)
        original = temporary / "original"
        output = temporary / "artwork.webp"
        if "url" in source:
            download(source["url"], original)
        elif "path" in source:
            original = (ROOT / source["path"]).resolve()
            if not original.is_relative_to(ROOT / "image-assets" / "sources"):
                raise ValueError(f"Invalid local artwork source: {source['path']}")
            if not original.is_file():
                storage = json.loads((ROOT / "data/artwork-storage.json").read_text())
                entry = storage["files"].get("/" + source["path"])
                if not storage["published"] or not entry or storage["origin"] != "https://scummvm-games.tsilva.eu":
                    raise ValueError("Missing artwork source; publish its storage mapping first")
                original = temporary / "original"
                download(storage["origin"] + "/" + entry["key"], original)
                import hashlib
                if hashlib.sha256(original.read_bytes()).hexdigest() != entry["sha256"]:
                    raise ValueError("Artwork source checksum mismatch")
        render(source["kind"], title, original, output, args.font)
        os.replace(output, destination)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="also regenerate existing WebPs")
    parser.add_argument("--jobs", type=int, default=8)
    parser.add_argument("--font", help="ImageMagick font name or file for generated title cards")
    parser.add_argument("game_ids", nargs="*", help="optional namespaced game IDs to regenerate")
    args = parser.parse_args()
    if not 1 <= args.jobs <= 16:
        parser.error("--jobs must be between 1 and 16")
    system_font = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    if not args.font:
        args.font = str(system_font) if system_font.is_file() else None
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    for unknown in set(args.game_ids) - manifest.keys():
        parser.error(f"Unknown game ID: {unknown}")
    tasks = []
    for game_id, game in manifest.items():
        if (args.game_ids and game_id not in args.game_ids) or "sources" not in game:
            continue
        source = game["sources"]
        tasks.append((game["posterImage"], source["poster"], game["title"]))
        tasks.extend(
            (image, shot, game["title"])
            for image, shot in zip(game["screenshots"], source["screenshots"], strict=True)
        )
    generated = 0
    failed = 0
    with concurrent.futures.ThreadPoolExecutor(args.jobs) as workers:
        pending = {workers.submit(generate, task, args): task for task in tasks}
        for result in concurrent.futures.as_completed(pending):
            try:
                generated += result.result()
            except (OSError, ValueError, subprocess.CalledProcessError) as exc:
                print(f"{pending[result][0]}: {getattr(exc, 'stderr', None) or exc}", flush=True)
                failed += 1
    print(f"Generated {generated} of {len(tasks)} managed files; {failed} failed.")
    raise SystemExit(bool(failed))


if __name__ == "__main__":
    main()
