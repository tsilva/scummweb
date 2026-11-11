# Agent backbone

The dependency direction is **AgentSCUMM → ScummBench MCP → ScummWEB backbone**.
ScummWEB owns the mechanical driver under `agent-backbone/`: game launch,
isolated profiles, input validation, screenshots, bounded history, spectator,
native controls and evaluation receipts. ScummBench owns the public MCP endpoint,
task conditions, budgets, grading and result archives. Agents own puzzle solving.
The backbone never imports or launches AgentSCUMM.

## Setup

Install this checkout's dependencies with `pnpm install --frozen-lockfile` and
install ScummBench using its documented editable setup. The backbone uses the
existing locked `playwright-core` and `zod` packages; no MCP SDK is required.
It retains the existing managed browser runtime and native macOS spectator.
It bundles no game data. macOS spectators require Xcode Command Line Tools.
Install the managed game-rendering browser binary for the locked driver with
`pnpm exec playwright-core install chromium` if it is not already present.

ScummBench resolves a sibling ScummWEB checkout by default. Other layouts select
the absolute checkout with `SCUMMWEB_DIR` or:

```sh
scummbench mcp --scummweb /absolute/path/to/scummweb -- --no-viewer
```

AgentSCUMM's `src/index.js` invokes `scummbench mcp` and forwards only backbone
arguments after the separator. Configure `SCUMMWEB_DIR` on that launch environment
when the checkouts are not siblings. Direct launches of
`agent-backbone/src/server.js` are refused unless managed by ScummBench.
The managed flag is a process contract, not a security sandbox.

`status.sourceRevision` identifies the ScummWEB checkout captured at server
initialization; `mcp_version` identifies the backbone package protocol version.
`status.scummbench` supplies mediation provenance and the backbone checkout path.
These are separate from the agent checkout and the deployed ScummVM runtime.
Source pins alone do not verify deployed runtime or game-asset bytes.

## Profiles and migration

New default profiles and spectator builds live in ignored `.runs/agent-backbone/`.
An explicit `--data-dir` keeps its original location, including when resuming
an older run. Reuse the original profile and recorded run ID for Continue.
Existing game processes retain their loaded implementation and stay running;
the new dependency direction applies on the next connection. Do not restart
another player's session to migrate it.

Spectator labels and persisted protocol identifiers are retained for compatibility.
Native maps and story-progress semantics remain in ScummWEB. Evaluation conditions
and receipts remain private to the runner; player observations exclude them.

## Verification

```sh
pnpm check:backbone
pnpm test:backbone
```

These checks use synthetic data and idle protocol peers. They cover validation,
history bounds, concurrent calls, cancellation and managed-only launch. They do
not establish live game completion or deterministic replay. ScummBench's checks
separately exercise grading successes and negative cases with synthetic backends.

The mechanical implementation and native spectator were migrated from
AgentSCUMM's driver. Its legacy modules remain available to in-flight sessions;
new changes belong here. No model calls, game assets or personal run data belong
in the component's test fixtures.
