#!/usr/bin/env python3
"""Package the source inputs used by a compiled ScummVM browser bundle."""

import argparse
from datetime import datetime, timezone
from hashlib import sha256
from html import escape
from importlib.util import module_from_spec, spec_from_file_location
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = "https://github.com/scummvm/scummvm"
SKILL = ".codex/skills/scummweb_upgrade-scummvm"
SOURCE_ARCHIVE = "scummvm-source.zip"
SOURCE_PAGE = "scummvm-source.html"
PORTS = {
    "freetype": "freetype.zip",
    "libjpeg": "libjpeg.*.tar.gz",
    "libpng": "libpng.*.tar.gz",
    "ogg": "ogg.zip",
    "sdl3": "sdl3.*.zip",
    "vorbis": "vorbis.zip",
    "zlib": "zlib.*.tar.gz",
}
BUILD_FILES = (
    "LICENSE",
    "scripts/build_scummvm_web.sh",
    "scripts/build_helpers.sh",
    "scripts/scummvm-version.sh",
    "scripts/stage_scummvm_web_shell.py",
    "scripts/write_source_info.py",
    "scripts/write_scummvm_http_index.py",
    "app/save-backups/filesystem.mjs",
    "web-shell/agent-controls.mjs",
    "web-shell/audio-start-control.mjs",
    "web-shell/canvas-fit.mjs",
    "web-shell/continue-saves.mjs",
    "web-shell/diagnostic-saves.mjs",
    "web-shell/first-frame.mjs",
    "web-shell/game-defaults.mjs",
    "web-shell/player-controls.mjs",
    "web-shell/save-editions.mjs",
    "web-shell/scummvm.html",
    "web-shell/scummvm_fs.js",
    f"{SKILL}/references/patches.json",
    f"{SKILL}/scripts/upgrade_check.py",
)


def digest(file):
    checksum = sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            checksum.update(block)
    return checksum.hexdigest()


def build_sources():
    return [
        *(ROOT / name for name in BUILD_FILES),
        *sorted(ROOT.glob("patches/scummvm/*.patch")),
        *sorted(path for path in (ROOT / "scripts").glob("patch_scummvm_*") if path.is_file()),
    ]


def source_fingerprint(sources):
    entries = {source.relative_to(ROOT).as_posix(): digest(source) for source in sources}
    return sha256(json.dumps(entries, sort_keys=True).encode()).hexdigest()


def verify_checkout(checkout, commit, patches):
    def git(*args, **kwargs):
        return subprocess.check_output(["git", "-C", checkout, *args], **kwargs)

    if git("rev-parse", "HEAD").decode().strip() != commit:
        raise ValueError("The ScummVM checkout does not match the source pin.")
    with TemporaryDirectory() as tmp:
        env = {**os.environ, "GIT_INDEX_FILE": str(Path(tmp) / "index")}
        git("read-tree", commit, env=env)
        # Later patches can extend files introduced earlier in the series.
        for patch in patches:
            git("apply", "--cached", patch, env=env)
        if git("diff", "--name-only", env=env):
            raise ValueError("The ScummVM checkout contains changes outside the published patch series.")


def dependency_archives(checkout, emsdk, flac):
    libs = checkout / "dists/emscripten/libs"
    emscripten = emsdk / "upstream/emscripten"
    result = [flac, libs / "libmad-0.15.1b.tar.gz", libs / "libtheora-1.1.1.tar.xz"]
    for port, pattern in PORTS.items():
        matches = list((emscripten / "cache/ports").glob(pattern))
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one cached source archive for the {port} port.")
        result.extend(matches)
    return result


def add_entry(archive, name, data, mode=0o644, compression=ZIP_DEFLATED):
    entry = ZipInfo(name)
    entry.create_system = 3
    entry.external_attr = (0o100000 | mode) << 16
    archive.writestr(entry, data, compress_type=compression)


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--verify-checkout":
        verify_checkout(sys.argv[2], sys.argv[3], sorted(ROOT.glob("patches/scummvm/*.patch")))
        return
    sources = build_sources()
    if sys.argv[1:] == ["--fingerprint"]:
        print(source_fingerprint(sources))
        return

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("checkout", type=Path)
    parser.add_argument("emsdk", type=Path)
    parser.add_argument("flac_archive", type=Path)
    parser.add_argument("--built-at", help="Original ISO timestamp when packaging an existing verified build")
    args = parser.parse_args()
    expected = os.environ.get("SCUMMVM_BUILD_SOURCE_SHA256")
    if expected and source_fingerprint(sources) != expected:
        raise ValueError("ScummVM source inputs changed during the build. Rebuild before publishing.")

    spec = spec_from_file_location("upgrade_check", ROOT / SKILL / "scripts/upgrade_check.py")
    checker = module_from_spec(spec)
    spec.loader.exec_module(checker)
    checker.validate_memory(ROOT)
    _, pin = checker.read_pin(ROOT)
    version, commit, sdk = (pin[key] for key in ("SCUMMVM_TAG", "SCUMMVM_COMMIT", "EMSDK_VERSION"))
    if args.emsdk.name != f"emsdk-{sdk}":
        raise ValueError("The Emscripten SDK directory does not match the build pin.")
    timestamp = datetime.fromisoformat(args.built_at.replace("Z", "+00:00")) if args.built_at else datetime.now(timezone.utc)
    date = timestamp.date().isoformat()
    upstream_url = f"{UPSTREAM}/archive/{commit}.tar.gz"
    emscripten_url = f"https://github.com/emscripten-core/emscripten/archive/refs/tags/{sdk}.tar.gz"

    patches = sorted(ROOT.glob("patches/scummvm/*.patch"))
    verify_checkout(args.checkout, commit, patches)

    bundle = args.bundle
    doc = bundle / "doc"
    binary_paths = [bundle / "scummvm.wasm", bundle / "scummvm.js", *sorted((bundle / "data/plugins").glob("*.so"))]
    if len(binary_paths) <= 2:
        raise ValueError("No compiled ScummVM engine plugins were found.")
    runtime_hashes = {p.relative_to(bundle).as_posix(): digest(p) for p in binary_paths}
    compiled = args.checkout / "build-emscripten"
    for name, checksum in runtime_hashes.items():
        if digest(compiled / name) != checksum:
            raise ValueError(f"The staged binary differs from this ScummVM build: {name}")
    dependencies = dependency_archives(args.checkout, args.emsdk, args.flac_archive)
    for source in dependencies:
        if not source.is_file():
            raise ValueError(f"Missing ScummVM dependency source archive: {source.name}")
    archive_path = doc / SOURCE_ARCHIVE
    readme = f"""# ScummWEB's modified ScummVM browser runtime

ScummVM {version} ({commit}), modified by ScummWEB for its browser build dated {date}.
The modified ScummVM runtime is covered by the GNU GPL version 3 or later.
See COPYING and COPYRIGHT for the license and copyright notices.

Download the matching unmodified ScummVM source from:
{upstream_url}

The ordered patches in patches/scummvm/ and the browser build scripts in this
archive complete the source offer for the identified runtime. The adapter scripts
modify the generated JavaScript for browser audio and keyboard handling.
runtime-sha256.json identifies the compiled JavaScript, WebAssembly and engine
plugins served by this build.

To rebuild, extract this archive and run these commands from its root:

    git init
    bash scripts/build_scummvm_web.sh --compile-only

The script checks out the exact ScummVM revision, applies the patches, installs
Emscripten {sdk}, and builds the runtime in vendor/scummvm-{version}/build-emscripten.
It uses Git, Bash, curl, Python 3, CMake and standard build tools. It does not need
any game data. Third-party library source archives are in dependencies/.
The Emscripten runtime and port build recipes are at:
{emscripten_url}

The JPEG implementation is based in part on the work of the Independent JPEG Group.
"""
    with ZipFile(archive_path, "w") as archive:
        add_entry(archive, "README.md", readme.encode())
        for name in ("COPYING", "COPYRIGHT"):
            add_entry(archive, name, (doc / name).read_bytes())
        add_entry(archive, "runtime-sha256.json", (json.dumps(runtime_hashes, indent=2) + "\n").encode())
        for source in sources:
            add_entry(archive, source.relative_to(ROOT).as_posix(), source.read_bytes(), source.stat().st_mode & 0o777)
        for source in dependencies:
            add_entry(archive, f"dependencies/{source.name}", source.read_bytes(), compression=ZIP_STORED)

    info = {
        "generated_at_utc": timestamp.isoformat().replace("+00:00", "Z"),
        "scummvm": {"version": version, "commit": commit, "archive_url": upstream_url},
        "corresponding_source": {
            "page": f"/doc/{SOURCE_PAGE}",
            "archive": f"/doc/{SOURCE_ARCHIVE}",
            "archive_sha256": digest(archive_path),
            "runtime_sha256": runtime_hashes,
        },
    }
    (bundle / "source-info.json").write_text(json.dumps(info, indent=2) + "\n")
    (doc / SOURCE_PAGE).write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ScummVM source and licenses | ScummWEB</title>
<style>
body {{ max-width: 46rem; margin: 3rem auto; padding: 0 1rem; font: 1rem/1.6 system-ui; color-scheme: light dark }}
</style>
</head>
<body>
<main>
<p><a href="/">ScummWEB</a></p>
<h1>ScummVM source and licenses</h1>
<p>ScummWEB distributes a modified browser build of ScummVM {escape(version)} dated {date}.
The runtime is licensed under the GNU General Public License, version 3 or later.</p>
<p>Download both parts for the corresponding source for this browser build.</p>
<ul>
<li><a href="{escape(upstream_url)}">Download the pinned upstream ScummVM source</a></li>
<li><a href="{SOURCE_ARCHIVE}">Download ScummWEB’s patches, build scripts and library sources</a></li>
</ul>
<p>The ScummWEB archive includes instructions for applying the patches and rebuilding
the runtime without game files. It also lists SHA-256 checksums for the browser binaries.
The <a href="{escape(emscripten_url)}">Emscripten {escape(sdk)} sources</a> include the runtime
and port build recipes. The JPEG implementation is based in part on the work of the
Independent JPEG Group.</p>
<p><a href="COPYING">GPL license text</a> · <a href="COPYRIGHT">Copyright notices</a> ·
<a href="../source-info.json">Build details and checksums</a></p>
</main>
</body>
</html>
""")


if __name__ == "__main__":
    main()
