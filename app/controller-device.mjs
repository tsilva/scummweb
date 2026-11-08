const tvDevice = /android tv|google tv|smart[ -]?tv|hbbtv|tizen|webos/i;
let tvModel = false;

export function isKnownTvBrowser(navigator) {
  return tvModel || tvDevice.test(navigator.userAgent);
}

export async function isTvBrowser(navigator) {
  if (isKnownTvBrowser(navigator)) return true;
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues(["model"]);
    tvModel = tvDevice.test(hints?.model ?? "");
    return tvModel;
  } catch {
    return false;
  }
}
