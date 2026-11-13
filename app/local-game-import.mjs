import { localGameArchiveKind } from "./local-game-selection.mjs";
import { gameFileFingerprint } from "./local-game-matching.mjs";

export { fileNode, handleNode, captureGameDrop } from "./game-import-nodes.mjs";
export { inspectLocalSourceFiles } from "./game-source-inspection.mjs";

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
          throw new Error("No ZIP or ISO files found in this folder or its subfolders. Add a game ZIP or ISO, then drop the folder again.");
        }
      } else if (!node.name.startsWith(".") && (!nested || /\.(zip|iso)$/i.test(node.name))) {
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

export async function prepareLocalArchive(node) {
  if (node.kind === "error") throw node.error;
  if (node.kind !== "file") throw new Error("Only ZIP or ISO files containing ScummVM games are supported. Choose a game ZIP or ISO.");
  const file = await node.getFile();
  const { scanLocalGameArchive } = await import("./local-game-archive.mjs");
  const files = await scanLocalGameArchive(file);
  const kind = localGameArchiveKind(file);
  const fingerprint = await gameFileFingerprint(kind, files);
  return { name: file.name, handle: node.handle, data: file, kind, fingerprint, archiveFiles: files };
}

// Preserve existing callers of the original ZIP import API.
export const prepareLocalZip = prepareLocalArchive;
