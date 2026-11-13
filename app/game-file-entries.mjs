import { ArchiveError } from "./local-game-selection.mjs";

export function gamePathParts(path) {
  const parts = path.split("/");
  if (
    path.length > 1024 ||
    /[\x00-\x1f\x7f:\\]/.test(path) ||
    parts.some((part) => !part || part === "." || part === ".." || part === "__proto__")
  ) {
    throw new ArchiveError("This game contains an invalid file path.");
  }
  return parts;
}

export function gameEntries(entries) {
  if (!entries.size) throw new ArchiveError("This game does not contain any game files.");
  const files = [...entries.values()];
  let prefixLength = 0;
  while (files.every(({ parts }) =>
    parts.length > prefixLength + 1 && parts[prefixLength] === files[0].parts[prefixLength]
  )) {
    prefixLength++;
  }
  for (const { parts } of files) {
    for (let depth = 1; depth < parts.length; depth++) {
      if (entries.has(parts.slice(0, depth).join("/").toLowerCase())) {
        throw new ArchiveError("This game uses the same path for a file and folder.");
      }
    }
  }
  const resolved = files.map(({ parts, ...item }) => ({ ...item, path: parts.slice(prefixLength).join("/") }));
  const paths = resolved.map(({ path }) => path.toLowerCase());
  if (paths.includes("dott.exe") && paths.every((path) => path === "dott.exe" || path === "bootdisk.exe")) {
    throw new ArchiveError("This game is missing Day of the Tentacle game data. Include TENTACLE.000 and TENTACLE.001 from the original DOS game.");
  }
  return resolved;
}
