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

async function readGameLibrary(page) {
  return page.evaluate(async () => {
    const response = await fetch("/games.json", { cache: "no-store" }).catch(() => null);

    if (response?.ok) {
      return response.json();
    }

    const primaryResponse = await fetch("/game.json", { cache: "no-store" });
    if (!primaryResponse.ok) {
      throw new Error("Could not load launcher metadata");
    }

    const primaryGame = await primaryResponse.json();
    return {
      primaryTarget: primaryGame.target,
      games: [primaryGame],
    };
  });
}

async function verifyTarget(context, baseUrl, game) {
  const page = await context.newPage();
  const pageErrors = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(new URL(`/scummvm.html#${game.target}`, baseUrl).toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#canvas", { timeout: 30000 });
  await page.waitForTimeout(15000);

  const output = await page.locator("#output").inputValue();
  const statusText = await page.locator("#status").textContent().catch(() => "");

  if (pageErrors.length > 0) {
    throw new Error(`Page errors during ${game.target} launch:\n${pageErrors.join("\n")}`);
  }

  if (/Exception thrown/i.test(statusText) || /TypeError|ReferenceError|abort\(/i.test(output)) {
    throw new Error(`Launch failed for ${game.target}.\n${output}`);
  }

  if (!new RegExp(`User picked target '${game.target}'`).test(output)) {
    throw new Error(`Game did not reach the expected startup state for ${game.target}.\n${output}`);
  }

  return page;
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

if (rootPage.url() !== url) {
  throw new Error(`Root page redirected unexpectedly to ${rootPage.url()}`);
}

const library = await readGameLibrary(rootPage);

if (!Array.isArray(library.games) || library.games.length === 0) {
  throw new Error("No games found in launcher metadata");
}

for (const game of library.games) {
  const matchingLink = rootPage.locator(`a[href="/scummvm.html#${game.target}"]`).first();
  if ((await matchingLink.count()) === 0) {
    throw new Error(`Launcher tile for ${game.target} was not rendered`);
  }
}

let screenshotPage = rootPage;

for (const game of library.games) {
  screenshotPage = await verifyTarget(context, url, game);
}

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await screenshotPage.screenshot({ path: screenshotPath, fullPage: true });

await browser.close();

console.log("Verified launcher targets and wrote screenshot to", screenshotPath);
