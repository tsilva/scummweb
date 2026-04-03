import { notFound } from "next/navigation";
import {
  getGameBySlug,
  getGameLibrary,
} from "../game-library";
import { buildVersionedAssetPath } from "../asset-paths";
import { getGamePresentation } from "../game-presentation";
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
      title: "Game Not Found | scummweb",
    };
  }

  return {
    title: `${game.displayTitle} | scummweb`,
    description: `Launch ${game.displayTitle} directly from its dedicated scummweb route.`,
  };
}

export default async function GameRoutePage({ params }) {
  const game = await getGameBySlug(params.gameSlug);

  if (!game) {
    notFound();
  }

  const presentedGame = getGamePresentation(game);

  const launchHref = buildVersionedAssetPath("/scummvm.html", {
    searchParams: { exitTo: "/" },
    hash: game.target,
  });

  return (
    <main className="game-route-page">
      <GameRouteFrame
        game={presentedGame}
        skipIntro={game.skipIntro}
        src={launchHref}
        target={game.target}
        title={`${game.displayTitle} playable ScummVM frame`}
      />
    </main>
  );
}
