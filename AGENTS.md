# agents.md

Repo notes for coding agents working in `scummweb`.

- Treat `scummvm-shell/` as the source of truth for managed scummweb shell assets. `npm run dev`, `npm run build`, and `npm run start` validate that tracked shell, then stage it into `public/` before starting Next.js.
- If launcher assets or generated ScummVM shell files need to change, rebuild with `./scripts/build_scummvm_web.sh` so `dist/` is regenerated and synced back into `scummvm-shell/`.
- The playable entry is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`, launched through `/scummvm.html#sky`.
- Game assets should be accessed directly through the bucket origin, not proxied through the app server.
- In this repo, when the user says `deploy`, treat it as a production deploy by default unless they explicitly ask for preview.
- Main verification path: `./scripts/verify_scummvm_web.sh`. It requires a local Chrome or Chromium install.
- Whenever browser testing is needed, prefer direct `js_repl` with `scripts/playwright_headless_repl.mjs` so Playwright stays headless by default. Only use a visible/headed browser path when the task explicitly requires OS-level or visually interactive debugging.
- Avoid deleting unrelated worktree changes. This repo often has large generated-asset diffs in `public/` and `scummvm-shell/`.
