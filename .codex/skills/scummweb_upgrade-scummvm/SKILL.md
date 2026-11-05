---
name: scummweb_upgrade-scummvm
description: Check for a newer stable ScummVM release and upgrade ScummWEB's pinned engine, preserving documented native patches, browser integration, codecs and saves. Also maintain upgrade memory when changing ScummVM patches.
---

# scummweb: Upgrade ScummVM

Use the selected ScummWEB checkout on its current branch. An upgrade request
authorizes the local upgrade and verification; a check-only request is read-only.
Publication follows the user's existing authorization and production workflow.
Creating or editing this skill does not itself request an engine upgrade.

## Check and decide

1. Read [upgrade-memory.md](references/upgrade-memory.md) and
   [patches.json](references/patches.json). Reuse unchanged context. For patch
   maintenance, read the affected entries and shared invariants only.
2. Run the helper from the selected checkout:

   ```sh
   python3 .codex/skills/scummweb_upgrade-scummvm/scripts/upgrade_check.py
   ```

   It validates patch coverage/hashes, compares numeric stable versions, peels
   the official release tag to a commit, and checks the existing pin against
   upstream. Network/schema/integrity errors are failures, never "up to date".
   No newer stable release means report the result without a rebuild. Do not
   downgrade, select a prerelease/daily build, or add a scheduler implicitly.
   `ahead-of-latest` is a discrepancy: review official published releases and
   the ScummVM downloads page before claiming the current pin is up to date.
3. For a newer release, inspect its official release notes and the immutable
   upstream Emscripten build script linked by the helper. Check engine changes
   against each active patch. Choose a numeric SDK version after reviewing its
   compatibility with the project's codec build and generated SDL glue; the
   upstream default is evidence, not an automatic toolchain decision.

## Upgrade

Freeze the reviewed tag, commit and SDK, then update only the pin:

```sh
python3 .codex/skills/scummweb_upgrade-scummvm/scripts/upgrade_check.py \
  --apply --target-tag vVERSION --expected-commit FULL_SHA --sdk SDK_VERSION
pnpm run build:scummvm --prepare-source
```

The helper refuses a changed candidate, stale current pin or undocumented patch.
Use the build script's pinned checkout and ordered patch application. If a patch
conflicts, port its **intent** against the new upstream source and update its
memory entry and hash. Never skip a failed hunk or overwrite an edited vendor
checkout to make the build pass. Check the entire patch series again after ports.

If upstream now provides equivalent behavior, remove the redundant patch and
mark its ledger entry retired with the upstream release/commit and verification
evidence. Keep the behavioral requirement and regression checks in memory.

```sh
SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm
pnpm run lint
pnpm test
```

Rebuild through the maintained script so shell templates, audio adaptations,
indexes, fingerprints, provenance and the managed bundle stay consistent.
`--shell-only` cannot upgrade the compiled engine. Use an isolated Next build
directory for an additional production app build when a server is running; see
[development commands](../../../docs/maintaining-scummweb.md#development-commands).

## Verify and retain learning

Use Brave Stable through the bundled Browser runtime under repository policy.
Replay a catalog game and an imported ZIP, plus patch-specific states from the
ledger. Check cold and prepared-cache startup, native first-frame readiness,
audio gesture/unmute, input, intro skip, save and resume. Verify only the selected
engine plugin loads, cached launches do not download the ZIP, and the memory
budget remains bounded. Compare representative launch timings rather than only
checking that a frame eventually appears. Do not run the Chrome-only harness as
a fallback. Missing owned game files or unavailable browser access leave those
checks explicitly unverified; do not fabricate gameplay coverage.

Before finishing, update reusable lessons in `upgrade-memory.md` and affected
ledger entries: cause, constraint, preservation decision, retirement condition
and regression check. Keep transcripts, measurements, screenshots and per-run
reports in ignored `.internal/`, not in skill memory. Update authoritative docs
when commands or behavior change. Run `upgrade_check.py --offline` after edits.

Report old/new engine and SDK pins, patch ports/retirements, completed and missing
verification, and precise local/pushed/live status. A deployment is complete only
after the existing CI-gated production workflow and exact-commit READY checks.
