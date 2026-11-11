import { randomUUID } from 'node:crypto';
import { stat, opendir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

const maxImportFiles = 256;
const isGameZip = name => !name.startsWith('.') && /\.zip$/i.test(name);

export async function findGameZips(directory) {
  const root = path.resolve(directory);
  const files = [];
  const directories = [root];
  while (directories.length) {
    const folder = directories.pop();
    for await (const entry of await opendir(folder)) {
      if (entry.name.startsWith('.')) continue;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) directories.push(file);
      if (!entry.isFile() || !isGameZip(entry.name)) continue;
      files.push(file);
      if (files.length > maxImportFiles) throw new Error(`--import-games accepts up to ${maxImportFiles} ZIPs at a time`);
    }
  }
  if (!files.length) throw new Error(`No game ZIPs found in ${root}. Put each game in a ZIP and try again.`);
  return files.sort();
}

// Import through the site's file input: its normal scanner, duplicate matching,
// library storage and error reporting remain authoritative. No ZIP extraction
// or game detection is duplicated here.
export async function validateZipPaths(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.length > maxImportFiles) throw new Error(`Provide 1–${maxImportFiles} ZIP paths`);
  const result = [...new Set(paths.map(file => path.resolve(file)))];
  for (const file of result) {
    if (!isGameZip(path.basename(file))) throw new Error(`Not a game ZIP: ${file}`);
    if (!(await stat(file)).isFile()) throw new Error(`Not a regular file: ${file}`);
  }
  return result;
}

export async function readLibrary(dataDir) {
  try {
    const saved = JSON.parse(await readFile(path.join(dataDir, 'local-library.json'), 'utf8'));
    if (saved.schema_version !== 1 || !Array.isArray(saved.paths) || !Array.isArray(saved.games)) {
      throw new Error('Invalid local library manifest');
    }
    return saved;
  } catch (error) {
    if (error.code === 'ENOENT') return { schema_version: 1, paths: [], games: [] };
    throw error;
  }
}

export async function importZipFiles(page, paths, timeout = 600000) {
  const input = page.locator('input[type="file"][multiple][accept*=".zip"]').first();
  await input.waitFor({ state: 'attached', timeout: 30000 });
  // Hydration/storage loading disables Add a game until importRoots is ready.
  await page.getByRole('button', { name: /^Add a game/ }).waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('.library-add-card');
    return button && !button.disabled;
  }, null, { timeout: 30000 });
  await input.setInputFiles(paths, { timeout: 30000 });
  const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
  await confirm.waitFor({ state: 'visible', timeout });
  const summary = await page.locator('#game-import-summary').innerText();
  const items = await page.locator('.game-import-items li').evaluateAll(rows => rows.map(row => ({
    name: row.querySelector('strong')?.textContent,
    message: row.querySelector('p')?.textContent,
  })));
  await confirm.click();
  await page.locator('#game-import-summary').waitFor({ state: 'hidden', timeout: 5000 });
  const games = await page.locator('#library .poster-entry[data-library-source-ids] a').evaluateAll(cards => cards
    .filter(card => JSON.parse(card.closest('[data-library-source-ids]').dataset.librarySourceIds).length)
    .map(card => ({ title: card.querySelector('.poster-title')?.textContent,
      href: card.getAttribute('href'), target: card.getAttribute('data-game-target') || null })));
  const used = new Set();
  for (const game of games) {
    const pathname = new URL(game.href, page.url()).pathname;
    const base = (pathname === '/' ? game.title : pathname.slice(1)).toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let slug = base, suffix = 2;
    while (used.has(slug)) slug = `${base}-${suffix++}`;
    used.add(slug);
    Object.assign(game, { slug, skipIntro: false, source: 'local_import' });
  }
  return { summary, items, games };
}

// This is only the direct route's file-reconnection UI. Never navigate via
// homepage cards or depend on a game title being part of a button name.
export async function launchReattachedGame(page, mode, timeout) {
  const primary = page.locator('.hero-launch .launch-button:visible').first();
  await primary.waitFor({ state: 'visible', timeout });
  const name = (await primary.innerText()).trim();
  if (!['Play', 'Continue'].includes(name)) throw new Error(`Game source is not ready to launch: ${name}`);
  const fresh = page.locator('.hero-launch .start-fresh-button:visible').first();
  if (mode !== 'continue' && name === 'Continue') {
    await fresh.click({ timeout });
  } else {
    await primary.click({ timeout });
  }
}

export async function saveLibrary(dataDir, previous, paths, result) {
  const saved = { schema_version: 1, imported_at: new Date().toISOString(),
    paths: [...new Set([...previous.paths, ...paths])], games: result.games,
    last_import: { summary: result.summary, items: result.items } };
  const destination = path.join(dataDir, 'local-library.json');
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return saved;
}
