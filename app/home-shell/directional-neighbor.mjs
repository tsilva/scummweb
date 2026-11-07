export function directionalNeighbor(origin, candidates, direction) {
  const horizontal = direction === "ArrowLeft" || direction === "ArrowRight";
  const forward = direction === "ArrowRight" || direction === "ArrowDown";
  const [start, end, crossStart, crossEnd] = horizontal
    ? ["left", "right", "top", "bottom"] : ["top", "bottom", "left", "right"];
  const center = (rect, a, b) => (rect[a] + rect[b]) / 2;
  let best = -1;
  let bestScore = Infinity;
  for (const [index, rect] of candidates.entries()) {
    const gap = forward ? rect[start] - origin[end] : origin[start] - rect[end];
    if (gap < -1) continue;
    const distance = (center(rect, start, end) - center(origin, start, end)) * (forward ? 1 : -1);
    const crossGap = Math.max(rect[crossStart] - origin[crossEnd], origin[crossStart] - rect[crossEnd], 0);
    if (horizontal && crossGap > 0) continue;
    const crossDistance = Math.abs(center(rect, crossStart, crossEnd) - center(origin, crossStart, crossEnd));
    const score = distance + 2 * crossGap + 0.25 * crossDistance;
    if (score < bestScore) {
      best = index;
      bestScore = score;
    }
  }
  return best;
}
