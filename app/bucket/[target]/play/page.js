import { notFound } from "next/navigation";
import { getGamesOrigin } from "../../../../lib/site-config.mjs";
import { getGameLibrary } from "../../../game-library";
import { getPresentedGameByTarget } from "../../../game-page-data";
import BucketPlayFrame from "./bucket-play-frame";

export const dynamic = "force-static";
export const dynamicParams = false;
export const metadata = {
  title: "Play a bucket game | ScummWEB",
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  const { games } = getGameLibrary();
  return games.map(({ target }) => ({ target }));
}

export default async function BucketPlayPage({ params }) {
  const { target } = await params;
  const game = getPresentedGameByTarget(target);
  if (!game) notFound();

  return (
    <main className="game-route-page">
      <BucketPlayFrame game={game} officialUrl={getGamesOrigin()} />
    </main>
  );
}
