# Game internals and story progress

[`data/game-internals/`](../data/game-internals/) contains the supported
game maps. Each YAML file is the source for its edition, native identifiers,
and milestone count. The tracker reads [evaluator telemetry](maintaining-scummweb.md#evaluator-telemetry)
and reports verified milestones, total, rounded percentage, and the furthest
verified milestone in map order. Loading a save recomputes progress from the
restored state.

## Authoring maps

Define `schema_version: 1`, `game`, `engine_id`, and ordered `milestones`
with stable IDs and display labels. Edition-specific maps require the native
game ID and index MD5. Name engine state in the optional maps below.

| Mapping | Definition | Example predicate |
| --- | --- | --- |
| `rooms` | Native room ID | `{ room: ending-credits }` |
| `variables` | `{ bank, index }` or snapshot `{ bank, key }` | `{ variable: ending-outcome, one_of: [1, 3, 4] }` |
| `flags` | `{ bank, index, mask }` with one bit set | `{ flag: escaped-atlantis, equals: false }` |
| `objects` | Numeric object ID | `{ object: airlock-exit, equals: 1 }` |

Rules support numeric `room_id`, `room_ready`, direct bank predicates,
`all`, `any`, and references to earlier milestones. Snapshot rules can scan
contiguous ranges, for example
`{ bank: globals, start: 228, length: 35, mask: 0x0fff, includes: 795 }`.

- Omit `scoring` for independent checklist outcomes. A verified
  `completion_milestone` reports `won: true` and 100% even if the ending
  resets state or a route bypasses optional steps. The completed list and count
  still reflect verified milestones.
- Use `scoring: highest_stage` for linear checkpoints where the furthest
  verified stage proves the earlier stages. Use a checklist for mixed routes.
- Add `implies: [earlier-id]` only when every matching route proves the
  earlier outcome. Use saved flags or counters where available. Room and
  running-script evidence may be transient.

Trace predicates to native scripts and check initial values and later writes.
Cover distinct outcomes across each chapter. Combine equivalent outcomes
across alternate routes and use native totals when individual items are
unavailable. Keep research drafts outside the map directory. Test the matching
edition, alternate routes, restores, and the real ending before adding a win
rule. Run `node --test test/game-progress.test.mjs`.

## Browser tracker

`pnpm prepare` publishes the tracker and index. Run
`node scripts/generate-game-progress.mjs` to regenerate them separately.

1. Read `/game-progress/index.json`. Its schema v1 lists launch slugs with
   `telemetry`, `edition_specific`, and content-derived `revision`.
2. Import `/game-progress/v1.mjs?v=<revision>` from the same origin and call
   `createTracker(slug, revision)` once per session. A mismatched revision fails.
3. For snapshot maps, call `acceptSnapshot(identity, snapshot)`. For event
   maps, call `accept(engineId, rooms, variableEvents, identity)` with ordered
   events. Assign one consumer to drain each native queue.
4. Call `report()` for current progress and `nextMilestone` for the next
   label when provided. Show just the percentage to avoid spoilers.

AgentSCUMM uses the tracker in its spectator and run logs. Its stop conditions
use raw evaluator telemetry.

## Recently Played

Cards show the highest verified percentage observed for each copy and map
revision in the current browser. Continue opens the latest eligible save.
For the bundled English DOS CD edition of Flight of the Amazon Queen, a
decodable selected Continue save takes precedence. The decoder covers native
v0 and v1 saves for CEM10. Other existing saves contribute after you resume.
Imported editions need a matching fingerprint. Copies without verified
progress have no bar.

## Map coverage

Use the [map directory](../data/game-internals/) for the exact edition and
rules, or `/game-progress/index.json` for available launch slugs. Fate of
Atlantis uses one map for the Team, Wits, and Fists routes. The GrimE maps
cover imported full Windows releases. Elvira I and II use edition-specific
checklists and require the complete `gameamiga` fingerprint. Elvira II
requires a successful ritual for a win. Puzzles outside published engine
state may only be provable through later outcomes.

For edition matching, use the checksum reported in `identity.index_md5`.
SCI hashes the complete `resource.map` when present. For numbered SCI32
volumes, hash the ASCII manifest of matching `resmap.000` through
`resmap.099` files in volume order. Each line is the lowercase filename,
a colon, its complete lowercase MD5, and a line feed. The original English
Windows GrimE games hash the first 5,000 bytes of `vox0001.lab` or
`artall.m4b`, respectively.
