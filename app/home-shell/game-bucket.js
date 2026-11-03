"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, RefreshCw, Settings, X } from "lucide-react";
import {
  bucketStorageKey,
  bucketZipName,
  checkGameBucket,
  getBucketPlayHref,
  normalizeBucketUrl,
  readSavedBucket,
} from "../game-bucket.mjs";
import GameDetailModal from "./game-detail-modal";
import LibraryCards from "./library-cards";
import { getGameDialogId } from "./shared";

const settingsDialogId = "home-settings";
const bucketTabs = [
  { id: "connection", label: "Connection" },
  { id: "guide", label: "ZIP guide" },
];

export function SettingsButton() {
  return (
    <button
      type="button"
      className="nav-icon-link"
      aria-label="Settings"
      aria-haspopup="dialog"
      aria-controls={settingsDialogId}
      onClick={() => document.getElementById(settingsDialogId).showModal()}
    >
      <Settings className="icon" aria-hidden="true" />
    </button>
  );
}

export default function GameBucket({ catalog: games, officialUrl }) {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(null);
  const [checked, setChecked] = useState(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("connection");
  const [dialogId, setDialogId] = useState("");

  useEffect(() => {
    function syncDialog() {
      setDialogId(window.location.hash.slice(1));
    }

    syncDialog();
    window.addEventListener("hashchange", syncDialog);
    return () => window.removeEventListener("hashchange", syncDialog);
  }, []);

  useEffect(() => {
    try {
      const bucket = readSavedBucket(window.localStorage.getItem(bucketStorageKey), games);
      if (bucket) {
        setSaved(bucket);
        setUrl(bucket.url);
      }
    } catch {
      // Storage may be unavailable or contain an obsolete value.
    }
  }, [games]);

  async function check(event) {
    event.preventDefault();
    setChecked(null);
    setChecking(true);
    setNotice("Checking bucket…");
    try {
      const baseUrl = normalizeBucketUrl(url);
      const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
      const targets = await checkGameBucket(baseUrl, games, officialUrl, {
        signal: AbortSignal.timeout(12_000),
        localIndex: isLoopback ? "/games-proxy/index.json" : undefined,
      });
      setChecked({ url: baseUrl, targets });
      setNotice(targets.length
        ? ""
        : "No readable games found. Check the ZIP filenames and bucket access.");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setChecking(false);
    }
  }

  function save(bucket) {
    try {
      if (bucket) {
        window.localStorage.setItem(bucketStorageKey, JSON.stringify(bucket));
      } else {
        window.localStorage.removeItem(bucketStorageKey);
      }
      setSaved(bucket);
      setChecked(null);
      setUrl(bucket?.url ?? "");
      setNotice(bucket ? "Bucket saved in this browser." : "Bucket removed.");
    } catch {
      setNotice("Browser storage is unavailable. The bucket selection could not be changed.");
    }
  }

  function handleTabKeyDown(event) {
    const tab = {
      ArrowLeft: activeTab === "connection" ? "guide" : "connection",
      ArrowRight: activeTab === "connection" ? "guide" : "connection",
      Home: "connection",
      End: "guide",
    }[event.key];
    if (!tab) return;

    event.preventDefault();
    setActiveTab(tab);
    document.getElementById(`game-bucket-tab-${tab}`)?.focus();
  }

  const canSave = Boolean(checked?.targets.length);
  const result = canSave ? checked : saved;
  const matches = result ? games.filter(({ target }) => result.targets.includes(target)) : [];
  const isOfficial = result?.url === officialUrl;
  const bucketTargets = saved && saved.url !== officialUrl ? saved.targets : [];
  const dialogGame = games.find((game) =>
    bucketTargets.includes(game.target) && getGameDialogId(game, { fromBucket: true }) === dialogId
  );

  useEffect(() => {
    if (dialogGame) {
      document.getElementById(dialogId)?.querySelector(".game-detail-close")?.focus({ preventScroll: true });
    }
  }, [dialogGame, dialogId]);

  return (
    <>
      <dialog
        id={settingsDialogId}
        className="settings-dialog"
        aria-labelledby="home-settings-title"
        onClose={() => setActiveTab("connection")}
      >
        <div className="settings-dialog-header">
          <h2 id="home-settings-title">Game bucket</h2>
          <form method="dialog">
            <button type="submit" className="nav-icon-link" aria-label="Close settings">
              <X className="icon" aria-hidden="true" />
            </button>
          </form>
        </div>
        <div className="game-bucket-tabs" role="tablist" aria-label="Game bucket" onKeyDown={handleTabKeyDown}>
          {bucketTabs.map(({ id, label }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`game-bucket-tab-${id}`}
                aria-controls={`game-bucket-panel-${id}`}
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="game-bucket-body">
          <div
            role="tabpanel"
            id="game-bucket-panel-connection"
            aria-labelledby="game-bucket-tab-connection"
            hidden={activeTab !== "connection"}
          >
            <form className="game-bucket-form" onSubmit={check}>
              <label htmlFor="game-bucket-url">Public bucket URL</label>
              <div className="game-bucket-actions">
                <input
                  id="game-bucket-url"
                  type="url"
                  required
                  value={url}
                  placeholder="https://games.example.com"
                  disabled={checking}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setChecked(null);
                    setNotice("");
                  }}
                />
                <button type="submit" className="game-bucket-button" disabled={checking}>
                  <RefreshCw className="icon" aria-hidden="true" />
                  {checking ? "Checking…" : "Check bucket"}
                </button>
              </div>
            </form>

            <div role="status">
              {notice && <p className="game-bucket-notice">{notice}</p>}
              {result && (
                <section className="game-bucket-matches" aria-label="Bucket matches">
                  <span className="game-bucket-match-icon" aria-hidden="true">
                    <Check className="icon" strokeWidth={3} />
                  </span>
                  <ul>
                    {matches.map(({ target, displayTitle }) => (
                      <li key={target}>
                        <strong>{displayTitle}</strong>
                        <code>{bucketZipName(target)}</code>
                      </li>
                    ))}
                  </ul>
                  <p className="game-bucket-count">
                    {matches.length} of {games.length} {canSave ? "found" : "saved"}
                  </p>
                  {isOfficial && (
                    <p className="game-bucket-official">These games are already available in the Library.</p>
                  )}
                </section>
              )}
            </div>
          </div>

          <div
            className="game-bucket-guide"
            role="tabpanel"
            id="game-bucket-panel-guide"
            aria-labelledby="game-bucket-tab-guide"
            tabIndex={0}
            hidden={activeTab !== "guide"}
          >
            <p>
              Put one ZIP per game at the bucket root. Use the exact filenames below and allow
              browser access from ScummWeb.
            </p>
            <table>
              <thead><tr><th scope="col">Game</th><th scope="col">Required filename</th></tr></thead>
              <tbody>
                {games.map(({ target, title }) => (
                  <tr key={target}><td>{title}</td><td><code>{bucketZipName(target)}</code></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="game-bucket-footer">
          <div>
            {saved && <p className="game-bucket-saved">Bucket saved</p>}
            <p id="game-bucket-rights-notice">
              Only connect files you’re allowed to download and play, and share publicly if you host them.
            </p>
          </div>
          {canSave ? (
            <button
              type="button"
              className="game-bucket-button game-bucket-button-primary"
              aria-describedby="game-bucket-rights-notice"
              onClick={() => save(checked)}
            >
              Use this bucket
            </button>
          ) : saved && (
            <button type="button" className="game-bucket-button" disabled={checking} onClick={() => save(null)}>
              Remove bucket
            </button>
          )}
        </footer>
      </dialog>
      <LibraryCards games={games} bucketTargets={bucketTargets} />
      {dialogGame && createPortal(
        <GameDetailModal game={dialogGame} bucketPlayHref={getBucketPlayHref(dialogGame.target)} />,
        document.body
      )}
    </>
  );
}
