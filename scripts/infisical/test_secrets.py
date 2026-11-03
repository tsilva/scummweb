"""Check transport, readback and application isolation."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from common import Infisical, SecretError, application_environment, publisher_environment, KEYS, ROOT
import run as launcher

PROJECT = "e1c358f8-0678-45d7-a2a8-270c2f29aadd"
VALUE = "dummy-only '$HOME' \"quoted\"\\backslash\nsecond line\n"


def row(value=VALUE, **overrides):
    return {"key": "SENTRY_AUTH_TOKEN", "value": value, "workspace": PROJECT,
            "secretPath": "/", "type": "shared", **overrides}


class SecretTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / ".infisical.json").write_text(json.dumps({"workspaceId": PROJECT}))
        self.client = Infisical(self.root)

    def test_transport_is_stdin_only_and_exact(self):
        calls = []
        def cli(args, **kwargs):
            calls.append((args, kwargs))
            payload = [] if len(calls) == 1 else [row()]
            return subprocess.CompletedProcess(args, 0, json.dumps(payload), "")
        with patch("common.subprocess.run", side_effect=cli):
            self.assertIn("verified", self.client.create_and_verify("SENTRY_AUTH_TOKEN", VALUE))
        args, kwargs = calls[1]
        self.assertNotIn(VALUE, " ".join(args))
        self.assertIn("SENTRY_AUTH_TOKEN=@/dev/stdin", args)
        self.assertEqual(kwargs["input"], VALUE)
        self.assertTrue(kwargs["capture_output"])
        self.assertIn("--expand=false", calls[0][0])
        self.assertIn("--secret-overriding=false", calls[0][0])

    def test_identical_existing_value_causes_no_write(self):
        with patch.object(self.client, "read", return_value={"SENTRY_AUTH_TOKEN": VALUE}), \
                patch.object(self.client, "command") as command:
            self.assertIn("already present", self.client.create_and_verify("SENTRY_AUTH_TOKEN", VALUE))
            command.assert_not_called()

    def test_changed_readback_fails(self):
        with patch.object(self.client, "read", side_effect=[{}, {"SENTRY_AUTH_TOKEN": "different"}]), \
                patch.object(self.client, "command"):
            with self.assertRaisesRegex(SecretError, "Readback"):
                self.client.create_and_verify("SENTRY_AUTH_TOKEN", VALUE)


    def test_destination_identity_and_duplicates_are_rejected(self):
        for rows in ([row(workspace="other-project")], [row(secretPath="/other")],
                     [row(type="personal")], [row(), row()]):
            with patch.object(self.client, "command", return_value=json.dumps(rows)):
                with self.assertRaises(SecretError):
                    self.client.read()

    def test_provider_error_details_never_escape(self):
        response = subprocess.CompletedProcess([], 1, VALUE, VALUE)
        with patch("common.subprocess.run", return_value=response):
            with self.assertRaises(SecretError) as error:
                self.client.read()
        self.assertNotIn(VALUE, str(error.exception))

    def test_app_environment_strips_tokens_stale_keys_and_untrusted_overrides(self):
        original = {"PATH": "/safe/bin", "BWS_ACCESS_TOKEN": "dummy-token",
                    "INFISICAL_TOKEN": "dummy-token", "INFISICAL_CLIENT_SECRET": "dummy-token",
                    "OPENROUTER_API_KEY": "stale", "SENTRY_ORG": "tsilva"}
        with patch.dict(os.environ, original, clear=True):
            actual = application_environment({"SENTRY_AUTH_TOKEN": VALUE, "PATH": "/evil", "NODE_OPTIONS": "evil"})
        self.assertEqual(actual["SENTRY_AUTH_TOKEN"], VALUE)
        self.assertEqual(actual["PATH"], "/safe/bin")
        self.assertEqual(actual["SENTRY_ORG"], "tsilva")

        for key in KEYS:
            if key != "SENTRY_AUTH_TOKEN": self.assertEqual(actual[key], "")
        for key in ("BWS_ACCESS_TOKEN", "INFISICAL_TOKEN", "INFISICAL_CLIENT_SECRET", "NODE_OPTIONS"):
            self.assertNotIn(key, actual)

    def test_missing_infisical_key_cannot_fall_back_to_next_dotenv(self):
        (self.root / ".env").write_text("SENTRY_AUTH_TOKEN=dummy-stale-dotenv-key\n")
        code = ("const {createRequire} = await import('node:module'); const req=createRequire(import.meta.url); const nextEnv=req(req.resolve('@next/env', {paths:[req.resolve('next/package.json', {paths:[process.cwd()]})]})); "
                "nextEnv.loadEnvConfig(process.argv[1], true, {info(){},error(){}}); "
                "process.stdout.write('\\nRESULT='+JSON.stringify({hasKey:Boolean(process.env.SENTRY_AUTH_TOKEN)}));")
        environment = application_environment({})
        result = subprocess.run(["node", "--input-type=module", "-e", code, str(self.root)],
                                env=environment, capture_output=True, text=True, check=True)
        self.assertFalse(json.loads(result.stdout.split("RESULT=",1)[-1])["hasKey"])

    def test_launcher_rejects_environment_overrides_before_fetching(self):
        with patch("run.sys.argv", ["run.py", "dev", "--env", "prod"]), \
                patch("run.Infisical") as client, patch("run.os.execvpe") as execute:
            with self.assertRaises(SecretError):
                launcher.main()
            client.assert_not_called()
            execute.assert_not_called()

    def test_failed_infisical_fetch_never_launches_the_application(self):
        with patch("run.sys.argv", ["run.py", "dev", "--port", "auto"]), \
                patch("run.Infisical") as client, patch("run.os.execvpe") as execute:
            client.return_value.read.side_effect = SecretError("Fetch failed.")
            with self.assertRaises(SecretError):
                launcher.main()
            execute.assert_not_called()


    def test_custom_sentry_loader_does_not_restore_a_missing_token(self):
        (self.root / ".env.sentry-build-plugin").write_text("SENTRY_AUTH_TOKEN=dummy-stale-token\n")
        config = Path(__file__).resolve().parents[2] / "next.config.js"
        code = "await import(" + json.dumps(config.as_uri()) + "); process.stdout.write('\\nRESULT='+JSON.stringify({hasKey:Boolean(process.env.SENTRY_AUTH_TOKEN)}));"
        result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=self.root,
                                env=application_environment({}), capture_output=True, text=True, check=True)
        self.assertFalse(json.loads(result.stdout.split("RESULT=",1)[1])["hasKey"])

    def test_manual_sync_refuses_a_combined_destination_before_writing(self):
        import sync_production as syncer
        with patch("sync_production.vercel", return_value={"envs":[{"key":"SENTRY_AUTH_TOKEN","target":["production","preview"]}]}) as api, \
                patch.object(self.client,"read",return_value={"SENTRY_AUTH_TOKEN":VALUE,"SENTRY_SMOKE_TEST_TOKEN":VALUE}):
            with self.assertRaisesRegex(SecretError,"no writes"):
                syncer.sync(self.client)
            self.assertEqual(api.call_count,1)

    def test_manual_sync_payload_is_stdin_only_and_error_body_is_suppressed(self):
        import sync_production as syncer
        response=subprocess.CompletedProcess([],1,VALUE,VALUE)
        with patch("sync_production.subprocess.run",return_value=response) as execute:
            with self.assertRaises(SecretError) as caught:
                syncer.vercel("POST",{"key":"SENTRY_AUTH_TOKEN","value":VALUE,"type":"sensitive","target":["production"]})
        args,kwargs=execute.call_args
        self.assertNotIn(VALUE," ".join(args[0]))
        self.assertEqual(json.loads(kwargs["input"])["value"],VALUE)
        self.assertIn("--input",args[0])
        self.assertNotIn(VALUE,str(caught.exception))

    def test_manual_sync_cannot_retarget_using_arguments(self):
        import sync_production as syncer
        with patch("sync_production.sync") as execute:
            with self.assertRaisesRegex(SecretError,"overrides"):
                syncer.main(["--env","dev"])
            execute.assert_not_called()


    def test_issue_tool_rejects_private_dotenv_fallback(self):
        script = ROOT / 'scripts/list_sentry_issues.mjs'
        code = """
          import fs from 'node:fs';
          const exists = fs.existsSync;
          const read = fs.readFileSync;
          fs.existsSync = path => String(path).endsWith('.env') || exists(path);
          fs.readFileSync = (path, ...args) => String(path).endsWith('.env')
            ? 'SENTRY_AUTH_TOKEN=dummy-stale-only\\n' : read(path, ...args);
          process.env.SENTRY_AUTH_TOKEN = '';
          globalThis.fetch = () => { throw new Error('Unexpected provider request'); };
          await import(process.argv[1]);
        """
        result = subprocess.run(
            ["node", "--input-type=module", "-e", code, str(script)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("SENTRY_AUTH_TOKEN", result.stderr)
        self.assertNotIn("Unexpected provider request", result.stderr)
        self.assertNotIn("dummy-stale-only", result.stderr)

    def test_publisher_fetches_only_the_pinned_shared_pair(self):
        with patch.object(self.client, "command", side_effect=["a" * 32 + "\n", "b" * 64 + "\n"]) as command:
            self.assertEqual(self.client.read_publisher_credentials(), {
                "AWS_ACCESS_KEY_ID": "a" * 32, "AWS_SECRET_ACCESS_KEY": "b" * 64,
            })
        calls = [call.args[0] for call in command.call_args_list]
        self.assertEqual([args[:3] for args in calls], [
            ["secrets", "get", "AWS_ACCESS_KEY_ID"],
            ["secrets", "get", "AWS_SECRET_ACCESS_KEY"],
        ])
        for args in calls:
            self.assertIn("--expand=false", args)
            self.assertIn("--include-imports=false", args)
            self.assertIn("--secret-overriding=false", args)

    def test_publisher_rejects_a_retargeted_vault_before_fetching(self):
        self.client.project = "00000000-0000-0000-0000-000000000000"
        with patch.object(self.client, "command") as command:
            with self.assertRaisesRegex(SecretError, "pinned"):
                self.client.read_publisher_credentials()
            command.assert_not_called()

    def test_publisher_replaces_stale_credentials_and_excludes_unrelated_secrets(self):
        pair = {"AWS_ACCESS_KEY_ID": "a" * 32, "AWS_SECRET_ACCESS_KEY": "b" * 64}
        inherited = {
            "PATH": "/safe/bin", "AWS_ACCESS_KEY_ID": "stale", "AWS_SECRET_ACCESS_KEY": "stale",
            "AWS_SESSION_TOKEN": "stale", "AWS_PROFILE": "stale", "R2_SECRET_ACCESS_KEY": "stale",
            "INFISICAL_PROFILE": "stale", "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET": "stale",
            "OPENROUTER_API_KEY": "stale", "SENTRY_AUTH_TOKEN": "stale",
            "SCUMMVM_GAMES_UPLOAD_DIR": "/synthetic/payloads",
        }
        with patch.dict(os.environ, inherited, clear=True):
            actual = publisher_environment({**pair, "PATH": "/evil", "SENTRY_AUTH_TOKEN": VALUE})
        for name, value in pair.items():
            self.assertEqual(actual[name], value)
        for name in ("AWS_SESSION_TOKEN", "AWS_PROFILE", "R2_SECRET_ACCESS_KEY", "INFISICAL_PROFILE",
                     "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET"):
            self.assertNotIn(name, actual)
        for name in ("OPENROUTER_API_KEY", "SENTRY_AUTH_TOKEN", "SENTRY_SMOKE_TEST_TOKEN", "BUCKET_DSN"):
            self.assertEqual(actual[name], "")
        self.assertEqual(actual["PATH"], "/safe/bin")
        self.assertEqual(actual["SCUMMVM_GAMES_UPLOAD_DIR"], "/synthetic/payloads")
        self.assertEqual(actual["SCUMMVM_R2_BUCKET"], "scummvm-games")
        self.assertEqual(actual["SCUMMVM_R2_ENDPOINT"],
                         "https://83e1ce4a70ea388693e8525a772ccefa.r2.cloudflarestorage.com")

    def test_publisher_missing_managed_pair_cannot_fall_back_to_stale_values(self):
        with patch.dict(os.environ, {"AWS_ACCESS_KEY_ID": "a" * 32, "AWS_SECRET_ACCESS_KEY": "b" * 64}, clear=True):
            with self.assertRaisesRegex(SecretError, "missing or invalid"):
                publisher_environment({})

    def test_publisher_rejects_another_bucket_or_endpoint(self):
        pair = {"AWS_ACCESS_KEY_ID": "a" * 32, "AWS_SECRET_ACCESS_KEY": "b" * 64}
        for inherited in ({"SCUMMVM_R2_BUCKET": "other"}, {"SCUMMVM_R2_ENDPOINT": "https://example.invalid"}):
            with patch.dict(os.environ, inherited, clear=True):
                with self.assertRaisesRegex(SecretError, "target overrides"):
                    publisher_environment(pair)

    def test_publish_launcher_uses_only_publisher_fetch_and_keeps_upload_flags(self):
        pair = {"AWS_ACCESS_KEY_ID": "a" * 32, "AWS_SECRET_ACCESS_KEY": "b" * 64}
        with patch.dict(os.environ, {"PATH": "/safe/bin"}, clear=True), \
                patch("run.sys.argv", ["run.py", "publish", "--game", "synthetic", "--force", "--prune"]), \
                patch("run.Infisical") as client, patch("run.os.chdir"), patch("run.os.execvpe") as execute:
            client.return_value.read_publisher_credentials.return_value = pair
            launcher.main()
        client.return_value.read.assert_not_called()
        client.return_value.read_publisher_credentials.assert_called_once_with()
        program, args, environment = execute.call_args.args
        self.assertEqual(program, launcher.sys.executable)
        self.assertEqual(args[1:], ["scripts/upload_games_to_r2.py", "--game", "synthetic", "--force", "--prune"])
        self.assertNotIn(pair["AWS_SECRET_ACCESS_KEY"], " ".join(args))
        self.assertEqual(environment["AWS_ACCESS_KEY_ID"], pair["AWS_ACCESS_KEY_ID"])

    def test_failed_publisher_fetch_never_launches_uploader(self):
        with patch("run.sys.argv", ["run.py", "publish"]), \
                patch("run.Infisical") as client, patch("run.os.execvpe") as execute:
            client.return_value.read_publisher_credentials.side_effect = SecretError("Fetch failed.")
            with self.assertRaises(SecretError):
                launcher.main()
            execute.assert_not_called()

    def test_publisher_help_does_not_fetch_credentials(self):
        with patch("run.sys.argv", ["run.py", "publish", "--help"]), \
                patch("run.Infisical") as client, patch("run.os.chdir"), patch("run.os.execvpe") as execute:
            launcher.main()
        client.assert_not_called()
        self.assertEqual(execute.call_args.args[1][-1], "--help")


if __name__ == "__main__":
    unittest.main()
