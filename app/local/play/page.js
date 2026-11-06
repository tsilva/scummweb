import LocalPlayFrame from "./local-play-frame";
import { getGameLibrary } from "../../game-library";

export const metadata = {
  title: "Play a game | ScummWEB",
  robots: { index: false, follow: false },
};

export default function LocalPlayPage() {
  return (
    <main className="game-route-page">
      <LocalPlayFrame catalog={getGameLibrary().games} />
    </main>
  );
}
