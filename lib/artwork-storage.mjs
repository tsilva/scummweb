import storage from "../data/artwork-storage.json" with { type: "json" };
const pathsByUrl = new Map(Object.entries(storage.files).map(([name, file]) => [`${storage.origin}/${file.key}`, name]));

export function artworkUrl(asset, manifest = storage) {
  if (!manifest.published || !asset?.startsWith("/")) return asset;
  const pathname = asset.split(/[?#]/, 1)[0];
  const file = manifest.files[pathname];
  return file ? `${manifest.origin}/${file.key}` : asset;
}

export function artworkPath(asset, manifest = storage) {
  if (!asset || !asset.startsWith(`${manifest.origin}/artwork/`)) return asset;
  if (manifest === storage) return pathsByUrl.get(asset.split(/[?#]/, 1)[0]) || asset;
  const key = asset.slice(manifest.origin.length + 1).split(/[?#]/, 1)[0];
  return Object.keys(manifest.files).find((pathname) => manifest.files[pathname].key === key) || asset;
}

export { storage as artworkStorage };
