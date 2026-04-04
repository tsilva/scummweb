import fs from "node:fs/promises";
import path from "node:path";

const [iniPath, libraryOutPath] = process.argv.slice(2);
const gamesOrigin = (process.env.SCUMMVM_GAMES_ORIGIN || "https://scummvm-games.tsilva.eu").replace(
  /\/$/,
  ""
);

if (!iniPath || !libraryOutPath) {
  throw new Error("usage: create_launcher_metadata.mjs <scummvm.ini> <library-out.json>");
}

async function loadMetadataOverrides() {
  try {
    const overridesText = await fs.readFile(
      new URL("../launcher-game-overrides.json", import.meta.url),
      "utf8"
    );
    const parsed = JSON.parse(overridesText);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed.byTarget && typeof parsed.byTarget === "object" ? parsed.byTarget : {};
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

const iniText = await fs.readFile(iniPath, "utf8");
const distDir = path.dirname(iniPath);
const metadataOverrides = await loadMetadataOverrides();
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

async function findNoticeHref(gamePath) {
  const normalizedPath = gamePath.startsWith("/") ? gamePath.slice(1) : gamePath;
  const absoluteGamePath = path.join(distDir, normalizedPath);
  const publicGamePath = normalizedPath.replace(/^games(?:\/|$)/, "");
  let entries = [];

  try {
    entries = await fs.readdir(absoluteGamePath, { withFileTypes: true });
  } catch {
    return "";
  }

  const noticePatterns = [/readme/i, /license/i, /copying/i];
  const noticePriority = [
    [/^readme(?:\.[^.]+)?$/i, 0],
    [/readme/i, 1],
    [/^license(?:-original)?(?:\.[^.]+)?$/i, 2],
    [/^copying(?:\.[^.]+)?$/i, 3],
    [/license/i, 4],
    [/copying/i, 5],
  ];
  const noticeEntry = entries
    .filter((entry) => entry.isFile() && noticePatterns.some((pattern) => pattern.test(entry.name)))
    .sort((left, right) => {
      const leftPriority =
        noticePriority.find(([pattern]) => pattern.test(left.name))?.[1] ?? Number.MAX_SAFE_INTEGER;
      const rightPriority =
        noticePriority.find(([pattern]) => pattern.test(right.name))?.[1] ?? Number.MAX_SAFE_INTEGER;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return left.name.localeCompare(right.name);
    })[0];

  if (!noticeEntry) {
    return "";
  }

  const noticePath = publicGamePath
    ? path.posix.join(publicGamePath.replaceAll(path.sep, "/"), noticeEntry.name)
    : noticeEntry.name;

  return `${gamesOrigin}/${noticePath}`;
}

const gameSections = sections.filter(
  (section) => section.name !== "scummvm" && section.values.path && section.values.engineid
);

if (gameSections.length === 0) {
  throw new Error("No playable game entries found in scummvm.ini");
}

const missingGameIds = gameSections
  .filter((section) => !section.values.gameid)
  .map((section) => section.name);

if (missingGameIds.length > 0) {
  throw new Error(`Missing gameId for playable ScummVM target(s): ${missingGameIds.join(", ")}`);
}

const seenGameIds = new Set();
for (const section of gameSections) {
  const gameId = section.values.gameid;
  if (seenGameIds.has(gameId)) {
    throw new Error(`Duplicate gameId detected for playable ScummVM target: ${gameId}`);
  }

  seenGameIds.add(gameId);
}

const games = await Promise.all(
  gameSections.map(async (section) => {
    const normalizedPath = `/games/${section.values.gameid}`;
    const targetOverrides = metadataOverrides[section.name];

    return {
      target: section.name,
      title: section.values.description || section.name,
      path: normalizedPath,
      engineId: section.values.engineid,
      gameId: section.values.gameid || "",
      platform: section.values.platform || "",
      extra: section.values.extra || "",
      readmeHref: await findNoticeHref(normalizedPath),
      ...(targetOverrides && typeof targetOverrides === "object" ? targetOverrides : {}),
    };
  })
);

const primaryGame =
  games.find((game) => game.target === "dreamweb-cd") ||
  games.find((game) => game.target === "sky") ||
  games[0];

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
