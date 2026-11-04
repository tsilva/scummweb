import { scanLocalGameArchive } from "./local-game-archive.mjs";
import { gameFileFingerprint } from "./local-game-matching.mjs";

export function fileNode(file) {
  return { kind: "file", name: file.name, getFile: async () => file };
}

export function handleNode(handle) {
  if (handle.kind === "file") {
    return { kind: "file", name: handle.name, handle, getFile: () => handle.getFile() };
  }
  return { kind: "directory", name: handle.name };
}

function entryNode(entry) {
  if (entry.isFile) {
    return {
      kind: "file", name: entry.name,
      getFile: () => new Promise((resolve, reject) => entry.file(resolve, reject)),
    };
  }
  return { kind: "directory", name: entry.name };
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

export async function prepareLocalZip(node) {
  if (node.kind !== "file") throw new Error("Only ZIP files containing ScummVM games are supported. Choose a game ZIP.");
  const file = await node.getFile();
  const files = await scanLocalGameArchive(file);
  const fingerprint = await gameFileFingerprint("zip", files);
  return { name: file.name, handle: node.handle, data: file, kind: "zip", fingerprint };
}
