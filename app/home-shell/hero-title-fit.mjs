// Self-contained so the same fitter can run while the initial HTML is parsed,
// before first paint, and on subsequent client-side title/viewport changes.
export function fitHeroTitle(heading) {
  const text = heading?.firstElementChild;
  if (!text) return;
  const style = getComputedStyle(heading);
  // CSS knows the viewport before hydration. Mobile titles use natural height
  // and must never inherit a desktop fitter's inline font size.
  if (style.getPropertyValue("--hero-title-fit").trim() === "none") {
    text.style.removeProperty("font-size");
    delete heading.__scummwebTitleFit;
    return;
  }
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  // Fonts use display: optional. A completed download does not mean the face
  // replaced the fallback on this visit, so do not resize again on fonts.ready.
  const signature = `${heading.clientWidth}:${heading.clientHeight}:${font}:${style.letterSpacing}:${text.textContent}`;
  if (heading.__scummwebTitleFit === signature) return;
  const maximum = parseFloat(style.fontSize);
  let low = 1;
  let high = maximum;
  text.style.fontSize = `${maximum}px`;
  if (text.scrollHeight <= heading.clientHeight && text.scrollWidth <= heading.clientWidth) {
    heading.__scummwebTitleFit = signature;
    return;
  }
  // Finer precision adds synchronous layouts without a visible size change.
  for (let step = 0; step < 12 && high - low > 0.25; step++) {
    const size = (low + high) / 2;
    text.style.fontSize = `${size}px`;
    if (text.scrollHeight <= heading.clientHeight && text.scrollWidth <= heading.clientWidth) low = size;
    else high = size;
  }
  text.style.fontSize = `${low}px`;
  heading.__scummwebTitleFit = signature;
}

// Observe the initial streamed heading from the document head. This runs before
// the first paint, even when the React bundle is slow or unavailable. Disconnect
// after finding the heading; subsequent navigation is handled by HeroTitle.
export const initialHeroTitleFit = `(() => {
  if (matchMedia('(max-width: 48rem)').matches) return;
  const fit = ${fitHeroTitle.toString()};
  const observer = new MutationObserver(() => {
    const heading = document.querySelector('.hero-copy h1');
    if (!heading?.firstElementChild?.textContent) return;
    fit(heading);
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => observer.disconnect(), { once: true });
})();`;
