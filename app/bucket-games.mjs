import { getVersionedSiteAssetPath } from "./asset-paths.js";

const monkeyDemoCover = getVersionedSiteAssetPath("/launcher/monkey-demo-cover.webp");
const monkeyDemoHero = getVersionedSiteAssetPath("/launcher/monkey-demo-hero.webp");

export const bucketOnlyGames = [
  {
    target: "monkey-demo",
    title: "The Secret of Monkey Island (Demo)",
    displayTitle: "The Secret of Monkey Island (Demo)",
    edition: "DOS EGA demo",
    year: "1990",
    studio: "Lucasfilm Games",
    genre: "Point-and-click adventure",
    badge: "English DOS EGA demo",
    eyebrow: "Lucasfilm Games Demo",
    summary:
      "As aspiring pirate Guybrush Threepwood, explore Mêlée Island, question the locals, and find the magic phrase that will get you past a troll. This playable EGA demo remixes scenes and characters from the full adventure into a short story of its own.",
    tag: "Playable Demo",
    tone: "tone-default",
    heroImage: monkeyDemoHero,
    heroImagePosition: "center 64%",
    landscapeImage: monkeyDemoHero,
    posterImage: monkeyDemoCover,
    spotlightImage: monkeyDemoCover,
    screenshots: [
      "/launcher/monkey-demo-shot-1.png",
      "/launcher/monkey-demo-shot-2.png",
      "/launcher/monkey-demo-shot-3.png",
    ].map(getVersionedSiteAssetPath),
  },
];

export function getBucketPlayHref(target) {
  return `/bucket/${encodeURIComponent(target)}/play`;
}
