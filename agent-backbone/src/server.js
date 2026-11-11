#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { BackboneServer } from './transport.js';
import { z } from 'zod';
import metadata from '../package.json' with { type: 'json' };
import { GameRuntime } from './runtime.js';
import { actionSchema } from './actions.js';
import { imageBlock, imageContent } from './history.js';
import { shortIdPattern } from './ids.js';
import path from 'node:path';
import { RunEvaluation, evaluationReporter } from './evaluation.js';
import { telemetryQuery } from './telemetry.js';
import { findGameZips } from './library.js';

if (process.env.SCUMMBENCH_MANAGED !== '1') {
  throw new Error('This is the internal ScummWEB backbone. Start scummbench mcp instead.');
}

const { values } = parseArgs({ options: {
  'no-viewer': { type: 'boolean', default: false },
  'base-url': { type: 'string' }, 'data-dir': { type: 'string' }, instance: { type: 'string' },
  'import-games': { type: 'string' }, 'import-only': { type: 'boolean' },
  width: { type: 'string' }, height: { type: 'string' }, fps: { type: 'string' },
  'buffer-seconds': { type: 'string' },
  'run-id': { type: 'string' }, 'legacy-sky-slot': { type: 'string' },
  'stop-condition': { type: 'string' }, 'evaluation-log': { type: 'string' },
  'result-file': { type: 'string' }, 'telemetry-ms': { type: 'string' }, telemetry: { type: 'boolean' },
} });
const evaluationEnabled = ['stop-condition', 'evaluation-log', 'result-file', 'telemetry-ms'].some(key => values[key] !== undefined);
if (values['import-only'] && (values['import-games'] === undefined || evaluationEnabled)) {
  throw new Error('--import-only requires --import-games DIR and cannot be used with evaluation options');
}
if (values['import-games'] === '') throw new Error('--import-games requires a directory');
const startupZips = values['import-games'] === undefined ? undefined : await findGameZips(values['import-games']);
const evaluation = evaluationEnabled ? new RunEvaluation({ condition: values['stop-condition'],
  intervalMs: values['telemetry-ms'] === undefined ? undefined : Number(values['telemetry-ms']) }) : undefined;
const runtime = new GameRuntime({ viewer: !values['no-viewer'], baseUrl: values['base-url'],
  dataDir: values['data-dir'], instance: values.instance, width: values.width ? Number(values.width) : undefined,
  height: values.height ? Number(values.height) : undefined, fps: values.fps ? Number(values.fps) : undefined,
  bufferSeconds: values['buffer-seconds'] ? Number(values['buffer-seconds']) : undefined, evaluation,
  telemetry: values.telemetry, runId: values['run-id'] === undefined ? undefined : z.uuid().parse(values['run-id']),
  legacySkySlot: values['legacy-sky-slot'] === undefined ? undefined : z.coerce.number().int().min(1).max(999).parse(values['legacy-sky-slot']) });
const evaluationLog = path.resolve(values['evaluation-log'] || path.join(runtime.dataDir, 'evaluation.jsonl'));
const resultFile = path.resolve(values['result-file'] || path.join(runtime.dataDir, 'result.json'));
const reporter = evaluation ? await evaluationReporter(evaluationLog, resultFile) : undefined;

const { name, version } = metadata;
const server = new BackboneServer({ name, version }, {
  instructions: 'Start a ScummWEB game with session(operation="start"), poll status(wait_ms=10000) until phase=ready, then observe and act. '
    + 'Ready screenshots use a fixed crop. Coordinates are screenshot-relative CSS pixels. Supply session_id and a unique request_id for each action sequence; '
    + 'reuse the same request_id only to retrieve the identical request result after an uncertain response. '
    + 'Input delivery is not proof of puzzle success. Use observe(source="history") for missed events. The spectator is read-only. '
    + 'Each server owns one game. Separate server processes run independently in parallel; status identifies this instance and its data directory.',
});

const text = value => ({ type: 'text', text: JSON.stringify(value) });
const sessionId = z.string().regex(shortIdPattern);
const requestId = z.string().min(1).max(100);
const registeredTools = [];
function tool(name, description, inputSchema, callback, readOnly = false) {
  server.registerTool(name, { description, inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: !readOnly } },
  async (args, extra) => {
    try { return await callback(args, extra.signal); }
    catch (error) { return { isError: true, content: [text({ error: error.message, ...error.toolDetails, status: runtime.status() })] }; }
  });
  registeredTools.push(name);
}

tool('list_games', 'List known ScummWEB games. Entries with launchable=false need a fixed game crop before launch.', {},
  async () => ({ content: [text({ baseUrl: runtime.baseUrl.origin, games: await runtime.listGames() })] }), true);

tool('library', 'Import local game ZIPs through ScummWEB’s normal file importer in this instance. Starts an asynchronous job; poll operation=status for the site’s results. Close any active game first. ZIPs remain at their original paths and must stay available for relaunch. Imported entries appear in list_games.', {
  operation: z.enum(['import', 'status']).default('status'),
  paths: z.array(z.string().min(1)).min(1).max(256).optional(),
}, async ({ operation, paths }) => {
  if (operation === 'status' && paths !== undefined) throw new Error('paths requires operation="import"');
  return { content: [text(await runtime.library({ operation, paths }))] };
});

tool('session', 'Manage the owned game session: start returns immediately; close ends the game and clears history while preserving saves. open_viewer opens the read-only spectator. close_viewer requires the active session_id after startup and closes only the spectator. Starting the active game reuses it unless restart=true. Poll status for readiness. Pass the same run_id with mode=continue to reopen its save scope in the same instance.', {
  operation: z.enum(['start', 'close', 'open_viewer', 'close_viewer']),
  session_id: sessionId.optional().describe('Required for close_viewer only; use the active game session ID.'),
  game: z.string().optional().describe('Start only; defaults to flight-of-the-amazon-queen.'),
  mode: z.enum(['skip_intro', 'beginning', 'continue']).optional().describe('Start only; defaults to skip_intro.'),
  restart: z.boolean().optional().describe('Start only; defaults to false.'),
  run_id: z.uuid().optional().describe('Start only; a new game gets a fresh run UUID by default.'),
}, async ({ operation, session_id, ...args }) => {
  if (operation !== 'start' && Object.values(args).some(value => value !== undefined)) {
    throw new Error('game, mode, restart and run_id are valid only for session(operation="start")');
  }
  if (operation === 'close_viewer') {
    if (session_id === undefined) throw new Error('close_viewer requires session_id');
    return { content: [text(await runtime.closeViewer(session_id))] };
  }
  if (session_id !== undefined) throw new Error('session_id is valid only for session(operation="close_viewer")');
  if (operation === 'start') return { content: [text(await runtime.start(args))] };
  if (operation === 'close') return { content: [text(await runtime.closeGame())] };
  return { content: [text({ viewerUrl: await runtime.openViewer() })] };
});

tool('status', 'Check game readiness and native controls. With session_id and request_id, look up one action receipt. Set include_images to recover its explicit captures. Optional wait_ms waits up to 25 seconds while loading.', {
  wait_ms: z.number().int().min(0).max(25000).default(0),
  session_id: sessionId.optional(), request_id: requestId.optional(), include_images: z.boolean().optional(),
}, async ({ wait_ms, session_id, request_id, include_images }) => {
  if (!session_id && !request_id && include_images === undefined) {
    return { content: [text(await runtime.waitReady(wait_ms))] };
  }
  if (!session_id || !request_id || wait_ms) throw new Error('Action lookup requires session_id and request_id without a wait');
  const { action, state, screenshots = [] } = runtime.requestResult(session_id, request_id);
  return { content: [text(action ? { session_id, action } : { session_id, request_id, state }),
    ...(include_images && action?.state !== 'running' ? screenshots.flatMap(imageContent) : [])] };
}, true);

if (values.telemetry) {
  tool('telemetry', 'Query native room and variable bank metadata for the current session. Choose a bank to read a bounded page of indexed values or sorted keys and values. Availability depends on the engine and game state.', telemetryQuery,
    async args => ({ content: [text(await runtime.telemetry(args))] }), true);
}

tool('observe', 'Read game images without input. fresh captures now. frames retrieves 1–8 exact frame IDs. history samples recent frames or filters by session_id and request_id. Loading and error captures are unbuffered.', {
  source: z.enum(['fresh', 'frames', 'history']).default('fresh'),
  frame_ids: z.array(z.string()).min(1).max(8).optional(),
  seconds: z.number().min(0.1).max(300).optional(),
  count: z.number().int().min(1).max(8).optional(),
  action_id: z.string().optional(), session_id: sessionId.optional(), request_id: requestId.optional(),
}, async ({ source, frame_ids, seconds, count, action_id, session_id, request_id }) => {
  if (source !== 'frames' && frame_ids !== undefined) throw new Error('frame_ids requires source="frames"');
  if (source !== 'history' && [seconds, count, action_id, session_id, request_id].some(value => value !== undefined)) {
    throw new Error('History filters require source="history"');
  }
  if (source === 'fresh') return { content: imageContent({ ...await runtime.observe(), source }) };
  if (source === 'frames') {
    if (!frame_ids) throw new Error('source="frames" requires frame_ids');
    const frames = frame_ids.map(id => {
      const frame = runtime.history.get(id);
      if (!frame) throw new Error(`Frame expired or does not exist: ${id}`);
      return frame;
    });
    return { content: frames.flatMap(frame => imageContent({ ...frame, source })) };
  }
  if (session_id || request_id) {
    if (!session_id || !request_id || action_id) throw new Error('Request history requires session_id and request_id together');
    const { action, state } = runtime.requestResult(session_id, request_id);
    if (!action) throw new Error(`Action receipt is ${state}`);
    action_id = action.actionId;
  }
  const frames = runtime.history.review({ seconds: seconds ?? 15, count: count ?? 4, actionId: action_id });
  return { content: [text({ source, selectedFrames: frames.length, history: runtime.history.status() }),
    ...frames.flatMap(frame => imageContent({ ...frame, source }))] };
}, true);

tool('act', 'Execute up to 32 ordered steps, including up to 8 explicit screenshots and 20 seconds of input holds/waits. Wait for one final receipt with the outcome of every step and images for successful screenshot steps only. Add a screenshot step at the end if you need to see the result. Mix clicks, keys, waits and screenshots with native pause, resume (play), wait_ticks (advance and hold), save(id) and load(id) in the same actions array. Use the native controls advertised by status.nativeControls.actions. Save and load use run-local integer slots. Unsupported native steps reject the batch before input. A failed step stops the batch. After an uncertain reply, check status and observe before issuing new input.', z.strictObject({
  session_id: sessionId, request_id: requestId,
  actions: z.array(actionSchema).min(1).max(32).describe('Coordinates are CSS pixels from the screenshot top-left.'),
}), async (args, signal) => {
  const { action, replayed, screenshots } = await runtime.act(args, signal);
  const replay = replayed ? { replayed: true } : {};
  if (action.code === 'ACTION_TIMEOUT') {
    return { isError: true, content: [text({ error: action.code, ...replay })] };
  }
  const isError = action.state === 'failed';
  const steps = action.steps.map(step => {
    if (step.state === 'captured') {
      const frame = screenshots.find(frame => frame.id === step.frameId);
      return { frame_id: frame.id, capture_ms: Math.round(frame.monotonicMs) };
    }
    if (step.state === 'delivered') return step.control ? { control: step.control } : {};
    return { state: step.state };
  });
  return { ...(isError && { isError }), content: [text({ steps,
    ...(isError && { error: action.code ?? action.error }),
    ...(action.state === 'stopped' && { state: 'stopped' }), ...replay }),
    ...screenshots.map(imageBlock)] };
});

Object.assign(runtime.sourceRevision, { mcp_version: version, mcp_tools: registeredTools.sort() });

let shuttingDown = false;
async function shutdown(exitCode = 0, terminal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (terminal) {
    // The goal signal aborts an active wait/key hold. Let its partial action ledger finish first.
    await runtime.queue.tail;
    let frame;
    try { frame = await runtime.capture('evaluation-stop'); } catch { /* Failure receipts can lack an image. */ }
    await reporter.finish({ ...terminal, session_id: runtime.sessionId, game: runtime.game,
      source_revision: runtime.sourceRevision, action_sequences: runtime.actionSequences }, frame);
    process.stderr.write(JSON.stringify({ event: terminal.event, success: terminal.success, result_file: resultFile }) + '\n');
    await new Promise(resolve => setImmediate(resolve));
  } else if (reporter) {
    process.exitCode = 1;
    await reporter.finish({ event: 'failure', success: false, reason: 'launcher_closed_before_condition',
      ...(evaluation.progress && { progress: evaluation.progress }) });
  }
  await runtime.close();
  await server.close();
  await reporter?.close();
  if (terminal) process.exit(exitCode);
}
evaluation?.on('telemetry', event => { void reporter.append(event).catch(error => evaluation.fail(error)); });
evaluation?.once('terminal', result => {
  void shutdown(result.success ? 0 : 1, result).catch(error => {
    process.stderr.write(`Evaluation shutdown failed: ${error.message}\n`);
    process.exit(1);
  });
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void shutdown().then(() => process.exit(evaluation ? 1 : 0)).catch(error => { console.error(error.message); process.exit(1); });
});
if (startupZips) await runtime.library({ operation: 'import', paths: startupZips });
if (values['import-only']) {
  try {
    await runtime.libraryTask;
    const result = await runtime.library();
    console.log(JSON.stringify({ instanceId: runtime.instanceId, dataDir: runtime.dataDir, ...result }));
    if (result.state === 'failed') process.exitCode = 1;
  } finally {
    await shutdown();
  }
} else {
  process.stdin.once('end', () => { void shutdown().catch(error => console.error(error.message)); });
  await server.connect();
}
