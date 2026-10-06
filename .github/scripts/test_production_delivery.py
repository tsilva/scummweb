"""Fail-closed delivery tests; all external requests are mocked."""
import importlib.util
import os
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("delivery", Path(__file__).with_name("production_delivery.py"))
d = importlib.util.module_from_spec(spec)
spec.loader.exec_module(d)


class DeliveryTests(unittest.TestCase):
    def setUp(self):
        self.config = {"repository": "tsilva/example", "secretName": "SENTRY_AUTH_TOKEN",
                       "infisicalProjectId": "vault", "identityId": "reader",
                       "vercelProjectId": "prj_example", "vercelTeamId": "team_example",
                       "githubRepositoryId": 123, "workerName": "example", "cloudflareAccountId": "account"}
        self.sha = "a" * 40
        self.env = {"GITHUB_REPOSITORY": "tsilva/example", "GITHUB_REF": "refs/heads/main",
                    "GITHUB_EVENT_NAME": "push", "GITHUB_SHA": self.sha,
                    "GITHUB_WORKFLOW_REF": "tsilva/example/.github/workflows/production-delivery.yml@refs/heads/main",
                    "GH_TOKEN": "fake-github", "VERCEL_TOKEN": "fake-vercel", "CLOUDFLARE_API_TOKEN": "fake-cloudflare"}

    def test_fork_branch_event_and_workflow_fail_before_network(self):
        cases = {"GITHUB_REPOSITORY": "attacker/example", "GITHUB_REF": "refs/heads/feature",
                 "GITHUB_EVENT_NAME": "pull_request", "GITHUB_WORKFLOW_REF": "tsilva/example/.github/workflows/other.yml@refs/heads/main"}
        for key, value in cases.items():
            with self.subTest(key=key), patch.dict(os.environ, self.env | {key: value}, clear=True), patch.object(d, "request") as request:
                with self.assertRaises(d.DeliveryError): d.context(self.config)
                request.assert_not_called()

    def test_old_commit_cannot_mutate(self):
        with patch.dict(os.environ, self.env, clear=True), patch.object(d, "request", return_value={"object": {"sha": "b" * 40}}):
            with self.assertRaises(d.DeliveryError): d.context(self.config)

    def test_malformed_sha_cannot_mutate(self):
        with patch.dict(os.environ, self.env | {"GITHUB_SHA": "main"}, clear=True), patch.object(d, "request") as request:
            with self.assertRaises(d.DeliveryError): d.context(self.config)
            request.assert_not_called()

    def test_duplicate_and_combined_targets_fail_closed(self):
        for items in [[{"key": "K", "target": ["production", "preview"]}],
                      [{"key": "K", "target": ["production"]}] * 2,
                      [{"key": "K", "target": ["production"], "gitBranch": "feature"}]]:
            with self.subTest(items=items), self.assertRaises(d.DeliveryError):
                d.production_matches(items, "K")

    def test_preview_credentials_are_preserved(self):
        production = {"key": "K", "target": ["production"]}
        self.assertEqual(d.production_matches([production, {"key": "K", "target": ["preview"]}], "K"), [production])

    def test_wrong_vercel_project_team_and_repo_fail_before_write(self):
        good = {"id": "prj_example", "accountId": "team_example", "link": {"repoId": "123"}}
        for bad in [good | {"id": "other"}, good | {"accountId": "other"}, good | {"link": {"repoId": "456"}}]:
            with self.subTest(bad=bad), patch.object(d, "vercel_request", return_value=bad) as request:
                with self.assertRaises(d.DeliveryError): d.sync_vercel(self.config, "fake-secret")
                self.assertEqual([call.args[1] for call in request.call_args_list], ["GET"])

    def test_missing_worker_binding_prevents_write(self):
        with patch.object(d, "cloudflare_request", return_value=[]) as request:
            with self.assertRaises(d.DeliveryError): d.sync_worker(self.config, "fake-secret")
            self.assertEqual([call.args[1] for call in request.call_args_list], ["GET"])

    def test_failed_ci_prevents_deployment(self):
        with patch.object(d, "wait_for_ci", side_effect=d.DeliveryError("CI failed")), patch.object(d, "vercel_request") as request:
            with self.assertRaises(d.DeliveryError): d.deploy_vercel(self.config, self.sha)
            request.assert_not_called()

    def test_untrusted_oidc_endpoint_is_rejected(self):
        with patch.dict(os.environ, {"ACTIONS_ID_TOKEN_REQUEST_URL": "https://attacker.example/token"}, clear=True), patch.object(d, "request") as request:
            with self.assertRaises(d.DeliveryError): d.infisical_secret(self.config)
            request.assert_not_called()

    def test_source_metadata_and_allowlist_are_enforced(self):
        env = {"ACTIONS_ID_TOKEN_REQUEST_URL": "https://example.actions.githubusercontent.com/token?api=1", "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "fake"}
        secret = {"secretKey": "SENTRY_AUTH_TOKEN", "workspace": "vault", "environment": "prod", "type": "shared", "secretValue": "fake-secret", "version": 3}
        for wrong in [secret | {"workspace": "other"}, secret | {"environment": "dev"}, secret | {"secretValue": ""}, secret | {"secretKey": "OTHER"}]:
            with self.subTest(wrong=wrong), patch.dict(os.environ, env, clear=True), patch.object(d, "mask"), patch.object(d, "request", side_effect=[{"value": "fake-jwt"}, {"accessToken": "fake-access"}, {"secret": wrong}]) as request:
                with self.assertRaises(d.DeliveryError): d.infisical_secret(self.config)
                self.assertIn("includeImports=false", request.call_args_list[-1].args[1])
                self.assertIn("expandSecretReferences=false", request.call_args_list[-1].args[1])


if __name__ == "__main__":
    unittest.main()
