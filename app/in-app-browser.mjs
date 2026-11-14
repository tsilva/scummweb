// Identify explicit app signatures; missing Safari alone is not evidence of a webview.
export function isInAppBrowser(userAgent = "") {
  return /\b(?:FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Pinterest|MicroMessenger|TikTok|BytedanceWebview)\b|\bmusical_ly(?:\b|_)|\bLine\/|;\s*wv\)/i.test(userAgent);
}

export function externalBrowserHref(href, userAgent = "") {
  if (!/Android/i.test(userAgent)) return null;
  try {
    const url = new URL(href);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    // An implicit browser intent respects the installed browser choice. No app-store fallback.
    return `intent:${url.href.slice(url.protocol.length)}#Intent;scheme=${url.protocol.slice(0, -1)};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(url.href)};end`;
  } catch {
    return null;
  }
}
