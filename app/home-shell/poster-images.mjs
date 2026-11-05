import renditions from "../../data/artwork-renditions.json" with { type: "json" };
import { artworkPath, artworkUrl } from "../../lib/artwork-storage.mjs";

export function getPosterImageProps(src, singleColumn = false) {
  const logical = artworkPath(src);
  if (!logical?.startsWith("/launcher/")) return { src };
  const [pathname] = logical.split(/[?#]/, 1);
  const image = renditions[pathname];
  if (!image) return { src };
  const suffix = logical.slice(pathname.length);
  const filename = pathname.slice("/launcher/".length, -5);
  // Preserve enough pixels for the existing object-fit: cover crop, including zoom.
  const cropWidth = Math.ceil(288 * image.width / image.height);
  return {
    src,
    width: image.width,
    height: image.height,
    srcSet: [
      ...image.widths.map((width) => `${artworkUrl(`/launcher/responsive/${filename}-${width}.webp${suffix}`)} ${width}w`),
      `${src} ${image.width}w`,
    ].join(", "),
    sizes: singleColumn ? "100vw"
      : `(max-width: 720px) max(50vw, ${cropWidth}px), max(25vw, ${cropWidth}px)`,
  };
}
