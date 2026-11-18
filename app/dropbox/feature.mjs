export function dropboxPreviewEnabled(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).get("dropbox") === "true";
}

export function withDropboxPreview(href, current = globalThis.location?.href) {
  if (!current) return href;
  const source = new URL(current);
  if (!dropboxPreviewEnabled(source.searchParams)) return href;
  const destination = new URL(href, source);
  if (destination.origin !== source.origin || destination.searchParams.has("dropbox")) return href;
  destination.searchParams.set("dropbox", "true");
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
