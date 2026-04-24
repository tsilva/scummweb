import {
  contentType,
  renderGameSocialCard,
} from "../social-card-image";

export const dynamic = "force-dynamic";

export function GET(_request, { params }) {
  return renderGameSocialCard(params.gameSlug);
}

export function HEAD() {
  return new Response(null, {
    headers: {
      "content-type": contentType,
    },
  });
}
