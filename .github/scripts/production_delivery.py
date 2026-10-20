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
            if response.status == 204:
                return {}
            return json.load(response)
    except urllib.error.HTTPError as error:
        reason = "unclassified"
        try:
            detail = json.load(error).get("error", {}).get("message", "").lower()
            if "production" in detail and "different value" in detail:
                reason = "production-secret-reused"
            elif "cannot change" in detail and "type" in detail:
                reason = "secret-type-change"
        except Exception:
            pass
        raise DeliveryError(
            f"Provider request failed (HTTP {error.code}, reason: {reason}); response suppressed."
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


def config_names(config):
    names = config.get("configNames", [])
    allowed = {
        "ASSET_RETENTION_SECONDS",
        "OPENROUTER_APP_NAME",
        "OPENROUTER_MODEL",
        "OPENROUTER_SITE_URL",
        "R2_ACCOUNT_ID",
        "R2_BUCKET_NAME",
        "R2_ENDPOINT",
        "R2_OBJECT_PREFIX",
        "SENTRY_BASE_URL",
        "SENTRY_DSN",
        "SENTRY_ENVIRONMENT",
        "SENTRY_ORG",
        "SENTRY_PROJECT",
        "SENTRY_TRACES_SAMPLE_RATE",
    }
    if (
        not isinstance(names, list)
        or any(not isinstance(name, str) for name in names)
        or len(names) != len(set(names))
        or any(name not in config["secretNames"] for name in names)
        or any(
            name not in allowed
            and not name.startswith(("NEXT_PUBLIC_", "PUBLIC_", "VITE_"))
            for name in names
        )
    ):
        raise DeliveryError("Invalid pinned public configuration allowlist; no writes.")
    return set(names)


def confirmed_variable(result, key):
    if result.get("failed"):
        # Emit only fixed codes; provider messages and arbitrary codes can contain credentials.
        known = {
            "bad_request",
            "forbidden",
            "not_found",
            "env_already_exists",
            "env_value_invalid_length",
        }
        failures = result["failed"] if isinstance(result["failed"], list) else []
        codes = []
        for failure in failures:
            error = failure.get("error", {}) if isinstance(failure, dict) else {}
            code = error.get("code") if isinstance(error, dict) else None
            if code in known:
                codes.append(code)
        reason = ", ".join(codes) or "unclassified"
        raise DeliveryError(
            f"Vercel rejected Production key {key} (code: {reason}); inspect its environment separation. "
            "Provider response suppressed."
        )
    created = result.get("created")
    if isinstance(created, list):
        created = created[0] if len(created) == 1 else None
    if not isinstance(created, dict) or created.get("key") != key:
        raise DeliveryError(
            f"Vercel did not confirm Production key {key}; response suppressed."
        )
    return created


def sync_vercel(config, values):
    public = config_names(config)
    if set(values) != set(config["secretNames"]):
        raise DeliveryError(
            "Source values do not match the pinned allowlist; no writes."
        )
    verify_vercel(config)
    path = "/v10/projects/" + config["vercelProjectId"] + "/env"
    before = vercel_request(config, "GET", path)["envs"]
    existing = {}
    # Validate every destination and migration before writing any key.
    for key in values:
        matches = production_matches(before, key)
        if matches:
            row = matches[0]
            if not isinstance(row.get("id"), str) or not row["id"]:
                raise DeliveryError(
                    "Production variable identifier is missing; no writes."
                )
            if row.get("customEnvironmentIds") or row.get("configurationId"):
                raise DeliveryError(
                    "Managed or custom-environment variable requires review; no writes."
                )
            existing[key] = row
    for key, value in values.items():
        print(f"Syncing Vercel Production key {key}.", flush=True)
        is_config = key in public
        kind = "encrypted" if is_config else "sensitive"
        visibility = "config" if is_config else "secret"
        payload = {
            "key": key,
            "value": value,
            "type": kind,
            "visibility": visibility,
            "target": ["production"],
            "comment": "Managed from Infisical by GitHub production-delivery",
        }
        row = existing.get(key)
        if row:
            env_path = (
                "/v9/projects/"
                + config["vercelProjectId"]
                + "/env/"
                + urllib.parse.quote(row["id"], safe="")
            )
            was_secret = row.get("visibility") == "secret" or (
                row.get("visibility") != "config" and row.get("type") == "sensitive"
            )
            if is_config and was_secret:
                # Vercel forbids Secret -> Config in place. Replace only this
                # explicitly classified Production row, using the loaded source.
                vercel_request(config, "DELETE", env_path)
                result = vercel_request(config, "POST", path, payload)
            else:
                # Supplying key would rename a Secret; preserve key and targets.
                update = {
                    k: v for k, v in payload.items() if k not in ("key", "target")
                }
                result = {"created": vercel_request(config, "PATCH", env_path, update)}
        else:
            result = vercel_request(config, "POST", path, payload)
        created = confirmed_variable(result, key)
        matches = production_matches(vercel_request(config, "GET", path)["envs"], key)
        if (
            len(matches) != 1
            or not created.get("id")
            or matches[0].get("id") != created["id"]
            or matches[0].get("type") != kind
            or matches[0].get("visibility", visibility) != visibility
        ):
            raise DeliveryError(
                f"Vercel Production metadata verification failed for {key}."
            )


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
