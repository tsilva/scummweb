---
name: scummweb_add-game
description: Add a ScummWEB game or demo with complete catalog metadata, import recognition, bucket delivery, hero and box art, gameplay checks and verified Production delivery. Also supports personal-import editions whose data cannot be redistributed.
---

# scummweb: Add Game

Use this workflow for each requested game. Read repository instructions, the
current catalog and relevant maintenance documentation. Preserve the current
branch, concurrent work, existing targets and save identities. Resolve whether
the request covers public bundling, personal import, or both. Honor existing
session authorization; do not repeat approvals already covering the operation.
Deployment requires publication authorization. Process a requested release queue
one game at a time through live verification before advancing; document excluded
or blocked editions explicitly rather than silently dropping them.

## Source, edition and redistribution

- Select an official source from [ScummVM games](https://www.scummvm.org/games/),
  [demos](https://www.scummvm.org/demos/) or the rights holder. Prefer English,
  then a supported CD/talkie edition. Verify the exact demo against the pinned
  native detector; full-game support does not establish demo compatibility.
  Prefer interactive content and verify that labels correspond to actual play.
- Record the source URL, edition, original filename, length and complete SHA-256.
  Check a published checksum when available; otherwise compute and pin the
  downloaded bytes without claiming the hash was supplied upstream. Verify a
  matching local source before reusing it. Test ZIP integrity and reject unsafe
  paths. Keep archives outside tracked/web-served application assets.
- Inspect the complete package, including notices, executables, libraries,
  drivers, fonts, installers and nested archives, as data. Decode compiled Help
  or encoded strings when needed; validate decoder output instead of accepting
  a successful exit code alone. Never execute downloaded game installers.
- ScummVM hosting and an open-source engine are not an express game-data license.
  Retain all notices and record the actual grant, restriction or uncertainty.
  If the user explicitly accepts a cautious official-promotional-hosting
  assessment, record that limited basis without inventing a rights-holder grant.
  Express restrictions or unresolved conflicting terms withhold public data;
  preserve eligible personal-import support. Do not strip restricted components
  merely to evade terms or describe the remaining payload as the intact demo.
- Official demo publication uses the complete unchanged source ZIP with
  `preserveArchive: true` and `redistributionReview` in the package manifest.
  God of Thunder, Discworld II, Riven and Resonance have recorded package-specific
  restrictions; consult current evidence before reconsidering those editions.

## Complete the catalog and presentation

Use maintained sources, then generate their outputs. Reuse one artwork family
across platforms, languages and editions; keep edition identity separate.

| Requirement | Maintained source and acceptance condition |
| --- | --- |
| Stable identity | `data/classic-freeware.json`: unique target, engine/game IDs, expected native path, platform, language, edition, source and checksum. Preserve existing entries. End demo titles with `(Demo)`. |
| Title and copy | `app/game-presentation.js` and `app/retro-game-artwork.json`: accurate display title, release year, studio, concise game-specific description (`summary`), genre and library category. Inherited fields must actually resolve; no filename or generic-copy fallback. Verify factual metadata against a primary source. |
| Tags | `app/game-player/launch-tags.mjs`: useful play-style and theme tags. Check resolved year/platform labels and category filtering; avoid redundant or invented tags. |
| Import recognition | Shared family aliases and `app/archive-game-presentation.mjs`: distinctive size **and CRC** groups when filenames are ambiguous. Never identify a game from generic filenames alone or create test aliases to bypass duplicate protection. |
| Public fingerprint | `data/bundled-game-files.json`: regenerate the selected target from the verified hosted ZIP. A local fingerprint supports preparation, not proof of publication. |
| Artwork | Logical hero, portrait cover and existing original screenshot gallery, with provenance/credits and verified storage mappings. Follow the artwork requirements below. |
| Compatibility | Append the exact tested edition to `data/game-compatibility.json`; preserve full-game/other-edition records. Record startup, input and save limitations accurately; regenerate `docs/game-testing.md`. |
| Documentation | Update relevant maintained guidance and README first-use links when needed; keep run logs, screenshots and assessments in ignored `.internal/`. Public docs contain reusable behavior/provenance, not private evidence paths. |

For private imports, keep game data outside the public catalog/bucket and follow
the game-assets skill's ZIP handoff procedure if packaging was requested.

## Hero, box art and screenshots

Use [$scummweb_game-assets](../scummweb_game-assets/SKILL.md). Check existing
published mappings before generating anything. Verify reused public image bodies
against their expected hashes, sizes, MIME types and decoded dimensions.

- Demos and full versions MUST share the same hero and box art. Reuse the
  existing game's logical mappings; do not generate demo-specific replacements.
  When artwork exists only on the demo, wire any recognized/imported full-game
  entry to that same set. Verify resolved `heroImage` and `posterImage` equality
  across both entries and imported copies; run the sharing regression in
  `test/retro-game-metadata.test.mjs`. Keep `(Demo)` labels and gameplay capture
  attribution edition-specific.
- A cover is a portrait, faithful restoration of the original box front,
  preserving its artwork, title typography, logos, composition and palette.
  Use the original box front as the reference; obtain a valid source before
  proceeding if it is missing. Never turn the hero into invented box art.
- A hero is a wide composition from original game/promotional artwork, with
  space for real page copy and recognizable subjects. Inspect desktop and mobile
  crops; set a target-specific mobile focal point where necessary. Keep faces,
  headings, metadata and Play readable at both sizes.
- Gameplay screenshots are original captures with credits, never generated or
  repainted. Shared full-game gallery images must retain their correct edition
  attribution; do not claim they were captured from the demo.
- New generated images require `data/generated-artwork.json` provenance. Keep
  logical paths and source credits in Git, images in the existing bucket.
- Follow exact-plan approval, conditional publication, full public verification,
  responsive delivery, activation and guarded local retirement. New originals
  require the source-publication then delivery-variant pass. Existing session
  approval applies only to its covered plan. Never use artwork access for games.
- Check the actual library card and selected responsive URL, hero, gallery and
  social-card output. Every activated public asset must work with local originals
  absent, directly from the bucket.

## Runtime, packages and delivery

Read [catalog and runtime mechanics](references/catalog-and-runtime.md). Use
[$scummweb_upgrade-scummvm](../scummweb_upgrade-scummvm/SKILL.md) for new engines
or native/adapter changes, preserving pinned versions and patch-ledger/source
parity. Existing engine support can reuse matching verified compiled bytes.
`web-shell/` owns templates; `scummvm-shell/` is the staged runtime source of truth.
Do not edit generated catalogs/HTML by hand or replace newer concurrent binaries.

For public games, follow [game publishing](../../../docs/game-publishing.md) and
the canonical checkout's approved access profile. Prepare the exact plan using
`python3 -B scripts/game-publishing/plan.py TARGET`. Use the declared Runbox
`game-publish` route after its offline and bounded online checks. No raw-key
retrieval, alternate credential route, automatic trust-drift approval or bucket
administration is part of adding a game. Unsupported sources/layouts need a
reviewed publisher change, never a silent workaround.

The player downloads `<gameId>.zip` from the existing game bucket origin
`https://scummvm-games.tsilva.eu`. Publish only the selected package with
conditional creates. Never overwrite/delete objects or publish incomplete root
indexes. Check full public ZIP bytes, SHA-256, length, MIME and immutable caching
independently, then regenerate the selected hosted fingerprint. Respect archive,
expanded-size and file limits; exceptions require exact-source justification and
tests, not global limit increases. Ordinary application builds need no storage
credentials. Do not mutate source/catalog/runtime files during active game QA.

## Gameplay and completion gates

Use the bundled Browser runtime, explicitly selecting Brave. Launch from the
visible detail/library Play action. For a new recognized edition, test the actual
personal ZIP before registering its hosted duplicate fingerprint where practical.
Never fabricate an alias or alter bytes to force a duplicate import test.

Require both correct native engine/game/edition evidence and an original rendered
game frame. Some engines log a native detector and selected target instead of
`Running`; retain what that engine actually emits. A selected target, thumbnail
or dismissed loading overlay alone is insufficient.

Check cold and cached bucket starts, audio gesture/control behavior, meaningful
input and a resulting scene/character/UI response. Observe canvas focus before
repeating an input. Check Save, Load and Continue when supported, verifying that
restored progress actually matches. Record disabled or unreliable saving and
unverified audible output honestly; do not force native save restrictions away.
Preserve original menus/choices. Intro skip must use the supported native action
or a pristine pre-gameplay checkpoint captured at the first safe decision, never
a progressed save or a fabricated state. Maintain intro/Continue capability
invariants and protect the established Beneath a Steel Sky baseline.

Run `pnpm prepare`, relevant regression tests, lint and a separate Production
application build sequentially. Restore temporary preview-route adapters before
final gates. Use [$scummweb_build-release](../scummweb_build-release/SKILL.md) to
preserve the complete verified runtime/source receipt and stage only the scoped
candidate. Do not stage concurrent Cloud, native, artwork or UI work implicitly.
Before committing, check the expected HEAD and the exact staged path/blob set
against the reviewed candidate. A failed staging guard must stop execution before
`git commit`; preserve another task’s index entries. Use failure-stopping command
chains or checked subprocesses so a rejected guard cannot fall through.

For authorized publication, commit/push through `$private-skills_push`, monitor
successful exact-commit CI and the existing Production delivery workflow, verify
the intended Vercel project/team, READY deployment, SHA and custom-domain alias,
then repeat visible Play/native rendering/input on the public site in Brave.
Never bypass the delivery workflow with a direct deploy. Close task tabs and
reset temporary viewport changes. Retain snapshots through completed live QA;
then remove verified task-owned disposables, preserving source/evidence and
in-use servers. Reconcile affected inbox items without executing unrelated work.

A public game is complete only when its exact eligible package, hero and box art
are bucket-served; its description/tags/version labels and import mapping are
correct; local/bucket checks pass; and its scoped release is deployed and
browser-verified live. Report partial, withheld and live states distinctly, with
material limitations and verification links. At queue completion, recheck all
new public packages/artwork/pages and retained release/gameplay evidence.
