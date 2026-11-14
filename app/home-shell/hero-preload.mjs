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

export function preloadSelectedHero(game, artwork) {
  const props = getHeroImageProps(game, artwork);
  if (!props.src) return;
  const key = JSON.stringify(props);
  if (selectedHero?.key === key) return;
  selectedHero?.picture.remove();
  // Retain only the latest selection, even when many cards are hovered.
  selectedHero = { key, picture: createHeroPreload(props, "high") };
}
