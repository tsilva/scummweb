import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
let buildTask;

export function buildMacOSApp() {
  buildTask ||= build().catch(error => { buildTask = null; throw error; });
  return buildTask;
}

async function build() {
  if (process.platform !== 'darwin') throw new Error('The native spectator requires macOS');
  const files = ['macos/Spectator.swift', 'macos/Info.plist', 'macos/AppIcon.png', 'src/macos-app.js'];
  const hash = createHash('sha256').update(process.arch);
  for (const file of files) hash.update(await readFile(path.join(root, file)));
  const cache = path.join(root, '../.runs/agent-backbone', 'macos');
  const destination = path.join(cache, hash.digest('hex').slice(0, 20));
  const app = path.join(destination, 'AgentSCUMM.app');
  try { await access(path.join(app, 'Contents/MacOS/AgentSCUMM')); return app; } catch { /* Build once per source/icon revision. */ }
  await mkdir(cache, { recursive: true });
  const staging = await mkdtemp(path.join(cache, '.build-'));
  const bundle = path.join(staging, 'AgentSCUMM.app');
  const contents = path.join(bundle, 'Contents');
  try {
    await mkdir(path.join(contents, 'MacOS'), { recursive: true });
    await mkdir(path.join(contents, 'Resources'));
    await copyFile(path.join(root, 'macos/Info.plist'), path.join(contents, 'Info.plist'));
    const run = (command, args) => exec(command, args, { timeout: 120000, maxBuffer: 1024 * 1024 });
    await run('/usr/bin/xcrun', ['swiftc', '-O', '-framework', 'AppKit', '-framework', 'WebKit',
      '-module-cache-path', path.join(staging, 'modules'), path.join(root, 'macos/Spectator.swift'),
      '-o', path.join(contents, 'MacOS/AgentSCUMM')]);
    const iconset = path.join(staging, 'AgentSCUMM.iconset');
    await mkdir(iconset);
    // Use dedicated, text-free app artwork at every standard ICNS density.
    for (const size of [16, 32, 128, 256, 512]) {
      for (const scale of [1, 2]) {
        await run('/usr/bin/sips', ['-z', String(size * scale), String(size * scale), path.join(root, 'macos/AppIcon.png'),
          '--out', path.join(iconset, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)]);
      }
    }
    await run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(contents, 'Resources/AgentSCUMM.icns')]);
    await run('/usr/bin/codesign', ['--force', '--sign', '-', bundle]);
    // Publish an immutable bundle so simultaneous servers cannot replace a running app.
    const published = path.join(staging, 'published');
    await mkdir(published);
    await rename(bundle, path.join(published, 'AgentSCUMM.app'));
    try { await rename(published, destination); }
    catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
      await access(path.join(app, 'Contents/MacOS/AgentSCUMM'));
    }
    return app;
  } catch (error) {
    throw new Error(`Cannot build the macOS spectator. Install Xcode Command Line Tools (xcode-select --install). ${error.message}`);
  } finally { await rm(staging, { recursive: true, force: true }); }
}

export class MacOSSpectator {
  get isOpen() { return Boolean(this.child && this.child.exitCode === null && this.child.signalCode === null); }

  async open(url, { width, height }) {
    const bundle = await buildMacOSApp();
    this.child = spawn(path.join(bundle, 'Contents/MacOS/AgentSCUMM'), [url, String(width), String(height)],
      { stdio: ['pipe', 'pipe', 'ignore'] });
    this.exited = new Promise(resolve => { this.child.once('exit', resolve); this.child.once('error', resolve); });
    const lines = createInterface({ input: this.child.stdout });
    this.exited.then(() => lines.close());
    lines.on('line', line => {
      try {
        const event = JSON.parse(line);
        if (event.event === 'geometry') this.windowGeometry = event;
      } catch { /* Ignore non-protocol output from the native app. */ }
    });
    try {
      this.launchInfo = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('macOS spectator startup timed out')), 15000);
        const finish = (error, value) => { clearTimeout(timer); error ? reject(error) : resolve(value); };
        this.child.once('error', error => finish(error));
        this.child.once('exit', () => finish(new Error('macOS spectator exited')));
        lines.on('line', line => {
          let event;
          try { event = JSON.parse(line); } catch { return; }
          if (event.event === 'ready') finish(null, event);
          if (event.event === 'error') finish(new Error(event.message));
        });
      });
    } catch (error) { await this.close(); throw error; }
  }

  async close() {
    if (this.isOpen) this.child.kill('SIGTERM');
    await this.exited;
    this.child = null;
  }
}
