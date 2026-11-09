import { artworkObjectUrl, artworkPath, artworkStorage, artworkUrl } from "../../lib/artwork-storage.mjs";

// Match the auto-fit 10rem columns, 1rem gaps, 100rem container and mobile padding.
// Include object-fit:cover's vertical crop and the poster's 1.04 zoom.
export function getPosterSizes(aspect, count = 8) {
  const crop = Math.ceil(16.5 * aspect * 1.04 * 1000) / 1000;
  const entries = [];
  for (const [start, end, padding] of [[0, 40, 2], [40, 100, 4]]) {
    const breaks = [start, ...Array.from({ length: 7 }, (_, i) => padding + (i + 2) * 10 + (i + 1))
      .filter((width) => width > start && width < end), end];
    for (let i = 0; i < breaks.length - 1; i += 1) {
      const middle = (breaks[i] + breaks[i + 1]) / 2;
      const columns = Math.min(Math.max(1, count), Math.max(1, Math.floor((middle - padding + 1) / 11)));
      const size = `max(calc((min(100vw, 100rem) - ${padding + columns - 1}rem) / ${columns} * 1.04), ${crop}rem)`;
      entries.push(`(max-width: ${breaks[i + 1] - 0.001}rem) ${size}`);
    }
  }
  const columns = Math.min(8, Math.max(1, count));
  return [...entries, `max(calc((100rem - ${4 + columns - 1}rem) / ${columns} * 1.04), ${crop}rem)`].join(", ");
}

export function getArtworkImageProps(src, role = "gallery", manifest = artworkStorage) {
  const logical = artworkPath(src, manifest);
  const image = manifest.images?.[logical];
  if (!image) return { src };
  const aspect = image.width / image.height;
  const heroSizes = `max(103vw, ${Math.ceil(103 * aspect)}svh)`;
  // The wide library layout has a 5rem inset above its unscaled cover image.
  const sizes = role === "library-hero"
    ? `(min-width: 64.001rem) and (min-height: 50.001rem) max(100vw, calc((100svh - 5rem) * ${aspect})), ${heroSizes}`
    : role === "hero" ? heroSizes
    : role === "detail" ? `max(min(100vw, 82rem), ${Math.ceil(62 * aspect)}vh)`
    : role === "poster" ? getPosterSizes(aspect)
    : role === "landscape" ? "min(21.25rem, 84vw)"
    : "(max-width: 640px) calc((100vw - 5.5rem) / 2), (max-width: 900px) calc((100vw - 7rem) / 3), calc((min(100vw, 85rem) - 10rem) / 3)";
  const candidates = (paths) => paths.map((name) => `${artworkObjectUrl(name, manifest)} ${manifest.files[name].width}w`).join(", ");
  // A format source must cover every resolution. Otherwise the browser can
  // select a small AVIF even when a sharper WebP fallback is available.
  const avifWidths = new Set(image.avif.map((name) => manifest.files[name].width));
  const completeAvif = image.webp.every((name) => avifWidths.has(manifest.files[name].width));
  return {
    src: artworkUrl(logical, manifest),
    width: image.width,
    height: image.height,
    srcSet: candidates(image.webp),
    avifSrcSet: completeAvif ? candidates(image.avif) : undefined,
    sizes,
  };
}
