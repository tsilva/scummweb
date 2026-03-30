import fs from "node:fs/promises";
import path from "node:path";
import { getGameLibrary, getVersionedScummvmAssetPath } from "./game-library";
import HomeShell from "./home-shell";

const scummvmOfficialSite = "https://www.scummvm.org/";
const projectRepositoryUrl = "https://github.com/tsilva/scummvm-web";
export const dynamic = "force-static";

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
    screenshots: [
      "/launcher/bass-shot-1.png",
      "/launcher/bass-shot-2.png",
      "/launcher/bass-shot-3.png",
    ],
    landscapeImage: "/launcher/sky-cover.webp",
    posterImage: "/launcher/sky-cover.webp",
    spotlightImage: "/launcher/sky-cover.webp",
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
    heroImage: "/launcher/dreamweb-hero.webp",
    landscapeImage: "/launcher/dreamweb-cover.webp",
    posterImage: "/launcher/dreamweb-cover.webp",
    spotlightImage: "/launcher/dreamweb-cover.webp",
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
    landscapeImage: "/launcher/queen-cover.webp",
    posterImage: "/launcher/queen-cover.webp",
    spotlightImage: "/launcher/queen-cover.webp",
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
    landscapeImage: "/launcher/lure-cover.webp",
    posterImage: "/launcher/lure-cover.webp",
    spotlightImage: "/launcher/lure-cover.webp",
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
    landscapeImage: "/launcher/drascula-cover.webp",
    posterImage: "/launcher/drascula-cover.webp",
    spotlightImage: "/launcher/drascula-cover.webp",
    screenshots: [],
    tone: "tone-default",
  },
  "waxworks-demo": {
    eyebrow: "Midnight Curio",
    summary:
      "Waxworks opens with a wax museum invitation, a dead-eyed host, and an Adventure Soft horror demo that wastes no time turning pulp history into gore-soaked dread.",
    genre: "Horror Adventure",
    studio: "Adventure Soft",
    year: "1992",
    badge: "DOS Demo",
    tag: "Grotesque anthology",
    heroImage: "/launcher/waxworks-hero.jpg?v=20260329",
    landscapeImage: "/launcher/waxworks-cover.webp?v=20260329",
    posterImage: "/launcher/waxworks-cover.webp?v=20260329",
    spotlightImage: "/launcher/waxworks-cover.webp?v=20260329",
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
    landscapeImage: "/launcher/sword25-cover.webp",
    posterImage: "/launcher/sword25-cover.webp",
    spotlightImage: "/launcher/sword25-cover.webp",
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

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

function pickFeaturedGame(catalog, primaryTarget) {
  if (catalog.length === 0) {
    return null;
  }

  return (
    catalog.find((game) => game.target === primaryTarget) ||
    catalog.find((game) => game.target === "sky") ||
    catalog[0]
  );
}

function getGameMeta(game) {
  const art = { ...defaultArt, ...(artByTarget[game.target] || {}) };

  return {
    ...game,
    ...art,
    infoHref: game.readmeHref || getVersionedScummvmAssetPath("/source.html"),
    summary:
      art.summary ||
      `Launch ${game.displayTitle} directly from its dedicated ScummVM Web route and jump into the configured target immediately.`,
    heroImage: art.heroImage || art.screenshots[1] || art.screenshots[0] || "",
    landscapeImage: art.landscapeImage || art.screenshots[0] || "",
    posterImage:
      art.posterImage || art.screenshots[art.screenshots.length - 1] || art.screenshots[0] || "",
    spotlightImage:
      art.spotlightImage || art.landscapeImage || art.posterImage || art.screenshots[0] || "",
  };
}

async function getSourceInfo() {
  const infoPath = path.join(process.cwd(), "public", "source-info.json");
  const content = await fs.readFile(infoPath, "utf8");
  return JSON.parse(content);
}

export default async function HomePage() {
  const { games, primaryTarget } = await getGameLibrary();
  const sourceInfo = await getSourceInfo();

  if (games.length === 0) {
    throw new Error("No installed game metadata found");
  }

  const catalog = games.map(getGameMeta);
  const featuredGame = pickFeaturedGame(catalog, primaryTarget) || catalog[0];
  const buildStamp = `${shortCommit(sourceInfo.project.commit)} / ${shortCommit(
    sourceInfo.scummvm.commit
  )}`;

  return (
    <HomeShell
      buildStamp={buildStamp}
      catalog={catalog}
      featuredGame={featuredGame}
      projectRepositoryUrl={projectRepositoryUrl}
      scummvmOfficialSite={scummvmOfficialSite}
      sourceHref={getVersionedScummvmAssetPath("/source.html")}
      sourceInfoDate={sourceInfo.generated_at_utc.slice(0, 10)}
    />
  );
}
