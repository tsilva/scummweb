"use client";

import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { compatibilityStatusLabels, filterCompatibilityEntries, getCompatibilitySummary } from "../../lib/game-compatibility.mjs";

export default function CompatibilityView({ entries: allEntries, recordedOn, upstreamReference, standalone = false, active = true, onClose }) {
  const results = useRef(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const entries = active ? filterCompatibilityEntries(allEntries, { query, status }) : [];
  const summary = getCompatibilitySummary(allEntries);
  const filters = [
    ["all", "All entries", summary.total],
    ["startup-verified", "Startup verified", summary.verified],
    ["startup-warning", "With warnings", summary.warnings],
    ["startup-failed", "Startup failed", summary.failed],
    ["not-tested", "Not yet tested", summary.untested],
  ];
  const recordedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(recordedOn));
  const Heading = standalone ? "h1" : "h2";
  const titleId = standalone ? "compatibility-page-title" : "compatibility-title";
  const descriptionId = standalone ? "compatibility-page-description" : "compatibility-description";

  function resetScroll() {
    if (results.current) results.current.scrollTop = 0;
  }

  return (
    <div className={standalone ? "compatibility-panel compatibility-page-panel" : "compatibility-panel"}>
      <div className="compatibility-heading">
        <div>
          <p className="compatibility-kicker">Know before you play</p>
          <Heading id={titleId}>Game compatibility</Heading>
        </div>
        {onClose && <button type="button" className="nav-icon-link" aria-label="Close game compatibility" onClick={onClose} autoFocus>
          <X className="icon" aria-hidden="true" />
        </button>}
      </div>
      <p id={descriptionId} className="compatibility-description">
        Startup verified means an edition reached a startup screen, menu, original game prompt, or first scene.
        Warnings and failures describe ScummVM or ScummWEB limitations. Problems caused by missing or mismatched game files are excluded.
        Full-game play and every feature have not been verified.
      </p>
      <p className="compatibility-updated">
        {summary.checked} editions checked · {summary.checkedGames} games · Updated <time dateTime={recordedOn}>{recordedDate}</time>
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
              <li key={`${entry.gameId}:${entry.title}:${entry.edition ?? ""}`}>
                <div className="compatibility-game">
                  <strong>{entry.href ? <a href={entry.href}>{entry.title}</a> : entry.title}</strong>
                  {entry.edition ? <span className="compatibility-edition">{entry.edition.replace(/\.zip$/i, "")}</span> : null}
                  <span className="compatibility-game-ids">{entry.gameId}</span>
                  {entry.observation ? <p className="compatibility-observation">{entry.observation}</p> : null}
                  {entry.history?.length > 1 ? (
                    <details className="compatibility-history">
                      <summary>Earlier checks</summary>
                      <ul>{entry.history.slice(0, -1).map((check, index) => (
                        <li key={`${check.recordedOn}:${index}`}>
                          <time dateTime={check.recordedOn}>{check.recordedOn}</time>
                          {" · "}{compatibilityStatusLabels[check.status]}: {check.observation}
                        </li>
                      ))}</ul>
                    </details>
                  ) : null}
                </div>
                <div className="compatibility-game-status">
                  <span className={`compatibility-badge ${entry.status}`}>
                    {compatibilityStatusLabels[entry.status]}
                  </span>
                  {entry.upstreamRating ? <small>ScummVM: {entry.upstreamRating}</small> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="compatibility-empty">No games match. Try another search or status.</p>}
      </div>
      {!standalone && <p className="compatibility-reference"><a href="/compatibility">View the full compatibility page</a></p>}
      <p className="compatibility-reference">
        Where available, untested games show ratings from the <a href={upstreamReference.url} target="_blank" rel="noreferrer">ScummVM {upstreamReference.version} chart</a>.
        {" "}{upstreamReference.scope}
      </p>
    </div>
  );
}
