const defaultSiteUrl = "https://scummweb.tsilva.eu";

function normalizeSiteUrl(siteUrl) {
  return siteUrl.replace(/\/+$/, "");
}

export function getSiteUrl() {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL || defaultSiteUrl);
}

export function getMetadataBase() {
  return new URL(`${getSiteUrl()}/`);
}
