// Observe the software renderer, including intentionally black intro frames.
// WebGL draws can be splash/GUI work; use the native game-frame signal there.
export function observeCanvasPresentation(canvas, onPresent, onContext = () => {}) {
  const originalGetContext = canvas.getContext;
  const contexts = new Map();
  let active = true;
  function stop() {
    active = false;
    if (canvas.getContext === getContext) canvas.getContext = originalGetContext;
    for (const [context, { original, wrapper }] of contexts) {
      if (context.putImageData === wrapper) context.putImageData = original;
    }
    contexts.clear();
  }
  function getContext(...args) {
    const context = originalGetContext.apply(this, args);
    const type = args[0];
    const webgl = type === "webgl" || type === "webgl2" || type === "experimental-webgl";
    if (active && context && (type === "2d" || webgl)) onContext(type);
    if (active && context && type === "2d" && !contexts.has(context)) {
      const original = context.putImageData;
      function wrapper(...pixels) {
        const result = original.apply(this, pixels);
        if (onPresent()) stop();
        return result;
      }
      contexts.set(context, { original, wrapper });
      context.putImageData = wrapper;
    }
    return context;
  }
  canvas.getContext = getContext;
  return stop;
}
