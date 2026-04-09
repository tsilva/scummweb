---
name: scummweb-play-game-goal
description: Use when working in the scummweb repo and the user asks you to achieve an in-game objective, progress a puzzle, test a gameplay path, or operate a hosted game through browser automation. This skill covers a minimal-action gameplay workflow, early walkthrough lookup, control discovery, save-state reuse, and game-specific references such as Beneath a Steel Sky inventory and verb handling.
---

# scummweb Play Game Goal

Use this skill when the request is effectively "play the game until X happens" inside `scummweb`.

## Start Here

1. Read `AGENTS.md`.
2. Use direct `js_repl` for browser interaction.
   In this repo, import `/Users/tsilva/repos/tsilva/scummweb/scripts/scummvm_play_harness.mjs` and use the harness as the gameplay source of truth instead of wiring the lower-level Playwright helper directly.
3. Prefer the repo's existing launch path and save seeding helpers over replaying long intros.
4. Before interacting, identify the exact game target, the exact success condition, and the shortest valid launch URL.
5. Before the first hotspot search, load `references/canvas-targeting.md`.
6. Load only the active game's local reference before browsing.
7. Show key checkpoint screenshots in chat by default with `codex.emitImage(...)`. Only switch to "every analyzed frame" when the user explicitly asks for full transparency.

Bootstrap example:

```javascript
var browser;
var context;
var frame;
var game;
var page;
var reviewPath;
var target = "sky";

const { buildFrameReviewPath, captureFrame, launchGame, saveFrameCapture } = await import(
  "/Users/tsilva/repos/tsilva/scummweb/scripts/scummvm_play_harness.mjs"
);

({ browser, context, game, page, target } = await launchGame({ target }));
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

Use `captureFrame(page)` for agent reasoning and hotspot work. Call `saveFrameCapture(page, { path: reviewPath, target })` only when you want to leave behind a reviewable PNG on disk for the user.

## Execution Loop

Run this loop until the goal is achieved or you need to escalate:

1. Identify the exact goal and shortest valid launch URL.
2. Validate the seeded start state before acting.
3. Emit the first playable state in chat.
4. Choose the next action from the local reference or a walkthrough.
5. Execute one minimal step.
6. Emit another screenshot only if the step is high-risk, ambiguous, or produced a meaningful state change.
7. Verify the outcome or escalate.

Minimize actions. Do not free-play once the goal is concrete.

## Screenshot Reporting

Default cadence for gameplay runs:

- initial seeded or first playable state
- before a high-risk or ambiguous interaction
- after a meaningful state change
- final proof-of-success frame

Use full-scene screenshots by default.

Escalate to cropped or zoomed images only when one of these directly affects the next action:

- hotspot targeting is ambiguous
- inventory state is unclear
- cursor-shape verification is needed
- subtitles or labels are too small to read at full frame

Do not flood the chat with probe screenshots unless the user explicitly asks for every analyzed frame.

Whenever you emit an image, pair it with a short commentary update that says what the screenshot is proving or what decision it informs next.

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
- If you crop or zoom part of the active game frame for inspection, add the active-frame offset back before reusing that point in `locator.click({ position })` or `locator.hover({ position })`. Do not reuse cropped-image coordinates as if they were full-canvas coordinates.
- Default to one of these two targeting methods:
  screenshot-pixel targeting from a fresh `#canvas` screenshot
  active-bounds logical mapping when a walkthrough or prior note gives game-space coordinates
- If you are already planning to emit a screenshot for the user, prefer reusing that same fresh full-scene capture for both chat visibility and targeting decisions.
- Use `frame.locator("#canvas")` or `page.locator("#canvas")` positions, not outer-page viewport coordinates.
- Validate hotspot labels before object interactions. Prefer a fresh screenshot and a deterministic point choice over a blind hover sweep.
- If the port does not surface hotspot labels reliably, use cursor-shape changes as the next control signal. In BASS-style scenes, a switch from the normal arrow to the interaction cross is strong evidence that the current point is a real hotspot.
- If the target hotspot is small or ambiguous, first lock one nearby larger hotspot whose label you expect, then reuse that confirmed region to narrow the search for the smaller target.
- If hotspot behavior is uncertain, first calibrate on one known-good hotspot in the same scene so you can verify how this port surfaces valid objects, labels, and cursor-shape changes before probing the ambiguous target.
- For item pickup or direct object use, use a label-first flow:
  move the cursor onto the target
  wait for the hotspot label
  confirm the label matches the expected object
  only then click
- If the expected label does not appear, do not click. Reposition and re-check first.
- If a click misses for unclear reasons, stop after the first miss and audit the canvas bounds or targeting method before retrying.
- Do not use coarse CSS-pixel sweeps across the full canvas when the game frame is letterboxed or pillarboxed.
- If the control mapping is still uncertain, test one reversible interaction before a longer chain.
- For BASS specifically, use that reversible interaction to verify single-step `right-click` path-and-act before introducing any staged walk-then-act workaround.
- If the game has multiple controllable actors or modes, verify which one is active before pathing.
- After each meaningful action, wait for the animation, subtitle, inventory update, or room transition to settle before deciding the next step.
- Keep the inventory tray closed while a room action is still resolving. Do not reopen it mid-walk, mid-pickup, or mid-use animation; in ScummVM scenes it can block the room and make a valid action look like it failed.
- After a pickup attempt that matters for progression, verify the inventory contents before assuming success. Prefer an explicit tray check over inferring pickup success from partial movement alone.
- If the inventory is not empty at the start of the run, do not treat "the tray opened" as pickup proof. Confirm success from an additional item icon, an item label, or another explicit item-state change.
- Prefer hotspot names, subtitles, inventory headers, and visible state changes over guessing from pixels alone.
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
- key checkpoint screenshots are surfaced in chat by default, with extra crops only when they materially help the next decision
- a short post-goal reflection is shared with the user, split into general and game-specific learnings
- the user is asked whether those learnings should be folded into the skill or relevant game reference
- no skill or reference update is implied or performed without explicit approval
