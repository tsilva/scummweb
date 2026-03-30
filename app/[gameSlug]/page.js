import { notFound } from "next/navigation";
import {
  buildVersionedSiteAssetPath,
  getGameBySlug,
  getGameLibrary,
} from "../game-library";
import GameRouteFrame from "../game-route-frame";

export const dynamic = "force-static";
export const dynamicParams = false;

export async function generateStaticParams() {
  const { games } = await getGameLibrary();

  return games.map((game) => ({
    gameSlug: game.slug,
  }));
}

export async function generateMetadata({ params }) {
  const game = await getGameBySlug(params.gameSlug);

  if (!game) {
    return {
      title: "Game Not Found | ScummVM Web",
    };
  }

  return {
    title: `${game.displayTitle} | ScummVM Web`,
    description: `Launch ${game.displayTitle} directly from its dedicated ScummVM Web route.`,
  };
}

export default async function GameRoutePage({ params }) {
  const game = await getGameBySlug(params.gameSlug);

  if (!game) {
    notFound();
  }

  const launchHref = buildVersionedSiteAssetPath("/scummvm.html", {
    searchParams: { exitTo: "/" },
    hash: game.target,
  });

  return (
    <main className="game-route-page">
      <GameRouteFrame
        src={launchHref}
        target={game.target}
        title={`${game.displayTitle} playable ScummVM frame`}
      />
    </main>
  );
}
