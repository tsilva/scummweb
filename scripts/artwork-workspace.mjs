export function resolveArtworkWorkspace(name = process.env.SCUMMWEB_ARTWORK_WORKSPACE || "artwork-migration") {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error("Invalid artwork workspace name");
  return `.internal/evidence/${name}`;
}
