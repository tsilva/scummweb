"use client";

import { useRef, useState } from "react";
import { ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { GamePoster } from "./library-cards";
import GameSelectionLink from "./game-selection-link";
import { defaultLibraryQuery, libraryFacet, queryLibrary } from "./library-query.mjs";

// Keep browsing choices across client-side game routes in this tab.
const browsing = { open: false, query: defaultLibraryQuery };

export default function LibraryView({ items, heading, notice, onAddGame, importDisabled, selectedKey }) {
  const [open, setOpen] = useState(() => browsing.open);
  const [query, setQuery] = useState(() => browsing.query);
  const toggle = useRef(null);
  const visible = queryLibrary(items, query);
  const changed = Boolean(query.genre) || query.sort !== defaultLibraryQuery.sort;
  const update = (field) => (event) => {
    browsing.query = { ...query, [field]: event.target.value };
    setQuery(browsing.query);
  };
  function showControls(value) {
    browsing.open = value;
    setOpen(value);
  }

  return (
    <section className="content-band" id="library">
      <div className="section-header library-header">
        <h2 tabIndex={-1}><span className="section-mark" />{heading}</h2>
        <button ref={toggle} type="button" className="secondary-button library-toggle"
          aria-label="Sort and filter games" title="Sort and filter games" data-filtered={Boolean(query.genre)}
          aria-expanded={open} aria-controls="library-controls" onClick={() => showControls(!open)}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          <ChevronDown size={16} aria-hidden="true" className={open ? "is-open" : undefined} />
        </button>
      </div>
      <div id="library-controls" className="library-controls" hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            showControls(false);
            toggle.current?.focus();
          }
        }}>
        <label>Sort by
          <span className="library-select">
            <select value={query.sort} onChange={update("sort")}>
              <option value="name-asc">Name: A–Z</option>
              <option value="name-desc">Name: Z–A</option>
              <option value="year-desc">Release year: newest first</option>
              <option value="year-asc">Release year: oldest first</option>
              <option value="genre-asc">Genre: A–Z</option>
              <option value="studio-asc">Studio: A–Z</option>
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>
        <label>Genre
          <span className="library-select">
            <select value={query.genre} onChange={update("genre")}>
              <option value="">All genres</option>
              {libraryFacet(items, "genre").map((genre) => <option key={genre}>{genre}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>
      </div>
      {(open || changed) && <p className="library-results" role="status">Showing {visible.length} of {items.length} games</p>}
      <p className="local-game-status" role="status" data-tone={notice?.tone}>{notice?.message}</p>
      {visible.length === 0 && <div className="library-empty">
        <p>No games match this genre.</p>
      </div>}
      <div className="poster-grid">
        <div className="poster-entry">
          <button type="button" className="poster-card library-add-card" onClick={onAddGame} disabled={importDisabled}>
            <Plus size={36} strokeWidth={1.5} aria-hidden="true" />
            <span className="library-add-title">Add a game</span>
            <span className="library-add-hint library-add-hint-desktop">Click to choose or drag and drop your game ZIPs here.</span>
            <span className="library-add-hint library-add-hint-mobile">Tap to choose your game ZIPs.</span>
          </button>
        </div>
        {visible.map((item) => {
          const { key, game, title, versions } = item;
          const needsFiles = versions.every(({ source, status }) => source && !["available", "session", "permission"].includes(status));
          const fileStatus = versions.every(({ status }) => status === "checking") ? "Checking files"
            : "Locate files";
          return (
            <div className="poster-entry" key={key} data-library-source-ids={JSON.stringify(versions.flatMap(({ source }) => source ? [source.id] : []))}>
              <GameSelectionLink game={game} aria-current={key === selectedKey ? "page" : undefined} className={`poster-card ${game.tone}`} data-game-target={game.target}>
                <GamePoster title={title} image={game.posterImage} editionLabel={game.editionLabel} count={visible.length + 1} />
                {versions.length > 1 && <span className="game-version-count">{versions.length} versions</span>}
                {needsFiles && <span className="source-poster-hint">{fileStatus}</span>}
              </GameSelectionLink>
            </div>
          );
        })}
      </div>
    </section>
  );
}
