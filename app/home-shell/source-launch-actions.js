"use client";

import { beginGameLaunch } from "../game-player/immersive-mode.mjs";
import useLaunchFeedback from "../game-player/useLaunchFeedback";
import useBrowserSave from "../use-browser-save";
import { cancelBrowserSaveQueries } from "../browser-saves.mjs";

export default function SourceLaunchActions({ version, onLaunch, helpId = "game-file-access-help", showAccessHelp = true, browseHref }) {
  const launchFeedback = useLaunchFeedback();
  const slot = useBrowserSave(version.game);
  const needsAccess = version.action.needsAccess;
  const canContinue = slot !== undefined && slot !== null && !version.locate && !needsAccess;
  const launch = (action) => {
    const isPlay = !version.locate && !needsAccess;
    if (isPlay) launchFeedback.show(version.game);
    cancelBrowserSaveQueries();
    onLaunch?.();
    if (isPlay) beginGameLaunch();
    try {
      return Promise.resolve(action()).then((navigated) => {
        if (isPlay && !navigated) launchFeedback.dismiss();
      }, () => launchFeedback.dismiss());
    } catch (error) {
      launchFeedback.dismiss();
      throw error;
    }
  };
  return <>
    {needsAccess && showAccessHelp && <p className="file-access-help" id={helpId}>
      To play, ScummWEB needs to read this game’s ZIP on your device. Choose Allow file access,
      then allow access in the browser prompt. Your game files stay on your device.
    </p>}
    <button type="button" className="launch-button" disabled={version.action.disabled}
      aria-describedby={needsAccess ? helpId : undefined}
      onClick={() => { void launch(canContinue ? version.action.onContinue : version.action.onClick); }}>
      {version.locate ? version.locateLabel : needsAccess ? "Allow file access" : canContinue ? "Continue" : "Play"}
    </button>
    {canContinue && <button type="button" className="secondary-button start-fresh-button"
      disabled={version.action.disabled} onClick={() => { void launch(version.action.onClick); }}>Start from beginning</button>}
    {!canContinue && browseHref && <a className="secondary-button browse-games-button" href={browseHref}>Browse Games</a>}
    {launchFeedback.overlay}
  </>;
}
