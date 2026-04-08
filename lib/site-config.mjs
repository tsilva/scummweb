export const DEFAULT_SITE_URL = "https://scummweb.tsilva.eu";
export const DEFAULT_GAMES_ORIGIN = "https://scummvm-games.tsilva.eu";
export const SCUMMVM_OFFICIAL_SITE_URL = "https://www.scummvm.org/";
export const GOOGLE_ANALYTICS_ID = "G-60XHS2QKX7";

export function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function getSiteUrl(env = process.env) {
  return normalizeBaseUrl(env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL);
}

export function getMetadataBase(env = process.env) {
  return new URL(`${getSiteUrl(env)}/`);
}

export function getGamesOrigin(env = process.env) {
  return normalizeBaseUrl(env.SCUMMVM_GAMES_ORIGIN || DEFAULT_GAMES_ORIGIN);
}
