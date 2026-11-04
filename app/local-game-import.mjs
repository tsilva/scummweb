import { maxGameEntries, maxLocalGameSize, readGameFolder, scanLocalGameArchive, validateGameFolder } from "./local-game-archive.mjs";
import { gameFileFingerprint } from "./local-game-matching.mjs";

const isZip = (name) => /\.zip$/i.test(name);

export function fileNode(file) {
  return { kind: "file", name: file.name, getFile: async () => file };
}

export function handleNode(handle) {
  if (handle.kind === "file") {
    return { kind: "file", name: handle.name, handle, getFile: () => handle.getFile() };
  }
  return {
    kind: "directory", name: handle.name, handle,
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
      while (true) {
        const entries = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!entries.length) return;
        for (const child of entries) yield entryNode(child);
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

export function selectedGameFolder(files) {
  const name = files[0].webkitRelativePath.split("/")[0];
  return {
    kind: "directory", name,
    async *children() {
      for (const file of files) {
        yield { ...fileNode(file), path: file.webkitRelativePath.split("/").slice(1).join("/") };
      }
    },
  };
}

export async function scanGameFolder(folder, onProgress) {
  const archives = [];
  const files = [];
  let visited = 0;

  async function walk(directory, prefix = "") {
    for await (const child of directory.children()) {
      // A sidecar beside a ZIP is Finder metadata. Loose Mac game files
      // may have real resource forks stored in their AppleDouble sidecars.
      if (child.name === "__MACOSX" || child.name === ".DS_Store" ||
          (child.name.startsWith("._") && isZip(child.name))) continue;
      if (++visited > maxGameEntries) throw new Error("This folder contains too many files or subfolders.");
      if (visited % 32 === 0) {
        onProgress?.(visited);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const path = prefix + (child.path ?? child.name);
      if (child.kind === "directory") await walk(child, path + "/");
      else if (isZip(child.name)) archives.push({ ...child, path });
      else files.push({ path, getFile: child.getFile });
    }
  }

  await walk(folder);
  return { archives, files };
}

export async function prepareLocalZip(node) {
  const file = await node.getFile();
  const files = await scanLocalGameArchive(file);
  const fingerprint = await gameFileFingerprint("zip", files);
  return { name: file.name, handle: node.handle, data: file, kind: "zip", fingerprint };
}

export async function prepareLocalFolder(folder, nodes, onProgress) {
  const files = [];
  let size = 0;
  for (const [index, { path, getFile }] of nodes.entries()) {
    onProgress?.(index, { message: "Reading file…" });
    const file = await getFile();
    size += file.size;
    if (size > maxLocalGameSize) throw new Error("Choose a game folder of 4 GiB or less.");
    files.push({ path, file });
    onProgress?.(index, { message: "File checked", complete: true });
  }
  const entries = validateGameFolder(files);
  const fingerprint = await gameFileFingerprint("folder", entries.map(({ path, file }) =>
    [path, file.size, file.lastModified]
  ));
  return { name: folder.name, handle: folder.handle, data: files, kind: "folder", fingerprint };
}

export async function openLocalFolder(handle) {
  const folder = handleNode(handle);
  const { files } = await scanGameFolder(folder);
  const prepared = await prepareLocalFolder(folder, files);
  return readGameFolder(prepared.data);
}
