import { findLocalGameSource } from "../local-game-matching.mjs";
import { localGame, saveGameSources } from "../game-sources.mjs";
import { collectGameImportNodes, prepareLocalArchive } from "../local-game-import.mjs";
import { findBundledGame } from "./library-items.mjs";

const reconnectStatuses = new Set(["locate", "missing", "permission"]);

export async function importLibraryRoots(selectionRoots, replacing, { catalog, entries, sourcePresentation, sessionGames, sessionSources, loadSourcePresentation, setSourcePresentation, updateEntries, setPending, setImportResult }) {
  async function saveLocal(game, known, existing) {
    if (!sourcePresentation?.artwork) setSourcePresentation(await loadSourcePresentation());
    const source = { ...existing, ...localGame(game.handle, game, existing?.id) };
    // A fallback picker must replace a stale saved handle with its fresh in-memory files.
    if (!game.handle) delete source.handle;
    // An archive can replace a legacy folder while retaining its source ID and saves.
    if (game.kind === "zip") delete source.kind;
    try {
      await saveGameSources([source]);
      sessionSources.delete(source.id);
    } catch (error) {
      if (existing && !sessionSources.has(existing.id)) throw error;
      sessionSources.set(source.id, source);
    }
    if (game.handle && !sessionSources.has(source.id)) {
      sessionGames.delete(source.id);
    } else {
      sessionGames.set(source.id, game.data);
    }
    known.set(source.id, source);
    updateEntries([source]);
    return { id: source.id, temporary: sessionSources.has(source.id) };
  }

      setPending([{ index: 0, label: "Finding game ZIPs and ISOs…", message: "Checking dropped files and folders…" }]);
      const roots = await collectGameImportNodes(selectionRoots);
      const known = new Map(entries.map(({ source }) => [source.id, source]));
      const items = [];
      const savedIds = new Set();
      let temporary = 0;
      let scanOrder = 0;
      const reconnectable = new Set(entries.filter(({ source, status }) =>
        !source.url && !sessionGames.has(source.id) && (reconnectStatuses.has(status) || !source.handle)
      ).map(({ source }) => source.id));

      function updateProgress(index, details) {
        const order = ++scanOrder;
        setPending((current) => current.map((item) => item.index === index ? { ...item, ...details, scanOrder: order } : item));
      }

      async function save(game, label = game.name) {
        const reconnect = replacing ?? await findLocalGameSource(game, known.values(), reconnectable);
        const included = findBundledGame(game, catalog);
        if (included && !reconnect) {
          const item = { label, status: "skipped", message: "Already included. Using the bundled copy." };
          items.push(item);
          return item;
        }
        const result = await saveLocal(game, known, reconnect);
        const firstSave = !savedIds.has(result.id);
        savedIds.add(result.id);
        reconnectable.delete(result.id);
        const item = {
          label,
          status: reconnect ? "skipped" : "added",
          message: included ? "Already included. Using the bundled copy. Existing saves are preserved."
            : reconnect ? "Already in your library. Files refreshed." : "Added to your library",
        };
        items.push(item);
        if (firstSave && result.temporary) temporary++;
        return item;
      }

      setPending(roots.map((root, index) => ({ index, label: root.name ?? "Game archive", message: "Waiting to scan…" })));
      try {
        for (const [index, root] of roots.entries()) {
          let label = "Dropped item";
          try {
            const node = await root;
            if (!node) throw new Error("Could not read this item. Try dropping it again.");
            label = node.name;
            updateProgress(index, { label, message: "Checking game files…", value: index, total: roots.length });
            const item = await save(await prepareLocalArchive(node));
            updateProgress(index, item);
          } catch (error) {
            const item = { label, message: error.message, status: "error" };
            items.push(item);
            updateProgress(index, item);
          } finally {
            updateProgress(index, { complete: true });
          }
        }
      } finally {
        setPending([]);
      }

      setImportResult({ savedIds, items, replacing, temporary });
}
