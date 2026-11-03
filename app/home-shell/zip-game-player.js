"use client";

import { buildVersionedAssetPath } from "../asset-paths";

export function buildZipGamePlayerUrl(exitTo) {
  return buildVersionedAssetPath("/scummvm.html", {
    searchParams: { localGame: "1", exitTo },
    hash: "--path=/local-game --auto-detect",
  });
}

export function sendZipGameFiles(playerWindow, files) {
  playerWindow.postMessage(
    { type: "scummweb:local-game-files", files },
    window.location.origin,
    files.map(({ data }) => data.buffer)
  );
}
