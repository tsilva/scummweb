import { artworkDelivery, artworkStorage } from "../../lib/artwork-storage.mjs";
import { getArtworkImageProps } from "./artwork-image-props.mjs";

// Keep every responsive candidate used by the library, without sending records
// for alternate artwork that its cards and hero never render.
export function homeArtworkDelivery(catalog, featuredGame, manifest = artworkStorage) {
  return artworkDelivery(catalog.map((game) => {
    const heroImage = game.heroImage || game.landscapeImage || game.posterImage;
    const responsive = getArtworkImageProps(heroImage, "library-hero", manifest).srcSet;
    return {
      heroImage,
      posterImage: game.posterImage,
      ...(!responsive ? { heroImageMobile: game.heroImageMobile } : {}),
      ...(game === featuredGame ? { screenshots: game.screenshots } : {}),
    };
  }), manifest);
}
