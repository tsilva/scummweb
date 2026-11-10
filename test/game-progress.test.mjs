import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync, gzipSync, gunzipSync } from 'node:zlib';
import { generateGameProgress } from '../scripts/generate-game-progress.mjs';
import { readQueenSaveSnapshot } from '../lib/game-progress/queen-save.mjs';
import { getStoryProgressRevision, observeStoryProgress, readStoryProgress } from '../app/game-player/story-progress.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'scummweb-game-progress-'));
after(() => rm(directory, { recursive: true, force: true }));
await generateGameProgress(directory);
const index = JSON.parse(await readFile(path.join(directory, 'index.json'), 'utf8'));
const { createTracker } = await import(pathToFileURL(path.join(directory, 'v1.mjs')));
const trackerFor = game => createTracker(game, index.games[game].revision);
const state = (room_id, native_time_ms, room_ready = true) => ({ room_id, native_time_ms, room_ready });

test('publishes a revision checked browser tracker for each mapped game', () => {
  assert.equal(index.schema_version, 1);
  for (const [game, { revision, telemetry }] of Object.entries(index.games)) {
    assert.match(revision, /^[a-f0-9]{64}$/);
    assert.equal(trackerFor(game).usesSnapshots, telemetry === 'snapshot');
    assert.throws(() => createTracker(game, '0'.repeat(64)), /revision is unavailable/);
  }
  assert.throws(() => createTracker('unknown-game', '0'.repeat(64)), /revision is unavailable/);
});

test('home story progress retains a verified milestone per copy and revision', async () => {
  const slug = 'maniac-mansion';
  const version = 'source:amiga-copy';
  const revision = getStoryProgressRevision(index, slug, false);
  assert.equal(revision, index.games[slug].revision);
  assert.equal(getStoryProgressRevision(index, 'flight-of-the-amazon-queen', false), undefined);
  const identity = { engine_id: 'scumm', game_id: 'maniac', index_md5: 'e781230da44a44e2f0770edb2b3b3633' };
  const snapshot = { schema_version: 1, room_id: 30, room_ready: true, sample_time_ms: 1,
    banks: { scumm_vars: Array(163).fill(0), running_scripts: Array(64).fill(0) } };
  const stored = new Map();
  const events = new Map();
  let tick;
  const scope = {
    localStorage: { getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() { tick = undefined; },
    addEventListener: (type, callback) => events.set(type, callback),
    removeEventListener: type => events.delete(type),
  };
  const frame = { contentWindow: { scummwebTelemetry: { read: () => ({ identity, snapshot }) } } };
  const progress = (copy = version, mapRevision = revision) => readStoryProgress(scope, copy, slug, mapRevision);
  const stop = observeStoryProgress(scope, frame, { version, slug, revision }, async (...args) => createTracker(...args));
  await Promise.resolve();
  const labPercent = Math.round(100 / trackerFor(slug).report().total);
  assert.equal(progress(), labPercent);
  assert.equal(progress('source:other-copy'), null);
  assert.equal(progress(version, 'old-revision'), null);
  snapshot.room_id = 2;
  snapshot.sample_time_ms++;
  tick();
  assert.equal(progress(), labPercent, 'The library retains the best measured progress after leaving the room');
  snapshot.banks.running_scripts[63] = 1;
  snapshot.sample_time_ms++;
  events.get('pagehide')();
  assert.equal(progress(), 100);
  identity.index_md5 = 'f'.repeat(32);
  snapshot.sample_time_ms++;
  tick();
  assert.equal(progress(), null, 'a reconnected copy with another edition clears stale progress');
  stop();
  assert.equal(tick, undefined);
  assert.equal(events.size, 0);
});

test('Queen scores transient writes, restores and the credits cutaway', () => {
  const tracker = trackerFor('flight-of-the-amazon-queen');
  const baseline = (native_time_ms, values = {}) => ({
    event: 'game_variables_baseline', native_time_ms,
    banks: { game_state: Object.assign(Array(211).fill(0), values) },
  });
  const six = { 3: 1, 101: 1, 123: 2, 41: 2, 67: 2, 105: 1 };
  tracker.accept('queen', [state(67, 2)], [baseline(1, six)]);
  assert.deepEqual(tracker.report().reached, ['hotel-escape', 'distracted-piranhas', 'cut-lily-stem',
    'jungle-crossing', 'amazon-rescue', 'sloth-island', 'temple', 'bypassed-valley-dinosaur', 'valley']);
  assert.equal(tracker.report().percent, 24, 'Late milestones do not imply unrelated temple or Floda puzzles');
  tracker.accept('queen', [state(70, 4)], [baseline(3)]);
  assert.deepEqual(tracker.report().reached, []);
  const crossing = { event: 'game_variables_change', native_time_ms: 5,
    bank: 'game_state', index: 101, previous: 0, value: 1 };
  tracker.accept('queen', [state(21, 7)], [crossing, { ...crossing, native_time_ms: 6, previous: 1, value: 0 }]);
  assert.equal(tracker.report().reached.at(-1), 'jungle-crossing');
  tracker.accept('queen', [state(110, 10, false)], [baseline(8, six)]);
  assert.equal(tracker.report().won, false, 'Credits without Frank’s confrontation do not count');
  tracker.accept('queen', [state(110, 12, false)], [baseline(11, { ...six, 157: 1 })]);
  assert.equal(tracker.report().completed, 11);
  assert.equal(tracker.report().percent, 100);
});

test('Queen saves score the saved state from a native checkpoint format', async () => {
  const fixture = await readFile(new URL('../scummvm-shell/launcher/skip-intro/queen/queen.s00', import.meta.url));
  const identity = { engine_id: 'queen', game_id: 'queen' };
  const tracker = trackerFor('flight-of-the-amazon-queen');
  const opening = await readQueenSaveSnapshot(fixture.toString('base64'));
  assert.equal(opening.room_id, 70);
  tracker.acceptSnapshot(identity, opening);
  assert.equal(tracker.report().percent, 0);

  const save = gunzipSync(fixture);
  save.writeUInt16BE(21, 8766);
  save.writeInt16BE(1, 22440 + 3 * 2); // The crash site removes hotel items and sets native slot 3.
  save.writeInt16BE(-2, 22440 + 34 * 2);
  for (const encoded of [save, gzipSync(save), deflateSync(save)]) {
    const snapshot = await readQueenSaveSnapshot(encoded.toString('base64'));
    assert.equal(snapshot.room_id, 21);
    assert.equal(snapshot.banks.game_state[34], -2);
    tracker.acceptSnapshot(identity, snapshot);
    assert.equal(tracker.report().percent, 3);
  }
  const v0 = Buffer.concat([save.subarray(0, -36), save.subarray(-2)]);
  v0.writeUInt32BE(0, 4);
  v0.writeUInt32BE(v0.length - 48, 12);
  assert.equal((await readQueenSaveSnapshot(v0.toString('base64'))).banks.game_state[3], 1);
  assert.equal(await readQueenSaveSnapshot(save.subarray(0, -1).toString('base64')), null);
  assert.equal(await readQueenSaveSnapshot(gzipSync(Buffer.alloc(24655)).toString('base64')), null);
  save.writeUInt32BE(2, 4);
  assert.equal(await readQueenSaveSnapshot(save.toString('base64')), null);
});

test('Last Crusade scores the credits by outcome and rebuilds progress on restore', () => {
  const tracker = trackerFor('indiana-jones-and-the-last-crusade');
  const identity = { engine_id: 'scumm', game_id: 'indy3', index_md5: '9c0fee288ad564a7d25ec3e841810d79' };
  const globals = Array(100).fill(0);
  const objects = Array(157).fill(0);
  globals[94] = 0x0081;
  globals[95] = 0x0008;
  function accept(room, time, changes, game = identity) {
    tracker.accept('scumm', [state(room, time, false)], changes, game);
  }
  const baseline = time => ({ event: 'game_variables_baseline', native_time_ms: time,
    banks: { scumm_vars: globals, object_state: objects } });
  const outcome = (time, previous, value) => ({ event: 'game_variables_change', native_time_ms: time,
    bank: 'scumm_vars', index: 99, previous, value });
  accept(82, 1, [baseline(1)], { ...identity, index_md5: '0'.repeat(32) });
  assert.equal(tracker.report().reason, 'edition_mismatch');
  accept(82, 2, [baseline(2)]);
  assert.equal(tracker.report().completed, 3);
  accept(94, 3, [outcome(3, 0, 2)]);
  assert.equal(tracker.report().completed, 3);
  accept(82, 4, [outcome(4, 2, 4)]);
  assert.equal(tracker.report().completed, 3, 'An outcome update must not match the previous credits room');
  accept(94, 5, []);
  assert.equal(tracker.report().completed, 4);
  assert.equal(tracker.nextMilestone, null);
  globals.fill(0);
  objects[156] = 1;
  accept(22, 6, [baseline(6)]);
  assert.equal(tracker.report().completed, 1);
  assert.equal(tracker.nextMilestone, null, 'The castle route must not prescribe the airport branch');
  objects[156] = 0;
  accept(22, 7, [baseline(7)]);
  assert.equal(tracker.report().completed, 0);
  accept(22, 10, [
    { event: 'game_variables_change', native_time_ms: 8, bank: 'object_state', index: 156, previous: 0, value: 1 },
    { event: 'game_variables_change', native_time_ms: 9, bank: 'object_state', index: 156, previous: 1, value: 0 },
  ]);
  assert.equal(tracker.report().completed, 1, 'A bank-only branch can match between room samples');
  globals[93] = 0x4200;
  globals[95] = 0x0001;
  accept(84, 11, [baseline(11)]);
  assert.equal(tracker.report().reached.at(-1), 'passed-first-trial');
  globals[95] |= 0x0002;
  accept(85, 12, [baseline(12)]);
  assert.equal(tracker.report().reached.at(-1), 'passed-second-trial');
});

test('Fate of Atlantis tracks shared milestones and requires the surviving ending', () => {
  const tracker = trackerFor('indiana-jones-and-the-fate-of-atlantis');
  const identity = { engine_id: 'scumm', game_id: 'atlantis', index_md5: '182344899c2e2998fca0bebcd82aa81a' };
  const bits = Array(81).fill(0);
  const objects = Array(937).fill(0);
  const globals = Array(239).fill(0);
  const baseline = native_time_ms => ({ event: 'game_variables_baseline', native_time_ms,
    banks: { scumm_bit_bytes: bits, object_state: objects, scumm_vars: globals } });
  function accept(room, time, gameVariableEvents = [], game = identity) {
    tracker.accept('scumm', [state(room, time, false)], gameVariableEvents, game);
  }

  accept(48, 1, [baseline(1)], { ...identity, index_md5: '0'.repeat(32) });
  assert.equal(tracker.report().reason, 'edition_mismatch');
  accept(68, 2, [baseline(2)]);
  assert.equal(tracker.report().completed, 0);
  bits[9] = 0x81;
  accept(10, 3, [baseline(3)]);
  assert.deepEqual(tracker.report().reached, ['new-york-theater']);
  bits[22] = 0x04;
  accept(77, 3.5, [baseline(3.5)]);
  assert.deepEqual(tracker.report().reached, ['new-york-theater', 'opened-tikal-tomb']);
  bits[23] = 0x04;
  accept(26, 3.6, [baseline(3.6)]);
  assert.ok(tracker.report().reached.includes('thawed-iceland-eel'));
  bits[26] = 0x14;
  accept(1, 4, [baseline(4)]);
  assert.equal(tracker.report().latest_milestone, "Read Plato's Lost Dialogue");
  globals[238] = 2;
  accept(1, 4.5, [baseline(4.5)]);
  assert.equal(tracker.report().reached.at(-1), 'chose-story-path');
  accept(51, 5);
  assert.equal(tracker.report().latest_milestone, 'Entered the Crete Labyrinth');
  accept(48, 6);
  assert.equal(tracker.report().reached.at(-1), 'atlantis');
  objects[582] = 1;
  accept(98, 7, [baseline(7)]);
  assert.equal(tracker.report().reached.at(-1), 'opened-airlock', 'The airlock exit persists across saves');
  objects[412] = 2;
  accept(36, 7.25, [baseline(7.25)]);
  assert.ok(tracker.report().reached.includes('restored-orichalcum-factory'));
  assert.ok(tracker.report().reached.includes('outer-ring'), 'An installed wheel proves earlier entry after restore');
  assert.ok(!tracker.report().reached.includes('dived-toward-atlantis'), 'Atlantis has a route through the Crete subway');
  accept(46, 7.5);
  assert.equal(tracker.report().reached.at(-1), 'canal');
  accept(94, 7.75);
  assert.equal(tracker.report().reached.at(-1), 'middle-ring');
  accept(55, 8);
  assert.equal(tracker.report().reached.at(-1), 'inner-ring');
  accept(23, 9);
  assert.equal(tracker.report().reached.at(-1), 'colossus');
  objects[264] = 3;
  accept(23, 9.5, [baseline(9.5)]);
  assert.equal(tracker.report().reached.at(-1), 'loaded-god-machine-disks');
  const beforeEnding = tracker.report().completed;
  assert.ok(beforeEnding < tracker.report().total - 1, 'Branch-exclusive progress is not inferred');
  accept(24, 10);
  assert.equal(tracker.report().completed, beforeEnding, 'Death retains prior progress');
  accept(96, 11);
  assert.equal(tracker.report().completed, beforeEnding, 'The ending room alone cannot grant completion');
  accept(25, 12, [{ event: 'game_variables_change', native_time_ms: 12,
    bank: 'scumm_bit_bytes', index: 4, previous: 0, value: 0x10 }]);
  assert.equal(tracker.report().completed, beforeEnding, 'Starting the escape cannot grant completion');
  accept(96, 13);
  assert.equal(tracker.report().percent, 100);
  assert.equal(tracker.nextMilestone, null);

  bits.fill(0);
  objects.fill(0);
  accept(68, 14, [baseline(14)]);
  assert.equal(tracker.report().completed, 0);
  accept(66, 15);
  assert.equal(tracker.report().reached.at(-1), 'dived-toward-atlantis');
  accept(82, 16, [baseline(16)]);
  assert.equal(tracker.report().reached.at(-1), 'dived-toward-atlantis');
});

test('DreamWeb scores keyed snapshots and rebuilds progress after a restore', () => {
  const tracker = trackerFor('dreamweb');
  const identity = { engine_id: 'dreamweb', game_id: 'dreamweb' };
  const start = { beenMugged: 0, talkedToSparky: 0, card1Money: 0, talkedToAttendant: 0,
    talkedToBoss: 0, gunPassFlag: 0, talkedToRecep: 0, cardPassFlag: 0,
    rockstarDead: 0, generalDead: 0, sartainDead: 0, aideDead: 0,
    canMoveAltar: 0, manDead: 0, madmanFlag: 0 };
  let sampleTime = 0;
  const accept = (room_id, vars) => tracker.acceptSnapshot(identity,
    { room_id, sample_time_ms: ++sampleTime, banks: { game_vars: vars } });

  accept(0, { ...start, manDead: null });
  assert.equal(tracker.report().reason, 'missing_game_variables');
  accept(0, start);
  assert.equal(tracker.report().completed, 0);
  accept(23, { ...start, talkedToAttendant: 1, talkedToBoss: 1 });
  assert.deepEqual(tracker.report().reached, ['pool-hall-contact', 'spoke-to-silverman']);
  const funded = { ...start, beenMugged: 1, talkedToSparky: 1, card1Money: 12432 };
  accept(8, funded);
  assert.equal(tracker.report().completed, 3);
  const paid = { ...funded, talkedToAttendant: 1, talkedToBoss: 1, gunPassFlag: 1, card1Money: 10432 };
  accept(23, paid);
  assert.equal(tracker.report().completed, 6, 'Payment is distinct from the gun release');
  accept(0, { ...paid, gunPassFlag: 2, talkedToRecep: 1, cardPassFlag: 1 });
  assert.equal(tracker.report().completed, 9, 'Payment is distinct from the hotel keycard');
  accept(0, { ...paid, gunPassFlag: 2, talkedToRecep: 1, cardPassFlag: 2, card1Money: 2132 });
  assert.equal(tracker.report().completed, 10);
  accept(24, { ...start, rockstarDead: 1, generalDead: 2, sartainDead: 2 });
  assert.deepEqual(tracker.report().reached, ['crane', 'sterling', 'sartain'],
    'Aftermath states count without supplying unrelated early milestones');
  const altar = { ...start, rockstarDead: 1, generalDead: 2, sartainDead: 2, aideDead: 1, canMoveAltar: 1 };
  accept(9, altar);
  assert.equal(tracker.report().completed, 5);
  accept(14, { ...altar, manDead: 2 });
  assert.equal(tracker.report().completed, 6);
  assert.equal(tracker.report().won, false);
  accept(14, { ...altar, madmanFlag: 1 });
  assert.equal(tracker.report().percent, 100);
  accept(9, altar);
  assert.equal(tracker.report().completed, 5, 'Loading before the subway drops credit for later milestones');
  accept(0, start);
  assert.equal(tracker.report().completed, 0);
});

test('Elvira I counts the six saved key pickups independently and only a win completes the checklist', () => {
  const tracker = trackerFor('elvira-mistress-of-the-dark');
  const identity = { engine_id: 'agos', game_id: 'elvira1', index_md5: '773f0004d21f095c7a4c25d4cd22a1a1' };
  let sampleTime = 0;
  const accept = (slots = {}, won = 0, detected = identity) => {
    const vars = Object.assign(Array(512).fill(0), slots);
    tracker.acceptSnapshot(detected, { room_id: null, sample_time_ms: ++sampleTime,
      banks: { vars, elvira1_outcome: { emelda_defeated: won } } });
    return tracker.report();
  };

  assert.deepEqual(accept().reached, []);
  assert.deepEqual(accept({ 449: 32 }).reached, ['sextus-key']);
  assert.deepEqual(accept({ 449: 33 }).reached, ['primus-key', 'sextus-key']);
  assert.deepEqual(accept({ 449: 1 }).reached, ['primus-key'], 'An earlier save drops the other key');
  assert.deepEqual(accept({ 449: 2 }).reached, ['secundus-key']);
  assert.equal(tracker.nextMilestone, null);
  assert.deepEqual(accept({ 449: 63, 139: 6 }).reached,
    ['primus-key', 'secundus-key', 'tertius-key', 'quartus-key', 'quintus-key', 'sextus-key', 'unlocked-chest']);
  assert.equal(accept({ 496: 1, 499: 1 }).percent, 0, 'A death can also reach the replay prompt');
  assert.deepEqual(accept({ 436: 31 }).reached, ['cast-ceremonial-scroll'], 'Ready to use the dagger is not a win');
  const won = accept({}, 1);
  assert.equal(won.percent, 100);
  assert.equal(won.won, true);
  assert.equal(won.completed, 1, 'An ending after a script reset does not invent old evidence');
  assert.equal(accept().percent, 0, 'A fresh or restored attempt clears the winning outcome');
  assert.equal(accept({}, 1, { ...identity, index_md5: undefined }).reason, 'edition_mismatch');
});

test('Elvira II counts early puzzles and studios in either order without credit for skipped milestones', () => {
  const tracker = trackerFor('elvira-ii-the-jaws-of-cerberus');
  const identity = { engine_id: 'agos', game_id: 'elvira2', index_md5: 'a144d2467e1addee1f705647dacd33df' };
  let sampleTime = 0;
  const accept = ({ studios = 0, stage = 0, outcome = 0, monsterPosition = 0, flags = [], secondary = [], items = {},
    detected = identity, olderRuntime = false } = {}) => {
    const vars = Array(255).fill(0);
    vars[166] = monsterPosition;
    vars[180] = studios;
    vars[186] = stage;
    const words = (count, bits) => {
      const bank = Array(count).fill(0);
      for (const bit of bits) bank[bit >> 4] |= 1 << (bit % 16);
      return bank;
    };
    const banks = { vars, elvira2_outcome: { ritual: outcome } };
    if (!olderRuntime) Object.assign(banks, {
      flag_words: words(16, flags),
      flag_words_secondary: words(15, secondary),
      item_states: Object.assign(Array(855).fill(0), items),
    });
    tracker.acceptSnapshot(detected, { room_id: null, sample_time_ms: ++sampleTime, banks });
    return tracker.report();
  };

  assert.deepEqual(accept().reached, []);
  assert.deepEqual(accept({ flags: [0, 2, 11, 13, 17, 22, 56, 127, 188, 211], secondary: [75] }).reached,
    [], 'The original Amiga Start save sets opening and interface flags');
  assert.deepEqual(accept({ items: { 802: 1 } }).reached, ['inserted-security-key']);
  assert.deepEqual(accept({ items: { 802: 2 } }).reached, ['inserted-security-key', 'opened-main-gate']);
  assert.deepEqual(accept({ secondary: [7] }).reached, ['entered-catacombs-studio']);
  assert.deepEqual(accept({ secondary: [7, 5] }).reached, ['entered-spider-studio', 'entered-catacombs-studio']);
  assert.deepEqual(accept({ secondary: [6] }).reached, ['entered-haunted-studio']);
  assert.deepEqual(accept({ items: { 367: 1, 823: 1 }, secondary: [66] }).reached,
    ['thawed-boiler-room', 'opened-attic-skylight', 'recovered-fish-tank-key']);
  assert.deepEqual(accept({ items: { 367: 1 }, flags: [209] }).reached,
    ['opened-attic-skylight', 'defeated-attic-vampire']);
  assert.deepEqual(accept({ items: { 436: 2 } }).reached, ['opened-locker-exit']);
  assert.deepEqual(accept({ items: { 436: 1 } }).reached, ['opened-locker-exit', 'defeated-locker-ghoul']);
  assert.deepEqual(accept({ flags: [199], secondary: [85] }).reached, ['animated-monster']);
  assert.deepEqual(accept({ flags: [198, 199], secondary: [85], monsterPosition: 5 }).reached,
    ['animated-monster'], 'The monster still blocks the door when the wires are cut too early');
  assert.deepEqual(accept({ flags: [198, 199], secondary: [85], monsterPosition: 6 }).reached,
    ['animated-monster', 'stopped-lab-monster']);
  assert.deepEqual(accept({ flags: [54, 86], secondary: [65, 9] }).reached,
    ['reached-spider-lift', 'defeated-second-banshee', 'opened-crypt-slab', 'passed-catacomb-sorcerer']);
  const tripwires = [
    [139, '37-57'], [119, '111-112'], [140, '198-199'], [149, '593-613'], [148, '622-642'],
    [154, '874-894'], [153, '1041-1061'], [158, '1530-1550'], [159, '1686-1687'],
    [160, '1725-1745'], [161, '1895-1896'], [171, '2126-2127'], [172, '2174-2175'],
  ];
  for (const [bit, cells] of tripwires.toReversed()) {
    assert.deepEqual(accept({ flags: [bit] }).reached, [`cut-catacomb-wire-${cells}`],
      'Restoring a different catacomb snapshot replaces the checked tripwires');
  }
  assert.deepEqual(accept({ studios: 1, flags: [103] }).reached, ['resolved-catacombs-studio']);
  assert.deepEqual(accept({ studios: 2, flags: [103, 113] }).reached,
    ['resolved-spider-studio', 'resolved-catacombs-studio']);
  assert.deepEqual(accept({ studios: 1, flags: [222] }).reached, ['resolved-haunted-studio'],
    'Restoring a different route replaces the checked studios');
  assert.deepEqual(accept({ studios: 2, flags: [222, 113] }).reached,
    ['resolved-spider-studio', 'resolved-haunted-studio']);
  assert.equal(tracker.nextMilestone, null);
  assert.deepEqual(accept({ flags: [217], items: { 176: 2 } }).reached,
    ['revived-priest', 'prepared-pentacle', 'blessed-implements']);
  assert.deepEqual(accept({ flags: [226], items: { 176: 2 } }).reached,
    ['revived-priest', 'prepared-pentacle', 'lit-ritual-candles']);
  assert.deepEqual(accept({ stage: 3 }).reached, [], 'The ritual also requires a verified rescue');

  const rescued = { studios: 3, flags: [103, 113, 222] };
  assert.equal(accept(rescued).reached.at(-1), 'rescued-elvira');
  assert.equal(accept({ ...rescued, stage: 1 }).reached.at(-1), 'summoned-cerberus');
  assert.ok(tracker.report().reached.includes('lit-ritual-candles'),
    'Summoning proves the candles were lit even after the flag clears');
  assert.equal(accept({ ...rescued, stage: 2 }).reached.at(-1), 'bound-cerberus');
  assert.equal(accept({ ...rescued, stage: 3 }).reached.at(-1), 'used-lance');
  assert.equal(accept({ ...rescued, stage: 3, outcome: 2 }).reached.at(-1), 'used-lance');
  assert.equal(accept({ ...rescued, stage: 20, outcome: 2 }).reached.at(-1), 'rescued-elvira');
  assert.equal(accept({ outcome: 1 }).percent, 100, 'The scripted Start load resets vars during the winning sequence');
  assert.deepEqual(accept({ studios: 1, flags: [113] }).reached, ['resolved-spider-studio']);
  assert.equal(accept({ olderRuntime: true }).reason, 'missing_game_variables');
  assert.equal(accept({ detected: { ...identity, index_md5: '0'.repeat(32) } }).reason, 'edition_mismatch');
});

test('Sierra maps match their edition and distinguish the winning branches', async t => {
  const editions = [
    ['space-quest-the-sarien-encounter', 'agi', 'sq1', '0b216d931e95750f1f4837d6a4b821e5', 64, {}, 43],
    ['space-quest-the-sarien-encounter-sq1sci', 'sci', 'sq1sci', '1dd1b7c042f0c7345730a94633d283fe', 2, { globals: { 12: 68 } }],
    ['space-quest-ii-chapter-ii-vohaul-s-revenge', 'agi', 'sq2', '28add5125484302d213911df60d2aded', 93,
      { vars: { 96: 11, 144: 2 }, flag_bytes: { 14: 8, 24: 32 } }, 95],
    ['space-quest-iii-the-pirates-of-pestulon', 'sci', 'sq3', 'cc1a975fa0f80941b9485866ee6ff634', 117, { globals: { 12: 116 } }],
    ['space-quest-iv-roger-wilco-and-the-time-rippers', 'sci', 'sq4', 'bd29d3fb8ea4a8ee638edaf40aa5f5ed', 540, { globals: { 12: 556 } }],
    ['space-quest-v-the-next-mutation', 'sci', 'sq5', 'ea937aae231c4acdaeb249dea8f71060', 1041, { globals: { 12: 1060 } }],
    ['space-quest-6-roger-wilco-in-the-spinal-frontier', 'sci', 'sq6', 'ed5ad1dfcfcae482072634c9a69c6a53', 960, { globals: { 12: 540 } }],
    ['king-s-quest-quest-for-the-crown', 'sci', 'kq1sci', 'fcf6a00f2ff4715bf8ea65388458179d', 85, { globals: { 12: 53 } }],
    ['king-s-quest-ii-romancing-the-throne', 'agi', 'kq2', 'b866f0fab2fad91433a637a828cfa410', 107, { flag_bytes: { 4: 4 } }],
    ['king-s-quest-iii-to-heir-is-human', 'agi', 'kq3', '8ab343306df0e2d98f136be4e8cfd0ef', 74, { vars: { 220: 26 } }],
    ['king-s-quest-iv-the-perils-of-rosella', 'sci', 'kq4sci', '53cceea993dc02611cc3cfb3f1c548bb', 694, { globals: { 160: 0 } }],
    ['king-s-quest-v-absence-makes-the-heart-go-yonder', 'sci', 'kq5', 'a8a854af430e25c70e2b986f02239710', 123, { globals: { 12: 120 } }],
    ['king-s-quest-vi-heir-today-gone-tomorrow', 'sci', 'kq6', '8ac79732f6f759158cda43e0b8b1988e', 740, { globals: { 12: 180 } }],
    ['king-s-quest-vii-the-princeless-bride', 'sci', 'kq7', 'a000858d91155b948bf3b23fa71ff79a', 2210, { globals: { 12: 2208 } }],
    ['police-quest-in-pursuit-of-the-death-angel', 'agi', 'pq1', 'cfa93e5f2aa7378bddd10ad6746a2ffb', 104, { vars: { 139: 4 } }, 104],
    ['police-quest-in-pursuit-of-the-death-angel-pq1sci', 'sci', 'pq1sci', '1bddd987b230086a13da172f85908d2c', 60, { globals: { 12: 58 } }],
    ['police-quest-2-the-vengeance', 'sci', 'pq2', '499de78ae72b7ce219f944c5e7ef0c5b', 91, { globals: { 12: 133 } }],
    ['police-quest-3-the-kindred', 'sci', 'pq3', '5bd82ed17c41e596df61782f850c6ade', 33, { globals: { 12: 57 } }],
    ['police-quest-iv-open-season', 'sci', 'pq4', '069123b257f9e7655f13eb768397c345', 778, { globals: { 12: 755 } }],
    ['police-quest-iv-open-season', 'sci', 'pq4', '069123b257f9e7655f13eb768397c345', 779, { globals: { 12: 778 } }],
  ];
  for (const [slug, engine_id, game_id, index_md5, ending, changes, otherRoom = ending] of editions) {
    await t.test(`${game_id} ending room ${ending}`, () => {
      const tracker = trackerFor(slug);
      const banks = engine_id === 'agi'
        ? { vars: Array(256).fill(0), flag_bytes: Array(32).fill(0) }
        : { globals: Array(800).fill(0) };
      if (game_id === 'kq4sci') banks.globals[160] = 1;
      let sample_time_ms = 0;
      function accept(room_id, md5 = index_md5) {
        tracker.acceptSnapshot({ engine_id, game_id, index_md5: md5 }, { room_id, sample_time_ms: ++sample_time_ms, banks });
        return tracker.report();
      }
      assert.notEqual(accept(otherRoom).percent, 100);
      for (const [bank, values] of Object.entries(changes)) Object.assign(banks[bank], values);
      assert.equal(accept(ending, '0'.repeat(32)).reason, 'edition_mismatch');
      const victory = accept(ending);
      assert.equal(victory.percent, 100);
      assert.equal(victory.reached.at(-1), 'winning-ending');
    });
  }
});

test('Sierra progress uses saved state and rejects credits reached on a losing route', async t => {
  const cases = [
    {
      slug: 'king-s-quest-quest-for-the-crown', engine: 'sci', game: 'kq1sci', md5: 'fcf6a00f2ff4715bf8ea65388458179d',
      steps: [
        [1, {}, []],
        [58, { 155: 256 }, ['found-magic-chest']],
        [77, { 154: 256, 155: 256 }, ['found-magic-chest', 'found-magic-shield']],
        [51, { 155: 2048 }, ['found-magic-mirror']],
        [85, { 12: 53 }, ['found-magic-mirror', 'found-magic-chest', 'found-magic-shield', 'returned-to-castle', 'winning-ending']],
        [1, {}, []],
      ],
    },
    {
      slug: 'king-s-quest-vii-the-princeless-bride', engine: 'sci', game: 'kq7', md5: 'a000858d91155b948bf3b23fa71ff79a',
      steps: [
        [1000, { 122: 0 }, []],
        [35, { 122: 4, 12: 20, 134: 0x0002 }, []], // Chapter selection seeds flag 126.
        [5100, { 122: 5, 134: 0x0002 }, []],
        [35, { 122: 3, 12: 5300 }, ['reached-chapter-4']],
        [35, { 122: 4, 12: 2202 }, ['reached-chapter-5']],
        [35, { 122: 2, 12: 2550 }, ['used-enchanted-rope', 'reached-chapter-3']],
        [1000, { 160: 0x0400 }, ['reached-chapter-2']],
        [1000, { 122: 0 }, []],
      ],
    },
    {
      slug: 'king-s-quest-vi-heir-today-gone-tomorrow', engine: 'sci', game: 'kq6', md5: '8ac79732f6f759158cda43e0b8b1988e',
      steps: [
        [670, {}, ['crossed-with-charon']],
        [510, { 145: 0x0040 }, ['picked-white-rose']],
        [710, {}, ['castle-dungeon']],
        [740, { 12: 730 }, []],
        [740, { 12: 180 }, ['reached-duel', 'winning-ending']],
      ],
    },
    {
      slug: 'laura-bow-2-the-dagger-of-amon-ra', engine: 'sci', game: 'laurabow2', md5: 'eb41961ba4446d6f484edb9de91224b3',
      steps: [
        [750, {}, ['reached-inquest']],
        [780, { 12: 790, 126: 2 }, []],
        [780, { 12: 785, 126: 3 }, []],
        [500, { 262: 795 | 0x1000, 228: 796 }, ['collected-bifocals', 'collected-red-hair']],
        [525, { 231: 800 }, ['collected-grapes']],
        [500, { 227: 795, 263: 796 }, []], // Neither adjacent notebook tab counts.
        [780, { 12: 785, 126: 1 }, ['collected-wire-cutters', 'collected-bifocals', 'collected-red-hair',
          'collected-grapes', 'recovered-dagger', 'reached-inquest', 'solved-murders', 'solved-full-case', 'winning-ending']],
        [780, { 12: 785, 126: 4 }, ['collected-wire-cutters', 'collected-bifocals', 'collected-red-hair',
          'collected-grapes', 'reached-inquest', 'solved-murders', 'winning-ending']],
      ],
    },
    {
      slug: 'conquests-of-camelot-the-search-for-the-grail', engine: 'sci', game: 'camelot', md5: '1c48034c50d35cf5088460c300baa94d',
      steps: [
        [15, { 200: 4, 252: 0x1000 }, ['broke-gawaine-shackles']], // Breaking the chains cannot prove he lived.
        [70, { 262: 2 }, ['rescued-galahad']],
        [31, { 254: 0x4000 }, ['flower-room', 'rescued-launcelot']],
        [80, {}, ['grail-chamber']],
        [92, { 12: 80 }, ['rescued-gawaine', 'flower-room', 'rescued-launcelot', 'rescued-galahad', 'grail-chamber', 'winning-ending']],
      ],
    },
    {
      slug: 'laura-bow-the-colonel-s-bequest', engine: 'sci', game: 'laurabow', md5: '5812747f683e098ce33ec787cd237c65',
      steps: [
        [49, { 440: 8 }, ['read-lillians-diary']],
        [23, { 123: 4 }, ['found-gloria']],
        [58, { 440: 0x4000 }, ['pried-loose-board', 'found-hidden-bible']],
        [786, { 12: 785 }, []],
        [786, { 12: 784 }, ['departure-after-case', 'winning-ending']],
      ],
    },
    {
      slug: 'conquests-of-the-longbow-the-legend-of-robin-hood', engine: 'sci', game: 'longbow', md5: '52944b462328558070bf02fb371618e2',
      steps: [
        [420, {}, ['judgement']],
        [160, { 214: 2 }, ['helped-poacher']],
        [160, { 214: 4 }, ['helped-woman']],
        [160, { 211: 0x4000 }, ['resolved-jeweler']],
        [160, { 211: 0x4000, 213: 0x0080 }, ['resolved-jeweler', 'spared-jeweler']],
        [97, { 12: 801 }, []],
        [97, { 12: 421, 151: 20 }, []],
        [97, { 12: 421, 151: 10 }, ['judgement', 'winning-ending']],
      ],
    },

  ];
  for (const { slug, engine, game, md5, steps } of cases) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id: engine, game_id: game, index_md5: md5 };
      let time = 0;
      for (const [room, values, expected] of steps) {
        const bank = Object.assign(Array(engine === 'agi' ? 256 : 450).fill(0), values);
        const banks = engine === 'agi' ? { vars: bank, flag_bytes: Array(32).fill(0) } : { globals: bank };
        tracker.acceptSnapshot(identity, { room_id: room, sample_time_ms: ++time, banks });
        assert.deepEqual(tracker.report().reached, expected);
      }
    });
  }
});

test('AGI milestones distinguish reused bits and partial endings', async t => {
  const cases = [
    ['king-s-quest-ii-romancing-the-throne', 'kq2', 'b866f0fab2fad91433a637a828cfa410', [
      [51, {}, { 12: 2 }, ['reached-neptune']],
      [2, {}, { 11: 128 }, ['reached-neptune', 'opened-neptune-clam']],
      [42, {}, { 10: 128 }, ['opened-first-door', 'opened-second-door', 'opened-third-door']],
    ]],
    ['gold-rush', 'goldrush', 'a1d4de3e75c2688c1e2ca2634ffc3bd8', [
      [20, { 40: 1 }, {}, ['booked-passage']],
      [20, { 40: 2 }, {}, ['booked-passage']],
      [21, { 40: 3 }, {}, ['booked-passage']],
      [119, { 40: 3, 106: 33 }, { 9: 0x80 }, ['booked-passage', 'green-river',
        'locked-wagon-wheels', 'crossed-green-river']],
      [113, { 40: 3 }, { 5: 8 }, ['booked-passage', 'sacramento']],
      [162, { 129: 4 }, { 15: 128 }, ['found-jake', 'opened-cavern-passage']],
      [193, { 225: 33 }, {}, []],
      [193, { 225: 34 }, {}, ['found-jake', 'opened-cavern-passage', 'winning-ending']],
    ]],
    ['king-s-quest-iii-to-heir-is-human', 'kq3', '8ab343306df0e2d98f136be4e8cfd0ef', [
      [78, { 128: 20 }, { 28: 8 }, ['pirate-ship']],
      [43, {}, { 19: 0x20 }, ['prepared-invisibility']],
      [43, {}, { 19: 0x01 }, ['prepared-flying']],
      [8, { 128: 20 }, { 19: 8, 28: 8 }, ['prepared-cat-cookie', 'defeated-manannan']],
      [66, {}, { 22: 64 }, []], // Rosella can be untied too early.
      [66, {}, { 22: 192 }, ['prepared-storm', 'defeated-dragon', 'untied-rosella']],
    ]],
    ['space-quest-ii-chapter-ii-vohaul-s-revenge', 'sq2', '28add5125484302d213911df60d2aded', [
      [95, {}, { 8: 16 }, []], // The hidden cheat command reaches room 95.
      [93, { 96: 11, 144: 0 }, { 24: 32 }, ['entered-sleep-chamber']],
      [93, { 96: 11, 144: 2 }, { 14: 8, 24: 32 },
        ['reached-clone-controls', 'aborted-clone-launch', 'entered-sleep-chamber', 'winning-ending']],
    ]],
    ['manhunter-new-york', 'mh1', '92c6183042d1c2bb76236236a7d7a847', [
      [111, { 60: 4 }, { 20: 15 }, ['second-assignment', 'third-assignment', 'fourth-assignment']],
      [151, {}, { 20: 8 }, ['destroyed-flight-target-4']],
      [162, {}, { 20: 7 }, ['destroyed-flight-target-1', 'destroyed-flight-target-2', 'destroyed-flight-target-3']],
      [162, {}, { 20: 15 }, ['destroyed-flight-target-1', 'destroyed-flight-target-2',
        'destroyed-flight-target-3', 'destroyed-flight-target-4', 'winning-ending']],
    ]],
    ['police-quest-in-pursuit-of-the-death-angel', 'pq1', 'cfa93e5f2aa7378bddd10ad6746a2ffb', [
      [3, {}, { 12: 64 }, []],
      [6, {}, { 9: 128 }, ['found-trunk-evidence']],
      [104, { 139: 3 }, {}, ['reached-bains-trial', 'reached-award-ceremony']],
      [104, { 139: 4 }, {}, ['reached-bains-trial', 'reached-award-ceremony', 'winning-ending']],
    ]],
    ['the-black-cauldron', 'bc', '0c5a9acbcc7e51127c34818e75806df6', [
      [66, {}, {}, ['hen-wen-refuge']],
      [20, {}, { 6: 4 }, ['hen-wen-refuge', 'delivered-hen-wen']],
      [20, { 35: 1 }, {}, ['neutralized-cauldron']],
      [60, { 102: 69 }, {}, ['reached-cauldron-chamber', 'neutralized-cauldron']],
      [71, {}, {}, ['neutralized-cauldron', 'winning-ending']],
    ]],
  ];
  for (const [slug, game_id, index_md5, steps] of cases) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      for (const [room_id, vars, flags, reached] of steps) {
        tracker.acceptSnapshot({ engine_id: 'agi', game_id, index_md5 }, {
          room_id, sample_time_ms: 1, banks: {
            vars: Object.assign(Array(256).fill(0), vars),
            flag_bytes: Object.assign(Array(32).fill(0), flags),
          },
        });
        assert.deepEqual(tracker.report().reached, reached);
        assert.equal(tracker.report().won, reached.includes('winning-ending'));
      }
    });
  }
});

test('Both Mother Goose editions count every rhyme regardless of which one was solved', async t => {
  const editions = [
    ['mixed-up-mother-goose', 'agi', 'mixedup', 'e524655abf9b96a3b179ffcd1d0f79af', 'vars', 3],
    ['mixed-up-mother-goose-deluxe', 'sci', 'mothergoosehires', '5159a1578c4306bfe070a3e4d8c2e1d3', 'globals', 15],
  ];
  for (const [slug, engine_id, game_id, index_md5, bank, slot] of editions) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id, game_id, index_md5 };
      for (const count of [...Array(19).keys(), 2, 0]) {
        tracker.acceptSnapshot(identity, { room_id: 37, sample_time_ms: 1,
          banks: { [bank]: { [slot]: count } } });
        assert.equal(tracker.report().completed, count);
        assert.equal(tracker.report().percent, Math.round(count * 100 / 18));
      }
    });
  }
});

test('Quest for Glory I editions track side quests independently and use the actual award flag', async t => {
  const editions = [
    ['quest-for-glory-i-so-you-want-to-be-a-hero', 'qfg1', 'b7e0bea010b7e9f635ba940858590a59', 350],
    ['quest-for-glory-i-so-you-want-to-be-a-hero-qfg1vga', 'qfg1vga', 'a5a29ff0038a27e4f791fc918f5dc18d', 290],
  ];
  for (const [slug, game_id, index_md5, base] of editions) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id: 'sci', game_id, index_md5 };
      const accept = (room_id, ...flags) => {
        const globals = Array(400).fill(0);
        for (const flag of flags) globals[base + (flag >> 4)] |= 0x8000 >> (flag & 15);
        tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1, banks: { globals } });
        return tracker.report();
      };
      assert.deepEqual(accept(1, 681, 698).reached, ['gathered-green-fur', 'gathered-flying-water']);
      assert.deepEqual(accept(1, 689).reached, ['gathered-fairy-dust']);
      assert.equal(accept(600).won, false, 'Room entry precedes the verified award');
      const award = accept(600, 713, 734);
      assert.equal(award.won, true);
      assert.equal(award.percent, 100);
      assert.deepEqual(award.reached, ['rescued-elsa', 'winning-ending'], 'A win does not grant unrelated side quests');
      assert.equal(accept(1).percent, 0);
    });
  }
});

test('Quest for Glory II and III retain independent progress through a save restore', async t => {
  const editions = [
    ['quest-for-glory-ii-trial-by-fire', 'qfg2', 'c51b24526747dedc29f3841f9b3ab816', 700,
      [[4, [623], ['captured-water-elemental']], [5, [622, 626], ['captured-fire-elemental', 'captured-air-elemental']],
        [490, [714], ['defeated-ad-avis']]], 840, 822],
    ['quest-for-glory-iii-wages-of-war', 'qfg3', '70f7ae052f2a06ae7e94c6943ab59fc0', 500,
      [[5, [260, 327], ['received-heart-gift', 'collected-feather']],
        [180, [325], ['waterfall', 'crossed-waterfall']]], 52, 880],
  ];
  for (const [slug, game_id, index_md5, base, steps, ending, previous] of editions) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const accept = (room_id, flags, prior = 0) => {
        const globals = Array(750).fill(0);
        for (const flag of flags) globals[base + (flag >> 4)] |= 0x8000 >> (flag & 15);
        globals[12] = prior;
        tracker.acceptSnapshot({ engine_id: 'sci', game_id, index_md5 }, {
          room_id, sample_time_ms: 1, banks: { globals },
        });
        return tracker.report();
      };
      for (const [room, flags, reached] of steps) assert.deepEqual(accept(room, flags).reached, reached);
      assert.equal(accept(ending, []).won, false, 'The generic character export screen is not enough');
      assert.equal(accept(ending, [], previous).percent, 100);
      assert.equal(accept(1, []).percent, 0);
    });
  }
});

test('SCI32 endings require the numbered-map identity and the winning route', async t => {
  const editions = [
    ['the-beast-within-a-gabriel-knight-mystery', 'gk2', 'b527742646e358218b5861ac392a604d', 92, { 12: 1300 }],
    ['leisure-suit-larry-7-love-for-sail', 'lsl7', '63fe61e2fa7b019d5e202045e6a29d24', 152, { 12: 150 }],
    ['lighthouse-the-dark-being', 'lighthouse', '9a02b315bbbacdf03f77ee64d233f573', 380, { 137: 7 }],
    ['phantasmagoria', 'phantasmagoria', 'abeb9a32ad6dcf9e4371d4f9897f8694', 92, { 12: -18056 }],
    ['phantasmagoria-2-a-puzzle-of-flesh', 'phantasmagoria2', 'b200596c2dc7277d0510dee44bac9ee0', 9401, { 12: -23504, 145: 0x0010 }],
    ['rama', 'rama', 'a60b844ff796efb2a1afac2893104fab', 1300, { 12: 5209, 309: 0x0004 }],
    ['shivers', 'shivers', '5dc3653b80fee5c69f7c850c990cbbcc', 923, { 12: 935, 547: 10 }],
    ['torin-s-passage', 'torin', '1e28b9e1a0f897d9d31980fc347c427b', 51500, { 12: -14136 }],
  ];
  for (const [slug, game_id, index_md5, room_id, values] of editions) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id: 'sci', game_id, index_md5 };
      const globals = Array(550).fill(0);
      const sample = { room_id, sample_time_ms: 1, banks: { globals } };
      tracker.acceptSnapshot(identity, sample);
      assert.notEqual(tracker.report().percent, 100);
      Object.assign(globals, values);
      tracker.acceptSnapshot({ ...identity, index_md5: '0'.repeat(32) }, sample);
      assert.equal(tracker.report().reason, 'edition_mismatch');
      tracker.acceptSnapshot(identity, sample);
      assert.equal(tracker.report().percent, 100);
      globals.fill(0);
      tracker.acceptSnapshot(identity, { ...sample, room_id: 1 });
      assert.equal(tracker.report().percent, 0);
    });
  }
});

test('Lighthouse restores proven progress and distinguishes the bomb and capture routes', () => {
  const tracker = trackerFor('lighthouse-the-dark-being');
  const identity = { engine_id: 'sci', game_id: 'lighthouse', index_md5: '9a02b315bbbacdf03f77ee64d233f573' };
  const accept = (room_id, flags = {}) => {
    tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1,
      banks: { globals: Object.assign(Array(200).fill(0), flags) } });
    return tracker.report();
  };

  assert.deepEqual(accept(800).reached, ['reached-dark-domain']);
  assert.deepEqual(accept(820, { 139: 0x40 }).reached, ['opened-amandas-cage']);
  assert.deepEqual(accept(380, { 137: 4 }).reached, ['reached-dark-domain', 'rescued-krick'],
    'Restored Krick rescue proves the Domain, but cannot prove Amanda is still safe');
  assert.notEqual(accept(380, { 137: 6 }).percent, 100, 'The uncontained creature leads to the partial reunion');
  assert.notEqual(accept(380, { 137: 1, 140: 1 }).percent, 100, 'The explosion without Krick is a loss');
  assert.notEqual(accept(380, { 137: 4, 140: 1, 141: -32768 }).percent, 100, 'Dying in the explosion is a loss');
  const bombWin = accept(380, { 137: 4, 140: 1 });
  assert.equal(bombWin.percent, 100, 'Krick and the safe explosion suffice');
  assert.ok(!bombWin.reached.includes('captured-dark-being'), 'The bomb and capture are separate routes');
  assert.equal(accept(380, { 137: 7 }).percent, 100, 'The captured-creature reunion also wins');
  assert.deepEqual(accept(1).reached, []);
});

test('PreAGI distinguishes a full collection from returning it and restores progress', async t => {
  const editions = [
    ['mickey-s-space-adventure', 'mickey', 'b6ec04c91a05df374792872c4d4ce66d',
      26, { crystals: 9, completed: 0 }, 26, { completed: 1 }, { crystals: 0, completed: 0 }],
    ['troll-s-tale', 'troll', '62903f264b3d849be4214b3a5c42a2fa',
      6, { treasures: 16, completed: 0 }, 6, { completed: 1 }, { treasures: 0, completed: 0 }],
    ['winnie-the-pooh-in-the-hundred-acre-wood', 'winnie', '2e7900c1ccaa7671d65405f6d1efed30',
      2, { returned_objects: 10, missing_objects: 0 }, 58, {}, { returned_objects: 0, missing_objects: 10 }],
  ];
  for (const [slug, game_id, index_md5, beforeRoom, before, finalRoom, ending, reset] of editions) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id: 'agi', game_id, index_md5 };
      function accept(room_id, preagi) {
        tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1, banks: { preagi } });
        return tracker.report();
      }
      const pending = accept(beforeRoom, before);
      assert.equal(pending.completed, pending.total - 1);
      assert.equal(accept(finalRoom, { ...before, ...ending }).percent, 100);
      assert.equal(accept(beforeRoom, reset).percent, 0);
    });
  }
});

test('LucasArts snapshot maps recognize the documented endings', async t => {
  const cases = [
    ['maniac-mansion', 'maniac', 'e781230da44a44e2f0770edb2b3b3633', 0, { scumm_vars: { 101: 0, 108: 2, 138: 1, 152: 0, 162: 3 }, running_scripts: { 63: 1 } }],
    ['loom', 'loom', '5d88b9d6a88e6f8e90cded9d01b7f082', 51, { scumm_bit_bytes: { 6: 0, 12: 0, 13: 0, 14: 2 } }],
    ['the-secret-of-monkey-island', 'monkey', '2d1e891fe52df707c30185e52c50cd92', 89,
      { scumm_bit_bytes: { 6: 0, 9: 0, 10: 0, 11: 0, 49: 64, 56: 32 }, object_state: { 272: 1 }, running_scripts: { 138: 1 } }],
    ['monkey-island-2-lechuck-s-revenge', 'monkey2', '132bff65e6367c09cc69318ce1b59333', 110, { scumm_bit_bytes: { 6: 0, 8: 0, 40: 0, 42: 0, 45: 0 },
        object_state: { 519: 0 }, running_scripts: { 160: 1 } }],
    ['day-of-the-tentacle', 'tentacle', '4167a92a1d46baa4f4127d918d561f88', 88, { scumm_bit_bytes: { 1: 6, 2: 0, 3: 0, 4: 0, 5: 0, 10: 0, 32: 16, 43: 0 },
        object_state: { 225: 0, 545: 0, 596: 0 } }],
    ['sam-and-max-hit-the-road', 'samnmax', 'd917f311a448e3cc7239c31bddb00dd2', 90, {
      scumm_bit_bytes: { 4: 0, 8: 0, 9: 0, 20: 0, 27: 0 },
      object_state: { 522: 0, 523: 0, 524: 0, 525: 0, 839: 1 },
    }],
    ['full-throttle', 'ft', '09820417db26687bb7fe0c83cc4c553b', 153,
      { scumm_bit_bytes: { 8: 128, 9: 3, 34: 128, 38: 128, 39: 1 }, running_scripts: { 439: 1 } }],
    ['the-dig', 'dig', 'd8323015ecb8b10bf53474f6e6b0ae33', 110, { scumm_bit_bytes: { 5: 0, 6: 0, 14: 0, 20: 0, 21: 0, 29: 16 } }],
    ['the-curse-of-monkey-island', 'comi', 'fe60d6b5ff51b0553ac59963123b5777', 86, { scumm_bit_bytes: { 3: 0, 5: 0, 14: 0, 19: 0, 22: 0, 59: 0, 84: 1 }, object_state: { 1299: 2 } }],
    ['grim-fandango', 'grim', '444f05f2af689c1bffd179b8b6a632bd', null,
      { puzzle_flags: Object.assign(Array(64).fill(0), { 55: 1 }), story_state: { final_cutscene_unlocked: 1 } }, 'grim'],
    ['escape-from-monkey-island', 'monkey4', '61959da91d864bf5f4588daa4a5a3019', null,
      { story_state: { broke_catapult: 1, guybrush_read_marley_letter: 1, caught_pegnose: 1,
        curr_act: 3, been_in_lua_bar: 1, rock_beach: 1, rock_canyon: 1, rock_lava: 1, credits_end_game: 2 } }, 'grim'],
  ];
  for (const [slug, game_id, index_md5, room_id, banks, engine_id = 'scumm'] of cases) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id, game_id, index_md5 };
      const empty = Object.fromEntries(Object.entries(banks).map(([bank, values]) =>
        [bank, Object.fromEntries(Object.keys(values).map(key => [key, 0]))]));
      tracker.acceptSnapshot(identity, { room_id: 1, sample_time_ms: 1, banks: empty });
      assert.equal(tracker.report().percent, 0);
      const ending = { room_id, sample_time_ms: 2, banks };
      tracker.acceptSnapshot({ ...identity, index_md5: '0'.repeat(32) }, ending);
      assert.equal(tracker.report().reason, 'edition_mismatch');
      tracker.acceptSnapshot(identity, ending);
      assert.equal(tracker.report().percent, 100);
    });
  }
});

test('Full Throttle counts the repair parts independently and checks the credits against the turret outcome', () => {
  const tracker = trackerFor('full-throttle');
  const identity = { engine_id: 'scumm', game_id: 'ft', index_md5: '09820417db26687bb7fe0c83cc4c553b' };
  const accept = (room_id, bits, ending = 0) => {
    tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1, banks: {
      scumm_bit_bytes: Object.assign(Array(40).fill(0), bits), running_scripts: { 439: ending },
    } });
    return tracker.report();
  };
  assert.deepEqual(accept(19, { 9: 1 }).reached, ['delivered-forks']);
  assert.deepEqual(accept(19, { 8: 128, 9: 2 }).reached, ['delivered-gas', 'delivered-welding-torch']);
  assert.deepEqual(accept(65, { 39: 1 }).reached, ['corleys-will', 'loaded-will']);
  assert.equal(accept(153, { 34: 8 }, 1).won, false, 'The fire command is consumed before the real shot');
  assert.equal(accept(153, { 34: 128 }, 1).won, true);
});

test('Zak scores device parts in either order and starts with an empty device', () => {
  const tracker = trackerFor('zak-mckracken-and-the-alien-mindbenders');
  const identity = { engine_id: 'scumm', game_id: 'zak', index_md5: 'e94c7cc3686fce406d3c91b5eae5a72d' };
  const start = { 55: 1, 81: 3, 427: 10, 428: 10, 429: 11, 430: 10, 431: 11 };
  const accept = (parts = {}, ending = 0, detected = identity) => {
    tracker.acceptSnapshot(detected, { room_id: 25, sample_time_ms: 1, banks: {
      object_state: { ...start, ...parts }, running_scripts: { 66: 0, 149: ending },
    } });
    return tracker.report();
  };
  assert.deepEqual(accept().reached, []);
  assert.deepEqual(accept({ 431: 1, 430: 0 }).reached, ['installed-white-crystal', 'installed-blue-crystal']);
  assert.deepEqual(accept({ 429: 1 }).reached, ['installed-yellow-crystal']);
  const finished = accept({}, 1);
  assert.equal(finished.won, true);
  assert.ok(finished.reached.includes('installed-yellow-crystal'));
  assert.ok(!finished.reached.includes('learned-yellow-crystal'));
  assert.deepEqual(accept().reached, []);
  assert.equal(accept({}, 1, { ...identity, index_md5: '0'.repeat(32) }).reason, 'edition_mismatch');
});

test('Maniac Mansion distinguishes the publishing, Meteor Police and trunk routes', () => {
  const tracker = trackerFor('maniac-mansion');
  const identity = { engine_id: 'scumm', game_id: 'maniac', index_md5: 'e781230da44a44e2f0770edb2b3b3633' };
  const accept = (values = {}, victory = 0, room_id = 2) => {
    tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1, banks: {
      scumm_vars: Object.assign(Array(163).fill(0), values), running_scripts: { 63: victory },
    } });
    return tracker.report();
  };
  assert.deepEqual(accept().reached, [], 'The pool room is not the entrance');
  assert.deepEqual(accept({ 101: 4, 108: 2, 138: 1 }, 1).reached,
    ['entered-mansion', 'earned-meteor-contract', 'freed-dr-fred', 'offered-meteor-contract', 'winning-ending']);
  assert.deepEqual(accept({ 162: 3 }, 1).reached, ['meteor-police-arrest', 'winning-ending']);
  assert.deepEqual(accept({ 152: 1 }).reached, [], 'The car can launch without the meteor');
  assert.deepEqual(accept({ 152: 1, 162: 2 }, 1).reached,
    ['detached-meteor', 'loaded-meteor-in-trunk', 'launched-meteor-in-car', 'winning-ending']);
});

test('Monkey Island 2 tracks the map pieces independently and after Wally takes them', () => {
  const tracker = trackerFor('monkey-island-2-lechuck-s-revenge');
  const identity = { engine_id: 'scumm', game_id: 'monkey2', index_md5: '132bff65e6367c09cc69318ce1b59333' };
  const accept = (bits, antiques = 0, room_id = 8) => {
    tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1, banks: {
      scumm_bit_bytes: Object.assign(Array(46).fill(0), bits),
      object_state: { 519: antiques }, running_scripts: { 160: 0 },
    } });
    return tracker.report().reached;
  };
  assert.deepEqual(accept({ 40: 2, 45: 64 }), ['map-pieces', 'coffin-map-piece']);
  assert.deepEqual(accept({ 40: 2, 8: 32 }, 1), ['map-pieces', 'mansion-map-piece', 'antiques-map-piece']);
  assert.deepEqual(accept({ 40: 2, 6: 128 }), ['map-pieces', 'dog-map-piece']);
  assert.deepEqual(accept({ 42: 32 }), ['map-pieces', 'coffin-map-piece', 'mansion-map-piece',
    'antiques-map-piece', 'dog-map-piece', 'delivered-map-pieces']);
  assert.deepEqual(accept({}, 0, 110), [], 'The epilogue room without the confrontation is not enough');
});

test('Day of the Tentacle scores the two machines and human show results independently', () => {
  const tracker = trackerFor('day-of-the-tentacle');
  const identity = { engine_id: 'scumm', game_id: 'tentacle', index_md5: '4167a92a1d46baa4f4127d918d561f88' };
  const accept = (bits, object_state = { 225: 0, 545: 0, 596: 2 }) => {
    tracker.acceptSnapshot(identity, { room_id: 29, sample_time_ms: 1, banks: {
      scumm_bit_bytes: Object.assign(Array(44).fill(0), bits), object_state,
    } });
    return tracker.report().reached;
  };
  assert.deepEqual(accept({}), []);
  assert.deepEqual(accept({ 1: 2 }), ['powered-hoagies-chron-o-john']);
  assert.deepEqual(accept({ 1: 4 }), ['started-hamster-generator', 'connected-generator-cord',
    'connected-chron-o-john-cord', 'powered-lavernes-chron-o-john']);
  assert.deepEqual(accept({ 3: 4, 10: 8 }), ['disqualified-harold', 'won-best-smile']);
  assert.deepEqual(accept({ 3: 4, 10: 2 }), ['disqualified-harold', 'won-best-hair']);
  assert.deepEqual(accept({}, { 225: 1, 545: 0, 596: 2 }), ['signed-contract', 'funded-diamond', 'replaced-diamond']);
});

test('Monkey Island tracks trials in either order and recovers their credit from a ship or island save', () => {
  const tracker = trackerFor('the-secret-of-monkey-island');
  const identity = { engine_id: 'scumm', game_id: 'monkey', index_md5: '2d1e891fe52df707c30185e52c50cd92' };
  const accept = (room_id, trials = 0, memo = 0) => {
    tracker.acceptSnapshot(identity, { room_id, sample_time_ms: 1, banks: {
      scumm_bit_bytes: Object.assign(Array(57).fill(0), { 10: trials }),
      object_state: { 272: memo }, running_scripts: { 138: 0 },
    } });
    return tracker.report().reached;
  };

  assert.deepEqual(accept(64, 0x40), ['completed-treasure-trial']);
  assert.deepEqual(accept(42, 0x60), ['completed-theft-trial', 'completed-treasure-trial']);
  assert.deepEqual(accept(61, 0x10), ['completed-sword-trial']);
  assert.deepEqual(accept(42, 0x30), ['completed-sword-trial', 'completed-theft-trial']);
  assert.equal(accept(8).at(-1), 'departed-melee');
  assert.deepEqual(accept(24, 0, 1).slice(0, 3),
    ['completed-sword-trial', 'completed-theft-trial', 'completed-treasure-trial']);
  assert.equal(accept(24, 0, 1).at(-1), 'reached-monkey-island');
  assert.deepEqual(accept(1), []);
});

test('Beneath a Steel Sky scores saved script variables and the winning credits room', () => {
  const tracker = trackerFor('beneath-a-steel-sky');
  const identity = { engine_id: 'sky', game_id: 'sky' };
  const vars = Array(838).fill(0);
  let sampleTime = 0;
  const accept = (room_id, completed, changes = {}, message) => {
    Object.assign(vars, changes);
    tracker.acceptSnapshot(identity, { room_id, sample_time_ms: ++sampleTime, banks: { script_vars: vars } });
    assert.equal(tracker.report().completed, completed, message);
  };

  accept(0, 0, { 640: 1 });
  assert.equal(tracker.report().total, 35);
  accept(2, 1, { 125: 42 });
  accept(4, 2, { 420: 42 });
  accept(12, 3, { 440: 42 });
  accept(7, 4, { 268: 42 }, 'Cutting the cable leaves it to be picked up');
  accept(29, 5, { 268: 69 });
  accept(14, 6, { 451: 42 });
  accept(20, 7, { 483: 42 });
  accept(14, 7, { 258: 1 }, 'A promised jammer is still pending');
  accept(14, 8, { 258: 42 });
  accept(10, 9, { 335: 42 });
  accept(26, 9, { 256: 1 }, 'Arranging surgery leaves the port uninstalled');
  accept(26, 10, { 256: 42 });
  accept(92, 11, { 519: 24829 }, 'The report can be decrypted first');
  accept(92, 12, { 523: 24830 });
  accept(92, 13, { 515: 24828 });
  accept(10, 14, { 480: 1 });
  accept(31, 15, { 348: 1 });
  accept(26, 16, { 787: 42 });
  accept(40, 17, { 822: 1 });
  accept(38, 18, { 814: 1 });
  accept(37, 20, { 810: 1, 813: 1, 814: 2 }, 'Loosening the grille leaves the passage closed');
  assert.ok(!tracker.report().reached.includes('subway-passage'));
  accept(65, 21, { 813: 2 });
  accept(67, 22, { 681: 1 });
  accept(72, 23, { 698: 1 });
  accept(73, 24, { 702: 1 }, 'The circuit board can be taken before the red card');
  assert.ok(!tracker.report().reached.includes('red-linc-card'));
  accept(73, 25, { 703: 1 });
  accept(94, 26, { 640: 0 });
  accept(95, 27, { 641: 1 });
  accept(74, 28, { 642: 1 });
  accept(76, 29, { 713: 1 });
  accept(76, 30, { 714: 1 });
  accept(75, 31, { 706: 1 });
  accept(80, 33, { 719: 2, 707: 1 }, 'Infected tissue still needs to be applied to LINC');
  accept(85, 33, {}, 'The credits room alone does not prove the final action');
  accept(81, 34, { 707: 2 });
  accept(82, 34);
  accept(102, 34, {}, 'The death screen does not complete the game');
  accept(85, 35);
  assert.equal(tracker.report().percent, 100);
  vars.fill(0);
  accept(4, 2, { 125: 42, 420: 42, 640: 1 }, 'Restoring an earlier save rebuilds the score');
});
