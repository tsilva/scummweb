import { getGameLibrary } from "../game-library";
import LegacyLaunch from "./legacy-launch";

export const metadata = { robots: { index: false, follow: false } };

export default function LegacyPlayPage() {
  const { games, primaryTarget } = getGameLibrary();
  return <LegacyLaunch routes={Object.fromEntries(games.map(({ target, playHref }) => [target, playHref]))}
    primaryTarget={primaryTarget} />;
}
