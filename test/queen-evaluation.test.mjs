import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const patch = readFileSync(new URL('../patches/scummvm/16-report-queen-evaluation-variables.patch', import.meta.url), 'utf8');
const additions = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
const blocks = [...additions.matchAll(/EM_ASM(?:_INT)?\(\{([\s\S]*?)\n\s*\}, ([^\n]+)/g)];
const codeFor = args => blocks.find(block => block[2].startsWith(args))[1];
const roomCode = codeFor('_logic->currentRoom()');

test('native Queen telemetry is opt-in, retains room transitions, and declares overflow', () => {
  let tick = 0;
  const context = vm.createContext({ performance: { now: () => ++tick }, UTF8ToString: value => value });
  const emit = (room, ready) => {
    Object.assign(context, { $0: room, $1: 'Synthetic room', $2: ready });
    vm.runInContext(`(function(){${roomCode}})()`, context);
  };
  emit(70, true);
  assert.equal(context.__scummwebEvaluationState, undefined);
  context.__scummwebEvaluationEnabled = true;
  emit(70, true); emit(70, true); emit(71, false); emit(71, true); emit(72, true);
  assert.deepEqual(JSON.parse(JSON.stringify(context.__scummwebEvaluationEvents)).map(s => [s.room_id, s.room_ready]),
    [[70, true], [71, false], [71, true], [72, true]]);
  assert.equal(context.__scummwebEvaluationState.room_id, 72);
  for (let i = 0; i < 260; ++i) emit(i, true);
  assert.equal(context.__scummwebEvaluationEvents.length, 256);
  assert.equal(context.__scummwebEvaluationOverflow, true);
  assert.match(additions, /_logic->newRoom\(\) == 0 && !_input->cutawayRunning\(\)/);
});

test('Queen game variables publish a signed baseline, ordered writes and a replacement on restore', () => {
  const baseline = codeFor('_gameState, GAME_STATE_COUNT');
  const change = codeFor('index, previous, newValue');
  let tick = 0;
  const heap = new Int16Array([0, 0, -10, 0]);
  const context = vm.createContext({ HEAP16: heap, performance: { now: () => ++tick } });
  const emit = (code, $0, $1, $2) => {
    Object.assign(context, { $0, $1, $2 });
    vm.runInContext(`(function(){${code}})()`, context);
  };
  emit(baseline, 4, 2, true);
  assert.equal(context.__scummwebEvaluationGameVariableEvents, undefined);
  context.__scummwebEvaluationEnabled = true;
  emit(baseline, 4, 2, false);
  emit(change, 1, 0, 1);
  assert.equal(context.__scummwebEvaluationGameVariableEvents, undefined, 'Wait for the first presentation');
  emit(baseline, 4, 2, true);
  emit(change, 1, 0, 1);
  emit(change, 1, 1, 0);
  heap[3] = -2;
  emit(baseline, 4, 2, false);
  const queue = context.__scummwebEvaluationGameVariableEvents;
  assert.deepEqual(JSON.parse(JSON.stringify(queue)), [
    { event: 'game_variables_baseline', native_time_ms: 1, banks: { game_state: [-10, 0] } },
    { event: 'game_variables_change', bank: 'game_state', index: 1, previous: 0, value: 1, native_time_ms: 2 },
    { event: 'game_variables_change', bank: 'game_state', index: 1, previous: 1, value: 0, native_time_ms: 3 },
    { event: 'game_variables_baseline', native_time_ms: 4, banks: { game_state: [-10, -2] } },
  ]);
  queue.splice(0);
  emit(change, 1, -2, 0);
  assert.equal(queue.length, 1, 'A drained queue still receives writes');
  for (let i = 0; i < 256; ++i) emit(change, 1, 0, 1);
  assert.equal(queue.length, 256);
  assert.equal(context.__scummwebEvaluationGameVariableOverflow, true);
});
