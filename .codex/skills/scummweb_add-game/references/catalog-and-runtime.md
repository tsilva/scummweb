# Catalog and runtime mechanics

Read the relevant sections of `docs/maintaining-scummweb.md` before rebuilding.
The additive installer preserves existing targets when older optional archives
are unavailable; checksum mismatches fail rather than replacing known data.

- `scripts/build_scummvm_web.sh` owns engine/subengine arrays and checks compiled
  plugins. `scripts/normalize_scummvm_shell.py` owns the detected-catalog allowlist.
  A template-only build cannot add an engine.
- `data/classic-freeware.json` and `scripts/install_classic_freeware.py` own pinned
  packages and layout handling. The installer flattens one enclosing directory,
  retains original files and writes `dist/games/<gameId>.zip`. Unchanged demos
  use `preserveArchive`; their expected native path can remain nested. Register
  new layouts explicitly instead of guessing or silently repacking.
- Additions run after the tracked catalog is reused. `finalize_scummvm_dist.sh`
  regenerates configuration, launcher metadata and notices.
- Native Continue eligibility is mirrored in `web-shell/continue-saves.mjs`.
  For a new engine, compare pinned native save-list/startup-load flags and save
  naming. Preserve exclusions and capability tests.
- Keep UTF-8 byte conversion before Base64 configuration encoding; directly
  applying `btoa()` to international titles fails.

Normal full-runtime path, after the upgrade skill's offline check:

```sh
SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm
pnpm run prepare
```

When compiled engine/source inputs are unchanged, the documented additive path
can reuse a validated matching runtime in a task-owned candidate: stage its
`scummvm-shell/` into `dist/`, run the installer, regenerate launcher metadata and
runtime manifests, validate and stage `dist/` back into `scummvm-shell/`, then run
`pnpm run build:scummvm --shell-only` and `pnpm prepare`. Use the managed asset
commands in the maintenance guide; never copy unrelated root working binaries
into an otherwise verified candidate. Preserve corresponding-source and runtime
hash parity and the complete independent snapshot required by build-release.

Local ZIP metadata preparation:

```sh
node scripts/generate-bundled-game-files.mjs --local-dir dist/games TARGET
```

After exact public archive verification:

```sh
node scripts/generate-bundled-game-files.mjs --remote TARGET
```

`pnpm prepare` validates/stages runtime assets and refreshes progress, artwork and
social-card output. Reuse verified caches and generated images as described by
build-release; keep all input/image hash checks. A different renderer can alter
social-card input hashes without altering image hashes. Review actual scoped
entries instead of committing unrelated manifest churn.

The old catalog-detection harness uses Chrome; use the additive/pinned detector
path under the default Brave policy. Existing dev servers can cache static
parameters for newly added routes. Inspect the actual failure; preserve the
server and use a reversible candidate-only route refresh if needed, restoring
the exact maintained route before final checks. Test/build in separate output
directories, never concurrently with gameplay QA.
