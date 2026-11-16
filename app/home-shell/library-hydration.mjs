import { captureGameDrop } from "../game-import-nodes.mjs";

const pendingDrops = new WeakMap();

// Keep dropped handles alive while the library module is being downloaded.
// Capture them inside the original drop event, before DataTransfer expires.
export function handoverLibraryDrops(importRoots, target = window) {
  const pending = pendingDrops.get(target);
  if (!pending) return;
  pending.stop();
  pendingDrops.delete(target);
  if (pending.roots.length) void importRoots(pending.roots);
}

export function afterHeroPaint(target = window) {
  const document = target.document;
  const hero = document.querySelector(".hero-stage-library .hero-backdrop-image");
  if (!hero) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    let frame;
    const events = ["pointerdown", "keydown", "click", "dragenter"];
    function finish() {
      if (finished) return;
      finished = true;
      for (const type of events) document.removeEventListener(type, finish, true);
      target.clearTimeout(deadline);
      if (frame !== undefined) target.cancelAnimationFrame(frame);
      resolve();
    }
    const roots = [];
    const isFileDrag = (event) => event.dataTransfer?.types.includes("Files");
    function over(event) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      finish();
    }
    function drop(event) {
      if (!isFileDrag(event)) return;
      over(event);
      roots.push(...captureGameDrop(event.dataTransfer));
    }
    function stop() {
      target.removeEventListener("dragover", over);
      target.removeEventListener("drop", drop);
    }
    pendingDrops.set(target, { roots, stop });
    target.addEventListener("dragover", over);
    target.addEventListener("drop", drop);
    for (const type of events) document.addEventListener(type, finish, true);
    // A stalled image must not hold the controls indefinitely.
    const deadline = target.setTimeout(finish, 1000);
    void hero.decode().catch(() => {}).then(() => {
      if (finished) return;
      frame = target.requestAnimationFrame(() => {
        if (!finished) frame = target.requestAnimationFrame(finish);
      });
    });
  });
}
