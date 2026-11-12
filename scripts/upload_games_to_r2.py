#!/usr/bin/env python3

import argparse
import base64
import hashlib
import json
import os
from mimetypes import guess_type
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from boto3.exceptions import S3UploadFailedError


ROOT = Path(__file__).resolve().parents[1]
DIST_GAMES_DIR = ROOT / "dist" / "games"
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
GAMES_LIBRARY_PATH = ROOT / "dist" / "games.json"
SINGLE_UPLOAD_LIMIT = 100 * 1024 * 1024


def r2_client_config():
    # Avoid optional AWS streaming-checksum trailers on the S3-compatible
    # endpoint. SigV4 still signs the SHA-256 of every uploaded payload.
    return Config(
        signature_version="s3v4",
        request_checksum_calculation="when_required",
        s3={"payload_signing_enabled": True},
        connect_timeout=10,
        read_timeout=30,
        retries={"mode": "standard", "total_max_attempts": 2},
    )


def upload_game_file(client, filename, key, metadata, overwrite=False):
    size = filename.stat().st_size
    if size > SINGLE_UPLOAD_LIMIT:
        client.upload_file(str(filename), BUCKET, key, ExtraArgs=metadata)
        return
    # R2 recommends a single PUT for small/medium objects. Besides avoiding a
    # multipart session, this can atomically preserve a concurrently created key.
    with filename.open("rb") as body:
        checksum = hashlib.md5(usedforsecurity=False)
        for block in iter(lambda: body.read(1024 * 1024), b""):
            checksum.update(block)
        body.seek(0)
        client.put_object(
            Bucket=BUCKET, Key=key, Body=body, ContentLength=size,
            ContentMD5=base64.b64encode(checksum.digest()).decode("ascii"),
            **metadata, **({} if overwrite else {"IfNoneMatch": "*"}),
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

    if DIST_GAMES_DIR.is_dir():
        return DIST_GAMES_DIR

    raise SystemExit(f"Missing games directory. Expected build output at {DIST_GAMES_DIR}")


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
            "'queen' or a canonical gameId folder like 'sword25'."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite remote files even when the key already exists.",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help=(
            "Delete remote objects that are not present in the local upload scope. "
            "When used without --game, this removes legacy keys across the entire bucket."
        ),
    )
    return parser.parse_args()


def load_games_library() -> Optional[Dict]:
    if GAMES_LIBRARY_PATH.is_file():
        return json.loads(GAMES_LIBRARY_PATH.read_text())

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
            f"Could not resolve --game because no launcher metadata was found at {GAMES_LIBRARY_PATH}."
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
            f"Game '{target}' does not resolve to a canonical gameId subdirectory."
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


def list_remote_keys(client, bucket: str, prefix: Optional[str] = None) -> List[str]:
    paginator = client.get_paginator("list_objects_v2")
    keys: List[str] = []

    paginate_args = {"Bucket": bucket}
    if prefix:
        paginate_args["Prefix"] = prefix

    for page in paginator.paginate(**paginate_args):
        for entry in page.get("Contents", []):
            key = entry.get("Key")
            if key:
                keys.append(key)

    return keys


def delete_remote_keys(client, bucket: str, keys: List[str]) -> int:
    deleted = 0
    for start in range(0, len(keys), 1000):
        batch = keys[start : start + 1000]
        if not batch:
            continue

        result = client.delete_objects(
            Bucket=bucket,
            Delete={"Objects": [{"Key": key} for key in batch], "Quiet": True},
        )
        if result.get("Errors"):
            raise RuntimeError("R2 reported errors deleting game objects.")
        deleted += len(batch)

    return deleted


def main() -> None:
    args = parse_args()
    load_dotenv(ROOT / ".env")
    games_dir = resolve_games_dir()
    selected_prefix = resolve_selected_prefix(games_dir, args.game) if args.game else None
    if args.prune and selected_prefix and (games_dir / selected_prefix).is_file():
        raise SystemExit("Pruning requires a game directory, not an individual file.")

    session = boto3.session.Session(
        aws_access_key_id=require_env("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=require_env("AWS_SECRET_ACCESS_KEY"),
        region_name="auto",
    )
    client = session.client(
        "s3",
        endpoint_url=ENDPOINT,
        config=r2_client_config(),
    )

    files, scope_label = collect_files(games_dir, selected_prefix)
    if any(path.relative_to(games_dir).parts[0] == "artwork" for path in files):
        raise SystemExit("The artwork/ namespace is reserved for the artwork publisher.")
    force_label = " with overwrite enabled" if args.force else ""
    prune_label = " with prune enabled" if args.prune else ""
    print(
        f"Uploading {len(files)} files from {games_dir}"
        f" (scope: {scope_label}) to bucket '{BUCKET}' via {ENDPOINT}{force_label}{prune_label}",
        flush=True,
    )

    local_keys = {path.relative_to(games_dir).as_posix() for path in files}
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

        print(f"Checking object: {key}", flush=True)
        if not should_overwrite and remote_key_exists(client, BUCKET, key):
            skipped += 1
            if skipped % 25 == 0 or index == len(files):
                print(f"Skipped {skipped} existing files so far; latest: {key}")
            continue

        print(f"Uploading object: {key} ({path.stat().st_size} bytes)", flush=True)
        upload_game_file(client, path, key, extra_args, overwrite=should_overwrite)
        uploaded += 1

        if index % 25 == 0 or index == len(files):
            print(f"Processed {index}/{len(files)} files; uploaded latest: {key}", flush=True)

    deleted = 0
    if args.prune:
        remote_scope_prefix = f"{selected_prefix}/" if selected_prefix else None
        remote_keys = list_remote_keys(client, BUCKET, remote_scope_prefix)
        keys_to_delete = [key for key in remote_keys
                          if key not in local_keys and not key.startswith("artwork/")]
        deleted = delete_remote_keys(client, BUCKET, keys_to_delete)
        print(f"Pruned {deleted} remote files outside the local scope")

    print(f"Upload complete: uploaded {uploaded}, skipped {skipped}, deleted {deleted}")


def run():
    try:
        main()
    except (BotoCoreError, ClientError, S3UploadFailedError) as error:
        # Provider messages and request details can contain private data.
        # Report only the SDK exception category and numeric HTTP status.
        status = (error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
                  if isinstance(error, ClientError) else None)
        suffix = f" (HTTP {status})" if type(status) is int else ""
        raise SystemExit(f"R2 publishing failed: {type(error).__name__}{suffix}; provider details withheld.") from None


if __name__ == "__main__":
    run()
