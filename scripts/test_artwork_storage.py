"""Synthetic R2 publisher tests. No credentials or real network requests."""
import hashlib
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
from upload_artwork_to_r2 import publish, CACHE_CONTROL
import upload_games_to_r2 as games


class ArtworkPublishingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.data = b"synthetic artwork"
        sha256 = hashlib.sha256(self.data).hexdigest()
        self.entry = {"key": f"artwork/{sha256}/sample-cover.webp", "sha256": sha256,
                      "bytes": len(self.data), "contentType": "image/webp"}
        self.manifest = {"version": 1, "origin": "https://scummvm-games.tsilva.eu",
                         "files": {"/launcher/sample-cover.webp": self.entry}}
        self.filename = self.root / ".internal/evidence/artwork-migration/objects" / self.entry["key"]
        self.filename.parent.mkdir(parents=True)
        self.filename.write_bytes(self.data)

    def response(self, data=None):
        return {"Body": io.BytesIO(self.data if data is None else data),
                "ContentType": "image/webp", "CacheControl": CACHE_CONTROL}

    def test_missing_object_is_created_once_then_verified_by_readback(self):
        client = Mock()
        missing = ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        client.get_object.side_effect = [missing, self.response()]
        self.assertEqual(publish(client, self.manifest, self.root), {"uploaded": 1, "verified": 1})
        self.assertEqual(client.put_object.call_args.kwargs["IfNoneMatch"], "*")
        self.assertEqual(client.put_object.call_args.kwargs["Body"], self.data)
        client.delete_objects.assert_not_called()

    def test_matching_existing_objects_are_read_but_never_overwritten(self):
        client = Mock()
        client.get_object.return_value = self.response()
        self.assertEqual(publish(client, self.manifest, self.root), {"uploaded": 0, "verified": 1})
        client.put_object.assert_not_called()

    def test_corrupted_existing_object_is_rejected_and_preserved(self):
        client = Mock()
        client.get_object.return_value = self.response(b"wrong")
        with self.assertRaisesRegex(RuntimeError, "readback failed"):
            publish(client, self.manifest, self.root)
        client.put_object.assert_not_called()

    def test_changed_local_input_and_namespace_escape_fail_before_network(self):
        client = Mock()
        self.filename.write_bytes(b"changed")
        with self.assertRaises(ValueError):
            publish(client, self.manifest, self.root)
        client.get_object.assert_not_called()
        self.filename.write_bytes(self.data)
        self.entry["key"] = "games/sky.zip"
        with self.assertRaises(ValueError):
            publish(client, self.manifest, self.root)
        client.get_object.assert_not_called()

    def test_full_game_prune_preserves_artwork_in_the_shared_bucket(self):
        payload = self.root / "games"
        payload.mkdir()
        (payload / "sky.zip").write_bytes(b"game")
        args = Mock(game=None, force=False, prune=True)
        client = Mock()
        session = Mock()
        session.client.return_value = client
        with patch.object(games, "parse_args", return_value=args), \
                patch.object(games, "load_dotenv"), \
                patch.object(games, "resolve_games_dir", return_value=payload), \
                patch.object(games, "require_env", return_value="synthetic"), \
                patch.object(games.boto3.session, "Session", return_value=session), \
                patch.object(games, "remote_key_exists", return_value=True), \
                patch.object(games, "list_remote_keys", return_value=["sky.zip", "obsolete.zip", self.entry["key"]]), \
                patch.object(games, "delete_remote_keys", return_value=1) as delete:
            games.main()
        self.assertEqual(delete.call_args.args[2], ["obsolete.zip"])


if __name__ == "__main__":
    unittest.main()
