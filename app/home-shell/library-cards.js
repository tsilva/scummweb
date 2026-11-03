import DecorativeImage from "./decorative-image";
import { getGameDialogId } from "./shared";

export const bucketOnlyGames = [
  {
    target: "monkey-demo",
    title: "The Secret of Monkey Island (DOS EGA Demo)",
    displayTitle: "The Secret of Monkey Island Demo",
    edition: "DOS EGA demo",
    tone: "tone-default",
  },
];

export default function LibraryCards({ games, bucketTargets = [], onPlay, disabled }) {
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
            {fromBucket ? (
              <button
                type="button"
                className={`${cardClass} bucket-poster-button`}
                aria-label={`Play ${game.displayTitle} from bucket`}
                data-game-target={game.target}
                disabled={disabled}
                onClick={() => onPlay(game)}
              >
                {poster}
              </button>
            ) : (
              <a
                aria-haspopup="dialog"
                className={cardClass}
                data-game-target={game.target}
                href={`#${getGameDialogId(game)}`}
              >
                {poster}
              </a>
            )}
            {game.href ? (
              <a className="game-details-link" href={game.href}>About {game.displayTitle}</a>
            ) : (
              <span className="game-details-link">{game.edition} · From your bucket</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
