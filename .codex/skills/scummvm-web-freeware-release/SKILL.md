---
name: scummvm-web-freeware-release
description: Use when working in the scummvm-web repo and the user asks to scrape, add, release, deploy, or verify another freeware game from the official ScummVM site. This skill covers sourcing the official download, enabling the matching engine, wiring launcher art and metadata, uploading the game payload to R2, refreshing the managed bundle, verifying launch, and deploying to production unless preview is requested.
---

# ScummVM Web Freeware Release

Use this skill when a request is effectively "add another official ScummVM freeware game here" or "scrape and release another game from the ScummVM site".

## Start Here

1. Read `AGENTS.md`.
2. Inspect the current release path in:
   `scripts/build_bass_web.sh`
   `app/page.js`
   `README.md`
3. Check the worktree before editing. This repo often has unrelated generated changes in `public/` and `bundle/`.

## Official Sources

- Official downloads index:
  `https://www.scummvm.org/games/`
- Official screenshots index for first-party Revolution titles:
  `https://www.scummvm.org/screenshots/revolution/`
- Prefer official ScummVM-hosted download URLs under:
  `https://downloads.scummvm.org/frs/extras/`

Before redownloading, hash any existing archive in `downloads/` and compare it to the SHA-256 published on the ScummVM games page. If the bytes already match, reuse the local file.

## Variant Selection Rules

- Always prioritize the English release.
- Never install a non-English archive unless the user explicitly asks for it.
- When multiple English variants exist, prefer the CD release over floppy or cut-down releases.
- When multiple English CD variants exist, prefer the talkie release over non-talkie releases.
- If the official page offers several archives, inspect filenames, release notes, and checksums carefully before downloading so the chosen archive matches `English -> CD -> talkie` priority.
- Reflect the chosen variant accurately in launcher copy and verification notes so the installed build is unambiguous.

## Release Workflow

1. Add or verify the archive in `downloads/`.
2. Patch `scripts/build_bass_web.sh`:
   add a `find_optional_archive` pattern for the new game
   append the archive to `GAME_ARCHIVES`
   enable the correct ScummVM engine
   add any special unzip target directory only if the archive layout needs it
3. Update launcher copy in `app/page.js`:
   add an `artByTarget` entry for the new target
   store art locally under `public/launcher/`
4. Update `README.md` so supported engines and optional archives stay accurate.
5. Run the build:

```bash
./scripts/build_bass_web.sh
```

6. Upload the new game payload to R2. Prefer a scoped upload when the game lives in its own subdirectory:

```bash
python3 ./scripts/upload_games_to_r2.py --game <target-or-folder>
```

If the game is mounted at `/games`, do the full upload instead.

Scoped uploads must keep bucket manifests fresh. The project uploader now overwrites
the root and ancestor `index.json` manifests during scoped uploads so new
subdirectory-backed games become discoverable immediately.

7. Refresh the managed ScummVM bundle source of truth:

```bash
npm run archive:scummvm-bundle
```

8. Run the main verification path:

```bash
./scripts/verify_bass_web.sh
```

9. Deploy. In this repo, `deploy` means production unless the user explicitly asks for preview.
10. Verify the live site after deploy:
    confirm the homepage/library tile renders
    launch the game on the production domain
    check the browser console and runtime log for the actual ScummVM startup line, not just the presence of the target link

## Common Failure Modes

- Engine requested but silently disabled during configure:
  inspect the configure output and the generated `config.mk` if the new engine does not appear in the built binary. Some engines need extra codec/image dependencies in the Emscripten toolchain before ScummVM will enable them.
- Game appears in launcher metadata but fails live with `Game data path does not exist`:
  check the bucket root `index.json` first. A stale manifest will hide the new game directory from the browser filesystem even when the homepage already shows the new tile.
- Game files exist but ScummVM does not auto-detect the install:
  compare the extracted files against the engine detection tables and the generated `scummvm.ini`. If detection still misses the official archive variant, patch the engine detector or append an explicit `scummvm.ini` stanza as a fallback during the build.

## Launcher Art Rules

- Prefer official ScummVM-hosted screenshots when possible.
- Download source images first, then convert them into local `public/launcher/<game>-*.jpg` assets.
- Good defaults:
  `heroImage`: the widest, moodiest scene
  `landscapeImage` and `spotlightImage`: readable scene with a character or landmark
  `posterImage`: reuse the landscape asset if there is no portrait art
- Keep assets local. Do not hotlink the official screenshot URLs in the app.

Useful commands:

```bash
curl -L --fail -o /tmp/game-shot.png <official-image-url>
sips -s format jpeg -Z 1600 /tmp/game-shot.png --out public/launcher/<game>-hero.jpg
sips -g pixelWidth -g pixelHeight public/launcher/<game>-hero.jpg
```

## Verification Notes

- `public/games.json`, `public/game.json`, `public/scummvm.ini`, `public/source.html`, and `public/scummvm.html` are generated by the build. Do not hand-edit them unless debugging.
- `./scripts/verify_bass_web.sh` depends on a local Chrome or Chromium install.
- Game payloads must be served from the bucket origin, not through the app server in production.
- Treat `User picked target ...` as necessary but not sufficient. A real successful boot should also avoid `Game data path does not exist`, `Couldn't identify game`, and similar ScummVM warnings in the runtime log.

## Lure Example

For `Lure of the Temptress`, the official English archive is:
`https://downloads.scummvm.org/frs/extras/Lure of the Temptress/lure-1.1.zip`

The matching published SHA-256 on the ScummVM games page is:
`f3178245a1483da1168c3a11e70b65d33c389f1f5df63d4f3a356886c1890108`

The official screenshots page exposes usable VGA screenshots under:
`https://www.scummvm.org/data/screenshots/lure/lure/`
