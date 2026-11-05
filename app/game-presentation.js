import { getVersionedSiteAssetPath } from "./asset-paths.js";
import retroGameArtwork from "./retro-game-artwork.json" with { type: "json" };

const importedScummGames = [
  {
    target: "tentacle",
    titles: ["Day of the Tentacle", "Maniac Mansion: Day of the Tentacle"],
    studio: "LucasArts",
    year: "1993",
    summary: "Send Bernard, Hoagie, and Laverne through time to stop Purple Tentacle from taking over the world.",
  },
  {
    target: "loom",
    titles: ["Loom"],
    studio: "Lucasfilm Games",
    year: "1990",
    summary: "Play musical drafts as Bobbin Threadbare and discover what happened to the Weavers.",
  },
  {
    target: "maniac",
    titles: ["Maniac Mansion"],
    studio: "Lucasfilm Games",
    year: "1987",
    summary: "Pick a team of teenagers to explore Dr. Fred's mansion and rescue Sandy.",
  },
  {
    target: "monkey2",
    titles: ["Monkey Island 2: LeChuck's Revenge"],
    studio: "Lucasfilm Games",
    year: "1991",
    summary: "Search for the treasure of Big Whoop as the undead pirate LeChuck returns for revenge.",
  },
  {
    target: "samnmax",
    titles: ["Sam & Max Hit the Road", "Sam and Max Hit the Road"],
    studio: "LucasArts",
    year: "1993",
    summary: "Join freelance police Sam and Max on a road trip to track down a missing carnival Bigfoot.",
  },
  {
    target: "zak",
    titles: ["Zak McKracken and the Alien Mindbenders"],
    studio: "Lucasfilm Games",
    year: "1988",
    summary: "Follow tabloid reporter Zak McKracken as he uncovers an alien plot to make Earth stupid.",
  },
];

const artByTarget = {
  soltys: { ...retroGameArtwork["cge:soltys"], year: "1995" },
  hires1: { ...retroGameArtwork["adl:hires1"], year: "1980" },
  got: { ...retroGameArtwork["got:got"], year: "1993" },
  ...Object.fromEntries(importedScummGames.map(({ target, studio, year, summary }) => [target, {
    eyebrow: `${studio} Adventure`,
    genre: "Point-and-click adventure",
    studio,
    year,
    summary,
    posterImage: `/launcher/${target}-cover.webp`,
    screenshots: retroGameArtwork[`scumm:${target}`].screenshots,
  }])),
  atlantis: {
    eyebrow: "LucasArts Adventure",
    summary: "Indy and Sophia Hapgood race to find Atlantis in an original globetrotting adventure.",
    genre: "Point-and-click adventure",
    studio: "LucasArts",
    year: "1992",
    posterImage: "/launcher/atlantis-cover.webp",
    screenshots: retroGameArtwork["scumm:atlantis"].screenshots,
  },
  indy3: {
    eyebrow: "Lucasfilm Games Adventure",
    summary: "Follow Indy and his father on the search for the Holy Grail in the graphic adventure based on the film.",
    genre: "Point-and-click adventure",
    studio: "Lucasfilm Games",
    year: "1989",
    posterImage: "/launcher/indy3-cover.webp",
    screenshots: retroGameArtwork["scumm:indy3"].screenshots,
  },
  sfinx: {
    eyebrow: "L.K. Avalon",
    summary: "Switch between two young adventurers and solve puzzles in this colorful Polish point-and-click comedy.",
    genre: "Point-and-click adventure",
    studio: "L.K. Avalon",
    year: "1997",
    heroImage: "/launcher/sfinx-hero.webp",
    posterImage: "/launcher/sfinx-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/sfinx-shot-1.webp",
      "/launcher/sfinx-shot-2.webp",
      "/launcher/sfinx-shot-3.webp",
    ],
  },
  "monkey-demo": {
    eyebrow: "Lucasfilm Games Demo",
    mobileSummary: "Explore Mêlée Island as aspiring pirate Guybrush Threepwood in this playable demo.",
    summary:
      "As aspiring pirate Guybrush Threepwood, explore Mêlée Island, question the locals, and find the magic phrase that will get you past a troll. This playable EGA demo remixes scenes and characters from the full adventure into a short story of its own.",
    genre: "Point-and-click adventure",
    studio: "Lucasfilm Games",
    year: "1990",
    badge: "English DOS EGA demo",
    tag: "Playable Demo",
    heroImage: "/launcher/monkey-demo-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/monkey-demo-scummweb-generated-2026-11-05-r1-hero.webp",
    posterImage: "/launcher/monkey-demo-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/monkey-demo-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/monkey-demo-shot-1.png",
      "/launcher/monkey-demo-shot-2.png",
      "/launcher/monkey-demo-shot-3.png",
    ],
    tone: "tone-default",
  },
  sky: {
    eyebrow: "Featured Classic",
    mobileSummary: "Escape a towering dystopian city in this classic cyberpunk adventure.",
    summary:
      "Beneath a Steel Sky opens with a broken hovercar, a towering dystopian city, and the kind of dry wit that only 90s cyberpunk adventures could get away with.",
    genre: "Cyberpunk Adventure",
    studio: "Revolution Software",
    year: "1994",
    badge: "CD Release",
    tag: "Industrial noir",
    heroImage: "/launcher/sky-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    screenshots: [
      "/launcher/bass-shot-1.png",
      "/launcher/bass-shot-2.png",
      "/launcher/bass-shot-3.png",
    ],
    landscapeImage: "/launcher/sky-cover.webp",
    posterImage: "/launcher/sky-scummweb-generated-2026-11-05-r2-cover.webp",
    spotlightImage: "/launcher/sky-scummweb-generated-2026-11-05-r2-cover.webp",
    tone: "tone-sky",
  },
  "dreamweb-cd": {
    eyebrow: "Night Shift Pick",
    mobileSummary: "Uncover a sinister cult in a rain-soaked city of the future.",
    summary:
      "DreamWeb trades bright heroics for rain, cult dread, and a killer drifting through a diseased future city. It is still one of the strangest things you can boot from ScummVM.",
    genre: "Noir Thriller",
    studio: "Empire Interactive",
    year: "1994",
    badge: "CD Edition",
    tag: "Rain-soaked dystopia",
    heroImage: "/launcher/dreamweb-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/dreamweb-cover.webp",
    posterImage: "/launcher/dreamweb-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/dreamweb-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/dreamweb-shot-1.png",
      "/launcher/dreamweb-shot-2.png",
      "/launcher/dreamweb-shot-3.png",
    ],
    tone: "tone-dreamweb",
  },
  queen: {
    eyebrow: "Jungle Matinee",
    mobileSummary: "Join a pulp pilot on a comic adventure through the Amazon.",
    summary:
      "Flight of the Amazon Queen throws a pulp pilot, a film star, and a lost-city conspiracy into a bright comic-book trek across the Amazon. It is breezier than DreamWeb and a lot better dressed for danger.",
    genre: "Comic Adventure",
    studio: "Interactive Binary Illusions",
    year: "1995",
    badge: "Talkie CD",
    tag: "Pulp expedition",
    heroImage: "/launcher/queen-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/queen-cover.webp",
    posterImage: "/launcher/queen-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/queen-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/queen-shot-1.png",
      "/launcher/queen-shot-2.png",
      "/launcher/queen-shot-3.png",
    ],
    tone: "tone-default",
  },
  lure: {
    eyebrow: "Castle Intrigue",
    mobileSummary: "Explore a troubled kingdom and outwit the forces threatening its people.",
    summary:
      "Lure of the Temptress drops you into a plague-struck kingdom full of shifting loyalties, suspicious guards, and the early Revolution Software menace that already points toward Beneath a Steel Sky.",
    genre: "Fantasy Adventure",
    studio: "Revolution Software",
    year: "1992",
    badge: "Freeware VGA",
    tag: "Castle conspiracy",
    heroImage: "/launcher/lure-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/lure-cover.webp",
    posterImage: "/launcher/lure-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/lure-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/lure-shot-1.png",
      "/launcher/lure-shot-2.png",
      "/launcher/lure-shot-3.png",
    ],
    tone: "tone-default",
  },
  drascula: {
    eyebrow: "Vampire Farce",
    mobileSummary: "Take on a cartoon vampire in a point-and-click comedy full of B-movie antics.",
    summary:
      "Drascula throws a dimwitted hero, cartoon vampire melodrama, and rapid-fire gag writing into a point-and-click comedy that never lets its B-movie premise sit still.",
    genre: "Comedy Horror Adventure",
    studio: "Alcachofa Soft",
    year: "1996",
    badge: "English Freeware",
    tag: "Spanish cult comedy",
    heroImage: "/launcher/drascula-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/drascula-cover.webp",
    posterImage: "/launcher/drascula-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/drascula-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/drascula-shot-1.png",
      "/launcher/drascula-shot-2.png",
      "/launcher/drascula-shot-3.png",
    ],
    tone: "tone-default",
  },
  "nippon-amiga": {
    eyebrow: "Heist Fever Dream",
    mobileSummary: "Follow three unlikely crooks through a colorful caper full of bad luck.",
    summary:
      "Nippon Safes, Inc. turns a three-way caper into a neon cartoon of crooks, bad luck, and sharply drawn Amiga absurdity. It feels like a pulp comic strip that got lost in a cyberpunk fever dream.",
    genre: "Comedy Caper Adventure",
    studio: "Dynabyte",
    year: "1992",
    badge: "Amiga Freeware",
    tag: "Multi-hero heist",
    heroImage: "/launcher/nippon-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/nippon-cover.webp",
    posterImage: "/launcher/nippon-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/nippon-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/nippon-shot-1.png",
      "/launcher/nippon-shot-2.png",
      "/launcher/nippon-shot-3.png",
    ],
    tone: "tone-default",
  },
  sword25: {
    eyebrow: "Fan Sequel Spotlight",
    mobileSummary: "Join George and Nico in a hand-painted Templar conspiracy.",
    mobileBadge: "Fan game",
    summary:
      "Broken Sword 2.5 sends George and Nico back into a hand-painted conspiracy full of autumn streets, Templar fallout, and the lavish fan-made craft that made it a ScummVM showcase.",
    genre: "Conspiracy Adventure",
    studio: "mindFactory",
    year: "2008",
    badge: "Freeware Fan Game",
    tag: "Templar return",
    heroImage: "/launcher/sword25-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/sword25-cover.webp",
    posterImage: "/launcher/sword25-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/sword25-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: [
      "/launcher/sword25-shot-1.png",
      "/launcher/sword25-shot-2.png",
      "/launcher/sword25-shot-3.png",
    ],
    tone: "tone-default",
  },
};

const defaultArt = {
  genre: "ScummVM Adventure",
  studio: "ScummVM Runtime",
  year: null,
  badge: "Playable Now",
  tag: "Ready to launch",
  screenshots: [],
  tone: "tone-default",
};

export function getGamePresentation(game, importedArt) {
  const art = { ...defaultArt, ...artByTarget[game.target], ...importedArt };
  const screenshots = art.screenshots.map(getVersionedSiteAssetPath);

  return {
    ...game,
    ...art,
    eyebrow: art.eyebrow || art.genre,
    familyId: game.familyId || (game.engineId && (game.gameId || game.target)
      ? `${game.engineId}:${game.gameId || game.target}` : null),
    infoHref: game.readmeHref || null,
    screenshots,
    summary:
      art.summary ||
      `Explore ${game.displayTitle} on its dedicated ScummWEB page, then launch the configured target in one click.`,
    heroImagePosition: art.heroImagePosition || undefined,
    heroImageMobile: art.heroImageMobile
      ? getVersionedSiteAssetPath(art.heroImageMobile)
      : undefined,
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

function getImportedScummPresentation(target, title, variant) {
  const metadata = retroGameArtwork[`scumm:${target}`];
  const platform = /\bamiga\b/i.test(variant) ? "Amiga" : /\bdos\b/i.test(variant) ? "DOS" : undefined;
  const edition = /\bcd\b/i.test(variant) ? "CD" : undefined;
  const demo = /\bdemo\b/i.test(variant) ? " (Demo)" : "";
  const labels = [...variant.matchAll(/\(([^()]+)\)/g)].map(([, label]) => label);
  return {
    ...getGamePresentation({ target, displayTitle: title + demo, engineId: "scumm" }, metadata && {
      summary: metadata.summary,
      studio: metadata.studio,
      genre: metadata.genre,
    }),
    platform,
    edition,
    badge: labels.join(" · ") || "Local game",
  };
}

const normalizeImportedTitle = (title) => title.toLowerCase().replace(/[:\s-]+/g, " ").trim();

export function getRecognizedGamePresentations() {
  return [
    ...Object.entries(retroGameArtwork).map(([familyId, record]) => {
      const [engineId, target] = familyId.split(":");
      return getGamePresentation({
        familyId, target, engineId: engineId === "local" ? "scumm" : engineId,
        displayTitle: record.title,
      }, record);
    }),
    getGamePresentation({ target: "sfinx", engineId: "cge2", displayTitle: "Sfinx" }),
  ];
}
const splitImportedEdition = (name) => /^(.+?)((?:\s+\([^()]+\))*)$/.exec(name);
const retroByEdition = new Map();
const retroByTitle = new Map();
for (const [id, record] of Object.entries(retroGameArtwork)) {
  const game = { id, ...record };
  for (const alias of [record.title, ...record.aliases]) {
    const edition = normalizeImportedTitle(alias);
    const existingEdition = retroByEdition.get(edition);
    // A shared canonical title is ambiguous even in the exact-alias index.
    retroByEdition.set(edition, existingEdition === undefined || existingEdition === game ? game : null);
    const title = normalizeImportedTitle(splitImportedEdition(alias)[1]);
    const existing = retroByTitle.get(title);
    retroByTitle.set(title, existing === undefined || existing === game ? game : null);
  }
}

export function getImportedGamePresentation(filename) {
  const archive = /^(.+?)((?:\s+\([^()]+\))*)\.zip$/i.exec(filename);
  const indy = archive && /^indiana jones and the (fate of atlantis|last crusade)(?:[: -]+the graphic adventure)?$/i.exec(archive[1]);
  if (indy && !/\baction game\b/i.test(archive[2])) {
    const atlantis = indy[1].toLowerCase() === "fate of atlantis";
    return getImportedScummPresentation(
      atlantis ? "atlantis" : "indy3",
      `Indiana Jones and the ${atlantis ? "Fate of Atlantis" : "Last Crusade"}`,
      archive[2]
    );
  }

  if (archive) {
    const title = normalizeImportedTitle(archive[1]);
    const game = importedScummGames.find(({ titles }) =>
      titles.some((alias) => normalizeImportedTitle(alias) === title)
    );
    if (game) return getImportedScummPresentation(game.target, game.titles[0], archive[2]);

    const retro = retroByEdition.get(normalizeImportedTitle(archive[1] + archive[2])) ?? retroByTitle.get(title);
    if (retro) {
      const labels = [...archive[2].matchAll(/\(([^()]+)\)/g)].map(([, label]) => label);
      const demo = /\bdemo\b/i.test(archive[2]) && !/\(Demo\)$/i.test(retro.title);
      const [engineId, target] = retro.id.split(":");
      return {
        ...getGamePresentation({
          target,
          familyId: retro.id,
          engineId: engineId === "local" ? "scumm" : engineId,
          displayTitle: retro.title + (demo ? " (Demo)" : ""),
        }, {
          posterImage: retro.posterImage,
          screenshots: retro.screenshots,
          summary: retro.summary,
          studio: retro.studio,
          genre: retro.genre,
          editionLabel: retro.editionLabel,
        }),
        badge: labels.join(" · ") || "Local game",
      };
    }
  }

  const sfinx = /^sfinx(?:-(en|pl|de))?(?:-v(\d+(?:\.\d+)*))?\.zip$/i.exec(filename);
  if (!sfinx) return null;

  const language = { en: "English", pl: "Polish", de: "German" }[sfinx[1]?.toLowerCase()];
  const edition = sfinx[2] ? `v${sfinx[2]}` : null;
  return {
    ...getGamePresentation({ target: "sfinx", displayTitle: "Sfinx", engineId: "cge2" }),
    platform: "DOS",
    language,
    edition,
    badge: ["DOS", language, edition].filter(Boolean).join(" · "),
  };
}
