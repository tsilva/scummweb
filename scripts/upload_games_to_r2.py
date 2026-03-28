#!/usr/bin/env python3

import os
from mimetypes import guess_type
from pathlib import Path

import boto3
from botocore.config import Config


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


def main() -> None:
    load_dotenv(ROOT / ".env")
    games_dir = resolve_games_dir()

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

    files = sorted(path for path in games_dir.rglob("*") if path.is_file())
    print(f"Uploading {len(files)} files from {games_dir} to bucket '{BUCKET}' via {ENDPOINT}")

    for index, path in enumerate(files, 1):
        key = path.relative_to(games_dir).as_posix()
        extra_args = {"CacheControl": CACHE_CONTROL}
        content_type, _ = guess_type(str(path))
        if content_type:
            extra_args["ContentType"] = content_type

        client.upload_file(str(path), BUCKET, key, ExtraArgs=extra_args)

        if index % 25 == 0 or index == len(files):
            print(f"Uploaded {index}/{len(files)}: {key}")

    print("Upload complete")


if __name__ == "__main__":
    main()
