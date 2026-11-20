---
name: scummweb_verify-dropbox
description: Verify ScummWEB Dropbox save syncing, native ScummVM import/export, automatic reconciliation and interrupted-sync recovery through archive audits and live gameplay. Use for save-sync regression and resilience QA, not general Dropbox administration.
---

# Verify Dropbox

Verify completed save bytes, automatic convergence and recoverable alternatives
through the selected account and Brave profile. A successful request or spinner
alone does not prove protection. Use [the product guide](../../../docs/dropbox-save-sync.md)
for configuration and supported behavior: ScummWEB manages checksum-named cloud
snapshots only in `/Apps/ScummWEB/saves/`; desktop transfers use **Import saves**
and **Export saves**, with native filenames and bytes.

## Select the evidence needed

- **Archive audit:** read downloaded native exports and Dropbox saves-folder ZIPs
  locally with the helper below; make no live changes.
- **Regression:** select current `test/dropbox-*.test.mjs`,
  `test/cloud-native*.test.mjs`, `test/scummvm-transfer.test.mjs` and
  `test/save-backups.test.mjs` cases. Discover names before running commands.
  Fixtures do not qualify live authorization, persistence or network outages.
- **Live QA:** exercise affected rows below in the actual connected Brave profile.
  Reuse unchanged evidence for narrow fixes. Full qualification requires all
  applicable rows; record unavailable or missed cases as unverified.

Skill use does not authorize live account changes, deployment, credential
extraction or destructive experiments. Use existing task authorization for
routine gameplay and test-file operations; resolve unclear account/scope first.
Ask immediately before **each browser process kill**, after inventorying running
games and explaining its impact. Preserve other tasks' tabs and processes.

## Protect the account first

1. Identify checkout, source/deployment SHAs, actual profile and account through
   supported UI. Reuse the documented Brave runtime; never inspect tokens,
   credential records, cookies or private runtime state to bypass UI.
2. Export the latest browser collection and independently download Dropbox
   `saves` before conflicts or fault injection. Validate integrity and record
   set/file hashes, node IDs and tips. Preserve any pre-existing loose files or
   obsolete test folders; this workflow performs no migration or history cleanup.
   Use new manual slots and retain originals.
3. Keep reports, recovery archives, screenshots and task-owned path/PID receipts
   under ignored `.internal/qa/` and `.internal/evidence/`, following `AGENTS.md`.
   Keep personal metadata and run evidence out of maintained skills/public docs.

## Live acceptance matrix

| Flow | Required observation |
| --- | --- |
| Save, exit, reopen and manual Load | Intended native slot restores; fresh browser/cloud archives agree on bytes and earlier manual slots remain. |
| Native import/export | Raw files and ordinary ZIPs import through the real picker; exported current/recovery folders retain native names and bytes. Re-import/re-export preserves set identities. |
| Import matching and review | Recognized editions match automatically; unknown files stay selected while choosing a game. Incoming overlaps take precedence, previous progress remains recoverable, and background changes during review retain new compatible slots. |
| Automatic reconciliation | Independent slots merge; overlapping slots choose deterministically; companion/index or layout conflicts retain a coherent complete copy. All competing originals remain recoverable, without conflict prompts. |
| Multiple games/devices and retries | Devices converge on the same bytes regardless of listing order or equal clocks. Unchanged retries create no duplicate logical publication or recurring decisions. |
| Interrupted publication/reconciliation | After a requested close or individually approved kill during verified durable work, reopening resumes automatically with intact ancestry, alternatives and native loadable bytes. |
| Load from backup | Open the matching game and choose an older slot under Load Game → Backed-up saves. Verify that it loads, active files retain their bytes, and Save Game writes to a normal slot. |
| Multiple tabs | Same-edition access is fenced. A same-origin online tab may drain another tab's queue; distinguish that from an isolated outage. |
| Isolated connection loss | Completed new slot is absent from every fresh cloud snapshot while offline; after exit/reconnection it uploads automatically once and loads natively. |

Read [live-flows.md](references/live-flows.md) for transfer fixtures, automatic
selection, interruption timing, outage isolation and browser downloads. Stop on
unexpected corruption, account changes or unclear ownership; preserve recovery
inputs before another mutation.

## Audit downloaded archives

From the repository root, using existing dependencies:

```sh
node .codex/skills/scummweb_verify-dropbox/scripts/audit.mjs \
  --cloud .internal/evidence/TASK/cloud-after.zip \
  --browser .internal/evidence/TASK/native-after.zip \
  --baseline-cloud .internal/evidence/TASK/cloud-before.zip \
  --baseline-browser .internal/evidence/TASK/native-before.zip \
  > .internal/evidence/TASK/archive-audit.json
```

Only `--cloud` is required. Browser inputs accept **Export saves** native ZIPs
with edition/current/recovery folders, or internal backup ZIPs. No conversion is
needed. Cloud inputs contain checksum-named snapshot ZIPs, flat or under one
Dropbox wrapper directory. If legacy loose files remain, preserve the raw archive
and prepare a separate local snapshot-only ZIP, recording omitted entries; never
delete provider files to satisfy the helper.

The helper uses production readers to validate logical IDs (including saved time),
ancestry, bounds and checksums; compares browser sets/baseline history with cloud
contents; and reports file digests and profile tips. ZIP container timestamps are
not save identity. Earlier browser sets must remain in **cloud history**, not
necessarily current working progress. `--allow-conflicts` permits deliberately
unresolved intermediate tips only; omit it for final qualification. Integrity
failures always fail. JSON reports may contain private metadata; failures exit
nonzero.

Use `nodes[].files` to prove a slot is absent from **all** history during an outage
and compare later bytes, scoped to its profile. Compare node IDs/parents across
retries to detect duplicate publications or lost ancestry. A successful archive
audit alone does not prove native loading, active-copy preference or live UI.

Validate helper changes with:

```sh
node --test .codex/skills/scummweb_verify-dropbox/scripts/audit.test.mjs
```

## Finish

Record actual workflows, hashes, native loads, scoped source checks and limits.
Distinguish live observations, fixture replays, missed interruption windows and
unverified outages. Capture visible completion before closing task tabs.
Fix authorized defects and rerun affected checks; use
[$scummweb_build-release](../scummweb_build-release/SKILL.md) only when publication
is requested. Testing alone does not authorize deployment.

Retain original files, immutable cloud history, new progress and recovery inputs.
Remove only verified task-owned disposable artifacts, using recoverable deletion
for live test fixtures. Never empty Trash or purge a profile for a test. Close
temporary verification tabs and release owned processes; preserve handoff pages.
