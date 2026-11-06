const platformNames = { pc: "DOS", dos: "DOS", amiga: "Amiga", windows: "Windows", macintosh: "Macintosh", atarist: "Atari ST" };

export function getVersionMetadata(game, name = "") {
  const labels = [...(name || game.title || "").matchAll(/\(([^()]*)\)/g)].map(([, label]) => label).join(" ");
  const platform = [
    ["Atari ST", /\batari\s*st\b/i], ["Amiga", /\bamiga\b/i],
    ["Windows", /\bwindows?\b/i], ["Macintosh", /\bmac(?:intosh)?\b/i], ["DOS", /\bdos\b/i],
  ].find(([, pattern]) => pattern.test(labels))?.[0]
    || platformNames[game.platform?.toLowerCase()] || game.platform;
  const language = /multi[ -]?(?:language|lingual)/i.test(labels) ? "Multilingual"
    : [["English", /\b(?:english|en)\b/i], ["German", /\b(?:german|de)\b/i],
      ["French", /\b(?:french|fr)\b/i], ["Spanish", /\b(?:spanish|es)\b/i],
      ["Italian", /\b(?:italian|it)\b/i], ["Portuguese", /\b(?:portuguese|pt)\b/i],
      ["Polish", /\b(?:polish|pl)\b/i], ["Russian", /\b(?:russian|ru)\b/i],
      ["Dutch", /\b(?:dutch|nl)\b/i], ["Japanese", /\b(?:japanese|ja)\b/i]]
      .find(([, pattern]) => pattern.test(labels))?.[0] || game.language;
  const editions = ["CD", "Floppy", "VGA", "EGA", "Talkie", "Remastered"]
    .filter((edition) => new RegExp(`\\b${edition}\\b`, "i").test(labels));
  editions.push(...labels.match(/\bv\d+(?:\.\d+)*\b/gi) || []);
  return { platform, language, edition: editions.join(" / ") || game.edition || game.extra || undefined };
}

export function getGameFamilyKey(game) {
  const identity = game.familyId || (game.engineId && (game.gameId || game.target)
    ? `${game.engineId}:${game.gameId || game.target}` : null);
  if (!identity) return null;
  const demo = /\(Demo\)$/i.test(game.displayTitle) || /\bdemo\b/i.test(game.extra || "");
  return `${identity}:${demo ? "demo" : "full"}`;
}

export function groupGameVersions(items) {
  const groups = new Map();
  for (const item of items) {
    const key = getGameFamilyKey(item.game) || item.key;
    const metadata = getVersionMetadata(item.game, item.source?.name);
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
    const labels = group.versions.map(({ game }, index) => [
      game.platform, game.language, game.edition,
    ].filter(Boolean).join(" · ") || `Version ${index + 1}`);
    group.versions = group.versions.map((version, index) => ({ ...version,
      label: labels.filter((label) => label === labels[index]).length > 1
        ? `${labels[index]} · ${version.source?.name || index + 1} (${index + 1})` : labels[index],
    }));
  }
  return [...groups.values()];
}

export function chooseGameVersion(versions, remembered, language = "") {
  const available = versions.filter(({ source, status }) => !source || ["available", "session"].includes(status));
  const choices = available.length ? available : versions;
  return choices.find(({ key }) => key === remembered)
    || choices.find(({ source, game }) => !source && !game.importRequired)
    || choices.find(({ game }) => game.language?.toLowerCase() === language.toLowerCase())
    || choices[0];
}

export function readChosenVersion(groupKey) {
  try { return window.localStorage.getItem(`scummweb.version:${groupKey}`); } catch { return null; }
}

export function rememberGameVersion(groupKey, versionKey) {
  try { window.localStorage.setItem(`scummweb.version:${groupKey}`, versionKey); } catch { /* Play works without preferences. */ }
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
