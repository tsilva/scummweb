import bundledArchives from "../data/bundled-game-files.json" with { type: "json" };

// Manuals, licenses and DOS launchers do not change the game ScummVM runs.
// Keep every other file, including speech, translations and engine resources.
export function gameDataFiles(files) {
  const data = files.filter(([name]) => !/(?:^|\/)(?:readme|license|copying)(?:[.-][^/]*)?$|\.(?:txt|md|pdf|html?|exe|com|bat|cfg|ini)$/i.test(name)
    && !/(?:^|\/)dvd-cover\.zip$/i.test(name))
    .map(([name, size, crc]) => [name.replaceAll("\\", "/").toLowerCase(), size, crc]);
  // Ignore enclosing folders even when a README sits outside the game folder.
  while (data.length && data.every(([name]) => name.includes("/") && name.split("/")[0] === data[0][0].split("/")[0])) {
    for (const file of data) file[0] = file[0].slice(file[0].indexOf("/") + 1);
  }
  return data.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
}

const bundledData = new Map(Object.entries(bundledArchives.games)
  .map(([target, archive]) => [target, JSON.stringify(gameDataFiles(archive.files))]));

export function findBundledGame(source, catalog, archives = bundledArchives.games) {
  const files = source.archiveFiles && gameDataFiles(source.archiveFiles);
  if (files && !files.length) return null;
  const signature = files && JSON.stringify(files);
  const matches = catalog.filter((game) => {
    if (game.importRequired) return false;
    const archive = archives[game.target];
    if (!archive) return false;
    return files ? signature === (archives === bundledArchives.games ? bundledData.get(game.target)
      : JSON.stringify(gameDataFiles(archive.files)))
      : source.fingerprint && source.fingerprint === archive.fingerprint;
  });
  // An ambiguous signature must never silently pick a different edition.
  return matches.length === 1 ? matches[0] : null;
}
