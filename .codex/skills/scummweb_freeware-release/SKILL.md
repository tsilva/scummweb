---
name: scummweb_freeware-release
description: Add and verify official ScummVM freeware games in ScummWEB, including engine plugins, checksum-pinned packages, catalog metadata, artwork and R2 delivery. Use for adding, publishing or deploying eligible games; publish and deploy only within the user's requested scope.
---

# scummweb: Freeware Release

Work on the current branch. Read `AGENTS.md`, the existing catalog and the relevant
sections of `docs/maintaining-scummweb.md`. Preserve unrelated staged, unstaged and
generated changes. An addition request authorizes implementation and verification;
a production deployment requires publication authorization. In this repository,
`deploy` means Production unless the user explicitly requests Preview.

## Select the source and edition

Use the official [game downloads](https://www.scummvm.org/games/) and archives under
`https://downloads.scummvm.org/frs/extras/`. Check the actual list: its introductory
paragraph can omit downloadable games farther down the page. ScummVM hosts the
packages; do not describe it as their original publisher.

Prefer English, then CD, then talkie editions. Other languages require an explicit
request. Reuse a local archive in `downloads/` when its SHA-256 matches the official
page. Otherwise download the selected package and verify its published checksum
before extracting or registering it.

Inspect the archive's license and release evidence. Free download availability or
an open-source engine does not establish permission to redistribute game assets.
Keep every original license and copyright notice. If terms conflict, complete
engine and personal-import support while withholding public game data. In
particular, the official `gotfree.zip` currently retains a redistribution ban in
`LICENSE.TXT`; God of Thunder remains import-only until that conflict is resolved.
Mystery House's original Apple II package is a public-domain release; retain the
release-history reference supplied by the installer.

## Wire the maintained sources

- `scripts/build_scummvm_web.sh` owns the enabled engine/subengine arrays and
  verifies each compiled plugin. `scripts/normalize_scummvm_shell.py` owns the
  detected-catalog allowlist. Update both where relevant.
- `data/classic-freeware.json` and `scripts/install_classic_freeware.py` implement
  additive, checksum-pinned packages. Extend the existing manifest when its schema
  and layout handling fit. The installer flattens one enclosing directory,
  preserves original files, registers stable targets and writes normalized ZIPs.
  Add explicit handling for genuinely different layouts rather than guessing.
- Catalog additions run after the tracked configuration is reused. This keeps
  existing games when their original archives are unavailable. `finalize_scummvm_dist.sh`
  regenerates `games.json` and notices from the resulting configuration.
- `app/game-presentation.js` owns bundled presentation; `app/retro-game-artwork.json`
  owns shared artwork, aliases and original-source attribution. Ensure an imported
  title and its bundled edition share the correct family. Official archive names
  such as `gotfree.zip` need appropriate aliases. Where necessary, extend the
  size/CRC-based rules in `app/archive-game-presentation.mjs`; generic names such
  as `vol.dat` alone are insufficient identification.
- Keep platform, language and edition metadata accurate, and retain `(Demo)` at
  the end of every demo title. Preserve established routes and target/save names.
- Native Continue eligibility is mirrored in `web-shell/continue-saves.mjs`.
  For a new engine, compare the pinned native save-list/startup-loading flags and
  filename conventions. Preserve the existing exclusions and capability tests.

Use `$scummweb_game-assets` for artwork. Reuse published logical mappings where
available; new originals, screenshots and responsive assets must be published and
verified before activation. Gameplay screenshots stay original captures. Images
and game ZIPs load directly from the bucket, with provenance and mappings in Git.

Update the README and maintenance guide when supported games or commands change.
Record edition-specific startup results in `data/game-compatibility.json`, then
run `node scripts/generate-compatibility-docs.mjs`. Keep run-specific reports and
screenshots in ignored `.internal/`, following repository exclusion checks.

## Rebuild the runtime and catalog

Use `$scummweb_upgrade-scummvm` for engine/patch maintenance. Preserve the pinned
release and SDK unless an upgrade was requested. Run its offline checker before
rebuilding; changed native patches or generated adapters require matching ledger
updates.

```sh
python3 .codex/skills/scummweb_upgrade-scummvm/scripts/upgrade_check.py --offline
SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm
```

This rebuilds the selected engines and installs available pinned additions from
`downloads/`. Missing optional archives preserve existing targets; checksum
mismatches fail the build. Verify that new plugins, required engine data, notices,
configuration and catalog entries reach `scummvm-shell/`.

For template-only changes, `pnpm run build:scummvm --shell-only` reuses compiled
engines. It cannot add an engine. Edit browser templates in `web-shell/`, not the
generated HTML/JS. Preserve UTF-8 byte encoding before Base64 initialization:
passing configuration text directly to `btoa()` fails on titles such as Sołtys.

`scummvm-shell/` is the managed source of truth. `pnpm run prepare` validates and
stages it into `public/`; do not hand-edit generated catalog/runtime files or use
retired bundle-archive commands. The older catalog detector still invokes Chrome;
do not run it under the default Brave policy. Use the additive manifest/reuse path
when appropriate, or adapt detection through the documented Brave runtime.

## Publish eligible packages and artwork

Follow the repository's reviewed credential route. Its current legacy R2 publisher
uses real keys for local S3 signing; without a compatible reviewed proxy, obtain
explicit authorization for that scoped raw-credential operation before running
it. Never fetch/export keys as an implicit fallback. Preserve the pinned vault,
environment, bucket and launcher. Approval from an earlier operation does not
cover a later upload.

The current play route consumes `<gameId>.zip`, not a remote directory mount.
The additive installer writes `dist/games/<gameId>.zip`. Prefer a **file-only**
scoped upload through the approved launcher, for example:

```sh
python3 scripts/infisical/run.py publish --game soltys.zip
```

Do not upload an incomplete root `index.json` from an additive build. Directory
scopes also overwrite ancestor indexes and can hide existing remote games when
older payloads are absent locally. Preserve existing objects; pruning or replacing
published bytes needs the corresponding authorization.

Prepare local ZIP matching metadata before publication if needed:

```sh
node scripts/generate-bundled-game-files.mjs --local-dir dist/games
```

After upload, verify exact public ZIP bytes and regenerate from hosted packages:

```sh
node scripts/generate-bundled-game-files.mjs
```

This uses bounded public ZIP-directory reads. Follow the game-assets skill's
plan, publish, verify and activate procedure for images. Scope plans so unrelated
pending artwork is not published. Keep local inputs until delivery verification
and any separately applicable removal authorization are complete.

## Verify and deploy

Run syntax, relevant regression tests and a production application build. Use a
separate `SCUMMWEB_DIST_DIR` when a local server is running. Do not run preparation
or rebuild steps concurrently with gameplay verification when their file changes
would invalidate the active runtime. Preserve existing servers; new npm previews
use `--port auto`, and report their printed URL.

Use the bundled Browser runtime with explicit `agent.browsers.get("brave")` and
its documentation. Launch from each game's visible page/library action. Require
both the correct native `Running <game>` line and a rendered game screen; a target
selection or removed loading overlay alone is insufficient. Check cold and cached
starts, input, audio gesture and supported save/resume behavior. Verify a personal
ZIP import when adding an import-only engine. Use isolated game sessions to avoid
resource contention; focused canvas key presses are more reliable for text games
than unfocused accessibility typing. Report unverified checks plainly.

For an authorized deployment, use `$private-skills_push` and the existing
`.github/workflows/production-delivery.yml` on the configured production branch.
Review and commit only the requested release changes; preserve unrelated local
work. Follow the established HTTPS/`gh` transport and description reconciliation.
Do not bypass the trusted delivery workflow with a direct Vercel deploy: it waits
for exact-commit CI, syncs allowlisted Production configuration and verifies the
resulting deployment. Do not create a GitHub Release, tags or outbound messages
unless separately requested; messages retain the draft-approval rule.

Monitor the CI and Production delivery runs for the exact pushed SHA. On failure,
inspect the failed gate and follow its recovery policy. Confirm the intended
Vercel project/team, Production READY state, commit and live custom-domain alias.
Then repeat visible library/page launch checks on production and retain a proof
screenshot. Report local, pushed and verified-live status distinctly, including
any game withheld from public bundling.
