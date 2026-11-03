"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Settings, X } from "lucide-react";
import {
  bucketStorageKey,
  bucketZipName,
  checkGameBucket,
  normalizeBucketUrl,
  readBucketGameArchive,
  readSavedBucket,
} from "../game-bucket.mjs";
import { useZipGamePlayer, ZipGameFrame } from "./zip-game-player";
import LibraryCards, { bucketOnlyGames } from "./library-cards";

const settingsDialogId = "home-settings";

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

export default function GameBucket({ catalog, officialUrl }) {
  const games = useMemo(() => [...catalog, ...bucketOnlyGames], [catalog]);
  const playerSection = useRef(null);
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(null);
  const [checked, setChecked] = useState(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const { player, showPlayer, opening, status, openArchive, closePlayer } = useZipGamePlayer();

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
    setSaved(bucket);
    setChecked(null);
    setUrl(bucket?.url ?? "");
    try {
      if (bucket) {
        window.localStorage.setItem(bucketStorageKey, JSON.stringify(bucket));
      } else {
        window.localStorage.removeItem(bucketStorageKey);
      }
      setNotice(bucket ? "Bucket saved in this browser." : "Bucket removed.");
    } catch {
      setNotice("Browser storage is unavailable. This change applies for this visit.");
    }
  }

  const result = checked?.targets.length ? checked : saved;
  const matches = result ? games.filter(({ target }) => result.targets.includes(target)) : [];
  const isOfficial = result?.url === officialUrl;
  const playing = opening || showPlayer;
  const bucketTargets = saved && saved.url !== officialUrl ? saved.targets : [];
  const libraryGames = [
    ...catalog,
    ...bucketOnlyGames.filter(({ target }) => bucketTargets.includes(target)),
  ];

  function playFromBucket({ target }) {
    openArchive(() => readBucketGameArchive(saved.url, target), "Downloading ZIP…");
    playerSection.current.scrollIntoView({ block: "nearest" });
  }

  return (
    <>
      <dialog id={settingsDialogId} className="settings-dialog" aria-labelledby="home-settings-title">
        <div className="settings-dialog-header">
          <h2 id="home-settings-title">Settings</h2>
          <form method="dialog">
            <button type="submit" className="nav-icon-link" aria-label="Close settings">
              <X className="icon" aria-hidden="true" />
            </button>
          </form>
        </div>
        <h3>Connect a game bucket{saved ? " · Bucket saved" : ""}</h3>
        <form className="game-bucket-form" onSubmit={check}>
          <label htmlFor="game-bucket-url">Public bucket URL</label>
          <div className="game-bucket-actions">
            <input
              id="game-bucket-url"
              type="url"
              required
              value={url}
              placeholder="https://games.example.com"
              aria-describedby="game-bucket-help"
              disabled={checking || playing}
              onChange={(event) => {
                setUrl(event.target.value);
                setChecked(null);
                setNotice("");
              }}
            />
            <button type="submit" className="secondary-button" disabled={checking || playing}>
              Check bucket
            </button>
          </div>
          <p id="game-bucket-help">
            Put one ZIP per game at the bucket root. Use the exact filenames below and allow
            browser access from ScummWeb.
          </p>
        </form>

        <details className="game-bucket-glossary">
          <summary>ZIP filename glossary · {games.length} games</summary>
          <table>
            <thead><tr><th scope="col">Game</th><th scope="col">Required filename</th></tr></thead>
            <tbody>
              {games.map(({ target, title }) => (
                <tr key={target}><td>{title}</td><td><code>{bucketZipName(target)}</code></td></tr>
              ))}
            </tbody>
          </table>
        </details>

        <p className="local-game-status" role="status">{notice}</p>
        {result && (
          <section className="game-bucket-matches" aria-label="Bucket matches">
            <h4>{matches.length} of {games.length} games {checked?.targets.length ? "found" : "saved"}</h4>
            {isOfficial && <p>These games are already in the Library. Use the existing game cards to play.</p>}
            <ul>
              {matches.map(({ target, displayTitle }) => <li key={target}>{displayTitle}</li>)}
            </ul>
            {checked?.targets.length ? (
              <button type="button" className="secondary-button" onClick={() => save(checked)}>
                Use this bucket
              </button>
            ) : (
              <button type="button" className="secondary-button" disabled={checking || playing} onClick={() => save(null)}>
                Remove bucket
              </button>
            )}
          </section>
        )}
      </dialog>
      <div ref={playerSection}>
        <p className="local-game-status" role="status">{status}</p>
        {showPlayer && (
          <>
            <button type="button" className="secondary-button" onClick={closePlayer}>Close player</button>
            <ZipGameFrame player={player} title="ScummVM bucket game" />
          </>
        )}
      </div>
      <LibraryCards games={libraryGames} bucketTargets={bucketTargets} disabled={playing} onPlay={playFromBucket} />
    </>
  );
}
