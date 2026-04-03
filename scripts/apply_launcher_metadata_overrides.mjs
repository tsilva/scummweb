import fs from "node:fs/promises";

const [libraryPath, primaryPath] = process.argv.slice(2);

if (!libraryPath) {
  throw new Error(
    "usage: apply_launcher_metadata_overrides.mjs <library-path> [primary-game-path]"
  );
}

async function loadJson(jsonPath) {
  const text = await fs.readFile(jsonPath, "utf8");
  return JSON.parse(text);
}

async function writeJson(jsonPath, value) {
  await fs.writeFile(jsonPath, `${JSON.stringify(value, null, 2)}\n`);
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

function applyOverridesToGame(game, overrides) {
  if (!game || typeof game !== "object") {
    return game;
  }

  const targetOverrides = overrides[game.target];

  if (!targetOverrides || typeof targetOverrides !== "object") {
    return game;
  }

  return {
    ...game,
    ...targetOverrides,
  };
}

const metadataOverrides = await loadMetadataOverrides();
const library = await loadJson(libraryPath);

if (Array.isArray(library.games)) {
  library.games = library.games.map((game) => applyOverridesToGame(game, metadataOverrides));
}

await writeJson(libraryPath, library);

if (primaryPath) {
  const primaryGame = await loadJson(primaryPath);
  await writeJson(primaryPath, applyOverridesToGame(primaryGame, metadataOverrides));
}
