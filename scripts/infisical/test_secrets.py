"""Check transport, readback and application isolation."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from common import Infisical, SecretError, ROOT

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









    def test_custom_sentry_loader_does_not_restore_a_missing_token(self):
        (self.root / ".env.sentry-build-plugin").write_text("SENTRY_AUTH_TOKEN=dummy-stale-token\n")
        config = Path(__file__).resolve().parents[2] / "next.config.js"
        code = "await import(" + json.dumps(config.as_uri()) + "); process.stdout.write('\\nRESULT='+JSON.stringify({hasKey:Boolean(process.env.SENTRY_AUTH_TOKEN)}));"
        result = subprocess.run(["node", "--input-type=module", "-e", code], cwd=self.root,
                                env={"PATH": os.environ["PATH"], "SENTRY_AUTH_TOKEN": ""}, capture_output=True, text=True, check=True)
        self.assertFalse(json.loads(result.stdout.split("RESULT=",1)[1])["hasKey"])

    def test_production_administration_does_not_require_local_access_metadata(self):
        import sync_production as syncer
        with patch.object(Path, "read_text", side_effect=AssertionError("unexpected local config")):
            client = syncer.Production()
        self.assertEqual(client.project, syncer.PROJECT)
        self.assertEqual(client.domain, "https://app.infisical.com")

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
