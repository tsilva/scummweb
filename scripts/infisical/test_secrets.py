"""Check transport, conflict handling, readback and application isolation."""

import contextlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from common import Infisical, SecretError, application_environment, KEYS, ROOT
from migrate_keyenv import transfer
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

    def test_conflict_preflight_prevents_all_writes(self):
        source = {"keys": {"OPENROUTER_API_KEY": {"status": "available", "value": "dummy-new"},
                           "SENTRY_AUTH_TOKEN": {"status": "available", "value": VALUE}}}
        with patch.object(self.client, "read", return_value={"SENTRY_AUTH_TOKEN": "different"}), \
                patch.object(self.client, "create_and_verify") as create:
            with self.assertRaisesRegex(SecretError, "no credentials were written"):
                transfer(source, self.client)
            create.assert_not_called()

    def test_keychain_bindings_fail_closed(self):
        with patch.object(self.client, "read") as read:
            with self.assertRaisesRegex(SecretError, "bindings"):
                transfer({"keys": {"SENTRY_AUTH_TOKEN": {"status": "binding-foreign"}}}, self.client)
            read.assert_not_called()

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

    def test_report_skips_missing_keys_and_never_prints_values(self):
        output = io.StringIO()
        source = {"keys": {"SENTRY_AUTH_TOKEN": {"status": "available", "value": VALUE},
                           "OPENROUTER_API_KEY": {"status": "missing"}}}
        with patch.object(self.client, "read", return_value={}), \
                patch.object(self.client, "create_and_verify", return_value="copied; verified matching"), \
                contextlib.redirect_stdout(output):
            report = transfer(source, self.client)
        self.assertIn("skipped", report["OPENROUTER_API_KEY"])
        self.assertNotIn(VALUE, output.getvalue())


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


if __name__ == "__main__":
    unittest.main()
