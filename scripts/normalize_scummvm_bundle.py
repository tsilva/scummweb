#!/usr/bin/env python3

from pathlib import Path
import shutil
import sys

ini_path = Path(sys.argv[1])
games_dir = Path(sys.argv[2])
sword25_data_path = Path(sys.argv[3])

if ini_path.is_file() and sword25_data_path.is_file():
    ini_text = ini_path.read_text()
    if "[sword25]" not in ini_text:
        section = """
[sword25]
description=Broken Sword 2.5: The Return of the Templars
path=/games/sword25
engineid=sword25
gameid=sword25
guioptions=sndNoMIDI noAspect gameOption1
"""
        ini_path.write_text(ini_text.rstrip() + "\n" + section.lstrip())

allowed_engine_ids = {
    "dreamweb",
    "sky",
    "queen",
    "lure",
    "drascula",
    "parallaction",
    "sword25",
}
seen_game_ids = set()

lines = ini_path.read_text().splitlines()
sections = []
current = None

for line in lines:
    if line.startswith("[") and line.endswith("]"):
        current = {"name": line[1:-1], "lines": [line], "values": {}}
        sections.append(current)
        continue

    if current is None:
        sections.append({"name": "", "lines": [line], "values": {}})
        continue

    current["lines"].append(line)
    if "=" in line:
        key, value = line.split("=", 1)
        current["values"][key.strip()] = value.strip()


def normalize_section_lines(section_lines, game_id):
    normalized_path = f"path=/games/{game_id}"
    normalized_lines = []
    found_path = False

    for line in section_lines:
        if line.startswith("path="):
            normalized_lines.append(normalized_path)
            found_path = True
            continue

        normalized_lines.append(line)

    if not found_path:
        normalized_lines.append(normalized_path)

    return normalized_lines


pruned_paths = []
kept_lines = []

for section in sections:
    name = section["name"]
    values = section["values"]

    if not name or name == "scummvm":
        kept_lines.extend(section["lines"])
        continue

    engine_id = values.get("engineid", "")
    game_path = values.get("path", "")
    game_id = values.get("gameid", "")

    if engine_id in allowed_engine_ids:
        if not game_id:
            raise SystemExit(f"Missing gameid for kept ScummVM target: {name}")
        if game_id in seen_game_ids:
            raise SystemExit(f"Duplicate gameid '{game_id}' for kept ScummVM target: {name}")

        seen_game_ids.add(game_id)
        kept_lines.extend(normalize_section_lines(section["lines"], game_id))
        continue

    if game_path == "/games":
        pruned_paths.append("")
    elif game_path.startswith("/games/"):
        pruned_paths.append(game_path.removeprefix("/games/"))

updated_lines = kept_lines

try:
    section_start = updated_lines.index("[scummvm]")
except ValueError:
    section_start = -1

if section_start != -1:
    section_end = next(
        (
            index
            for index in range(section_start + 1, len(updated_lines))
            if updated_lines[index].startswith("[") and updated_lines[index].endswith("]")
        ),
        len(updated_lines),
    )

    for index in range(section_start + 1, section_end):
        if updated_lines[index].startswith("gui_return_to_launcher_at_exit="):
            updated_lines[index] = "gui_return_to_launcher_at_exit=false"
            break
    else:
        updated_lines.insert(section_end, "gui_return_to_launcher_at_exit=false")

ini_path.write_text("\n".join(updated_lines).rstrip() + "\n")

for relative_path in sorted(set(pruned_paths)):
    if not relative_path:
        continue

    target = games_dir / relative_path
    if target.exists():
        shutil.rmtree(target)
