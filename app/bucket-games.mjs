export const bucketOnlyGames = [
  {
    target: "monkey-demo",
    title: "The Secret of Monkey Island (DOS EGA Demo)",
    displayTitle: "The Secret of Monkey Island Demo",
    edition: "DOS EGA demo",
    year: "1990",
    studio: "Lucasfilm Games",
    genre: "Point-and-click adventure",
    badge: "English DOS EGA demo",
    eyebrow: "Game bucket",
    summary: "Join Guybrush Threepwood as he sets out to become a pirate on Mêlée Island.",
    tag: "From your bucket",
    tone: "tone-default",
    screenshots: [],
  },
];

export function getBucketPlayHref(target) {
  return `/bucket/${encodeURIComponent(target)}/play`;
}
