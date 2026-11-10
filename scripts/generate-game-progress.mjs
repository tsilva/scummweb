import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileGameProgress } from '../lib/game-progress/compile.mjs';

const mapsDir = new URL('../data/game-internals/', import.meta.url);
const trackerFile = new URL('../lib/game-progress/tracker.mjs', import.meta.url);

export async function generateGameProgress(outputDir) {
  const tracker = await readFile(trackerFile, 'utf8');
  const games = {};
  const maps = {};
  for (const file of (await readdir(mapsDir)).sort()) {
    if (!file.endsWith('.yaml')) continue;
    const game = file.slice(0, -5);
    const map = compileGameProgress(game, await readFile(new URL(file, mapsDir), 'utf8'));
    const revision = createHash('sha256').update(tracker).update(JSON.stringify(map)).digest('hex');
    games[game] = { revision, telemetry: map.telemetry ?? 'events', edition_specific: Boolean(map.edition) };
    maps[game] = { revision, map };
  }
  const module = `${tracker}
const maps = ${JSON.stringify(maps)};

export function createTracker(game, revision) {
  const entry = Object.hasOwn(maps, game) && maps[game];
  if (!entry || entry.revision !== revision) throw new Error('ScummWEB story progress map revision is unavailable');
  return new GameProgress(entry.map);
}
`;
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'v1.mjs'), module);
  await writeFile(path.join(outputDir, 'index.json'), JSON.stringify({ schema_version: 1, games }) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateGameProgress(fileURLToPath(new URL('../public/game-progress/', import.meta.url)));
}
