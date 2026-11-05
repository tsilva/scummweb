import DecorativeImage from "./decorative-image";
import { getGameDialogId } from "./shared";
import { getPosterImageProps } from "./poster-images.mjs";

export function GamePoster({ title, image, editionLabel, singleColumn = false, count = 8 }) {
  return (
    <>
      <span className="poster-media">
        {image ? (
          <DecorativeImage className="poster-media-image" {...getPosterImageProps(image, singleColumn, count)} />
        ) : (
          <span className="bucket-poster-placeholder" aria-hidden="true">☠</span>
        )}
      </span>
      <span className="poster-overlay"><span className="poster-title">{title}</span>
        {editionLabel && <span className="poster-edition">{editionLabel}</span>}
      </span>
    </>
  );
}

export default function LibraryCards({ games, children }) {
  return (
    <div className="poster-grid">
      {children}
      {games.map((game) => (
        <div className="poster-entry" key={game.target}>
          <a aria-haspopup="dialog" aria-controls={getGameDialogId(game)} className={`poster-card ${game.tone}`} data-game-target={game.target} href={`#${getGameDialogId(game)}`}>
            <GamePoster title={game.displayTitle} image={game.posterImage} editionLabel={game.editionLabel} singleColumn={games.length === 1} count={games.length + (children ? 1 : 0)} />
          </a>
        </div>
      ))}
    </div>
  );
}
