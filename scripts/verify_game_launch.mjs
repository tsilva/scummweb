import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!executablePath) {
  throw new Error("No local Chrome/Chromium installation found for Playwright");
}

function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
}

function slugifySegment(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getUniqueGameSlug(game, usedSlugs) {
  const baseSlug = slugifySegment(getDisplayTitle(game.title || ""));
  const targetSlug = slugifySegment(game.target || "game") || "game";
  const preferredSlug = baseSlug || targetSlug;

  if (!usedSlugs.has(preferredSlug)) {
    usedSlugs.add(preferredSlug);
    return preferredSlug;
  }

  const fallbackBase = `${preferredSlug}-${targetSlug}`.replace(/-{2,}/g, "-");
  let suffix = 2;
  let candidate = fallbackBase;

  while (usedSlugs.has(candidate)) {
    candidate = `${fallbackBase}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

function readGameLibraryFromDisk() {
  const publicDir = path.join(rootDir, "public");
  const libraryPath = path.join(publicDir, "games.json");
  const library = JSON.parse(fs.readFileSync(libraryPath, "utf8"));
  const games = Array.isArray(library.games) ? library.games : [];

  if (games.length === 0) {
    throw new Error(`No installed game metadata found in ${libraryPath}`);
  }

  return {
    games,
    primaryTarget: library.primaryTarget || games[0]?.target || "",
  };
}

function addGameRoutes(library) {
  const usedSlugs = new Set();

  return {
    ...library,
    games: library.games.map((game) => {
      const slug = getUniqueGameSlug(game, usedSlugs);

      return {
        ...game,
        displayTitle: getDisplayTitle(game.title),
        routePath: `/${slug}`,
      };
    }),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrl(value) {
  const resolvedUrl = new URL(value);
  resolvedUrl.hash = "";

  if (resolvedUrl.pathname === "") {
    resolvedUrl.pathname = "/";
  }

  return resolvedUrl.toString();
}

async function waitForGameStartup(page, frame, game) {
  const output = await frame.locator("#output").inputValue();
  const statusText = await frame.locator("#status").textContent().catch(() => "");
  const targetPattern = new RegExp(`User picked target '${escapeRegExp(game.target)}'`);
  const fatalOutputPatterns = [
    /Game data path does not exist/i,
    /Couldn't identify game/i,
    /No game data was found/i,
  ];

  if (/Exception thrown/i.test(statusText) || /TypeError|ReferenceError|abort\(/i.test(output)) {
    throw new Error(`Launch failed for ${game.target}.\n${output}`);
  }

  if (fatalOutputPatterns.some((pattern) => pattern.test(output))) {
    throw new Error(`Launch failed for ${game.target}.\n${output}`);
  }

  if (targetPattern.test(output)) {
    return;
  }

  await page.waitForTimeout(15000);

  const retriedOutput = await frame.locator("#output").inputValue();

  if (!targetPattern.test(retriedOutput)) {
    throw new Error(`Game did not reach the expected startup state for ${game.target}.\n${retriedOutput}`);
  }
}

async function verifyLaunchOverlayBeforeStartup(page, game) {
  const overlaySnapshot = await page.waitForFunction(
    ({ displayTitle, target }) => {
      const element = document.querySelector('[data-launch-overlay="true"]');

      if (!element || element.getAttribute("data-launch-overlay-state") !== "visible") {
        return null;
      }

      const text = element.textContent || "";

      if (!text.includes(displayTitle) || !text.includes(target)) {
        return null;
      }

      return {
        state: element.getAttribute("data-launch-overlay-state"),
        text,
      };
    },
    {
      displayTitle: game.displayTitle,
      target: game.target,
    },
    { timeout: 10000 }
  );

  const overlayState = await overlaySnapshot.jsonValue();

  if (overlayState?.state !== "visible") {
    throw new Error(`Expected launch overlay to be visible for ${game.target}, got ${overlayState?.state}.`);
  }
}

async function verifyLaunchOverlayAfterStartup(page, game) {
  const overlay = page.locator('[data-launch-overlay="true"]');

  await page.waitForFunction(() => {
    const element = document.querySelector('[data-launch-overlay="true"]');
    return element?.getAttribute("data-launch-overlay-state") === "hidden";
  });

  const overlayState = await overlay.getAttribute("data-launch-overlay-state");

  if (overlayState !== "hidden") {
    throw new Error(`Expected launch overlay to hide for ${game.target}, got ${overlayState}.`);
  }
}

async function verifyTarget(context, baseUrl, game, { waitForLaunch = true } = {}) {
  const page = await context.newPage();
  const pageErrors = [];
  const routeUrl = new URL(game.routePath, baseUrl).toString();

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(routeUrl, {
    waitUntil: "domcontentloaded",
  });

  if (normalizeUrl(page.url()) !== normalizeUrl(routeUrl)) {
    throw new Error(`Game route redirected unexpectedly from ${routeUrl} to ${page.url()}`);
  }

  await page.waitForSelector('iframe[data-scummvm-route-frame="true"]', {
    timeout: 30000,
  });
  await verifyLaunchOverlayBeforeStartup(page, game);

  const frame = page.frameLocator('iframe[data-scummvm-route-frame="true"]');
  await frame.locator("#canvas").waitFor({ timeout: 30000 });

  if (pageErrors.length > 0) {
    throw new Error(`Page errors during ${game.target} launch:\n${pageErrors.join("\n")}`);
  }

  if (waitForLaunch) {
    await waitForGameStartup(page, frame, game);
  }

  return { frame, page, routeUrl };
}

async function verifyRouteFrameAutofocus(page) {
  const activeFrame = await page.evaluate(() => {
    const activeElement = document.activeElement;

    if (!(activeElement instanceof HTMLIFrameElement)) {
      return false;
    }

    return activeElement.dataset.scummvmRouteFrame === "true";
  });

  if (!activeFrame) {
    throw new Error("Game route iframe did not receive keyboard focus automatically.");
  }
}

async function verifyEscapeStaysInGame(page, frame, routeUrl) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  if (normalizeUrl(page.url()) !== normalizeUrl(routeUrl)) {
    throw new Error(`Escape redirected unexpectedly from ${routeUrl} to ${page.url()}`);
  }
}

async function verifySkipIntroButton(page, frame, game) {
  if (!game.skipIntro) {
    return;
  }

  const expectedKey =
    typeof game.skipIntro.key === "string" && game.skipIntro.key.trim()
      ? game.skipIntro.key.trim()
      : "Escape";
  const skipIntroButton = page.locator(".game-route-skip-intro-button");
  await skipIntroButton.waitFor({ state: "visible", timeout: 15000 });

  await frame.locator("#canvas").evaluate(() => {
    window.__skipIntroVerificationEvents = [];

    const targets = [window, document, document.body, document.getElementById("canvas")].filter(Boolean);

    for (const target of targets) {
      target.addEventListener(
        "keydown",
        (event) => {
          window.__skipIntroVerificationEvents.push({
            key: event.key,
            code: event.code,
            which: event.which,
            keyCode: event.keyCode,
          });
        },
        { capture: true, once: true }
      );
    }
  });

  await skipIntroButton.click();

  await frame.locator("#canvas").evaluate(
    (_, { key }) =>
      new Promise((resolve, reject) => {
        const startedAt = Date.now();

        function check() {
          const events = window.__skipIntroVerificationEvents || [];

          if (events.some((event) => event.key === key)) {
            resolve();
            return;
          }

          if (Date.now() - startedAt >= 1500) {
            reject(
              new Error(`Skip intro button did not dispatch ${key}. Recorded events: ${JSON.stringify(events)}`)
            );
            return;
          }

          window.setTimeout(check, 50);
        }

        check();
      }),
    { key: expectedKey }
  );

  await skipIntroButton.waitFor({ state: "hidden", timeout: 5000 });
}

async function verifyCursorGrabHint(frame) {
  const canvas = frame.locator("#canvas");
  const grabHint = frame.locator("#scummvm-cursor-grab-hint");
  const readHintState = () =>
    grabHint.evaluate((element) => ({
      text: element.textContent?.trim() || "",
      visible: element.classList.contains("scummvm-cursor-grab-hint-visible"),
    }));
  const waitForHintTransition = () =>
    canvas.evaluate(
      () => new Promise((resolve) => {
        window.setTimeout(resolve, 150);
      }),
    );

  await canvas.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
  });
  await waitForHintTransition();

  const initialHintState = await readHintState();

  if (!initialHintState.visible) {
    throw new Error("Cursor grab hint did not appear when hovering the game canvas.");
  }

  if (initialHintState.text !== "Click the game to grab the cursor.") {
    throw new Error(`Unexpected cursor grab hint text: ${initialHintState.text}`);
  }

  const initialCursorState = await canvas.evaluate((element) => ({
    classApplied: element.classList.contains("scummvm-browser-cursor-visible"),
    cursor: window.getComputedStyle(element).cursor,
  }));

  if (!initialCursorState.classApplied) {
    throw new Error("Browser cursor override was not applied while the grab hint was visible.");
  }

  if (initialCursorState.cursor !== "default") {
    throw new Error(`Expected the canvas cursor to be default while hinting, got ${initialCursorState.cursor}.`);
  }

  await canvas.click();
  await waitForHintTransition();

  const releasedHintState = await readHintState();

  if (releasedHintState.visible) {
    throw new Error("Cursor grab hint remained visible after clicking the game canvas.");
  }

  const releasedCursorState = await canvas.evaluate((element) => ({
    classApplied: element.classList.contains("scummvm-browser-cursor-visible"),
  }));

  if (releasedCursorState.classApplied) {
    throw new Error("Browser cursor override remained after clicking the game canvas.");
  }

  await canvas.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
    element.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
  });
  await canvas.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
  });
  await waitForHintTransition();

  const reenteredHintState = await readHintState();

  if (!reenteredHintState.visible) {
    throw new Error("Cursor grab hint did not reappear after re-entering the game canvas.");
  }
}

async function verifyCursorGrabHintHiddenDuringBoot(page, game) {
  const frame = page.frameLocator('iframe[data-scummvm-route-frame="true"]');
  const canvas = frame.locator("#canvas");

  await canvas.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
    element.dispatchEvent(new PointerEvent("pointerenter", { bubbles: false }));
  });
  await page.waitForTimeout(200);

  const initialState = await canvas.evaluate((element, currentGameTarget) => {
    const hint = document.getElementById("scummvm-cursor-grab-hint");
    const output = document.getElementById("output");
    const targetPattern = new RegExp(`User picked target '${currentGameTarget.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`);

    return {
      launched: targetPattern.test(output?.value || ""),
      visible: hint?.classList.contains("scummvm-cursor-grab-hint-visible") || false,
    };
  }, game.target);

  if (!initialState.launched && initialState.visible) {
    throw new Error(`Cursor grab hint appeared before ${game.target} finished booting.`);
  }

  await canvas.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
  });
  await canvas.evaluate((element) => {
    element.dispatchEvent(new PointerEvent("pointerleave", { bubbles: false }));
  });
}

async function verifyQuitReturnsHome(page, frame, baseUrl) {
  await frame.locator("#canvas").press("a");
  await page.waitForTimeout(200);

  await frame.locator("#canvas").evaluate(() => {
    try {
      window.__scummvmRequestExit?.(0);
      window.Module?.quit?.(0, new Error("verification quit"));
    } catch {
      // The wrapped quit path may throw after posting the exit message.
    }
  });

  await page.waitForURL((currentUrl) => normalizeUrl(currentUrl.toString()) === normalizeUrl(baseUrl), {
    timeout: 10000,
  });
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

const noticeDismiss = rootPage.locator(".project-notice-dismiss");
if ((await noticeDismiss.count()) > 0) {
  await noticeDismiss.click();
  await rootPage.waitForTimeout(200);
}

if (normalizeUrl(rootPage.url()) !== normalizeUrl(url)) {
  throw new Error(`Root page redirected unexpectedly to ${rootPage.url()}`);
}

const library = addGameRoutes(readGameLibraryFromDisk());

if (!Array.isArray(library.games) || library.games.length === 0) {
  throw new Error("No games found in launcher metadata");
}

for (const game of library.games) {
  const matchingTrigger = rootPage
    .locator(`[data-game-target="${game.target}"][aria-haspopup="dialog"]`)
    .first();

  if ((await matchingTrigger.count()) === 0) {
    throw new Error(`Launcher trigger for ${game.target} was not rendered on the home page`);
  }
}

let screenshotPage = rootPage;
const featuredTrigger = rootPage
  .locator(`[data-game-target="${library.games[0].target}"][aria-haspopup="dialog"]`)
  .first();
const featuredDialogHref = await featuredTrigger.getAttribute("href");
if (!featuredDialogHref || !featuredDialogHref.startsWith("#")) {
  throw new Error(`Featured game trigger for ${library.games[0].target} did not point to a modal`);
}

const featuredDialog = rootPage.locator(featuredDialogHref);
await featuredTrigger.click();
await featuredDialog.waitFor({ state: "visible", timeout: 10000 });

if (normalizeUrl(rootPage.url()) !== normalizeUrl(url)) {
  throw new Error(`Root page navigated unexpectedly after opening game details: ${rootPage.url()}`);
}

const featuredLaunchHref = await featuredDialog
  .locator(".game-detail-actions .launch-button")
  .getAttribute("href");
if (featuredLaunchHref !== library.games[0].routePath) {
  throw new Error(
    `Modal launch button pointed to ${featuredLaunchHref} instead of ${library.games[0].routePath}`
  );
}

await featuredDialog.locator(".game-detail-close").click();
await featuredDialog.waitFor({ state: "hidden", timeout: 10000 });

for (const game of library.games) {
  const { frame, page, routeUrl } = await verifyTarget(context, url, game, { waitForLaunch: false });

  await verifyCursorGrabHintHiddenDuringBoot(page, game);
  await waitForGameStartup(page, frame, game);
  await verifyLaunchOverlayAfterStartup(page, game);
  await verifyCursorGrabHint(frame);
  await verifyRouteFrameAutofocus(page);
  await verifyEscapeStaysInGame(page, frame, routeUrl);
  await verifySkipIntroButton(page, frame, game);
  await verifyQuitReturnsHome(page, frame, url);

  screenshotPage = page;
}

const staleRecoveryContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
await seedStaleIni(staleRecoveryContext, url);
const { page: staleRecoveryPage } = await verifyTarget(
  staleRecoveryContext,
  url,
  library.games[library.games.length - 1]
);
await staleRecoveryPage.close();
await staleRecoveryContext.close();

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await screenshotPage.screenshot({ path: screenshotPath, fullPage: true });

await browser.close();

console.log("Verified launcher routes and wrote screenshot to", screenshotPath);
