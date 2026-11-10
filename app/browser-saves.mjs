import { getVersionSaveNamespace, readVersionSaveNamespace } from "./game-versions.mjs";
import { latestPlayerSave, saveIndexKey, saveIndexPrefix, saveRevision, supportsContinue } from "../web-shell/continue-saves.mjs";
import { readCachedSave } from "./browser-save-cache.mjs";
import { editionKey, editionLockName, readSaveTree, saveLockName } from "../web-shell/save-editions.mjs";

const queries = new Map();
const attempts = new Map();
const cancellations = new Set();
let queryGeneration = 0;
let queryQueue = Promise.resolve();

export function cancelBrowserSaveQueries() {
  ++queryGeneration;
  for (const cancel of [...cancellations]) cancel();
}

export async function readBrowserSaveFiles(game) {
  const namespace = game.saveVersionId ? game.saveNamespace || await getVersionSaveNamespace(game.saveVersionId) : "";
  return readSaveFiles(namespace, game.target);
}

function readSaveFiles(namespace, target) {
  const storage = window.localStorage;
  const { files: listing, inode } = readSaveTree(storage, editionKey(namespace, target), namespace);
  const files = Object.entries(listing).flatMap(([name, key]) => {
    const file = inode(key);
    if (file?.type !== 0x8000 || !Number.isFinite(file.modifiedAt) || file.size <= 0) return [];
    if (!storage.getItem(file.dataKey)) return [];
    return [{ name, size: file.size, modifiedAt: file.modifiedAt }];
  });
  return { namespace, files };
}

function readIndex(namespace, game) {
  try {
    const index = JSON.parse(window.localStorage.getItem(saveIndexKey(namespace, game.target)));
    // Unknown imports learn their identity at native startup.
    if (!namespace && (index?.target !== (game.nativeTarget || game.target)
      || (game.engineId && index?.engineId !== game.engineId)
      || (game.gameId && index?.gameId !== game.gameId)
      || (game.extra && index?.extra?.toLowerCase() !== game.extra.toLowerCase()))) return null;
    return index;
  } catch { return null; }
}

function getCachedSave(game, includeContents) {
  try {
    if (game.engineId && !supportsContinue(game.engineId, game.gameId || game.target, game.extra)) return null;
    const namespace = game.saveVersionId ? game.saveNamespace || readVersionSaveNamespace(game.saveVersionId) : "";
    const save = readCachedSave(game, window.localStorage, namespace, includeContents);
    return save && supportsContinue(save.engineId, save.gameId, save.extra) ? save : null;
  } catch { return null; }
}

export function getCachedBrowserSave(game) {
  return getCachedSave(game)?.slot ?? null;
}

export function getCachedBrowserSaveContents(game) {
  return getCachedSave(game, true)?.contents ?? null;
}

async function queryNativeSaves(game, namespace, assetVersion, generation) {
  const gameId = game.gameId || game.target;
  if (!supportsContinue(game.engineId, gameId, game.extra) || !gameId || typeof document === "undefined") return Promise.resolve(null);
  const locks = await window.navigator?.locks?.query();
  const edition = editionKey(namespace, game.target);
  if (generation !== queryGeneration || locks?.held.some(({ name, mode }) =>
    name === editionLockName(edition) || name === saveLockName && (!edition || mode !== "shared"))) return null;
  return new Promise((resolve) => {
    const query = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Checking saved games";
    const url = new URL("/scummvm.html", window.location.href);
    const target = game.nativeTarget || game.target || game.gameId;
    for (const [key, value] of Object.entries({ saveQuery: query, saveEngine: game.engineId,
      saveGameId: gameId, saveTarget: target, saveExtra: game.extra, saveNamespace: namespace,
      catalogSaveTarget: namespace ? null : game.target, v: assetVersion })) {
      if (value) url.searchParams.set(key, value);
    }
    url.hash = target;
    const finish = (result) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      cancellations.delete(cancel);
      frame.remove();
      resolve(result);
    };
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow
        || !["scummweb:saves-listed", "scummweb:saves-query-error"].includes(event.data?.type) || event.data.query !== query) return;
      const result = event.data.type === "scummweb:saves-listed" ? event.data : null;
      if (result?.persisted && game.engineId === "ags") {
        try {
          const index = readIndex(namespace, game);
          if (index?.revision === result.revision) {
            window.localStorage.setItem(saveIndexKey(namespace, game.target), JSON.stringify({ ...index, checkedByRuntime: assetVersion }));
          }
        } catch { /* A save query still succeeds if the browser cannot update its cache. */ }
      }
      finish(result);
    }
    const cancel = () => finish(null);
    const timer = window.setTimeout(() => finish(null), 45000);
    window.addEventListener("message", receive);
    cancellations.add(cancel);
    frame.src = url.href;
    document.body.appendChild(frame);
  });
}

export async function getLatestBrowserSave(game, assetVersion) {
  try {
    const { namespace, files } = await readBrowserSaveFiles(game);
    if (!files.length) return null;
    const key = saveIndexKey(namespace, game.target);
    let index = readIndex(namespace, game);
    const revision = saveRevision(files);
    // Older AGS queries could fail before inspecting save files. Reconcile an
    // empty index once with the current runtime even when the files match it.
    const uncheckedAgs = index?.engineId === "ags" && index.checkedByRuntime !== assetVersion
      && !latestPlayerSave(index, files);
    if (index?.schemaVersion !== 1 || index.revision !== revision || uncheckedAgs) {
      const queryKey = `${key}:${revision}`;
      if (!queries.has(queryKey) && Date.now() - (attempts.get(key) || 0) >= 30000) {
        const generation = queryGeneration;
        // Engine modules are large: never boot several save-query runtimes at once.
        const request = queryQueue.then(() => {
          if (generation !== queryGeneration || saveRevision(readSaveFiles(namespace, game.target).files) !== revision) return null;
          attempts.set(key, Date.now());
          return queryNativeSaves({ ...game,
          engineId: index?.engineId || game.engineId, gameId: index?.gameId || game.gameId,
          extra: index?.extra ?? game.extra, nativeTarget: index?.target }, namespace, assetVersion, generation);
        });
        queryQueue = request.catch(() => null);
        queries.set(queryKey, request);
        void request.finally(() => queries.delete(queryKey)).catch(() => {});
      }
      await queries.get(queryKey);
    }
    // Re-read after native work: another player tab or a restore may have
    // changed storage while the runtime was loading.
    const current = await readBrowserSaveFiles(game);
    index = readIndex(namespace, game);
    return latestPlayerSave(index, current.files)?.slot ?? null;
  } catch {
    return null;
  }
}

export function subscribeBrowserSaves(game, assetVersion, notify) {
  let active = true;
  let timer;
  const refresh = () => {
    if (!active) return;
    notify();
    if (timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      void getLatestBrowserSave(game, assetVersion).finally(() => { if (active) notify(); });
    }, 50);
  };
  const onStorage = (event) => {
    if (event.key == null || event.key === "/" || event.key.startsWith(saveIndexPrefix)
      || event.key.startsWith("scummweb.save-namespace.v1:") || /^[a-f0-9-]{36}$/i.test(event.key)) refresh();
  };
  window.addEventListener("storage", onStorage);
  for (const event of ["pageshow", "focus", "scummweb:saves-changed"]) window.addEventListener(event, refresh);
  refresh();
  return () => {
    active = false;
    window.clearTimeout(timer);
    window.removeEventListener("storage", onStorage);
    for (const event of ["pageshow", "focus", "scummweb:saves-changed"]) window.removeEventListener(event, refresh);
  };
}
