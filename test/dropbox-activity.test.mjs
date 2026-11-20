import assert from "node:assert/strict";
import test from "node:test";
import { activityCacheKey, activityDevice, indexActivity, mergeRecentActivity, preserveSourceActivity, readActivityCache, sourceActivityVersion,
  versionActivity } from "../app/game-player/activity.mjs";
import { addPlayedTime, readLocalActivity, updateStoryMilestone } from "../app/game-player/activity-storage.mjs";
import { createDropboxActivityClient, syncPlayActivity } from "../app/dropbox/activity-sync.mjs";
import { indexedDbFixture, memoryStorage } from "./helpers/dropbox-fixtures.mjs";

const revision = "a".repeat(64);
const game = { key: "catalog:sky", game: { target: "sky", slug: "beneath-a-steel-sky" } };

function dropbox() {
  let current, rev = 0;
  const provider = { conflicts: 0, loseNextReply: false };
  const pathError = (tag) => Response.json({ error: { ".tag": "path", path: { ".tag": tag } } }, { status: 409 });
  provider.client = createDropboxActivityClient("test-token", async (url, options) => {
    const argument = JSON.parse(options.headers["Dropbox-API-Arg"]);
    assert.equal(argument.path, "/play-activity-v1.json");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    if (url === "https://content.dropboxapi.com/2/files/download") {
      return current ? new Response(current, { headers: { "Dropbox-API-Result": JSON.stringify({ rev: String(rev).padStart(9, "0") }) } })
        : pathError("not_found");
    }
    assert.equal(url, "https://content.dropboxapi.com/2/files/upload");
    assert.equal(argument.autorename, false);
    assert.equal(argument.strict_conflict, true);
    const content = await options.body.text();
    if (rev ? argument.mode?.update !== String(rev).padStart(9, "0") : argument.mode !== "add") {
      provider.conflicts++;
      return pathError("conflict");
    }
    current = content;
    rev++;
    if (provider.loseNextReply) {
      provider.loseNextReply = false;
      throw new Error("connection lost after commit");
    }
    return Response.json({});
  });
  provider.setRemote = (value) => { current = JSON.stringify(value); rev++; };
  return provider;
}

function browser(client, sources = []) {
  const storage = memoryStorage();
  const scope = Object.assign(new EventTarget(), { localStorage: storage, indexedDB: indexedDbFixture() });
  const controller = new AbortController();
  const sync = () => syncPlayActivity({ client, account: "test-account", scope, sources,
    signal: controller.signal, check: () => controller.signal.throwIfAborted() });
  const record = (elapsed, date, percent, version = game) => {
    const key = version.source ? sourceActivityVersion(version.source) : version.key;
    return Promise.all([addPlayedTime(scope, key, elapsed, date),
      updateStoryMilestone(scope, key, { slug: version.game.slug, revision, percent })]);
  };
  const index = () => indexActivity(readActivityCache(storage, "test-account"), activityDevice(storage));
  const display = async (version = game, map = revision) => versionActivity(await readLocalActivity(scope), version, index(), map);
  return { scope, storage, sync, record, display, index, controller };
}

test("two devices converge under concurrent upload and lost replies without double-counting local time", async () => {
  const provider = dropbox();
  const a = browser(provider.client), b = browser(provider.client), fresh = browser(provider.client);
  await Promise.all([a.record(60_000, 100, 30), b.record(120_000, 200, 10)]);
  await Promise.all([a.sync(), b.sync()]);
  assert.ok(provider.conflicts > 0);
  await Promise.all([a.sync(), b.sync(), fresh.sync()]);
  const expected = { history: { playedMs: 180_000, lastPlayedAt: 200 }, percent: 30 };
  for (const device of [a, b, fresh]) assert.deepEqual(await device.display(), expected);
  const freshRecords = await readLocalActivity(fresh.scope);
  assert.deepEqual(mergeRecentActivity(freshRecords, [{ versions: [game] }], [], fresh.index(), () => revision), ["sky"]);
  assert.equal(freshRecords.size, 0, "remote data never becomes a local contribution");
  assert.equal(readActivityCache(fresh.storage, "different-account"), null);

  await a.record(60_000, 300, 42);
  assert.deepEqual(await a.display(), { history: { playedMs: 240_000, lastPlayedAt: 300 }, percent: 42 });
  provider.loseNextReply = true;
  await assert.rejects(a.sync(), /connection lost/);
  await a.sync();
  await fresh.sync();
  assert.deepEqual(await fresh.display(), await a.display());
  assert.equal((await fresh.display(game, "b".repeat(64))).percent, null);
});

test("imported copies match across different source IDs and stay separate after replacement", async () => {
  const { client } = dropbox();
  const first = { id: crypto.randomUUID(), fingerprint: "c".repeat(64) };
  const second = { id: crypto.randomUUID(), fingerprint: first.fingerprint };
  const replacement = { ...second, fingerprint: "d".repeat(64), activityVersioned: true };
  const edition = (source) => ({ ...game, key: `source:${source.id}`, source });
  const a = browser(client, [first]), b = browser(client, [second]), c = browser(client, [replacement]);
  await a.record(10_000, 100, 25, edition(first));
  await a.sync();
  await b.sync();
  assert.deepEqual(await b.display(edition(second)), { history: { playedMs: 10_000, lastPlayedAt: 100 }, percent: 25 });
  await c.record(15_000, 120, 70, edition(second));
  await preserveSourceActivity(c.scope, second);
  await c.sync();
  assert.deepEqual(await c.display(edition(replacement)), { history: null, percent: null });
  await a.sync();
  assert.deepEqual(await a.display(edition(first)), { history: { playedMs: 25_000, lastPlayedAt: 120 }, percent: 70 });
});

test("invalid cloud data and cancelled sync leave cached and local activity intact", async () => {
  const provider = dropbox();
  const a = browser(provider.client);
  await a.record(500, 100, 0);
  await a.sync();
  const cached = a.storage.getItem(activityCacheKey);
  provider.setRemote({ version: 2, play: [], progress: [] });
  await assert.rejects(a.sync(), /Invalid Dropbox activity/);
  assert.equal(a.storage.getItem(activityCacheKey), cached);
  a.controller.abort();
  await assert.rejects(a.sync(), { name: "AbortError" });
  assert.equal((await a.display()).history.playedMs, 500);
  assert.equal((await a.display()).percent, 0);
});

test("migrated history continues the existing Dropbox contribution", async () => {
  const provider = dropbox();
  const a = browser(provider.client);
  const device = activityDevice(a.storage, true);
  a.storage.setItem("scummweb.play-history.v1:" + game.key, JSON.stringify({ playedMs: 130, lastPlayedAt: 100 }));
  a.storage.setItem("scummweb.story-progress.v1:" + game.key, JSON.stringify({ slug: game.game.slug, revision, percent: 20 }));
  provider.setRemote({ version: 1, play: [[game.key, device, 90, 80]], progress: [] });
  await a.sync();
  await a.record(10, 110, 10);
  await a.sync();
  const { data } = await provider.client.read(new AbortController().signal);
  assert.deepEqual(data.play, [[game.key, device, 140, 110]]);
  assert.deepEqual(data.progress, [[game.key, game.game.slug, revision, 20]]);
});
