import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const [distDir, url] = process.argv.slice(2);

if (!distDir || !url) {
  throw new Error("usage: generate_game_config.mjs <dist-dir> <url>");
}

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));

if (!executablePath) {
  throw new Error("No local Chrome/Chromium installation found for Playwright");
}

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
  });
} catch (error) {
  throw new Error(`Could not launch Chromium-compatible browser: ${error}`);
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let addedGamesLine = "";
page.on("console", (msg) => {
  const text = msg.text();
  if (/Added \d+ games/.test(text)) {
    addedGamesLine = text;
  }
});

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForFunction(
  () => {
    const output = document.querySelector("#output");
    return !!output && /Added \d+ games/.test(output.value);
  },
  undefined,
  { timeout: 300000 }
);

const storage = await page.evaluate(() => Object.assign({}, window.localStorage));

const decodeInode = (base64str) => {
  const bytes = Buffer.from(base64str, "base64");
  return {
    id: bytes.subarray(30).toString("latin1"),
  };
};

const rootFolderInodeId = decodeInode(storage["/"]).id;
const rootListing = JSON.parse(Buffer.from(storage[rootFolderInodeId], "base64").toString("utf8"));
const iniEntryInodeId = rootListing["scummvm.ini"];
const iniContentInodeId = decodeInode(storage[iniEntryInodeId]).id;
const iniBase64 = storage[iniContentInodeId];

if (!iniBase64) {
  throw new Error("scummvm.ini not found in localStorage after game detection");
}

await fsp.writeFile(
  path.join(distDir, "scummvm.ini"),
  Buffer.from(iniBase64, "base64")
);

await browser.close();

if (!addedGamesLine) {
  console.log("Generated scummvm.ini");
} else {
  console.log(addedGamesLine);
}
