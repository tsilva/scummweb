"use client";

import { useState } from "react";
import { Globe, Settings, X } from "lucide-react";
import { bucketZipName, checkGameBucket, normalizeBucketUrl } from "../game-bucket.mjs";
import { bucketGames, checkRemoteGame, remoteGame } from "../game-sources.mjs";

const dialogId = "home-settings";

function openWebSources() {
  document.getElementById(dialogId).showModal();
}

export function SettingsButton() {
  return (
    <button type="button" className="nav-icon-link" aria-label="Game sources"
      aria-haspopup="dialog" aria-controls={dialogId} onClick={openWebSources}>
      <Settings className="icon" aria-hidden="true" />
    </button>
  );
}

export function AddWebGamesButton({ disabled }) {
  return (
    <button type="button" className="secondary-button" disabled={disabled}
      aria-haspopup="dialog" aria-controls={dialogId} onClick={openWebSources}>
      Add from web
    </button>
  );
}

export default function GameBucket({ catalog, officialUrl, saveSources, disabled, buckets, removeBucket }) {
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");

  async function addGames(event) {
    event.preventDefault();
    if (checking || disabled) return;
    setChecking(true);
    setNotice("Checking for game ZIPs…");
    try {
      const baseUrl = normalizeBucketUrl(url);
      if (baseUrl === officialUrl) {
        setNotice("The official games are already in your library.");
        return;
      }

      let sources;
      if (decodeURIComponent(new URL(baseUrl).pathname).toLowerCase().endsWith(".zip")) {
        const game = catalog.find(({ target }) => baseUrl.endsWith(`/${encodeURIComponent(bucketZipName(target))}`));
        const source = remoteGame(baseUrl, game);
        if (!await checkRemoteGame(source)) throw new Error("Could not read this ZIP. Check the link and browser access.");
        sources = [source];
      } else {
        const targets = await checkGameBucket(baseUrl, catalog, officialUrl, { signal: AbortSignal.timeout(12_000) });
        if (!targets.length) throw new Error("No readable game ZIPs found. Check the filenames in the ZIP guide.");
        sources = bucketGames(baseUrl, targets, catalog);
      }

      await saveSources(sources);
      setNotice(`${sources.length} ${sources.length === 1 ? "game" : "games"} saved to your library.`);
      setUrl("");
    } catch (error) {
      setNotice(error instanceof TypeError
        ? "Could not reach this URL. Check that it is public and allows browser access."
        : error.message || "Could not save the games in this browser.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <dialog id={dialogId} className="settings-dialog" aria-labelledby="home-settings-title">
      <div className="settings-dialog-header">
        <h2 id="home-settings-title">Add games from the web</h2>
        <form method="dialog">
          <button type="submit" className="nav-icon-link" aria-label="Close">
            <X className="icon" aria-hidden="true" />
          </button>
        </form>
      </div>
      <div className="game-bucket-body">
        <form className="game-bucket-form" onSubmit={addGames}>
          <label htmlFor="game-bucket-url">Public bucket or ZIP URL</label>
          <div className="game-bucket-actions">
            <input id="game-bucket-url" type="url" required value={url}
              placeholder="https://games.example.com" disabled={checking}
              onChange={(event) => {
                setUrl(event.target.value);
                setNotice("");
              }} />
            <button type="submit" className="game-bucket-button" disabled={checking || disabled}>
              <Globe className="icon" aria-hidden="true" />
              {checking ? "Checking…" : "Add to library"}
            </button>
          </div>
        </form>
        <p role="status" className="game-bucket-notice">{notice}</p>
        {buckets.length > 0 && (
          <ul className="saved-buckets" aria-label="Saved buckets">
            {buckets.map((bucket) => (
              <li key={bucket}>
                <span>{bucket}</span>
                <button type="button" className="game-bucket-button" disabled={checking || disabled}
                  onClick={async () => {
                    try {
                      await removeBucket(bucket);
                      setNotice("Bucket removed from your library.");
                    } catch {
                      setNotice("Could not remove this bucket.");
                    }
                  }}>
                  Remove bucket
                </button>
              </li>
            ))}
          </ul>
        )}
        <details className="game-bucket-guide">
          <summary>Bucket ZIP guide</summary>
          <p>Put one ZIP per game at the bucket root and use the filenames below for discovery.
            Allow cross-origin HEAD and GET requests from ScummWeb.</p>
          <table>
            <thead><tr><th scope="col">Game</th><th scope="col">Required filename</th></tr></thead>
            <tbody>
              {catalog.map(({ target, title }) => (
                <tr key={target}><td>{title}</td><td><code>{bucketZipName(target)}</code></td></tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      <footer className="game-bucket-footer">
        <p>Only connect files you’re allowed to download and play, and share publicly if you host them.</p>
      </footer>
    </dialog>
  );
}
