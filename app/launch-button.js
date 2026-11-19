"use client";

import { useRouter } from "next/navigation";
import { beginGameLaunch } from "./game-player/immersive-mode.mjs";
import useLaunchFeedback from "./game-player/useLaunchFeedback";
import useBrowserSave from "./use-browser-save";
import useSaveLaunchBlock from "./use-save-launch-block";
import LaunchPending from "./launch-pending";
import { cancelBrowserSaveQueries } from "./browser-saves.mjs";
import { withDropboxPreview } from "./dropbox/feature.mjs";
import { useDropboxPreviewHref } from "./dropbox/use-preview-href";

export default function LaunchButton({ game, entryPoint, label = "Play", continueLabel = "Continue", className = "", onLaunch, browseHref, primaryOnly = false }) {
  const router = useRouter();
  const launchFeedback = useLaunchFeedback();
  const classes = ["launch-button", className].filter(Boolean).join(" ");
  const slot = useBrowserSave(game, !game.importRequired);
  const canContinue = slot !== undefined && slot !== null;
  const updating = useSaveLaunchBlock(game, !game.importRequired);
  const href = useDropboxPreviewHref(entryPoint ? `${game.playHref}?launch_from=${entryPoint}` : game.playHref);
  const launch = (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (updating) return;
    launchFeedback.show(game);
    cancelBrowserSaveQueries();
    onLaunch?.();
    beginGameLaunch();
    router.push(withDropboxPreview(event.currentTarget.getAttribute("href")));
  };

  if (game.importRequired) {
    return <>
      <button type="button" className={`${classes} game-unavailable`} disabled>Game not included</button>
      {browseHref && <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a>}
    </>;
  }

  return (
    <>
      {updating ? <LaunchPending className={className} /> : <a className={classes} href={canContinue ? `${href}#continue` : href} onClick={launch}>
        {canContinue ? continueLabel : label}
      </a>}
      {!primaryOnly && (canContinue ? (
        <a className="secondary-button start-fresh-button" href={updating ? undefined : href}
          aria-disabled={updating || undefined} onClick={launch}>Start from beginning</a>
      ) : browseHref ? <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a> : null)}
      {launchFeedback.overlay}
    </>
  );
}
