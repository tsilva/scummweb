const tvDevice = /android tv|google tv|smart[ -]?tv|hbbtv|tizen|webos/i;

export async function isTvBrowser(navigator) {
  if (tvDevice.test(navigator.userAgent)) return true;
  try {
    const hints = await navigator.userAgentData?.getHighEntropyValues(["model"]);
    return tvDevice.test(hints?.model ?? "");
  } catch {
    return false;
  }
}
