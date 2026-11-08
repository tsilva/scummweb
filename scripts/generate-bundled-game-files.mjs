import fs from "node:fs/promises";
import path from "node:path";
import { HttpRangeReader, Uint8ArrayReader } from "@zip.js/zip.js";
import { scanGameZipReader, maxLocalGameSize } from "../app/local-game-archive.mjs";
import { gameFileFingerprint } from "../app/local-game-matching.mjs";

const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
if (args.length && (args.length < 2 || args[0] !== "--local-dir")) {
  throw new Error("Usage: node scripts/generate-bundled-game-files.mjs [--local-dir DIRECTORY [TARGET ...]]");
}
const localDir = args[1];
const targets = new Set(args.slice(2));
const catalog = JSON.parse(await fs.readFile(new URL("scummvm-shell/games.json", root))).games;
const manifestUrl = new URL("data/bundled-game-files.json", root);
const games = targets.size
  ? JSON.parse(await fs.readFile(manifestUrl, "utf8")).games : {};
for (const target of targets) {
  if (!catalog.some((game) => game.target === target)) throw new Error(`Unknown game target: ${target}`);
}
for (const game of catalog) {
  if (targets.size && !targets.has(game.target)) continue;
  const url = `https://scummvm-games.tsilva.eu/${game.gameId}.zip`;
  const signal = AbortSignal.timeout(30_000);
  let remaining = 2 * 1024 * 1024;
  const localPath = localDir && path.join(localDir, `${game.gameId}.zip`);
  const localBytes = localPath && await fs.readFile(localPath).catch((error) => {
    if (error.code !== "ENOENT" || targets.size) throw error;
    return null;
  });
  const reader = localBytes ? new Uint8ArrayReader(localBytes) : new HttpRangeReader(url, { forceRangeRequests: true, combineSizeEocd: true,
    fetch: async (requestUrl, options) => {
      if (!options.headers?.Range) throw new Error("Only ZIP directory range reads are allowed");
      const response = await fetch(requestUrl, { ...options, redirect: "error", signal });
      const length = Number(response.headers.get("content-length"));
      if (response.status !== 206 || !Number.isSafeInteger(length) || length < 1 || length > remaining) {
        await response.body?.cancel();
        throw new Error(`Invalid ZIP range response for ${game.target}`);
      }
      const chunks = [];
      let received = 0;
      for await (const chunk of response.body) {
        received += chunk.length;
        if (received > length || received > remaining) throw new Error("ZIP directory read exceeded its limit");
        chunks.push(chunk);
      }
      remaining -= received;
      if (received !== length) throw new Error("ZIP directory length mismatch");
      return new Response(Buffer.concat(chunks), { status: 206, headers: response.headers });
    },
  });
  const files = await scanGameZipReader(reader, { signal, expandedLimit: maxLocalGameSize });
  games[game.target] = { url, fingerprint: await gameFileFingerprint("zip", files), files };
  console.log(`${game.target}: ${files.length} ZIP entries`);
}
await fs.writeFile(manifestUrl, `${JSON.stringify({ version: 1, games }, null, 2)}\n`);
