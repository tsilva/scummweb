"use client";

import GameRouteFrame from "../../game-route-frame";
import { buildZipGamePlayerUrl } from "../../home-shell/zip-game-player";
import { openSelectedLocalGameArchive } from "../../local-game-archive.mjs";

const playerUrl = buildZipGamePlayerUrl("/#local-game-heading");

export default function LocalPlayFrame() {
  return (
    <GameRouteFrame
      archiveLoadingText="Opening game ZIP…"
      loadArchive={openSelectedLocalGameArchive}
      src={playerUrl}
      title="Local ScummVM game"
    />
  );
}
