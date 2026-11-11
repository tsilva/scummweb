import { EventEmitter } from 'node:events';
import { mkdir, open, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { parseGameTelemetry } from './telemetry.js';

const fields = { engine_id: z.string().min(1).max(80), room_id: z.number().int().min(0),
  room_name: z.string().max(200), room_ready: z.boolean() };
const roomPredicate = z.object({ variable: z.enum(Object.keys(fields)),
  equals: z.union([z.string(), z.number().finite(), z.boolean()]) }).strict().superRefine((value, ctx) => {
  if (!fields[value.variable].safeParse(value.equals).success) ctx.addIssue({ code: 'custom', message: 'Condition value has the wrong type' });
});
const bankName = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const slot = z.number().int().min(0).max(4095);
const gameValue = z.union([z.number().int(), z.boolean()]);
const gamePredicate = z.object({ variable: z.string().regex(/^[a-z][a-z0-9_]{0,39}\.(0|[1-9][0-9]{0,3})$/),
  equals: gameValue, from: gameValue.optional() }).strict().superRefine(({ variable, equals, from }, ctx) => {
  if (!slot.safeParse(Number(variable.split('.')[1])).success) ctx.addIssue({ code: 'custom', message: 'Invalid game variable index' });
  if (from !== undefined && (typeof from !== typeof equals || from === equals)) {
    ctx.addIssue({ code: 'custom', message: 'Transition values must have the same type and differ' });
  }
});
export const conditionSchema = z.object({ all: z.array(z.union([roomPredicate, gamePredicate])).min(1).max(16) }).strict()
  .superRefine(({ all }, ctx) => {
    const indexed = all.filter(({ variable }) => variable.includes('.'));
    if (indexed.length && all.some(({ variable }) => variable !== 'engine_id' && !variable.includes('.'))) {
      ctx.addIssue({ code: 'custom', message: 'Room predicates cannot be combined with indexed game variables' });
    }
    if (indexed.filter(({ from }) => from !== undefined).length > 1) {
      ctx.addIssue({ code: 'custom', message: 'A condition can require one game variable transition' });
    }
  });
const nativeTime = z.number().finite().nonnegative();
const variablesSchema = z.object({ schema_version: z.literal(1), ...fields,
  native_time_ms: nativeTime }).strict();
const gameVariableRecords = z.array(z.discriminatedUnion('event', [
  z.object({ event: z.literal('game_variables_baseline'), native_time_ms: nativeTime,
    banks: z.record(bankName, z.array(gameValue).min(1).max(4096)) }).strict(),
  z.object({ event: z.literal('game_variables_change'), native_time_ms: nativeTime, bank: bankName,
    index: slot, previous: gameValue, value: gameValue }).strict(),
])).max(256);

export function parseCondition(json) {
  return conditionSchema.parse(typeof json === 'string' ? JSON.parse(json) : json);
}

// Installed for explicit evaluation or a mapped game. No player tool reads this state.
export function enableEvaluation() {
  globalThis.__scummwebEvaluationEnabled = true;
}

export function readEvaluation(usesSnapshots) {
  if (globalThis.__scummwebEvaluationOverflow) throw new Error('Evaluation transition queue overflow');
  if (globalThis.__scummwebEvaluationGameVariableOverflow) throw new Error('Game variable telemetry queue overflow');
  return { current: globalThis.__scummwebEvaluationState ?? null,
    identity: globalThis.__scummwebEvaluationGame ?? null,
    events: (globalThis.__scummwebEvaluationEvents ?? []).splice(0),
    gameVariableEngine: globalThis.__scummwebEvaluationGameVariableEngine ?? null,
    gameVariableEvents: globalThis.__scummwebEvaluationGameVariableEvents?.splice(0) ?? null,
    ...(usesSnapshots && { progressTelemetry: globalThis.scummwebTelemetry?.read() }) };
}

export class RunEvaluation extends EventEmitter {
  constructor({ condition, intervalMs = 250 } = {}) {
    super();
    this.condition = condition === undefined ? undefined : parseCondition(condition);
    this.gamePredicates = (this.condition?.all ?? []).filter(({ variable }) => variable.includes('.')).map(predicate => {
      const [bank, index] = predicate.variable.split('.');
      return { ...predicate, bank, index: Number(index) };
    });
    this.requiresRoomTelemetry = Boolean(this.condition?.all.some(({ variable }) =>
      Object.hasOwn(fields, variable) && variable !== 'engine_id'));
    if (!Number.isInteger(intervalMs) || intervalMs < 50 || intervalMs > 5000) throw new Error('Telemetry interval must be 50–5000 ms');
    this.intervalMs = intervalMs;
    this.signal = new AbortController();
    this.startedAt = performance.now();
    this.lastPublished = -Infinity;
    this.lastNativeTime = -Infinity;
    this.lastGameVariableTime = -Infinity;
  }

  beginSession(provider) {
    this.progressProvider = provider;
    this.progress = this.nextMilestone = undefined;
    this.current = undefined;
    this.gameVariables = undefined;
    this.gameVariableEngine = undefined;
    this.lastPublished = this.lastNativeTime = this.lastGameVariableTime = -Infinity;
  }

  acceptGameVariables(records, engineId) {
    if (records == null) {
      if (this.gamePredicates.length || this.gameVariables) throw new Error('This game runtime does not provide game variable telemetry');
      return;
    }
    if (!fields.engine_id.safeParse(engineId).success) throw new Error('Missing or invalid game variable engine identity');
    if (this.gameVariableEngine && engineId !== this.gameVariableEngine) throw new Error('Game variable engine changed');
    const events = gameVariableRecords.parse(records);
    if (!events.length && this.gameVariables) return;
    const engineMatches = this.condition?.all.every(({ variable, equals }) => variable !== 'engine_id' || equals === engineId);
    let banks = structuredClone(this.gameVariables);
    let nativeTime = this.lastGameVariableTime;
    let match;
    for (const event of events) {
      if (event.native_time_ms < nativeTime) throw new Error('Game variable native clock moved backwards');
      nativeTime = event.native_time_ms;
      if (event.event === 'game_variables_baseline') {
        // Keep the published baseline intact as subsequent writes update the working copy.
        banks = structuredClone(event.banks);
        if (!Object.keys(banks).length) throw new Error('Game variable baseline has no banks');
        if (engineMatches) for (const { bank, index, equals } of this.gamePredicates) {
          const value = Object.hasOwn(banks, bank) ? banks[bank][index] : undefined;
          if (typeof value !== typeof equals) throw new Error(`Unavailable or incompatible game variable: ${bank}.${index}`);
        }
      } else {
        const bank = banks && Object.hasOwn(banks, event.bank) ? banks[event.bank] : undefined;
        if (bank?.[event.index] !== event.previous || event.previous === event.value ||
          typeof event.previous !== typeof event.value) {
          throw new Error(`Inconsistent game variable change: ${event.bank}.${event.index}`);
        }
        bank[event.index] = event.value;
      }
      if (!match && engineMatches && this.gamePredicates.length &&
        this.gamePredicates.every(({ bank, index, equals, from }) => banks[bank]?.[index] === equals &&
          (from === undefined || (event.event === 'game_variables_change' &&
            event.bank === bank && event.index === index && event.previous === from)))) {
        match = { game_variables: structuredClone(banks), game_variable_match: event };
      }
    }
    if (!banks) throw new Error('Missing game variable baseline');
    this.gameVariables = banks;
    this.gameVariableEngine = engineId;
    this.lastGameVariableTime = nativeTime;
    return { events, match };
  }

  async accept(payload, updateProgress) {
    if (this.result) return;
    // Validate the whole read before accepting any of it. Partial malformed telemetry cannot win.
    const current = payload.current === null ? null : variablesSchema.parse(payload.current);
    const samples = z.array(variablesSchema).max(256).parse(payload.events);
    if (current) samples.push(current);
    let nativeTime = this.lastNativeTime;
    for (const variables of samples) {
      if (variables.native_time_ms < nativeTime) throw new Error('Evaluation native clock moved backwards');
      nativeTime = variables.native_time_ms;
    }
    const progressTelemetry = this.progressProvider?.telemetry === 'snapshot'
      ? parseGameTelemetry(payload.progressTelemetry) : undefined;
    const identity = payload.identity ?? progressTelemetry?.identity;
    const engineId = payload.gameVariableEngine ?? current?.engine_id ?? identity?.engine_id;
    if (current && engineId !== current.engine_id) throw new Error('Evaluation engine identities disagree');
    const game = this.acceptGameVariables(payload.gameVariableEvents, engineId);
    this.lastNativeTime = nativeTime;
    for (const event of game?.events ?? []) {
      this.emit('telemetry', { ...event, timestamp: new Date().toISOString(), engine_id: engineId });
    }
    const latest = current ?? (engineId && { engine_id: engineId });
    const candidates = samples.length || !latest ? samples : [latest];
    const variables = this.gamePredicates.length ? (game?.match && latest) :
      candidates.find(sample => this.condition?.all.every(({ variable, equals }) => sample[variable] === equals));
    this.current = variables ?? latest ?? samples.at(-1);
    let progressChanged = false;
    if (this.progressProvider) {
      let input;
      const matchedWrite = game?.match?.game_variable_match;
      const stopTime = matchedWrite?.native_time_ms ?? variables?.native_time_ms ?? Infinity;
      if (progressTelemetry) {
        const { identity: snapshotIdentity, snapshot } = progressTelemetry;
        if (snapshot && snapshot.sample_time_ms <= stopTime) {
          input = { identity: snapshotIdentity, snapshot };
        }
      } else {
        const events = game?.events ?? [];
        const matchedRoom = matchedWrite ? -1 : samples.indexOf(variables);
        const progressRooms = matchedRoom < 0 ? samples.filter(sample => sample.native_time_ms <= stopTime) :
          samples.slice(0, matchedRoom + 1);
        const progressEvents = matchedWrite ? events.slice(0, events.indexOf(matchedWrite) + 1) :
          events.filter(event => event.native_time_ms <= stopTime);
        input = { engineId, rooms: progressRooms, events: progressEvents, identity };
      }
      const update = await updateProgress(input);
      // The frame may have closed while its tracker was running.
      if (update === null || this.result) return;
      if (update) {
        const progress = { ...update.report, map_revision: this.progressProvider.revision };
        progressChanged = JSON.stringify(progress) !== JSON.stringify(this.progress);
        if (progressChanged) this.progress = progress;
        this.nextMilestone = update.nextMilestone;
      } else {
        this.progressProvider = this.progress = this.nextMilestone = undefined;
      }
    }
    const progressReport = this.progress && { progress: this.progress };
    if (variables) {
      this.result = { event: 'success', success: true, reason: 'stop_condition',
        detected_at: new Date().toISOString(), elapsed_ms: performance.now() - this.startedAt,
        condition: this.condition, variables, ...game?.match, ...progressReport };
      this.signal.abort(new Error('Stop condition reached'));
      this.emit('terminal', this.result);
      return;
    }
    if (latest && (progressChanged || performance.now() - this.lastPublished >= this.intervalMs)) {
      this.lastPublished = performance.now();
      this.emit('telemetry', { event: 'variables', timestamp: new Date().toISOString(), variables: latest,
        ...(identity && { game_identity: identity }),
        ...(this.gameVariables && { game_variables: this.gameVariables }), ...progressReport });
    }
  }

  fail(error) {
    if (this.result) return;
    this.result = { event: 'failure', success: false, reason: 'evaluation_error', error: error.message,
      ...(this.progress && { progress: this.progress }) };
    this.signal.abort(error);
    this.emit('terminal', this.result);
  }
}

// Exclusive creation prevents accidentally appending a new trial to an old result.
export async function evaluationReporter(logPath, resultPath) {
  if (path.resolve(logPath) === path.resolve(resultPath)) throw new Error('Evaluation log and result paths must differ');
  await mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });
  await mkdir(path.dirname(resultPath), { recursive: true, mode: 0o700 });
  const result = await open(resultPath, 'wx', 0o600);
  let log;
  try { log = await open(logPath, 'wx', 0o600); }
  catch (error) { await result.close(); throw error; }
  let tail = Promise.resolve();
  const append = event => (tail = tail.then(() => log.writeFile(JSON.stringify(event) + '\n')));
  return { append,
    async finish(event, frame) {
      await append(event);
      const receipt = { ...event };
      if (frame) {
        const imagePath = `${resultPath}.jpg`;
        await writeFile(imagePath, frame.data, { flag: 'wx', mode: 0o600 });
        receipt.screenshot = imagePath;
      }
      await result.writeFile(JSON.stringify(receipt, null, 2) + '\n');
      await result.sync();
    },
    async close() { await tail; await log.close(); await result.close(); },
  };
}
