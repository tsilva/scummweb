# ScummWEB agent instructions

- Use [$scummweb_build-release](.codex/skills/scummweb_build-release/SKILL.md)
  for production builds, deployments and release verification.

- Edit runtime templates in `web-shell/` and native patches in `patches/scummvm/`.
  Rebuild the tracked `scummvm-shell/` using the [runtime build guide](docs/maintaining-scummweb.md#rebuilding-and-upgrading-scummvm).
  App commands validate and stage that bundle into `public/`.
- Use Beneath a Steel Sky from `downloads/bass-cd-1.2.zip` via
  `/scummvm.html#sky` as the baseline. Keep unrelated generated-asset changes.
- End demo titles with `(Demo)`. Store platform, language, and edition separately.
  Serve game assets directly from the bucket.
- Keep story maps in `data/game-internals/`. Follow the [map and tracker guide](docs/game-progress.md).
  Keep gameplay procedures and experiments in the sibling `agentscumm` repo.
- Follow the global browser policy. Use `./scripts/verify_scummvm_web.sh`
  only when the user explicitly selects Chrome or Chromium.
- Keep public docs and test results free of personal machine paths, storage
  device names, browser-profile details, and agent logs. Describe compatibility
  in product terms.
- Treat `deploy` as Production unless the user asks for Preview.

## Game artwork generation

Use [$scummweb_game-assets](.codex/skills/scummweb_game-assets/SKILL.md) for
generation, provenance and [R2 delivery](docs/maintaining-scummweb.md#artwork-storage-and-publishing).
Keep card covers faithful to the original box front and screenshots as original
captures. Verify public objects before activation or retiring originals.
Keep logical mappings, source credits, `launcher/notices/`, and
`launcher/skip-intro/` in Git.

## ScummVM upgrades and patch memory

Use [$scummweb_upgrade-scummvm](.codex/skills/scummweb_upgrade-scummvm/SKILL.md)
to check for and upgrade ScummVM releases, and when maintaining ScummVM patches.
Every added, modified, renamed or retired native patch and generated-runtime
patch adapter must update the skill's
[patch ledger](.codex/skills/scummweb_upgrade-scummvm/references/patches.json)
in the same change: purpose, preservation requirements, regression checks,
retirement condition and current SHA-256. Retired entries keep the upstream fix
and verification evidence. Record cross-cutting upgrade lessons in the skill's
[upgrade memory](.codex/skills/scummweb_upgrade-scummvm/references/upgrade-memory.md).
Keep native patches in `patches/scummvm/*.patch` and generated-runtime adapters
under `scripts/patch_scummvm_*`; extend the checker when introducing a new kind.
Do not bypass a failed patch or memory check to complete an upgrade. Run the
skill's `scripts/upgrade_check.py --offline` before rebuilding; builds and tests
enforce coverage. Keep per-run evidence in ignored `.internal/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Secrets

Local builds skip Sentry source-map uploads. Keep storage and model credentials out of the web
process. Production delivery remains isolated; never print credentials or change
its source bindings during local access work.

Artwork publishing requires approval of the exact plan. The trusted signer checks
its current base hash, canonical paths, bytes, MIME types and content-addressed
keys before listening. Batch scope is at most 512 objects of 2 MiB each; the
single-object route narrows the signer to the exact selected logical object.
Use conditional creates and checksum/metadata readback. Never overwrite, prune,
publish games, administer buckets or activate a plan through these routes. Keep
the signer policy owner-only and rotation separate from ordinary publishing.
See [artwork delivery](docs/maintaining-scummweb.md#artwork-storage-and-publishing).

## Agent backbone

ScummWEB owns `agent-backbone/`: mechanical controls, captures, profiles,
spectator and native evaluation receipts. ScummBench launches it as an internal
managed backend and exposes the public MCP endpoint. The dependency direction
is AgentSCUMM → ScummBench MCP → ScummWEB; never import or launch AgentSCUMM
from this backbone. Keep puzzle-solving instructions and benchmark policy out
of it. See [the backbone guide](docs/agent-backbone.md). Run
`pnpm check:backbone` and `pnpm test:backbone` for changes to this component.
