// Installed before the game scripts, in every document. These are mechanical
// runtime failures, not guesses based on an unchanged adventure-game scene.
export function installHealthObserver() {
  const health = globalThis.__agentscummHealth = { failure: null, errors: [] };
  const record = event => {
    const message = String(event.message || event.reason?.message || event.reason || 'Script error').slice(0, 500);
    health.errors.push(message);
    if (health.errors.length > 8) health.errors.shift();
    if (event.error instanceof WebAssembly.RuntimeError || event.reason instanceof WebAssembly.RuntimeError) {
      health.failure = 'Game WebAssembly runtime trapped';
    }
  };
  addEventListener('error', record);
  addEventListener('unhandledrejection', record);
  // Context loss does not close the page or invalidate its old ready signal.
  // ScummWEB requires a reload; do not silently discard unsaved game progress.
  addEventListener('webglcontextlost', event => {
    if (event.target?.id === 'canvas') health.failure = 'Game WebGL context lost; restart the game to recover';
  }, true);
}

export function readShellState() {
  const status = document.getElementById('status');
  const canvas = document.getElementById('canvas');
  const style = status && getComputedStyle(status);
  return {
    token: performance.timeOrigin,
    ready: globalThis.__scummwebReadyState,
    seed: globalThis.__scummwebSkipIntroSeedStatus,
    status: status?.textContent?.trim(),
    loading: Boolean(style && style.display !== 'none' && style.visibility !== 'hidden' && status.textContent.trim()),
    error: Boolean(status?.classList.contains('error')),
    canvas: Boolean(canvas?.width && canvas?.height),
    failure: globalThis.__agentscummHealth?.failure || (globalThis.ABORT === true ? 'Game runtime aborted' : null),
    errors: globalThis.__agentscummHealth?.errors || [],
  };
}

export async function bounded(operation, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), Math.max(1, milliseconds));
    })]);
  } finally { clearTimeout(timer); }
}
