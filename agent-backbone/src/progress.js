// Progress is optional for older ScummWEB deployments and games without a map.
export async function loadProgressProvider(baseUrl, game) {
  const url = new URL('/game-progress/index.json', baseUrl);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(1500) });
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`ScummWEB progress index returned HTTP ${response.status}`);
  const index = await response.json();
  if (index?.schema_version !== 1 || !index.games || typeof index.games !== 'object') {
    throw new Error('Unsupported ScummWEB progress index');
  }
  if (!Object.hasOwn(index.games, game)) return;
  const { telemetry, revision } = index.games[game] ?? {};
  if (!['events', 'snapshot'].includes(telemetry) || typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) {
    throw new Error('Invalid ScummWEB progress map descriptor');
  }
  const module = new URL('/game-progress/v1.mjs', url);
  module.searchParams.set('v', revision);
  return { game, telemetry, revision, module: module.href };
}

// Runs in the owned game frame. It only receives the telemetry the local
// evaluator has accepted, including the cutoff for any matched stop condition.
export async function readStoryProgress({ provider, input }) {
  let active = globalThis.__agentscummStoryProgress;
  if (!active || active.revision !== provider.revision) {
    const { createTracker } = await import(provider.module);
    active = { revision: provider.revision, tracker: createTracker(provider.game, provider.revision) };
    globalThis.__agentscummStoryProgress = active;
  }
  if (input?.snapshot) active.tracker.acceptSnapshot(input.identity, input.snapshot);
  else if (input) active.tracker.accept(input.engineId, input.rooms, input.events, input.identity);
  return { report: active.tracker.report(), nextMilestone: active.tracker.nextMilestone };
}
