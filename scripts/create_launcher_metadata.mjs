import fs from "node:fs/promises";
import path from "node:path";

const [iniPath, primaryOutPath, libraryOutPath] = process.argv.slice(2);

if (!iniPath || !primaryOutPath || !libraryOutPath) {
  throw new Error(
    "usage: create_launcher_metadata.mjs <scummvm.ini> <primary-out.json> <library-out.json>"
  );
}

const iniText = await fs.readFile(iniPath, "utf8");
const distDir = path.dirname(iniPath);
const sections = [];
let current = null;

for (const line of iniText.split(/\r?\n/)) {
  const sectionMatch = line.match(/^\[([^\]]+)\]$/);
  if (sectionMatch) {
    current = { name: sectionMatch[1], values: {} };
    sections.push(current);
    continue;
  }

  if (!current) continue;

  const kvMatch = line.match(/^([^=]+)=(.*)$/);
  if (kvMatch) {
    current.values[kvMatch[1].trim()] = kvMatch[2].trim();
  }
}

async function findReadmeHref(gamePath) {
  const normalizedPath = gamePath.startsWith("/") ? gamePath.slice(1) : gamePath;
  const absoluteGamePath = path.join(distDir, normalizedPath);
  let entries = [];

  try {
    entries = await fs.readdir(absoluteGamePath, { withFileTypes: true });
  } catch {
    return "";
  }

  const readmeEntry = entries
    .filter((entry) => entry.isFile() && /readme/i.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name))[0];

  if (!readmeEntry) {
    return "";
  }

  return `/${path.posix.join(normalizedPath.replaceAll(path.sep, "/"), readmeEntry.name)}`;
}

const gameSections = sections.filter(
  (section) => section.name !== "scummvm" && section.values.path && section.values.engineid
);

if (gameSections.length === 0) {
  throw new Error("No playable game entries found in scummvm.ini");
}

const games = await Promise.all(
  gameSections.map(async (section) => {
    const normalizedPath = section.values.path.startsWith("/")
      ? section.values.path
      : `/${section.values.path}`;

    return {
      target: section.name,
      title: section.values.description || section.name,
      path: normalizedPath,
      engineId: section.values.engineid,
      gameId: section.values.gameid || "",
      platform: section.values.platform || "",
      extra: section.values.extra || "",
      readmeHref: await findReadmeHref(normalizedPath),
    };
  })
);

const primaryGame = games[0];

await fs.writeFile(primaryOutPath, JSON.stringify(primaryGame, null, 2) + "\n");
await fs.writeFile(
  libraryOutPath,
  JSON.stringify(
    {
      primaryTarget: primaryGame.target,
      games,
    },
    null,
    2
  ) + "\n"
);
