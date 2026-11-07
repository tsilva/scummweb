import { notFound } from "next/navigation";
import { getGamesOrigin } from "../../../lib/site-config.mjs";
import { artworkDelivery } from "../../../lib/artwork-storage.mjs";
import { buildVersionedAssetPath } from "../../asset-paths";
import { bucketZipUrl } from "../../game-bucket.mjs";
import {
  buildPlayRouteMetadata,
  getGameStaticParams,
  getPresentedGameBySlug,
} from "../../game-page-data";
import GameRouteFrame from "../../game-route-frame";
import GamePlayFrame from "../../game-play-frame";
import { getGameLibrary } from "../../game-library";
import { ArtworkDelivery } from "../../home-shell/artwork-delivery";
import { buildGameExitHref } from "../../home-shell/hero-selection.mjs";

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
    searchParams: { exitTo: buildGameExitHref(game), localGame: "1", catalogGame: game.gameId, engine: game.engineId },
    hash: game.target,
  });
  const artwork = artworkDelivery([game]);

  return (
    <main className="game-route-page">
      <ArtworkDelivery value={artwork}>
        <GamePlayFrame key={game.slug} game={game} catalog={getGameLibrary().games} artwork={artwork}
          officialUrl={getGamesOrigin()}>
          {!game.importRequired && <GameRouteFrame
            key={game.slug}
            game={game}
            catalogArchiveUrl={bucketZipUrl(getGamesOrigin(), game.gameId)}
            skipIntro={game.skipIntro}
            src={launchHref}
            target={game.target}
            title={`${game.displayTitle} playable ScummVM frame`}
          />}
        </GamePlayFrame>
      </ArtworkDelivery>
    </main>
  );
}
