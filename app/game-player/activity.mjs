import { playHistoryPrefix, readPlayHistory } from "./play-history.mjs";
import { readStoryProgressRecord, storyProgressPrefix } from "./story-progress.mjs";

const deviceKey = "scummweb.activity-device.v1";
export const activityCacheKey = "scummweb.dropbox-activity.v1";
export const activityUpdatedEvent = "scummweb:activity-updated";
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const slug = /^[a-z0-9][a-z0-9-]{0,159}$/;
const catalog = /^catalog:[a-z0-9][a-z0-9_-]{0,127}$/;
const edition = /^edition:[a-f0-9]{64}$/;
const versionedSource = /^source:([a-f0-9-]{36}):([a-f0-9]{64})$/;

export function sourceActivityVersion(source) {
  return `source:${source.id}${source.activityVersioned ? `:${source.fingerprint}` : ""}`;
}

function sourceIdentity(source) {
  return !source.url && uuid.test(source.id) && hash.test(source.fingerprint)
    ? `edition:${source.fingerprint}` : null;
}

export function preserveSourceActivity(scope, source) {
  if (source.activityVersioned || !sourceIdentity(source)) return;
  const previous = sourceActivityVersion(source);
  const next = sourceActivityVersion({ ...source, activityVersioned: true });
  try {
    for (const prefix of [playHistoryPrefix, storyProgressPrefix]) {
      const stored = scope.localStorage.getItem(prefix + previous);
      if (stored && !scope.localStorage.getItem(prefix + next)) scope.localStorage.setItem(prefix + next, stored);
    }
  } catch { /* Reconnecting an archive still works if local storage is unavailable. */ }
}

function validIdentity(identity) {
  return typeof identity === "string" && (catalog.test(identity) || edition.test(identity));
}

export function activityDevice(storage, create = false) {
  const existing = storage.getItem(deviceKey);
  if (uuid.test(existing)) return existing;
  if (!create) return null;
  const id = crypto.randomUUID();
  storage.setItem(deviceKey, id);
  return id;
}

export function collectLocalActivity(scope, device, sources) {
  const sourceKeys = new Map(sources.filter(sourceIdentity).map((source) => [sourceActivityVersion(source), source]));
  const play = [], progress = [];
  for (let index = 0; index < scope.localStorage.length; index++) {
    const key = scope.localStorage.key(index);
    const isPlay = key?.startsWith(playHistoryPrefix);
    if (!isPlay && !key?.startsWith(storyProgressPrefix)) continue;
    const version = key.slice((isPlay ? playHistoryPrefix : storyProgressPrefix).length);
    const source = sourceKeys.get(version);
    const storedSource = versionedSource.exec(version);
    const imported = source ?? (storedSource && { id: storedSource[1], fingerprint: storedSource[2] });
    const identity = imported ? sourceIdentity(imported) : catalog.test(version) ? version : null;
    if (!identity) continue;
    if (isPlay) {
      const history = readPlayHistory(scope, version);
      if (history) play.push([identity, imported ? `${device}:${imported.id}` : device, history.playedMs, history.lastPlayedAt]);
    } else {
      const story = readStoryProgressRecord(scope, version);
      if (story && slug.test(story.slug) && hash.test(story.revision)) progress.push([identity, story.slug, story.revision, story.percent]);
    }
  }
  return { version: 1, play, progress };
}

export function validateActivity(data) {
  const validTime = (value) => Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;
  function validPlay(row) {
    if (!Array.isArray(row) || row.length !== 4) return false;
    const [identity, contributor, duration, date] = row;
    if (!validIdentity(identity) || typeof contributor !== "string") return false;
    const ids = contributor.split(":");
    return ids.length === (edition.test(identity) ? 2 : 1) && ids.every((id) => uuid.test(id))
      && Number.isSafeInteger(duration) && duration >= 0 && validTime(date);
  }
  function validProgress(row) {
    if (!Array.isArray(row) || row.length !== 4) return false;
    const [identity, gameSlug, revision, percent] = row;
    return validIdentity(identity) && typeof gameSlug === "string" && slug.test(gameSlug)
      && typeof revision === "string" && hash.test(revision) && Number.isInteger(percent) && percent >= 0 && percent <= 100;
  }
  if (data?.version !== 1 || !Array.isArray(data.play) || !Array.isArray(data.progress)
    || !data.play.every(validPlay) || !data.progress.every(validProgress)) throw new Error("Invalid Dropbox activity data.");
  return { version: 1, play: data.play, progress: data.progress };
}

export function mergeActivity(...documents) {
  const play = new Map(), progress = new Map();
  for (const data of documents) {
    for (const [identity, contributor, duration, date] of data.play) {
      const key = `${identity}/${contributor}`;
      const previous = play.get(key);
      play.set(key, [identity, contributor, Math.max(duration, previous?.[2] ?? 0), Math.max(date, previous?.[3] ?? 0)]);
    }
    for (const [identity, gameSlug, revision, percent] of data.progress) {
      const key = `${identity}/${gameSlug}/${revision}`;
      if (!progress.has(key) || progress.get(key)[3] < percent) progress.set(key, [identity, gameSlug, revision, percent]);
    }
  }
  const sorted = (rows) => [...rows.keys()].sort().map((key) => rows.get(key));
  return { version: 1, play: sorted(play), progress: sorted(progress) };
}

export function readActivityCache(storage, account) {
  try {
    const entry = JSON.parse(storage.getItem(activityCacheKey));
    if (account && entry?.account === account) return validateActivity(entry.data);
  } catch { /* The library can fall back to local play history. */ }
  return null;
}

export function indexActivity(data, device) {
  const histories = new Map(), progress = new Map(), local = new Map();
  for (const [identity, contributor, duration, date] of data.play) {
    const previous = histories.get(identity);
    histories.set(identity, {
      playedMs: Math.min(Number.MAX_SAFE_INTEGER, (previous?.playedMs ?? 0) + duration),
      lastPlayedAt: Math.max(previous?.lastPlayedAt ?? 0, date),
    });
    if (device && (contributor === device || contributor.startsWith(`${device}:`))) local.set(`${identity}/${contributor}`, duration);
  }
  for (const [identity, gameSlug, revision, percent] of data.progress) progress.set(`${identity}/${gameSlug}/${revision}`, percent);
  return { histories, local, progress, device };
}

export function versionActivity(scope, version, synced, revision) {
  const { source, game } = version;
  const key = source ? sourceActivityVersion(source) : version.key;
  const identity = source ? sourceIdentity(source) : version.key;
  let history = readPlayHistory(scope, key);
  const story = readStoryProgressRecord(scope, key);
  let percent = revision && story?.slug === game.slug && story.revision === revision ? story.percent : null;
  const cloud = synced?.histories.get(identity);
  if (cloud) {
    // The local counter includes earlier checkpoints already in the cloud.
    const contributor = source ? `${synced.device}:${source.id}` : synced.device;
    const published = synced.local.get(`${identity}/${contributor}`) ?? 0;
    const extra = Math.max(0, (history?.playedMs ?? 0) - published);
    history = { playedMs: Math.min(Number.MAX_SAFE_INTEGER, cloud.playedMs + extra),
      lastPlayedAt: Math.max(cloud.lastPlayedAt, history?.lastPlayedAt ?? 0) };
  }
  const cloudPercent = synced?.progress.get(`${identity}/${game.slug}/${revision}`);
  if (cloudPercent !== undefined) percent = Math.max(cloudPercent, percent ?? 0);
  return { history, percent };
}

export function mergeRecentActivity(scope, groups, recentTargets, synced, getRevision) {
  const dates = new Map(recentTargets.map((target) => [target, 0]));
  for (const { versions } of groups) {
    for (const version of versions) {
      const target = version.source ? `source:${version.source.id}` : version.game.target;
      const identity = version.source ? sourceIdentity(version.source) : version.key;
      const revision = getRevision(version);
      const hasSyncedProgress = synced.progress.has(`${identity}/${version.game.slug}/${revision}`);
      if (!dates.has(target) && !synced.histories.has(identity) && !hasSyncedProgress) continue;
      const { history } = versionActivity(scope, version, synced, revision);
      dates.set(target, history?.lastPlayedAt ?? 0);
    }
  }
  return [...dates.keys()].sort((a, b) => dates.get(b) - dates.get(a));
}
