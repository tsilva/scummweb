#!/usr/bin/env python3
"""Publish only planned, content-addressed artwork to the existing game bucket.

Run inside an explicitly approved publishing credential route. This script never
loads dotenv files, discovers credentials, prunes objects, or alters bucket settings.
"""
import hashlib
import json
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACCOUNT = "83e1ce4a70ea388693e8525a772ccefa"
BUCKET = "scummvm-games"
ENDPOINT = f"https://{ACCOUNT}.r2.cloudflarestorage.com"
CACHE_CONTROL = "public, max-age=31536000, immutable"


def artwork_workspace():
    import re
    name = os.environ.get("SCUMMWEB_ARTWORK_WORKSPACE", "artwork-migration")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", name):
        raise ValueError("Invalid artwork workspace name")
    return Path(".internal/evidence") / name


def publish(client, manifest, root=ROOT):
    if (manifest.get("version") != 1 or manifest.get("origin") != "https://scummvm-games.tsilva.eu"
            or not isinstance(manifest.get("files"), dict) or not manifest["files"]):
        raise ValueError("Invalid artwork manifest")
    import re
    prepared = []
    for name, entry in manifest["files"].items():
        sha256 = entry["sha256"]
        if (not re.fullmatch(r"[a-f0-9]{64}", sha256)
                or entry["key"] != f"artwork/{sha256}/{Path(name).name}"
                or not re.fullmatch(r"(?:/launcher/(?:(?:responsive|optimized)/)?[a-z0-9-]+\.(?:webp|png|avif)|/image-assets/sources/road-gameplay\.jpg)", name)
                or entry["contentType"] not in {"image/png", "image/webp", "image/avif", "image/jpeg"}
                or type(entry["bytes"]) is not int or entry["bytes"] < 1):
            raise ValueError("Invalid artwork object")
        filename = root / artwork_workspace() / "objects" / entry["key"]
        if filename.is_file():
            data = filename.read_bytes()
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != sha256:
                raise ValueError("Artwork changed after planning")
        prepared.append((filename, entry))

    # Check all local inputs before the first request. Never overwrite an existing key.
    from botocore.exceptions import ClientError
    def upload_one(item):
        filename, entry = item
        uploaded = 0
        try:
            result = client.get_object(Bucket=BUCKET, Key=entry["key"])
        except ClientError as exc:
            if str(exc.response.get("Error", {}).get("Code")) not in {"404", "NoSuchKey", "NotFound"}:
                raise RuntimeError("R2 artwork lookup failed") from None
            data = filename.read_bytes()
            # Recheck immediately before upload; plans and object backups are mutable.
            if len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
                raise ValueError("Artwork changed before upload")
            client.put_object(Bucket=BUCKET, Key=entry["key"], Body=data,
                              ContentType=entry["contentType"], CacheControl=CACHE_CONTROL,
                              IfNoneMatch="*")
            uploaded += 1
            result = client.get_object(Bucket=BUCKET, Key=entry["key"])
        with result["Body"] as body:
            data = body.read(entry["bytes"] + 1)
        if (len(data) != entry["bytes"] or hashlib.sha256(data).hexdigest() != entry["sha256"]
                or result.get("ContentType") != entry["contentType"]
                or result.get("CacheControl") != CACHE_CONTROL):
            raise RuntimeError("R2 artwork readback failed; existing objects were preserved")
        return uploaded

    uploaded = 0
    with ThreadPoolExecutor(max_workers=8) as workers:
        for start in range(0, len(prepared), 8):
            batch = prepared[start:start + 8]
            uploaded += sum(workers.map(upload_one, batch))
            print(f"Artwork publisher: verified {start + len(batch)}/{len(prepared)}", flush=True)
    return {"uploaded": uploaded, "verified": len(prepared)}


def main():
    import boto3
    from botocore.config import Config
    if not all(os.environ.get(key) for key in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")):
        raise ValueError("An approved R2 publishing credential route is required")
    if os.environ.get("AWS_SESSION_TOKEN"):
        raise ValueError("Unexpected publishing session override")
    for name, expected in {"SCUMMVM_R2_BUCKET": BUCKET, "SCUMMVM_R2_ENDPOINT": ENDPOINT}.items():
        if os.environ.get(name) not in (None, "", expected):
            raise ValueError("R2 target overrides are not supported")
    client = boto3.client("s3", endpoint_url=ENDPOINT, region_name="auto",
                          aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
                          aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
                          config=Config(signature_version="s3v4", retries={"max_attempts": 2}))
    manifest = json.loads((ROOT / artwork_workspace() / "manifest.json").read_text())
    print(json.dumps(publish(client, manifest)))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        raise SystemExit("Artwork upload failed; provider and credential details suppressed.") from None
