"use client";

import { useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { GamePoster } from "./library-cards";
import { getGameDialogId } from "./shared";
import { defaultLibraryQuery, libraryFacet, libraryItems, queryLibrary } from "./library-query.mjs";

export default function LibraryView({ catalog, library, heading, notice, children: renderSource }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(defaultLibraryQuery);
  const toggle = useRef(null);
  const items = libraryItems(catalog, library);
  const visible = queryLibrary(items, query);
  const changed = Boolean(query.genre) || query.sort !== defaultLibraryQuery.sort;
  const update = (field) => (event) => setQuery((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section className="content-band" id="library">
      <div className="section-header library-header">
        <h2><span className="section-mark" />{heading}</h2>
        <button ref={toggle} type="button" className="secondary-button library-toggle"
          aria-label="Sort and filter games" title="Sort and filter games" data-filtered={Boolean(query.genre)}
          aria-expanded={open} aria-controls="library-controls" onClick={() => setOpen(!open)}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          <ChevronDown size={16} aria-hidden="true" className={open ? "is-open" : undefined} />
        </button>
      </div>
      <div id="library-controls" className="library-controls" hidden={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
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
      <p className="local-game-status" role="status">{notice}</p>
      {visible.length === 0 ? <div className="library-empty">
        <p>No games match this genre.</p>
      </div> : <div className="poster-grid">
        {visible.map((item) => {
          const { key, game, title, source } = item;
          if (!source) return (
            <div className="poster-entry" key={key}>
              <a aria-haspopup="dialog" aria-controls={getGameDialogId(game)} className={`poster-card ${game.tone}`} data-game-target={game.target} href={`#${getGameDialogId(game)}`}>
                <GamePoster title={title} image={game.posterImage} />
              </a>
            </div>
          );
          return renderSource(item);
        })}
      </div>}
    </section>
  );
}
