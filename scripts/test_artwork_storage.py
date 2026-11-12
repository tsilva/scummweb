"""Synthetic R2 publisher tests. No credentials or real network requests."""
import hashlib
import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from botocore.exceptions import ClientError
from upload_artwork_to_r2 import publish, CACHE_CONTROL, artwork_workspace
import upload_games_to_r2 as games


class ArtworkPublishingTests(unittest.TestCase):
    def test_workspace_names_cannot_change_the_source_root_or_target_bucket(self):
        with patch.dict("os.environ", {"SCUMMWEB_ARTWORK_WORKSPACE": "artwork-optimization"}):
            self.assertEqual(artwork_workspace(), Path(".internal/evidence/artwork-optimization"))
        for value in ("../other", "/tmp/other", "a/b", ""):
            with patch.dict("os.environ", {"SCUMMWEB_ARTWORK_WORKSPACE": value}):
                with self.assertRaises(ValueError):
                    artwork_workspace()

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
        config = session.client.call_args.kwargs["config"]
        self.assertEqual(config.connect_timeout, 10)
        self.assertEqual(config.read_timeout, 30)
        self.assertEqual(config.retries["total_max_attempts"], 2)

    def test_game_publisher_reports_status_without_provider_details(self):
        error = ClientError({"Error": {"Code": "AccessDenied", "Message": "private-provider-detail"},
                             "ResponseMetadata": {"HTTPStatusCode": 403}}, "HeadObject")
        with patch.object(games, "main", side_effect=error):
            with self.assertRaises(SystemExit) as result:
                games.run()
        self.assertIn("HTTP 403", str(result.exception))
        self.assertNotIn("private-provider-detail", str(result.exception))

    def test_game_parts_use_signed_fixed_length_payloads_without_chunked_trailers(self):
        class RequestCaptured(Exception):
            pass

        payload = b"synthetic game part"
        client = games.boto3.client(
            "s3", endpoint_url="https://r2.invalid", region_name="auto",
            aws_access_key_id="synthetic", aws_secret_access_key="synthetic",
            config=games.r2_client_config(),
        )

        def inspect_request(request, **_):
            self.assertNotIn("Transfer-Encoding", request.headers)
            self.assertNotIn("x-amz-trailer", request.headers)
            self.assertEqual(str(request.headers["Content-Length"]), str(len(payload)))
            self.assertEqual(request.headers["x-amz-content-sha256"], hashlib.sha256(payload).hexdigest().encode())
            raise RequestCaptured()

        client.meta.events.register("before-send.s3.UploadPart", inspect_request)
        with self.assertRaises(RequestCaptured):
            client.upload_part(Bucket="synthetic", Key="game.zip", UploadId="synthetic",
                               PartNumber=1, Body=payload)

    def test_small_game_upload_preserves_exact_bytes_and_uses_conditional_create(self):
        filename = self.root / "game.zip"
        filename.write_bytes(self.data)
        client = Mock()

        def receive(**request):
            self.assertEqual(request["Body"].read(), self.data)
            self.assertEqual(request["ContentLength"], len(self.data))
            expected = base64.b64encode(hashlib.md5(self.data, usedforsecurity=False).digest()).decode()
            self.assertEqual(request["ContentMD5"], expected)
            self.assertEqual(request["IfNoneMatch"], "*")
            self.assertEqual(request["CacheControl"], CACHE_CONTROL)

        client.put_object.side_effect = receive
        games.upload_game_file(client, filename, "game.zip", {"CacheControl": CACHE_CONTROL})
        client.upload_file.assert_not_called()

    def test_large_game_keeps_multipart_transfer(self):
        filename = self.root / "large.zip"
        with filename.open("wb") as stream:
            stream.truncate(games.SINGLE_UPLOAD_LIMIT + 1)
        client = Mock()
        games.upload_game_file(client, filename, "large.zip", {"ContentType": "application/zip"})
        client.put_object.assert_not_called()
        client.upload_file.assert_called_once()


if __name__ == "__main__":
    unittest.main()
