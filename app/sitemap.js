import { getGameLibrary } from "./game-library";
import { getSiteUrl } from "./site-config";

export default async function sitemap() {
  const siteUrl = getSiteUrl();
  const { games } = await getGameLibrary();

  return [
    {
      url: `${siteUrl}/`,
      changeFrequency: "daily",
      priority: 1,
    },
    ...games.map((game) => ({
      url: `${siteUrl}${game.href}`,
      changeFrequency: "weekly",
      priority: 0.8,
    })),
  ];
}
