"use client";

import { useEffect, useState } from "react";
import DecorativeImage from "./home-shell/decorative-image";
import { getGameDialogId } from "./home-shell/shared";
import { getRecentGameTargets, sortGamesByRecentPlay } from "./recent-games";

export default function RecentGamesRail({ catalog }) {
  const [recentTargets, setRecentTargets] = useState([]);

  useEffect(() => {
    setRecentTargets(getRecentGameTargets());
  }, []);

  const sortedCatalog = sortGamesByRecentPlay(catalog, recentTargets);

  return (
    <div className="landscape-rail">
      {sortedCatalog.map((game) => (
        <a
          key={game.target}
          aria-haspopup="dialog"
          className={`landscape-card ${game.tone}`}
          data-game-target={game.target}
          href={`#${getGameDialogId(game)}`}
        >
          <DecorativeImage className="landscape-card-image" src={game.landscapeImage} />
          <div className="landscape-overlay">
            <h3>{game.displayTitle}</h3>
            <div className="landscape-meta">
              <span>{game.genre}</span>
              <span>{game.studio}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
