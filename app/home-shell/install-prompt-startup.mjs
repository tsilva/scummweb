// The browser may offer installation before the home page hydrates.
export const installPromptStartup = `
window.addEventListener("beforeinstallprompt", (event) => {
  window.scummwebInstallPrompt = event;
});
window.addEventListener("appinstalled", () => {
  window.scummwebInstallPrompt = null;
});
`;
