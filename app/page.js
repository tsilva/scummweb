import {
  getVersionedSiteAssetPath,
} from "./game-library";
import { getHomeShellData } from "./game-page-data";
import HomeShell from "./home-shell";

const scummvmOfficialSite = "https://www.scummvm.org/";
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const shellData = await getHomeShellData({
    randomize: true,
  });

  if (!shellData) {
    throw new Error("Unable to resolve homepage shell data");
  }

  return (
    <HomeShell
      catalog={shellData.catalog}
      featuredGame={shellData.featuredGame}
      logoSrc={getVersionedSiteAssetPath("/logo.svg")}
      scummvmVersion={shellData.scummvmVersion}
      scummvmOfficialSite={scummvmOfficialSite}
      sourceInfoDate={shellData.sourceInfoDate}
    />
  );
}
