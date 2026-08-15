import {
  contentType,
  renderGameSocialCard,
  size,
} from "./social-card-image";

export { contentType, size };
export const dynamic = "force-dynamic";

export default async function OpenGraphImage({ params }) {
  const { gameSlug } = await params;
  return renderGameSocialCard(gameSlug);
}
