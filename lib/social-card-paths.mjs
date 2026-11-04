import manifest from "../data/social-cards.json" with { type: "json" };

export function getGameSocialCardPath(game) {
  const slug = game.slug || game.href?.replace(/^\//, "");
  const card = Object.hasOwn(manifest.cards, slug) ? manifest.cards[slug] : null;
  if (!card) {
    throw new Error(`Missing social card for ${slug}; run pnpm generate:social-cards`);
  }
  return `/social-cards/${card.file}`;
}
