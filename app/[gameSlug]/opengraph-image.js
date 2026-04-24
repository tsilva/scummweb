import {
  contentType,
  renderGameSocialCard,
  size,
} from "./social-card-image";

export { contentType, size };
export const dynamic = "force-dynamic";

export default function OpenGraphImage({ params }) {
  return renderGameSocialCard(params.gameSlug);
}
