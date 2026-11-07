"use client";

import { useRouter } from "next/navigation";
import { beginMobileGameLaunch } from "./game-player/immersive-mode.mjs";
import useLaunchFeedback from "./game-player/useLaunchFeedback";
import useBrowserSave from "./use-browser-save";
import { cancelBrowserSaveQueries } from "./browser-saves.mjs";

export default function LaunchButton({ game, entryPoint, label = "Play", continueLabel = "Continue", className = "", onLaunch, browseHref }) {
  const router = useRouter();
  const launchFeedback = useLaunchFeedback();
  const classes = ["launch-button", className].filter(Boolean).join(" ");
  const slot = useBrowserSave(game, !game.importRequired);
  const canContinue = slot !== undefined && slot !== null;
  const href = entryPoint ? `${game.playHref}?launch_from=${entryPoint}` : game.playHref;
  const launch = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    launchFeedback.show(game);
    cancelBrowserSaveQueries();
    onLaunch?.();
    beginMobileGameLaunch();
    router.push(event.currentTarget.getAttribute("href"));
  };

  if (game.importRequired) {
    return <>
      <button type="button" className={`${classes} game-unavailable`} disabled>Game not included</button>
      {browseHref && <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a>}
    </>;
  }

  return (
    <>
      <a className={classes} href={canContinue ? `${href}#continue` : href} onClick={launch}>
        {canContinue ? continueLabel : label}
      </a>
      {canContinue ? (
        <a className="secondary-button start-fresh-button" href={href} onClick={launch}>Start from beginning</a>
      ) : browseHref ? <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a> : null}
      {launchFeedback.overlay}
    </>
  );
}
