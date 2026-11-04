---
name: scummweb_game-assets
description: Add, refresh, or verify ScummWEB game artwork, including covers, posters, hero images, and screenshots. Use for catalog games and supported personal imports. Package newly supported local games for drag-and-drop when applicable.
---

# ScummWEB Game Assets

Read the repository's `AGENTS.md` and [maintenance guide](../../../docs/maintaining-scummweb.md). Check `scummvm-shell/games.json` for catalog targets and `app/game-presentation.js` for artwork and imported-title recognition. Keep personal imports distinct from the public catalog.

## Artwork

- Keep managed images under `scummvm-shell/launcher/`. The app stages that directory into `public/launcher/` during development, build, and start. Change the tracked source so the images survive the next staging run.
- Wire the images in `app/game-presentation.js`. Use a portrait cover for the poster and a wide image for the hero where available. Retain screenshots that match the game. Prefer official promotional art, original box scans, and ScummVM gameplay captures. Inspect the source image and the rendered crop, and record provenance alongside the existing asset references in the maintenance guide.
- Share one artwork set per game across platform, language, and edition variants. Keep variant metadata separate from the artwork lookup and retain `(Demo)` at the end of demo titles.
- For an artwork-only change, `pnpm run prepare` validates and stages the managed files. If the runtime also changes, edit the appropriate templates or build source and follow the maintenance guide to rebuild `scummvm-shell/`.

## ZIP handoff for newly supported personal games

- When adding support for a game from a local collection, prepare one ZIP per supplied edition and place it in the user-selected output folder for drag-and-drop. Use a name with the full title and edition labels, and preserve the game data layout that ScummVM expects.
- Keep source files intact and game archives outside tracked and web-served paths. Exclude filesystem metadata and external launcher pointers. Test the ZIP and verify the output copy against its source ZIP. Reuse an identical output copy. Preserve a different file already using the same name and report the conflict.
- Personal game packaging is a local handoff. Use the separate freeware release workflow when the user requests public publication of an eligible game.

## Verification

- Use the bundled Browser runtime. Initialize `browser-client`, select the browser required by the global Browser Use and Testing policy, and read its documentation. Follow the repository's browser policy if the connection is unavailable.
- Reuse a suitable preview or start `pnpm run dev:app --port auto`, then report the printed URL. Verify the visible cover and any hero or screenshot placement on the affected route. For a newly supported personal import, drop the actual ZIP into the local app and verify that ScummVM detects the intended edition and renders a game frame.
- Run `pnpm run lint` and the relevant tests. Use the Chrome/Chromium verification harness only when the user explicitly selects that browser.
