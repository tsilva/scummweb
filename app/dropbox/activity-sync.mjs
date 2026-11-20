import { activityCacheKey, activityDevice, activityUpdatedEvent, collectLocalActivity, mergeActivity, readActivityCache,
  validateActivity } from "../game-player/activity.mjs";
import { limitedBlob } from "./client.mjs";
import { readLocalActivity } from "../game-player/activity-storage.mjs";

const path = "/play-activity-v1.json";
const maxBytes = 512 * 1024;
const revisionPattern = /^[a-f0-9]{9,}$/;

// Activity uses Dropbox revisions for concurrent writers. Keep this separate
// from the native save snapshot directory so older clients can still sync saves.
export function createDropboxActivityClient(token, fetcher = fetch) {
  function request(operation, argument, signal, body) {
    signal.throwIfAborted();
    return fetcher(`https://content.dropboxapi.com/2/files/${operation}`, {
      method: "POST", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path, ...argument }),
        ...(body && { "Content-Type": "application/octet-stream" }) }, body,
    });
  }
  async function conflictTag(response) {
    const { error } = JSON.parse(await (await limitedBlob(response, 8192)).text());
    if (error?.[".tag"] === "path") return error.path?.[".tag"];
  }
  async function read(signal) {
    const response = await request("download", {}, signal);
    if (response.status === 409 && await conflictTag(response) === "not_found") return { revision: null, data: null };
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Could not read Dropbox activity.");
    }
    const body = await limitedBlob(response, maxBytes);
    const revision = JSON.parse(response.headers.get("Dropbox-API-Result"))?.rev;
    if (typeof revision !== "string" || !revisionPattern.test(revision)) throw new Error("Invalid Dropbox activity revision.");
    return { revision, data: validateActivity(JSON.parse(await body.text())) };
  }
  async function write(data, revision, signal) {
    const body = new Blob([JSON.stringify(data)]);
    if (body.size > maxBytes) throw new Error("Dropbox activity exceeds the supported size.");
    const response = await request("upload", {
      mode: revision ? { ".tag": "update", update: revision } : "add",
      autorename: false, strict_conflict: true, mute: true,
    }, signal, body);
    if (response.status === 409 && await conflictTag(response) === "conflict") return false;
    await response.body?.cancel();
    if (!response.ok) throw new Error("Could not write Dropbox activity.");
    return true;
  }
  return { read, write };
}

export async function syncPlayActivity({ client, scope, account, sources, check, signal }) {
  check();
  const storage = scope.localStorage;
  const cached = readActivityCache(storage, account);
  const device = activityDevice(storage, true);
  // Local counters are never populated from Dropbox. Each participant owns its
  // cumulative counter so replaying a checkpoint or a lost reply is idempotent.
  for (let attempt = 0; attempt < 4; attempt++) {
    const remote = await client.read(signal);
    check();
    const records = await readLocalActivity(scope);
    check();
    const local = collectLocalActivity(records, device, sources);
    const merged = mergeActivity(...[remote.data, cached, local].filter(Boolean));
    const changed = remote.data ? JSON.stringify(remote.data) !== JSON.stringify(merged)
      : merged.play.length || merged.progress.length;
    if (changed) {
      check();
      if (!await client.write(merged, remote.revision, signal)) continue;
      // Confirm the committed revision before presenting its activity locally.
      continue;
    }
    if (!remote.data) return;
    check();
    const value = JSON.stringify({ account, data: merged });
    if (storage.getItem(activityCacheKey) !== value) {
      storage.setItem(activityCacheKey, value);
      scope.dispatchEvent(new Event(activityUpdatedEvent));
    }
    return;
  }
  throw new Error("Dropbox activity is waiting to sync again.");
}
