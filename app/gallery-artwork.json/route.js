import { artworkDelivery } from "../../lib/artwork-storage.mjs";
import { getHomeShellData } from "../game-page-data";

export const dynamic = "force-static";

export function GET() {
  const { catalog } = getHomeShellData();
  return Response.json(artworkDelivery(catalog.map(({ screenshots }) => ({ screenshots }))));
}
