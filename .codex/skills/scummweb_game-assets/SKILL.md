---
name: scummweb_game-assets
description: Add, refresh, or verify ScummWEB game artwork in R2 while retaining mappings and source credits in Git. Use for catalog games and supported personal imports, including ZIP handoffs for newly supported local games.
---

# scummweb: Game Assets

Read the repository's `AGENTS.md` and the [artwork publishing procedure](../../../docs/maintaining-scummweb.md#artwork-storage-and-publishing). Check `scummvm-shell/games.json` for catalog targets and `app/game-presentation.js` for artwork and imported-title recognition. Keep personal imports distinct from the public catalog.

## Artwork

- Published covers, posters, heroes, screenshots, and responsive variants live in the existing R2 bucket and load directly from `https://scummvm-games.tsilva.eu/artwork/<sha256>/<filename>`. `data/artwork-storage.json` maps logical image paths to immutable object keys, checksums, sizes, MIME types, and dimensions. Keep game mappings and source credits in Git; do not commit artwork binaries or hardcode resolved R2 hashes into game presentation records.
- Use `scummvm-shell/launcher/` only for ignored local upload inputs. Wire logical `/launcher/...` paths in `app/game-presentation.js` and `app/retro-game-artwork.json`; the shared artwork resolver supplies the published URLs. Use a portrait cover for the poster and a wide image for the hero where available. Retain screenshots that match the game. Prefer official promotional art, original box scans, and ScummVM gameplay captures. Inspect source images and rendered crops, and retain per-image provenance in the artwork JSON and maintenance guide.
- Share one artwork set per game across platform, language, and edition variants. Keep variant metadata separate from the artwork lookup and retain `(Demo)` at the end of demo titles.
- Keep branding, `launcher/notices/`, and `launcher/skip-intro/` in Git. Generated social-card PNGs remain ignored build outputs; their manifest and rendering code stay tracked.

## Publishing artwork

1. Prepare the new or revised local images, update their logical mappings and source credits, then run `pnpm run generate:artwork` to generate responsive poster variants and update `data/artwork-renditions.json`.
   Use `pnpm run optimize:artwork` for a complete delivery pass from verified published originals. It preserves source objects, verifies lossless PNG-to-WebP conversions, creates responsive variants without upscaling, and screens AVIF alternatives for size and decoded quality. Inspect representative candidates before publication; numerical quality checks alone do not establish visual equivalence.
2. Run `pnpm run artwork:plan`. It preserves the active storage mapping, retains previously published records without local originals, and prepares a private upload plan and exact image copies. Keep this evidence under the repository's ignored `.internal/` directory.
3. Use an authorized credential route to run `pnpm run publish:artwork`. The publisher targets the existing bucket's reserved `artwork/` namespace, creates content-addressed objects conditionally, and checks every object's bytes and metadata by readback. It does not overwrite or prune existing objects or change bucket settings.
4. Run `pnpm run artwork:activate`. This verifies every public image's checksum, length, MIME type, and immutable cache metadata before atomically switching the tracked storage manifest.
5. After activation, run `pnpm run artwork:retire-local`. It verifies public delivery again, preserves exact private copies, and removes registered image files from local source and staging directories. It rejects changed originals and preserves notices and skip-intro saves. Keep older R2 objects available for older deployments.
6. Run `pnpm run prepare` and the relevant verification below. Commit the mappings, credits, storage and rendition manifests, and any intended source-image deletions when committing is authorized. A publishing request does not itself authorize a Git push or deployment.

The existing Infisical publisher passes the scoped S3 key pair into its subprocess. Under the repository's proxy-first access policy, use a reviewed compatible broker when available; otherwise obtain explicit authorization for that raw credential operation before running it. Approval for an earlier migration is not approval for a later upload. Never display or persist keys, add dotenv fallbacks, reuse another project's credentials, or broaden access to bypass a missing route.

For verification-only requests, run `pnpm run artwork:plan` to prepare the intended image set, then `pnpm run artwork:verify`. Verification reads public objects without publishing, activating, or retiring files and requires no storage credentials. Unpublished local revisions in the plan can legitimately fail public verification.

Normal builds need no storage credentials. Social-card generation reads checksum-verified public or cached originals after local inputs are retired, so a fresh checkout needs access to the public bucket. Published responsive mappings survive builds without local originals. For runtime changes, follow the maintenance guide's separate ScummVM rebuild procedure.
The storage manifest's optional `images` map activates optimized fallbacks and complete responsive format sets alongside verified object records. Keep logical source paths and credits unchanged. AVIF picture sources must cover every WebP candidate width; keep WebP when a complete, smaller set does not meet the quality checks. Normal builds never rerun AVIF encoding.

## ZIP handoff for newly supported personal games

- When adding support for a game from a local collection, prepare one ZIP per supplied edition and place it in the user-selected output folder for drag-and-drop. Use a name with the full title and edition labels, and preserve the game data layout that ScummVM expects.
- Keep source files intact and game archives outside tracked and web-served paths. Exclude filesystem metadata and external launcher pointers. Test the ZIP and verify the output copy against its source ZIP. Reuse an identical output copy. Preserve a different file already using the same name and report the conflict.
- Personal game packaging is a local handoff. Use the separate freeware release workflow when the user requests public publication of an eligible game.

## Verification

- Use the bundled Browser runtime. Initialize `browser-client`, explicitly select Brave with `agent.browsers.get("brave")`, and read its documentation. Follow the repository's browser policy if the connection is unavailable.
- Reuse a suitable preview or start `pnpm run dev:app --port auto`, then report the printed URL. Verify the visible cover and any hero or screenshot placement on the affected route. For a newly supported personal import, drop the actual ZIP into the local app and verify that ScummVM detects the intended edition and renders a game frame.
- Check that affected covers, heroes, gallery images, and responsive candidates load directly from R2 and that source credits remain present. After retirement, verify with local originals absent; include a fresh-cache public-image read when changing build-time artwork loading.
- Run `pnpm run lint` and relevant tests, including artwork storage, posters, social cards, and imported-game metadata. For storage or publishing changes, also run the synthetic Python artwork publisher and credential-isolation tests, then a production build in an output directory separate from any running server. Use the Chrome/Chromium verification harness only when the user explicitly selects that browser.
