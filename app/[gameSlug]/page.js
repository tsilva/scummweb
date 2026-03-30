import { notFound } from "next/navigation";
import { getGameBySlug, getVersionedScummvmAssetPath } from "../game-library";

export const dynamic = "force-dynamic";

function getGameInfoHref(game) {
  return game.readmeHref || getVersionedScummvmAssetPath("/source.html");
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

  const launchHref = `${getVersionedScummvmAssetPath("/scummvm.html")}#${encodeURIComponent(
    game.target
  )}`;
  const infoHref = getGameInfoHref(game);

  return (
    <main className="game-route-page">
      <div className="game-route-toolbar">
        <a className="game-route-pill" href="/">
          Back To Library
        </a>

        <div className="game-route-meta">
          <span className="game-route-label">Launching</span>
          <strong>{game.displayTitle}</strong>
        </div>

        <a className="game-route-pill" href={infoHref} rel="noreferrer" target="_blank">
          Game Info
        </a>
      </div>

      <iframe
        allow="autoplay; fullscreen"
        allowFullScreen
        className="game-route-frame"
        data-scummvm-route-frame="true"
        data-scummvm-target={game.target}
        loading="eager"
        src={launchHref}
        title={`${game.displayTitle} playable ScummVM frame`}
      />
    </main>
  );
}
