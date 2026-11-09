import {
  SCUMMVM_OFFICIAL_SITE_URL,
} from "../lib/site-config.mjs";
import {
  getVersionedSiteAssetPath,
} from "./game-library";
import { getHomeShellData } from "./game-page-data";
import HomeShell from "./home-shell";
import {
  buildHomeMetadata,
} from "./seo";

export const dynamic = "force-static";

export function generateMetadata() {
  return buildHomeMetadata();
}

export default function HomePage() {
  const shellData = getHomeShellData();

  if (!shellData) {
    throw new Error("Unable to resolve homepage shell data");
  }

  // Artwork credits and import aliases are kept in the source catalog.
  const catalog = shellData.catalog.map(({ sources, aliases, ...game }) => game);
  const featuredGame = catalog.find((game) => game.target === shellData.featuredGame.target);

  return (
    <>
      <HomeShell
        catalog={catalog}
        featuredGame={featuredGame}
        logoSrc={getVersionedSiteAssetPath("/logo-nav.png")}
        pageMode="home"
        scummvmVersion={shellData.scummvmVersion}
        scummvmOfficialSite={SCUMMVM_OFFICIAL_SITE_URL}
        sourceInfoDate={shellData.sourceInfoDate}
      />
    </>
  );
}
