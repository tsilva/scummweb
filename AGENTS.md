# agents.md

Repo notes for coding agents working in `scummweb`.

- Treat `scummvm-shell/` as the source of truth for managed scummweb shell assets. `npm run dev`, `npm run build`, and `npm run start` validate that tracked shell, then stage it into `public/` before starting Next.js.
- Edit browser shell templates in `web-shell/` and upstream source patches in `patches/scummvm/`. Rebuild with `./scripts/build_scummvm_web.sh` so `dist/` is regenerated and synced back into `scummvm-shell/`. See the README upgrade procedure.
- The playable entry is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`, launched through `/scummvm.html#sky`.
- End every user-facing game demo title with `(Demo)`, for example `The Secret of Monkey Island (Demo)`. Put platform, language, and edition details in separate metadata fields.
- Game assets should be accessed directly through the bucket origin, not proxied through the app server.
- In this repo, when the user says `deploy`, treat it as a production deploy by default unless they explicitly ask for preview.
- For agent browser interactions and rendered checks, follow the global Browser Use and Testing policy and explicitly select Brave Stable’s Agents profile through its documented runtime.
- `./scripts/verify_scummvm_web.sh` is the existing Chrome/Chromium verification harness. Use that browser path only when the user explicitly requests that browser; it is not a fallback for unavailable Brave.
- Keep agent gameplay procedures and experiments in the sibling `agentscumm` repository. This repository owns the browser game runtime.
- Avoid deleting unrelated worktree changes. This repo often has large generated-asset diffs in `public/` and `scummvm-shell/`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Secrets

Local builds skip Sentry source-map uploads. Default dev uses Infisical scummweb Development / for the Sentry smoke test. Storage and OpenRouter values remain isolated from the web process. Production uses scummweb-production Production / and an explicit pinned manual sync command followed by redeployment. Never print or upload private values; retain Keychain originals until verified rotation.
