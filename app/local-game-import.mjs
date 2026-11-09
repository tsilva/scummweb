import { gameFileFingerprint } from "./local-game-matching.mjs";

export function fileNode(file) {
  return { kind: "file", name: file.name, getFile: async () => file };
}

export function handleNode(handle) {
  if (handle.kind === "file") {
    return { kind: "file", name: handle.name, handle, getFile: () => handle.getFile() };
  }
  return {
    kind: "directory", name: handle.name,
    async *children() {
      for await (const child of handle.values()) yield handleNode(child);
    },
  };
}

function entryNode(entry) {
  if (entry.isFile) {
    return {
      kind: "file", name: entry.name,
      getFile: () => new Promise((resolve, reject) => entry.file(resolve, reject)),
    };
  }
  return {
    kind: "directory", name: entry.name,
    async *children() {
      const reader = entry.createReader();
      // Chromium returns directory entries in batches, not necessarily all at once.
      while (true) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) return;
        for (const child of batch) yield entryNode(child);
      }
    },
  };
}

export function captureGameDrop(transfer) {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  if (!items.length) return [...transfer.files].map((file) => Promise.resolve(fileNode(file)));

  // Capture all access methods during the drop event, before awaiting any of them.
  return items.map((item) => {
    const entry = item.webkitGetAsEntry?.();
    const file = item.getAsFile();
    const handle = item.getAsFileSystemHandle?.();
    return Promise.resolve(handle).catch(() => null).then((value) => {
      if (value) return handleNode(value);
      if (entry) return entryNode(entry);
      return file ? fileNode(file) : null;
    });
  });
}

export async function collectGameImportNodes(roots) {
  const nodes = [];
  async function visit(root, nested = false) {
    let node;
    try {
      node = await root;
      if (!node) throw new Error("Could not read this item. Try dropping it again.");
      if (node.kind === "directory") {
        const start = nodes.length;
        for await (const child of node.children()) await visit(child, true);
        if (!nested && nodes.length === start) {
          throw new Error("No ZIP files found in this folder or its subfolders. Put each game in a ZIP, then drop the folder again.");
        }
      } else if (!node.name.startsWith(".") && (!nested || /\.zip$/i.test(node.name))) {
        nodes.push(node);
      }
    } catch (error) {
      // Keep readable siblings even if a folder disappears or access is denied.
      nodes.push({ kind: "error", name: node?.name ?? "Dropped item", error });
    }
  }
  for (const root of roots) await visit(root);
  return nodes;
}

export async function prepareLocalZip(node) {
  if (node.kind === "error") throw node.error;
  if (node.kind !== "file") throw new Error("Only ZIP files containing ScummVM games are supported. Choose a game ZIP.");
  const file = await node.getFile();
  const { scanLocalGameArchive } = await import("./local-game-archive.mjs");
  const files = await scanLocalGameArchive(file);
  const fingerprint = await gameFileFingerprint("zip", files);
  return { name: file.name, handle: node.handle, data: file, kind: "zip", fingerprint, archiveFiles: files };
}

export async function inspectLocalSourceFiles(source, cache) {
  if (source.url || source.handle?.kind !== "file"
    || await source.handle.queryPermission({ mode: "read" }) !== "granted") return undefined;
  const file = await source.handle.getFile();
  const previous = cache.get(source);
  if (previous?.size === file.size && previous.modified === file.lastModified) return previous.files;
  const files = import("./local-game-archive.mjs").then(({ scanLocalGameArchive }) => scanLocalGameArchive(file));
  cache.set(source, { size: file.size, modified: file.lastModified, files });
  return files;
}
