import storage from "./artwork-data.mjs";

function objectKey(name, file) {
  return file.key ?? `artwork/${file.hash}/${name.slice(name.lastIndexOf("/") + 1)}`;
}

const pathsByKey = new Map(Object.entries(storage.files).map(([name, file]) => [objectKey(name, file), name]));
for (const [name, image] of Object.entries(storage.images || {})) {
  const fallback = storage.files[image.fallback];
  if (fallback) pathsByKey.set(objectKey(image.fallback, fallback), name);
}

export function artworkObjectUrl(name, manifest = storage) {
  const file = manifest.files[name];
  return file ? `${manifest.origin}/${objectKey(name, file)}` : undefined;
}

export function artworkUrl(asset, manifest = storage) {
  if (!manifest.published || !asset?.startsWith("/")) return asset;
  const pathname = asset.split(/[?#]/, 1)[0];
  return artworkObjectUrl(manifest.images?.[pathname]?.fallback || pathname, manifest) ?? asset;
}

export function artworkPath(asset, manifest = storage) {
  if (!asset || !asset.startsWith(`${manifest.origin}/artwork/`)) return asset;
  const key = asset.slice(manifest.origin.length + 1).split(/[?#]/, 1)[0];
  if (manifest === storage) return pathsByKey.get(key) || asset;
  const pathname = Object.keys(manifest.files).find((name) => objectKey(name, manifest.files[name]) === key);
  return Object.keys(manifest.images || {}).find((name) => manifest.images[name].fallback === pathname) || pathname || asset;
}

export { storage as artworkStorage };
