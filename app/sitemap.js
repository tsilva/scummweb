import { getRecognizedGameLibrary } from "./game-library";
import { getSiteUrl } from "./site-config";

export default async function sitemap() {
  const siteUrl = getSiteUrl();
  const games = getRecognizedGameLibrary();

  return [
    {
      url: `${siteUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/compatibility`,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...games.map((game) => ({
      url: `${siteUrl}${game.href}`,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ];
}
