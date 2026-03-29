#!/usr/bin/env python3

import argparse
import json
import os
from mimetypes import guess_type
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


ROOT = Path(__file__).resolve().parents[1]
DIST_GAMES_DIR = ROOT / "dist" / "games"
PUBLIC_GAMES_DIR = ROOT / "public" / "games"
BUCKET = os.environ.get("SCUMMVM_R2_BUCKET", "scummvm-games")
ENDPOINT = os.environ.get(
    "SCUMMVM_R2_ENDPOINT",
    "https://83e1ce4a70ea388693e8525a772ccefa.r2.cloudflarestorage.com",
)
CACHE_CONTROL = os.environ.get(
    "SCUMMVM_R2_CACHE_CONTROL",
    "public, max-age=31536000, immutable",
)
INDEX_CACHE_CONTROL = os.environ.get(
    "SCUMMVM_R2_INDEX_CACHE_CONTROL",
    "public, max-age=60, stale-while-revalidate=300",
)
GAMES_LIBRARY_CANDIDATES = (
    ROOT / "dist" / "games.json",
    ROOT / "public" / "games.json",
)


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def load_dotenv(path: Path) -> None:
    if not path.is_file():
        return

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


def resolve_games_dir() -> Path:
    override = os.environ.get("SCUMMVM_GAMES_UPLOAD_DIR")
    if override:
        candidate = Path(override).expanduser()
        if candidate.is_dir():
            return candidate
        raise SystemExit(f"Configured SCUMMVM_GAMES_UPLOAD_DIR does not exist: {candidate}")

    for candidate in (DIST_GAMES_DIR, PUBLIC_GAMES_DIR):
        if candidate.is_dir():
            return candidate

    raise SystemExit(
        f"Missing games directory. Checked {DIST_GAMES_DIR} and {PUBLIC_GAMES_DIR}"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Upload built game payloads to Cloudflare R2. Existing remote files are "
            "skipped by default."
        )
    )
    parser.add_argument(
        "--game",
        help=(
            "Upload only a single game subtree. Accepts a launcher target like "
            "'queen' or a relative folder like 'flight-of-the-amazon-queen'. "
            "Root-mounted games cannot be uploaded selectively."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite remote files even when the key already exists.",
    )
    return parser.parse_args()


def load_games_library() -> Optional[Dict]:
    for candidate in GAMES_LIBRARY_CANDIDATES:
        if candidate.is_file():
            return json.loads(candidate.read_text())

    return None


def resolve_selected_prefix(games_dir: Path, selection: str) -> str:
    normalized = selection.strip().strip("/")
    if not normalized:
        raise SystemExit("The --game value must not be empty.")

    direct_candidate = games_dir / normalized
    if direct_candidate.exists():
        return normalized

    library = load_games_library()
    if not library:
        raise SystemExit(
            "Could not resolve --game because no launcher metadata was found in dist/games.json or public/games.json."
        )

    games = library.get("games") or []
    matches = []
    for game in games:
        game_path = str(game.get("path") or "").strip()
        game_target = str(game.get("target") or "").strip()
        relative_path = normalize_game_relative_path(game_path)
        basename = Path(relative_path).name if relative_path else ""

        if normalized in {game_target, relative_path, basename}:
            matches.append((game_target, relative_path))

    if not matches:
        known = ", ".join(sorted(game.get("target", "") for game in games if game.get("target")))
        raise SystemExit(f"Unknown game '{selection}'. Known targets: {known or 'none'}")

    if len(matches) > 1:
        targets = ", ".join(sorted(target for target, _ in matches))
        raise SystemExit(f"Ambiguous --game '{selection}'. Matching targets: {targets}")

    target, relative_path = matches[0]
    if not relative_path:
        raise SystemExit(
            f"Game '{target}' is mounted at the games root and cannot be uploaded selectively safely. "
            "Run the full upload or reorganize that game into its own subdirectory first."
        )

    return relative_path


def normalize_game_relative_path(game_path: str) -> str:
    normalized = game_path.strip().strip("/")
    if normalized == "games":
        return ""
    if normalized.startswith("games/"):
        return normalized[len("games/") :]
    return normalized


def collect_required_index_files(games_dir: Path, selected_prefix: str) -> List[Path]:
    """Include ancestor index manifests so scoped uploads stay discoverable."""
    required: List[Path] = []
    current = games_dir

    root_index = current / "index.json"
    if root_index.is_file():
        required.append(root_index)

    for part in Path(selected_prefix).parts[:-1]:
        current = current / part
        index_path = current / "index.json"
        if index_path.is_file():
            required.append(index_path)

    return required


def collect_files(games_dir: Path, selected_prefix: Optional[str]) -> Tuple[List[Path], str]:
    if not selected_prefix:
        files = sorted(path for path in games_dir.rglob("*") if path.is_file())
        return files, "."

    scoped_path = games_dir / selected_prefix
    if scoped_path.is_file():
        return [scoped_path], selected_prefix

    if not scoped_path.is_dir():
        raise SystemExit(f"Selected game path does not exist: {scoped_path}")

    files = sorted(path for path in scoped_path.rglob("*") if path.is_file())
    seen = {path.relative_to(games_dir).as_posix() for path in files}

    for index_path in collect_required_index_files(games_dir, selected_prefix):
        relative_key = index_path.relative_to(games_dir).as_posix()
        if relative_key not in seen:
            files.insert(0, index_path)
            seen.add(relative_key)

    return files, selected_prefix


def remote_key_exists(client, bucket: str, key: str) -> bool:
    try:
        client.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError as exc:
        error_code = str(exc.response.get("Error", {}).get("Code", ""))
        if error_code in {"404", "NoSuchKey", "NotFound"}:
            return False
        raise


def main() -> None:
    args = parse_args()
    load_dotenv(ROOT / ".env")
    games_dir = resolve_games_dir()
    selected_prefix = resolve_selected_prefix(games_dir, args.game) if args.game else None

    session = boto3.session.Session(
        aws_access_key_id=require_env("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=require_env("AWS_SECRET_ACCESS_KEY"),
        region_name="auto",
    )
    client = session.client(
        "s3",
        endpoint_url=ENDPOINT,
        config=Config(signature_version="s3v4"),
    )

    files, scope_label = collect_files(games_dir, selected_prefix)
    force_label = " with overwrite enabled" if args.force else ""
    print(
        f"Uploading {len(files)} files from {games_dir}"
        f" (scope: {scope_label}) to bucket '{BUCKET}' via {ENDPOINT}{force_label}"
    )

    uploaded = 0
    skipped = 0
    for index, path in enumerate(files, 1):
        key = path.relative_to(games_dir).as_posix()
        cache_control = INDEX_CACHE_CONTROL if key == "index.json" or key.endswith("/index.json") else CACHE_CONTROL
        extra_args = {"CacheControl": cache_control}
        content_type, _ = guess_type(str(path))
        if content_type:
            extra_args["ContentType"] = content_type

        should_overwrite = args.force or (
            selected_prefix is not None and (key == "index.json" or key.endswith("/index.json"))
        )

        if not should_overwrite and remote_key_exists(client, BUCKET, key):
            skipped += 1
            if skipped % 25 == 0 or index == len(files):
                print(f"Skipped {skipped} existing files so far; latest: {key}")
            continue

        client.upload_file(str(path), BUCKET, key, ExtraArgs=extra_args)
        uploaded += 1

        if index % 25 == 0 or index == len(files):
            print(f"Processed {index}/{len(files)} files; uploaded latest: {key}")

    print(f"Upload complete: uploaded {uploaded}, skipped {skipped}")


if __name__ == "__main__":
    main()
