import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { getBundledGameLibrary } from "../lib/catalog.mjs";
import { normalizeSkipIntroConfig } from "../app/skip-intro-config.mjs";

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
const expectedPwaThemeColor = "#1a4d1a";
const lureViewport = { width: 320, height: 200 };
const lureDoorHotspotPoint = { x: 22, y: 120 };
const lurePopupOpenPoint = { x: 36, y: 100 };
const lureDoorRegion = { x: 0, y: 52, width: 72, height: 120 };

if (!executablePath) {
  throw new Error("No local Chrome/Chromium installation found for Playwright");
}

function readGameLibraryFromDisk() {
  const publicDir = path.join(rootDir, "public");
  const libraryPath = path.join(publicDir, "games.json");
  return getBundledGameLibrary(JSON.parse(fs.readFileSync(libraryPath, "utf8")), {
    emptyLibraryMessage: `No installed game metadata found in ${libraryPath}`,
    normalizeSkipIntro: normalizeSkipIntroConfig,
  });
}

function normalizeUrl(value) {
  const resolvedUrl = new URL(value);
  resolvedUrl.hash = "";

  if (resolvedUrl.pathname === "") {
    resolvedUrl.pathname = "/";
  }

  return resolvedUrl.toString();
}

function getSignatureDistance(before, after) {
  if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;

  for (let index = 0; index < before.length; index += 1) {
    distance += Math.abs(before[index] - after[index]);
  }

  return distance;
}

function verifyPwaManifestOnDisk() {
  const manifestPath = path.join(rootDir, "public", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  if (manifest.start_url !== "/") {
    throw new Error(`Manifest start_url should be /, got ${manifest.start_url}`);
  }

  if (manifest.background_color !== expectedPwaThemeColor) {
    throw new Error(
      `Manifest background_color should be ${expectedPwaThemeColor}, got ${manifest.background_color}`
    );
  }

  if (manifest.theme_color !== expectedPwaThemeColor) {
    throw new Error(
      `Manifest theme_color should be ${expectedPwaThemeColor}, got ${manifest.theme_color}`
    );
  }
}

async function waitForGameStartup(page, frame, game) {
  const fatalOutputPatterns = [
    /Game data path does not exist/i,
    /Couldn't identify game/i,
    /No game data was found/i,
  ];
  const startedAt = Date.now();
  let latestOutput = "";

  while (Date.now() - startedAt < 30000) {
    const output = await frame.locator("#output").inputValue().catch(() => latestOutput);
    const statusText = await frame.locator("#status").textContent().catch(() => "");
    const readyState = await frame
      .locator("#canvas")
      .evaluate(() => window.__scummwebReadyState || null)
      .catch(() => null);
    latestOutput = output || latestOutput;

    if (/Exception thrown/i.test(statusText) || /TypeError|ReferenceError|abort\(/i.test(output)) {
      throw new Error(`Launch failed for ${game.target}.\n${output}`);
    }

    if (fatalOutputPatterns.some((pattern) => pattern.test(output))) {
      throw new Error(`Launch failed for ${game.target}.\n${output}`);
    }

    if (readyState?.target === game.target && readyState?.state === "ready") {
      return readyState;
    }

    await page.waitForTimeout(250);
  }

  throw new Error(`Game did not emit the expected ready signal for ${game.target}.\n${latestOutput}`);
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
  const routeUrl = new URL(game.playHref || game.href, baseUrl).toString();

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

async function waitForSkipIntroRelaunch(page, target, slot) {
  const relaunchState = await page.waitForFunction(
    ({ expectedTarget, expectedSlot }) => {
      const iframe = document.querySelector('iframe[data-scummvm-route-frame="true"]');

      if (!(iframe instanceof HTMLIFrameElement)) {
        return null;
      }

      try {
        const iframeUrl = new URL(iframe.src, window.location.href);
        const launchArgs = decodeURI(iframeUrl.hash.replace(/^#/, ""))
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const skipIntroStatus = iframe.contentWindow?.__scummwebSkipIntroSeedStatus;

        if (iframeUrl.searchParams.get("skipIntroTarget") !== expectedTarget) {
          return null;
        }

        if (launchArgs[0] !== "-x" || launchArgs[1] !== String(expectedSlot) || launchArgs[2] !== expectedTarget) {
          return null;
        }

        if (
          !skipIntroStatus ||
          skipIntroStatus.target !== expectedTarget ||
          !["ready", "missing", "error"].includes(skipIntroStatus.state)
        ) {
          return null;
        }

        return {
          iframeSrc: `${iframeUrl.pathname}${iframeUrl.search}${iframeUrl.hash}`,
          skipIntroStatus,
        };
      } catch {
        return null;
      }
    },
    {
      expectedTarget: target,
      expectedSlot: slot,
    },
    {
      timeout: 15000,
    }
  );

  return relaunchState.jsonValue();
}

async function verifySkipIntroButton(page, frame, game, routeUrl) {
  if (!game.skipIntro) {
    return;
  }

  const skipIntroButton = page.locator(".game-route-skip-intro-button");
  const exitButton = page.locator(".game-route-control-button.is-exit");
  await skipIntroButton.waitFor({ state: "visible", timeout: 45000 });
  await exitButton.waitFor({ state: "visible", timeout: 45000 });

  await skipIntroButton.click();

  const relaunchState = await waitForSkipIntroRelaunch(page, game.target, game.skipIntro.slot);

  if (relaunchState?.skipIntroStatus?.state !== "ready") {
    throw new Error(
      `Skip intro relaunch for ${game.target} did not seed save files successfully: ${JSON.stringify(relaunchState)}`
    );
  }

  await verifyCursorGrabHintHiddenDuringBoot(page, game);
  await waitForGameStartup(page, frame, game);
  await verifyLaunchOverlayAfterStartup(page, game);

  const seededFiles = await page.evaluate(() => {
    const iframe = document.querySelector('iframe[data-scummvm-route-frame="true"]');
    const skipIntroStatus = iframe?.contentWindow?.__scummwebSkipIntroSeedStatus;
    const fsApi = iframe?.contentWindow?.FS;

    if (!skipIntroStatus || skipIntroStatus.state !== "ready" || !skipIntroStatus.savePath || !fsApi) {
      return null;
    }

    return {
      savePath: skipIntroStatus.savePath,
      files: fsApi.readdir(skipIntroStatus.savePath).filter((entry) => entry !== "." && entry !== ".."),
    };
  });

  if (!seededFiles) {
    throw new Error(`Skip intro relaunch for ${game.target} did not expose seeded save files.`);
  }

  for (const saveFile of game.skipIntro.saveFiles) {
    if (!seededFiles.files.includes(saveFile)) {
      throw new Error(
        `Skip intro relaunch for ${game.target} did not seed ${saveFile}. Seeded files: ${JSON.stringify(seededFiles)}`
      );
    }
  }

  await skipIntroButton.waitFor({ state: "hidden", timeout: 5000 });

  if (normalizeUrl(page.url()) !== normalizeUrl(routeUrl)) {
    throw new Error(`Skip intro relaunch redirected unexpectedly from ${routeUrl} to ${page.url()}`);
  }

  if (game.target === "lure") {
    await page.waitForTimeout(1500);
    await verifyLurePopupMenuSelection(page, frame);
  }
}

async function getCanvasRenderedBounds(frame) {
  return frame.locator("#canvas").evaluate(async (canvas) => {
    const screenshot = new Image();
    screenshot.src = canvas.toDataURL("image/png");
    await screenshot.decode();

    const scratch = document.createElement("canvas");
    scratch.width = screenshot.width;
    scratch.height = screenshot.height;
    const context = scratch.getContext("2d", { willReadFrequently: true });

    if (!context) {
      throw new Error("Unable to create scratch canvas for Lure verification.");
    }

    context.drawImage(screenshot, 0, 0);
    const imageData = context.getImageData(0, 0, scratch.width, scratch.height);
    const { data, width, height } = imageData;

    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        const brightness = data[offset] + data[offset + 1] + data[offset + 2];

        if (alpha === 0 || brightness <= 12) {
          continue;
        }

        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }

    if (right < left || bottom < top) {
      throw new Error("Unable to locate active game pixels in the Lure canvas.");
    }

    return {
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
    };
  });
}

function mapLogicalPointToCanvas(renderedBounds, point) {
  return {
    x: renderedBounds.left + (point.x / lureViewport.width) * renderedBounds.width,
    y: renderedBounds.top + (point.y / lureViewport.height) * renderedBounds.height,
  };
}

async function sampleCanvasRegion(frame, renderedBounds, region, sampleGridSize = 16) {
  return frame.locator("#canvas").evaluate(
    async (canvas, { bounds, logicalRegion, viewport, gridSize }) => {
      const screenshot = new Image();
      screenshot.src = canvas.toDataURL("image/png");
      await screenshot.decode();

      const scratch = document.createElement("canvas");
      scratch.width = screenshot.width;
      scratch.height = screenshot.height;
      const context = scratch.getContext("2d", { willReadFrequently: true });

      if (!context) {
        throw new Error("Unable to create scratch canvas for Lure sampling.");
      }

      context.drawImage(screenshot, 0, 0);

      const actualRegion = {
        left: Math.max(0, Math.floor(bounds.left + (logicalRegion.x / viewport.width) * bounds.width)),
        top: Math.max(0, Math.floor(bounds.top + (logicalRegion.y / viewport.height) * bounds.height)),
        width: Math.max(1, Math.ceil((logicalRegion.width / viewport.width) * bounds.width)),
        height: Math.max(1, Math.ceil((logicalRegion.height / viewport.height) * bounds.height)),
      };
      const imageData = context.getImageData(actualRegion.left, actualRegion.top, actualRegion.width, actualRegion.height);
      const signature = [];

      for (let gridY = 0; gridY < gridSize; gridY += 1) {
        const startY = Math.floor((gridY / gridSize) * actualRegion.height);
        const endY = Math.max(startY + 1, Math.floor(((gridY + 1) / gridSize) * actualRegion.height));

        for (let gridX = 0; gridX < gridSize; gridX += 1) {
          const startX = Math.floor((gridX / gridSize) * actualRegion.width);
          const endX = Math.max(startX + 1, Math.floor(((gridX + 1) / gridSize) * actualRegion.width));
          let redTotal = 0;
          let greenTotal = 0;
          let blueTotal = 0;
          let samples = 0;

          for (let y = startY; y < endY; y += 1) {
            for (let x = startX; x < endX; x += 1) {
              const offset = (y * actualRegion.width + x) * 4;
              redTotal += imageData.data[offset];
              greenTotal += imageData.data[offset + 1];
              blueTotal += imageData.data[offset + 2];
              samples += 1;
            }
          }

          const averageRed = redTotal / samples;
          const averageGreen = greenTotal / samples;
          const averageBlue = blueTotal / samples;
          signature.push(
            Math.round(averageRed / 8),
            Math.round(averageGreen / 8),
            Math.round(averageBlue / 8)
          );
        }
      }

      return signature;
    },
    {
      bounds: renderedBounds,
      logicalRegion: region,
      viewport: lureViewport,
      gridSize: sampleGridSize,
    }
  );
}

async function verifyLurePopupMenuSelection(page, frame) {
  const renderedBounds = await getCanvasRenderedBounds(frame);
  const canvas = frame.locator("#canvas");
  const doorBefore = await sampleCanvasRegion(frame, renderedBounds, lureDoorRegion);
  const doorHotspot = mapLogicalPointToCanvas(renderedBounds, lureDoorHotspotPoint);
  const popupOpen = mapLogicalPointToCanvas(renderedBounds, lurePopupOpenPoint);

  await canvas.click({ button: "right", position: doorHotspot, force: true });
  await page.waitForTimeout(300);
  await canvas.click({ position: popupOpen, force: true });

  const doorChange = await page.waitForFunction(
    async ({ selector, bounds, region, viewport, beforeSignature }) => {
      const canvas = document.querySelector(selector);

      if (!(canvas instanceof HTMLCanvasElement)) {
        return null;
      }

      const screenshot = new Image();
      screenshot.src = canvas.toDataURL("image/png");
      await screenshot.decode();

      const scratch = document.createElement("canvas");
      scratch.width = screenshot.width;
      scratch.height = screenshot.height;
      const context = scratch.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return null;
      }

      context.drawImage(screenshot, 0, 0);

      const actualRegion = {
        left: Math.max(0, Math.floor(bounds.left + (region.x / viewport.width) * bounds.width)),
        top: Math.max(0, Math.floor(bounds.top + (region.y / viewport.height) * bounds.height)),
        width: Math.max(1, Math.ceil((region.width / viewport.width) * bounds.width)),
        height: Math.max(1, Math.ceil((region.height / viewport.height) * bounds.height)),
      };
      const imageData = context.getImageData(actualRegion.left, actualRegion.top, actualRegion.width, actualRegion.height);
      const currentSignature = [];

      for (let gridY = 0; gridY < 16; gridY += 1) {
        const startY = Math.floor((gridY / 16) * actualRegion.height);
        const endY = Math.max(startY + 1, Math.floor(((gridY + 1) / 16) * actualRegion.height));

        for (let gridX = 0; gridX < 16; gridX += 1) {
          const startX = Math.floor((gridX / 16) * actualRegion.width);
          const endX = Math.max(startX + 1, Math.floor(((gridX + 1) / 16) * actualRegion.width));
          let redTotal = 0;
          let greenTotal = 0;
          let blueTotal = 0;
          let samples = 0;

          for (let y = startY; y < endY; y += 1) {
            for (let x = startX; x < endX; x += 1) {
              const offset = (y * actualRegion.width + x) * 4;
              redTotal += imageData.data[offset];
              greenTotal += imageData.data[offset + 1];
              blueTotal += imageData.data[offset + 2];
              samples += 1;
            }
          }

          currentSignature.push(
            Math.round(redTotal / samples / 8),
            Math.round(greenTotal / samples / 8),
            Math.round(blueTotal / samples / 8)
          );
        }
      }

      let distance = 0;
      for (let index = 0; index < beforeSignature.length; index += 1) {
        distance += Math.abs(beforeSignature[index] - currentSignature[index]);
      }

      return distance >= 220 ? distance : null;
    },
    {
      selector: "#canvas",
      bounds: renderedBounds,
      region: lureDoorRegion,
      viewport: lureViewport,
      beforeSignature: doorBefore,
    },
    { timeout: 10000 }
  ).then((result) => result.jsonValue());

  if (typeof doorChange !== "number" || !Number.isFinite(doorChange)) {
    throw new Error(`Lure popup-menu selection did not change the door state: ${doorChange}`);
  }
}

async function verifyScummvmMenuButton(page, frame, routeUrl) {
  const menuButton = page.locator('.game-route-control-button.is-menu[title="Open ScummVM menu"]');
  const exitButton = page.locator('.game-route-control-button.is-exit[title="Exit game"]');
  const fullscreenButton = page.locator('.game-route-control-button.is-fullscreen');

  await exitButton.waitFor({ state: "visible", timeout: 15000 });

  // The menu reveal is delayed, but by the time the exit control appears the menu may have
  // already transitioned into its visible end state. Accept either path.
  const isMenuVisible = await menuButton.isVisible().catch(() => false);

  if (!isMenuVisible) {
    await menuButton.waitFor({ state: "visible", timeout: 15000 });
  }

  const controlLayout = await page.evaluate(() => {
    function readBox(selector) {
      const element = document.querySelector(selector);

      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const rect = element.getBoundingClientRect();

      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }

    return {
      viewportWidth: window.innerWidth,
      exit: readBox(".game-route-control-button.is-exit"),
      menu: readBox(".game-route-control-button.is-menu"),
      fullscreen: readBox(".game-route-control-button.is-fullscreen"),
    };
  });

  if (!controlLayout.exit || !controlLayout.menu) {
    throw new Error(`Missing control layout boxes: ${JSON.stringify(controlLayout)}`);
  }

  const overlapsExit =
    controlLayout.menu.left < controlLayout.exit.right &&
    controlLayout.menu.right > controlLayout.exit.left &&
    controlLayout.menu.top < controlLayout.exit.bottom &&
    controlLayout.menu.bottom > controlLayout.exit.top;

  if (overlapsExit) {
    throw new Error(`ScummVM menu button overlaps exit button: ${JSON.stringify(controlLayout)}`);
  }

  if (controlLayout.menu.left < controlLayout.viewportWidth / 2) {
    throw new Error(`ScummVM menu button is not positioned in the right-side control cluster: ${JSON.stringify(controlLayout)}`);
  }

  if (await fullscreenButton.count()) {
    const fullscreenBox = controlLayout.fullscreen;

    if (!fullscreenBox) {
      throw new Error(`Missing fullscreen control layout box: ${JSON.stringify(controlLayout)}`);
    }

    if (fullscreenBox.right > controlLayout.menu.left) {
      throw new Error(`Fullscreen button is not placed next to the ScummVM menu button: ${JSON.stringify(controlLayout)}`);
    }
  }

  await frame.locator("#canvas").evaluate((canvas) => {
    window.__menuButtonVerificationEvents = [];
    const record = (label) => (event) => {
      window.__menuButtonVerificationEvents.push({
        label,
        key: event.key,
        code: event.code,
        which: event.which,
        keyCode: event.keyCode,
        ctrlKey: event.ctrlKey,
        timestamp: performance.now(),
      });
    };

    const targets = [
      ["window", window],
      ["document", document],
      ["body", document.body],
      ["canvas", canvas],
    ];

    for (const [label, target] of targets) {
      if (target && typeof target.addEventListener === "function") {
        target.addEventListener("keydown", record(label), true);
      }
    }
  });

  await menuButton.click();

  await frame.locator("#canvas").evaluate(
    () =>
      new Promise((resolve, reject) => {
        const startedAt = Date.now();

        function check() {
          const events = window.__menuButtonVerificationEvents || [];
          const matchingEvent = events.find(
            (event) => event.key === "F5" && event.code === "F5" && event.keyCode === 116 && event.ctrlKey
          );

          if (matchingEvent) {
            resolve();
            return;
          }

          if (Date.now() - startedAt >= 1500) {
            reject(
              new Error(
                `ScummVM menu button did not dispatch Ctrl+F5. Recorded events: ${JSON.stringify(events)}`
              )
            );
            return;
          }

          window.setTimeout(check, 50);
        }

        check();
      }),
  );

  await page.waitForTimeout(300);

  const focusState = await page.evaluate(() => {
    const shell = document.querySelector(".game-route-shell");
    const frame = document.querySelector(".game-route-frame[data-scummvm-route-frame='true']");

    if (!(shell instanceof HTMLElement) || !(frame instanceof HTMLIFrameElement)) {
      return null;
    }

    const shellStyle = window.getComputedStyle(shell);
    const frameStyle = window.getComputedStyle(frame);

    return {
      shellOverflow: shellStyle.overflow,
      frameOutlineStyle: frameStyle.outlineStyle,
      frameOutlineWidth: frameStyle.outlineWidth,
      frameBoxShadow: frameStyle.boxShadow,
    };
  });

  if (!focusState) {
    throw new Error("Unable to read route frame focus styles after clicking the ScummVM menu button.");
  }

  if (focusState.shellOverflow !== "hidden") {
    throw new Error(`Game route shell did not clip iframe focus styles: ${JSON.stringify(focusState)}`);
  }

  if (normalizeUrl(page.url()) !== normalizeUrl(routeUrl)) {
    throw new Error(`ScummVM menu button redirected unexpectedly from ${routeUrl} to ${page.url()}`);
  }
}

async function verifyCursorGrabHint(page, frame) {
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

  await canvas.hover({ force: true });
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

  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
}

async function verifyCursorGrabHintHiddenDuringBoot(page, game) {
  const launchDetectedState = await page.waitForFunction(
    ({ expectedTarget }) => {
      const iframe = document.querySelector('iframe[data-scummvm-route-frame="true"]');
      const overlay = document.querySelector('[data-launch-overlay="true"]');

      if (!(iframe instanceof HTMLIFrameElement)) {
        return null;
      }

      const readyState = iframe.contentWindow?.__scummwebReadyState;
      const hint = iframe.contentDocument?.getElementById("scummvm-cursor-grab-hint");

      if (
        readyState?.target !== expectedTarget ||
        !["launch-detected", "ready"].includes(readyState.state)
      ) {
        return null;
      }

      return {
        hintVisible: hint?.classList.contains("scummvm-cursor-grab-hint-visible") || false,
        overlayState: overlay?.getAttribute("data-launch-overlay-state") || null,
        readyState,
      };
    },
    {
      expectedTarget: game.target,
    },
    {
      timeout: 15000,
    }
  );

  const launchState = await launchDetectedState.jsonValue();

  if (launchState?.readyState?.state === "ready") {
    throw new Error(`Ready signal for ${game.target} fired before the verifier observed the guarded launch state.`);
  }

  if (launchState?.hintVisible) {
    throw new Error(`Cursor grab hint appeared before ${game.target} emitted its explicit ready signal.`);
  }

  if (launchState?.overlayState !== "visible") {
    throw new Error(
      `Launch overlay hid for ${game.target} as soon as launch output appeared instead of waiting for readiness.`
    );
  }

  await page.mouse.move(0, 0);
  await page.waitForTimeout(100);
}

async function verifyQuitReturnsHome(page, frame, expectedUrl) {
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

  await page.waitForURL((currentUrl) => normalizeUrl(currentUrl.toString()) === normalizeUrl(expectedUrl), {
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

async function verifyMobileTouchClickToggle(browser, baseUrl, game) {
  const mobileContext = await browser.newContext({
    viewport: { width: 932, height: 430 },
    screen: { width: 932, height: 430 },
    hasTouch: true,
    isMobile: true,
  });

  try {
    const {
      frame,
      page,
      routeUrl,
    } = await verifyTarget(mobileContext, baseUrl, game, { waitForLaunch: false });

    await waitForGameStartup(page, frame, game);
    await verifyLaunchOverlayAfterStartup(page, game);

    const continueButton = page.locator(".game-route-mobile-button");
    const continueVisible = await continueButton.isVisible().catch(() => false);

    if (continueVisible) {
      await continueButton.tap();
      await continueButton.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
    }

    const touchToggle = page.locator(".game-route-control-button.is-touch-toggle");
    await touchToggle.waitFor({ state: "visible", timeout: 15000 });

    const initialMode = await touchToggle.getAttribute("data-mode");

    if (initialMode !== "left") {
      throw new Error(`Expected mobile touch toggle to start in left-click mode, got ${initialMode}.`);
    }

    await frame.locator("#canvas").evaluate((canvas) => {
      window.__touchClickVerificationEvents = [];
      const record = (label) => (event) => {
        window.__touchClickVerificationEvents.push({
          label,
          type: event.type,
          button: typeof event.button === "number" ? event.button : null,
          buttons: typeof event.buttons === "number" ? event.buttons : null,
          touches: "touches" in event ? event.touches.length : null,
          changedTouches: "changedTouches" in event ? event.changedTouches.length : null,
        });
      };

      for (const eventName of [
        "touchstart",
        "touchmove",
        "touchend",
        "touchcancel",
        "pointerdown",
        "pointerup",
        "mousedown",
        "mouseup",
        "click",
        "contextmenu",
      ]) {
        canvas.addEventListener(eventName, record("capture"), true);
        canvas.addEventListener(eventName, record("bubble"));
      }
    });

    await touchToggle.tap();

    await page.waitForFunction(() => {
      const button = document.querySelector(".game-route-control-button.is-touch-toggle");
      return button?.getAttribute("data-mode") === "right" && button.getAttribute("aria-pressed") === "true";
    });

    const frameTouchMode = await frame.locator("#canvas").evaluate(
      () => window.localStorage.getItem("scummweb.touchClickMode")
    );

    if (frameTouchMode !== "right") {
      throw new Error(`Touch mode did not sync into the game frame after toggle: ${frameTouchMode}`);
    }

    await frame.locator("#canvas").tap({ position: { x: 160, y: 120 }, force: true });
    await page.waitForTimeout(250);

    const verification = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return {
        events,
        sawLeakedTouchEvent: events.some((event) => event.type.startsWith("touch")),
        sawRightMouseDown: events.some((event) => event.type === "mousedown" && event.button === 2),
        sawRightMouseUp: events.some((event) => event.type === "mouseup" && event.button === 2),
        sawContextMenu: events.some((event) => event.type === "contextmenu" && event.button === 2),
      };
    });

    if (verification.sawLeakedTouchEvent) {
      throw new Error(
        `Native touch events leaked past the scummweb mobile shim: ${JSON.stringify(verification.events)}`
      );
    }

    if (!verification.sawRightMouseDown || !verification.sawRightMouseUp || !verification.sawContextMenu) {
      throw new Error(
        `Mobile right-click toggle did not synthesize the expected secondary-click events: ${JSON.stringify(
          verification.events
        )}`
      );
    }

    if (normalizeUrl(page.url()) !== normalizeUrl(routeUrl)) {
      throw new Error(`Mobile touch toggle redirected unexpectedly from ${routeUrl} to ${page.url()}`);
    }

    await page.close();
  } finally {
    await mobileContext.close();
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath,
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});

verifyPwaManifestOnDisk();

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

const library = readGameLibraryFromDisk();

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
if (featuredLaunchHref !== library.games[0].playHref) {
  throw new Error(
    `Modal launch button pointed to ${featuredLaunchHref} instead of ${library.games[0].playHref}`
  );
}

await featuredDialog.locator(".game-detail-close").click();
await featuredDialog.waitFor({ state: "hidden", timeout: 10000 });
await rootPage.close();

const saveSlotGame = library.games.find((game) => game.skipIntro?.strategy === "save-slot");

if (saveSlotGame) {
  const freshSkipIntroContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const freshSkipIntroRootPage = await freshSkipIntroContext.newPage();
  await freshSkipIntroRootPage.goto(url, { waitUntil: "domcontentloaded" });
  await freshSkipIntroRootPage.waitForLoadState("networkidle");
  await freshSkipIntroRootPage.close();
  const {
    frame: freshSkipIntroFrame,
    page: freshSkipIntroPage,
    routeUrl: freshSkipIntroRouteUrl,
  } = await verifyTarget(freshSkipIntroContext, url, saveSlotGame, { waitForLaunch: false });

  await waitForGameStartup(freshSkipIntroPage, freshSkipIntroFrame, saveSlotGame);
  await verifyLaunchOverlayAfterStartup(freshSkipIntroPage, saveSlotGame);
  await verifySkipIntroButton(
    freshSkipIntroPage,
    freshSkipIntroFrame,
    saveSlotGame,
    freshSkipIntroRouteUrl
  );

  await freshSkipIntroPage.close();
  await freshSkipIntroContext.close();
}

for (const game of library.games) {
  const { frame, page, routeUrl } = await verifyTarget(context, url, game, { waitForLaunch: false });

  await verifyCursorGrabHintHiddenDuringBoot(page, game);
  await waitForGameStartup(page, frame, game);
  await verifyLaunchOverlayAfterStartup(page, game);
  await verifyRouteFrameAutofocus(page);
  await verifyEscapeStaysInGame(page, frame, routeUrl);
  await verifySkipIntroButton(page, frame, game, routeUrl);
  await verifyScummvmMenuButton(page, frame, routeUrl);
  await verifyQuitReturnsHome(page, frame, new URL(game.href, url).toString());

  if (screenshotPage && screenshotPage !== rootPage && screenshotPage !== page && !screenshotPage.isClosed()) {
    await screenshotPage.close();
  }

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

await verifyMobileTouchClickToggle(
  browser,
  url,
  library.games.find((game) => !game.skipIntro) || library.games[0]
);

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await screenshotPage.screenshot({ path: screenshotPath, fullPage: true });

await browser.close();

console.log("Verified launcher routes and wrote screenshot to", screenshotPath);
