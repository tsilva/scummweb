# agents.md

Repo notes for coding agents working in `scummvm-web`.

- Treat `bundle/scummvm-public.zip` as the source of truth for managed ScummVM web assets. `npm run dev`, `npm run build`, and `npm run start` restore it into `public/`.
- If launcher assets or bundled docs need to change, rebuild with `./scripts/build_bass_web.sh` and then refresh the archive with `npm run archive:scummvm-bundle`.
- The playable entry is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`, launched through `/scummvm.html#sky`.
- Main verification path: `./scripts/verify_bass_web.sh`. It requires a local Chrome or Chromium install.
- Avoid deleting unrelated worktree changes. This repo often has large generated-asset diffs in `public/` and `bundle/`.
