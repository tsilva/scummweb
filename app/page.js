import fs from "node:fs/promises";
import path from "node:path";
import LaunchButton from "./launch-button";
import ProjectNoticeModal from "./project-notice-modal";

const scummvmAssetVersion = process.env.NEXT_PUBLIC_SCUMMVM_ASSET_VERSION || "dev";
const scummvmOfficialSite = "https://www.scummvm.org/";
export const dynamic = "force-dynamic";

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
    heroImage: "/launcher/dreamweb-hero.jpg",
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
    landscapeImage: "/launcher/waxworks-cover.jpg?v=20260329",
    posterImage: "/launcher/waxworks-cover.jpg?v=20260329",
    spotlightImage: "/launcher/waxworks-cover.jpg?v=20260329",
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

function formatGameCount(count) {
  return `${count} game${count === 1 ? "" : "s"} installed`;
}

function getDisplayTitle(title) {
  return title.replace(/\s+\([^)]*\)$/, "");
}

function shortCommit(commit) {
  return commit ? commit.slice(0, 7) : "unknown";
}

function getVersionedScummvmAssetPath(assetPath) {
  const normalizedPath = assetPath.startsWith("/") ? assetPath : `/${assetPath}`;
  return `/scummvm/${encodeURIComponent(scummvmAssetVersion)}${normalizedPath}`;
}

function getArtStyle(prefix, image, options = {}) {
  if (!image) {
    return undefined;
  }

  const style = {
    [`--${prefix}-art-image`]: `url(${image})`,
  };

  if (options.position) {
    style[`--${prefix}-art-position`] = options.position;
  }

  if (options.size) {
    style[`--${prefix}-art-size`] = options.size;
  }

  if (options.repeat) {
    style[`--${prefix}-art-repeat`] = options.repeat;
  }

  return style;
}

function pickFeaturedGame(catalog) {
  if (catalog.length === 0) {
    return null;
  }

  return catalog[Math.floor(Math.random() * catalog.length)];
}

function getGameMeta(game) {
  const art = { ...defaultArt, ...(artByTarget[game.target] || {}) };
  const displayTitle = getDisplayTitle(game.title);

  return {
    ...game,
    ...art,
    displayTitle,
    href: `${getVersionedScummvmAssetPath("/scummvm.html")}#${game.target}`,
    infoHref: game.readmeHref || getVersionedScummvmAssetPath("/source.html"),
    summary:
      art.summary ||
      `Launch ${displayTitle} directly from the generated ScummVM web bundle and jump into the configured target immediately.`,
    heroImage: art.heroImage || art.screenshots[1] || art.screenshots[0] || "",
    landscapeImage: art.landscapeImage || art.screenshots[0] || "",
    posterImage:
      art.posterImage || art.screenshots[art.screenshots.length - 1] || art.screenshots[0] || "",
    spotlightImage:
      art.spotlightImage || art.landscapeImage || art.posterImage || art.screenshots[0] || "",
  };
}

async function getGameLibrary() {
  const publicDir = path.join(process.cwd(), "public");
  const libraryPath = path.join(publicDir, "games.json");

  try {
    const library = JSON.parse(await fs.readFile(libraryPath, "utf8"));
    return {
      games: library.games || [],
      primaryTarget: library.primaryTarget || library.games?.[0]?.target || "",
    };
  } catch {
    const primaryGame = JSON.parse(await fs.readFile(path.join(publicDir, "game.json"), "utf8"));
    return {
      games: [primaryGame],
      primaryTarget: primaryGame.target,
    };
  }
}

async function getSourceInfo() {
  const infoPath = path.join(process.cwd(), "public", "source-info.json");
  const content = await fs.readFile(infoPath, "utf8");
  return JSON.parse(content);
}

function Icon({ name, filled = false }) {
  const commonProps = {
    "aria-hidden": "true",
    className: "icon",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  switch (name) {
    case "search":
      return (
        <svg {...commonProps}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      );
    case "bell":
      return (
        <svg {...commonProps}>
          <path d="M6.5 16.5h11l-1.3-1.8V10a4.2 4.2 0 0 0-8.4 0v4.7Z" />
          <path d="M10 19a2.2 2.2 0 0 0 4 0" />
        </svg>
      );
    case "settings":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8.2 8.2 0 0 0-1.8-1l-.3-2.5h-4l-.3 2.5a8.2 8.2 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11A7 7 0 0 0 5 12c0 .3 0 .7.1 1l-2 1.5 2 3.4 2.4-1a8.2 8.2 0 0 0 1.8 1l.3 2.5h4l.3-2.5a8.2 8.2 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />
        </svg>
      );
    case "info":
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 10.2v5.1" />
          <path d="M12 7.7h.01" />
        </svg>
      );
    case "star":
      return (
        <svg {...commonProps} fill={filled ? "currentColor" : "none"}>
          <path d="m12 4.7 2.2 4.5 5 .7-3.6 3.5.9 4.9-4.5-2.4-4.5 2.4.9-4.9-3.6-3.5 5-.7Z" />
        </svg>
      );
    default:
      return null;
  }
}

export default async function HomePage() {
  const { games } = await getGameLibrary();
  const sourceInfo = await getSourceInfo();

  if (games.length === 0) {
    throw new Error("No installed game metadata found");
  }

  const catalog = games.map(getGameMeta);
  const featuredGame = pickFeaturedGame(catalog) || catalog[0];
  const buildStamp = `${shortCommit(sourceInfo.project.commit)} / ${shortCommit(
    sourceInfo.scummvm.commit
  )}`;

  return (
    <>
      <ProjectNoticeModal
        officialHref={scummvmOfficialSite}
        sourceHref={getVersionedScummvmAssetPath("/source.html")}
      />

      <nav className="dashboard-nav">
        <div className="nav-cluster nav-cluster-left">
          <div className="nav-brand-group">
            <a className="nav-brand" href="#browse">
              ScummVM Web
            </a>
          </div>

          <div className="nav-links" aria-label="Main">
            <a className="is-active" href="#browse">
              Browse
            </a>
            <a href="#library">Library</a>
            <a href="#archive">Archive</a>
            <a href={scummvmOfficialSite} rel="noreferrer" target="_blank">
              Original Project
            </a>
          </div>
        </div>

        <div className="nav-tools" aria-label="Actions">
          <a className="nav-icon-button" href="#library" aria-label="Browse games">
            <Icon name="search" />
          </a>
          <a className="nav-icon-button" href="#archive" aria-label="Open archive notes">
            <Icon name="bell" />
          </a>
          <a
            className="nav-icon-button"
            href={getVersionedScummvmAssetPath("/source.html")}
            aria-label="Open source offer"
          >
            <Icon name="settings" />
          </a>
          <a className="nav-avatar" href={featuredGame.href} aria-label={`Launch ${featuredGame.displayTitle}`}>
            {featuredGame.displayTitle.slice(0, 2).toUpperCase()}
          </a>
        </div>
      </nav>

      <main className="page-shell">
        <section
          className={`hero-stage ${featuredGame.tone}`}
          id="browse"
          style={getArtStyle("hero", featuredGame.heroImage)}
        >
          <div className="hero-backdrop" />
          <div className="hero-gradient" />

          <div className="hero-inner">
            <div className="hero-copy">
              <p className="hero-kicker">{featuredGame.eyebrow}</p>
              <h1>{featuredGame.displayTitle}</h1>
              <p className="hero-summary">{featuredGame.summary}</p>

              <div className="hero-actions">
                <LaunchButton href={featuredGame.href} label="Start Adventure" />
                <a className="secondary-button" href={featuredGame.infoHref}>
                  <Icon name="info" />
                  <span>Game Info</span>
                </a>
              </div>

              <dl className="hero-metadata">
                <div>
                  <dt>Studio</dt>
                  <dd>{featuredGame.studio}</dd>
                </div>
                <div>
                  <dt>Genre</dt>
                  <dd>{featuredGame.genre}</dd>
                </div>
              </dl>

              <div className="hero-status">
                <span>{formatGameCount(catalog.length)}</span>
                <span>{featuredGame.target}</span>
                <span>{featuredGame.badge}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="section-stack">
          <section className="content-band" id="library">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                Recently Played
              </h2>
            </div>

            <div className="landscape-rail">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  className={`landscape-card ${game.tone}`}
                  href={game.href}
                  style={getArtStyle("card", game.landscapeImage)}
                >
                  <div className="landscape-overlay">
                    <h3>{game.displayTitle}</h3>
                    <div className="landscape-meta">
                      <span>{game.genre}</span>
                      <span>{game.studio}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section className="content-band">
            <div className="section-header section-header-split">
              <h2>
                <span className="section-mark" />
                Installed Library
              </h2>
              <a className="section-link" href={featuredGame.href}>
                Launch Featured
              </a>
            </div>

            <div className="poster-grid">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  className={`poster-card ${game.tone}`}
                  href={game.href}
                  style={getArtStyle("poster", game.posterImage)}
                >
                  <div className="poster-media" />
                  <div className="poster-overlay">
                    <p>{game.displayTitle}</p>
                  </div>
                </a>
              ))}
            </div>
          </section>

          <section className="content-band" id="archive">
            <div className="section-header">
              <h2>
                <span className="section-mark" />
                Adventure Deck
              </h2>
            </div>

            <div className="spotlight-rail">
              {catalog.map((game) => (
                <a
                  key={game.target}
                  className={`spotlight-card ${game.tone}`}
                  href={game.href}
                  style={getArtStyle("spotlight", game.spotlightImage)}
                >
                  <div className="spotlight-media" />
                  <div className="spotlight-copy">
                    <div>
                      <span className="spotlight-kicker">{game.tag}</span>
                      <h3>{game.displayTitle}</h3>
                      <p>{game.summary}</p>
                    </div>
                    <div className="spotlight-badge">
                      <Icon name="star" filled />
                      <span>{game.badge}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <div className="footer-copy">
          <strong>ScummVM Web</strong>
          <p>
            Bundle built {sourceInfo.generated_at_utc.slice(0, 10)} from {buildStamp}. Launcher
            targets still point directly at the detected ScummVM entries in this archive.
          </p>
        </div>
      </footer>
    </>
  );
}
