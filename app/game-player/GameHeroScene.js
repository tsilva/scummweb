import { formatVersionLabel, getVersionMetadata } from "../game-versions.mjs";
import { useArtworkDelivery } from "../home-shell/artwork-delivery";
import DecorativeImage from "../home-shell/decorative-image";
import { getHeroImageProps } from "../home-shell/hero-images.mjs";
import { getHeroImageStyle } from "../home-shell/shared";
import { getBundledLaunchTags } from "./launch-tags.mjs";

// Browsing, route preparation and runtime loading share this exact composition.
// Keep the action slot independent of its contents so status changes cannot
// move the title or change the artwork's dimensions.
export default function GameHeroScene({ game, title, children, footer, isInitialSlide = true }) {
  const artwork = useArtworkDelivery();
  const backdrop = game ? getHeroImageProps(game, artwork, "hero") : null;
  const tags = getBundledLaunchTags(game);
  const metadata = [game?.year, tags?.[1] || game?.genre].filter(Boolean);
  const edition = game ? formatVersionLabel({ ...game, ...getVersionMetadata(game) }, { showRevision: false })
    || game.badge || "Included version" : null;
  const sceneTitle = game?.displayTitle || title || "ScummVM game";

  return (
    <div className={`game-hero-scene ${game?.tone || "tone-default"}${sceneTitle.length > 38 ? " has-long-title" : ""}`}>
      <div className="game-hero-artwork">
        {backdrop?.src ? <DecorativeImage
          {...backdrop}
          className="game-hero-image hero-backdrop-image"
          decoding={isInitialSlide ? "sync" : "async"}
          fetchPriority={isInitialSlide ? "high" : undefined}
          loading="eager"
          style={getHeroImageStyle(game.heroImagePosition, game.heroImageMobilePosition)}
        /> : null}
      </div>
      <div aria-hidden="true" className="game-hero-shade" />
      <div className="game-hero-content">
        <div className="game-hero-copy hero-copy">
          <h1 className="game-hero-title"><span className="hero-title-text">{sceneTitle}</span></h1>
          {(metadata.length || edition) ? <ul className="game-hero-meta" aria-label="Game information">
            {metadata.map((value, index) => <li key={`${index}:${value}`}>{value}</li>)}
            {edition ? <li className="hero-edition" title={edition}>{edition}</li> : null}
          </ul> : <div className="game-hero-meta" />}
          <p className="game-hero-summary">{game?.summary}</p>
          <div className="game-hero-action-slot">{children}</div>
        </div>
      </div>
      {footer}
    </div>
  );
}
