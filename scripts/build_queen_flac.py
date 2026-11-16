#!/usr/bin/env python3
"""Build a reproducible, sample-verified Queen English CD FLAC download."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = "9064bd0e4b26774943b1a363113f9753dff31a2dc7b152059d985b66bc5e07bb"
TABLE_SHA256 = "b104d1a01e3ea552b63d98da9365f6beaba40864baa74b5b53159f17fc8f1149"
NOTICE = b"""MODIFIED VERSION - ScummWEB lossless audio edition
=================================================
This is a modified version of Flight of the Amazon Queen (English DOS CD).
ScummWEB converted its original speech and sound effects to lossless FLAC.
Every original audio sample and all non-audio game resources are preserved.
Audio remains 8-bit mono at 11840 Hz. No game content was removed.
The game authors did not create or endorse this modification.

Original readme, attribution and licence follow unchanged:
--------------------------------------------------------

"""


def digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def sound_pcm(original):
    """Match Queen::SBSound::playSoundData, including unknown-version fallback."""
    if len(original) < 4:
        raise ValueError("Truncated sound header")
    version = struct.unpack_from("<H", original, 2)[0]
    header = 122 if version == 110 else 110
    if len(original) < header:
        raise ValueError("Truncated sound data")
    return version, original[header:]


def encode_sound(original):
    version, pcm = sound_pcm(original)
    encoded = subprocess.run([
        "flac", "--silent", "--verify", "--force-raw-format", "--endian=little",
        "--sign=unsigned", "--channels=1", "--bps=8", "--sample-rate=11840",
        "--no-padding", "--no-seektable", "-8", "--stdout", "-",
    ], input=pcm, capture_output=True, check=True).stdout
    decoded = subprocess.run([
        "flac", "--silent", "--decode", "--force-raw-format", "--endian=little",
        "--sign=unsigned", "--stdout", "-",
    ], input=encoded, capture_output=True, check=True).stdout
    if decoded != pcm:
        raise ValueError("FLAC changed the original audio samples")
    return encoded, {"sbVersion": version, "pcmBytes": len(pcm),
                     "pcmSha256": hashlib.sha256(pcm).hexdigest()}


def build(source, table, output_dir, receipt):
    if digest(source) != SOURCE_SHA256 or digest(table) != TABLE_SHA256:
        raise ValueError("Source ZIP or Queen resource table differs from its pin")
    if subprocess.check_output(["flac", "--version"], text=True).strip() != "flac 1.5.0":
        raise ValueError("The reproducible recipe requires FLAC 1.5.0")
    with zipfile.ZipFile(source) as archive:
        if set(archive.namelist()) != {"queen.1", "readme.txt"}:
            raise ValueError("Unexpected source files")
        data, readme = archive.read("queen.1"), archive.read("readme.txt")
    if len(data) != 190787021 or zlib.crc32(data) != 501481959:
        raise ValueError("Unexpected Queen game data")
    raw_table = Path(table).read_bytes()
    count = struct.unpack_from(">H", raw_table, 0x584e)[0]
    entries = [struct.unpack_from(">12sBII", raw_table, 0x5850 + i * 21) for i in range(count)]
    cursor = 0
    for _, bundle, offset, size in sorted(entries, key=lambda row: row[2]):
        if bundle != 1 or offset != cursor:
            raise ValueError("Resource table does not cover the original data")
        cursor += size
    if count != 7671 or cursor != len(data):
        raise ValueError("Incomplete resource table")

    def transform(entry):
        name, _, offset, size = entry
        original = data[offset:offset + size]
        name = name.rstrip(b"\0").decode("ascii")
        if name.endswith(".SB"):
            encoded, proof = encode_sound(original)
            return encoded, {"name": name, "type": "flac", **proof}
        return original, {"name": name, "type": "unchanged",
                          "sha256": hashlib.sha256(original).hexdigest()}

    transformed = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        for index, result in enumerate(pool.map(transform, entries), 1):
            transformed.append(result)
            if index % 1000 == 0:
                print(f"Verified {index}/{count} resources", flush=True)
    header = b"QTBL" + b"CEM10\0" + bytes([0, 0, 3]) + struct.pack(">H", count)
    cursor = len(header) + 21 * count
    rebuilt_table, payload = bytearray(), bytearray()
    for (name, bundle, _, _), (content, _) in zip(entries, transformed):
        rebuilt_table.extend(struct.pack(">12sBII", name, bundle, cursor, len(content)))
        payload.extend(content)
        cursor += len(content)
    rebuilt = header + rebuilt_table + payload
    for index, (entry, (content, _)) in enumerate(zip(entries, transformed)):
        name, bundle, offset, size = struct.unpack_from(">12sBII", rebuilt, 15 + 21 * index)
        if name != entry[0] or bundle != 1 or rebuilt[offset:offset + size] != content:
            raise ValueError("Rebuilt resource table differs from verified resources")
    proofs = [proof for _, proof in transformed]
    audio = [proof for proof in proofs if proof["type"] == "flac"]
    if len(audio) != 6745:
        raise ValueError("Missing original sound resources")
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".queen-build-", dir=output_dir) as temporary:
        candidate = Path(temporary) / "package.zip"
        with zipfile.ZipFile(candidate, "w") as archive:
            for name, content in [("readme.txt", NOTICE + readme), ("queen.1c", rebuilt)]:
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system, info.external_attr = 3, 0o100644 << 16
                archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        with zipfile.ZipFile(candidate) as archive:
            if archive.testzip() or archive.read("queen.1c") != rebuilt or archive.read("readme.txt") != NOTICE + readme:
                raise ValueError("ZIP differs from the verified game data")
            files = [[info.filename, info.file_size, info.CRC] for info in archive.infolist()]
        checksum = digest(candidate)
        destination = output_dir / f"queen-flac-{checksum[:12]}.zip"
        if destination.exists():
            if destination.is_symlink() or digest(destination) != checksum:
                raise ValueError("Existing output differs from the verified package")
        else:
            os.link(candidate, destination)
        result = {"archive": destination.name, "bytes": destination.stat().st_size,
                  "sha256": checksum, "sourceSha256": SOURCE_SHA256, "tableSha256": TABLE_SHA256,
                  "files": files, "verifiedAudioClips": len(audio), "nonAudioResources": count - len(audio),
                  "originalReadmeSha256": hashlib.sha256(readme).hexdigest(),
                  "flacVersion": "1.5.0", "zlibVersion": zlib.ZLIB_RUNTIME_VERSION}
        Path(receipt).write_text(json.dumps({**result, "resources": proofs}, indent=2) + "\n")
    print(json.dumps(result, indent=2))
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--table", type=Path, default=ROOT / "scummvm-shell/data/queen.tbl")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.table, args.output_dir, args.receipt)
