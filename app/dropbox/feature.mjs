export function dropboxPreviewEnabled(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).get("dropbox") === "true";
}
