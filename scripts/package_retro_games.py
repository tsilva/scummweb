#!/usr/bin/env python3
"""Inventory and package a local ScummVM collection into one ZIP per edition."""

import argparse
import ctypes
from dataclasses import dataclass, replace
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import unicodedata
import zipfile
import zlib


MIB = 1024 * 1024
CHUNK_SIZE = MIB
REPO_ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_NAMES = {
    "Broken Sword 2": "Broken Sword 2.5 (Windows)",
    "Castle of Dr": "Castle of Dr. Brain",
    "Day Of The Tentacle (CD Dos)": "Day of the Tentacle (CD DOS)",
    "Island of Dr": "The Island of Dr. Brain",
    "Labyrinth of Time (CD DOS)": "The Labyrinth of Time (CD DOS)",
    "Monkey Island 2 LeChuck's Revenge (Amiga)": "Monkey Island 2 - LeChuck's Revenge (Amiga)",
    "Sam and Max Hit the Road (CD DOS)": "Sam & Max Hit the Road (CD DOS)",
}
ARCHIVE_NAME_INVALID = re.compile(r'[\x00-\x1f\x7f<>:"/\\|?*]')
GAME_PATH_INVALID = re.compile(r"[\x00-\x1f\x7f:\\]")
MARKER_TARGET = re.compile(r"[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?")
SWORD1_RERELEASE_FOLDER = "Broken Sword 1 The Shadow of the Templar (CD Windows)"
TITANIC_WINDOWS_FOLDER = "Starship Titanic (CD, Windows)"
TITANIC_DATA_V3_SHA256 = "d8b402cd0584b7b9f9f5eaa7655dad829f90efeadab4746c509e10882031a869"
QFG1_AMIGA_FOLDER = "Hero Quest So You Want To Be A Hero (Amiga)"
QFG1_AMIGA_MAP_SHA256 = "8d231c19b7a9a90fc5a73db96eebec8d787759d7f8fd3f88f9ee66ab5e9859ec"
QFG1_DOS_VOLUMES = {
    "resource.003": "9e84f46bb45f401916f6e134f503c3507ed2a597a4eab21220510db2b3a451d5",
    "resource.004": "20c10b8ba74549f5c58f2cad81f7119a800652a390a5038ea833dda03d002ba9",
}
QFG1_AMIGA_REPAIRS = {
    "resource.003": (654096, "1d75449e1b5d83c6737fc5194acb7d962628b2d82ca6645c2aa84b305f3c7db5"),
    "resource.004": (689124, "cfafff260db69d6a0efef347fe9bc60c2521af8dc218aa31fe172c8fccd34da1"),
    "sound.072d": (44, "288991890b33bddf4451fe2b4df9d96038e005c1899ae59958c16d584ce0a3c0"),
}


@dataclass(frozen=True)
class Member:
    path: Path
    name: str
    size: int
    modified_ns: int
    content: bytes | None = None


@dataclass(frozen=True)
class Edition:
    source_name: str
    archive_name: str
    marker_target: str
    target: str
    members: list[Member]

    @property
    def expanded_bytes(self):
        return sum(member.size for member in self.members)

    @property
    def compression(self):
        # Large local archives must support seeking directly to a stored member.
        return zipfile.ZIP_STORED if self.zip_bound(zipfile.ZIP_DEFLATED) > 128 * MIB else zipfile.ZIP_DEFLATED

    def zip_bound(self, method):
        # Local and central headers, ZIP64 extras, and the end-of-directory records.
        size = 128
        for member in self.members:
            n = member.size
            size += n + 128 + 2 * len(member.name.encode("utf-8"))
            if method == zipfile.ZIP_DEFLATED:
                # zlib's compressBound for the default window and memory settings.
                size += (n >> 12) + (n >> 14) + (n >> 25) + 13
        return size


def is_metadata(name):
    return name.startswith(".") or name.casefold() in {"__macosx", "desktop.ini", "thumbs.db"}


def has_appledouble_resource_fork(path):
    sibling = path.with_name(path.name[2:])
    if path.is_symlink() or not path.is_file() or sibling.is_symlink() or not sibling.is_file():
        return False
    with path.open("rb") as file:
        file_size = os.fstat(file.fileno()).st_size
        header = file.read(26)
        if len(header) != 26:
            return False
        magic, version, count = struct.unpack(">II16xH", header)
        descriptor_end = 26 + count * 12
        if magic != 0x00051607 or version not in {0x00010000, 0x00020000} or descriptor_end > file_size:
            return False
        descriptors = file.read(count * 12)
        if len(descriptors) != count * 12:
            return False
        for kind, offset, length in struct.iter_unpack(">III", descriptors):
            if kind != 2 or offset < descriptor_end or length < 16 or offset + length > file_size:
                continue
            file.seek(offset)
            resource_header = file.read(16)
            if len(resource_header) != 16:
                continue
            data_offset, map_offset, data_size, map_size = struct.unpack(">4I", resource_header)
            # Some macOS metadata sidecars carry a resource header with an empty data area.
            if (
                data_size > 0
                and data_offset >= 16
                and map_offset >= 16
                and map_size >= 28
                and data_offset + data_size <= length
                and map_offset + map_size <= length
            ):
                return True
    return False


def raise_walk_error(error):
    raise error


def member_name(folder, path):
    relative = path.relative_to(folder)
    # ScummVM's rerelease detector expects these paths for the RETRO files.
    if folder.name == SWORD1_RERELEASE_FOLDER and (folder / "video" / "INTRO.SMK").is_file():
        if len(relative.parts) == 1 and relative.suffix.lower() in {".clu", ".rif"}:
            return "clusters/" + relative.name.lower()
        if len(relative.parts) > 1 and relative.parts[0].lower() == "video":
            return "smackshi/" + "/".join(relative.parts[1:]).lower()
    return relative.as_posix()


def game_members(folder):
    members = []
    paths = set()
    for root, dirs, files in os.walk(folder, onerror=raise_walk_error):
        parent = Path(root)
        dirs[:] = sorted(name for name in dirs if not is_metadata(name))
        for name in dirs:
            if (parent / name).is_symlink():
                raise ValueError(f"Game contains a symbolic link: {parent / name}")
        for name in sorted(files):
            path = parent / name
            if name.lower().endswith(".scummvm") or (
                is_metadata(name)
                and not (name.startswith("._") and len(name) > 2 and has_appledouble_resource_fork(path))
            ):
                continue
            if path.is_symlink() or not path.is_file():
                raise ValueError(f"Game contains a link or special file: {path}")
            archive_name = member_name(folder, path)
            if (
                len(archive_name.encode("utf-16-le")) // 2 > 1024
                or GAME_PATH_INVALID.search(archive_name)
                or "__proto__" in archive_name.split("/")
            ):
                raise ValueError(f"Invalid ScummWEB archive member: {archive_name}")
            key = archive_name.lower()
            if key in paths:
                raise ValueError(f"Duplicate ScummWEB archive member: {archive_name}")
            paths.add(key)
            stat = path.stat()
            members.append(Member(path, archive_name, stat.st_size, stat.st_mtime_ns))

    for path in paths:
        parts = path.split("/")
        if any("/".join(parts[:i]) in paths for i in range(1, len(parts))):
            raise ValueError(f"Archive uses the same path for a file and directory: {path}")
    if not members:
        raise ValueError("Game directory has no data files.")
    return members


def sha256_file(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def omit_obsolete_titanic_data(folder, target, members):
    if folder.name != TITANIC_WINDOWS_FOLDER or target != "titanic-win":
        return members
    # The current engine ships its own version 5 support file. This known
    # version 3 copy would take precedence over the bundled data at launch.
    return [
        member for member in members
        if not (
            member.name.lower() == "titanic.dat"
            and member.size == 2793322
            and sha256_file(member.path) == TITANIC_DATA_V3_SHA256
        )
    ]


def amiga_qfg1_members(folder, members):
    if folder.name != QFG1_AMIGA_FOLDER:
        return members
    by_name = {member.name.lower(): member for member in members}
    resource_map = by_name.get("resource.map")
    if resource_map is None or resource_map.size != 6066 or sha256_file(resource_map.path) != QFG1_AMIGA_MAP_SHA256:
        return members
    volumes = {name: sha256_file(by_name[name].path) for name in QFG1_DOS_VOLUMES if name in by_name}
    mixed = [name for name, checksum in volumes.items() if checksum == QFG1_DOS_VOLUMES[name]]
    if not mixed:
        return members
    for name in QFG1_DOS_VOLUMES:
        if name not in mixed and volumes.get(name) != QFG1_AMIGA_REPAIRS[name][1]:
            raise ValueError(f"Unexpected {name} in mixed Amiga game data. A known matching set of volumes is required.")
    archive = folder.parent.parent / "Commodore Amiga" / "Quest For Glory.lha"
    if not archive.is_file():
        raise ValueError(f"Amiga resource map is mixed with DOS volumes. Matching local LHA is required: {archive}")
    extractor = shutil.which("7zz")
    if not extractor:
        raise ValueError("7zz is required to read the replacement Amiga volumes from the local LHA.")

    repaired = {}
    names = mixed + (["sound.072d"] if "sound.072d" not in by_name else [])
    for name in names:
        size, checksum = QFG1_AMIGA_REPAIRS[name]
        try:
            data = subprocess.run(
                [extractor, "x", "-so", str(archive), "QuestForGlory/data/" + name],
                check=True, capture_output=True, timeout=30,
            ).stdout
        except (OSError, subprocess.SubprocessError) as error:
            raise ValueError(f"Could not read {name} from the local Amiga LHA.") from error
        if len(data) != size or hashlib.sha256(data).hexdigest() != checksum:
            raise ValueError(f"Local Amiga LHA does not contain the matching edition's {name}.")
        if name in by_name:
            repaired[name] = replace(by_name[name], size=size, content=data)
        else:
            repaired[name] = Member(archive, name, size, archive.stat().st_mtime_ns, data)
    return [
        repaired.get(member.name.lower(), member) for member in members
    ] + [member for name, member in repaired.items() if name not in by_name]


def collection(source):
    editions = []
    issues = []
    archives = set()
    folders = set()
    for folder in sorted(source.iterdir(), key=lambda path: path.name.casefold()):
        if is_metadata(folder.name) or not folder.is_dir():
            continue
        marker = folder.with_name(folder.name + ".scummvm")
        if not marker.is_file():
            issues.append({"sourceName": folder.name, "status": "unmarked-directory"})
            continue
        folders.add(folder.name)
        try:
            if folder.is_symlink() or marker.is_symlink():
                raise ValueError("Game directories and their markers must be real files.")
            marker_target = marker.read_text(encoding="utf-8-sig").strip()
            if not MARKER_TARGET.fullmatch(marker_target):
                raise ValueError("Launcher marker must contain one ScummVM target.")
            archive_name = ARCHIVE_NAMES.get(folder.name, folder.name) + ".zip"
            if ARCHIVE_NAME_INVALID.search(archive_name):
                raise ValueError(f"Invalid output filename: {archive_name}")
            archive_key = unicodedata.normalize("NFC", archive_name).casefold()
            if archive_key in archives:
                raise ValueError(f"More than one edition uses the output filename {archive_name}.")
            members = game_members(folder)
            members = omit_obsolete_titanic_data(folder, marker_target, members)
            members = amiga_qfg1_members(folder, members)
            target = marker_target
            if folder.name == "Broken Sword 2" and (folder / "data.b25c").is_file():
                target = "sword25"
            editions.append(Edition(folder.name, archive_name, marker_target, target, members))
            archives.add(archive_key)
        except (OSError, ValueError) as error:
            issues.append({"sourceName": folder.name, "status": "invalid-edition", "reason": str(error)})
    for marker in sorted(source.glob("*.scummvm")):
        if not is_metadata(marker.name) and marker.stem not in folders:
            issues.append({"sourceName": marker.name, "status": "orphan-marker"})
    return editions, issues


def output_entry(edition, output, selected):
    destination = output / edition.archive_name
    method = edition.compression
    exists = os.path.lexists(destination)
    return {
        "sourceName": edition.source_name,
        "archiveName": edition.archive_name,
        "markerTarget": edition.marker_target,
        "target": edition.target,
        "entries": len(edition.members),
        "expandedBytes": edition.expanded_bytes,
        "archiveBoundBytes": edition.zip_bound(method),
        "method": "stored" if method == zipfile.ZIP_STORED else "deflate",
        "selected": selected,
        "status": ("present" if exists else "planned") if selected else "unselected",
    }


def source_checksum(member, output=None):
    if member.content is not None:
        if output is not None:
            output.write(member.content)
        return zlib.crc32(member.content)
    checksum = 0
    with member.path.open("rb") as source:
        for chunk in iter(lambda: source.read(CHUNK_SIZE), b""):
            checksum = zlib.crc32(chunk, checksum)
            if output is not None:
                output.write(chunk)
        stat = os.fstat(source.fileno())
        if stat.st_size != member.size or stat.st_mtime_ns != member.modified_ns:
            raise ValueError(f"Source changed during packaging: {member.path}")
    return checksum


def verify_archive(path, edition, expected_checksums=None):
    if path.is_symlink() or not path.is_file():
        raise ValueError(f"Expected a regular ZIP file at {path}.")
    needs_stored = path.stat().st_size > 128 * MIB
    with zipfile.ZipFile(path) as archive:
        contents = {info.filename: info for info in archive.infolist()}
        if len(archive.infolist()) != len(edition.members) or len(contents) != len(edition.members):
            raise ValueError("ZIP member count differs from the source.")
        for member in edition.members:
            info = contents.get(member.name)
            if info is None or info.file_size != member.size:
                raise ValueError(f"ZIP member is missing or has a different size: {member.name}")
            if needs_stored and info.compress_type != zipfile.ZIP_STORED:
                raise ValueError(f"Large ZIP member must be stored for direct access: {member.name}")
            expected = (
                expected_checksums[member.name]
                if expected_checksums is not None
                else source_checksum(member)
            )
            if info.CRC != expected:
                raise ValueError(f"ZIP member differs from the source: {member.name}")
        failed = archive.testzip()
        if failed is not None:
            raise ValueError(f"ZIP member failed CRC verification: {failed}")


def publish_zip(stage, destination):
    """Publish without replacing existing archives, including on ExFAT."""
    unsupported = {errno.ENOSYS, errno.ENOTSUP, errno.EOPNOTSUPP}
    if sys.platform == "darwin":
        rename_exclusive = ctypes.CDLL(None, use_errno=True).renamex_np
        rename_exclusive.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_uint]
        rename_exclusive.restype = ctypes.c_int
        if rename_exclusive(os.fsencode(stage), os.fsencode(destination), 4) == 0:  # RENAME_EXCL
            return
        code = ctypes.get_errno()
        if code not in unsupported:
            raise OSError(code, os.strerror(code), destination)
    else:
        try:
            os.link(stage, destination)
            return
        except OSError as error:
            if error.errno not in unsupported | {errno.EPERM}:
                raise

    # ExFAT cannot atomically rename to a previously unused name. Reserve a
    # file using exclusive creation, then replace only that reservation.
    with destination.open("xb") as reservation:
        identity = os.fstat(reservation.fileno())
        published = False
        try:
            if not os.path.samestat(destination.lstat(), identity):
                raise FileExistsError(f"ZIP destination changed while publishing: {destination}")
            stage.replace(destination)
            published = True
        finally:
            if not published and os.path.lexists(destination) and os.path.samestat(destination.lstat(), identity):
                destination.unlink()


def write_archive(path, edition):
    descriptor, filename = tempfile.mkstemp(prefix=".scummweb-", suffix=".tmp", dir=path.parent)
    os.close(descriptor)
    stage = Path(filename)
    method = edition.compression
    try:
        checksums = {}
        with zipfile.ZipFile(stage, "w", compression=method, allowZip64=True) as archive:
            for member in edition.members:
                info = zipfile.ZipInfo.from_file(member.path, member.name, strict_timestamps=False)
                info.compress_type = method
                info.file_size = member.size
                with archive.open(info, "w") as entry:
                    checksums[member.name] = source_checksum(member, entry)
        verify_archive(stage, edition, checksums)
        with stage.open("rb") as file:
            os.fsync(file.fileno())
        publish_zip(stage, path)
    finally:
        stage.unlink(missing_ok=True)


def existing_parent(path):
    while not path.exists():
        path = path.parent
    return path


def selected_edition(edition, args):
    if args.max_expanded_mib is not None and edition.expanded_bytes > args.max_expanded_mib * MIB:
        return False
    return not args.match or any(
        pattern.casefold() in value.casefold()
        for pattern in args.match
        for value in (edition.source_name, edition.archive_name, edition.target)
    )


def nonnegative_int(value):
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("expected a nonnegative number")
    return number


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Directory containing game folders and their .scummvm markers.")
    parser.add_argument("--output", type=Path, required=True, help="Local archive destination outside the source and repository.")
    parser.add_argument("--inventory", type=Path, help="Write a JSON inventory and per-edition results here.")
    parser.add_argument("--match", action="append", help="Select editions by title or target substring. May be repeated.")
    parser.add_argument("--max-expanded-mib", type=nonnegative_int, help="Select only editions at or below this expanded size.")
    parser.add_argument("--reserve-mib", type=nonnegative_int, default=1024, help="Leave this much free space after packaging (default: 1024).")
    parser.add_argument("--write", action="store_true", help="Create verified ZIPs. Without this flag, only inventory the collection.")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    output = args.output.expanduser().resolve()
    if not source.is_dir():
        parser.error(f"Source is not a directory: {source}")
    if output.is_relative_to(source) or output.is_relative_to(REPO_ROOT):
        parser.error("Choose an output directory outside the source collection and this repository.")
    if output.exists() and not output.is_dir():
        parser.error(f"Output is not a directory: {output}")
    if args.inventory:
        args.inventory = args.inventory.expanduser().resolve()
        if args.inventory.is_relative_to(source):
            parser.error("Choose an inventory path outside the source collection.")
        if args.inventory.suffix.lower() != ".json":
            parser.error("Choose a .json path for the inventory.")
        if not args.inventory.parent.is_dir():
            parser.error(f"Inventory directory does not exist: {args.inventory.parent}")

    editions, issues = collection(source)
    rows = [output_entry(edition, output, selected_edition(edition, args)) for edition in editions]
    space = shutil.disk_usage(existing_parent(output)).free
    needed = sum(row["archiveBoundBytes"] for row in rows if row["status"] == "planned")
    report = {
        "source": str(source),
        "output": str(output),
        "freeBytesBeforeRun": space,
        "reserveBytes": args.reserve_mib * MIB,
        "newArchiveBoundBytes": needed,
        "editions": rows,
        "issues": issues,
    }
    selected = sum(row["selected"] for row in rows)
    print(f"{len(editions)} editions found, {selected} selected, {len(issues)} inventory notices.", flush=True)
    for issue in issues:
        if issue["status"] == "invalid-edition":
            print(f"invalid-edition: {issue['sourceName']}: {issue['reason']}", file=sys.stderr, flush=True)
    print(
        f"New archives need at most {needed / (1024 * MIB):.2f} GiB. "
        f"The destination has {space / (1024 * MIB):.2f} GiB free.",
        flush=True,
    )

    if args.write and not selected:
        report["status"] = "no-matches"
        print("No editions matched the requested selection.", file=sys.stderr)
    elif args.write and needed and space < needed + report["reserveBytes"]:
        report["status"] = "insufficient-space"
        print("The destination cannot fit this selection and the requested reserve.", file=sys.stderr)
    elif args.write:
        report["status"] = "written"
        output.mkdir(parents=True, exist_ok=True)
        for edition, row in zip(editions, rows):
            if not row["selected"]:
                continue
            path = output / edition.archive_name
            try:
                if os.path.lexists(path):
                    verify_archive(path, edition)
                    row["status"] = "reused"
                else:
                    if shutil.disk_usage(output).free < row["archiveBoundBytes"] + report["reserveBytes"]:
                        raise OSError("Writing this archive would breach the free space reserve.")
                    write_archive(path, edition)
                    row["status"] = "written"
                row["archiveBytes"] = path.stat().st_size
                print(f"{row['status']}: {edition.archive_name}", flush=True)
            except (OSError, ValueError, RuntimeError, zipfile.BadZipFile) as error:
                row["status"] = "conflict" if os.path.lexists(path) else "error"
                row["reason"] = str(error)
                report["status"] = "incomplete"
                print(f"{row['status']}: {edition.archive_name}: {error}", file=sys.stderr, flush=True)
    else:
        report["status"] = "inventory"

    if args.inventory:
        args.inventory.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if any(issue["status"] == "invalid-edition" for issue in issues):
        return 1
    return int(report["status"] in {"incomplete", "insufficient-space", "no-matches"})


if __name__ == "__main__":
    sys.exit(main())
