"""Bounded, synthetic policy and fail-closed tests; no provider access."""

import copy
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


def module(name):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).with_name(name + ".py")
    )
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


relay, launcher = module("artwork_relay"), module("artwork_vault")


class ArtworkVaultTests(unittest.TestCase):
    def setUp(self):
        sha = hashlib.sha256(b"synthetic artwork").hexdigest()
        self.plan = {
            "version": 1,
            "origin": relay.ORIGIN,
            "files": {
                "/launcher/sample.webp": {
                    "sha256": sha,
                    "key": f"artwork/{sha}/sample.webp",
                    "bytes": 17,
                    "contentType": "image/webp",
                }
            },
        }

    def test_plan_rejects_large_objects_wrong_mime_keys_and_origins(self):
        for field, value in [
            ("bytes", relay.MAX_BYTES + 1),
            ("bytes", True),
            ("key", "games/unrelated"),
            ("contentType", "image/png"),
            ("sha256", "bad"),
        ]:
            plan = copy.deepcopy(self.plan)
            next(iter(plan["files"].values()))[field] = value
            with self.assertRaises(ValueError):
                relay.entries(plan)
        self.plan["origin"] = "https://unrelated.example"
        with self.assertRaises(ValueError):
            relay.entries(self.plan)

    def test_valid_plan_is_reduced_to_needed_fields(self):
        self.assertEqual(len(relay.entries(self.plan)), 1)
        self.plan["version"] = True
        with self.assertRaises(ValueError):
            relay.entries(self.plan)

    def test_workspace_traversal_stops_before_reading(self):
        for value in ["../other", "/tmp/other", "", "x/y"]:
            with self.assertRaises(ValueError):
                launcher.plan(value)

    def test_missing_binding_and_scope_arguments_never_start_a_tool(self):
        with (
            patch.object(launcher, "load", side_effect=ValueError),
            patch.object(launcher.subprocess, "Popen") as launch,
        ):
            for args in [
                ["check"],
                ["publish"],
                ["check", "--project=other"],
                ["publish", "x", "--force"],
                ["unknown"],
            ]:
                with self.assertRaises(ValueError):
                    launcher.main(args)
            launch.assert_not_called()

    def test_relay_requires_exact_injected_credential(self):
        policy = {
            "check_object": next(iter(self.plan["files"].values())),
            "credential_sha256": "0" * 64,
        }
        bridge = relay.Bridge(policy, self.plan)
        with self.assertRaises(PermissionError):
            bridge.call("check", {}, json.dumps({"access_key_id": "fake"}))

    def test_profile_rejects_scope_schema_and_source_pin_changes(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            base.chmod(0o700)
            p = {
                **launcher.EXPECTED,
                "code_sha256": {name: "0" * 64 for name in launcher.FILES},
                "runtime_sha256": {"python": "0" * 64, "infisical": "0" * 64},
                "policy_sha256": "0" * 64,
                "relay_sha256": "0" * 64,
            }
            for name in ["policy.json", "relay.py"]:
                (base / name).write_text("{}")
                (base / name).chmod(0o600)
            for delta in [
                {"environment": "prod"},
                {"unexpected": "field"},
                {"version": True},
                {},
            ]:
                (base / "profile.json").write_text(json.dumps({**p, **delta}))
                (base / "profile.json").chmod(0o600)
                with (
                    patch.object(launcher, "BASE", base),
                    self.assertRaises(ValueError),
                ):
                    launcher.load()

    def test_protected_paths_reject_symlinks_and_shared_modes(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary).resolve() / "profile"
            path.write_text("metadata only")
            path.chmod(0o644)
            with self.assertRaises(ValueError):
                launcher.protected(path)
            path.chmod(0o600)
            launcher.protected(path)
            link = path.with_name("alias")
            os.symlink(path, link)
            with self.assertRaises(ValueError):
                launcher.protected(link)

    def test_native_launch_pins_project_and_child_sandbox(self):
        arguments = launcher.command(
            launcher.EXPECTED, 12345, "check", "no-artwork-read",
            Path("/synthetic/manifest"), Path("/synthetic/objects"),
        )
        self.assertIn("--project-id=5078c850-3f93-46d8-8afe-82107df8b931", arguments)
        self.assertIn("--domain=https://app.infisical.com", arguments)
        self.assertIn("/usr/bin/sandbox-exec", arguments)
        self.assertIn("--no-ca-trust", arguments)
        self.assertIn("--no-skills", arguments)

    def test_read_only_relay_and_invalid_body_stop_before_upstream(self):
        raw = json.dumps({"access_key_id": "a" * 32, "secret_access_key": "b" * 64})
        policy = {
            "check_object": next(iter(self.plan["files"].values())),
            "credential_sha256": hashlib.sha256(raw.encode()).hexdigest(),
        }
        with patch.object(relay.urllib.request, "build_opener") as upstream:
            with self.assertRaises(PermissionError):
                relay.Bridge(policy, None).call(
                    "get", {"key": policy["check_object"]["key"]}, raw
                )
            with self.assertRaises(ValueError):
                relay.Bridge(policy, self.plan).call(
                    "put",
                    {"key": policy["check_object"]["key"], "body": "Y2hhbmdlZA=="},
                    raw,
                )
            upstream.assert_not_called()


if __name__ == "__main__":
    unittest.main()
