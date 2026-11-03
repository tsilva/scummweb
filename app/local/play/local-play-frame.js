"use client";

import GameRouteFrame from "../../game-route-frame";
import { buildZipGamePlayerUrl } from "../../home-shell/zip-game-player";
import { openSelectedGameArchive } from "../../local-game-archive.mjs";

const playerUrl = buildZipGamePlayerUrl("/#library");

export default function LocalPlayFrame() {
  return (
    <GameRouteFrame
      archiveLoadingText="Opening game ZIP…"
      loadArchive={openSelectedGameArchive}
      src={playerUrl}
      title="ScummVM game ZIP"
    />
  );
}
