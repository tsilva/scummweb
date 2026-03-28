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

const browser = await chromium.launch({
  headless: true,
  executablePath,
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const pageErrors = [];

page.on("pageerror", (error) => {
  pageErrors.push(error.message);
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(1000);

if (page.url() !== url) {
  throw new Error(`Root page redirected unexpectedly to ${page.url()}`);
}

await page.locator('a[href="/scummvm.html#sky"]').first().click();
await page.waitForFunction(
  () => window.location.pathname === "/scummvm.html",
  undefined,
  {
    timeout: 30000,
  }
);
await page.waitForSelector("#canvas", { timeout: 30000 });

await page.waitForTimeout(20000);

const output = await page.locator("#output").inputValue();
const statusText = await page.locator("#status").textContent().catch(() => "");

if (pageErrors.length > 0) {
  throw new Error(`Page errors during launch:\n${pageErrors.join("\n")}`);
}

if (/Exception thrown/i.test(statusText) || /TypeError|ReferenceError|abort\(/i.test(output)) {
  throw new Error(`Launch failed.\n${output}`);
}

if (!/User picked target 'sky'/.test(output) || !/Found BASS version/.test(output)) {
  throw new Error(`Game did not reach the expected startup state.\n${output}`);
}

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await page.screenshot({ path: screenshotPath, fullPage: true });

await browser.close();

console.log("Verified launch and wrote screenshot to", screenshotPath);
