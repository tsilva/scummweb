export async function inspectLocalSourceFiles(source, cache) {
  if (source.url || source.handle?.kind !== "file"
    || await source.handle.queryPermission({ mode: "read" }) !== "granted") return undefined;
  const file = await source.handle.getFile();
  const previous = cache.get(source);
  if (previous?.size === file.size && previous.modified === file.lastModified) return previous.files;
  const files = import("./local-game-archive.mjs").then(({ scanLocalGameArchive }) => scanLocalGameArchive(file));
  cache.set(source, { size: file.size, modified: file.lastModified, files });
  return files;
}
