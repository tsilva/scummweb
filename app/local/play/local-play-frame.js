"use client";

import { useState } from "react";
import GameRouteFrame from "../../game-route-frame";
import { buildZipGamePlayerUrl } from "../../home-shell/zip-game-player";
import { getSelectedGamePresentation, openSelectedGameArchive } from "../../local-game-archive.mjs";

const playerUrl = buildZipGamePlayerUrl("/#library");

export default function LocalPlayFrame() {
  const [game] = useState(getSelectedGamePresentation);
  return (
    <GameRouteFrame
      archiveLoadingText="Opening game ZIP…"
      game={game}
      loadArchive={openSelectedGameArchive}
      src={playerUrl}
      title={game?.displayTitle ?? "ScummVM game ZIP"}
    />
  );
}
