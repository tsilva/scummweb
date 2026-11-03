"use client";

import { useCallback } from "react";
import { bucketStorageKey, readBucketGameArchive, readSavedBucket } from "../../../game-bucket.mjs";
import GameRouteFrame from "../../../game-route-frame";
import { buildZipGamePlayerUrl } from "../../../home-shell/zip-game-player";

const playerUrl = buildZipGamePlayerUrl("/#library");

export default function BucketPlayFrame({ game, officialUrl }) {
  const { target, displayTitle } = game;
  const loadArchive = useCallback((signal) => {
    let bucket;
    try {
      bucket = readSavedBucket(window.localStorage.getItem(bucketStorageKey), [{ target }]);
    } catch {
      // An unavailable or invalid saved selection can be replaced from Settings.
    }
    if (!bucket || bucket.url === officialUrl) {
      throw new Error("Open Settings in the Library and save a game bucket containing this game.");
    }
    return readBucketGameArchive(bucket.url, target, { signal });
  }, [officialUrl, target]);

  return (
    <GameRouteFrame
      game={game}
      loadArchive={loadArchive}
      src={playerUrl}
      target={target}
      title={`${displayTitle} playable ScummVM frame`}
    />
  );
}
