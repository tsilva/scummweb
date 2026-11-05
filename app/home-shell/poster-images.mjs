import renditions from "../../data/artwork-renditions.json" with { type: "json" };
import { artworkPath, artworkUrl } from "../../lib/artwork-storage.mjs";
import { getArtworkImageProps, getPosterSizes } from "./artwork-image-props.mjs";

export function getPosterImageProps(src, singleColumn = false, count = 8) {
  const optimized = getArtworkImageProps(src, "poster");
  if (optimized.srcSet) return { ...optimized, sizes: getPosterSizes(optimized.width / optimized.height, singleColumn ? 1 : count) };
  const logical = artworkPath(src);
  if (!logical?.startsWith("/launcher/")) return { src };
  const [pathname] = logical.split(/[?#]/, 1);
  const image = renditions[pathname];
  if (!image) return { src };
  const suffix = logical.slice(pathname.length);
  const filename = pathname.slice("/launcher/".length, -5);
  // Preserve enough pixels for the existing object-fit: cover crop, including zoom.
  return {
    src,
    width: image.width,
    height: image.height,
    srcSet: [
      ...image.widths.map((width) => `${artworkUrl(`/launcher/responsive/${filename}-${width}.webp${suffix}`)} ${width}w`),
      `${src} ${image.width}w`,
    ].join(", "),
    sizes: getPosterSizes(image.width / image.height, singleColumn ? 1 : count),
  };
}
