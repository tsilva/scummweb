const apiOrigin = "https://api.dropboxapi.com/2/";
const contentOrigin = "https://content.dropboxapi.com/2/";
export const sessionKey = "scummweb.dropbox-session.v1";
export const connectionKey = "scummweb.dropbox-connection.v1";
export const callbackPath = "/dropbox-callback.html";
export const maxBackupBytes = 64 * 1024 * 1024;

export class DropboxError extends Error {
  constructor(message, kind = "request") { super(message); this.name = "DropboxError"; this.kind = kind; }
}

export async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
export function hex(bytes) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }

// Dropbox hashes the concatenated SHA-256 block digests, even for small files.
export async function contentHash(blob) {
  const blocks = [];
  for (let offset = 0; offset < blob.size; offset += 4194304) {
    blocks.push(await sha256(await blob.slice(offset, offset + 4194304).arrayBuffer()));
  }
  const combined = new Uint8Array(blocks.length * 32);
  blocks.forEach((block, index) => combined.set(block, index * 32));
  return hex(await sha256(combined));
}

async function limitedBlob(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new DropboxError("Dropbox returned a file that exceeds the save limit.");
  }
  let size = 0;
  const chunks = [];
  const reader = response.body?.getReader();
  if (!reader) throw new DropboxError("Dropbox returned an empty response.");
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new DropboxError("Dropbox returned a file that exceeds the save limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new Blob(chunks);
}

export function createDropboxClient(token, fetcher = fetch) {
  async function request(route, { arg, body, content = false, limit = 1024 * 1024, metadata = false } = {}) {
    const headers = { Authorization: `Bearer ${token}` };
    if (content) {
      // Dropbox requires ASCII JSON in this header.
      headers["Dropbox-API-Arg"] = JSON.stringify(arg).replace(/[\u007f-\uffff]/g,
        (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
      if (body) headers["Content-Type"] = "application/octet-stream";
    } else headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetcher((content ? contentOrigin : apiOrigin) + route, {
        method: "POST", headers, body: content ? body : JSON.stringify(arg ?? null),
        credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(60_000),
      });
    } catch { throw new DropboxError("Saves are waiting for a connection to Dropbox.", "network"); }
    if (!response.ok) {
      // Never expose raw responses, account details, or tokens to error reporting.
      const data = await limitedBlob(response, 16384).then((blob) => blob.text()).then(JSON.parse).catch(() => ({}));
      const summary = typeof data.error_summary === "string" ? data.error_summary : "";
      if (response.status === 401) throw new DropboxError("Reconnect Dropbox to sync your saves.", "auth");
      if (response.status === 429) throw new DropboxError("Dropbox is busy. Your saves will retry shortly.", "rate");
      if (response.status === 409 && /^(path\/not_found|path_lookup\/not_found)/.test(summary)) {
        throw new DropboxError("This Dropbox save was not found.", "missing");
      }
      if (response.status === 409 && /conflict/.test(summary)) throw new DropboxError("Dropbox saves changed on another device.", "conflict");
      if (/insufficient_space/.test(summary)) throw new DropboxError("Dropbox is full. Your latest saves are still on this device.", "quota");
      throw new DropboxError("Could not sync Dropbox. Your browser saves are unchanged.");
    }
    const blob = await limitedBlob(response, limit);
    if (!metadata) return blob;
    let file;
    try { file = JSON.parse(response.headers.get("dropbox-api-result")); } catch { /* Validated below. */ }
    if (!file || typeof file.rev !== "string" || file.content_hash !== await contentHash(blob)) {
      throw new DropboxError("Dropbox could not verify the downloaded save.", "integrity");
    }
    return { blob, metadata: file };
  }
  async function json(route, arg) { return JSON.parse(await (await request(route, { arg })).text()); }
  return {
    account: () => json("users/get_current_account"),
    async download(path, limit = maxBackupBytes) { return request("files/download", { content: true, arg: { path }, limit }); },
    async read(path, limit = maxBackupBytes) { return request("files/download", { content: true, arg: { path }, limit, metadata: true }); },
    async upload(path, blob, rev = null) {
      if (blob.size > maxBackupBytes) throw new DropboxError("This save backup exceeds the 64 MiB limit.");
      const expected = await contentHash(blob);
      const result = JSON.parse(await (await request("files/upload", {
        content: true, body: blob, arg: { path, mode: rev ? { ".tag": "update", update: rev } : "add",
          autorename: false, strict_conflict: true, mute: true, content_hash: expected },
      })).text());
      if (result.content_hash !== expected || typeof result.rev !== "string") {
        throw new DropboxError("Dropbox could not verify this save. Your local copy is retained.", "integrity");
      }
      return result;
    },
    metadata: (path) => json("files/get_metadata", { path }),
    async listHeads() {
      let page;
      try { page = await json("files/list_folder", { path: "/Saves/v1", recursive: true }); }
      catch (error) { if (error.kind === "missing") return []; throw error; }
      const heads = [];
      let entries = 0;
      for (;;) {
        if (!Array.isArray(page.entries) || typeof page.has_more !== "boolean") throw new DropboxError("Invalid Dropbox folder listing.");
        for (const entry of page.entries) {
          if (++entries > 50000) throw new DropboxError("This Dropbox save collection is too large to scan safely.");
          if (entry[".tag"] === "file" && /^\/saves\/v1\/[a-f0-9]{64}\/head\.json$/.test(entry.path_lower)) {
            heads.push(entry.path_lower);
          }
        }
        if (!page.has_more) return [...new Set(heads)];
        page = await json("files/list_folder/continue", { cursor: page.cursor });
      }
    },
  };
}

export function readSession(storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(sessionKey));
    return typeof value?.token === "string" && typeof value.accountId === "string"
      && Number.isFinite(value.expiresAt) && value.expiresAt > now + 30_000 ? value : null;
  } catch { return null; }
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export async function authorizationRequest(appKey, origin) {
  const verifier = randomCode(), state = randomCode();
  const challenge = btoa(String.fromCharCode(...await sha256(new TextEncoder().encode(verifier))))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const redirectUri = new URL(callbackPath, origin).href;
  const url = new URL("https://www.dropbox.com/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: appKey, response_type: "code", code_challenge: challenge,
    code_challenge_method: "S256", state, redirect_uri: redirectUri, token_access_type: "online",
    scope: "account_info.read files.metadata.read files.content.read files.content.write" });
  return { url: url.href, verifier, state, redirectUri };
}

export async function exchangeCode(appKey, transaction, code, fetcher = fetch) {
  const response = await fetcher("https://api.dropboxapi.com/oauth2/token", {
    method: "POST", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: appKey,
      code_verifier: transaction.verifier, redirect_uri: transaction.redirectUri }),
  }).catch(() => { throw new DropboxError("Could not connect to Dropbox. Try again."); });
  if (!response.ok) { await response.body?.cancel(); throw new DropboxError("Dropbox connection expired. Please try connecting again."); }
  const data = JSON.parse(await (await limitedBlob(response, 16384)).text());
  if (typeof data.access_token !== "string" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) {
    throw new DropboxError("Dropbox returned an invalid connection.");
  }
  return { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
}
