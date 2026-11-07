import { getGamePresentation, getImportedGamePresentation } from "./game-presentation.js";
import { getGameFamilyKey, getVersionMetadata, getVersionSaveNamespace } from "./game-versions.mjs";
import { readRemoteGameArchive } from "./game-bucket.mjs";
import { isLocalZipSource } from "./game-sources.mjs";
import { openLocalGameZip, validateGameZip, maxLocalGameSize } from "./local-game-archive.mjs";

export function getGamePlayHref(game, recognizedGames = []) {
  const family = game && getGameFamilyKey(game);
  const route = family && recognizedGames.find((entry) => getGameFamilyKey(entry) === family);
  return route?.playHref || game?.playHref || (game?.slug ? `/${encodeURIComponent(game.slug)}/play` : "/local/play");
}

// Share identity and route matching between library launches and reopened players.
export function getSourceGamePresentation(source, catalog, recognizedGames) {
  const knownGame = catalog.find(({ target }) => target === source.target)
    ?? getImportedGamePresentation(/\.zip$/i.test(source.name) ? source.name : source.name + ".zip");
  const title = knownGame?.displayTitle ?? source.name.replace(/\.zip$/i, "");
  const presentation = knownGame ?? getGamePresentation({ displayTitle: title }, {
    summary: "Play this game from your library.", badge: "Library game",
  });
  const family = getGameFamilyKey(presentation);
  const route = family && recognizedGames.find((game) => getGameFamilyKey(game) === family);
  return { ...presentation, href: route?.href, slug: route?.slug, playHref: route?.playHref,
    saveVersionId: source.id, skipIntro: null };
}

export function getMatchingGameSources(game, sources, catalog) {
  const family = getGameFamilyKey(game);
  if (!family) return [];
  return sources.filter((source) => getGameFamilyKey(getSourceGamePresentation(source, catalog, [game])) === family);
}

export async function prepareGameSourcePlayer(source, game, { legacySaves = false } = {}) {
  const presentation = { ...game, ...getVersionMetadata(game, source.name, source.archiveFiles),
    recentGameId: `source:${source.id}`, saveVersionId: legacySaves ? undefined : source.id,
    saveNamespace: legacySaves ? undefined : await getVersionSaveNamespace(source.id), skipIntro: null };
  return {
    game: presentation,
    loadArchive: async (signal, onProgress) => {
      signal.throwIfAborted();
      if (source.url) return readRemoteGameArchive(source.url, { signal, onProgress });
      if (!isLocalZipSource(source) || !source.handle) throw new Error("Locate the game ZIP to play again.");
      if (await source.handle.queryPermission({ mode: "read" }) !== "granted") {
        throw new Error("Allow file access to play this game.");
      }
      const file = await source.handle.getFile();
      validateGameZip(file, maxLocalGameSize);
      return openLocalGameZip(file, signal, onProgress);
    },
  };
}
