import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { withGameTelemetry } from '../app/game-player/telemetry.mjs';

function loadBridge(name, args) {
  const patch = readFileSync(new URL(`../patches/scummvm/${name}`, import.meta.url), 'utf8');
  const added = patch.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
    .map(line => line.slice(1)).join('\n');
  const block = [...added.matchAll(/EM_ASM\(\{([\s\S]*?)\}, ([^\n]+)/g)]
    .find(match => match[2].startsWith(args));
  return new vm.Script(`(function(){${block[1]}})()`);
}

const launch = loadBridge('13-expose-native-save-list.patch', 'game.engineId.c_str()');
const sample = loadBridge('18-report-scumm-evaluation-variables.patch', '_roomResource');
const copy = value => JSON.parse(JSON.stringify(value));

test('engine launch reports identity and the SCUMM provider replaces its baseline on restore', () => {
  const heap = new ArrayBuffer(128);
  const words = new Int32Array(heap);
  const bytes = new Uint8Array(heap);
  bytes.fill(0xab, 48, 64);
  let tick = 0;
  const context = vm.createContext({
    HEAP32: words, HEAPU8: bytes, structuredClone,
    performance: { now: () => ++tick }, UTF8ToString: value => value,
  });
  const emit = (script, ...values) => {
    values.forEach((value, index) => { context['$' + index] = value; });
    script.runInContext(context);
  };
  emit(launch, 'sky', 'sky');
  assert.equal(context.__scummwebEvaluationGame, undefined);
  context.__scummwebTelemetryQueryEnabled = true;
  emit(launch, 'sky', 'sky');
  assert.deepEqual(copy(context.__scummwebEvaluationGame), { engine_id: 'sky', game_id: 'sky' });
  emit(launch, 'scumm', 'loom');

  const frame = (room, reset = false) => emit(sample, room, true, 4, 2, 16, 2, 20, 1, 24, 1, reset, 48);
  words[1] = -3;
  frame(12);
  assert.equal(context.__scummwebEvaluationGameVariableEvents, undefined);
  assert.equal(context.__scummwebEvaluationEvents, undefined);
  assert.deepEqual(copy(context.__scummwebGameTelemetry).banks.scumm_vars, [-3, 0]);
  context.__scummwebEvaluationEnabled = true;
  frame(12);
  const records = context.__scummwebEvaluationGameVariableEvents;
  assert.deepEqual(copy(records[0].banks),
    { scumm_vars: [-3, 0], object_state: [0, 0], scumm_bit_bytes: [0], room_vars: [0] });
  assert.equal(context.__scummwebEvaluationGame.index_md5, 'ab'.repeat(16));

  words[1] = 8;
  bytes[17] = 1;
  frame(94);
  assert.deepEqual(copy(records.slice(1)).map(({ bank, index, previous, value }) => [bank, index, previous, value]),
    [['scumm_vars', 0, -3, 8], ['object_state', 1, 0, 1]]);
  assert.equal(records[0].banks.scumm_vars[0], -3);
  assert.deepEqual(copy(context.__scummwebEvaluationEvents).map(({ room_id }) => room_id), [12, 94]);

  words[1] = 0;
  frame(12, true);
  assert.equal(records.at(-1).event, 'game_variables_baseline');
  assert.equal(records.at(-1).banks.scumm_vars[0], 0);
  for (let index = 1; index <= 260; index++) {
    words[1] = index;
    frame(index);
  }
  assert.equal(records.length, 256);
  assert.equal(context.__scummwebEvaluationGameVariableOverflow, true);
  assert.equal(context.__scummwebEvaluationOverflow, true);
});

test('the shared query sampler publishes whole snapshots with bounded typed banks', () => {
  const patch = readFileSync(new URL('../patches/scummvm/19-query-engine-game-state.patch', import.meta.url), 'utf8');
  const [begin, commit, variable, bank] = [...patch.matchAll(/^\+(\t+).*?EM_ASM(?:_INT)?\(\{\n((?:^\+.*\n)+?)^\+\1\}[,)];?/gm)]
    .map(([, , body]) => new vm.Script(`(function(){${body.replace(/^\+/gm, '')}})()`));
  const heap = new ArrayBuffer(20_000);
  let tick = 0;
  const context = vm.createContext({
    HEAPU32: new Uint32Array(heap), HEAP32: new Int32Array(heap), HEAP16: new Int16Array(heap),
    performance: { now: () => tick }, UTF8ToString: value => value,
    __scummwebEvaluationGame: { engine_id: 'sci', game_id: 'fixture' },
  });
  const emit = (script, ...values) => {
    values.forEach((value, index) => { context['$' + index] = value; });
    return script.runInContext(context);
  };
  assert.equal(emit(begin, 7, 0, -1), 0);
  context.__scummwebTelemetryQueryEnabled = true;
  assert.equal(emit(begin, 7, 0, -1), 1);
  context.HEAP32[1] = -2147483648;
  context.HEAP32[2] = -12;
  emit(bank, 'globals', 4, 2, 4, true, true);
  assert.equal(context.__scummwebGameTelemetry, undefined);
  emit(commit);
  const first = context.__scummwebGameTelemetry;
  assert.deepEqual(copy(first), { schema_version: 1, room_id: 7, sample_time_ms: 0,
    banks: { globals: [null, -12] } });
  tick = 249;
  assert.equal(emit(begin, 7, 0, -1), 0);
  assert.equal(emit(begin, -1, 'map.tot', -1), 1, 'Room changes bypass the steady-state throttle');
  context.HEAPU32[1] = 0xffffffff;
  emit(bank, 'other', 4, 4096, 4, false, false);
  emit(variable, 'progress', 'score', 2.5);
  emit(variable, 'progress', 'invalid', NaN);
  assert.equal(context.__scummwebGameTelemetry, first);
  emit(commit);
  assert.equal(context.__scummwebGameTelemetry.room_id, null);
  assert.equal(context.__scummwebGameTelemetry.room_name, 'map.tot');
  assert.deepEqual(copy(context.__scummwebGameTelemetry.banks.progress), { score: 2.5 });
  assert.equal(context.__scummwebGameTelemetry.banks.other[0], 0xffffffff);
  assert.equal(context.__scummwebGameTelemetry.banks.other.length, 4096);
  assert.deepEqual(copy(first.banks.globals), [null, -12]);
});

test('the browser query API is opt-in, copies snapshots, and leaves evaluator queues alone', () => {
  const shell = readFileSync(new URL('../web-shell/scummvm.html', import.meta.url), 'utf8');
  const source = shell.slice(shell.indexOf('const scummwebInlineFrame'), shell.indexOf('function buildVersionedAssetUrl'));
  const install = new vm.Script(source);
  for (const search of ['', '?telemetry=0', '?telemetry=1']) {
    const location = new URL('http://fixture/scummvm.html' + search);
    const context = vm.createContext({ window: { location }, URL, structuredClone });
    install.runInContext(context);
    assert.equal(context.__scummwebEvaluationEnabled, undefined);
    if (search !== '?telemetry=1') {
      assert.equal(context.__scummwebTelemetryQueryEnabled, undefined);
      assert.equal(context.scummwebTelemetry, undefined);
      continue;
    }
    assert.equal(context.__scummwebTelemetryQueryEnabled, true);
    assert.deepEqual(copy(context.scummwebTelemetry.read()), { identity: null, snapshot: null });
    context.__scummwebEvaluationGame = { engine_id: 'gob', game_id: 'gob1' };
    context.__scummwebGameTelemetry = { room_id: null, room_name: 'intro.tot', banks: { vars: [1] } };
    const read = context.scummwebTelemetry.read();
    read.snapshot.banks.vars[0] = 42;
    assert.equal(context.scummwebTelemetry.read().snapshot.banks.vars[0], 1);
  }
});

test('only an explicit opt-in propagates through same-origin play and shell launches', () => {
  const href = '/scummvm.html?localGame=1&continue=1#sky';
  const origin = 'https://fixture.test/sky/play';
  assert.equal(withGameTelemetry(href, origin), href);
  assert.equal(withGameTelemetry(href, origin + '?telemetry=true'), href);
  assert.equal(withGameTelemetry(href, origin + '?telemetry=1&unrelated=ignored'),
    '/scummvm.html?localGame=1&continue=1&telemetry=1#sky');
  assert.equal(withGameTelemetry('https://elsewhere.test/play', origin + '?telemetry=1'), 'https://elsewhere.test/play');
});
