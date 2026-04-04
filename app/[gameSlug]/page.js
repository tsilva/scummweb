import { notFound } from "next/navigation";
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

export const dynamic = "force-static";
export const dynamicParams = false;
const scummvmOfficialSite = "https://www.scummvm.org/";

export async function generateStaticParams() {
  return getGameStaticParams();
}

export async function generateMetadata({ params }) {
  const game = await getPresentedGameBySlug(params.gameSlug);

  if (!game) {
    return {
      title: "Game Not Found | scummweb",
    };
  }

  return buildGameMetadata(game);
}

export default async function GameLandingPage({ params }) {
  const shellData = await getHomeShellData({
    featuredGameSlug: params.gameSlug,
  });

  if (!shellData) {
    notFound();
  }

  return (
    <HomeShell
      catalog={shellData.catalog}
      featuredGame={shellData.featuredGame}
      logoSrc={getVersionedSiteAssetPath("/logo.svg")}
      scummvmVersion={shellData.scummvmVersion}
      scummvmOfficialSite={scummvmOfficialSite}
      sourceInfoDate={shellData.sourceInfoDate}
    />
  );
}
