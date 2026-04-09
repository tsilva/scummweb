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
const expectedLaunchPhaseSequence = ["pending", "runtime-ready", "launch-detected", "awaiting-frame", "ready"];
const initialBootOverlayText = "Loading ScummVM...";
const lurePopupProbePoint = { x: 106, y: 519 };
const lurePopupSelectPoint = { x: 168, y: 436 };

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

function assertOrderedEntries(actualEntries, expectedEntries, label) {
  let searchStartIndex = 0;

  for (const expectedEntry of expectedEntries) {
    const matchedIndex = actualEntries.indexOf(expectedEntry, searchStartIndex);

    if (matchedIndex === -1) {
      throw new Error(
        `${label} did not include the expected ordered entry ${expectedEntry}. Saw: ${JSON.stringify(actualEntries)}`
      );
    }

    searchStartIndex = matchedIndex + 1;
  }
}

async function ensureLaunchOverlayHistoryCapture(page) {
  await page.evaluate(() => {
    if (window.__scummwebOverlayStatusCaptureStarted) {
      return;
    }

    window.__scummwebOverlayStatusHistory = [];
    const captureSnapshot = () => {
      const overlay = document.querySelector('[data-launch-overlay="true"]');
      const statusText = document.querySelector('[data-launch-status="true"]')?.textContent?.trim() || null;
      const history = Array.isArray(window.__scummwebOverlayStatusHistory)
        ? window.__scummwebOverlayStatusHistory
        : [];
      const nextSnapshot = {
        state: overlay?.getAttribute("data-launch-overlay-state") || null,
        text: statusText,
      };
      const previousSnapshot = history[history.length - 1];

      if (
        previousSnapshot &&
        previousSnapshot.state === nextSnapshot.state &&
        previousSnapshot.text === nextSnapshot.text
      ) {
        return;
      }

      history.push(nextSnapshot);
      window.__scummwebOverlayStatusHistory = history;
    };

    captureSnapshot();
    window.__scummwebOverlayStatusCaptureStarted = true;
    window.__scummwebOverlayStatusCaptureInterval = window.setInterval(captureSnapshot, 50);
  });
}

async function resetLaunchOverlayHistoryCapture(page) {
  await page.evaluate(() => {
    window.__scummwebOverlayStatusHistory = [];
  });
}

async function readLaunchArtifacts(page, frame) {
  const [overlayHistory, readyStateHistory] = await Promise.all([
    page.evaluate(() => window.__scummwebOverlayStatusHistory || []),
    frame
      .locator("#canvas")
      .evaluate(() => window.__scummwebReadyStateHistory || [])
      .catch(() => []),
  ]);

  return { overlayHistory, readyStateHistory };
}

function verifyLaunchProgressHistory({
  assertOverlayTextHistory = true,
  game,
  overlayHistory,
  readyStateHistory,
}) {
  const observedStates = readyStateHistory
    .filter((entry) => entry?.target === game.target)
    .map((entry) => entry.state);
  const observedTexts = overlayHistory.map((entry) => entry?.text).filter(Boolean);
  const runtimeReadyText = `ScummVM loaded. Starting ${game.displayTitle}...`;
  const launchDetectedText = `${game.displayTitle} engine started. Preparing the scene...`;
  const awaitingFrameText = "Almost there. Waiting for the first frame...";
  const expectedTexts = [
    ...(observedTexts.includes(initialBootOverlayText) ? [initialBootOverlayText] : []),
    ...(observedTexts.includes(runtimeReadyText) ? [runtimeReadyText] : []),
    ...(observedTexts.includes(launchDetectedText) ? [launchDetectedText] : []),
    awaitingFrameText,
  ];
  const firstNonInitialTextIndex = observedTexts.findIndex((entry) => entry !== initialBootOverlayText);
  const loadingRegressionIndex =
    firstNonInitialTextIndex === -1
      ? -1
      : observedTexts.indexOf(initialBootOverlayText, firstNonInitialTextIndex);

  assertOrderedEntries(observedStates, expectedLaunchPhaseSequence, `${game.target} ready-state history`);
  if (assertOverlayTextHistory) {
    if (expectedTexts.length > 0) {
      assertOrderedEntries(observedTexts, expectedTexts, `${game.target} overlay text history`);
    }
  }

  if (assertOverlayTextHistory && loadingRegressionIndex !== -1) {
    throw new Error(
      `Launch overlay for ${game.target} regressed to ${JSON.stringify(initialBootOverlayText)} after advancing. Saw: ${JSON.stringify(observedTexts)}`
    );
  }
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

async function waitForGameStartup(page, frame, game, { assertOverlayTextHistory = true } = {}) {
  const fatalOutputPatterns = [
    /Game data path does not exist/i,
    /Couldn't identify game/i,
    /No game data was found/i,
  ];
  const startedAt = Date.now();
  let latestOutput = "";

  while (Date.now() - startedAt < 60000) {
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
      const launchArtifacts = await readLaunchArtifacts(page, frame);
      verifyLaunchProgressHistory({ assertOverlayTextHistory, game, ...launchArtifacts });
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

async function verifyTouchCursorPadHiddenOnDesktop(page, game) {
  const cursorPadCount = await page.locator(".game-route-touch-cursor-pad").count();
  const joystickCount = await page.locator(".game-route-touch-joystick").count();

  if (cursorPadCount !== 0) {
    throw new Error(`Touch cursor pad rendered on desktop for ${game.target}.`);
  }

  if (joystickCount !== 0) {
    throw new Error(`Touch joystick rendered on desktop for ${game.target}.`);
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
  await ensureLaunchOverlayHistoryCapture(page);
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
  const earlySkipIntroState = await page.waitForFunction(
    ({ expectedTarget }) => {
      const iframe = document.querySelector('iframe[data-scummvm-route-frame="true"]');
      const overlay = document.querySelector('[data-launch-overlay="true"]');
      const button = document.querySelector(".game-route-skip-intro-button");

      if (!(iframe instanceof HTMLIFrameElement) || !(button instanceof HTMLButtonElement)) {
        return null;
      }

      const readyState = iframe.contentWindow?.__scummwebReadyState;
      const buttonVisible =
        !button.disabled &&
        button.getClientRects().length > 0 &&
        window.getComputedStyle(button).visibility !== "hidden" &&
        window.getComputedStyle(button).display !== "none";

      if (!buttonVisible || readyState?.target !== expectedTarget) {
        return null;
      }

      return {
        overlayState: overlay?.getAttribute("data-launch-overlay-state") || null,
        readyState,
      };
    },
    {
      expectedTarget: game.target,
    },
    {
      timeout: 20000,
    }
  );

  const earlySkipIntroSnapshot = await earlySkipIntroState.jsonValue();

  if (earlySkipIntroSnapshot?.overlayState !== "visible") {
    throw new Error(
      `Skip intro for ${game.target} did not appear while the launch overlay was still visible: ${JSON.stringify(earlySkipIntroSnapshot)}`
    );
  }

  if (!["launch-detected", "awaiting-frame", "ready"].includes(earlySkipIntroSnapshot?.readyState?.state)) {
    throw new Error(
      `Skip intro for ${game.target} became visible before launch detection: ${JSON.stringify(earlySkipIntroSnapshot)}`
    );
  }

  await skipIntroButton.waitFor({ state: "visible", timeout: 45000 });
  await exitButton.waitFor({ state: "visible", timeout: 45000 });

  await resetLaunchOverlayHistoryCapture(page);
  await skipIntroButton.click();

  const relaunchState = await waitForSkipIntroRelaunch(page, game.target, game.skipIntro.slot);

  if (relaunchState?.skipIntroStatus?.state !== "ready") {
    throw new Error(
      `Skip intro relaunch for ${game.target} did not seed save files successfully: ${JSON.stringify(relaunchState)}`
    );
  }

  await verifyCursorGrabHintHiddenDuringBoot(page, game);
  await waitForGameStartup(page, frame, game, { assertOverlayTextHistory: false });
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

async function verifyLurePopupMenuSelection(page, frame) {
  const canvas = frame.locator("#canvas");
  await canvas.click({ button: "right", position: lurePopupProbePoint, force: true });
  await page.waitForTimeout(300);
  await canvas.click({ position: lurePopupSelectPoint, force: true });
  await page.waitForTimeout(700);

  if (normalizeUrl(page.url()) !== normalizeUrl(new URL("/lure-of-the-temptress/play", page.url()).toString())) {
    throw new Error(`Lure popup-menu probe changed the route unexpectedly: ${page.url()}`);
  }

  const readyState = await frame.locator("#canvas").evaluate(() => window.__scummwebReadyState || null);

  if (readyState?.target !== "lure" || readyState?.state !== "ready") {
    throw new Error(`Lure popup-menu probe left the game in an unexpected state: ${JSON.stringify(readyState)}`);
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
      const readyStateHistory = iframe.contentWindow?.__scummwebReadyStateHistory || [];
      const hint = iframe.contentDocument?.getElementById("scummvm-cursor-grab-hint");
      const awaitingFrameSeen = readyStateHistory.some(
        (entry) => entry?.target === expectedTarget && entry?.state === "awaiting-frame"
      );
      const observedBootPhase = ["launch-detected", "awaiting-frame", "ready"].includes(readyState?.state);

      if (readyState?.target !== expectedTarget || !observedBootPhase) {
        return null;
      }

      return {
        awaitingFrameSeen,
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

  if (launchState?.hintVisible) {
    throw new Error(`Cursor grab hint appeared before ${game.target} emitted its explicit ready signal.`);
  }

  if (launchState?.readyState?.state !== "ready" && launchState?.overlayState !== "visible") {
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

    const legacyTouchToggle = page.locator(".game-route-control-button.is-touch-toggle");
    const leftTouchClickButton = page.locator('.game-route-control-button.is-touch-click[data-button="left"]');
    const rightTouchClickButton = page.locator('.game-route-control-button.is-touch-click[data-button="right"]');
    const legacyTouchJoystick = page.locator(".game-route-touch-joystick");
    const touchCursorPad = page.locator(".game-route-touch-cursor-pad");
    await touchCursorPad.waitFor({ state: "visible", timeout: 15000 });
    await leftTouchClickButton.waitFor({ state: "visible", timeout: 15000 });
    await rightTouchClickButton.waitFor({ state: "visible", timeout: 15000 });

    if ((await legacyTouchToggle.count()) !== 0) {
      throw new Error(`Legacy touch click toggle still rendered for ${game.target}.`);
    }

    if ((await legacyTouchJoystick.count()) !== 0) {
      throw new Error(`Legacy touch joystick still rendered for ${game.target}.`);
    }

    if (game.skipIntro) {
      const skipIntroButton = page.locator(".game-route-skip-intro-button");
      await skipIntroButton.waitFor({ state: "visible", timeout: 15000 });
    }

    const controlLayout = await page.evaluate(() => {
      const cursorPad = document.querySelector(".game-route-touch-cursor-pad");
      const leftButton = document.querySelector('.game-route-control-button.is-touch-click[data-button="left"]');
      const rightButton = document.querySelector('.game-route-control-button.is-touch-click[data-button="right"]');
      const skipIntroButton = document.querySelector(".game-route-skip-intro-button");

      if (
        !(cursorPad instanceof HTMLElement) ||
        !(leftButton instanceof HTMLElement) ||
        !(rightButton instanceof HTMLElement)
      ) {
        return null;
      }

      const cursorPadRect = cursorPad.getBoundingClientRect();
      const leftButtonRect = leftButton.getBoundingClientRect();
      const rightButtonRect = rightButton.getBoundingClientRect();
      const skipIntroRect =
        skipIntroButton instanceof HTMLElement ? skipIntroButton.getBoundingClientRect() : null;

      return {
        cursorPad: {
          bottom: cursorPadRect.bottom,
          height: cursorPadRect.height,
          left: cursorPadRect.left,
          width: cursorPadRect.width,
        },
        leftButton: {
          bottom: leftButtonRect.bottom,
          height: leftButtonRect.height,
          left: leftButtonRect.left,
          right: leftButtonRect.right,
          top: leftButtonRect.top,
          width: leftButtonRect.width,
        },
        rightButton: {
          bottom: rightButtonRect.bottom,
          height: rightButtonRect.height,
          left: rightButtonRect.left,
          right: rightButtonRect.right,
          top: rightButtonRect.top,
          width: rightButtonRect.width,
        },
        skipIntro: skipIntroRect
          ? {
              bottom: skipIntroRect.bottom,
              top: skipIntroRect.top,
            }
          : null,
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    });

    if (!controlLayout) {
      throw new Error("Mobile touch controls did not render.");
    }

    if (
      controlLayout.cursorPad.width < 50 ||
      controlLayout.cursorPad.width > 66 ||
      controlLayout.cursorPad.height < 50 ||
      controlLayout.cursorPad.height > 66
    ) {
      throw new Error(`Unexpected cursor pad dimensions: ${JSON.stringify(controlLayout)}`);
    }

    if (controlLayout.cursorPad.left > 36 || controlLayout.viewportHeight - controlLayout.cursorPad.bottom > 36) {
      throw new Error(`Cursor pad was not pinned to the bottom-left corner: ${JSON.stringify(controlLayout)}`);
    }

    if (
      controlLayout.viewportWidth - controlLayout.rightButton.right > 36 ||
      controlLayout.viewportHeight - controlLayout.rightButton.bottom > 36
    ) {
      throw new Error(`Touch click buttons were not pinned to the bottom-right corner: ${JSON.stringify(controlLayout)}`);
    }

    if (Math.abs(controlLayout.rightButton.bottom - controlLayout.cursorPad.bottom) > 4) {
      throw new Error(`Right click button was not bottom-aligned with the cursor pad: ${JSON.stringify(controlLayout)}`);
    }

    if (Math.abs(controlLayout.leftButton.bottom - controlLayout.rightButton.bottom) > 4) {
      throw new Error(`Touch click buttons were not bottom-aligned: ${JSON.stringify(controlLayout)}`);
    }

    if (controlLayout.leftButton.right >= controlLayout.rightButton.left) {
      throw new Error(`Touch click buttons overlapped instead of sitting side by side: ${JSON.stringify(controlLayout)}`);
    }

    if (game.skipIntro && controlLayout.skipIntro && controlLayout.skipIntro.bottom >= controlLayout.leftButton.top) {
      throw new Error(`Skip intro button overlapped the touch click row: ${JSON.stringify(controlLayout)}`);
    }

    await frame.locator("#canvas").evaluate((canvas) => {
      window.__touchClickVerificationEvents = [];
      const record = (label) => (event) => {
        window.__touchClickVerificationEvents.push({
          label,
          type: event.type,
          button: typeof event.button === "number" ? event.button : null,
          buttons: typeof event.buttons === "number" ? event.buttons : null,
          clientX: typeof event.clientX === "number" ? event.clientX : null,
          clientY: typeof event.clientY === "number" ? event.clientY : null,
          touches: "touches" in event ? event.touches.length : null,
          changedTouches: "changedTouches" in event ? event.changedTouches.length : null,
        });
      };

      for (const eventName of [
        "touchstart",
        "touchmove",
        "touchend",
        "touchcancel",
        "pointermove",
        "pointerdown",
        "pointerup",
        "mousemove",
        "mousedown",
        "mouseup",
        "click",
        "contextmenu",
      ]) {
        canvas.addEventListener(eventName, record("capture"), true);
        canvas.addEventListener(eventName, record("bubble"));
      }
    });

    const cursorPadBox = await touchCursorPad.boundingBox();

    if (!cursorPadBox) {
      throw new Error("Unable to read cursor pad bounds during mobile verification.");
    }

    const cursorPadCenterX = cursorPadBox.x + cursorPadBox.width / 2;
    const cursorPadCenterY = cursorPadBox.y + cursorPadBox.height / 2;

    await frame.locator("#canvas").evaluate(() => {
      window.__touchClickVerificationEvents = [];
    });

    await page.mouse.move(cursorPadCenterX, cursorPadCenterY);
    await page.mouse.down();
    await page.mouse.move(cursorPadCenterX + 18, cursorPadCenterY - 12, { steps: 6 });
    await page.waitForTimeout(120);

    const cursorPadVerification = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return {
        events,
        moveEvents: events.filter((event) => event.type === "mousemove" || event.type === "pointermove"),
        sawLeakedTouchEvent: events.some((event) => event.type.startsWith("touch")),
      };
    });

    if (cursorPadVerification.sawLeakedTouchEvent) {
      throw new Error(
        `Cursor pad movement leaked touch events into the ScummVM canvas: ${JSON.stringify(cursorPadVerification.events)}`
      );
    }

    if (cursorPadVerification.moveEvents.length < 2) {
      throw new Error(
        `Cursor pad movement did not synthesize enough cursor movement events: ${JSON.stringify(cursorPadVerification.events)}`
      );
    }

    await page.mouse.up();
    await page.waitForTimeout(100);

    const moveCountAfterRelease = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return events.filter((event) => event.type === "mousemove" || event.type === "pointermove").length;
    });

    await page.waitForTimeout(250);

    const moveCountAfterSettling = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return events.filter((event) => event.type === "mousemove" || event.type === "pointermove").length;
    });

    if (moveCountAfterSettling !== moveCountAfterRelease) {
      throw new Error("Cursor pad release did not stop cursor movement promptly.");
    }

    await frame.locator("#canvas").evaluate(() => {
      window.__touchClickVerificationEvents = [];
    });

    await frame.locator("#canvas").tap({ position: { x: 160, y: 120 }, force: true });
    await page.waitForTimeout(250);

    const singleTapVerification = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return {
        events,
        sawLeakedTouchEvent: events.some((event) => event.type.startsWith("touch")),
        moveEvents: events.filter((event) => event.type === "mousemove" || event.type === "pointermove"),
        sawLeftMouseDown: events.some((event) => event.type === "mousedown" && event.button === 0),
        sawLeftMouseUp: events.some((event) => event.type === "mouseup" && event.button === 0),
        sawClick: events.some((event) => event.type === "click" && event.button === 0),
      };
    });

    if (singleTapVerification.sawLeakedTouchEvent) {
      throw new Error(
        `Native touch events leaked past the scummweb mobile shim on single tap: ${JSON.stringify(singleTapVerification.events)}`
      );
    }

    if (singleTapVerification.moveEvents.length < 1) {
      throw new Error(
        `Single canvas tap did not place the cursor: ${JSON.stringify(singleTapVerification.events)}`
      );
    }

    if (
      singleTapVerification.sawLeftMouseDown ||
      singleTapVerification.sawLeftMouseUp ||
      singleTapVerification.sawClick
    ) {
      throw new Error(
        `Single canvas tap triggered click events instead of placement only: ${JSON.stringify(singleTapVerification.events)}`
      );
    }

    await frame.locator("#canvas").evaluate(() => {
      window.__touchClickVerificationEvents = [];
    });

    await frame.locator("#canvas").tap({ position: { x: 220, y: 150 }, force: true });
    await page.waitForTimeout(120);
    await frame.locator("#canvas").tap({ position: { x: 224, y: 154 }, force: true });
    await page.waitForTimeout(250);

    const doubleTapVerification = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return {
        events,
        sawLeakedTouchEvent: events.some((event) => event.type.startsWith("touch")),
        sawLeftMouseDown: events.some((event) => event.type === "mousedown" && event.button === 0),
        sawLeftMouseUp: events.some((event) => event.type === "mouseup" && event.button === 0),
        sawClick: events.some((event) => event.type === "click" && event.button === 0),
      };
    });

    if (doubleTapVerification.sawLeakedTouchEvent) {
      throw new Error(
        `Native touch events leaked past the scummweb mobile shim on double tap: ${JSON.stringify(doubleTapVerification.events)}`
      );
    }

    if (!doubleTapVerification.sawLeftMouseDown || !doubleTapVerification.sawLeftMouseUp || !doubleTapVerification.sawClick) {
      throw new Error(
        `Double tap did not synthesize the expected primary-click events: ${JSON.stringify(doubleTapVerification.events)}`
      );
    }

    await frame.locator("#canvas").evaluate(() => {
      window.__touchClickVerificationEvents = [];
    });

    await rightTouchClickButton.tap();
    await page.waitForTimeout(250);

    const rightClickVerification = await frame.locator("#canvas").evaluate(() => {
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

    if (rightClickVerification.sawLeakedTouchEvent) {
      throw new Error(
        `Right click button leaked touch events into the canvas: ${JSON.stringify(rightClickVerification.events)}`
      );
    }

    if (
      !rightClickVerification.sawRightMouseDown ||
      !rightClickVerification.sawRightMouseUp ||
      !rightClickVerification.sawContextMenu
    ) {
      throw new Error(
        `Right click button did not synthesize the expected secondary-click events: ${JSON.stringify(
          rightClickVerification.events
        )}`
      );
    }

    await frame.locator("#canvas").evaluate(() => {
      window.__touchClickVerificationEvents = [];
    });

    await leftTouchClickButton.tap();
    await page.waitForTimeout(250);

    const leftClickVerification = await frame.locator("#canvas").evaluate(() => {
      const events = Array.isArray(window.__touchClickVerificationEvents)
        ? window.__touchClickVerificationEvents
        : [];

      return {
        events,
        sawLeakedTouchEvent: events.some((event) => event.type.startsWith("touch")),
        sawLeftMouseDown: events.some((event) => event.type === "mousedown" && event.button === 0),
        sawLeftMouseUp: events.some((event) => event.type === "mouseup" && event.button === 0),
        sawClick: events.some((event) => event.type === "click" && event.button === 0),
      };
    });

    if (leftClickVerification.sawLeakedTouchEvent) {
      throw new Error(
        `Left click button leaked touch events into the canvas: ${JSON.stringify(leftClickVerification.events)}`
      );
    }

    if (!leftClickVerification.sawLeftMouseDown || !leftClickVerification.sawLeftMouseUp || !leftClickVerification.sawClick) {
      throw new Error(
        `Left click button did not synthesize the expected primary-click events: ${JSON.stringify(
          leftClickVerification.events
        )}`
      );
    }

    if (normalizeUrl(page.url()) !== normalizeUrl(routeUrl)) {
      throw new Error(`Mobile touch controls redirected unexpectedly from ${routeUrl} to ${page.url()}`);
    }

    await page.close();
  } finally {
    await mobileContext.close();
  }
}

async function verifyTouchControlsHiddenDuringMobileOverlay(browser, baseUrl, game) {
  const portraitContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
    screen: { width: 430, height: 932 },
    hasTouch: true,
    isMobile: true,
  });

  try {
    const { frame, page } = await verifyTarget(portraitContext, baseUrl, game, { waitForLaunch: false });

    await waitForGameStartup(page, frame, game);
    await verifyLaunchOverlayAfterStartup(page, game);

    const mobileOverlay = page.locator(".game-route-mobile-overlay");
    const touchButtons = page.locator(".game-route-touch-click-buttons");
    const touchCursorPad = page.locator(".game-route-touch-cursor-pad");
    const touchJoystick = page.locator(".game-route-touch-joystick");

    await mobileOverlay.waitFor({ state: "visible", timeout: 15000 });

    if ((await touchButtons.count()) !== 0) {
      throw new Error(`Touch click buttons rendered while the mobile overlay was visible for ${game.target}.`);
    }

    if ((await touchCursorPad.count()) !== 0) {
      throw new Error(`Touch cursor pad rendered while the mobile overlay was visible for ${game.target}.`);
    }

    if ((await touchJoystick.count()) !== 0) {
      throw new Error(`Touch joystick rendered while the mobile overlay was visible for ${game.target}.`);
    }

    await page.close();
  } finally {
    await portraitContext.close();
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
  await verifyTouchCursorPadHiddenOnDesktop(page, game);
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
  saveSlotGame || library.games.find((game) => game.skipIntro) || library.games[0]
);
await verifyTouchControlsHiddenDuringMobileOverlay(
  browser,
  url,
  saveSlotGame || library.games.find((game) => game.skipIntro) || library.games[0]
);

fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
await screenshotPage.screenshot({ path: screenshotPath, fullPage: true });

await browser.close();

console.log("Verified launcher routes and wrote screenshot to", screenshotPath);
