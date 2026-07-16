import {
  SCUMMVM_OFFICIAL_SITE_URL,
} from "../lib/site-config.mjs";
import {
  getVersionedSiteAssetPath,
} from "./game-library";
import { getHomeShellData } from "./game-page-data";
import HomeShell from "./home-shell";
import SeoJsonLd from "./seo-json-ld";
import {
  buildHomeMetadata,
  buildHomeStructuredData,
} from "./seo";

export const dynamic = "force-static";

export function generateMetadata() {
  return buildHomeMetadata(getHomeShellData().featuredGame);
}

export default function HomePage() {
  const shellData = getHomeShellData();

  if (!shellData) {
    throw new Error("Unable to resolve homepage shell data");
  }

  return (
    <>
      <SeoJsonLd data={buildHomeStructuredData(shellData.catalog)} />
      <HomeShell
        catalog={shellData.catalog}
        featuredGame={shellData.featuredGame}
        logoSrc={getVersionedSiteAssetPath("/logo-nav.png")}
        pageMode="home"
        scummvmVersion={shellData.scummvmVersion}
        scummvmOfficialSite={SCUMMVM_OFFICIAL_SITE_URL}
        sourceInfoDate={shellData.sourceInfoDate}
      />
    </>
  );
}
