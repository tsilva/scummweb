---
name: scummweb-play-game-goal
description: Use when working in the scummweb repo and the user asks you to achieve an in-game objective, progress a puzzle, test a gameplay path, or operate a hosted game through browser automation. This skill covers a minimal-action gameplay workflow, early walkthrough lookup, control discovery, save-state reuse, and game-specific references such as Beneath a Steel Sky inventory and verb handling.
---

# scummweb Play Game Goal

Use this skill when the request is effectively "play the game until X happens" inside `scummweb`.

## Start Here

1. Read `AGENTS.md`.
2. Use the `playwright-interactive` skill for browser interaction.
   In this repo, prefer `playwright-core` with a local Chrome/Chromium executable instead of assuming the `playwright` package is installed.
3. Prefer the repo's existing launch path and save seeding helpers over replaying long intros.
4. Before interacting, identify the exact game target, the exact success condition, and the shortest valid launch URL.
5. Load only the active game's local reference before browsing.

## Execution Loop

Run this loop until the goal is achieved or you need to escalate:

1. Identify the exact goal and shortest valid launch URL.
2. Validate the seeded start state before acting.
3. Capture one minimal state snapshot.
4. Choose the next action from the local reference or a walkthrough.
5. Execute one minimal step.
6. Verify the outcome or escalate.

Minimize actions. Do not free-play once the goal is concrete.

## Start-State Contract

Before the first gameplay click, confirm and note:

- target game
- launch URL
- whether `skipIntroTarget` is in use
- `globalThis.__scummwebSkipIntroSeedStatus`, if seeded start is expected
- current room or screen
- active actor or mode
- whether inventory is open
- selected item, if any
- the exact proof that will count as success for the user's goal

If the repo provides a skip-intro route that lands at the canonical first playable state, prefer it unless the user explicitly wants the intro replayed.

Do not hack progress. Allowed shortcuts are limited to canonical skip-intro seeds and nearby recovery states that preserve the intended story progression. Do not load an endgame or late-game save, inject arbitrary save data, or use any other shortcut that jumps directly to the requested outcome without legitimately playing to it.

If the game boots into intros, splash screens, or nonessential cutscenes, skip them immediately unless the goal depends on them.

If seeded start is expected and `__scummwebSkipIntroSeedStatus` is missing, failed, or does not match the target, stop treating the run as seeded. Re-launch or reload the nearest known-good seeded state before continuing.

## Reference And Walkthrough Rule

Load the active game's local reference first.

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
- Validate hotspot labels before object interactions. Prefer a brief hover sweep over guessing from raw pixels.
- For item pickup or direct object use, use a label-first flow:
  move the cursor onto the target
  wait for the hotspot label
  confirm the label matches the expected object
  only then click
- If the expected label does not appear, do not click. Reposition and re-check first.
- If the control mapping is still uncertain, test one reversible interaction before a longer chain.
- If the game has multiple controllable actors or modes, verify which one is active before pathing.
- After each meaningful action, wait for the animation, subtitle, inventory update, or room transition to settle before deciding the next step.
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
- If inventory use is ambiguous, test item selection and item application as separate steps.

## Goal Verification

Match the proof of completion to the user's goal:

- obtain item: inventory header or item presence confirms pickup
- enter room: room transition completes and the hotspot set changes
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

- `Beneath a Steel Sky`: see `references/bass.md`

## Expected Outcome

By the end of the task:

- the requested in-game objective is achieved
- the action count is close to minimal for the known solution
- the seeded start state is verified before acting when a seeded route is expected
- a short post-goal reflection is shared with the user, split into general and game-specific learnings
- the user is asked whether those learnings should be folded into the skill or relevant game reference
- no skill or reference update is implied or performed without explicit approval
