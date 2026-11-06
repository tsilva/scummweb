"use client";

import { useEffect, useState } from "react";
import DecorativeImage from "./home-shell/decorative-image";
import { getArtworkImageProps } from "./home-shell/artwork-image-props.mjs";
import { getRecentGameTargets, getRecentlyPlayedGames, recentGamesUpdatedEvent } from "./recent-games";
import GameSelectionLink from "./home-shell/game-selection-link";

export default function RecentGamesRail({ groups }) {
  const [recentTargets, setRecentTargets] = useState([]);

  useEffect(() => {
    const update = () => setRecentTargets(getRecentGameTargets());
    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    window.addEventListener("storage", update);
    window.addEventListener(recentGamesUpdatedEvent, update);
    return () => {
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      window.removeEventListener("storage", update);
      window.removeEventListener(recentGamesUpdatedEvent, update);
    };
  }, []);

  const recentGames = getRecentlyPlayedGames(groups, recentTargets);
  if (!recentGames.length) return null;

  return (
    <section className="content-band" aria-labelledby="recently-played-heading">
      <div className="section-header">
        <h2 id="recently-played-heading"><span className="section-mark" />Recently Played</h2>
      </div>
      <div className="landscape-rail">
        {recentGames.map(({ key, game }) => (
          <GameSelectionLink
            key={key}
            game={game}
            className={`landscape-card ${game.tone}`}
            data-game-target={game.target}
          >
            <DecorativeImage className="landscape-card-image" {...getArtworkImageProps(game.landscapeImage, "landscape")} />
            <div className="landscape-overlay">
              <h3>{game.displayTitle}</h3>
            </div>
          </GameSelectionLink>
        ))}
      </div>
    </section>
  );
}
