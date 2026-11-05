// Engine options override these application defaults when explicitly saved.
export function applyGameDefaults(iniText) {
  const defaults = ["originalsaveload", "original_gui", "original_menus"];
  const newline = iniText.includes("\r\n") ? "\r\n" : "\n";
  const sections = iniText.split(/^(?=\[)/m);
  const index = sections.findIndex((section) => section.split(/\r?\n/, 1)[0].trim() === "[scummvm]");
  if (index < 0) {
    return `[scummvm]${newline}${defaults.map((key) => `${key}=true`).join(newline)}${newline}${newline}${iniText}`;
  }

  const section = sections[index];
  const missing = defaults.filter((key) => !new RegExp(`^\\s*${key}\\s*=`, "m").test(section));
  if (!missing.length) return iniText;
  const headerEnd = section.indexOf("\n") + 1 || section.length;
  sections[index] = section.slice(0, headerEnd)
    + (section[headerEnd - 1] === "\n" ? "" : newline)
    + missing.map((key) => `${key}=true${newline}`).join("")
    + section.slice(headerEnd);
  return sections.join("");
}
