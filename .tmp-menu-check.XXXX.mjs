import fs from 'node:fs';
import { chromium } from 'playwright-core';

const chromeCandidates = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) {
  throw new Error('No local Chrome/Chromium installation found for Playwright');
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle' });
const routeHref = await page.locator('a[href^="/"]').first().getAttribute('href');
if (!routeHref) {
  throw new Error('No game route link found on home page');
}
await page.goto(new URL(routeHref, 'http://127.0.0.1:3001/').toString(), { waitUntil: 'networkidle' });
const frameElement = page.locator('.game-route-frame');
await frameElement.waitFor({ state: 'visible', timeout: 15000 });
const frame = await frameElement.elementHandle();
const contentFrame = await frame.contentFrame();
if (!contentFrame) {
  throw new Error('Game iframe not available');
}
await contentFrame.locator('#canvas').waitFor({ state: 'visible', timeout: 15000 });

const boxes = await page.evaluate(() => {
  const selectors = {
    exit: '.game-route-control-button.is-exit',
    menu: '.game-route-control-button.is-menu',
    fullscreen: '.game-route-control-button.is-fullscreen',
  };
  return Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return [key, null];
    }
    const rect = element.getBoundingClientRect();
    return [key, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }];
  }));
});
console.log('boxes', JSON.stringify(boxes));

await contentFrame.locator('#canvas').evaluate((canvas) => {
  window.__menuButtonVerificationEvents = [];
  const record = (label) => (event) => {
    window.__menuButtonVerificationEvents.push({
      label,
      key: event.key,
      code: event.code,
      keyCode: event.keyCode,
      ctrlKey: event.ctrlKey,
      timestamp: performance.now(),
    });
  };
  for (const [label, target] of [['window', window], ['document', document], ['body', document.body], ['canvas', canvas]]) {
    target?.addEventListener?.('keydown', record(label), true);
  }
});

await page.locator('.game-route-control-button.is-menu').click();
await page.waitForTimeout(500);
const events = await contentFrame.locator('#canvas').evaluate(() => window.__menuButtonVerificationEvents || []);
console.log('events', JSON.stringify(events));
await page.screenshot({ path: '/tmp/scummweb-menu-after.png' });
await browser.close();
