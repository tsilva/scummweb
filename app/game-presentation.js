import {
  getVersionedScummvmAssetPath,
  getVersionedSiteAssetPath,
} from "./asset-paths";

const artByTarget = {
  sky: {
    eyebrow: "Featured Classic",
    summary:
      "Beneath a Steel Sky opens with a broken hovercar, a towering dystopian city, and the kind of dry wit that only 90s cyberpunk adventures could get away with.",
    genre: "Cyberpunk Adventure",
    studio: "Revolution Software",
    year: "1994",
    badge: "CD Release",
    tag: "Industrial noir",
    heroImage: "/launcher/sky-hero.jpg",
    screenshots: [
      "/launcher/bass-shot-1.png",
      "/launcher/bass-shot-2.png",
      "/launcher/bass-shot-3.png",
    ],
    landscapeImage: "/launcher/sky-cover.jpg",
    posterImage: "/launcher/sky-cover.jpg",
    spotlightImage: "/launcher/sky-cover.jpg",
    tone: "tone-sky",
  },
  "dreamweb-cd": {
    eyebrow: "Night Shift Pick",
    summary:
      "DreamWeb trades bright heroics for rain, cult dread, and a killer drifting through a diseased future city. It is still one of the strangest things you can boot from ScummVM.",
    genre: "Noir Thriller",
    studio: "Empire Interactive",
    year: "1994",
    badge: "CD Edition",
    tag: "Rain-soaked dystopia",
    heroImage: "/launcher/dreamweb-cover.jpg",
    landscapeImage: "/launcher/dreamweb-cover.jpg",
    posterImage: "/launcher/dreamweb-cover.jpg",
    spotlightImage: "/launcher/dreamweb-cover.jpg",
    screenshots: [],
    tone: "tone-dreamweb",
  },
  queen: {
    eyebrow: "Jungle Matinee",
    summary:
      "Flight of the Amazon Queen throws a pulp pilot, a film star, and a lost-city conspiracy into a bright comic-book trek across the Amazon. It is breezier than DreamWeb and a lot better dressed for danger.",
    genre: "Comic Adventure",
    studio: "Interactive Binary Illusions",
    year: "1995",
    badge: "Talkie CD",
    tag: "Pulp expedition",
    heroImage: "/launcher/queen-hero.jpg",
    heroImagePosition: "74% 30%",
    landscapeImage: "/launcher/queen-cover.jpg",
    posterImage: "/launcher/queen-cover.jpg",
    spotlightImage: "/launcher/queen-cover.jpg",
    screenshots: [],
    tone: "tone-default",
  },
  lure: {
    eyebrow: "Castle Intrigue",
    summary:
      "Lure of the Temptress drops you into a plague-struck kingdom full of shifting loyalties, suspicious guards, and the early Revolution Software menace that already points toward Beneath a Steel Sky.",
    genre: "Fantasy Adventure",
    studio: "Revolution Software",
    year: "1992",
    badge: "Freeware VGA",
    tag: "Castle conspiracy",
    heroImage: "/launcher/lure-hero.jpg",
    landscapeImage: "/launcher/lure-cover.jpg",
    posterImage: "/launcher/lure-cover.jpg",
    spotlightImage: "/launcher/lure-cover.jpg",
    screenshots: [],
    tone: "tone-default",
  },
  drascula: {
    eyebrow: "Vampire Farce",
    summary:
      "Drascula throws a dimwitted hero, cartoon vampire melodrama, and rapid-fire gag writing into a point-and-click comedy that never lets its B-movie premise sit still.",
    genre: "Comedy Horror Adventure",
    studio: "Alcachofa Soft",
    year: "1996",
    badge: "English Freeware",
    tag: "Spanish cult comedy",
    heroImage: "/launcher/drascula-hero.jpg",
    landscapeImage: "/launcher/drascula-cover.jpg",
    posterImage: "/launcher/drascula-cover.jpg",
    spotlightImage: "/launcher/drascula-cover.jpg",
    screenshots: [],
    tone: "tone-default",
  },
  "nippon-amiga": {
    eyebrow: "Heist Fever Dream",
    summary:
      "Nippon Safes, Inc. turns a three-way caper into a neon cartoon of crooks, bad luck, and sharply drawn Amiga absurdity. It feels like a pulp comic strip that got lost in a cyberpunk fever dream.",
    genre: "Comedy Caper Adventure",
    studio: "Dynabyte",
    year: "1992",
    badge: "Amiga Freeware",
    tag: "Multi-hero heist",
    heroImage: "/launcher/nippon-hero.jpg",
    landscapeImage: "/launcher/nippon-cover.jpg",
    posterImage: "/launcher/nippon-cover.jpg",
    spotlightImage: "/launcher/nippon-cover.jpg",
    screenshots: [],
    tone: "tone-default",
  },
  sword25: {
    eyebrow: "Fan Sequel Spotlight",
    summary:
      "Broken Sword 2.5 sends George and Nico back into a hand-painted conspiracy full of autumn streets, Templar fallout, and the lavish fan-made craft that made it a ScummVM showcase.",
    genre: "Conspiracy Adventure",
    studio: "mindFactory",
    year: "2008",
    badge: "Freeware Fan Game",
    tag: "Templar return",
    heroImage: "/launcher/sword25-hero.jpg",
    landscapeImage: "/launcher/sword25-cover.jpg",
    posterImage: "/launcher/sword25-cover.jpg",
    spotlightImage: "/launcher/sword25-cover.jpg",
    screenshots: [],
    tone: "tone-default",
  },
};

const defaultArt = {
  eyebrow: "Installed Adventure",
  genre: "ScummVM Adventure",
  studio: "ScummVM Runtime",
  year: "Archive",
  badge: "Playable Now",
  tag: "Ready to launch",
  screenshots: [],
  tone: "tone-default",
};

export function getGamePresentation(game) {
  const art = { ...defaultArt, ...(artByTarget[game.target] || {}) };
  const screenshots = art.screenshots.map(getVersionedSiteAssetPath);

  return {
    ...game,
    ...art,
    infoHref: game.readmeHref || null,
    screenshots,
    summary:
      art.summary ||
      `Explore ${game.displayTitle} from its dedicated scummweb page, then launch the configured target in one click.`,
    heroImagePosition: art.heroImagePosition || undefined,
    heroImage: getVersionedSiteAssetPath(
      art.heroImage || screenshots[1] || screenshots[0] || ""
    ),
    landscapeImage: getVersionedSiteAssetPath(art.landscapeImage || screenshots[0] || ""),
    posterImage: getVersionedSiteAssetPath(
      art.posterImage || screenshots[screenshots.length - 1] || screenshots[0] || ""
    ),
    spotlightImage: getVersionedSiteAssetPath(
      art.spotlightImage || art.landscapeImage || art.posterImage || screenshots[0] || ""
    ),
  };
}
