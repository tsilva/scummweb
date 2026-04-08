import {
  getVersionedSiteAssetPath,
} from "./game-library";
import { getHomeShellData, getPresentedGameByTarget } from "./game-page-data";
import HomeShell from "./home-shell";
import SeoJsonLd from "./seo-json-ld";
import {
  buildHomeMetadata,
  buildHomeStructuredData,
  HOME_FEATURED_GAME_TARGET,
} from "./seo";

const scummvmOfficialSite = "https://www.scummvm.org/";
export const dynamic = "force-static";

export async function generateMetadata() {
  const featuredGame = await getPresentedGameByTarget(HOME_FEATURED_GAME_TARGET);
  return buildHomeMetadata(featuredGame);
}

export default async function HomePage() {
  const shellData = await getHomeShellData({
    featuredGameTarget: HOME_FEATURED_GAME_TARGET,
  });

  if (!shellData) {
    throw new Error("Unable to resolve homepage shell data");
  }

  return (
    <>
      <SeoJsonLd data={buildHomeStructuredData(shellData.catalog)} />
      <HomeShell
        catalog={shellData.catalog}
        featuredGame={shellData.featuredGame}
        logoSrc={getVersionedSiteAssetPath("/logo.svg")}
        pageMode="home"
        scummvmVersion={shellData.scummvmVersion}
        scummvmOfficialSite={scummvmOfficialSite}
        sourceInfoDate={shellData.sourceInfoDate}
      />
    </>
  );
}
