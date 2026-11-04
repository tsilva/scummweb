// Self-contained so the same fitter can run while the initial HTML is parsed,
// before first paint, and on subsequent client-side title/viewport changes.
export function fitHeroTitle(heading) {
  const text = heading?.firstElementChild;
  if (!text) return;
  const style = getComputedStyle(heading);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const signature = `${heading.clientWidth}:${heading.clientHeight}:${font}:${style.letterSpacing}:${text.textContent}:${document.fonts.check(font, text.textContent)}`;
  if (heading.__scummwebTitleFit === signature) return;
  const maximum = parseFloat(style.fontSize);
  let low = 1;
  let high = maximum;
  text.style.fontSize = `${maximum}px`;
  if (text.scrollHeight <= heading.clientHeight && text.scrollWidth <= heading.clientWidth) {
    heading.__scummwebTitleFit = signature;
    return;
  }
  for (let step = 0; step < 12; step++) {
    const size = (low + high) / 2;
    text.style.fontSize = `${size}px`;
    if (text.scrollHeight <= heading.clientHeight && text.scrollWidth <= heading.clientWidth) low = size;
    else high = size;
  }
  text.style.fontSize = `${low}px`;
  heading.__scummwebTitleFit = signature;
}
