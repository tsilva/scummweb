"use client";

import { useEffect, useRef, useState } from "react";
import LaunchButton from "../launch-button";
import DecorativeImage from "./decorative-image";
import Icon from "./shell-icon";
import { getDialogLinkProps, getGameDialogId, getHeroImageStyle } from "./shared";

export default function GameDetailModal({ game, sourceAction, sourceId, notice, onClose }) {
  const dialogId = sourceId ? `source-game-${sourceId}` : getGameDialogId(game);
  const dialog = useRef(null);
  const syncDialog = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const modalImage = game.heroImage || game.landscapeImage || game.posterImage;
  const metadata = [
    ["Studio", game.studio],
    ["Release", game.year],
    ["Genre", game.genre],
    ["Collection", game.tag],
    ["Platform", game.platform],
    ["Language", game.language],
    ["Edition", game.edition],
  ].filter(([, value]) => value);

  useEffect(() => {
    const panel = dialog.current;
    let opener;
    let trigger;
    let previousOverflow;

    function rememberTrigger(event) {
      const link = event.target.closest?.("a[href]");
      if (link?.hash === `#${dialogId}`) trigger = link;
    }

    function sync() {
      const open = Boolean(onClose) || window.location.hash === `#${dialogId}`;
      setIsOpen(open);
      if (open && !panel.open) {
        opener = trigger ?? document.activeElement;
        trigger = null;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        panel.showModal();
        panel.querySelector(".game-detail-close")?.focus({ preventScroll: true });
      } else if (!open && panel.open) {
        panel.close();
        document.body.style.overflow = previousOverflow;
        opener?.focus({ preventScroll: true });
      }
    }

    syncDialog.current = sync;
    sync();
    document.addEventListener("click", rememberTrigger, true);
    window.addEventListener("hashchange", sync);
    return () => {
      syncDialog.current = null;
      document.removeEventListener("click", rememberTrigger, true);
      window.removeEventListener("hashchange", sync);
      if (panel.open) {
        panel.close();
        document.body.style.overflow = previousOverflow;
        opener?.focus({ preventScroll: true });
      }
    };
  }, [dialogId, onClose]);

  function close() {
    if (onClose) onClose();
    else {
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#library`);
      syncDialog.current?.();
    }
  }

  return (
    <dialog ref={dialog} className="game-detail-modal" data-game-target={game.target} id={dialogId}
      aria-labelledby={`${dialogId}-title`} onCancel={(event) => { event.preventDefault(); close(); }}>
      <button
        type="button"
        aria-label={`Close details for ${game.displayTitle}`}
        className="game-detail-backdrop"
        tabIndex={-1}
        onClick={close}
      />
      <div
        className={`game-detail-panel ${game.tone}`}
      >
        <div className="game-detail-visual">
          {modalImage ? <DecorativeImage
            className="game-detail-visual-image"
            fetchPriority="low"
            loading="lazy"
            src={modalImage}
            style={getHeroImageStyle(game.heroImagePosition)}
          /> : null}
          <button
            type="button"
            aria-label={`Close details for ${game.displayTitle}`}
            className="game-detail-close"
            onClick={close}
          >
            ×
          </button>
          <div className="game-detail-visual-copy">
            <p className="hero-kicker">{game.eyebrow}</p>
            <h2 id={`${dialogId}-title`}>{game.displayTitle}</h2>
            <div className="game-detail-visual-meta">
              <span>{game.year}</span>
              <span>{game.genre}</span>
              <span>{game.badge}</span>
            </div>
            <p className="game-detail-summary">{game.summary}</p>

            <div className="game-detail-actions">
              {sourceAction ? (
                <button type="button" className="launch-button" disabled={sourceAction.disabled} onClick={sourceAction.onClick}>
                  {sourceAction.label}
                </button>
              ) : isOpen ? (
                <LaunchButton game={game} entryPoint="library" />
              ) : null}
              {game.infoHref ? (
                <a
                  className="secondary-button game-detail-license"
                  href={game.infoHref}
                  {...getDialogLinkProps(game.infoHref)}
                >
                  <Icon name="info" />
                  <span>Readme / License</span>
                </a>
              ) : null}
            </div>
            {notice ? <p role="status">{notice}</p> : null}
            {sourceAction ? <p className="game-detail-save-hint">Load saved progress from the game’s menu after launching.</p> : null}
          </div>
        </div>

        <div className="game-detail-copy">
          <dl className="game-detail-metadata">
            {metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>

          {game.screenshots.length > 0 ? (
            <div className="game-detail-strip" aria-label={`${game.displayTitle} screenshots`}>
              {game.screenshots.map((shot, index) => (
                <div
                  key={shot}
                  className="game-detail-shot"
                  title={`${game.displayTitle} screenshot ${index + 1}`}
                >
                  <DecorativeImage className="game-detail-shot-image" src={shot} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
