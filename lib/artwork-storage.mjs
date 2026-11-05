import storage from "../data/artwork-storage.json" with { type: "json" };
const pathsByUrl = new Map(Object.entries(storage.files).map(([name, file]) => [`${storage.origin}/${file.key}`, name]));
for (const [name, image] of Object.entries(storage.images || {})) {
  const fallback = storage.files[image.fallback];
  if (fallback) pathsByUrl.set(`${storage.origin}/${fallback.key}`, name);
}

export function artworkUrl(asset, manifest = storage) {
  if (!manifest.published || !asset?.startsWith("/")) return asset;
  const pathname = asset.split(/[?#]/, 1)[0];
  const file = manifest.files[manifest.images?.[pathname]?.fallback || pathname];
  return file ? `${manifest.origin}/${file.key}` : asset;
}

export function artworkPath(asset, manifest = storage) {
  if (!asset || !asset.startsWith(`${manifest.origin}/artwork/`)) return asset;
  if (manifest === storage) return pathsByUrl.get(asset.split(/[?#]/, 1)[0]) || asset;
  const key = asset.slice(manifest.origin.length + 1).split(/[?#]/, 1)[0];
  const pathname = Object.keys(manifest.files).find((name) => manifest.files[name].key === key);
  return Object.keys(manifest.images || {}).find((name) => manifest.images[name].fallback === pathname) || pathname || asset;
}

export { storage as artworkStorage };
