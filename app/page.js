import { randomInt } from "node:crypto";
import {
  getGameLibrary,
  getSourceInfo,
  getVersionedSiteAssetPath,
} from "./game-library";
import { getGamePresentation } from "./game-presentation";
import HomeShell from "./home-shell";

const scummvmOfficialSite = "https://www.scummvm.org/";
export const dynamic = "force-dynamic";

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

function pickFeaturedGame(catalog) {
  if (catalog.length === 0) {
    return null;
  }

  return catalog[randomInt(catalog.length)];
}

export default async function HomePage() {
  const { games } = await getGameLibrary();
  const sourceInfo = await getSourceInfo();

  if (games.length === 0) {
    throw new Error("No installed game metadata found");
  }

  const catalog = games.map(getGamePresentation);
  const featuredGame = pickFeaturedGame(catalog) || catalog[0];
  const scummvmVersion = sourceInfo.scummvm.version
    ? `${sourceInfo.scummvm.version} (${shortCommit(sourceInfo.scummvm.commit)})`
    : shortCommit(sourceInfo.scummvm.commit);

  return (
    <HomeShell
      catalog={catalog}
      featuredGame={featuredGame}
      logoSrc={getVersionedSiteAssetPath("/logo.svg")}
      scummvmVersion={scummvmVersion}
      scummvmOfficialSite={scummvmOfficialSite}
      sourceInfoDate={sourceInfo.generated_at_utc.slice(0, 10)}
    />
  );
}
