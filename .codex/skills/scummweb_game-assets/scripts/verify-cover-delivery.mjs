#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { homeArtworkDelivery } from "../../../../app/home-shell/initial-artwork.mjs";
import { getPosterImageProps } from "../../../../app/home-shell/poster-images.mjs";
import { artworkObjectUrl, artworkUrl } from "../../../../lib/artwork-storage.mjs";
import { DEFAULT_GAMES_ORIGIN } from "../../../../lib/site-config.mjs";
import storage from "../../../../data/artwork-storage.json" with { type: "json" };

export function verifyCoverDelivery(paths, manifest = storage) {
  if (!paths.length) throw new Error("Usage: verify-cover-delivery.mjs /launcher/<cover> [/launcher/<cover> ...]");
  if (manifest.published !== true || manifest.origin !== DEFAULT_GAMES_ORIGIN) {
    throw new Error("Run after activating the public R2 artwork manifest.");
  }

  const covers = [...new Set(paths)].map((logical) => {
    if (!/^\/launcher\/[a-z0-9-]+\.(?:png|webp|avif)$/.test(logical) || !manifest.files[logical]) {
      throw new Error(`Expected a published logical cover path: ${logical}`);
    }
    return { logical, posterImage: artworkUrl(logical, manifest) };
  });
  const compact = homeArtworkDelivery(covers, covers[0], manifest);
  const origin = `${manifest.origin}/artwork/`;
  const publishedURLs = new Set(Object.keys(manifest.files).map((name) => artworkObjectUrl(name, manifest)));
  const failures = [];

  for (const { logical, posterImage } of covers) {
    const actual = getPosterImageProps(posterImage, false, covers.length, compact);
    const expected = getPosterImageProps(posterImage, false, covers.length, manifest);
    const candidates = [actual.src, ...[actual.srcSet, actual.avifSrcSet].filter(Boolean)
      .flatMap((srcSet) => srcSet.split(", ").map((candidate) => candidate.split(" ")[0]))];

    for (const url of new Set(candidates)) {
      if (!url?.startsWith(origin) || !/^[a-f0-9]{64}\/[a-z0-9-]+\.(?:png|webp|avif)$/.test(url.slice(origin.length))
        || !publishedURLs.has(url)) {
        failures.push(`${logical}: expected an immutable R2 URL, got ${url}`);
      }
    }
    for (const field of ["src", "srcSet", "avifSrcSet"]) {
      if (actual[field] !== expected[field]) failures.push(`${logical}: compact homepage payload changed ${field}`);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return covers.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const count = verifyCoverDelivery(process.argv.slice(2));
    console.log(`Verified responsive R2 delivery for ${count} cover(s).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
