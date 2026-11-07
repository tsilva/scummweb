import initialStorage from "./artwork-data.mjs";

let storage = initialStorage;
let loadingStorage;

export function loadArtworkStorage() {
  if (!storage.deferred) return Promise.resolve(storage);
  loadingStorage ??= import("./artwork-full-data.mjs").then(({ default: manifest }) => {
    storage = manifest;
    return manifest;
  }).finally(() => { loadingStorage = undefined; });
  return loadingStorage;
}

function objectKey(name, file) {
  return file.key ?? `artwork/${file.hash}/${name.slice(name.lastIndexOf("/") + 1)}`;
}

const pathIndexes = new WeakMap();

function getPathIndex(manifest) {
  let paths = pathIndexes.get(manifest);
  if (!paths) {
    paths = new Map(Object.entries(manifest.files).map(([name, file]) => [objectKey(name, file), name]));
    for (const [name, image] of Object.entries(manifest.images || {})) {
      const fallback = manifest.files[image.fallback];
      if (fallback) paths.set(objectKey(image.fallback, fallback), name);
    }
    pathIndexes.set(manifest, paths);
  }
  return paths;
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
  return getPathIndex(manifest).get(key) || asset;
}

export function artworkDelivery(games, manifest = storage) {
  const { published, origin } = manifest;
  const files = {};
  const images = {};
  for (const game of games) {
    for (const asset of [game.heroImage, game.heroImageMobile, game.posterImage, game.landscapeImage, ...(game.screenshots || [])]) {
      const name = artworkPath(asset, manifest)?.split(/[?#]/, 1)[0];
      if (!name || images[name]) continue;
      const image = manifest.images?.[name];
      if (image) images[name] = image;
      for (const path of image ? [image.fallback, ...image.webp, ...image.avif] : [name]) {
        const file = manifest.files[path];
        if (file) files[path] = { key: objectKey(path, file), width: file.width };
      }
    }
  }
  return { published, origin, files, images };
}

export { storage as artworkStorage };
