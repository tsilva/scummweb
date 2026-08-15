import {
  contentType,
  renderGameSocialCard,
} from "../social-card-image";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  const { gameSlug } = await params;
  return renderGameSocialCard(gameSlug);
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "content-type": contentType,
    },
  });
}
