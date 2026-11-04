"use client";

import { useEffect, useRef, useState } from "react";
import { ListChecks, Search, X } from "lucide-react";
import compatibility from "../../data/game-compatibility.json";
import { filterCompatibilityEntries, getCompatibilitySummary } from "../../lib/game-compatibility.mjs";

const summary = getCompatibilitySummary(compatibility.entries);
const filters = [
  ["all", "All entries", summary.total],
  ["startup-verified", "Startup verified", summary.verified],
  ["not-tested", "Not yet tested", summary.untested],
];
const recordedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(compatibility.recordedOn));

export default function CompatibilityModal() {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const results = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const entries = isOpen ? filterCompatibilityEntries(compatibility.entries, { query, status }) : [];

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const panel = dialog.current;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (panel.open) panel.close();
    };
  }, [isOpen]);

  function open() {
    dialog.current.showModal();
    setIsOpen(true);
  }

  function close() {
    dialog.current.close();
  }

  function resetScroll() {
    if (results.current) results.current.scrollTop = 0;
  }

  return (
    <>
      <button ref={trigger} type="button" className="nav-icon-link" aria-label="Game compatibility"
        title="Game compatibility" aria-haspopup="dialog" aria-controls="game-compatibility" onClick={open}>
        <ListChecks className="icon" aria-hidden="true" />
      </button>
      <dialog ref={dialog} id="game-compatibility" className="compatibility-modal"
        aria-labelledby="compatibility-title" aria-describedby="compatibility-description"
        onClose={() => { setIsOpen(false); trigger.current?.focus({ preventScroll: true }); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
        onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="compatibility-panel">
          <div className="compatibility-heading">
            <div>
              <p className="compatibility-kicker">Know before you play</p>
              <h2 id="compatibility-title">Game compatibility</h2>
            </div>
            <button type="button" className="nav-icon-link" aria-label="Close game compatibility" onClick={close} autoFocus>
              <X className="icon" aria-hidden="true" />
            </button>
          </div>
          <p id="compatibility-description" className="compatibility-description">
            Startup verified means a game reached a startup screen, menu, or first scene.
            Full-game play and every feature have not been verified.
          </p>
          <p className="compatibility-updated">
            {summary.verified} editions checked · {summary.verifiedGames} games · Updated <time dateTime={compatibility.recordedOn}>{recordedDate}</time>
          </p>
          <label className="compatibility-search">
            <Search className="icon" aria-hidden="true" />
            <span className="compatibility-search-label">Search game compatibility</span>
            <input type="search" value={query} placeholder="Search games, engines, or editions…"
              onChange={(event) => { setQuery(event.target.value); resetScroll(); }} />
          </label>
          <div className="compatibility-filters" role="group" aria-label="Compatibility status">
            {filters.map(([value, label, count]) => (
              <button key={value} type="button" aria-pressed={status === value}
                onClick={() => { setStatus(value); resetScroll(); }}>
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
          <p className="compatibility-count" role="status">{entries.length} {entries.length === 1 ? "entry" : "entries"} shown</p>
          <div className="compatibility-results" ref={results}>
            {entries.length ? (
              <ul aria-label="Game compatibility results">
                {entries.map((entry) => (
                  <li key={`${entry.gameId}:${entry.edition ?? ""}`}>
                    <div className="compatibility-game">
                      <strong>{entry.title}</strong>
                      {entry.edition ? <span className="compatibility-edition">{entry.edition.replace(/\.zip$/i, "")}</span> : null}
                      <span className="compatibility-game-ids">{entry.gameId}</span>
                    </div>
                    <div className="compatibility-game-status">
                      <span className={`compatibility-badge ${entry.status}`}>
                        {entry.status === "startup-verified" ? "Startup verified" : "Not yet tested"}
                      </span>
                      {entry.upstreamRating ? <small>ScummVM: {entry.upstreamRating}</small> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="compatibility-empty">No games match. Try another search or status.</p>}
          </div>
          <p className="compatibility-reference">
            Untested games use ratings from the <a href={compatibility.upstreamReference.url} target="_blank" rel="noreferrer">ScummVM {compatibility.upstreamReference.version} chart</a>.
            {" "}{compatibility.upstreamReference.scope}
          </p>
        </div>
      </dialog>
    </>
  );
}
