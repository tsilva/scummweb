import { getVersionedSiteAssetPath } from "./asset-paths.js";
import retroGameArtwork from "./retro-game-artwork.json" with { type: "json" };

const importedAdventureGames = [
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
  {
    target: "grim",
    engineId: "grim",
    titles: ["Grim Fandango"],
    studio: "LucasArts",
    year: "1998",
    summary: "Follow Manny Calavera as he searches for Meche across the Land of the Dead.",
  },
  {
    target: "monkey4",
    engineId: "grim",
    titles: ["Escape from Monkey Island"],
    studio: "LucasArts",
    year: "2000",
    summary: "Help Guybrush and Elaine stop a plot to take over the Caribbean.",
  },
];

function bundledGameplayGallery(slug, edition, scenes, extension = "png") {
  return {
    screenshots: scenes.map((_, index) => `/launcher/${slug}-shot-${index + 1}.${extension}`),
    sources: {
      screenshots: scenes.map((scene) => ({
        kind: "gameplay",
        page: `https://scummweb.tsilva.eu/${slug}/play`,
        edition,
        scene,
        credit: "Original gameplay captured in ScummWEB",
      })),
    },
  };
}

const bundledArtworkByTarget = {
  "grim-demo": {
    heroImage: "/launcher/grim-fandango-scummweb-generated-2026-11-09-r2-hero.webp",
    posterImage: "/launcher/grim-fandango-scummweb-generated-2026-11-08-r1-cover.webp",
    ...bundledGameplayGallery("grim-fandango-demo", "English Windows small demo", [
      "Lost Souls' Alliance headquarters", "Alley outside the headquarters", "Street festival",
    ]),
  },
  "monkey4-demo": {
    heroImage: "/launcher/escape-from-monkey-island-scummweb-generated-2026-11-09-r2-hero.webp",
    posterImage: "/launcher/escape-from-monkey-island-scummweb-generated-2026-11-08-r2-cover.webp",
    ...bundledGameplayGallery("escape-from-monkey-island-demo", "English Windows web demo", [
      "Governor's mansion grounds", "Encounter with the catapult operator", "Path to the gate",
    ]),
  },
  zork1: {
    heroImage: "/launcher/zork-1-scummweb-generated-2026-11-08-r2-hero.webp",
    posterImage: "/launcher/zork-1-scummweb-generated-2026-11-08-r1-cover.webp",
    ...bundledGameplayGallery("zork-i-the-great-underground-empire", "English Z-machine v3", [
      "Mailbox west of the house", "Kitchen", "Living room",
    ]),
  },
  zork2: {
    heroImage: "/launcher/zork-2-scummweb-generated-2026-11-08-r2-hero.webp",
    posterImage: "/launcher/zork-2-scummweb-generated-2026-11-08-r1-cover.webp",
    ...bundledGameplayGallery("zork-ii-the-wizard-of-frobozz", "English Z-machine v3", [
      "Inside the Barrow", "Narrow Tunnel", "Foot Bridge",
    ]),
  },
  zork3: {
    heroImage: "/launcher/zork-3-scummweb-generated-2026-11-08-r1-hero.webp",
    posterImage: "/launcher/zork-3-scummweb-generated-2026-11-08-r1-cover.webp",
    ...bundledGameplayGallery("zork-iii-the-dungeon-master", "English Z-machine v3", [
      "Endless Stair", "Junction", "Creepy Crawl",
    ]),
  },
};

const artByTarget = {
  "sword1-demo": {
    ...retroGameArtwork["sword1:sword1"],
    title: "Broken Sword: The Shadow of the Templars (Demo)",
    year: "1996",
    language: "en",
    summary: "Investigate a Parisian mystery in the original voiced English Macintosh demo of Broken Sword.",
  },
  "dig-demo": {
    ...retroGameArtwork["scumm:dig"],
    title: "The Dig (Demo)",
    year: "1995",
    language: "en",
    summary: "Explore an alien world as Commander Boston Low in this voiced science-fiction adventure demo.",
  },
  "samnmax-demo": {
    ...retroGameArtwork["scumm:samnmax"],
    title: "Sam & Max Hit the Road (Demo)",
    year: "1993",
    language: "en",
    heroImageMobilePosition: "88% top",
    summary: "Try the voiced English demo of Sam and Max’s comedy road-trip adventure.",
  },
  "ft-demo": {
    ...retroGameArtwork["scumm:ft"],
    title: "Full Throttle (Demo)",
    year: "1995",
    language: "en",
    summary: "Play three segments of Ben’s adventure: the Kickstand bar, a biker road duel, and the Cavefish hideout.",
  },
  draci: {
    ...retroGameArtwork["draci:draci"],
    studio: "NoSense",
    year: "1995",
    language: "en",
    summary: "Guide Bert, a young dragon, as he searches for his father and puts right the mischief caused by an enchanted wand.",
  },
  "atlantis-demo": {
    genre: "Point-and-click adventure",
    studio: "LucasArts",
    year: "1992",
    language: "en",
    summary: "Play LucasArts’ original DOS demonstration of Indiana Jones’s search for Atlantis.",
    posterImage: retroGameArtwork["scumm:atlantis"].posterImage,
    heroImage: retroGameArtwork["scumm:atlantis"].heroImage,
    ...bundledGameplayGallery("indiana-jones-and-the-fate-of-atlantis-demo", "English DOS interactive demo", [
      "Thera harbor", "Hillside village", "Thera mountains",
    ]),
  },
  "comi-demo": {
    genre: retroGameArtwork["scumm:comi"].genre,
    studio: "LucasArts",
    year: "1997",
    language: "en",
    summary: "Help Guybrush Threepwood escape a pirate ship in this voiced demo.",
    posterImage: retroGameArtwork["scumm:comi"].posterImage,
    heroImage: retroGameArtwork["scumm:comi"].heroImage,
    heroImagePosition: retroGameArtwork["scumm:comi"].heroImagePosition,
    ...bundledGameplayGallery("the-curse-of-monkey-island-demo", "English Windows small demo", [
      "Opening scene in the ship’s hold", "Cannon verb coin", "Guybrush’s inventory",
    ], "webp"),
  },
  ...Object.fromEntries([
    ["teenagent:teenagent", "1995"],
    ["hugo:hugo1", "1990"],
    ["hugo:hugo2", "1991"],
    ["hugo:hugo3", "1992"],
  ].map(([familyId, year]) => {
    const { title, ...artwork } = retroGameArtwork[familyId];
    return [`${familyId.split(":")[1]}-demo`, {
      ...artwork,
      year,
      language: "en",
      badge: "Shareware",
    }];
  })),
  "pegasus-demo": {
    ...retroGameArtwork["pegasus:pegasus"],
    title: "The Journeyman Project: Pegasus Prime (Demo)",
    year: "1997",
    language: "en",
  },
  "castlemaster-demo": {
    genre: "First-person fantasy adventure",
    studio: "Incentive Software",
    year: "1990",
    language: "en",
    summary: "Explore the first level of Castle Eternity and search for your captive twin.",
    heroImage: "/launcher/castle-master-scummweb-generated-2026-11-09-r1-hero.webp",
    posterImage: "/launcher/castle-master-scummweb-generated-2026-11-09-r1-cover.webp",
    screenshots: [
      "/launcher/castle-master-demo-wilderness.webp",
      "/launcher/castle-master-demo-gatehouse.webp",
      "/launcher/castle-master-demo-courtyard.png",
    ],
    sources: {
      screenshots: ["Wilderness outside Castle Eternity", "Gatehouse", "Courtyard"].map((scene) => ({
        kind: "gameplay",
        page: "https://scummweb.tsilva.eu/castle-master-demo/play",
        edition: "English DOS playable demo",
        scene,
        credit: "Original gameplay captured in ScummWEB",
      })),
    },
  },
  "qfi-demo": {
    genre: "Adventure RPG",
    studio: "Infamous Quests",
    year: "2014",
    language: "en",
    summary: "Explore the Valley of Krasna as Mr. Roehm, an adventurer with a checkered past.",
    heroImage: "/launcher/quest-for-infamy-scummweb-generated-2026-11-09-r1-hero.webp",
    posterImage: "/launcher/quest-for-infamy-scummweb-generated-2026-11-09-r1-cover.webp",
    screenshots: [
      "/launcher/quest-for-infamy-shot-1.webp",
      "/launcher/quest-for-infamy-shot-2.webp",
      "/launcher/quest-for-infamy-shot-3.webp",
    ],
    sources: {
      screenshots: [
        "https://images.launchbox-app.com/480c8da8-2a29-4728-a325-577afdf0cbff.jpg",
        "https://images.launchbox-app.com/f7c743e8-5933-442c-8f73-c88efdc7095c.jpg",
        "https://images.launchbox-app.com/319816ea-dd26-479e-b58a-b70d741fd728.jpg",
      ].map((url) => ({
        kind: "gameplay",
        url,
        page: "https://gamesdb.launchbox-app.com/games/images/79875-quest-for-infamy",
        credit: "LaunchBox Games Database",
      })),
    },
  },
  "grim-demo": {
    genre: "Graphic adventure",
    studio: "LucasArts",
    year: "1998",
    language: "en",
    summary: "Meet Manny Calavera in LucasArts’ original Windows demo set in the Land of the Dead.",
    ...bundledArtworkByTarget["grim-demo"],
  },
  "monkey4-demo": {
    genre: "Graphic adventure",
    studio: "LucasArts",
    year: "2000",
    language: "en",
    summary: "Join Guybrush Threepwood in the original Windows web demo of the fourth Monkey Island adventure.",
    ...bundledArtworkByTarget["monkey4-demo"],
  },
  ...Object.fromEntries([
    ["zork1", "1980", "Explore the Great Underground Empire, starting outside a white house."],
    ["zork2", "1981", "Explore the wizard’s domain and unravel the puzzles of Frobozz."],
    ["zork3", "1982", "Face the final trials of the Great Underground Empire and seek the Dungeon Master."],
  ].map(([target, year, summary]) => [target, {
    genre: "Text adventure",
    studio: "Infocom",
    language: "en",
    year,
    summary: `${summary} Type commands to play.`,
    ...bundledArtworkByTarget[target],
  }])),
  soltys: { ...retroGameArtwork["cge:soltys"], year: "1995" },
  hires1: { ...retroGameArtwork["adl:hires1"], year: "1980" },
  got: { ...retroGameArtwork["got:got"], year: "1993" },
  ...Object.fromEntries(importedAdventureGames.map(({ target, engineId = "scumm", studio, year, summary }) => [target, {
    eyebrow: `${studio} Adventure`,
    genre: retroGameArtwork[`${engineId}:${target}`]?.genre || "Graphic adventure",
    studio,
    year,
    summary,
    posterImage: retroGameArtwork[`${engineId}:${target}`]?.posterImage ?? bundledArtworkByTarget[`${target}-demo`]?.posterImage,
    screenshots: retroGameArtwork[`${engineId}:${target}`]?.screenshots ?? [],
  }])),
  atlantis: {
    eyebrow: "LucasArts Adventure",
    summary: "Indy and Sophia Hapgood race to find Atlantis in an original globetrotting adventure.",
    genre: retroGameArtwork["scumm:atlantis"].genre,
    studio: "LucasArts",
    year: "1992",
    posterImage: retroGameArtwork["scumm:atlantis"].posterImage,
    screenshots: retroGameArtwork["scumm:atlantis"].screenshots,
  },
  indy3: {
    eyebrow: "Lucasfilm Games Adventure",
    summary: "Follow Indy and his father on the search for the Holy Grail in the graphic adventure based on the film.",
    genre: retroGameArtwork["scumm:indy3"].genre,
    studio: "Lucasfilm Games",
    year: "1989",
    posterImage: retroGameArtwork["scumm:indy3"].posterImage,
    screenshots: retroGameArtwork["scumm:indy3"].screenshots,
  },
  sfinx: {
    eyebrow: "L.K. Avalon",
    summary: "Switch between two young adventurers and solve puzzles in this colorful Polish point-and-click comedy.",
    genre: "Comedy adventure",
    studio: "L.K. Avalon",
    year: "1997",
    heroImage: "/launcher/sfinx-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
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
      "Explore Mêlée Island as aspiring pirate Guybrush Threepwood in this standalone demo adventure.",
    genre: retroGameArtwork["scumm:monkey"].genre,
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
      "Escape Union City as Robert Foster and uncover the secrets behind its oppressive rule.",
    genre: "Cyberpunk adventure",
    studio: "Revolution Software",
    year: "1994",
    badge: "CD Release",
    tag: "Industrial noir",
    heroImage: "/launcher/sky-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    screenshots: [
      "/launcher/bass-gameplay-shot-walkway.png",
      "/launcher/bass-gameplay-shot-travelco.png",
      "/launcher/bass-gameplay-shot-garden.png",
    ],
    sources: {
      screenshots: [
        {
          kind: "gameplay",
          url: "https://www.scummvm.org/data/screenshots/sky/sky/sky_dos_en_1_2_full.png",
          page: "https://www.scummvm.org/screenshots/revolution/sky:sky/",
        },
        {
          kind: "gameplay",
          url: "https://www.scummvm.org/data/screenshots/sky/sky/sky_dos_en_1_4_full.png",
          page: "https://www.scummvm.org/screenshots/revolution/sky:sky/",
        },
        {
          kind: "gameplay",
          url: "https://www.scummvm.org/data/screenshots/sky/sky/sky_dos_en_1_5_full.png",
          page: "https://www.scummvm.org/screenshots/revolution/sky:sky/",
        },
      ],
    },
    landscapeImage: "/launcher/sky-cover.webp",
    posterImage: "/launcher/sky-scummweb-generated-2026-11-05-r2-cover.webp",
    spotlightImage: "/launcher/sky-scummweb-generated-2026-11-05-r2-cover.webp",
    tone: "tone-sky",
  },
  "dreamweb-cd": {
    eyebrow: "Night Shift Pick",
    mobileSummary: "Uncover a sinister cult in a rain-soaked city of the future.",
    summary:
      "Follow bartender Ryan through a dystopian city as disturbing dreams draw him into a deadly mission.",
    genre: "Noir thriller",
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
      "Pilot Joe King crashes in the Amazon and becomes entangled in a mad scientist's plot.",
    genre: "Comic adventure",
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
      "Help Diermot escape captivity and oppose the sorceress Selena in the village of Turnvale.",
    genre: "Fantasy adventure",
    studio: "Revolution Software",
    year: "1992",
    badge: "Freeware VGA",
    tag: "Castle conspiracy",
    heroImage: "/launcher/lure-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/lure-cover.webp",
    posterImage: "/launcher/lure-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/lure-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: retroGameArtwork["lure:lure"].screenshots,
    tone: "tone-default",
  },
  drascula: {
    eyebrow: "Vampire Farce",
    mobileSummary: "Take on a cartoon vampire in a point-and-click comedy full of B-movie antics.",
    summary:
      "Help John Hacker rescue Billie Jean from Count Drascula in a vampire comedy.",
    genre: "Comedy horror adventure",
    studio: "Alcachofa Soft",
    year: "1996",
    badge: "English Freeware",
    tag: "Spanish cult comedy",
    heroImage: "/launcher/drascula-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/drascula-cover.webp",
    posterImage: "/launcher/drascula-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/drascula-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: retroGameArtwork["drascula:drascula"].screenshots,
    tone: "tone-default",
  },
  "nippon-amiga": {
    eyebrow: "Heist Fever Dream",
    mobileSummary: "Follow three unlikely crooks through a colorful caper full of bad luck.",
    summary:
      "Switch between three unlikely crooks as their separate jobs collide in a Japanese heist.",
    genre: "Comedy caper adventure",
    studio: "Dynabyte",
    year: "1992",
    badge: "Amiga Freeware",
    tag: "Multi-hero heist",
    heroImage: "/launcher/nippon-scummweb-generated-2026-11-05-r1-hero.webp",
    heroImagePosition: "80% 38%",
    landscapeImage: "/launcher/nippon-cover.webp",
    posterImage: "/launcher/nippon-scummweb-generated-2026-11-05-r1-cover.webp",
    spotlightImage: "/launcher/nippon-scummweb-generated-2026-11-05-r1-cover.webp",
    screenshots: retroGameArtwork["parallaction:nippon"].screenshots,
    tone: "tone-default",
  },
  sword25: {
    eyebrow: "Fan Sequel Spotlight",
    mobileSummary: "Join George and Nico in a hand-painted Templar conspiracy.",
    mobileBadge: "Fan game",
    summary:
      "Reunite George and Nico in Paris to investigate a new conspiracy in this fan-made sequel.",
    genre: "Conspiracy adventure",
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
  genre: "ScummVM adventure",
  studio: "ScummVM Runtime",
  year: null,
  badge: null,
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

function getImportedAdventurePresentation(target, title, variant, engineId = "scumm") {
  const metadata = retroGameArtwork[`${engineId}:${target}`];
  const platform = /\bamiga\b/i.test(variant) ? "Amiga" : /\bdos\b/i.test(variant) ? "DOS"
    : /\bwindows\b/i.test(variant) ? "Windows" : undefined;
  const edition = /\bcd\b/i.test(variant) ? "CD" : undefined;
  const demo = /\bdemo\b/i.test(variant) ? " (Demo)" : "";
  const labels = [...variant.matchAll(/\(([^()]+)\)/g)].map(([, label]) => label);
  return {
    ...getGamePresentation({ target, displayTitle: title + demo, engineId }, metadata && {
      heroImage: metadata.heroImage,
      heroImagePosition: metadata.heroImagePosition,
      heroImageMobilePosition: metadata.heroImageMobilePosition,
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
    ...importedAdventureGames.filter(({ engineId }) => engineId === "grim")
      .map(({ target, engineId, titles }) => getGamePresentation({ target, engineId, displayTitle: titles[0] })),
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
    return getImportedAdventurePresentation(
      atlantis ? "atlantis" : "indy3",
      `Indiana Jones and the ${atlantis ? "Fate of Atlantis" : "Last Crusade"}`,
      archive[2]
    );
  }

  if (archive) {
    const title = normalizeImportedTitle(archive[1]);
    const game = importedAdventureGames.find(({ titles }) =>
      titles.some((alias) => normalizeImportedTitle(alias) === title)
    );
    if (game) return getImportedAdventurePresentation(game.target, game.titles[0], archive[2], game.engineId);

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
          heroImage: retro.heroImage,
          heroImagePosition: retro.heroImagePosition,
          heroImageMobilePosition: retro.heroImageMobilePosition,
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
  const labeledSfinx = /^sfinx v(\d+(?:\.\d+)*) \(DOS, (English|Polish|German)\)\.zip$/i.exec(filename);
  if (!sfinx && !labeledSfinx) return null;

  const languages = { en: "English", pl: "Polish", de: "German" };
  const language = labeledSfinx
    ? Object.values(languages).find((name) => name.toLowerCase() === labeledSfinx[2].toLowerCase())
    : languages[sfinx[1]?.toLowerCase()];
  const version = sfinx?.[2] ?? labeledSfinx?.[1];
  const edition = version ? `v${version}` : null;
  return {
    ...getGamePresentation({ target: "sfinx", displayTitle: "Sfinx", engineId: "cge2" }),
    platform: "DOS",
    language,
    edition,
    badge: ["DOS", language, edition].filter(Boolean).join(" · "),
  };
}
