"""Deliver allowlisted production credentials, then deploy through GitHub Actions.

Provider responses and credential values never enter logs or workflow outputs.
Deployment credentials are supplied only to the step that needs them.
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INFISICAL = "https://app.infisical.com"
VERCEL = "https://api.vercel.com"
GITHUB = "https://api.github.com"
CLOUDFLARE = "https://api.cloudflare.com/client/v4"


class DeliveryError(Exception):
    """Only explicitly safe messages may reach the runner log."""


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise DeliveryError("Provider redirect rejected.")


def request(method, url, token=None, payload=None):
    headers = {"Content-Type": "application/json", "User-Agent": "production-delivery"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.build_opener(NoRedirect()).open(
            req, timeout=60
        ) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise DeliveryError(
            f"Provider request failed (HTTP {error.code}); response suppressed."
        ) from None
    except DeliveryError:
        raise
    except Exception:
        raise DeliveryError("Provider request failed; details suppressed.") from None


def required(name):
    value = os.environ.get(name, "")
    if not value or any(c in value for c in "\r\n\0"):
        raise DeliveryError(
            "Required workflow credential/configuration is missing or invalid."
        )
    return value


def mask(value):
    # GitHub's masking command escaping also handles percent signs safely.
    value = value.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print("::add-mask::" + value, flush=True)


def configuration():
    return json.loads(Path(__file__).with_name("production-delivery.json").read_text())


def context(config):
    if (
        required("GITHUB_REPOSITORY") != config["repository"]
        or required("GITHUB_REF") != "refs/heads/main"
        or required("GITHUB_EVENT_NAME") not in ("push", "workflow_dispatch")
        or required("GITHUB_WORKFLOW_REF")
        != config["repository"]
        + "/.github/workflows/production-delivery.yml@refs/heads/main"
    ):
        raise DeliveryError(
            "Workflow repository, branch, event or workflow path mismatch; no writes."
        )
    sha = required("GITHUB_SHA")
    if not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise DeliveryError("Invalid commit SHA; no writes.")
    latest = request(
        "GET",
        GITHUB + "/repos/" + config["repository"] + "/git/ref/heads/main",
        required("GH_TOKEN"),
    )
    if latest["object"]["sha"] != sha:
        raise DeliveryError("This run is superseded by a newer main commit; no writes.")
    return sha


def infisical_secrets(config):
    names = config["secretNames"]
    if not names:
        return {}
    if len(names) != len(set(names)) or any(
        not re.fullmatch(r"[A-Z][A-Z0-9_]*", name) for name in names
    ):
        raise DeliveryError("Invalid pinned source allowlist; no writes.")
    url = required("ACTIONS_ID_TOKEN_REQUEST_URL")
    parsed = urllib.parse.urlsplit(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not parsed.hostname.endswith(".actions.githubusercontent.com")
    ):
        raise DeliveryError("Unexpected GitHub OIDC issuer endpoint; no writes.")
    separator = "&" if parsed.query else "?"
    jwt = request(
        "GET",
        url + separator + urllib.parse.urlencode({"audience": INFISICAL}),
        required("ACTIONS_ID_TOKEN_REQUEST_TOKEN"),
    )["value"]
    mask(jwt)
    login = request(
        "POST",
        INFISICAL + "/api/v1/auth/oidc-auth/login",
        payload={"identityId": config["identityId"], "jwt": jwt},
    )
    token = login["accessToken"]
    mask(token)
    query = urllib.parse.urlencode(
        {
            "projectId": config["infisicalProjectId"],
            "environment": "prod",
            "secretPath": "/",
            "type": "shared",
            "viewSecretValue": "true",
            "expandSecretReferences": "false",
            "includeImports": "false",
        }
    )
    values = {}
    for name in names:
        secret = request(
            "GET", INFISICAL + "/api/v4/secrets/" + name + "?" + query, token
        )["secret"]
        value = secret.get("secretValue")
        if (
            secret.get("secretKey") != name
            or secret.get("workspace") != config["infisicalProjectId"]
            or secret.get("environment") != "prod"
            or secret.get("type") != "shared"
            or not isinstance(value, str)
            or not value
            or any(c in value for c in "\r\n\0")
        ):
            raise DeliveryError(
                "Required source secret is missing or has unexpected metadata; no writes."
            )
        mask(value)
        values[name] = value

    return values


def vercel_request(config, method, path, payload=None):
    join = "&" if "?" in path else "?"
    return request(
        method,
        VERCEL + path + join + "teamId=" + config["vercelTeamId"],
        required("VERCEL_TOKEN"),
        payload,
    )


def verify_vercel(config):
    project = vercel_request(config, "GET", "/v9/projects/" + config["vercelProjectId"])
    if (
        project.get("id") != config["vercelProjectId"]
        or project.get("accountId") != config["vercelTeamId"]
        or str(project.get("link", {}).get("repoId"))
        != str(config["githubRepositoryId"])
    ):
        raise DeliveryError(
            "Vercel team, project or linked repository mismatch; no writes."
        )


def production_matches(items, key):
    matches = [
        x for x in items if x.get("key") == key and "production" in x.get("target", [])
    ]
    if len(matches) > 1 or any(
        x.get("target") != ["production"] or x.get("gitBranch") for x in matches
    ):
        raise DeliveryError(
            "Duplicate or combined destination targets require review; no writes."
        )
    return matches


def sync_vercel(config, values):
    verify_vercel(config)
    path = "/v10/projects/" + config["vercelProjectId"] + "/env"
    before = vercel_request(config, "GET", path)["envs"]
    # Validate every target before writing any key.
    for key in values:
        production_matches(before, key)
    for key, value in values.items():
        result = vercel_request(
            config,
            "POST",
            path + "?upsert=true",
            {
                "key": key,
                "value": value,
                "type": "sensitive",
                "target": ["production"],
                "comment": "Managed from Infisical by GitHub production-delivery; no deletions",
            },
        )
        created = result.get("created", {})
        if (
            result.get("failed")
            or not isinstance(created, dict)
            or created.get("key") != key
        ):
            raise DeliveryError(
                "Vercel did not confirm the production write; response suppressed."
            )
        matches = production_matches(vercel_request(config, "GET", path)["envs"], key)
        if (
            len(matches) != 1
            or matches[0].get("id") != created.get("id")
            or matches[0].get("type") != "sensitive"
        ):
            raise DeliveryError("Vercel secret metadata verification failed.")


def cloudflare_request(config, method, suffix, payload=None):
    path = (
        "/accounts/"
        + config["cloudflareAccountId"]
        + "/workers/scripts/"
        + config["workerName"]
        + suffix
    )
    result = request(
        method, CLOUDFLARE + path, required("CLOUDFLARE_API_TOKEN"), payload
    )
    if not result.get("success"):
        raise DeliveryError("Cloudflare request failed; response suppressed.")
    return result.get("result")


def sync_worker(config, value):
    before = cloudflare_request(config, "GET", "/secrets")
    if sum(x.get("name") == config["secretNames"][0] for x in before) != 1:
        raise DeliveryError("Expected existing Worker secret not found; no writes.")
    cloudflare_request(
        config,
        "PUT",
        "/secrets",
        {"name": config["secretNames"][0], "text": value, "type": "secret_text"},
    )
    after = cloudflare_request(config, "GET", "/secrets")
    if (
        sum(
            x.get("name") == config["secretNames"][0] and x.get("type") == "secret_text"
            for x in after
        )
        != 1
    ):
        raise DeliveryError("Worker secret metadata verification failed.")
    verify_worker_health(config)


def verify_worker_health(config):
    health = request("GET", config["healthUrl"])
    if health.get("provider") != "openai" or not health.get("configured"):
        raise DeliveryError(
            "Worker health does not confirm the configured OpenAI provider."
        )


def wait_for_ci(config, sha):
    url = (
        GITHUB
        + "/repos/"
        + config["repository"]
        + "/actions/workflows/ci.yml/runs?"
        + urllib.parse.urlencode(
            {"head_sha": sha, "branch": "main", "event": "push", "per_page": 10}
        )
    )
    deadline = time.monotonic() + 1500
    while time.monotonic() < deadline:
        runs = request("GET", url, required("GH_TOKEN"))["workflow_runs"]
        runs = sorted(
            [x for x in runs if x.get("head_sha") == sha],
            key=lambda x: x["run_number"],
            reverse=True,
        )
        if runs and runs[0]["status"] == "completed":
            if runs[0]["conclusion"] != "success":
                raise DeliveryError(
                    "This commit's CI failed; production delivery held."
                )
            return
        time.sleep(15)
    raise DeliveryError("CI did not finish in time; production delivery held.")


def deploy_vercel(config, sha):
    wait_for_ci(config, sha)
    context(config)
    verify_vercel(config)
    result = vercel_request(
        config,
        "POST",
        "/v13/deployments",
        {
            "name": config["vercelProjectName"],
            "project": config["vercelProjectId"],
            "target": "production",
            "gitSource": {
                "type": "github",
                "repoId": str(config["githubRepositoryId"]),
                "ref": sha,
            },
            "meta": {
                "infisicalDeliveryCommit": sha,
                "infisicalDeliveryRun": required("GITHUB_RUN_ID"),
            },
        },
    )
    deployment_id = result.get("id")
    if not isinstance(deployment_id, str) or not deployment_id.startswith("dpl_"):
        raise DeliveryError(
            "Deployment creation was not confirmed; response suppressed."
        )
    deadline = time.monotonic() + 1500
    while time.monotonic() < deadline:
        deployment = vercel_request(config, "GET", "/v13/deployments/" + deployment_id)
        if (
            deployment.get("projectId") != config["vercelProjectId"]
            or deployment.get("target") != "production"
        ):
            raise DeliveryError("Deployment target verification failed.")
        state = deployment.get("readyState", deployment.get("status"))
        if state in ("ERROR", "CANCELED"):
            raise DeliveryError(
                "Vercel production build failed; inspect the deployment in Vercel."
            )
        if state == "READY":
            if deployment.get("meta", {}).get("githubCommitSha") != sha:
                raise DeliveryError("Deployment commit verification failed.")
            print("Production READY: " + deployment_id + " commit " + sha)
            return
        time.sleep(15)
    raise DeliveryError(
        "Vercel production deployment timed out; check its status before retrying."
    )


def main():
    if sys.argv[1:] not in (["sync"], ["deploy"], ["check"], ["worker-health"]):
        raise DeliveryError("Use only the fixed check, sync or deploy operation.")
    config = configuration()
    sha = context(config)
    if sys.argv[1] == "check":
        wait_for_ci(config, sha)
        context(config)
        print("CI passed for commit " + sha)
    elif sys.argv[1] == "worker-health":
        verify_worker_health(config)
        print("Worker health verified.")
    elif sys.argv[1] == "deploy":
        deploy_vercel(config, sha)
    else:
        wait_for_ci(config, sha)
        values = infisical_secrets(config)
        context(config)
        if config["destination"] == "vercel":
            sync_vercel(config, values)
        elif config["destination"] == "cloudflare-worker":
            sync_worker(config, values[config["secretNames"][0]])
            verify_vercel(config)
        else:
            raise DeliveryError("Unsupported pinned destination; no writes.")
        print(
            str(len(values))
            + " allowlisted keys synced; destination metadata verified."
        )


if __name__ == "__main__":
    try:
        main()
    except DeliveryError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print(
            "Production delivery failed; private details suppressed.", file=sys.stderr
        )
        sys.exit(1)
