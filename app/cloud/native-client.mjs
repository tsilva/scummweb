import { syncStore } from "../dropbox/store.mjs";
import { DropboxError, maxBackupBytes } from "../dropbox/client.mjs";
import { createDropboxActivityClient } from "../dropbox/activity-sync.mjs";

// IDs belong to ScummVM's Cloud::StorageID, not to the UI. Add an auth adapter
// before enabling another provider; the snapshot/recovery protocol is shared.
export const cloudProviders = Object.freeze({
  dropbox: { nativeId: 1, configName: "Dropbox", enabled: true },
  onedrive: { nativeId: 2, configName: "OneDrive", enabled: false },
  googledrive: { nativeId: 3, configName: "GoogleDrive", enabled: false },
  box: { nativeId: 4, configName: "Box", enabled: false },
});
export const credentialKey = (provider, account) => `native/${provider}/${account}`;
export function dropboxNativeConfig(auth, clientId) {
  for (const value of [auth.token, auth.refreshToken, clientId]) {
    if (typeof value !== "string" || !value || /[\r\n\[\]\0]/.test(value)) throw new DropboxError("Invalid Dropbox connection.", "auth");
  }
  return `[scummvm]\nscummweb_dropbox_client_id=${clientId}\n[cloud]\ncurrent_storage=1\nstorage_Dropbox_access_token=${auth.token}\nstorage_Dropbox_refresh_token=${auth.refreshToken}\nstorage_Dropbox_enabled=true\n`;
}
export async function createNativeCloudClient({ provider = "dropbox", accountId, connectionId }, { signal, progress = () => {} } = {}) {
  signal?.throwIfAborted();
  if (!cloudProviders[provider]?.enabled) throw new DropboxError("This cloud provider is not available yet.");
  const key = credentialKey(provider, accountId);
  const saved = await syncStore.get(key);
  signal?.throwIfAborted();
  if (!saved?.config || saved.connectionId !== connectionId) throw new DropboxError("Reconnect Dropbox to sync your saves.", "auth");
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Save sync";
  frame.setAttribute("aria-hidden", "true");
  frame.src = "/cloud.html";
  let pending, counter = 0, closed = false;
  let entries = new Map();
  let refreshAfter = saved.refreshAfter || 0;
  let config = saved.config;
  const request = (op, extra = {}, onProgress) => new Promise((resolve, reject) => {
    if (closed || pending) { reject(new DropboxError("Cloud sync is unavailable. Try again.")); return; }
    const id = ++counter;
    const timer = setTimeout(() => { reject(new DropboxError("Cloud sync timed out. Your local saves are retained.")); close(); }, 120000);
    pending = { id, op, resolve, reject, timer, onProgress };
    frame.contentWindow.postMessage({ type: "scummweb:cloud", id, op, ...extra }, location.origin);
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new DropboxError("Could not start save sync. Try again.")); close(); }, 90000);
    pending = { id: 0, resolve, reject, timer };
  });
  async function receive(event) {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "scummweb:cloud") return;
    const data = event.data;
    if (data.op === "booted" && pending?.id === 0) {
      frame.contentWindow.postMessage({ type: "scummweb:cloud", id: 0, op: "init", config }, location.origin);
      return;
    }
    if (!pending || data.id !== pending.id) return;
    const operation = pending;
    if (data.op === "progress") {
      if (!["upload", "download"].includes(operation.op)
        || !Number.isSafeInteger(data.loaded) || data.loaded < 0 || data.loaded > maxBackupBytes
        || !Number.isSafeInteger(data.total) || data.total < 0 || data.total > maxBackupBytes
        || data.total && data.loaded > data.total) return;
      progress();
      clearTimeout(operation.timer);
      operation.timer = setTimeout(() => { operation.reject(new DropboxError("Cloud sync timed out. Your local saves are retained.")); close(); }, 120000);
      operation.onProgress?.({ loaded: data.loaded, total: data.total });
      return; // Progress never acknowledges an operation or persists credentials.
    }
    progress();
    try {
      // A disconnect may have removed the credential record during a request.
      if (operation.op === "refresh" && data.ok) refreshAfter = Date.now() + 30 * 60 * 1000;
      if (data.config) {
        await syncStore.putIf({ id: key, config: data.config, refreshAfter, connectionId },
          (current) => current.connectionId === connectionId);
        config = data.config;
      }
      if (data.ok) operation.resolve(data);
      else operation.reject(new DropboxError(data.kind === "auth" ? "Reconnect Dropbox to sync your saves."
        : "Could not sync cloud saves. Your local copies are retained.", data.kind));
    } catch (error) { operation.reject(error); }
    finally { if (pending === operation) { clearTimeout(operation.timer); pending = null; } }
  }
  function close() {
    closed = true;
    window.removeEventListener("message", receive);
    signal?.removeEventListener("abort", abort);
    frame.remove();
    if (pending) { clearTimeout(pending.timer); pending.reject(new DropboxError("Cloud sync stopped. Your local saves are retained.", "cancelled")); pending = null; }
  }
  function abort() {
    pending?.reject(signal.reason);
    close();
  }
  signal?.addEventListener("abort", abort, { once: true });
  window.addEventListener("message", receive);
  document.body.append(frame);
  try { await ready; if (Date.now() >= refreshAfter) await request("refresh"); }
  catch (error) { close(); throw error; }
  return {
    close,
    activityClient() {
      if (provider !== "dropbox") return null;
      // Reuse the scoped session after native renewal.
      const token = /^storage_Dropbox_access_token[ \t]*=[ \t]*([^\r\n]+)/m.exec(config)?.[1].trim();
      return token ? createDropboxActivityClient(token) : null;
    },
    async list() {
      let result;
      try { result = await request("list"); }
      catch (error) {
        if (error.kind !== "missing") throw error;
        try { await request("mkdir"); } catch { /* A competing device may have created the directory. Re-list it. */ }
        result = await request("list");
      }
      if (!Array.isArray(result.entries)) throw new DropboxError("Could not verify the cloud save listing.", "integrity");
      entries = new Map(result.entries.filter((entry) => !entry.directory && /^[a-f0-9]{64}\.zip$/.test(entry.name))
        .map((entry) => [entry.name, { size: entry.size, revision: entry.revision || undefined }]));
      return [...entries.keys()];
    },
    revision: (name) => entries.get(name)?.revision,
    async download(name, { onProgress } = {}) {
      const size = entries.get(name)?.size;
      if (size !== undefined && (!Number.isSafeInteger(size) || size < 0 || size > maxBackupBytes)) {
        throw new DropboxError("A cloud snapshot exceeds the save limit.", "integrity");
      }
      const result = await request("download", { name, size }, onProgress);
      if (!(result.bytes instanceof Uint8Array) || result.bytes.length > maxBackupBytes) throw new DropboxError("Invalid cloud snapshot.", "integrity");
      return new Blob([result.bytes]);
    },
    async upload(name, blob, { onProgress } = {}) {
      if (blob.size > maxBackupBytes) throw new DropboxError("This save backup exceeds the 64 MiB limit.");
      await request("upload", { name, bytes: new Uint8Array(await blob.arrayBuffer()) }, onProgress);
    },
  };
}
