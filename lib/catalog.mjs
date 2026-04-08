export function getDisplayTitle(title) {
  return String(title || "").replace(/\s+\([^)]*\)$/, "");
}

export function slugifySegment(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function getUniqueGameSlug(game, usedSlugs) {
  const baseSlug = slugifySegment(getDisplayTitle(game.title || ""));
  const targetSlug = slugifySegment(game.target || "game") || "game";
  const preferredSlug = baseSlug || targetSlug;

  if (!usedSlugs.has(preferredSlug)) {
    usedSlugs.add(preferredSlug);
    return preferredSlug;
  }

  const fallbackBase = `${preferredSlug}-${targetSlug}`.replace(/-{2,}/g, "-");
  let suffix = 2;
  let candidate = fallbackBase;

  while (usedSlugs.has(candidate)) {
    candidate = `${fallbackBase}-${suffix}`;
    suffix += 1;
  }

  usedSlugs.add(candidate);
  return candidate;
}

export function addGameRoutes(games, options = {}) {
  const usedSlugs = new Set();
  const normalizeSkipIntro = options.normalizeSkipIntro || null;

  return games.map((game) => {
    const slug = getUniqueGameSlug(game, usedSlugs);

    return {
      ...game,
      skipIntro: normalizeSkipIntro ? normalizeSkipIntro(game.skipIntro) : game.skipIntro,
      displayTitle: getDisplayTitle(game.title),
      slug,
      href: `/${slug}`,
      playHref: `/${slug}/play`,
    };
  });
}

export function getBundledGameLibrary(libraryData, options = {}) {
  const games = Array.isArray(libraryData?.games) ? libraryData.games : [];

  if (games.length === 0) {
    throw new Error(options.emptyLibraryMessage || "No installed game metadata found");
  }

  return {
    games: addGameRoutes(games, options),
    primaryTarget: libraryData?.primaryTarget || games[0]?.target || "",
  };
}

export function findGameBySlug(games, gameSlug) {
  return games.find((game) => game.slug === gameSlug) || null;
}

export function findGameByTarget(games, target) {
  return games.find((game) => game.target === target) || null;
}

export function getGameStaticParams(games) {
  return games.map((game) => ({
    gameSlug: game.slug,
  }));
}

export function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

export function getScummvmVersionLabel(sourceInfo) {
  const version = sourceInfo?.scummvm?.version;
  const commit = sourceInfo?.scummvm?.commit;

  return version ? `${version} (${shortCommit(commit)})` : shortCommit(commit);
}

export function getSourceInfoDate(sourceInfo) {
  return String(sourceInfo?.generated_at_utc || "").slice(0, 10);
}
