import { notFound } from "next/navigation";
import { SCUMMVM_OFFICIAL_SITE_URL } from "../../lib/site-config.mjs";
import {
  getVersionedSiteAssetPath,
} from "../game-library";
import {
  buildGameMetadata,
  getGameStaticParams,
  getHomeShellData,
  getPresentedGameBySlug,
} from "../game-page-data";
import HomeShell from "../home-shell";
import SeoJsonLd from "../seo-json-ld";
import { buildGameStructuredData } from "../seo";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return getGameStaticParams();
}

export async function generateMetadata({ params }) {
  const { gameSlug } = await params;
  const game = getPresentedGameBySlug(gameSlug);

  if (!game) {
    return {
      title: "Game Not Found | ScummWEB",
    };
  }

  return buildGameMetadata(game);
}

export default async function GameLandingPage({ params }) {
  const { gameSlug } = await params;
  const shellData = getHomeShellData({
    featuredGameSlug: gameSlug,
  });

  if (!shellData) {
    notFound();
  }

  return (
    <>
      <SeoJsonLd data={buildGameStructuredData(shellData.featuredGame)} />
      <HomeShell
        catalog={shellData.catalog}
        featuredGame={shellData.featuredGame}
        logoSrc={getVersionedSiteAssetPath("/logo-nav.png")}
        scummvmVersion={shellData.scummvmVersion}
        scummvmOfficialSite={SCUMMVM_OFFICIAL_SITE_URL}
        sourceInfoDate={shellData.sourceInfoDate}
      />
    </>
  );
}
