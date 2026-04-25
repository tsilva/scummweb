---
name: scummweb-play-game-goal
description: Use when working in the scummweb repo and the user asks you to achieve an in-game objective, progress a puzzle, test a gameplay path, or operate a hosted game through browser automation. This skill covers a minimal-action gameplay workflow, early walkthrough lookup, control discovery, save-state reuse, and game-specific references such as Beneath a Steel Sky inventory and verb handling.
---

# scummweb Play Game Goal

Use this skill when the request is effectively "play the game until X happens" inside `scummweb`.

## Start Here

1. Read `AGENTS.md`.
2. Use the official OpenAI Browser Use plugin for browser interaction when it is available.
   Read the `browser-use:browser` skill, initialize `browser-client.mjs` with the `iab` backend through `node_repl`, name the browser session, and drive the in-app browser tab with `tab.playwright` or `tab.cua`.
   Use direct `js_repl` plus `/Users/tsilva/repos/tsilva/scummweb/scripts/scummvm_play_harness.mjs` only as a fallback when Browser Use is unavailable or when a non-browser helper is needed for local file artifacts.
3. Prefer the repo's existing launch path and save seeding helpers over replaying long intros.
4. Before interacting, identify the exact game target, the exact success condition, and the shortest valid launch URL.
5. Before the first hotspot search, load `references/canvas-targeting.md`.
6. Load only the active game's local reference before browsing.
7. Show key checkpoint screenshots in chat by default with `codex.emitImage(...)`. Only switch to "every analyzed frame" when the user explicitly asks for full transparency.
8. For unmapped rooms, use OpenRouter image segmentation with `google/gemini-3.1-flash-image-preview` as the primary room-mapping perception layer and persist the mapping under `.runs/` before doing anything else. For already mapped rooms, use stored room memory first and only remap if the room state materially changed or more hotspots must be found.
9. Before any room mapping or progression action that depends on mapping, verify that the OpenRouter key required for segmentation is available. If the key is missing or inaccessible, stop immediately and ask the user for the key. Do not use fallback mapping, do not make gameplay clicks, and do not continue from screenshots alone.

Browser Use bootstrap example:

```javascript
if (!globalThis.agent) {
  const { setupAtlasRuntime } = await import(
    "/Users/tsilva/.codex/plugins/cache/openai-bundled/browser-use/0.1.0-alpha1/scripts/browser-client.mjs"
  );
  await setupAtlasRuntime({ globals: globalThis, backend: "iab" });
}
await agent.browser.nameSession("🎮 scummweb BASS");
if (typeof tab === "undefined") {
  globalThis.tab = await agent.browser.tabs.new();
}
await tab.goto("http://127.0.0.1:3000/scummvm.html?skipIntroTarget=sky#-x%200%20sky");
```

Harness fallback bootstrap example:

```javascript
var browser;
var context;
var frame;
var game;
var page;
var playableState;
var reviewPath;
var target = "sky";

const { buildFrameReviewPath, captureAndDescribeFrame, captureFrame, launchGame, saveFrameCapture } = await import(
  "/Users/tsilva/repos/tsilva/scummweb/scripts/scummvm_play_harness.mjs"
);

({ browser, context, game, page, playableState, target } = await launchGame({ target }));
reviewPath = buildFrameReviewPath({ target });
```

Default screenshot helper:

```javascript
async function emitCanvasCheckpoint(label) {
  frame = await saveFrameCapture(page, { path: reviewPath, target });
  console.log(label);
  await codex.emitImage({ bytes: frame.png, mimeType: "image/png", detail: "original" });
}
```

Use `captureAndDescribeFrame(page)` for the default vision loop and `captureFrame(page)` for lower-level frame state checks. Call `saveFrameCapture(page, { path: reviewPath, target })` only when you want to leave behind a reviewable PNG on disk for the user.

## Execution Loop

Run this loop until the goal is achieved or you need to escalate:

1. Identify the exact goal and shortest valid launch URL.
2. Validate the seeded start state before acting.
3. Emit the first playable state in chat.
4. Check whether the current room is already mapped in persistent room memory before any progression click.
5. If the room is not mapped, map the room first using the segmentation procedure in Persistent Room Memory: capture the room, assign a stable room id, verify likely hotspots with hover labels, persist exits and important objects, then proceed.
6. Run a calibration step on a safe anchor before the first meaningful click.
7. Choose the next action from the local reference, mapped room memory, or a walkthrough.
8. Execute one minimal step. If the step changes rooms, capture the destination room id and tag the source hotspot or object with the room it leads to.
9. Emit another screenshot only if the step is high-risk, ambiguous, or produced a meaningful state change.
10. Verify the outcome or escalate.

Minimize actions. Do not free-play once the goal is concrete.

## Screenshot Reporting

Default cadence for gameplay runs:

- initial seeded or first playable state
- before a high-risk or ambiguous interaction
- after a meaningful state change
- final proof-of-success frame

Use full-scene screenshots by default. For room mapping, hotspot targeting, and segmentation, never crop the image; use the full active-frame image or a full-frame occluded derivative. If a visual detail is too small, capture or display a higher-resolution full-scene screenshot rather than cropping.

Do not flood the chat with probe screenshots unless the user explicitly asks for every analyzed frame.

Whenever you emit an image, pair it with a short commentary update that says what the screenshot is proving or what decision it informs next.

## Calibration Loop

Before the first real gameplay click in a room:

1. Capture a full `#canvas` screenshot.
2. Pick one safe, distinctive anchor region from that screenshot.
3. Hover a point inside that box.
4. Capture a second screenshot.
5. Confirm that the cursor landed where intended or that the hovered state matches the anchor.

Use this calibration only to validate screenshot-to-canvas targeting.
Do not spend actions probing the whole room.

## Persistent Room Memory

When the user asks for a long run, full-game progress, or explicit room exploration, build and reuse persistent room memory instead of rediscovering the same hotspots:

- Store all play-run mapping assets under `.runs/`.
- Store each mapped room in `.runs/<target>/rooms/<room-name>-<short-hash>/`, where `<room-name>` is a stable semantic slug when known and `<short-hash>` is the first 8-12 characters of the active-frame hash. Use a temporary semantic slug such as `unknown-room` only until a better name is known.
- Use one canonical directory per physical room. Do not create new room directories for open/closed object states, failed candidates, occluded rescans, or additional segmentation passes in the same physical room. Store those as `state_snapshots`, extra `segmentation_passes`, `checked_non_hotspots`, and appended interactibles inside the existing room's `room.json`.
- Each room directory must contain `room.json` plus the images used to map it. Prefer subdirectories such as `source/`, `model-inputs/`, `masks/`, and `occluded/` to keep artifacts readable. Never crop room images for mapping; always use the full active-frame image or a full-frame occluded derivative.
- `room.json` must include the room name, canonical full hash, canonical short hash, state snapshots for materially different same-room states, source screenshots, segmentation passes, all identified interactible areas with bounding boxes and click coordinates, checked non-hotspots, and exit links. For every interactible, persist at least `{ label, type, bbox: { x, y, width, height }, click: { x, y }, mask_color, source_mask, source_image }` when those fields are known.
- Before acting in any room, check `.runs/<target>/rooms/` for a matching full hash, short hash, or semantic match. Every unmapped room must be mapped and persisted before any progression action unless a walkthrough step requires an immediate timed response.
- If an unmapped room requires segmentation and the OpenRouter key is not available, stop immediately and ask the user for the key. Do not substitute screenshot-only mapping, manual probing, stored walkthrough coordinates, or any other fallback for the required segmentation pass.
- When returning to a room, compare the current active-frame hash to stored canonical and `state_snapshots` hashes before assuming it is new or already explored. If the semantic room matches but the hash differs because an object opened, an NPC moved, the cursor/label is visible, or candidates were occluded, append a new state snapshot to the existing room instead of creating a new directory.
- If further mapping is needed for an existing room, start from the latest full-scene occluded image for that room when it exists. If no prior occluded image exists, use the latest saved full-scene model input or full source screenshot.
- New interactibles found during additional mapping must be appended to that room's `room.json`; preserve existing verified interactibles and checked non-hotspot records unless a fresh hover verification proves they changed.
- Room mapping procedure:
  1. Capture a full active-frame screenshot. Reject screenshots that crop the game frame; aspect-ratio-preserving scaled captures are acceptable.
  2. Compute the active-frame hash, create or resolve the room directory, and save the source screenshot before sending anything to the model.
  3. Send only the full active-frame screenshot, or a full-frame occluded derivative, to OpenRouter model `google/gemini-3.1-flash-image-preview`. Use this prompt exactly:
     "Create segmentation masks for all objects the main character in Beneath a Steel Sky can likely interact with, including doors, entrances, and exits. Use a unique color for each mask on a black background, maximizing the number of distinct interactable segments. Split related elements into separate masks (e.g., a door and its doorway). Mark the main character in #FFFFFF, and do not use this color for any other segment. Never create segmentation masks for regions that are fully black."
  4. Save every full-scene image sent to the model and every returned segmentation mask image. Every time an image is sent to the image model, show that exact image to the user. Every time the image model returns an image, show that exact returned image to the user. Record those file paths in `room.json` so the mapping can be audited later.
  5. Extract bounding boxes and center coordinates for each mask in full-frame coordinates, then generate verification points from the mask center: the center itself plus four surrounding points 20 px up, down, left, and right. If the mask is very small or a point would leave the full-frame bounds, reduce the radius only as much as needed to keep the point valid; do not switch to bounding-box corners or side middles by default.
  6. Verify each mask sequentially, one point at a time: move the cursor to the next verification point, capture a full-scene screenshot, inspect it for a label, then decide whether to continue. As soon as a label appears for that mask, record that coordinate pair under the label along with the bounding box, mask color, mask path, and source image, then stop checking additional points for that same mask region. Do not batch-capture all verification points before inspecting them. If no label appears at any verification point for the mask, persist the candidate as a checked non-hotspot and run another room scan using the latest full-scene occluded screenshot.
  7. Before creating a second or later segmentation input, move the main character a small amount in any safe direction so he is not standing in the same location. Capture a new full-scene screenshot after the movement settles; this exposes the area previously occupied by the character.
  8. Replace `#FFFFFF` with `#000000` in the prior mask, then use the actual per-pixel mask shapes to black out explored regions in the newly captured full-scene image. Do not use component bounding boxes, rectangular crops, padded rectangles, or any other rectangular approximation for this occlusion step; the removed region should follow the non-rectangular mask pixels exactly.
  9. Re-run segmentation on the updated full-scene image using the exact same prompt.
  10. Repeat until no new interactable regions remain. The result must be a complete set of clickable regions and coordinates for the room.
- For exits, store both the label/coordinate and the room id reached after using it.
- When any interaction causes a room transition, capture the destination room, compute its room id, then update the source object with `type: "exit"` or `type: "room_transition"`, `connects_to`, and a semantic destination name when known. This applies to doors, exits, vehicles, holes, elevators, ladders, and any non-obvious object that changes rooms.
- For timing-sensitive hotspots, store the precondition, standby position, cursor position, success signal, and any automated visual trigger used.
- Segmentation trace visibility is mandatory: every image sent to the image model and every image returned by the image model must be shown to the user in the chat trace for every pass.

## Start-State Contract

Before the first gameplay click, confirm and note:

- target game
- launch URL
- whether `skipIntroTarget` is in use
- `globalThis.__scummwebSkipIntroSeedStatus`, if seeded start is expected
- current room or screen
- active actor or mode
- whether inventory is open
- which inventory items are already present at start, if any
- selected item, if any
- the exact proof that will count as success for the user's goal

If the repo provides a skip-intro route that lands at the canonical first playable state, prefer it unless the user explicitly wants the intro replayed.

Do not hack progress. Allowed shortcuts are limited to canonical skip-intro seeds and nearby recovery states that preserve the intended story progression. Do not load an endgame or late-game save, inject arbitrary save data, or use any other shortcut that jumps directly to the requested outcome without legitimately playing to it.

If the game boots into intros, splash screens, or nonessential cutscenes, skip them immediately unless the goal depends on them.

If seeded start is expected and `__scummwebSkipIntroSeedStatus` is missing, failed, or does not match the target, stop treating the run as seeded. Re-launch or reload the nearest known-good seeded state before continuing.

## Reference And Walkthrough Rule

Load the active game's local reference first.

For `Beneath a Steel Sky` (`sky`):

- Load `references/bass.md` first and treat it as the primary progression source.
- Match the live run to the nearest checkpoint by room, NPC presence, key inventory, and immediate objective before taking further actions.
- Use that checkpoint's `Critical actions` until the run diverges.
- Default to BASS's direct path-and-act control model unless the live run proves otherwise:
  hover the world target and `right-click` once so Foster walks over and performs the action
  select an inventory item, hover the destination target, and `right-click` once so Foster walks over and applies it
- For BASS inventory selection, target the item sprite inside the tray, not the whole slot. If you can estimate or measure the item bounding box, click the center of that box rather than the slot center.
- After selecting a BASS inventory item, verify that it attached to the cursor before using it on a room hotspot. Prefer an explicit full-scene before/after visual confirmation over trusting the click alone.
- Browse only if the live state still does not fit the checkpoint after one deliberate re-check.

Decision rule:

- If the local reference has an exact verified sequence for the concrete puzzle and current room state, use it first and do not browse.
- If the local reference is close but the live room state, inventory state, or actor state differs, re-check the live state once.
- If the mismatch remains after one re-check, consult a walkthrough immediately.
- If there is no exact local sequence, browse as soon as the goal is concrete enough to search.

Walkthrough priority:

1. Official or manual sources that explain the mechanic directly.
2. Clean walkthrough or forum pages that describe the exact puzzle.
3. Videos only if text sources are insufficient.

Use the walkthrough to choose the shortest path, then still verify the port-specific input sequence locally.

## Interaction Rules

- Treat the puzzle solution and the port-control sequence as separate problems.
- Treat hotspot discovery, inventory arming, and actor positioning as control questions, not puzzle questions.
- In BASS, do not decompose a normal pickup or object-use step into separate walk and act clicks unless the live run proves that one-step interaction is failing.
- Prefer a single `right-click` on the hovered target for world interactions so the actor paths and acts in one step.
- For inventory use in BASS, select the item, hover the destination target, then `right-click` once. Do not manually pre-walk unless a verified exception requires it.
- Treat the ScummVM canvas as a coordinate-space problem first. Do not mix viewport guesses, logical game coordinates, and screenshot pixels in the same step.
- Do not crop or zoom part of the active game frame for targeting. Use fresh full-scene screenshots and keep coordinates in the canvas/full-frame coordinate space.
- Default to one of these two targeting methods:
  screenshot-pixel targeting from a fresh `#canvas` screenshot
  active-bounds logical mapping when a walkthrough or prior note gives game-space coordinates
- If you are already planning to emit a screenshot for the user, prefer reusing that same fresh full-scene capture for both chat visibility and targeting decisions.
- Use `frame.locator("#canvas")` or `page.locator("#canvas")` positions, not outer-page viewport coordinates.
- For item pickup or direct object use, use a screenshot-first flow:
  capture the current frame
  pick one candidate box for the target
  hover one point inside that box
  capture a fresh frame
  confirm the expected in-game label appears at the cursor using native image inspection
  only then click
- If the expected label does not appear, the coordinate is wrong. Do not click. Run another room scan using the latest occluded screenshot with already-tested masks/candidates blacked out, then update the room map before trying a new coordinate.
- If the hover does not look correct, do not click. Refine locally inside the current candidate box only when the expected label is nearby and the active room map already supports that target; otherwise rescan from the latest occluded screenshot first.
- If a click misses for unclear reasons, stop after the first miss and audit the canvas bounds or targeting method before retrying.
- Do not use coarse CSS-pixel sweeps across the full canvas when the game frame is letterboxed or pillarboxed.
- If the control mapping is still uncertain, test one reversible interaction before a longer chain.
- For BASS specifically, use that reversible interaction to verify single-step `right-click` path-and-act before introducing any staged walk-then-act workaround.
- If the game has multiple controllable actors or modes, verify which one is active before pathing.
- After each meaningful action, wait for the animation, subtitle, inventory update, or room transition to settle before deciding the next step.
- Keep the inventory tray closed while a room action is still resolving. Do not reopen it mid-walk, mid-pickup, or mid-use animation; in ScummVM scenes it can block the room and make a valid action look like it failed.
- After a pickup attempt that matters for progression, verify the inventory contents before assuming success. Prefer an explicit tray check over inferring pickup success from partial movement alone.
- If the inventory is not empty at the start of the run, do not treat "the tray opened" as pickup proof. Confirm success from an additional item icon, an item label, or another explicit item-state change.
- Prefer visible state changes, cursor placement, subtitles, and inventory headers over blind clicking.
- When the user provides a correction about controls or puzzle logic, trust it and adapt immediately.

## Failure Budget And Escalation

- After 2 failed attempts on the same step, stop retrying and classify the failure as one of:
  wrong hotspot
  wrong verb or button
  wrong item state
  wrong actor position
  overlay or inventory blocking interaction
  wrong puzzle assumption
- After 1 lethal or state-corrupting misclick, reload the nearest seeded state instead of continuing from a bad state.
- If a nearby walk hotspot can cause failure, alarm, or death, treat hotspot mis-targeting as the first suspect before revisiting puzzle logic.
- If the local reference and live state diverge after one re-check, browse immediately instead of probing further.
- If the app shell or proxy errors block gameplay, fix the local app path first.
- If a UI overlay blocks interaction, dismiss it or relaunch from the closest seeded state.
- If a room transition fails repeatedly, retry from a nearby stable state rather than compounding clicks.
- If a room transition briefly fades to black or darkens the scene, treat that as an expected transition signal first and verify with one fresh post-fade snapshot before escalating.
- If inventory use is ambiguous, test item selection and item application as separate steps.
- If a BASS inventory click is not taking, stop varying room hotspots first. Re-check the tray interaction by measuring the item's painted bounds, click the item's bounding-box center, and confirm the attached-cursor state before retrying the room action.

## Goal Verification

Match the proof of completion to the user's goal:

- obtain item: inventory header or item presence confirms pickup
- enter room: room transition completes and the hotspot set changes
- If the transition includes a fade or brief blackout, confirm completion from the first stable post-fade frame rather than treating the dark frame itself as failure.
- trigger dialogue: subtitle or dialogue line appears
- use item on hotspot: visible state change or newly unlocked follow-up interaction appears
- reach story checkpoint: stable post-event state, unmistakable scene change, or saveable state is reached

## Post-Goal Reflection

After the goal is achieved, do a short introspection pass before handing control back to the user.

Produce two separate sets of learnings:

- General learnings that would improve similar runs across games.
- Game-specific learnings that apply to the active game, puzzle, or port behavior.

For each set, include:

- what you would do differently on a retry
- mistakes or dead ends you would avoid next time
- only concrete learnings that would reduce actions, retries, or unnecessary tool use

Then present both sets to the user and ask whether the skill should be updated from those learnings.

Update policy:

- If the learning is general to the workflow, propose updating this skill.
- If the learning is specific to the game or control quirks, propose updating the relevant game reference.
- Do not update either one automatically. Wait for explicit user approval.

## Reference Loading

Load game-specific notes only for the active game.

- `Beneath a Steel Sky`: load `references/bass.md` first, jump to the matching checkpoint, and use it as the default progression reference before browsing

## Expected Outcome

By the end of the task:

- the requested in-game objective is achieved
- the action count is close to minimal for the known solution
- the seeded start state is verified before acting when a seeded route is expected
- key checkpoint screenshots are surfaced in chat by default as full-scene images
- a short post-goal reflection is shared with the user, split into general and game-specific learnings
- the user is asked whether those learnings should be folded into the skill or relevant game reference
- no skill or reference update is implied or performed without explicit approval
