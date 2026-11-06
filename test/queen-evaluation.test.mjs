import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const patch = readFileSync(new URL('../patches/scummvm/16-report-queen-evaluation-variables.patch', import.meta.url), 'utf8');
const additions = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++')).map(line => line.slice(1)).join('\n');
const code = additions.match(/EM_ASM\(\{([\s\S]*?)\n\s*\}, _logic/)[1];

test('native Queen telemetry is opt-in, retains room transitions, and declares overflow', () => {
  let tick = 0;
  const context = vm.createContext({ performance: { now: () => ++tick }, UTF8ToString: value => value });
  const emit = (room, ready) => {
    Object.assign(context, { $0: room, $1: 'Synthetic room', $2: ready });
    vm.runInContext(`(function(){${code}})()`, context);
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
