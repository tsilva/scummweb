export function applyGameDefaults(iniText, { useMasterVolume = false } = {}) {
  // Keep explicit choices for original screens and menus.
  const defaults = { originalsaveload: "true", original_gui: "true", original_menus: "true" };
  if (useMasterVolume) {
    const audio = { music_volume: "255", sfx_volume: "255", mute: "false", music_mute: "false", sfx_mute: "false" };
    // Per-game options override [scummvm], so fix existing overrides as well.
    iniText = iniText.replace(/^[ \t]*(music_volume|sfx_volume|mute|music_mute|sfx_mute|music_driver)[ \t]*=([^\r\n]*)/gim,
      (line, key, value) => {
        const option = key.toLowerCase();
        if (option === "music_driver") return value.trim().toLowerCase() === "null" ? "music_driver=auto" : line;
        return `${option}=${audio[option]}`;
      });
    Object.assign(defaults, audio);
  }

  const newline = iniText.includes("\r\n") ? "\r\n" : "\n";
  const sections = iniText.split(/^(?=\[)/m);
  const index = sections.findIndex((section) => section.split(/\r?\n/, 1)[0].trim() === "[scummvm]");
  const entries = Object.entries(defaults);
  const format = ([key, value]) => `${key}=${value}${newline}`;
  if (index < 0) {
    return `[scummvm]${newline}${entries.map(format).join("")}${newline}${iniText}`;
  }

  const section = sections[index];
  const missing = entries.filter(([key]) => !new RegExp(`^[ \t]*${key}[ \t]*=`, "mi").test(section));
  if (!missing.length) return iniText;
  const headerEnd = section.indexOf("\n") + 1 || section.length;
  sections[index] = section.slice(0, headerEnd)
    + (section[headerEnd - 1] === "\n" ? "" : newline)
    + missing.map(format).join("")
    + section.slice(headerEnd);
  return sections.join("");
}
