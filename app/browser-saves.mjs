import { getVersionSaveNamespace } from "./game-versions.mjs";
import { latestPlayerSave, saveIndexKey, saveRevision, supportsContinue } from "../web-shell/continue-saves.mjs";

const saveDirectory = [".local", "share", "scummvm", "saves"];
const queries = new Map();
let queryQueue = Promise.resolve();

function readInode(storage, key) {
  if (!key) return null;
  const value = storage.getItem(key);
  if (!value) return null;
  const binary = atob(value);
  if (binary.length <= 30) return null;
  const metadata = new DataView(Uint8Array.from(binary.slice(0, 30), (byte) => byte.charCodeAt(0)).buffer);
  return { dataKey: binary.slice(30), size: metadata.getUint32(0, true),
    type: metadata.getUint16(4, true) & 0xf000, modifiedAt: metadata.getFloat64(14, true) };
}

function readDirectory(storage, key) {
  const inode = readInode(storage, key);
  if (inode?.type !== 0x4000) return {};
  const bytes = Uint8Array.from(atob(storage.getItem(inode.dataKey) || ""), (byte) => byte.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function readBrowserSaveFiles(game) {
  const namespace = game.saveVersionId ? game.saveNamespace || await getVersionSaveNamespace(game.saveVersionId) : "";
  const storage = window.localStorage;
  let listing = readDirectory(storage, "/");
  for (const folder of namespace ? [...saveDirectory, namespace] : saveDirectory) {
    listing = readDirectory(storage, listing[folder]);
  }
  const files = Object.entries(listing).flatMap(([name, key]) => {
    const inode = readInode(storage, key);
    if (inode?.type !== 0x8000 || !Number.isFinite(inode.modifiedAt) || inode.size <= 0) return [];
    if (!storage.getItem(inode.dataKey)) return [];
    return [{ name, size: inode.size, modifiedAt: inode.modifiedAt }];
  });
  return { namespace, files };
}

function queryNativeSaves(game, namespace, assetVersion) {
  const gameId = game.gameId || game.target;
  if (!supportsContinue(game.engineId, gameId, game.extra) || !gameId || typeof document === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const query = crypto.randomUUID();
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.setAttribute("aria-hidden", "true");
    frame.title = "Checking saved games";
    const url = new URL("/scummvm.html", window.location.href);
    const target = game.nativeTarget || game.target || game.gameId;
    for (const [key, value] of Object.entries({ saveQuery: query, saveEngine: game.engineId,
      saveGameId: gameId, saveTarget: target, saveExtra: game.extra, saveNamespace: namespace, v: assetVersion })) {
      if (value) url.searchParams.set(key, value);
    }
    url.hash = target;
    const finish = (result) => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      frame.remove();
      resolve(result);
    };
    function receive(event) {
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow
        || event.data?.type !== "scummweb:saves-listed" || event.data.query !== query) return;
      finish(event.data);
    }
    const timer = window.setTimeout(() => finish(null), 45000);
    window.addEventListener("message", receive);
    frame.src = url.href;
    document.body.appendChild(frame);
  });
}

export async function getLatestBrowserSave(game, assetVersion) {
  try {
    const { namespace, files } = await readBrowserSaveFiles(game);
    if (!files.length) return null;
    const key = saveIndexKey(namespace, game.target);
    let index;
    try { index = JSON.parse(window.localStorage.getItem(key)); } catch {}
    const revision = saveRevision(files);
    if (index?.schemaVersion !== 1 || index.revision !== revision) {
      const queryKey = `${key}:${revision}`;
      if (!queries.has(queryKey)) {
        // Engine modules are large: never boot several save-query runtimes at once.
        const request = queryQueue.then(() => queryNativeSaves({ ...game,
          engineId: index?.engineId || game.engineId, gameId: index?.gameId || game.gameId,
          extra: index?.extra ?? game.extra, nativeTarget: index?.target }, namespace, assetVersion));
        queryQueue = request.catch(() => null);
        queries.set(queryKey, request);
        void request.finally(() => queries.delete(queryKey)).catch(() => {});
      }
      index = await queries.get(queryKey);
    }
    // Re-read after native work: another player tab or a restore may have
    // changed storage while the runtime was loading.
    const current = await readBrowserSaveFiles(game);
    if (index?.revision !== saveRevision(current.files)) return null;
    return latestPlayerSave(index, current.files)?.slot ?? null;
  } catch {
    return null;
  }
}
