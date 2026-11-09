# agents.md

Repo notes for coding agents working in `scummweb`.

- Treat `scummvm-shell/` as the source of truth for managed scummweb shell assets. `npm run dev`, `npm run build`, and `npm run start` validate that tracked shell, then stage it into `public/` before starting Next.js.
- Edit browser shell templates in `web-shell/` and upstream source patches in `patches/scummvm/`. Rebuild with `./scripts/build_scummvm_web.sh` so `dist/` is regenerated and synced back into `scummvm-shell/`. See the [ScummVM upgrade procedure](docs/maintaining-scummweb.md#rebuilding-and-upgrading-scummvm).
- The playable entry is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`, launched through `/scummvm.html#sky`.
- End every user-facing game demo title with `(Demo)`, for example `The Secret of Monkey Island (Demo)`. Put platform, language, and edition details in separate metadata fields.
- Game assets should be accessed directly through the bucket origin, not proxied through the app server.
- Game artwork storage is controlled by `data/artwork-storage.json`. Published images use immutable R2 object URLs; keep logical game mappings and source credits in Git. Until `published` is true, artwork remains local. Follow the artwork publishing procedure in `docs/maintaining-scummweb.md`; upload and verify all objects before activation or removal of originals. `launcher/notices/` and `launcher/skip-intro/` remain runtime assets in Git.
- Keep user-facing documentation and test-status pages free of personal machine paths, storage-device names, browser-profile details, and agent tool logs. Describe game compatibility results and limitations in product terms.
- In this repo, when the user says `deploy`, treat it as a production deploy by default unless they explicitly ask for preview.
- For agent browser interactions and rendered checks, follow the global Browser Use and Testing policy through its documented runtime.
- `./scripts/verify_scummvm_web.sh` is the existing Chrome/Chromium verification harness. Use that browser path only when the user explicitly requests that browser; it is not a fallback when the preferred browser is unavailable.
- Keep agent gameplay procedures and experiments in the sibling `agentscumm` repository. This repository owns the browser game runtime.
- Avoid deleting unrelated worktree changes. This repo often has large generated-asset diffs in `public/` and `scummvm-shell/`.

## Game artwork generation

Use [$scummweb_game-assets](.codex/skills/scummweb_game-assets/SKILL.md) for
hero banners, card box art, generated-artwork inventories and R2 artwork delivery.
Record generated candidates and dates in `data/generated-artwork.json`; retain
original reference credits. Card box art must faithfully regenerate the original
box front to improve quality, preserving its artwork, title typography, branding
and layout. Do not use reimagined hero art as a replacement box cover.
Gameplay screenshots must remain original captures,
never generated or repainted. Resizing and lossless delivery encoding do not
change their original-capture provenance.

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

Local builds skip Sentry source-map uploads. Default dev uses Infisical scummweb Development / for the Sentry smoke test. Storage and OpenRouter values remain isolated from the web process. Production uses scummweb-production Production / and an explicit pinned manual sync command followed by redeployment. Never print or upload private values; retain Keychain originals until verified rotation.

For a single immutable artwork object, use the [sandboxed R2 publisher](docs/maintaining-scummweb.md#single-object-publishing-through-agent-vault). Its trusted signing step uses the existing ScummWEB Development `/` binding for `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`, pinned to `https://app.infisical.com` and the `scummvm-games` bucket. Its temporary Agent Vault bundle receives only a random loopback relay capability. The sandboxed publisher receives a placeholder and can reach only the local proxy. The existing bulk publishing workflow retains its separate credential requirements.
