import { chromium } from 'playwright-core';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { FrameHistory } from './history.js';
import { ACTION_TIMEOUT_MS, nativeActions, SerialQueue, validateSequence } from './actions.js';
import { SpectatorViewer } from './viewer.js';
import { installHealthObserver, readShellState, bounded } from './health.js';
import { fixedGameCrop } from './display.js';
import { shortId } from './ids.js';
import { claimDataDir } from './instances.js';
import { readLibrary, validateZipPaths, importZipFiles, saveLibrary, launchReattachedGame } from './library.js';
import { enableEvaluation, readEvaluation, RunEvaluation } from './evaluation.js';
import { loadProgressProvider, readStoryProgress } from './progress.js';
import { readGameTelemetry, telemetryReport } from './telemetry.js';
import { installAudioControl } from './audio.js';

export const games = [
  ['beneath-a-steel-sky', 'sky', true],
  ['broken-sword-2-5-the-return-of-the-templars', 'sword25', false],
  ['drascula-the-vampire-strikes-back', 'drascula', true],
  ['dreamweb', 'dreamweb-cd', true],
  ['flight-of-the-amazon-queen', 'queen', true],
  ['lure-of-the-temptress', 'lure', true],
  ['nippon-safes-inc', 'nippon-amiga', false],
  ['the-secret-of-monkey-island-demo', 'monkey-demo', false],
].map(([slug, target, skipIntro]) => ({ slug, target, skipIntro }));

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

function unsupportedNativeControl(control, reason) {
  const error = new Error(`Native control "${control}" is unavailable in this run (${reason})`);
  error.toolDetails = { code: 'NATIVE_CONTROL_UNSUPPORTED', control, reason };
  error.nativeFailure = true;
  return error;
}

export function repositoryRevision(root = projectRoot) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const revision = { repository: 'scummweb', recorded_at: new Date().toISOString(),
    source: 'server_initialization', commit_id: null, branch: null, dirty: null };
  try {
    revision.commit_id = git('rev-parse', 'HEAD');
    revision.branch = git('branch', '--show-current') || null;
    revision.dirty = Boolean(git('status', '--porcelain', '--untracked-files=normal'));
  } catch { /* Non-Git installations retain explicit unknown revision fields. */ }
  return revision;
}

export class GameRuntime {
  constructor(options = {}) {
    this.sourceRevision = repositoryRevision();
    this.baseUrl = new URL(options.baseUrl || 'https://scummweb.tsilva.eu');
    if (!['http:', 'https:'].includes(this.baseUrl.protocol) || this.baseUrl.username || this.baseUrl.password) {
      throw new Error('Base URL must be HTTP(S), without credentials');
    }
    this.dimensions = { width: options.width ?? 960, height: options.height ?? 720 };
    for (const value of Object.values(this.dimensions)) {
      if (!Number.isInteger(value) || value < 320 || value > 1920) throw new Error('Dimensions must be integers between 320 and 1920');
    }
    this.fps = options.fps ?? 10;
    if (!Number.isFinite(this.fps) || this.fps < 1 || this.fps > 15) throw new Error('Capture FPS must be between 1 and 15');
    const seconds = options.bufferSeconds ?? 60;
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) throw new Error('Buffer duration must be between 1 and 300 seconds');
    if (options.instance !== undefined && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(options.instance)) {
      throw new Error('Instance must be 1–64 lowercase letters, digits, hyphens or underscores, starting with a letter or digit');
    }
    if (options.instance !== undefined && options.dataDir !== undefined) {
      throw new Error('Choose either --instance or --data-dir, not both');
    }
    this.instanceId = options.instance ?? `auto-${randomUUID()}`;
    this.instanceLabel = options.instance ?? this.instanceId.slice(0, 13);
    this.dataDir = path.resolve(options.dataDir || path.join(projectRoot, '.runs', 'agent-backbone', 'instances', this.instanceId));
    this.history = new FrameHistory({ seconds, maxFrames: Math.ceil(seconds * this.fps) + 100 });
    this.queue = new SerialQueue();
    this.phase = 'idle';
    this.actions = [];
    this.actionSequences = 0;
    this.soundEnabled = false;
    this.requests = new Map();
    this.usedRequestIds = new Set();
    this.captureFailures = 0;
    this.pendingRequests = new Map();
    this.viewer = new SpectatorViewer(this);
    this.viewerMode = options.viewer ?? true;
    this.launchTimeoutMs = options.launchTimeoutMs ?? 120000;
    this.archiveLaunchTimeoutMs = options.archiveLaunchTimeoutMs ?? 900000;
    this.closing = false;
    this.shutdownSignal = new AbortController();
    this.evaluation = options.evaluation;
    this.telemetryEnabled = Boolean(options.telemetry);
    this.defaultRunId = options.runId?.toLowerCase();
    this.legacySkySlot = options.legacySkySlot;
    if (this.legacySkySlot !== undefined && !this.defaultRunId) throw new Error('Legacy Sky save import requires --run-id');
  }

  status() {
    const frame = this.phase === 'ready' ? this.history.latest() : null;
    const available = this.phase === 'ready' && Boolean(this.agentControls);
    const nativeControls = available ? {
      available, actions: this.agentControls.actions, tickSource: this.agentControls.tickSource,
    } : {
      available, actions: [], reason: this.phase === 'ready' ? this.nativeControlReason ?? 'awaiting_probe' : 'game_not_ready',
    };
    return { phase: this.phase, sessionId: this.sessionId, runId: this.runId, game: this.game, url: this.gameUrl,
      sourceRevision: this.sourceRevision,
      instanceId: this.instanceId, instanceLabel: this.instanceLabel, serverPid: process.pid, dataDir: this.dataDir,
      dimensions: frame ? { width: frame.width, height: frame.height } : this.dimensions,
      viewportDimensions: this.dimensions, coordinateSpace: 'CSS pixels relative to the screenshot top-left',
      bootPhase: this.bootPhase, readyReason: this.readyReason, message: this.message,
      loadingText: this.loadingText, lastNetworkError: this.lastNetworkError,
      runtimeHealth: this.runtimeHealth,
      actionSequences: this.actionSequences,
      soundEnabled: this.soundEnabled,
      pendingRequests: [...this.pendingRequests.values()].slice(-5),
      connected: Boolean(this.context?.browser()?.isConnected() && this.page && !this.page.isClosed()),
      captureFpsRequested: this.fps, captureFailures: this.captureFailures,
      lastCaptureError: this.lastCaptureError, history: this.history.status(),
      viewerUrl: this.viewer.url, viewerOpen: this.viewer.isOpen, viewerError: this.viewerError,
      libraryImport: this.libraryImport && { state: this.libraryImport.state, job_id: this.libraryImport.job_id,
        file_count: this.libraryImport.file_count, summary: this.libraryImport.summary, error: this.libraryImport.error },
      nativeControls, ...(available && { agentControls: this.agentControls }),
      recentActions: this.actions.slice(-8), capabilities: ['click', 'move', 'key', 'drag', 'wait', 'screenshot', 'sequences', 'frame-history', 'spectator',
        ...nativeControls.actions] };
  }

  get spectatorProgress() {
    const evaluation = this.sessionEvaluation;
    if (this.phase !== 'ready' || evaluation?.progress?.state !== 'tracked' || evaluation.result?.success === false) return;
    return { percent: evaluation.progress.percent, nextMilestone: evaluation.nextMilestone };
  }

  async log(type, payload = {}) {
    if (this.logPath) await appendFile(this.logPath, JSON.stringify({ timestamp: new Date().toISOString(), type,
      sessionId: this.sessionId, ...payload }) + '\n', { mode: 0o600 });
  }

  async listGames() {
    const local = (await readLibrary(this.dataDir)).games;
    return [...games.filter(game => !local.some(item => item.slug === game.slug)), ...local]
      .map(game => fixedGameCrop(game.slug, this.dimensions) ? game : { ...game, launchable: false });
  }

  async library({ operation = 'status', paths } = {}) {
    if (operation === 'status') return this.libraryImport ?? { state: 'idle' };
    return this.queue.run(async () => {
      if (this.closing) throw new Error('Runtime is shutting down');
      if (['loading', 'ready'].includes(this.phase)) throw new Error('Close the active game before importing ZIPs');
      if (this.libraryImport?.state === 'importing') throw new Error('A library import is already running');
      const files = await validateZipPaths(paths);
      const previous = await readLibrary(this.dataDir);
      const job = { state: 'importing', job_id: randomUUID(), file_count: files.length,
        started_at: new Date().toISOString() };
      this.libraryImport = job;
      this.libraryTask = (async () => {
        await this.ensureContext(() => 30000);
        if (this.closing) throw new Error('Runtime is shutting down');
        if (!this.libraryPage || this.libraryPage.isClosed()) {
          this.libraryPage = await this.context.newPage();
          const response = await this.libraryPage.goto(new URL('/', this.baseUrl).href,
            { waitUntil: 'domcontentloaded', timeout: 30000 });
          if (response && !response.ok()) throw new Error(`Library route returned HTTP ${response.status()}`);
          // File objects are tab-local. Reattach earlier files after a restart.
          if (previous.paths.length) await importZipFiles(this.libraryPage, await validateZipPaths(previous.paths));
        }
        const result = await importZipFiles(this.libraryPage, files);
        await saveLibrary(this.dataDir, previous, files, result);
        Object.assign(job, { state: 'completed', finished_at: new Date().toISOString(), ...result });
      })().catch(error => {
        Object.assign(job, { state: 'failed', error: error.message, finished_at: new Date().toISOString() });
      });
      return job;
    });
  }

  async start({ game = 'flight-of-the-amazon-queen', mode = 'skip_intro', restart = false, run_id: requestedRunId } = {}) {
    return this.queue.run(async () => {
      const runId = requestedRunId?.toLowerCase();
      if (this.legacySkySlot !== undefined && (game !== 'beneath-a-steel-sky' ||
        mode !== 'continue' || (runId && runId !== this.defaultRunId))) {
        throw new Error('Legacy Sky save import requires Continue for Beneath a Steel Sky in the configured run');
      }
      if (this.evaluation?.result) throw new Error('Evaluation has ended; start a new launcher process for another trial');
      if (this.closing) throw new Error('Runtime is shutting down');
      if (this.libraryImport?.state === 'importing') throw new Error('Wait for the library import to finish');
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game)) throw new Error('Game must be a ScummWEB catalog slug');
      const crop = fixedGameCrop(game, this.dimensions);
      if (!crop) {
        const error = new Error(`Define a fixed bounding box in AgentSCUMM before launching "${game}"`);
        error.toolDetails = { code: 'GAME_CROP_REQUIRED', game };
        throw error;
      }
      if (this.game === game && ['loading', 'ready'].includes(this.phase) && !restart) {
        if (runId && runId !== this.runId) throw new Error('A different run is active; close it or request a restart');
        return this.status();
      }
      if (this.phase === 'loading') throw new Error('A game is loading; wait for it or close the session first');
      if (this.page) await this.stopPage();
      this.importedGame = (await readLibrary(this.dataDir)).games.find(item => item.slug === game);
      this.sessionEvaluation = undefined;
      this.launchMode = mode;
      this.sessionId = shortId();
      this.runId = runId ?? this.defaultRunId ?? (mode === 'continue' ? undefined : randomUUID());
      this.saveScope = this.runId && createHash('sha256').update(JSON.stringify([this.runId, game])).digest('hex');
      this.agentControls = undefined;
      this.nativeControlReason = undefined;
      this.game = game;
      this.fixedCrop = crop;
      this.phase = 'loading';
      this.bootPhase = 'starting-browser';
      this.message = null;
      this.readyReason = null;
      this.history.clear();
      this.actions = [];
      this.actionSequences = 0;
      this.soundEnabled = false;
      this.requests.clear();
      this.usedRequestIds.clear();
      this.captureFailures = 0;
      this.lastCaptureError = null;
      this.pendingRequests.clear(); this.lastNetworkError = null; this.loadingText = null;
      this.runtimeHealth = null; this.healthTask = null; this.lastHealthCheck = null;
      await mkdir(path.join(this.dataDir, 'runs'), { recursive: true, mode: 0o700 });
      this.logPath = path.join(this.dataDir, 'runs', `${this.sessionId}.jsonl`);
      const catalogGame = games.find(entry => entry.slug === game);
      const url = new URL(`/${game}/play`, this.baseUrl);
      if (this.saveScope) url.searchParams.set('agentSaveScope', this.saveScope);
      if (this.legacySkySlot !== undefined) url.searchParams.set('agentLegacySkySlot', this.legacySkySlot);
      if (this.telemetryEnabled) url.searchParams.set('telemetry', '1');
      if (mode === 'skip_intro' && catalogGame?.skipIntro) url.hash = 'seed=0';
      if (mode === 'continue') url.hash = 'continue';
      this.gameUrl = url.toString();
      this.expectedTarget = this.importedGame ? undefined : catalogGame?.target;
      const sessionId = this.sessionId;
      // Launch asynchronously so MCP's tool timeout is independent of game downloads.
      this.bootTask = this.boot(sessionId).catch(async error => {
        if (this.sessionId !== sessionId || this.closing) return;
        this.phase = 'error'; this.message = error.message; this.readyReason = null;
        this.evaluation?.fail(error);
        await this.log('launch-error', { message: error.message }).catch(() => {});
      });
      return this.status();
    });
  }

  async ensureContext(remaining) {
    if (!this.context) {
      this.releaseDataDir ||= await claimDataDir(this.dataDir);
      try {
        this.context = await chromium.launchPersistentContext(path.join(this.dataDir, 'chromium-profile'), {
          headless: true, viewport: this.dimensions, screen: this.dimensions, deviceScaleFactor: 1,
          ignoreDefaultArgs: ['--mute-audio'], args: ['--autoplay-policy=no-user-gesture-required'],
          acceptDownloads: false, timeout: remaining(),
        });
      } catch (error) {
        // Also preserve Chromium's own lock, including profiles opened by
        // servers predating the AgentSCUMM ownership guard.
        if (/ProcessSingleton|SingletonLock|profile.*in use/i.test(error.message)) {
          throw new Error('Browser profile is already in use. Choose a different --instance or --data-dir, or omit both for an isolated instance.');
        }
        throw error;
      }
      this.context.setDefaultTimeout(5000);
      this.context.on('close', () => {
        this.context = null;
        if (!this.closing && !['idle', 'closed'].includes(this.phase)) {
          this.phase = 'disconnected'; this.message = 'Owned Chromium session closed';
        }
      });
    }
  }

  async boot(sessionId) {
    // Only new archive bytes can extend startup, within a hard monotonic limit.
    const started = performance.now();
    const archiveDeadline = started + Math.max(this.launchTimeoutMs, this.archiveLaunchTimeoutMs);
    let deadline = started + this.launchTimeoutMs;
    let archiveBytes = 0;
    const remaining = () => {
      const value = deadline - performance.now();
      if (value <= 0) throw new Error(`Game startup timed out at ${this.bootPhase}`);
      return Math.ceil(value);
    };
    const startupProbe = operation => {
      const budget = remaining();
      // The renderer can be busy mounting a downloaded archive.
      const probeBudget = archiveBytes > 0 ? budget : Math.min(3000, budget);
      return bounded(operation, probeBudget, probeBudget === budget
        ? `Game startup timed out at ${this.bootPhase}` : 'Game renderer did not respond during startup');
    };
    const game = this.game;
    let progressProvider, progressError;
    try { progressProvider = await loadProgressProvider(this.baseUrl, game); }
    catch (error) { progressError = error; }
    if (this.sessionId !== sessionId || this.closing) return;
    if (this.evaluation || progressProvider) {
      this.sessionEvaluation = this.evaluation ?? new RunEvaluation();
      this.sessionEvaluation.beginSession(progressProvider);
    }
    if (progressProvider?.telemetry === 'snapshot') {
      const url = new URL(this.gameUrl);
      url.searchParams.set('telemetry', '1');
      this.gameUrl = url.href;
    }
    await this.log('launch', { game, mode: this.launchMode, runId: this.runId, url: this.gameUrl,
      dimensions: this.dimensions, instanceId: this.instanceId, dataDir: this.dataDir,
      sourceRevision: this.sourceRevision });
    if (progressError) await this.log('progress-error', { message: progressError.message });
    if (this.sessionId !== sessionId || this.closing) return;
    await this.ensureContext(remaining);
    if (this.sessionId !== sessionId || this.closing) return;
    for (const page of this.context.pages()) {
      if (page !== this.libraryPage) await page.close();
    }
    this.page = await this.context.newPage();
    const page = this.page;
    await page.exposeBinding('__agentscummGetSoundEnabled', () => this.soundEnabled);
    await page.addInitScript(installAudioControl);
    await page.addInitScript(installHealthObserver);
    if (this.evaluation || progressProvider?.telemetry === 'events') {
      await page.addInitScript(enableEvaluation);
    }
    page.on('request', request => {
      const url = new URL(request.url());
      if (['http:', 'https:'].includes(url.protocol)) this.pendingRequests.set(request, { path: url.pathname, type: request.resourceType() });
    });
    page.on('requestfinished', request => this.pendingRequests.delete(request));
    page.on('requestfailed', request => {
      this.pendingRequests.delete(request);
      this.lastNetworkError = { path: new URL(request.url()).pathname, error: request.failure()?.errorText };
    });
    page.on('crash', () => { if (this.page === page) { this.phase = 'error'; this.message = 'Game renderer crashed'; } });
    page.on('close', () => { if (this.page === page && !this.closing && this.phase !== 'closed') {
      this.phase = 'disconnected'; this.message = 'Game page closed';
    } });
    this.bootPhase = 'navigating';
    await this.viewer.start();
    if (this.viewerMode) {
      try { await this.viewer.open(); } catch (error) { this.viewerError = error.message; }
    }
    const response = await page.goto(this.gameUrl, { waitUntil: 'domcontentloaded', timeout: remaining() });
    if (response && !response.ok()) throw new Error(`Game route returned HTTP ${response.status()}`);
    // ScummWEB's web-player controls are not part of the game or MCP input surface.
    await page.addStyleTag({ content: '.game-route-controls,.game-route-bottom-actions,.game-route-touch-cursor-pad-shell{display:none!important}' });
    const failedOverlay = page.locator('[data-launch-overlay-state="error"] [data-launch-status]');
    const archiveProgress = page.locator('[data-launch-overlay-state="visible"][data-launch-archive-bytes]');
    let renderedSamples = 0, startupToken, filesReattached = false;
    while (performance.now() < deadline && this.sessionId === sessionId && !this.closing) {
      if (this.phase === 'disconnected' || this.phase === 'error') throw new Error(this.message);
      if (await failedOverlay.isVisible()) {
        throw new Error((await failedOverlay.textContent({ timeout: remaining() }))?.trim() || 'Game startup failed');
      }
      const loadedBytes = await startupProbe(archiveProgress.evaluateAll(elements =>
        Number(elements[0]?.getAttribute('data-launch-archive-bytes'))));
      if (Number.isSafeInteger(loadedBytes) && loadedBytes > archiveBytes) {
        archiveBytes = loadedBytes;
        deadline = Math.min(archiveDeadline, performance.now() + this.launchTimeoutMs);
      }
      const shell = page.frames().find(frame => frame !== page.mainFrame() && /\/scummvm\.html(?:[?#]|$)/.test(frame.url()));
      // All games start at their own route. An imported source without a
      // persistent file handle renders ScummWEB's reconnect/import UI there.
      if (!shell && !filesReattached && await page.locator('.library-add-card').isVisible().catch(() => false)) {
        const saved = await readLibrary(this.dataDir);
        if (!saved.paths.length) throw new Error('This game requires a local ZIP; import it with the library tool first');
        this.bootPhase = 'reconnecting-game-files';
        await importZipFiles(page, await validateZipPaths(saved.paths), remaining());
        filesReattached = true;
        this.bootPhase = 'starting-imported-game';
        await launchReattachedGame(page, this.launchMode, remaining());
      }
      if (shell) {
        if (this.shell !== shell) {
          this.shell = shell;
          renderedSamples = 0;
          // A frame URL can be visible before its HTML/head arrives. Styling
          // that initial document throws instead of waiting for game startup.
          this.bootPhase = 'loading-game-document';
          await shell.waitForLoadState('domcontentloaded', { timeout: remaining() });
          await shell.addStyleTag({ content: '#canvas{outline:none!important;box-shadow:none!important}#scummvm-cursor-grab-hint{display:none!important}' });
        }
        const state = await startupProbe(shell.evaluate(readShellState));
        if (state) {
          if (startupToken !== state.token) { renderedSamples = 0; startupToken = state.token; }
          this.bootPhase = state.ready?.state || 'loading-runtime';
          this.loadingText = state.status;
          if (state.failure || state.error || state.seed?.state === 'error') throw new Error(state.failure || state.seed?.message || state.status || 'Game startup failed');
          const seeded = new URL(this.gameUrl).hash === '#seed=0';
          if (state.ready?.state === 'ready' && (!this.expectedTarget || state.ready.target === this.expectedTarget) &&
            (!seeded || state.seed?.state === 'ready') && state.canvas && !state.loading) {
            if (state.ready.reason === 'rendered-frame-timeout') throw new Error('Runtime started but a rendered game frame was not confirmed');
            this.canvas = shell.locator('#canvas');
            const overlay = page.locator('[data-launch-overlay-state="visible"]');
            const overlayVisible = await overlay.isVisible().catch(() => false);
            const frame = await this.capture('startup-check');
            const bounds = await this.canvas.boundingBox();
            const rendered = !overlayVisible && bounds && await startupProbe(this.hasRenderedContent(frame, bounds));
            renderedSamples = rendered ? renderedSamples + 1 : 0;
            if (renderedSamples >= 2) {
              await this.canvas.focus();
              this.documentToken = state.token;
              this.readyReason = state.ready.reason;
              this.phase = 'ready';
              await this.checkHealth();
              if (this.phase !== 'ready') throw new Error(this.message);
              await this.probeNativeControls();
              remaining();
              await this.capture('launch-ready');
              this.scheduleCapture(sessionId);
              if (this.sessionEvaluation) this.scheduleEvaluation(sessionId);
              await this.log('ready', { reason: this.readyReason, firstFrame: this.history.latest()?.id });
              return;
            }
          } else renderedSamples = 0;
        }
      }
      await sleep(150);
    }
    if (!this.closing && this.sessionId === sessionId) throw new Error(`Game startup timed out at ${this.bootPhase}`);
  }

  async hasRenderedContent(frame, bounds) {
    return this.page.evaluate(async ({ encoded, bounds }) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${encoded}`;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = 32; sample.height = 32;
      const context = sample.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, 32, 32);
      const pixels = context.getImageData(0, 0, 32, 32).data;
      let visible = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 36 && ++visible >= 48) return true;
      }
      return false;
    }, { encoded: frame.data.toString('base64'), bounds });
  }

  scheduleCapture(sessionId) {
    const tick = async () => {
      if (this.sessionId !== sessionId || this.closing || this.phase !== 'ready' || !this.page || this.page.isClosed()) return;
      const started = Date.now();
      try {
        if (this.lastHealthCheck === null || performance.now() - this.lastHealthCheck >= 1000) await this.checkHealth();
        if (this.phase !== 'ready') return;
        await this.capture('buffer'); this.lastCaptureError = null;
      }
      catch (error) { this.captureFailures++; this.lastCaptureError = error.message; }
      if (this.sessionId === sessionId && !this.closing) this.captureTimer = setTimeout(tick, Math.max(10, 1000 / this.fps - (Date.now() - started)));
    };
    this.captureTimer = setTimeout(tick, 10);
  }

  async capture(reason = 'observe') {
    // Tool observations must start AFTER their request/input, never reuse an older in-flight frame.
    while (this.captureTask) {
      if (reason === 'buffer') return this.captureTask;
      await this.captureTask.catch(() => {});
    }
    this.captureTask = (async () => {
      if (!this.page || this.page.isClosed()) throw new Error('No connected game page');
      const sessionId = this.sessionId;
      const phase = this.phase;
      const clip = phase === 'ready' ? this.fixedCrop : undefined;
      const data = await this.page.screenshot({ type: 'jpeg', quality: 90, scale: 'css', timeout: 3000,
        ...(clip ? { clip } : {}) });
      if (sessionId !== this.sessionId) throw new Error('Session changed during capture');
      const metadata = { sessionId, game: this.game, phase, reason,
        width: clip?.width ?? this.dimensions.width, height: clip?.height ?? this.dimensions.height,
        displayBounds: clip ? { x: 0, y: 0, width: clip.width, height: clip.height } : null,
        captureBounds: clip ?? null, actionId: this.currentActionId || null,
        step: this.currentStep ?? null };
      if (phase === 'ready' && this.phase === 'ready') return this.history.add(data, metadata);
      // Startup checks and explicit loading/error observations never enter the rolling buffer.
      return { ...metadata, id: shortId(), timestamp: new Date().toISOString(),
        monotonicMs: performance.now(), mimeType: 'image/jpeg', data };
    })();
    try { return await this.captureTask; } finally { this.captureTask = null; }
  }

  async waitReady(timeoutMs = 25000) {
    const sessionId = this.sessionId;
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline && this.phase === 'loading' && this.sessionId === sessionId) await sleep(100);
    return this.inspectStatus();
  }

  async inspectStatus() {
    if (this.phase === 'ready') {
      await this.checkHealth();
      if (!this.currentActionId) await this.probeNativeControls();
    }
    return this.status();
  }

  async probeNativeControls() {
    if (this.phase !== 'ready' || this.currentActionId) return;
    if (!this.saveScope) {
      this.nativeControlReason = 'unscoped_run';
      return;
    }
    const { shell, sessionId, saveScope } = this;
    let controls, actions, reason;
    try {
      controls = await bounded(shell.evaluate(() => globalThis.scummwebAgentControls?.status()),
        1000, 'Native control capability probe timed out');
      if (!controls) reason = 'runtime_bridge_missing';
      else if (controls.version !== 1 || controls.saveScope !== saveScope) reason = 'runtime_bridge_incompatible';
      else {
        // Older native bridges use a positive manual save limit to signal readiness.
        actions = Array.isArray(controls.actions)
          ? [...nativeActions].filter(action => controls.actions.includes(action))
          : Number.isInteger(controls.maxSaveSlot) && controls.maxSaveSlot > 0 ? [...nativeActions] : [];
        if (!actions.length) reason = 'engine_not_advertised';
      }
    } catch {
      reason = 'bridge_probe_failed';
    }
    if (this.shell !== shell || this.sessionId !== sessionId || this.phase !== 'ready' || this.currentActionId) return;
    if (reason && this.agentControls) return;
    this.nativeControlReason = reason;
    if (!reason) this.agentControls = {
      actions, maxSaveSlot: controls.maxSaveSlot, paused: controls.paused, lastTick: controls.tick,
      tickSource: controls.tickSource === 'frame' ? 'frame' : 'engine',
      queueInputBeforeResume: controls.queueInputBeforeResume ?? controls.tickSource !== 'frame',
    };
  }

  async checkHealth() {
    if (this.healthTask) return this.healthTask;
    const sessionId = this.sessionId;
    const shell = this.shell;
    if (this.phase !== 'ready' || !shell) return;
    const task = (async () => {
      let state, failure, phase = 'error';
      try {
        state = await bounded(shell.evaluate(readShellState), 3000, 'Game renderer is unresponsive; restart the game to recover');
        if (state.token !== this.documentToken) {
          phase = 'disconnected'; failure = 'Game document changed; launch or reconnect explicitly before issuing input';
        } else failure = state.failure || (state.error ? state.status || 'Game runtime error' : null) ||
          (state.seed?.state === 'error' ? state.seed.message || 'Game checkpoint failed' : null);
      } catch (error) { failure = error.message; }
      if (this.sessionId !== sessionId || this.shell !== shell || this.phase !== 'ready') return;
      this.lastHealthCheck = performance.now();
      this.runtimeHealth = { checkedAt: Date.now(), state: failure ? 'failed' : 'responsive',
        message: failure || null, errors: state?.errors || [] };
      if (failure) {
        this.phase = phase; this.message = failure; this.readyReason = null;
        clearTimeout(this.captureTimer);
        await this.log('runtime-failure', this.runtimeHealth).catch(() => {});
      }
    })();
    this.healthTask = task;
    try { await task; } finally { if (this.healthTask === task) this.healthTask = null; }
  }

  async assertReady(sessionId) {
    if (sessionId !== this.sessionId) throw new Error('Session ID does not match the current game');
    if (this.phase !== 'ready' || !this.page || this.page.isClosed()) throw new Error(`Game is not ready (${this.phase})`);
    await this.checkHealth();
    if (this.phase !== 'ready') throw new Error(this.message || `Game is not ready (${this.phase})`);
    if (this.page.viewportSize()?.width !== this.dimensions.width || this.page.viewportSize()?.height !== this.dimensions.height) {
      this.phase = 'error'; throw new Error('Game viewport dimensions changed');
    }
  }

  requestResult(sessionId, requestId) {
    if (sessionId !== this.sessionId) throw new Error('Session ID does not match the current game');
    return this.requests.get(requestId)?.result ??
      { state: this.usedRequestIds.has(requestId) ? 'expired' : 'unknown' };
  }

  async act({ session_id: sessionId, request_id: requestId, actions: rawActions }, signal) {
    const requestSignal = AbortSignal.any([this.shutdownSignal.signal,
      ...(signal ? [signal] : []), ...(this.evaluation ? [this.evaluation.signal.signal] : [])]);
    return this.queue.run(async () => {
      if (sessionId !== this.sessionId) throw new Error('Session ID does not match the current game');
      const fingerprint = createHash('sha256').update(JSON.stringify(rawActions)).digest('hex');
      const cached = this.requests.get(requestId);
      if (cached) {
        if (cached.fingerprint !== fingerprint) throw new Error('Request ID was already used for different inputs');
        return { ...cached.result, replayed: true };
      }
      if (this.usedRequestIds.has(requestId)) throw new Error('Request result expired; input will not be repeated. Observe before choosing a new action');
      if (this.usedRequestIds.size >= 10000) throw new Error('Session request limit reached; close and relaunch before further input');
      requestSignal.throwIfAborted();
      await this.assertReady(sessionId);
      const box = this.fixedCrop;
      const actions = validateSequence(rawActions, box.width, box.height);
      if (actions.some(action => nativeActions.has(action.type))) {
        await this.probeNativeControls();
        const unsupported = actions.find(action => nativeActions.has(action.type) &&
          !this.agentControls?.actions.includes(action.type));
        if (unsupported) throw unsupportedNativeControl(unsupported.type,
          this.nativeControlReason ?? 'engine_not_advertised');
        await this.assertReady(sessionId);
      }
      for (const action of actions) {
        if ((action.type === 'save' || action.type === 'load') && action.id > this.agentControls.maxSaveSlot) {
          throw new Error(`Save ID exceeds this game's maximum slot (${this.agentControls.maxSaveSlot})`);
        }
      }
      const actionId = shortId();
      const record = { actionId, requestId, state: 'running', completed: 0, total: actions.length,
        startedAt: new Date().toISOString(),
        steps: actions.map(({ type }, index) => ({ index, type, state: 'pending' })) };
      this.actions.push(record);
      this.actionSequences++;
      if (this.actions.length > 100) this.actions.shift();
      this.currentActionId = actionId;
      const result = { action: record, replayed: false, screenshots: [] };
      // Reserve the request before any input: uncertain delivery must never be retried automatically.
      this.requests.set(requestId, { fingerprint, result });
      this.usedRequestIds.add(requestId);
      while (this.requests.size > 100) this.requests.delete(this.requests.keys().next().value);
      const nativeDeadline = performance.now() + 20000;
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error('Action batch exceeded its execution deadline')), ACTION_TIMEOUT_MS);
      const inputSignal = AbortSignal.any([requestSignal, deadline.signal]);
      let deferredResume;
      let step;
      try {
        await this.log('action-start', { ...record, inputs: actions });
        for (const [index, action] of actions.entries()) {
          inputSignal.throwIfAborted();
          await this.assertReady(sessionId);
          inputSignal.throwIfAborted();
          this.currentStep = index;
          step = record.steps[index];
          step.state = 'issuing';
          const next = actions[index + 1];
          if (action.type === 'resume' && (next?.type === 'wait_ticks' ||
            (this.agentControls.paused && this.agentControls.queueInputBeforeResume && next?.type === 'click'))) {
            // Keep the native gate closed until the tick budget or input is queued.
            deferredResume = step;
            step.state = 'deferred';
            continue;
          }
          const bounds = await this.canvas.boundingBox();
          if (!bounds) throw new Error('Game canvas is not visible');
          inputSignal.throwIfAborted();
          if (action.type === 'screenshot') {
            const frame = await this.capture('sequence-screenshot');
            result.screenshots.push(frame);
            step.frameId = frame.id;
            step.state = 'captured';
          } else if (nativeActions.has(action.type)) {
            step.control = await this.executeNative(action, nativeDeadline, inputSignal);
            step.state = 'delivered';
          } else {
            await this.canvas.focus();
            await this.execute(action, box, inputSignal);
            if (deferredResume) {
              deferredResume.control = await this.executeNative({ type: 'resume' }, nativeDeadline, inputSignal);
            }
            step.state = 'delivered';
          }
          if (deferredResume) {
            deferredResume.state = 'delivered';
            await this.log('action-step', { actionId, ...deferredResume });
            record.completed++;
            deferredResume = undefined;
          }
          record.completed++;
          await this.log('action-step', { actionId, ...step });
          if (this.evaluation) await this.pollEvaluation();
          inputSignal.throwIfAborted();
          await this.assertReady(sessionId);
        }
        if (!this.evaluation) void this.pollEvaluation();
        inputSignal.throwIfAborted();
        record.state = 'completed';
      } catch (error) {
        const failure = deadline.signal.aborted ? deadline.signal.reason : error;
        record.state = this.evaluation?.result?.success ? 'stopped' : 'failed';
        record.error = failure.message;
        if (error.toolDetails) Object.assign(record, error.toolDetails);
        if (deadline.signal.aborted) record.code = 'ACTION_TIMEOUT';
        if (deferredResume) deferredResume.state = 'interrupted';
        if (step?.state === 'issuing') {
          if ((inputSignal.aborted && step.type === 'wait') ||
            (record.state === 'stopped' && step.type === 'wait_ticks')) step.state = 'interrupted';
          else if (step.type === 'screenshot') step.state = 'capture-failed';
          else if (error.nativeFailure && nativeActions.has(step.type)) step.state = 'native-failed';
          else step.state = 'delivery-uncertain';
        }
      } finally {
        clearTimeout(timer);
        for (const item of record.steps) if (item.state === 'pending') item.state = 'skipped';
        record.finishedAt = new Date().toISOString();
        this.currentActionId = null; this.currentStep = null;
        await this.log('action-finish', record).catch(() => {});
      }
      return result;
    });
  }

  async executeNative(action, deadline, signal) {
    signal.throwIfAborted();
    const remaining = Math.floor(deadline - performance.now());
    const timeoutMs = action.type === 'wait_ticks' ? remaining : Math.min(10000, remaining);
    if (timeoutMs < 1) throw new Error('Native action batch timed out');
    const result = await bounded(this.shell.evaluate(({ action, saveScope, timeoutMs }) => {
      const controls = globalThis.scummwebAgentControls;
      const status = controls?.status();
      if (status?.version !== 1 || status.saveScope !== saveScope ||
        !(Array.isArray(status.actions) ? status.actions.includes(action.type) : status.maxSaveSlot > 0)) {
        return { unsupported: true };
      }
      return controls.run(action.type, action.id ?? action.ticks, timeoutMs);
    }, { action, saveScope: this.saveScope, timeoutMs }), timeoutMs + 1000, 'ScummWEB native action did not respond');
    if (result.unsupported) {
      this.agentControls = undefined;
      this.nativeControlReason = 'provider_changed';
      throw unsupportedNativeControl(action.type, this.nativeControlReason);
    }
    if (result.error) {
      const error = new Error(result.error);
      error.nativeFailure = true;
      throw error;
    }
    this.agentControls = { ...this.agentControls, paused: result.paused, lastTick: result.tick };
    return result;
  }

  async execute(action, box, signal = this.shutdownSignal.signal) {
    signal.throwIfAborted();
    const page = this.page;
    const move = (x, y, steps = 1) => page.mouse.move(box.x + x, box.y + y, { steps });
    if (action.type === 'move') await move(action.x, action.y);
    if (action.type === 'wait') await sleep(action.ms, undefined, { signal });
    if (action.type === 'click') {
      await move(action.x, action.y);
      signal.throwIfAborted();
      await page.mouse.click(box.x + action.x, box.y + action.y, { button: action.button,
        clickCount: action.count, delay: action.hold_ms });
    }
    if (action.type === 'key') {
      await page.keyboard.down(action.key);
      try { await sleep(action.hold_ms, undefined, { signal }); } finally { await page.keyboard.up(action.key); }
    }
    if (action.type === 'drag') {
      await move(action.from_x, action.from_y);
      signal.throwIfAborted();
      await page.mouse.down({ button: action.button });
      try {
        await sleep(action.hold_ms, undefined, { signal });
        await move(action.x, action.y, action.steps);
        await sleep(action.hold_ms, undefined, { signal });
      } finally { await page.mouse.up({ button: action.button }); }
    }
  }

  async observe() {
    return this.queue.run(async () => {
      if (!this.page || this.page.isClosed()) throw new Error('Launch a game first');
      if (this.phase === 'ready') {
        try { await this.assertReady(this.sessionId); }
        catch (error) { if (this.phase === 'ready') throw error; }
      }
      return this.capture();
    });
  }

  async telemetry({ session_id: sessionId, bank, offset, limit }) {
    if (!this.telemetryEnabled) throw new Error('Launch this server with --telemetry to query game state');
    if (sessionId !== this.sessionId) throw new Error('Session ID does not match the current game');
    if (!bank && (offset !== undefined || limit !== undefined)) throw new Error('offset and limit require a bank');
    const session = { session_id: sessionId, game: this.game };
    const query = { bank, offset, limit };
    if (this.phase === 'loading') return { ...session, ...telemetryReport(undefined, query), state: 'pending' };
    const { shell } = this;
    const isCurrent = () => sessionId === this.sessionId && shell === this.shell && this.phase === 'ready';
    await this.assertReady(sessionId);
    if (!isCurrent()) throw new Error('Session changed during telemetry read');
    const payload = await bounded(shell.evaluate(readGameTelemetry), 2000, 'Game telemetry read timed out');
    if (!isCurrent()) throw new Error('Session changed during telemetry read');
    return { ...session, ...telemetryReport(payload, query) };
  }

  async pollEvaluation() {
    const evaluation = this.sessionEvaluation;
    if (!evaluation || evaluation.result || this.phase !== 'ready') return;
    if (!this.evaluation && !evaluation.progressProvider) return;
    if (this.evaluationRead) return this.evaluationRead;
    const { shell, sessionId } = this;
    const isCurrent = () => this.shell === shell && this.sessionId === sessionId && this.phase === 'ready';
    this.evaluationRead = (async () => {
      try {
        const read = shell.evaluate(readEvaluation, evaluation.progressProvider?.telemetry === 'snapshot');
        // The read drains the engine's queues. During normal play, keep its result
        // even if it arrives late. An explicit trial still needs a bounded read.
        const payload = this.evaluation
          ? await bounded(read, 2000, 'Evaluator could not read engine telemetry')
          : await read;
        if (!isCurrent()) return;
        const hasTelemetry = evaluation.requiresRoomTelemetry ? payload.current
          : payload.gameVariableEvents != null || (!evaluation.gamePredicates.length &&
            (payload.current || payload.identity || payload.progressTelemetry?.snapshot));
        if (!hasTelemetry && performance.now() - this.evaluationReadyAt > 5000) {
          throw new Error('This game runtime does not provide evaluation variables; rebuild with the supported engine hook');
        }
        if (hasTelemetry) {
          const previous = evaluation.progress;
          await evaluation.accept(payload, async input => {
            try {
              const update = shell.evaluate(readStoryProgress, { provider: evaluation.progressProvider, input });
              const result = await bounded(update, 2000, 'Evaluator could not read story progress');
              return isCurrent() ? result : null;
            } catch (error) {
              if (!isCurrent()) return null;
              await this.log('progress-error', { message: error.message }).catch(() => {});
              if (!isCurrent()) return null;
            }
          });
          if (!isCurrent()) return;
          if (evaluation.progress && evaluation.progress !== previous) {
            await this.log('progress', { progress: evaluation.progress });
          }
        }
      } catch (error) {
        if (!isCurrent()) return;
        evaluation.fail(error);
        if (!this.evaluation) await this.log('progress-error', { message: error.message }).catch(() => {});
      }
    })();
    try { await this.evaluationRead; } finally { this.evaluationRead = null; }
  }

  scheduleEvaluation(sessionId) {
    const { sessionEvaluation: evaluation, shell } = this;
    const isActive = () => !this.closing && this.sessionId === sessionId && this.shell === shell &&
      !evaluation.result && Boolean(this.evaluation || evaluation.progressProvider);
    this.evaluationReadyAt = performance.now();
    const tick = async () => {
      if (!isActive()) return;
      if (this.phase !== 'ready') { evaluation.fail(new Error('Game runtime left the ready state')); return; }
      await this.pollEvaluation();
      if (isActive()) {
        this.evaluationTimer = setTimeout(tick, evaluation.intervalMs);
      }
    };
    this.evaluationTimer = setTimeout(tick, 0);
  }

  async setSoundEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw new Error('Sound setting must be a boolean');
    const apply = async () => {
      const previous = this.soundEnabled;
      this.soundEnabled = enabled;
      try {
        await Promise.all((this.page?.frames() ?? []).map(frame => bounded(frame.evaluate(value => {
          globalThis.__agentscummSetSoundEnabled?.(value);
        }, enabled), 2000, 'Game audio did not respond')));
      } catch (error) {
        this.soundEnabled = previous;
        await Promise.allSettled((this.page?.frames() ?? []).map(frame => bounded(frame.evaluate(value => {
          globalThis.__agentscummSetSoundEnabled?.(value);
        }, previous), 2000, 'Game audio rollback did not respond')));
        throw error;
      }
      return this.soundEnabled;
    };
    this.soundTask = (this.soundTask ?? Promise.resolve()).catch(() => {}).then(apply);
    return this.soundTask;
  }

  async stopPage() {
    clearTimeout(this.evaluationTimer);
    clearTimeout(this.captureTimer);
    const page = this.page;
    this.page = null; this.canvas = null; this.shell = null;
    if (page === this.libraryPage) this.libraryPage = null;
    await page?.close();
    await this.evaluationRead;
    await this.captureTask?.catch(() => {});
  }

  async openViewer() {
    return this.queue.run(() => {
      if (this.closing) throw new Error('Runtime is shutting down');
      return this.viewer.open();
    });
  }

  async closeViewer(sessionId) {
    return this.queue.run(async () => {
      if (sessionId !== this.sessionId) throw new Error('Session ID does not match the current game');
      if (this.phase === 'loading') throw new Error('Wait for game startup before closing the spectator');
      await this.viewer.closeWindow();
      return this.status();
    });
  }

  async closeGame() {
    return this.queue.run(async () => {
      this.phase = 'closed';
      this.sessionId = null;
      this.agentControls = undefined;
      await this.stopPage();
      await this.bootTask;
      this.history.clear();
      this.requests.clear();
      this.usedRequestIds.clear();
      await this.log('close');
      return this.status();
    });
  }

  async close() {
    this.closing = true;
    this.shutdownSignal.abort(new Error('Game runtime is shutting down'));
    clearTimeout(this.captureTimer);
    clearTimeout(this.evaluationTimer);
    await this.stopPage();
    await this.libraryPage?.close();
    this.libraryPage = null;
    await this.bootTask;
    await this.queue.tail;
    await this.libraryTask;
    await this.context?.close();
    this.context = null;
    await this.viewer.close();
    await this.releaseDataDir?.();
    this.releaseDataDir = null;
    this.phase = 'closed';
  }
}
