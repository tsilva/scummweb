// Observe a real SDL canvas presentation, including intentionally black intro
// frames. Restore native methods after the first accepted frame.
export function observeCanvasPresentation(canvas, onPresent) {
  const originalGetContext = canvas.getContext;
  const contexts = new Map();
  function stop() {
    if (canvas.getContext === getContext) canvas.getContext = originalGetContext;
    for (const [context, { original, wrapper }] of contexts) {
      if (context.putImageData === wrapper) context.putImageData = original;
    }
    contexts.clear();
  }
  function getContext(...args) {
    const context = originalGetContext.apply(this, args);
    if (args[0] === "2d" && context && !contexts.has(context)) {
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
