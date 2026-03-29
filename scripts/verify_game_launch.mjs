import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const [url, screenshotPath] = process.argv.slice(2);

if (!url || !screenshotPath) {
  throw new Error("usage: verify_game_launch.mjs <url> <screenshot-path>");
}

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!executablePath) {
  throw new Error("No local Chrome/Chromium installation found for Playwright");
}

async function readGameLibrary(page, assetBasePath) {
  return page.evaluate(async (resolvedAssetBasePath) => {
    const response = await fetch(`${resolvedAssetBasePath}/games.json`, { cache: "no-store" }).catch(
      () => null
    );

    if (response?.ok) {
      return response.json();
    }

    const primaryResponse = await fetch(`${resolvedAssetBasePath}/game.json`, {
      cache: "no-store",
    });
    if (!primaryResponse.ok) {
      throw new Error("Could not load launcher metadata");
    }

    const primaryGame = await primaryResponse.json();
    return {
      primaryTarget: primaryGame.target,
      games: [primaryGame],
    };
  }, assetBasePath);
}

async function getScummvmAssetBasePath(page) {
  const launchHref = await page.locator('a[href*="/scummvm/"][href*="/scummvm.html#"]').first().getAttribute("href");

  if (!launchHref) {
    throw new Error("Could not locate a versioned ScummVM launch link");
  }

  const launchUrl = new URL(launchHref, page.url());
  const scummvmHtmlMarker = "/scummvm.html";
  const markerIndex = launchUrl.pathname.lastIndexOf(scummvmHtmlMarker);

  if (markerIndex === -1) {
    throw new Error(`Could not derive asset base path from ${launchHref}`);
  }

  return launchUrl.pathname.slice(0, markerIndex);
}

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";

  if (url.pathname === "") {
    url.pathname = "/";
  }

  return url.toString();
}

async function verifyTarget(context, baseUrl, game) {
  const page = await context.newPage();
  const pageErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(new URL(game.launchHref, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#canvas", { timeout: 30000 });
  await page.waitForTimeout(15000);

  const output = await page.locator("#output").inputValue();
  const statusText = await page.locator("#status").textContent().catch(() => "");
  const fatalOutputPatterns = [
    /Game data path does not exist/i,
    /Couldn't identify game/i,
    /No game data was found/i,
  ];

  if (pageErrors.length > 0) {
    throw new Error(`Page errors during ${game.target} launch:\n${pageErrors.join("\n")}`);
  }

  if (/Exception thrown/i.test(statusText) || /TypeError|ReferenceError|abort\(/i.test(output)) {
    throw new Error(`Launch failed for ${game.target}.\n${output}`);
  }

  if (fatalOutputPatterns.some((pattern) => pattern.test(output))) {
    throw new Error(`Launch failed for ${game.target}.\n${output}`);
  }

  if (!new RegExp(`User picked target '${game.target}'`).test(output)) {
    throw new Error(`Game did not reach the expected startup state for ${game.target}.\n${output}`);
  }

  return page;
}

async function seedStaleIni(context, baseUrl) {
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    function encodeInode(id, size, mode) {
      const bytes = new Uint8Array(30 + id.length);

      const writeUInt16LE = (value, offset) => {
        bytes[offset] = value & 0xff;
        bytes[offset + 1] = value >>> 8;
      };

      const writeUInt32LE = (value, offset) => {
        bytes[offset] = value & 0xff;
        bytes[offset + 1] = (value >>> 8) & 0xff;
        bytes[offset + 2] = (value >>> 16) & 0xff;
        bytes[offset + 3] = value >>> 24;
      };

      writeUInt32LE(size, 0);
      writeUInt16LE(mode, 4);

      for (let index = 0; index < id.length; index += 1) {
        bytes[30 + index] = id.charCodeAt(index);
      }

      let binaryString = "";
      for (let index = 0; index < bytes.length; index += 1) {
        binaryString += String.fromCharCode(bytes[index]);
      }

      return btoa(binaryString);
    }

    const folderInodeId = "b3da6754-64c0-40f0-92ad-83b6ca6ffec9";
    const folderEntryId = "70879b79-8d58-400c-8143-332242320b34";
    const iniInodeId = "1b4a97d1-4ce0-417f-985c-e0f22ca21aef";
    const staleIni = `[scummvm]
savepath=/home/web_user/.local/share/scummvm/saves

[queen]
platform=pc
gameid=queen
description=Flight of the Amazon Queen (CD/DOS/English)
language=en
extra=CD
engineid=queen
guioptions=gameOption1 lang_English
`;

    localStorage.setItem("/", encodeInode(folderInodeId, 4096, 16895));
    localStorage.setItem(folderInodeId, btoa(JSON.stringify({ "scummvm.ini": folderEntryId })));
    localStorage.setItem(folderEntryId, encodeInode(iniInodeId, staleIni.length, 33206));
    localStorage.setItem(iniInodeId, btoa(staleIni));
  });

  await page.close();
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

const rootPage = await context.newPage();
await rootPage.goto(url, { waitUntil: "domcontentloaded" });
await rootPage.waitForLoadState("networkidle");
await rootPage.waitForTimeout(1000);

if (normalizeUrl(rootPage.url()) !== normalizeUrl(url)) {
  throw new Error(`Root page redirected unexpectedly to ${rootPage.url()}`);
}

const assetBasePath = await getScummvmAssetBasePath(rootPage);
const library = await readGameLibrary(rootPage, assetBasePath);

if (!Array.isArray(library.games) || library.games.length === 0) {
  throw new Error("No games found in launcher metadata");
}

for (const game of library.games) {
  const matchingLink = rootPage.locator(`a[href*="scummvm.html#${game.target}"]`).first();
  if ((await matchingLink.count()) === 0) {
    throw new Error(`Launcher tile for ${game.target} was not rendered`);
  }

  game.launchHref = await matchingLink.getAttribute("href");
  if (!game.launchHref) {
    throw new Error(`Launcher tile for ${game.target} did not expose a launch href`);
  }
}

let screenshotPage = rootPage;

for (const game of library.games) {
  screenshotPage = await verifyTarget(context, url, game);
}

const staleRecoveryContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await seedStaleIni(staleRecoveryContext, url);
await verifyTarget(staleRecoveryContext, url, library.games[library.games.length - 1]);
await staleRecoveryContext.close();

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await screenshotPage.screenshot({ path: screenshotPath, fullPage: true });

await browser.close();

console.log("Verified launcher targets and wrote screenshot to", screenshotPath);
