"use client";

import useBrowserSave from "./use-browser-save";
import LaunchPending from "./launch-pending";

export default function LaunchButton({ game, entryPoint, label = "Play", continueLabel = "Continue", className = "", onLaunch }) {
  const classes = ["launch-button", className].filter(Boolean).join(" ");
  const slot = useBrowserSave(game, !game.importRequired);
  const canContinue = slot !== undefined && slot !== null;
  const href = entryPoint ? `${game.playHref}?launch_from=${entryPoint}` : game.playHref;

  if (game.importRequired) {
    return <button type="button" className={`${classes} game-unavailable`} disabled>Game not included</button>;
  }

  if (slot === undefined) return <LaunchPending className={className} />;

  return (
    <>
      <a className={classes} href={canContinue ? `${href}#continue` : href} onClick={onLaunch}>
        {canContinue ? continueLabel : label}
      </a>
      {canContinue ? (
        <a className="secondary-button start-fresh-button" href={href} onClick={onLaunch}>Start from beginning</a>
      ) : null}
    </>
  );
}
