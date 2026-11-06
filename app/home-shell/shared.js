export function getGameDialogId(game, { fromBucket = false } = {}) {
  return fromBucket ? `bucket-game-${game.target}` : `game-${game.slug || game.target}`;
}

export function getDialogLinkProps(href) {
  if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("/launcher/notices/")) {
    return {};
  }

  return {
    rel: "noreferrer",
    target: "_blank",
  };
}

export function getHeroImageStyle(position, mobilePosition) {
  if (!position && !mobilePosition) {
    return undefined;
  }

  return {
    ...(position ? { objectPosition: position } : {}),
    ...(mobilePosition ? { "--hero-image-mobile-position": mobilePosition } : {}),
  };
}
