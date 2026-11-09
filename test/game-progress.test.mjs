import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync, gzipSync, gunzipSync } from 'node:zlib';
import { generateGameProgress } from '../scripts/generate-game-progress.mjs';
import { readQueenSaveSnapshot } from '../lib/game-progress/queen-save.mjs';

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

test('Queen scores transient writes, restores and the credits cutaway', () => {
  const tracker = trackerFor('flight-of-the-amazon-queen');
  const baseline = (native_time_ms, values = {}) => ({
    event: 'game_variables_baseline', native_time_ms,
    banks: { game_state: Object.assign(Array(211).fill(0), values) },
  });
  const six = { 3: 1, 101: 1, 123: 2, 41: 2, 67: 2, 105: 1 };
  tracker.accept('queen', [state(67, 2)], [baseline(1, six)]);
  assert.equal(tracker.report().percent, 96);
  tracker.accept('queen', [state(70, 4)], [baseline(3)]);
  assert.deepEqual(tracker.report().reached, []);
  const crossing = { event: 'game_variables_change', native_time_ms: 5,
    bank: 'game_state', index: 101, previous: 0, value: 1 };
  tracker.accept('queen', [state(21, 7)], [crossing, { ...crossing, native_time_ms: 6, previous: 1, value: 0 }]);
  assert.equal(tracker.report().reached.at(-1), 'jungle-crossing');
  tracker.accept('queen', [state(110, 10, false)], [baseline(8, six)]);
  assert.equal(tracker.report().completed, 24);
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
  save.writeInt16BE(1, 22440 + 3 * 2); // Hotel escape is persisted in native slot 3.
  save.writeInt16BE(-2, 22440 + 34 * 2);
  for (const encoded of [save, gzipSync(save), deflateSync(save)]) {
    const snapshot = await readQueenSaveSnapshot(encoded.toString('base64'));
    assert.equal(snapshot.room_id, 21);
    assert.equal(snapshot.banks.game_state[34], -2);
    tracker.acceptSnapshot(identity, snapshot);
    assert.equal(tracker.report().percent, 13);
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
  assert.equal(tracker.report().completed, 19);
  accept(94, 3, [outcome(3, 0, 2)]);
  assert.equal(tracker.report().completed, 19);
  accept(82, 4, [outcome(4, 2, 4)]);
  assert.equal(tracker.report().completed, 19, 'An outcome update must not match the previous credits room');
  accept(94, 5, []);
  assert.equal(tracker.report().completed, 20);
  assert.equal(tracker.nextMilestone, null);
  globals.fill(0);
  objects[156] = 1;
  accept(22, 6, [baseline(6)]);
  assert.equal(tracker.report().completed, 7);
  assert.equal(tracker.nextMilestone, 'Got inside Castle Brunwald');
  objects[156] = 0;
  accept(22, 7, [baseline(7)]);
  assert.equal(tracker.report().completed, 0);
  accept(22, 10, [
    { event: 'game_variables_change', native_time_ms: 8, bank: 'object_state', index: 156, previous: 0, value: 1 },
    { event: 'game_variables_change', native_time_ms: 9, bank: 'object_state', index: 156, previous: 1, value: 0 },
  ]);
  assert.equal(tracker.report().completed, 7, 'A bank-only branch can match between room samples');
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
  accept(24, 10);
  assert.equal(tracker.report().completed, 21, 'Death retains prior progress');
  accept(96, 11);
  assert.equal(tracker.report().completed, 21, 'The ending room alone cannot grant completion');
  accept(25, 12, [{ event: 'game_variables_change', native_time_ms: 12,
    bank: 'scumm_bit_bytes', index: 4, previous: 0, value: 0x10 }]);
  assert.equal(tracker.report().completed, 21, 'Starting the escape cannot grant completion');
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
  const funded = { ...start, beenMugged: 1, talkedToSparky: 1, card1Money: 12432 };
  accept(8, funded);
  assert.equal(tracker.report().completed, 3);
  const paid = { ...funded, talkedToAttendant: 1, talkedToBoss: 1, gunPassFlag: 1, card1Money: 10432 };
  accept(23, paid);
  assert.equal(tracker.report().completed, 5, 'Payment precedes the gun release');
  accept(0, { ...paid, gunPassFlag: 2, talkedToRecep: 1, cardPassFlag: 1 });
  assert.equal(tracker.report().completed, 7, 'Payment precedes the hotel keycard');
  accept(0, { ...paid, gunPassFlag: 2, talkedToRecep: 1, cardPassFlag: 2, card1Money: 2132 });
  assert.equal(tracker.report().completed, 8);
  accept(24, { ...start, rockstarDead: 1, generalDead: 2, sartainDead: 2 });
  assert.equal(tracker.report().completed, 11, 'Aftermath states still count as completed targets');
  const altar = { ...start, rockstarDead: 1, generalDead: 2, sartainDead: 2, aideDead: 1, canMoveAltar: 1 };
  accept(9, altar);
  assert.equal(tracker.report().completed, 13);
  accept(14, { ...altar, manDead: 2 });
  assert.equal(tracker.report().completed, 14);
  accept(14, { ...altar, madmanFlag: 1 });
  assert.equal(tracker.report().percent, 100);
  accept(9, altar);
  assert.equal(tracker.report().completed, 13, 'Loading before the subway drops credit for later milestones');
  accept(0, start);
  assert.equal(tracker.report().completed, 0);
});

test('Elvira II scores the winning branch separately from a late ritual failure', () => {
  const tracker = trackerFor('elvira-ii-the-jaws-of-cerberus');
  const identity = { engine_id: 'agos', game_id: 'elvira2', index_md5: 'a144d2467e1addee1f705647dacd33df' };
  let sampleTime = 0;
  const accept = (studios, stage, outcome, detected = identity) => {
    const vars = Array(255).fill(0);
    vars[180] = studios;
    vars[186] = stage;
    const banks = outcome === undefined ? { vars } : { vars, elvira2_outcome: { ritual: outcome } };
    tracker.acceptSnapshot(detected, { room_id: null, sample_time_ms: ++sampleTime, banks });
    return tracker.report();
  };

  assert.equal(accept(0, 0, 0).completed, 0);
  assert.equal(accept(1, 0, 0).completed, 1);
  assert.equal(accept(2, 0, 0).completed, 2);
  assert.equal(accept(3, 0, 0).reached.at(-1), 'rescued-elvira');
  assert.equal(accept(3, 1, 0).reached.at(-1), 'summoned-cerberus');
  assert.equal(accept(3, 2, 0).reached.at(-1), 'bound-cerberus');
  assert.equal(accept(3, 3, 0).completed, 6, 'Lance use precedes the winning script');
  assert.equal(accept(3, 3, 2).completed, 6, 'Late failure shares the same ritual stage');
  assert.equal(accept(3, 20, 2).completed, 3, 'Early failure clears the ritual stage');
  assert.equal(accept(3, 3, 1).reached.at(-1), 'winning-ending');
  assert.equal(accept(0, 0, 1).percent, 100, 'The scripted Start load resets vars during the winning sequence');
  assert.equal(accept(2, 0, 0).completed, 2, 'A restore uses the current save timeline');
  assert.equal(accept(3, 3).reason, 'missing_game_variables');
  assert.equal(accept(3, 3, 1, { ...identity, index_md5: undefined }).reason, 'edition_mismatch');
  assert.equal(accept(3, 3, 1, { ...identity, index_md5: '0'.repeat(32) }).reason, 'edition_mismatch');
});

test('Sierra maps match their edition and distinguish the winning branches', async t => {
  const editions = [
    ['space-quest-the-sarien-encounter', 'agi', 'sq1', '0b216d931e95750f1f4837d6a4b821e5', 64, {}, 43],
    ['space-quest-the-sarien-encounter-sq1sci', 'sci', 'sq1sci', '1dd1b7c042f0c7345730a94633d283fe', 2, { globals: { 12: 68 } }],
    ['space-quest-ii-chapter-ii-vohaul-s-revenge', 'agi', 'sq2', '28add5125484302d213911df60d2aded', 95, { flag_bytes: { 8: 16 } }],
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
    ['police-quest-in-pursuit-of-the-death-angel', 'agi', 'pq1', 'cfa93e5f2aa7378bddd10ad6746a2ffb', 104, {}, 103],
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
        : { globals: Array(256).fill(1) };
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
        [58, { 155: 256 }, ['found-first-treasure']],
        [77, { 154: 256, 155: 256 }, ['found-first-treasure', 'found-second-treasure']],
        [51, { 154: 256, 155: 2304 }, ['found-first-treasure', 'found-second-treasure', 'found-all-treasures']],
        [85, { 12: 53, 154: 256, 155: 2304 }, ['found-first-treasure', 'found-second-treasure', 'found-all-treasures', 'winning-ending']],
        [1, {}, []],
      ],
    },
    {
      slug: 'king-s-quest-vii-the-princeless-bride', engine: 'sci', game: 'kq7', md5: 'a000858d91155b948bf3b23fa71ff79a',
      steps: [
        [1000, { 122: 0 }, []],
        [3000, { 122: 2 }, ['reached-chapter-2', 'reached-chapter-3']],
        [1000, { 122: 0 }, []],
      ],
    },
    {
      slug: 'laura-bow-2-the-dagger-of-amon-ra', engine: 'sci', game: 'laurabow2', md5: 'eb41961ba4446d6f484edb9de91224b3',
      steps: [
        [750, {}, ['reached-inquest']],
        [780, { 12: 790, 126: 2 }, []],
        [780, { 12: 785, 126: 3 }, []],
        [780, { 12: 785, 126: 1 }, ['reached-inquest', 'solved-murders', 'winning-ending']],
        [780, { 12: 785, 126: 4 }, ['reached-inquest', 'solved-murders', 'winning-ending']],
      ],
    },
    {
      slug: 'conquests-of-the-longbow-the-legend-of-robin-hood', engine: 'sci', game: 'longbow', md5: '52944b462328558070bf02fb371618e2',
      steps: [
        [420, {}, ['tunnels', 'fulk-rescue', 'judgement']],
        [97, { 12: 801 }, []],
        [97, { 12: 421, 151: 20 }, []],
        [97, { 12: 421, 151: 10 }, ['tunnels', 'fulk-rescue', 'judgement', 'winning-ending']],
      ],
    },
    {
      slug: 'mixed-up-mother-goose', engine: 'agi', game: 'mixedup', md5: 'e524655abf9b96a3b179ffcd1d0f79af',
      steps: [
        [32, { 3: 0 }, []],
        [13, { 3: 7 }, ['restored-six-rhymes']],
        [15, { 3: 16 }, ['restored-six-rhymes', 'restored-twelve-rhymes']],
        [37, { 3: 18 }, ['restored-six-rhymes', 'restored-twelve-rhymes', 'winning-ending']],
        [32, { 3: 0 }, []],
      ],
    },
  ];
  for (const { slug, engine, game, md5, steps } of cases) {
    await t.test(slug, () => {
      const tracker = trackerFor(slug);
      const identity = { engine_id: engine, game_id: game, index_md5: md5 };
      let time = 0;
      for (const [room, values, expected] of steps) {
        const bank = Object.assign(Array(256).fill(0), values);
        const banks = engine === 'agi' ? { vars: bank, flag_bytes: Array(32).fill(0) } : { globals: bank };
        tracker.acceptSnapshot(identity, { room_id: room, sample_time_ms: ++time, banks });
        assert.deepEqual(tracker.report().reached, expected);
      }
    });
  }
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
  assert.equal(tracker.report().total, 28);
  accept(2, 1, { 125: 42 });
  accept(4, 2, { 420: 42 });
  accept(12, 3, { 440: 42 });
  accept(7, 4, { 268: 42 }, 'Cutting the cable leaves it to be picked up');
  accept(29, 5, { 268: 69 });
  accept(14, 6, { 451: 42 });
  accept(14, 6, { 258: 1 }, 'A promised jammer is still pending');
  accept(14, 7, { 258: 42 });
  accept(10, 8, { 335: 42 });
  accept(26, 8, { 256: 1 }, 'Arranging surgery leaves the port uninstalled');
  accept(26, 9, { 256: 42 });
  accept(92, 9, { 515: 24828, 519: 24829, 523: 24643 }, 'All three documents must be decrypted');
  accept(92, 10, { 523: 24830 });
  accept(10, 11, { 480: 1 });
  accept(31, 12, { 348: 1 });
  accept(26, 13, { 787: 42 });
  accept(40, 14, { 822: 1 });
  accept(37, 15, { 810: 1, 813: 1 }, 'Loosening the grille leaves the passage closed');
  accept(65, 16, { 813: 2 });
  accept(67, 17, { 681: 1 });
  accept(72, 18, { 698: 1 });
  accept(73, 19, { 703: 1 });
  accept(73, 20, { 702: 1 });
  accept(94, 21, { 640: 0 });
  accept(95, 22, { 641: 1 });
  accept(74, 23, { 642: 1 });
  accept(76, 24, { 713: 1 });
  accept(76, 25, { 714: 1 });
  accept(80, 26, { 719: 2, 707: 1 }, 'Infected tissue still needs to be applied to LINC');
  accept(81, 27, { 707: 2 });
  accept(82, 27);
  accept(102, 27, {}, 'The death screen does not complete the game');
  accept(85, 28);
  assert.equal(tracker.report().percent, 100);
  vars.fill(0);
  accept(4, 2, { 125: 42, 420: 42, 640: 1 }, 'Restoring an earlier save rebuilds the score');
});
