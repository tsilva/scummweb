import { getGamePresentation, getImportedGamePresentation } from "./game-presentation.js";

// Distinctive data-file groups identify a title, not its language or edition.
// Keep generic names (resource.map, 00.lfl, vol.cat, etc.) out of these rules.
const fileGroups = [
  ["Beneath a Steel Sky", ["sky.dnr", "sky.dsk"]],
  ["Day of the Tentacle", ["tentacle.000", "tentacle.001"]],
  ["Indiana Jones and the Fate of Atlantis", ["atlantis.000", "atlantis.001"]],
  ["Monkey Island 2: LeChuck's Revenge", ["monkey2.000", "monkey2.001"]],
  ["Sam & Max Hit the Road", ["samnmax.000", "samnmax.001"]],
];

// Shared SCUMM filenames need size AND CRC-32 matches from known game data.
// These are ZIP directory signatures, not proof that ScummVM can run the game.
const signatures = [
  {
    title: "Drascula: The Vampire Strikes Back",
    files: [["packet.001", 32847563, 1048178371]],
  },
  {
    title: "Lure of the Temptress",
    files: [["disk1.vga", 618944, 893859565], ["disk2.vga", 659616, 4000140536]],
  },
  {
    title: "Flight of the Amazon Queen",
    files: [["queen.1", 190787021, 501481959]],
  },
  {
    title: "Nippon Safes, Inc.",
    files: [["disk0", 208437, 4075295742], ["disk1", 901120, 3732423185]],
  },
  {
    title: "The Secret of Monkey Island (Demo)", target: "monkey-demo", engineId: "scumm", gameId: "monkey",
    files: [["000.lfl", 7607, 0x719585d5], ["disk01.lec", 266281, 0x2afb1b41]],
  },
  {
    title: "Indiana Jones and the Last Crusade",
    files: [["00.lfl", 5361, 0x1145ddda], ["01.lfl", 43865, 0x373099bb]],
  },
];

export function getArchiveGamePresentation(files) {
  const directories = new Map();
  for (const [path, size, crc] of files) {
    const normalized = path.replaceAll("\\", "/").toLowerCase();
    const separator = normalized.lastIndexOf("/");
    const directory = normalized.slice(0, separator + 1);
    if (!directories.has(directory)) directories.set(directory, new Map());
    directories.get(directory).set(normalized.slice(separator + 1), [size, crc]);
  }

  const matches = new Map();
  for (const entries of directories.values()) {
    for (const [title, names] of fileGroups) {
      if (names.every((name) => entries.get(name)?.[0] > 0)) matches.set(title, { title });
    }
    for (const signature of signatures) {
      if (signature.files.every(([name, size, crc]) => {
        const entry = entries.get(name);
        return entry?.[0] === size && entry[1] === crc;
      })) matches.set(signature.title, signature);
    }
  }
  // Do not choose an arbitrary title from an archive containing multiple games.
  if (matches.size !== 1) return null;
  const [match] = matches.values();
  const game = match.target ? getGamePresentation({
    target: match.target, engineId: match.engineId, gameId: match.gameId, displayTitle: match.title,
  }) : getImportedGamePresentation(`${match.title}.zip`);
  return game ? { ...game, badge: "Remote game" } : null;
}
