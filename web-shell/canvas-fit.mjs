// Size the actual canvas element, so SDL mouse coordinates match its pixels.
export function installCanvasFit(canvas, Observer) {
  let lastRatio = 0;
  const update = () => {
    // Fullscreen stretching can resize SDL's backing canvas. Preserve the
    // game's last natural ratio until the player leaves fill mode.
    if (canvas.classList.contains("scummweb-fill-screen")) return;
    const ratio = canvas.width / canvas.height;
    if (!Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - lastRatio) < 0.01) return;
    lastRatio = ratio;
    canvas.style.setProperty("--scummweb-canvas-ratio", String(ratio));
  };
  update();
  const observer = new Observer(update);
  observer.observe(canvas, { attributes: true, attributeFilter: ["width", "height"] });
  return () => observer.disconnect();
}
