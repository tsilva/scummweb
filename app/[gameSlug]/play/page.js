import { notFound } from "next/navigation";
import { buildVersionedAssetPath } from "../../asset-paths";
import {
  buildPlayRouteMetadata,
  getGameStaticParams,
  getPresentedGameBySlug,
} from "../../game-page-data";
import GameRouteFrame from "../../game-route-frame";

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
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return buildPlayRouteMetadata(game);
}

export default async function GamePlayRoutePage({ params }) {
  const { gameSlug } = await params;
  const game = getPresentedGameBySlug(gameSlug);

  if (!game) {
    notFound();
  }

  const launchHref = buildVersionedAssetPath("/scummvm.html", {
    searchParams: { exitTo: game.href },
    hash: game.target,
  });

  return (
    <main className="game-route-page">
      <GameRouteFrame
        game={game}
        skipIntro={game.skipIntro}
        src={launchHref}
        target={game.target}
        title={`${game.displayTitle} playable ScummVM frame`}
      />
    </main>
  );
}
