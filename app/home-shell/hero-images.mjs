import { getArtworkImageProps } from "./artwork-image-props.mjs";

export const HERO_PRELOAD_AHEAD = 3;

export function getHeroImageProps(game, artwork, role = "library-hero") {
  const src = game.heroImage || game.landscapeImage || game.posterImage;
  const optimized = getArtworkImageProps(src, role, artwork);
  if (optimized.srcSet) return optimized;
  return {
    ...optimized,
    srcSet: game.heroImageMobile
      ? `${game.heroImageMobile} 960w, ${src} 1832w`
      : undefined,
    sizes: "100vw",
  };
}

export function getHeroPreloadImages(slides, slideIndex, ahead = HERO_PRELOAD_AHEAD, artwork) {
  const images = new Map();
  if (!slides.length) return [];

  // Retain the current image, the next N slides, and one slide for going back.
  const offsets = [0, ...Array.from({ length: Math.min(ahead, slides.length - 1) }, (_, index) => index + 1), -1];
  for (const offset of offsets) {
    const { game } = slides[(slideIndex + offset + slides.length) % slides.length];
    const image = getHeroImageProps(game, artwork);
    if (image.src) images.set(JSON.stringify(image), image);
  }
  return [...images.values()];
}
