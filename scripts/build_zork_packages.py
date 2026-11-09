#!/usr/bin/env python3
"""Build the MIT-licensed Infocom trilogy with the ZILF 1.9 toolchain."""

import argparse
import hashlib
from io import BytesIO
from pathlib import Path
import re
import subprocess
import tarfile
from tempfile import TemporaryDirectory
from urllib.request import urlopen
from zipfile import ZipFile, ZipInfo


SOURCES = {
    "zork1": ("97b7b3d68c075dd9af7da499c3e9690ada3471fd",
              "06ae7ae8eda6022b6cc122ee202c56915c6312a7facac95785edf11ee2c5894d"),
    "zork2": ("3da9661098809788a99cef00f00c865c6c204f96",
              "1cf8cf89d54ec8927e9a9086fde055d24da2c70be4106e770a04119e52b0e672"),
    "zork3": ("3ec9ed412b5f3cafe65d83c727d07db1fe4a86a8",
              "f494517b6942acae2272b6322ba648b9f1a1c7a9ee496c1cce671786cf94875d"),
}


def repair_zork2(directory):
    # The archived DREARY-ROOM-FCN closes COND before its fallback clause.
    path = directory / "2actions.zil"
    repaired, replacements = re.subn(
        rb'(<P-DOOR "south" ,LID-2 ,KEYHOLE-2>\r?\n\s+<RTRUE>)\)>'
        rb'((?:\r?\n) +\(T <PCHECK> <RFALSE>\))>',
        rb'\1)\2>>',
        path.read_bytes(),
    )
    if replacements != 1:
        raise ValueError("Zork II source no longer matches the documented repair")
    path.write_bytes(repaired)


def build(game, revision, checksum, tools, output):
    source_url = f"https://github.com/historicalsource/{game}/tree/{revision}"
    archive_url = f"https://codeload.github.com/historicalsource/{game}/tar.gz/{revision}"
    with urlopen(archive_url, timeout=30) as response:
        data = response.read(4 * 1024 * 1024)
    if hashlib.sha256(data).hexdigest() != checksum:
        raise ValueError(f"Source checksum mismatch for {game}")

    with TemporaryDirectory(prefix=f".{game}-", dir=output) as temporary:
        directory = Path(temporary) / f"{game}-{revision}"
        with tarfile.open(fileobj=BytesIO(data), mode="r:gz") as archive:
            for member in archive:
                path = Path(member.name)
                if path.is_absolute() or ".." in path.parts or path.parts[0] != directory.name:
                    raise ValueError(f"Invalid path in the {game} source archive")
                if member.isdir():
                    continue
                if not member.isfile():
                    raise ValueError(f"Unexpected entry in the {game} source archive")
                destination = Path(temporary) / path
                destination.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as stream:
                    destination.write_bytes(stream.read())
        if game == "zork2":
            repair_zork2(directory)
        story = f"{game}.z3"
        subprocess.run([tools / "zilf", f"{game}.zil"], cwd=directory, check=True)
        subprocess.run([tools / "zapf", "-s", "261108", f"{game}.zap", story],
                       cwd=directory, check=True)
        story_bytes = (directory / story).read_bytes()
        if not story_bytes or story_bytes[0] != 3:
            raise ValueError(f"{game} did not compile to a Z-machine v3 story")

        notes = f"Infocom source: {source_url}\nBuilt with ZILF 1.9.\n"
        if game == "zork2":
            notes += "The DREARY-ROOM-FCN fallback clause was restored to its COND.\n"
        package_path = Path(temporary) / f"{game}-mit.zip"
        with ZipFile(package_path, "w") as package:
            package.writestr(ZipInfo(story), story_bytes)
            package.writestr(ZipInfo("LICENSE.txt"), (directory / "LICENSE").read_bytes())
            package.writestr(ZipInfo("SOURCE.txt"), notes)
        package_path.replace(output / package_path.name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tools", type=Path, help="Directory containing ZILF 1.9 zilf and zapf")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "downloads")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    for name, (pin, sha256) in SOURCES.items():
        build(name, pin, sha256, args.tools.resolve(), args.output.resolve())
