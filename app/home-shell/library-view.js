"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleCheck, ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { GamePoster } from "./library-cards";
import GameSelectionLink from "./game-selection-link";
import { defaultLibraryQuery, libraryFacet, queryLibrary } from "./library-query.mjs";
import LibraryEditCard from "./library-edit-card";
import LibraryVersionRemoval from "./library-version-removal";

// Keep browsing choices across client-side game routes in this tab.
const browsing = { open: false, query: defaultLibraryQuery };

export default function LibraryView({ items, heading, notice, onAddGame, importDisabled, selectedKey,
  onRemove, onUndo, removal }) {
  const [open, setOpen] = useState(() => browsing.open);
  const [query, setQuery] = useState(() => browsing.query);
  const toggle = useRef(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [fadingRemoval, setFadingRemoval] = useState(null);
  const [dismissedRemoval, setDismissedRemoval] = useState(null);
  const section = useRef(null);
  const editButton = useRef(null);
  const visible = useMemo(() => queryLibrary(items, query), [items, query]);
  const genres = useMemo(() => libraryFacet(items, "genre"), [items]);
  const changed = Boolean(query.genre) || query.sort !== defaultLibraryQuery.sort;
  useEffect(() => {
    if (!removal) return;
    const fade = setTimeout(() => setFadingRemoval(removal), 5000);
    const dismiss = setTimeout(() => setDismissedRemoval(removal), 5250);
    return () => {
      clearTimeout(fade);
      clearTimeout(dismiss);
    };
  }, [removal]);

  const update = (field) => (event) => {
    browsing.query = { ...query, [field]: event.target.value };
    setQuery(browsing.query);
  };
  function showControls(value) {
    browsing.open = value;
    setOpen(value);
  }

  function editLibrary() {
    setEditing(true);
    requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true }));
  }

  function finishEditing() {
    setEditing(false);
    setRemoving(null);
    editButton.current?.focus({ preventScroll: true });
  }

  async function removeVersions(item, versions) {
    const buttons = [...section.current.querySelectorAll("[data-library-remove]")];
    const index = buttons.indexOf(document.activeElement);
    if (await onRemove(item, versions)) {
      setRemoving(null);
      requestAnimationFrame(() => {
        const remaining = section.current?.querySelectorAll("[data-library-remove]");
        (remaining?.[Math.max(0, Math.min(index, remaining.length - 1))] || editButton.current)?.focus({ preventScroll: true });
      });
    }
  }

  return (
    <section ref={section} className="content-band" id="library" aria-labelledby="game-library-heading" tabIndex={-1}
      data-editing={editing || undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape" && editing && !removing) {
          event.preventDefault(); event.stopPropagation(); finishEditing();
        }
      }}>
      <div className="section-header library-header">
        <h2 id="game-library-heading" tabIndex={-1}><span className="section-mark" />{heading}</h2>
        <button ref={toggle} type="button" className="secondary-button library-toggle"
          aria-label="Sort and filter games" title="Sort and filter games" data-filtered={Boolean(query.genre)}
          aria-expanded={open} aria-controls="library-controls" onClick={() => showControls(!open)}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          <ChevronDown size={16} aria-hidden="true" className={open ? "is-open" : undefined} />
        </button>
        {onRemove && <button ref={editButton} type="button" className={`secondary-button library-edit-toggle${editing ? " library-edit-done" : ""}`}
          aria-pressed={editing} disabled={importDisabled} onClick={editing ? finishEditing : editLibrary}>
          {editing && <Check size={17} aria-hidden="true" />}{editing ? "Done" : "Manage library"}
        </button>}
      </div>
      {editing && <p className="library-edit-help" role="status">Remove imported games without deleting game files or saves. Included games stay in your library.</p>}
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
              <option value="featured">Featured</option>
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
              {genres.map((genre) => <option key={genre}>{genre}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        </label>
      </div>
      {(open || changed) && <p className="library-results" role="status">Showing {visible.length} of {items.length} games</p>}
      <p className="local-game-status" role="status" data-tone={notice?.tone}>{notice?.message}</p>
      {visible.length === 0 && <div className="library-empty">
        <p>{items.length ? "No games match this genre." : "Your library is empty. Add a game to get started."}</p>
      </div>}
      <div className="poster-grid">
        <div className="poster-entry">
          <button type="button" className="poster-card library-add-card" onClick={onAddGame} disabled={importDisabled || editing}>
            <Plus size={36} strokeWidth={1.5} aria-hidden="true" />
            <span className="library-add-title">Add a game</span>
            <span className="library-add-hint library-add-hint-desktop">Click to choose ZIPs or ISOs, or drop game archives and folders here.</span>
            <span className="library-add-hint library-add-hint-mobile">Tap to choose your game ZIPs or ISOs.</span>
          </button>
        </div>
        {visible.map((item) => {
          const { key, game, title, versions } = item;
          const needsFiles = versions.every(({ source, status }) => source && !["available", "session", "permission"].includes(status));
          const fileStatus = versions.every(({ status }) => status === "checking") ? "Checking files"
            : "Locate files";
          return (
            <LibraryEditCard key={key} item={item} editing={editing} disabled={importDisabled || !onRemove} onEdit={editLibrary}
              onRemove={(item) => item.versions.length > 1 ? setRemoving(item) : removeVersions(item, item.versions)}>
              <GameSelectionLink game={game} aria-current={key === selectedKey ? "page" : undefined}
                aria-disabled={editing || undefined} tabIndex={editing ? -1 : undefined} draggable={false}
                className={`poster-card ${game.tone}`} data-game-target={game.target}>
                <GamePoster title={title} image={game.posterImage} editionLabel={game.editionLabel} count={visible.length + 1} />
                {needsFiles && <span className="source-poster-hint">{fileStatus}</span>}
              </GameSelectionLink>
            </LibraryEditCard>
          );
        })}
      </div>
      {removing && <LibraryVersionRemoval item={removing} disabled={importDisabled} notice={notice}
        onRemove={removeVersions} onClose={() => {
          setRemoving(null);
          requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true }));
        }} />}
      {removal && removal !== dismissedRemoval && createPortal(<div className="library-removal-notice"
        data-dismissing={removal === fadingRemoval || undefined} role="status" aria-live="polite" aria-atomic="true">
        <CircleCheck size={22} aria-hidden="true" />
        <span>{removal.title} removed</span>
        <button type="button" disabled={importDisabled} onClick={async () => {
          if (await onUndo()) editButton.current?.focus({ preventScroll: true });
        }}>Undo</button>
      </div>, document.body)}
    </section>
  );
}
