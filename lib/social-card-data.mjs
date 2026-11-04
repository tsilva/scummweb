// Keep this projection limited to inputs actually displayed by the template.
// Deployment versions and unrelated catalog metadata must not invalidate cards.
export function getSocialCardData(game) {
  const artwork = game.spotlightImage || game.posterImage || game.heroImage || "";
  if (artwork && (!artwork.startsWith("/") || artwork.startsWith("//"))) {
    throw new Error("Social card artwork must be a local asset");
  }
  return {
    title: game.displayTitle || "ScummWEB",
    summary: game.summary || "Play classic adventure games in your browser with ScummWEB.",
    eyebrow: game.eyebrow || "Featured Classic",
    year: game.year || "Archive",
    badge: game.badge || "Playable Now",
    genre: game.genre || "ScummVM Adventure",
    studio: game.studio || "ScummVM Runtime",
    artwork: artwork ? new URL(artwork, "https://scummweb.local").pathname : "",
  };
}
