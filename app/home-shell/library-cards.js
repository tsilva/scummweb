import DecorativeImage from "./decorative-image";
import { getGameDialogId } from "./shared";

export default function LibraryCards({ games, bucketTargets = [] }) {
  return (
    <div className="poster-grid">
      {games.map((game) => {
        const fromBucket = bucketTargets.includes(game.target);
        const cardClass = `poster-card ${game.tone}`;
        const poster = (
          <>
            <span className="poster-media">
              {game.posterImage ? (
                <DecorativeImage className="poster-media-image" src={game.posterImage} />
              ) : (
                <span className="bucket-poster-placeholder" aria-hidden="true">☠</span>
              )}
            </span>
            <span className="poster-overlay"><span className="poster-title">{game.displayTitle}</span></span>
          </>
        );
        return (
          <div className="poster-entry" key={game.target}>
            <a
              aria-haspopup={fromBucket ? "dialog" : undefined}
              className={cardClass}
              data-game-target={game.target}
              href={fromBucket ? `#${getGameDialogId(game, { fromBucket })}` : game.href}
            >
              {poster}
            </a>
            {!game.href && (
              <span className="bucket-poster-caption">{game.edition} · From your bucket</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
