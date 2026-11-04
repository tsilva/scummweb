import compatibility from "../../data/game-compatibility.json";
import { buildCompatibilityPageEntries } from "../../lib/game-compatibility.mjs";
import { SCUMMVM_OFFICIAL_SITE_URL } from "../../lib/site-config.mjs";
import { buildAbsoluteUrl, buildHomeMetadata } from "../../lib/seo.mjs";
import { getRecognizedGameLibrary, getVersionedSiteAssetPath } from "../game-library";
import { getHomeShellData } from "../game-page-data";
import HomeShell from "../home-shell";
import CompatibilityView from "./compatibility-view";

export const dynamic = "force-static";

const title = "Game Compatibility & Supported Games | ScummWEB";
const description = "Browse recognized games, check tested editions and known limitations, and find game pages for browser play with ScummWEB.";
const canonical = buildAbsoluteUrl("/compatibility");
const baseMetadata = buildHomeMetadata();

export const metadata = {
  ...baseMetadata,
  title,
  description,
  alternates: { canonical },
  openGraph: { ...baseMetadata.openGraph, title, description, url: canonical },
  twitter: { ...baseMetadata.twitter, title, description },
};

export default function CompatibilityPage() {
  const entries = buildCompatibilityPageEntries(compatibility.entries, getRecognizedGameLibrary());
  const { scummvmVersion, sourceInfoDate } = getHomeShellData();

  return <HomeShell pageMode="compatibility" logoSrc={getVersionedSiteAssetPath("/logo-nav.png")}
    scummvmVersion={scummvmVersion} sourceInfoDate={sourceInfoDate} scummvmOfficialSite={SCUMMVM_OFFICIAL_SITE_URL}>
    <section className="compatibility-page" aria-labelledby="compatibility-page-title">
      <CompatibilityView entries={entries} recordedOn={compatibility.recordedOn}
        upstreamReference={compatibility.upstreamReference} standalone />
    </section>
  </HomeShell>;
}
