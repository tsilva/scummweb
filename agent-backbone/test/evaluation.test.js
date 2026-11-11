import test from 'node:test';
import assert from 'node:assert/strict';
import { RunEvaluation, parseCondition } from '../src/evaluation.js';
const fixtureMapRevision = 'a'.repeat(64);

const condition = { all: [{ variable: 'engine_id', equals: 'queen' },
  { variable: 'room_id', equals: 71 }, { variable: 'room_ready', equals: true }] };
const variableCondition = { all: [{ variable: 'engine_id', equals: 'queen' },
  { variable: 'game_state.93', from: 0, equals: 1 }] };
const state = (room_id, native_time_ms, room_ready = true) => ({ schema_version: 1,
  engine_id: 'queen', room_id, room_name: 'Synthetic room', room_ready, native_time_ms });

test('strict typed conditions, ordered transient arrivals, and latched success', async () => {
  for (const bad of [{ all: [] }, { all: [{ variable: 'unknown', equals: 1 }] },
    { all: [{ variable: 'room_id', equals: '71' }] }, { ...condition, code: 'true' }]) {
    assert.throws(() => parseCondition(bad));
  }
  const evaluation = new RunEvaluation({ condition });
  await evaluation.accept({ current: state(70, 1), events: [] });
  assert.equal(evaluation.result, undefined);
  await evaluation.accept({ current: state(71, 2, false), events: [] });
  assert.equal(evaluation.result, undefined, 'A pending arrival is not success');
  await evaluation.accept({ current: state(72, 4), events: [state(71, 3)] });
  assert.equal(evaluation.result.success, true, 'A short visit between polls is retained');
  assert.equal(evaluation.result.variables.room_id, 71);
  assert.equal(evaluation.signal.signal.aborted, true);
  evaluation.fail(new Error('later'));
  assert.equal(evaluation.result.success, true);
  const invalid = new RunEvaluation({ condition });
  await assert.rejects(invalid.accept({ current: state(72, 4), events: [state(71, 3), {}] }));
  assert.equal(invalid.result, undefined, 'Malformed telemetry cannot partially satisfy the goal');
});

const baseline = (value, native_time_ms) => ({ event: 'game_variables_baseline', native_time_ms,
  banks: { game_state: [...Array(93).fill(0), value] } });
const change = (previous, value, native_time_ms) => ({ event: 'game_variables_change', native_time_ms,
  bank: 'game_state', index: 93, previous, value });

const queenSlug = 'flight-of-the-amazon-queen';
function progressBaseline(native_time_ms, achieved = []) {
  const bank = Array(211).fill(0);
  for (const [index, value] of achieved) bank[index] = value;
  return { event: 'game_variables_baseline', native_time_ms, banks: { game_state: bank } };
}

test('the ScummWEB tracker receives only the telemetry at or before the matched stop', async () => {
  const evaluation = new RunEvaluation({ condition });
  evaluation.beginSession({ telemetry: 'events', revision: fixtureMapRevision });
  const room = state(71, 4);
  const baseline = progressBaseline(2, [[3, 1]]);
  await evaluation.accept({ current: state(110, 5, false), events: [room], gameVariableEvents: [baseline] }, input => {
    assert.deepEqual(input.rooms, [room]);
    assert.deepEqual(input.events, [baseline]);
    return { report: { state: 'tracked', percent: 50 }, nextMilestone: 'Left the room' };
  });
  assert.equal(evaluation.result.variables.room_id, 71);
  assert.equal(evaluation.result.progress.map_revision, fixtureMapRevision);
});

test('game variable transitions ignore restored values and retain the matching snapshot', async () => {
  const evaluation = new RunEvaluation({ condition: variableCondition });
  const records = [];
  evaluation.on('telemetry', event => records.push(event));
  const accept = (...gameVariableEvents) => evaluation.accept({ current: state(70, 10), events: [], gameVariableEvents });
  accept(baseline(0, 1), baseline(1, 2));
  assert.equal(evaluation.result, undefined);
  accept(change(1, 0, 3), change(0, 1, 4), change(1, 0, 5));
  assert.equal(evaluation.result.game_variables.game_state[93], 1);
  assert.deepEqual(evaluation.result.game_variable_match, change(0, 1, 4));
  assert.deepEqual(records.filter(event => event.event === 'game_variables_baseline')
    .map(event => event.banks.game_state[93]), [0, 1]);
  assert.deepEqual(records.filter(event => event.event === 'game_variables_change')
    .map(event => event.value), [0, 1, 0]);

  const equality = new RunEvaluation({ condition: { all: [{ variable: 'game_state.93', equals: 1 }] } });
  equality.accept({ current: state(70, 10), events: [], gameVariableEvents: [baseline(1, 2)] });
  assert.equal(equality.result.game_variable_match.event, 'game_variables_baseline');
});

test('game variable evaluation rejects unavailable slots and inconsistent batches before matching', async () => {
  const payload = { current: state(70, 10), events: [] };
  const evaluation = new RunEvaluation({ condition: variableCondition });
  await assert.rejects(evaluation.accept(payload), /does not provide game variable telemetry/);
  await assert.rejects(evaluation.accept({ ...payload, gameVariableEvents: [baseline(true, 1)] }),
    /Unavailable or incompatible game variable/);
  await assert.rejects(evaluation.accept({ ...payload, gameVariableEvents: [baseline(0, 1), change(0, 1, 2), change(0, 2, 3)] }),
    /Inconsistent game variable change/);
  assert.equal(evaluation.result, undefined);
  assert.throws(() => parseCondition({ all: [{ variable: 'game_state.4096', equals: 1 }] }), /Invalid game variable index/);
  assert.throws(() => parseCondition({ all: [{ variable: 'game_state.93', from: false, equals: 1 }] }),
    /Transition values must have the same type/);
  const roomBank = new RunEvaluation({ condition: { all: [{ variable: 'room_vars.0', equals: 1 }] } });
  assert.equal(roomBank.requiresRoomTelemetry, false);
});
