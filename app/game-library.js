import gameLibraryData from "../public/games.json";
import sourceInfoData from "../public/source-info.json";
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { normalizeSkipIntroConfig } from "./skip-intro-config.mjs";

export {
  buildVersionedAssetPath as buildVersionedSiteAssetPath,
  getVersionedScummvmAssetPath,
  getVersionedSiteAssetPath,
  scummvmAssetVersion,
} from "./asset-paths";

export function getGameLibrary() {
  return getBundledGameLibrary(gameLibraryData, {
    emptyLibraryMessage: "No installed game metadata found in public/games.json",
    normalizeSkipIntro: normalizeSkipIntroConfig,
  });
}

export function getGameBySlug(gameSlug) {
  const { games } = getGameLibrary();
  return games.find((game) => game.slug === gameSlug) || null;
}

export function getSourceInfo() {
  return sourceInfoData;
}
