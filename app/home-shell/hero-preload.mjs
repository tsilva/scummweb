import { getHeroImageProps } from "./hero-images.mjs";

let selectedHero = null;

export function createHeroPreload(props, fetchPriority = "low") {
  const picture = document.createElement("picture");
  picture.hidden = true;
  if (props.avifSrcSet) {
    const source = document.createElement("source");
    source.type = "image/avif";
    source.sizes = props.sizes;
    source.srcset = props.avifSrcSet;
    picture.append(source);
  }
  const image = new Image();
  picture.append(image);
  document.body.append(picture);
  image.decoding = "async";
  image.fetchPriority = fetchPriority;
  image.sizes = props.sizes;
  if (props.srcSet) image.srcset = props.srcSet;
  image.src = props.src;
  // Keep the responsive picture alive while its selected candidate decodes.
  void image.decode().catch(() => {});
  return picture;
}

export function disposeHeroPreload(picture) {
  // Removing a picture alone can leave its image request running. Clear every
  // candidate together so neither the AVIF nor fallback keeps downloading.
  for (const source of picture.querySelectorAll("source")) source.removeAttribute("srcset");
  const image = picture.querySelector("img");
  image.removeAttribute("srcset");
  image.removeAttribute("src");
  picture.remove();
}

export function preloadSelectedHero(game, artwork, committed = false) {
  const props = getHeroImageProps(game, artwork);
  if (!props.src) return;
  const key = JSON.stringify(props);
  if (selectedHero?.key !== key) {
    if (selectedHero) disposeHeroPreload(selectedHero.picture);
    // Retain only the latest selection, even when many cards are hovered.
    selectedHero = { key, picture: createHeroPreload(props, "high"), committed: false };
  }
  const entry = selectedHero;
  const claim = Symbol();
  entry.claim = claim;
  entry.committed ||= committed;
  return () => {
    // A late leave/unmount from an older card must not cancel a newer intent.
    if (selectedHero !== entry || entry.claim !== claim || entry.committed) return;
    const image = entry.picture.querySelector("img");
    if (image.complete && image.naturalWidth) return;
    disposeHeroPreload(entry.picture);
    selectedHero = null;
  };
}
