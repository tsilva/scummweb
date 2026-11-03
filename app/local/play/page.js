import LocalPlayFrame from "./local-play-frame";

export const metadata = {
  title: "Play a game ZIP | ScummWEB",
  robots: { index: false, follow: false },
};

export default function LocalPlayPage() {
  return (
    <main className="game-route-page">
      <LocalPlayFrame />
    </main>
  );
}
