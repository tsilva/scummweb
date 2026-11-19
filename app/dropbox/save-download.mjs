import { DropboxError, limitedBlob, maxBackupBytes } from "./client.mjs";

const revisionPattern = /^[a-f0-9]{9,}$/;
const retryAfter = new Map();
const retryMessage = "Dropbox is limiting save requests. Sync will retry automatically.";

// Reads use the active native session. Dropbox returns the exact revision and
// byte count for the response, independently of the most recent folder listing.
export async function downloadDropboxSave({ name, revision, size, accountId, token, signal, onProgress, onRevision, progress }) {
  if (!/^[a-f0-9]{64}\.zip$/.test(name)) throw new DropboxError("Invalid cloud snapshot name.", "integrity");
  if (Date.now() < (retryAfter.get(accountId) ?? 0)) throw new DropboxError(retryMessage);
  const transfer = new AbortController();
  let deadline;
  function keepAlive() {
    clearTimeout(deadline);
    deadline = setTimeout(() => transfer.abort(new DropboxError("Cloud sync timed out. Your local saves are retained.")), 120_000);
    progress();
  }
  try {
    keepAlive();
    const response = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
      signal: signal ? AbortSignal.any([signal, transfer.signal]) : transfer.signal,
      headers: { Authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: `/saves/${name}` }) },
    });
    keepAlive();
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) {
        const delay = Number(response.headers.get("Retry-After"));
        const next = Date.now() + (Number.isFinite(delay) && delay > 0 ? delay : 30) * 1000;
        retryAfter.set(accountId, Math.max(next, retryAfter.get(accountId) ?? 0));
        throw new DropboxError(retryMessage);
      }
      if (response.status === 401) throw new DropboxError("Dropbox needs to renew the save session. Sync will retry.", "expired");
      throw new DropboxError("Could not download a cloud save. Your copies are retained.");
    }
    let metadata;
    try { metadata = JSON.parse(response.headers.get("Dropbox-API-Result")); }
    catch { /* The response must carry the committed revision. */ }
    if (!metadata || metadata.name !== name || typeof metadata.rev !== "string" || !revisionPattern.test(metadata.rev)
      || !Number.isSafeInteger(metadata.size) || metadata.size < 0 || metadata.size > maxBackupBytes) {
      await response.body?.cancel();
      throw new DropboxError("Dropbox returned invalid save metadata.");
    }
    if (revision && (metadata.rev !== revision || size !== undefined && metadata.size !== size)) {
      await response.body?.cancel();
      throw new DropboxError("Cloud saves changed during sync. Checking them again shortly.", "changed");
    }
    const blob = await limitedBlob(response, maxBackupBytes, (loaded) => {
      keepAlive();
      onProgress?.({ loaded, total: metadata.size });
    });
    if (blob.size !== metadata.size) throw new DropboxError("Dropbox returned an incomplete save download.");
    onRevision?.(metadata.rev);
    return blob;
  } finally { clearTimeout(deadline); }
}
