"use client";

import { useCallback } from "react";
import { readRemoteGameArchive } from "../../../game-bucket.mjs";
import { readGameSources } from "../../../game-sources.mjs";
import GameRouteFrame from "../../../game-route-frame";
import { buildZipGamePlayerUrl } from "../../../home-shell/zip-game-player";
import { buildGameExitHref } from "../../../home-shell/hero-selection.mjs";

export default function BucketPlayFrame({ game, officialUrl, catalog }) {
  const { target, displayTitle } = game;
  const loadArchive = useCallback(async (signal) => {
    let sources = [];
    try {
      sources = await readGameSources(catalog, officialUrl);
    } catch {
      // An unavailable or invalid saved selection can be replaced in the Library.
    }
    const source = sources.find((source) => source.url && source.target === target);
    if (!source) {
      throw new Error("Add a bucket or ZIP containing this game to your library.");
    }
    return readRemoteGameArchive(source.url, { signal });
  }, [catalog, officialUrl, target]);

  return (
    <GameRouteFrame
      game={game}
      loadArchive={loadArchive}
      src={buildZipGamePlayerUrl(buildGameExitHref(game))}
      target={target}
      title={`${displayTitle} playable ScummVM frame`}
    />
  );
}
