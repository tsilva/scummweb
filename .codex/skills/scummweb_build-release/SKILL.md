---
name: scummweb_build-release
description: Build, deploy or verify ScummWEB through its existing CI-gated Vercel Production delivery workflow.
---

# scummweb: Build Release

Use the current checkout and branch. Read the shared
[$private-skills_release-workflow](/Users/tsilva/.codex/skills/private-skills/private-skills_release-workflow/SKILL.md)
and [production delivery guide](../../../docs/production-delivery.md).
The checked-in workflows are authoritative for delivery gates and credentials.

## Prepare

Production publication requires an explicit deployment request and branch
`main`. A dirty candidate and existing local commits are permitted when they
belong to the requested deployment or the user explicitly includes them.
Review the complete candidate, preserve unrelated work and stop on unresolved
conflicts or remote divergence. Do not switch branches or discard work.

Run applicable syntax and regression checks and a production application build.
Run tests and builds sequentially; both can generate artwork and share its lock.
Reuse completed checks for unchanged source. Use a separate project-relative
`SCUMMWEB_DIST_DIR` for the build when a development server is running, as
described in the [maintenance guide](../../../docs/maintaining-scummweb.md#development-commands).
Native changes also require the upgrade skill's patch ledger, offline checker,
rebuilt tracked runtime and matching corresponding-source archive.

### Preserve verified runtimes

After runtime validation and affected Brave QA, immediately preserve the complete
`scummvm-shell/` bundle in a unique, ignored
`.internal/evidence/<task>/verified-runtime/` snapshot. Include plugins, data,
catalog/config, shell, runtime manifests, licenses and corresponding-source files.
Copy independent bytes; avoid links to mutable shared assets or build caches.

Keep a receipt beside the bundle with the base commit, ScummVM/toolchain pins,
the complete source-input path/SHA-256 manifest from
`scripts/write_source_info.py`'s `build_sources()`, its `--fingerprint` result,
every bundle file's relative path/SHA-256, and the checks and QA evidence covering
those bytes. Verify source inputs against the corresponding-source ZIP and run
`node scripts/manage_scummvm_assets.mjs validate SNAPSHOT_BUNDLE`.
Compare input and bundle manifests before and after copying; reject a changing
or incomplete capture and require copied hashes to match both passes. Copy to a
temporary sibling and rename the snapshot into place only after verification.

Before reuse, compare the recorded source-input paths/hashes and pins with the
actual scoped release candidate, then verify all snapshot file hashes, source
archive and runtime metadata. Confirm its catalog, config and other bundle
assets also match the intended candidate; preserve newer intended changes through
the documented regeneration and verification path. Run the offline patch checker
against that candidate and the bundle validator against the snapshot. Reuse matching verified
bytes without recompiling merely because another task replaced shared outputs.
Missing provenance, mismatched inputs or failed checks require the normal
rebuild/verification path; never relabel stale binaries as a newer build.

Use the snapshot for an isolated candidate or scoped Git staging; preserve
concurrent working-tree assets. Bind candidate checks to the saved bytes and
retain the normal application-build, CI and Production verification gates.
Keep the snapshot through exact-commit deployment and live verification, and
longer while needed for an active handoff or recovery. Remove completed,
task-owned snapshots through the normal artifact-cleanup policy.

## Publish and verify

Use [$private-skills_push](/Users/tsilva/.codex/skills/private-skills/private-skills_push/SKILL.md)
to commit the approved candidate and push `HEAD:refs/heads/main` to its configured
destination. Reconcile the published README description after the push.
Ordinary website deployments have no version tag or GitHub Release and publish
no release notes. Any requested outbound message retains draft approval.

The main push triggers `CI`; successful exact-commit CI triggers
`Production delivery`. Monitor both workflows for the pushed full SHA.
Do not bypass them with a direct Vercel deployment. Stop at a failed gate,
inspect its logs and preserve evidence. After an authorized repair, the documented
manual Production delivery dispatch is available only with successful
exact-commit CI.

Confirm the intended Vercel project/team, deployment SHA, Production READY state
and `scummweb.tsilva.eu` alias. Replay the affected public flow in Brave and close
task tabs. Report the commit, workflow links and verified live URL; distinguish
pushed, deployed and browser-verified states.
