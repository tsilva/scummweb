const platformNames = { pc: "DOS", dos: "DOS", amiga: "Amiga", windows: "Windows", win: "Windows",
  mac: "Macintosh", macintosh: "Macintosh", atarist: "Atari ST", apple2: "Apple II", linux: "Linux" };
const languageNames = { en: "English", de: "German", fr: "French", es: "Spanish", it: "Italian",
  pt: "Portuguese", pl: "Polish", ru: "Russian", nl: "Dutch", ja: "Japanese" };

function knownValue(value) {
  if (typeof value !== "string") return;
  const text = value.trim();
  return text && !/^(?:unknown|unspecified|undefined|n\/?a|none|und|unk|-|latest(?: version)?)$/i.test(text) ? text : undefined;
}

function readPlatform(text) {
  return [["Atari ST", /\batari\s*st\b/i], ["Apple II", /\bapple\s*(?:ii|2)\b/i],
    ["Amiga", /\bamiga\b/i], ["Windows", /\bwindows?\b/i], ["Linux", /\blinux\b/i],
    ["Macintosh", /\bmac(?:intosh)?\b/i], ["DOS", /\bdos\b/i]]
    .filter(([, pattern]) => pattern.test(text)).map(([name]) => name).join(" / ") || undefined;
}

function readLanguage(text) {
  if (/multi[ -]?(?:language|lingual)/i.test(text)) return "Multilingual";
  return Object.entries(languageNames).find(([code, name]) =>
    new RegExp(`\\b(?:${name}|${code})\\b`, "i").test(text))?.[1];
}

function readMedia(text) {
  const media = text.match(/(?:^|[^.\w])(?:(\d+)\s*)?(CD|DVD|Floppy|Blu-ray)\b/i);
  if (!media) return;
  const name = { cd: "CD", dvd: "DVD", floppy: "Floppy", "blu-ray": "Blu-ray" }[media[2].toLowerCase()];
  return `${media[1] || ""}${name}`;
}

function readGraphics(text) {
  return ["SVGA", "VGA", "EGA", "CGA", "Hercules", "High Res", "Low Res"]
    .find((value) => new RegExp(`\\b${value.replace(" ", "[ -]?")}\\b`, "i").test(text));
}

function readRevision(text) {
  return text.match(/\bv\d+(?:\.\d+)*[a-z]?(?:[-+][a-z0-9.]+)?\b/i)?.[0].replace(/^v/i, "v");
}

function getSkyCdRevision(game, files) {
  if ((game.familyId || `${game.engineId}:${game.gameId || game.target}`) !== "sky:sky") return;
  // ScummVM's engines/sky/detection.cpp identifies these CD revisions by
  // index entry count and data size. sky.dnr has a 4-byte header + 8 bytes/entry.
  const signatures = [
    [5099 * 8 + 4, 72429382, "v0.0368"],
    [5097 * 8 + 4, 72395713, "v0.0372"],
    [5097 * 8 + 4, 73123264, "v0.0372"],
  ];
  const entries = new Map(files.map(([path, size]) => [path.replaceAll("\\", "/").toLowerCase(), size]));
  const indexes = [...entries].filter(([path]) => /(?:^|\/)sky\.dnr$/.test(path));
  if (indexes.length !== 1) return;
  const [indexPath, indexSize] = indexes[0];
  const dataSize = entries.get(indexPath.replace(/sky\.dnr$/, "sky.dsk"));
  return signatures.find(([dnr, dsk]) => dnr === indexSize && dsk === dataSize)?.[2];
}

export function getVersionMetadata(game, name = "", archiveFiles = []) {
  // Only parenthesized title/filename metadata is parsed: title words are not
  // evidence of a language or edition. Legacy edition/extra fields are fallbacks.
  const labels = [...(name || game.title || "").matchAll(/\(([^()]*)\)/g)].map(([, label]) => label).join(" ");
  const fallback = [knownValue(game.edition), knownValue(game.extra)].filter(Boolean).join(" ");
  const rawPlatform = knownValue(game.platform);
  const rawLanguage = knownValue(game.language);
  const rawRevision = knownValue(game.revision);
  const revision = getSkyCdRevision(game, archiveFiles || []);
  return {
    language: readLanguage(labels) || (rawLanguage && (languageNames[rawLanguage.toLowerCase()]
      || readLanguage(rawLanguage) || rawLanguage)) || readLanguage(fallback),
    platform: revision ? "DOS" : readPlatform(labels)
      || (rawPlatform && (platformNames[rawPlatform.toLowerCase()] || readPlatform(rawPlatform) || rawPlatform))
      || readPlatform(fallback),
    media: revision ? "CD" : readMedia(knownValue(game.media) || "") || readMedia(labels) || readMedia(fallback),
    graphics: readGraphics(knownValue(game.graphics) || "") || readGraphics(labels) || readGraphics(fallback),
    revision: revision || (rawRevision && readRevision(/^\d/.test(rawRevision) ? `v${rawRevision}` : rawRevision))
      || readRevision(labels) || readRevision(fallback),
  };
}

export function formatVersionLabel(game, { showGraphics = false, showRevision = true } = {}) {
  return [game.language, game.platform, game.media, showGraphics && game.graphics, showRevision && game.revision]
    .map(knownValue).filter(Boolean).join(" · ");
}

export function isDemoGame(game) {
  return /\(Demo\)$/i.test(game.displayTitle) || /\bdemo\b/i.test(game.extra || "");
}

export function getGameFamilyKey(game) {
  const identity = game.familyId || (game.engineId && (game.gameId || game.target)
    ? `${game.engineId}:${game.gameId || game.target}` : null);
  if (!identity) return null;
  return `${identity}:${isDemoGame(game) ? "demo" : "full"}`;
}

export function catalogGameEntries(catalog) {
  return catalog.map((game) => ({ key: `catalog:${game.target}`, game, title: game.displayTitle }));
}

export function groupGameVersions(items) {
  const groups = new Map();
  for (const item of items) {
    const key = getGameFamilyKey(item.game) || item.key;
    const metadata = getVersionMetadata(item.game, item.source?.name, item.archiveFiles ?? item.source?.archiveFiles);
    const version = { ...item, game: { ...item.game, ...metadata } };
    let group = groups.get(key);
    if (!group) {
      group = { ...item, key, versions: [], dialogId: item.source
        ? `library-${encodeURIComponent(key)}` : `game-${item.game.slug || item.game.target}` };
      groups.set(key, group);
    }
    group.versions.push(version);
  }
  for (const group of groups.values()) {
    // Compare graphics within a platform; an Amiga/DOS choice needs no VGA tag.
    const graphicsByPlatform = new Map();
    for (const { game } of group.versions) {
      if (!game.graphics) continue;
      if (!graphicsByPlatform.has(game.platform)) graphicsByPlatform.set(game.platform, new Set());
      graphicsByPlatform.get(game.platform).add(game.graphics);
    }
    const labels = group.versions.map(({ game }) => formatVersionLabel(game, {
      showGraphics: graphicsByPlatform.get(game.platform)?.size > 1,
    }));
    group.versions = group.versions.map((version, index) => {
      const label = labels[index];
      const copy = labels.slice(0, index + 1).filter((value) => value === label).length;
      return { ...version,
        game: { ...version.game, ...(!version.game.importRequired && {
          badge: label || null, mobileBadge: label || null,
        }) },
        label: !label ? `Version ${index + 1}` : labels.filter((value) => value === label).length > 1
          ? `${label} · Copy ${copy}` : label,
      };
    });
  }
  return [...groups.values()];
}

export function chooseGameVersion(versions, remembered, language = "") {
  const available = versions.filter(({ source, status }) => !source || ["available", "session"].includes(status));
  const choices = available.length ? available : versions;
  const selected = choices.find(({ key }) => key === remembered);
  if (selected) return selected;
  const revisions = choices.filter(({ game }) => game.revision);
  const compare = (a, b) => a.game.revision.localeCompare(b.game.revision, "en", { numeric: true, sensitivity: "base" });
  const latest = revisions.reduce((best, version) => !best || compare(version, best) > 0 ? version : best, null);
  const defaults = latest ? revisions.filter((version) => compare(version, latest) === 0) : choices;
  return defaults.find(({ source, game }) => !source && !game.importRequired)
    || defaults.find(({ game }) => game.language?.toLowerCase() === language.toLowerCase())
    || defaults[0];
}

export function readChosenVersion(groupKey) {
  try { return window.localStorage.getItem(`scummweb.version:${groupKey}`); } catch { return null; }
}

export function readPreferredGameVersion(versions, groupKey) {
  const language = new Intl.DisplayNames(["en"], { type: "language" }).of(navigator.language.split("-")[0]);
  return chooseGameVersion(versions, readChosenVersion(groupKey), language);
}

export const chosenGameVersionUpdatedEvent = "scummweb:game-version-updated";

export function rememberGameVersion(groupKey, versionKey) {
  try {
    if (readChosenVersion(groupKey) === versionKey) return;
    window.localStorage.setItem(`scummweb.version:${groupKey}`, versionKey);
    window.dispatchEvent(new Event(chosenGameVersionUpdatedEvent));
  } catch { /* Play works without preferences. */ }
}

const saveNamespaces = new Map();
const namespacePrefix = "scummweb.save-namespace.v1:";

export function readVersionSaveNamespace(versionId) {
  if (saveNamespaces.has(versionId)) return saveNamespaces.get(versionId);
  try {
    const namespace = window.localStorage.getItem(namespacePrefix + versionId);
    if (/^version-[a-f0-9]{64}$/.test(namespace)) return namespace;
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export async function getVersionSaveNamespace(versionId) {
  const cached = readVersionSaveNamespace(versionId);
  if (cached) return cached;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(versionId));
  const namespace = "version-" + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  saveNamespaces.set(versionId, namespace);
  try { window.localStorage.setItem(namespacePrefix + versionId, namespace); } catch { /* Optional lookup cache. */ }
  return namespace;
}
