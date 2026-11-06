import { readCachedSave } from "../browser-save-cache.mjs";
import { supportsContinue } from "../../web-shell/continue-saves.mjs";
import runtime from "../../scummvm-shell/runtime-version.json" with { type: "json" };

export function initialActionState(group, version, versions, runtimeVersion = runtime.version) {
  const { game } = version;
  const identity = Object.fromEntries(["target", "engineId", "gameId", "extra", "saveVersionId", "saveNamespace", "nativeTarget"]
    .filter(key => game[key] !== undefined).map(key => [key, game[key]]));
  let canContinue = !game.engineId || supportsContinue(game.engineId, game.gameId || game.target, game.extra);
  let nativeIdentity;
  let preference;
  try { preference = window.localStorage.getItem(`scummweb.version:${group}`); } catch {}
  if (version.source) {
    try {
      const namespace = game.saveNamespace || window.localStorage.getItem(`scummweb.save-namespace.v1:${game.saveVersionId}`);
      const save = readCachedSave(game, window.localStorage, namespace);
      if (save) {
        nativeIdentity = [save.engineId, save.gameId, save.extra || ""];
        canContinue = canContinue && supportsContinue(...nativeIdentity);
      }
    } catch {}
  }
  return { schema: 1, group, version: version.key, preference, runtimeVersion, game: identity,
    playHref: game.playHref, infoHref: game.infoHref,
    source: Boolean(version.source), unavailable: !version.source && Boolean(game.importRequired),
    canContinue, nativeIdentity,
    access: Boolean(version.action?.needsAccess), locate: Boolean(version.locate),
    versions: versions.map(({ key, label }) => ({ key, label })) };
}

export function rememberInitialActions(state) {
  try { window.localStorage.setItem(`scummweb.hero-actions.v1:${state.group}`, JSON.stringify(state)); } catch {}
}

// This subtree is opaque to React: the head script can fill it before paint,
// then React removes it when the real, fully restored controls take over.
export const initialActionsMarkup = "";

export function prepareInitialActions(container, readSave) {
  try {
    const storage = window.localStorage;
    let state = JSON.parse(container.dataset.initialActions);
    const remembered = storage.getItem(`scummweb.version:${state.group}`);
    if (remembered && remembered !== state.version) {
      const cached = JSON.parse(storage.getItem(`scummweb.hero-actions.v1:${state.group}`));
      if (cached?.schema !== 1 || cached.group !== state.group
        || (cached.version !== remembered && cached.preference !== remembered)
        || cached.runtimeVersion !== state.runtimeVersion) return;
      state = cached;
    }
    if (typeof state.playHref !== "string" || !state.playHref.startsWith("/")
      || new URL(state.playHref, window.location.origin).origin !== window.location.origin) return;
    const namespace = state.game.saveVersionId
      ? state.game.saveNamespace || storage.getItem(`scummweb.save-namespace.v1:${state.game.saveVersionId}`) : "";
    if (namespace && !/^version-[a-f0-9]{64}$/.test(namespace)) return;
    const save = state.canContinue && !state.unavailable && !state.access && !state.locate
      ? readSave(state.game, storage, namespace) : null;
    if (save && state.source && (!state.game.engineId || state.nativeIdentity)
      && JSON.stringify(state.nativeIdentity) !== JSON.stringify([save.engineId, save.gameId, save.extra || ""])) return;
    const href = state.playHref + (state.playHref.includes("?") ? "&" : "?") + "launch_from=" + container.dataset.entryPoint;
    // Copy the server's actual controls so layout changes have one source of
    // truth. Only this opaque subtree changes before React takes over.
    container.innerHTML = container.parentElement.querySelector('.hero-actions[data-ready="false"]').innerHTML;
    const primary = container.querySelector(".launch-button");
    primary.classList.toggle("game-unavailable", state.unavailable);
    primary.textContent = state.unavailable ? "Game not included" : state.locate ? "Locate ZIP"
      : state.access ? "Allow file access" : save ? "Continue" : "Play";
    if (!state.unavailable && !state.source) primary.href = href + (save ? "#continue" : "");
    else if (state.source) { primary.setAttribute("role", "button"); primary.setAttribute("aria-disabled", "true"); }
    else { primary.setAttribute("aria-disabled", "true"); primary.classList.add("game-unavailable"); }
    let restart = container.querySelector(".start-fresh-button");
    if (!restart) {
      restart = document.createElement("a");
      restart.className = "secondary-button start-fresh-button";
      restart.textContent = "Start from beginning";
      primary.after(restart);
    }
    restart.href = href;
    restart.hidden = !save;
    if (state.source) { restart.removeAttribute("href"); restart.setAttribute("aria-disabled", "true"); }
    const license = container.querySelector(".hero-license");
    const licenseUrl = state.infoHref && new URL(state.infoHref, window.location.origin);
    if (license) {
      license.hidden = !licenseUrl || !["http:", "https:"].includes(licenseUrl.protocol);
      if (!license.hidden) { license.href = licenseUrl.href; license.target = "_blank"; license.rel = "noreferrer"; }
    }
    const chooser = container.querySelector(".hero-version-control");
    if (Array.isArray(state.versions) && state.versions.length > 1) {
      chooser.removeAttribute("data-reserved");
      chooser.removeAttribute("aria-hidden");
      chooser.innerHTML = '<label class="library-select"><select aria-label="Game version" disabled></select><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg></label>';
      for (const version of state.versions) {
        const option = document.createElement("option");
        option.value = version.key; option.textContent = version.label || "Included version";
        option.selected = version.key === state.version;
        chooser.querySelector("select").append(option);
      }
    }
    container.dataset.prepared = "true";
  } catch { /* Unknown or inaccessible browser data retains the safe fallback. */ }
}

export const initialActionsScript = `(() => {
  const readSave = ${readCachedSave.toString()};
  const prepare = ${prepareInitialActions.toString()};
  const observer = new MutationObserver(() => {
    const container = document.querySelector('[data-initial-actions]');
    if (!container?.parentElement.querySelector('.hero-actions[data-ready="false"]')?.nextElementSibling) return;
    prepare(container, readSave);
    observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', () => observer.disconnect(), { once: true });
})();`;
