"use client";

import { buildVersionedAssetPath } from "../asset-paths";

function versionSavePath(saveNamespace) {
  if (saveNamespace && !/^version-[a-f0-9]{64}$/.test(saveNamespace)) throw new Error("Invalid game save namespace");
  return saveNamespace ? `/home/web_user/.local/share/scummvm/saves/${saveNamespace}` : null;
}

export function buildZipGamePlayerUrl(exitTo, { saveNamespace } = {}) {
  const savePath = versionSavePath(saveNamespace);
  return buildVersionedAssetPath("/scummvm.html", {
    searchParams: { localGame: "1", exitTo, saveNamespace },
    hash: "--path=/local-game --recursive --auto-detect" + (savePath ? ` --savepath=${savePath}` : ""),
  });
}

export function sendZipGameFiles(playerWindow, files, { saveNamespace } = {}) {
  const savePath = versionSavePath(saveNamespace);
  // ScummVM validates --savepath before its save manager can create it.
  // The ready message arrives after the shell mounts persistent browser storage.
  if (savePath) playerWindow.FS.mkdirTree(savePath);
  playerWindow.postMessage(
    { type: "scummweb:local-game-files", files },
    window.location.origin,
    files.flatMap(({ data }) => data ? [data.buffer] : [])
  );
}
