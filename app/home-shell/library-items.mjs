import { catalogGameEntries, getGameFamilyKey, groupGameVersions } from "../game-versions.mjs";
import { findBundledGame } from "../bundled-game-matching.mjs";

export { findBundledGame };

export function libraryItems(catalog, library) {
  const includedFamilies = new Set(catalog.filter((game) => !game.importRequired)
    .map(getGameFamilyKey).filter(Boolean));
  return groupGameVersions([
    ...catalogGameEntries(catalog),
    ...library.filter((entry) => {
      const archiveFiles = entry.archiveFiles ?? entry.source.archiveFiles;
      if (findBundledGame({ ...entry.source, archiveFiles }, catalog)) return false;
      // Legacy imports without readable data default to the included copy.
      // Retain their source and saves; reimporting verifies distinct editions.
      return Boolean(archiveFiles?.length) || !includedFamilies.has(getGameFamilyKey(entry.game));
    })
      .map((entry) => ({ ...entry, key: `source:${entry.source.id}` })),
  ]);
}
