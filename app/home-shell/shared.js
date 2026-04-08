export function getGameDialogId(game) {
  return `game-${game.slug || game.target}`;
}

export function getDialogLinkProps(href) {
  if (!href.startsWith("http://") && !href.startsWith("https://")) {
    return {};
  }

  return {
    rel: "noreferrer",
    target: "_blank",
  };
}

export function getHeroImageStyle(position) {
  if (!position) {
    return undefined;
  }

  return {
    objectPosition: position,
  };
}
