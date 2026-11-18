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

export async function limitedBlob(response, limit) {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new DropboxError("Dropbox returned a response that exceeds the supported size.");
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
      if (size > limit) throw new DropboxError("Dropbox returned a response that exceeds the supported size.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return new Blob(chunks);
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
    code_challenge_method: "S256", state, redirect_uri: redirectUri, token_access_type: "offline",
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
  let data;
  try { data = JSON.parse(await (await limitedBlob(response, 16384)).text()); }
  catch { throw new DropboxError("Dropbox returned an invalid connection."); }
  if (typeof data.access_token !== "string" || !Number.isFinite(data.expires_in) || data.expires_in <= 0
    || typeof data.refresh_token !== "string" || !data.refresh_token || typeof data.account_id !== "string" || !data.account_id) {
    throw new DropboxError("Dropbox returned an invalid connection.");
  }
  return { token: data.access_token, refreshToken: data.refresh_token, accountId: data.account_id };
}
