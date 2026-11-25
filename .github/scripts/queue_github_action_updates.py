#!/usr/bin/env python3
"""Accept exact, published GitHub action release bumps after repository CI."""

import argparse
import json
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone
from urllib.parse import quote


REPO = "tsilva/scummweb"
REPO_ID = 1194484994
POLICY = {
    "branch": "main",
    "checks": ["Dependency security and application gates"],
    "workflow": ".github/workflows/ci.yml",
}
GITHUB_ACTIONS_APP = 15368
DEPENDABOT = 49699333
PASSING = {"SUCCESS", "NEUTRAL", "SKIPPED"}
ACTION_PATH = re.compile(r"(?:\.github/workflows/[^/]+|(?:\.github/actions/.+/)?action)\.ya?ml")
ACTION_LINE = re.compile(
    r"(\s*(?:-\s+)?uses:\s*)(['\"]?)((?:actions|github)/[a-zA-Z0-9_.-]+(?:/[a-zA-Z0-9_.-]+)*)"
    r"@([a-f0-9]{40})\2\s+#\s+([a-zA-Z0-9._+-]+)\s*"
)
class Deferred(Exception):
    pass


def gh(*args, raw=False):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=30)
    if result.returncode:
        diagnostic = re.search(r"HTTP \d+", result.stderr)
        raise Deferred(diagnostic.group() if diagnostic else "GitHub CLI rejected the request")
    return result.stdout if raw else json.loads(result.stdout)


def api(path, *args):
    return gh("api", "--hostname", "github.com", path, *args)


def publish_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def pin_updates(files, changed_files):
    if not files or len(files) != changed_files:
        raise Deferred("incomplete changed-file list")
    updates = set()
    for file in files:
        if file["status"] != "modified" or not ACTION_PATH.fullmatch(file["filename"]):
            raise Deferred("includes a change outside action pins")
        removed, added, changed = [], [], 0
        for line in [*file.get("patch", "").splitlines(), ""]:
            if line.startswith(("-", "+")):
                match = ACTION_LINE.fullmatch(line[1:])
                if not match:
                    raise Deferred("includes a change other than a GitHub action pin with a release tag")
                (removed if line[0] == "-" else added).append(match.groups())
                continue
            if len(removed) != len(added):
                raise Deferred("adds, removes, or moves action steps")
            for old, new in zip(removed, added):
                old_indent, old_quote, old_action, old_sha, _ = old
                indent, quotation, action, sha, tag = new
                if (old_indent, old_quote, old_action) != (indent, quotation, action) or old_sha == sha:
                    raise Deferred("action identity or step formatting changed")
                updates.add(("/".join(action.split("/")[:2]), sha, tag))
            changed += len(removed)
            removed, added = [], []
        if not changed or changed != file["deletions"] or changed != file["additions"]:
            raise Deferred("patch is incomplete")
    return updates


def validate_release(action, sha, tag, validation):
    if (action, sha, tag) in validation:
        return
    source = f"repos/{action}"
    release = api(f"{source}/releases/tags/{quote(tag, safe='')}")
    if (
        release.get("draft") or release.get("prerelease") or release.get("tag_name") != tag
        or not release.get("published_at")
        or datetime.now(timezone.utc) - publish_time(release["published_at"]) < timedelta(hours=48)
    ):
        raise Deferred("official stable release is too recent or unavailable")
    ref = api(f"{source}/git/ref/tags/{quote(tag, safe='')}")["object"]
    for _ in range(3):
        if ref["type"] != "tag":
            break
        ref = api(f"{source}/git/tags/{ref['sha']}")["object"]
    if ref["type"] != "commit" or ref["sha"] != sha:
        raise Deferred("the proposed SHA does not match the official release tag")
    affected = quote(f"{action}@{tag.removeprefix('v')}", safe="")
    if api(f"advisories?ecosystem=actions&affects={affected}&per_page=1"):
        raise Deferred("GitHub lists an advisory against the proposed action version")
    validation.add((action, sha, tag))


def branch_gate(repo, policy):
    branch = quote(policy["branch"], safe="")
    rules = api(f"{repo}/rules/branches/{branch}")
    enforced = {(check["context"], check.get("integration_id"))
                for rule in rules if rule["type"] == "required_status_checks"
                for check in rule["parameters"]["required_status_checks"]}
    if any((check, GITHUB_ACTIONS_APP) not in enforced for check in [*policy["checks"], "Dependency review"]):
        raise Deferred("application CI is no longer required from GitHub Actions")
    permissions = api(f"{repo}/actions/permissions")
    if not permissions.get("enabled") or not permissions.get("sha_pinning_required"):
        raise Deferred("Actions or full-SHA enforcement is disabled")
    if permissions["allowed_actions"] == "selected" and not api(f"{repo}/actions/permissions/selected-actions")["github_owned_allowed"]:
        raise Deferred("GitHub actions are no longer allowed")
    if permissions["allowed_actions"] not in {"selected", "all"}:
        raise Deferred("Actions allow policy changed")


def pending_or_passed(repo_short, number, head, checks):
    pr = gh("pr", "view", str(number), "-R", repo_short, "--json",
            "id,state,headRefOid,mergeStateStatus,mergeable,autoMergeRequest,statusCheckRollup")
    if pr["state"] != "OPEN" or pr["headRefOid"] != head or pr["mergeable"] != "MERGEABLE":
        raise Deferred("PR head or mergeability changed")
    if pr["autoMergeRequest"] is not None:
        raise Deferred("auto-merge is already enabled")
    check_runs = pr["statusCheckRollup"]
    app_runs = {}
    for run in check_runs:
        name = run.get("name", run.get("context"))
        conclusion = run.get("conclusion") or run.get("state")
        if name in checks:
            app_runs.setdefault(name, []).append(conclusion)
        if conclusion and conclusion not in PASSING and conclusion not in {"PENDING", "EXPECTED"}:
            raise Deferred("an observed PR check failed or was cancelled")
        if name not in checks and (run.get("status") in {"QUEUED", "IN_PROGRESS", "PENDING", "WAITING", "REQUESTED"}
                                   or conclusion in {"PENDING", "EXPECTED"}):
            raise Deferred("another applicable PR check is still running")
    if set(app_runs) != set(checks) or any(len(results) != 1 for results in app_runs.values()):
        raise Deferred("application CI checks are missing or ambiguous")
    if any(result in {"NEUTRAL", "SKIPPED"} for results in app_runs.values() for result in results):
        raise Deferred("an application CI check did not execute")
    complete = all(results == ["SUCCESS"] for results in app_runs.values())
    if complete and pr["mergeStateStatus"] != "CLEAN":
        raise Deferred("other repository merge requirements are outstanding")
    if not complete and pr["mergeStateStatus"] != "BLOCKED":
        raise Deferred("GitHub is not holding this PR behind its required checks")
    return pr["id"], complete


def act(repo_short, repo, policy, pr, validation, apply):
    number = pr["number"]
    candidate = api(f"{repo}/pulls/{number}")
    if (candidate["state"] != "open" or candidate["draft"] or candidate["user"]["login"] != "dependabot[bot]"
        or candidate["user"]["type"] != "Bot" or candidate["user"]["id"] != DEPENDABOT
        or candidate["base"]["ref"] != policy["branch"] or candidate["base"]["repo"]["id"] != REPO_ID
        or (candidate["head"]["repo"] or {}).get("id") != candidate["base"]["repo"]["id"]
        or not candidate["head"]["ref"].startswith("dependabot/github_actions/")):
        raise Deferred("PR is outside the approved Dependabot scope")
    head = candidate["head"]["sha"]
    branch = quote(policy["branch"], safe="")
    base = api(f"{repo}/git/ref/heads/{branch}")["object"]["sha"]
    pages = api(f"{repo}/pulls/{number}/files?per_page=100", "--paginate", "--slurp")
    for action, sha, tag in sorted(pin_updates([f for page in pages for f in page], candidate["changed_files"])):
        validate_release(action, sha, tag, validation)
    raw_diff = gh("pr", "diff", str(number), "-R", repo_short, raw=True)
    if re.search(r"^(?:old mode |new mode |rename |copy |Binary files |GIT binary patch)", raw_diff, re.MULTILINE):
        raise Deferred("PR includes file metadata or binary changes")
    pr_id, complete = pending_or_passed(repo_short, number, head, policy["checks"])
    runs = api(f"{repo}/actions/runs?head_sha={head}&event=pull_request&per_page=100")["workflow_runs"]
    application = next((run for run in runs if run["path"] == policy["workflow"]), None)
    if not application or any(run["status"] == "completed" and (run["conclusion"] or "").upper() not in PASSING for run in runs):
        raise Deferred("application CI run is missing or an exact-head workflow failed")
    if complete and (application["status"] != "completed" or application["conclusion"] != "success"):
        raise Deferred("the exact-head application workflow has not passed")
    merge_ref = api(f"{repo}/git/ref/pull/{number}/merge")["object"]["sha"]
    parents = api(f"{repo}/git/commits/{merge_ref}")["parents"]
    if [p["sha"] for p in parents] != [base, head]:
        raise Deferred("GitHub's tested merge ref does not match live main and the reviewed PR head")
    if api(f"{repo}/git/ref/heads/{branch}")["object"]["sha"] != base:
        raise Deferred("default branch changed during review")
    if not apply:
        return "ready to merge after successful checks" if complete else "ready to queue behind application CI"
    if complete:
        gh("pr", "merge", str(number), "-R", repo_short, "--auto", "--squash", "--match-head-commit", head, raw=True)
    else:
        mutation = """mutation($pr: ID!, $head: GitObjectID!) {
          enablePullRequestAutoMerge(input:{pullRequestId:$pr, expectedHeadOid:$head, mergeMethod:SQUASH}) {
            pullRequest { state headRefOid autoMergeRequest { enabledAt } }
          }
        }"""
        api("graphql", "-f", f"query={mutation}", "-f", f"pr={pr_id}", "-f", f"head={head}")
    result = gh("pr", "view", str(number), "-R", repo_short, "--json", "state,headRefOid,autoMergeRequest,mergeCommit")
    if result["headRefOid"] != head or (result["state"] != "MERGED" and not result["autoMergeRequest"]):
        raise Deferred("GitHub did not confirm the guarded merge request")
    return "merged " + result["mergeCommit"]["oid"] if result["state"] == "MERGED" else "queued behind application CI"


def run(apply):
    if not os.environ.get("GH_TOKEN"):
        raise Deferred("GitHub App installation token is missing")
    installation = api("installation/repositories?per_page=2")
    if installation["total_count"] != 1 or [r["id"] for r in installation["repositories"]] != [REPO_ID]:
        raise Deferred("the installation token must be limited to ScummWEB")
    repo = f"repos/{REPO}"
    info = api(repo)
    if (info["id"] != REPO_ID or info["full_name"] != REPO or info["archived"] or info["fork"] or info["disabled"]
        or info["default_branch"] != POLICY["branch"] or not info["allow_auto_merge"] or not info["allow_squash_merge"]):
        raise Deferred("repository identity or required merge settings changed")
    branch_gate(repo, POLICY)
    pages = api(f"{repo}/pulls?state=open&base=main&per_page=100", "--paginate", "--slurp")
    validation = set()
    results = []
    for pr in (entry for page in pages for entry in page):
        if pr["user"]["id"] != DEPENDABOT or not pr["head"]["ref"].startswith("dependabot/github_actions/"):
            continue
        try:
            result = {"result": act(REPO, repo, POLICY, pr, validation, apply)}
        except Deferred as error:
            result = {"deferred": str(error)}
        results.append({"pr": pr["number"], **result})
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Enable native auto-merge for eligible PRs")
    args = parser.parse_args()
    print(json.dumps({"mode": "apply" if args.apply else "preview", "outcomes": run(args.apply)}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Deferred as error:
        raise SystemExit(str(error)) from None
