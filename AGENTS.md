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

Local builds skip Sentry source-map uploads. Local dev and `secrets:check` fetch
no service credentials; the check verifies that private credentials are absent.
ScummWEB Development `/` remains the source for the scoped Sentry Vault reader.
Keep storage and OpenRouter credentials
out of the web process. [Production delivery](docs/production-delivery.md)
uses scummweb-production Production `/`. Keep private values out of logs and
retain Keychain originals until verified rotation.

The [sandboxed R2 publisher](docs/maintaining-scummweb.md#single-object-publishing-through-agent-vault)
signs single-object uploads with the ScummWEB Development `/` R2 pair, pinned
to `https://app.infisical.com` and `scummvm-games`. Only the loopback relay
capability enters the temporary Agent Vault bundle. The sandboxed process
gets a placeholder and can reach only the local proxy.

For agent-operated batch artwork publishing, use `pnpm artwork:check:vault`, then
`pnpm publish:artwork:vault WORKSPACE` only after the exact artwork plan is approved.
The reviewed service mapping is this native project, Development `/`, source pair
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`, bundle `local-scummweb-artwork-batch`.
Vault injects the pair only into the protected signing relay's credential header;
the batch publisher receives `scummweb_artwork_proxy_placeholder`. The relay limits
requests to the reviewed content-addressed artwork plan in `scummvm-games`, verifies
bytes and metadata, and uses conditional creates. No game uploads, pruning,
overwrites or bucket administration are included. Check is a HEAD-only request
for one pinned existing artwork object; it reads no object body.

The owner-only `artwork-relay/scummweb` profile under the Infisical configuration
directory pins the source binding, source files, runtime, installed relay and
policy. Changed pins require trusted review. Ordinary launches never fetch source
keys; trusted administrative sync is required after rotation. The macOS sandbox
allows only the native proxy, the isolated Python runtime and the selected artwork
files, and denies writes and credential-file access. The launcher uses reviewed
CLI 0.45.6 and explicitly pins its Agent Vault project; source, runtime and
protected-path changes require trusted review. Other full-access same-user
processes remain outside this boundary. Follow the batch-publishing section in
`docs/maintaining-scummweb.md`; keep the existing commands, application defaults
and production delivery unchanged. Missing bindings and failed requests stop
without raw-key fallback.

## Agent Vault: local Sentry issue reader

- For agent-operated Sentry reads, use `pnpm sentry:check:vault`, then
  `pnpm sentry:issues:vault -- --days 14 --limit 10` when issue contents are needed.
  The existing `pnpm sentry:issues -- --days 14 --limit 10` command selects the same
  protected reader. It never exports the source token into the reader process.
- Select native project `e1c358f8-0678-45d7-a2a8-270c2f29aadd`, Development
  (`dev`), `/`, `SENTRY_AUTH_TOKEN`, instance `https://app.infisical.com`.
  The dedicated bundle is `local-scummweb-sentry-read`.
- The original reader executes through a public placeholder and the macOS
  sandbox. Its project-filtered organization query is adapted to the equivalent
  single-project endpoint. The native service permits ScummWEB GET routes only.
- Use the reviewed source and runtime pins. Missing bindings, changed files and
  rejected authentication must stop explicitly. Trusted rotation refreshes only
  this service's credential from the same source, followed by the bounded check.
- Follow `docs/maintaining-scummweb.md#sentry-issue-reads-through-agent-vault`.
  Do not select the legacy injection command as a fallback or reuse an unrelated
  project's key. Real issue queries remain subject to their requested scope.

The Sentry reader pins Infisical 0.45.6 and explicitly selects its reviewed
Agent Vault project. Ordinary launchers never approve source or runtime changes.
General game-batch publishing remains a separate compatibility review; do not
use its historical credential-injection path as an agent fallback. The scoped
artwork routes above remain the approved publisher paths.

## Agent backbone

ScummWEB owns `agent-backbone/`: mechanical controls, captures, profiles,
spectator and native evaluation receipts. ScummBench launches it as an internal
managed backend and exposes the public MCP endpoint. The dependency direction
is AgentSCUMM → ScummBench MCP → ScummWEB; never import or launch AgentSCUMM
from this backbone. Keep puzzle-solving instructions and benchmark policy out
of it. See [the backbone guide](docs/agent-backbone.md). Run
`pnpm check:backbone` and `pnpm test:backbone` for changes to this component.
