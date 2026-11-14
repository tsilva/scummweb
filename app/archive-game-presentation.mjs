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
    title: "Freddi Fish and the Case of the Missing Kelp Seeds (Demo)", target: "freddi-demo", engineId: "scumm", gameId: "freddi",
    files: [["freddemo.he0", 9779, 2319558390], ["freddemo.he1", 6141457, 1951420878]],
  },
  {
    title: "Putt-Putt Joins the Parade (Demo)", target: "puttputt-demo", engineId: "scumm", gameId: "puttputt",
    files: [["puttdemo.he0", 8269, 921152807], ["puttdemo.he1", 826701, 2065697123]],
  },
  {
    title: "Technobabylon (Demo)", target: "technobabylon-demo", engineId: "ags", gameId: "technobabylon",
    files: [["technobabylon.exe", 595787927, 1286211410], ["speech.vox", 54621204, 1148941554]],
  },
  {
    title: "Primordia (Demo)", target: "primordia-demo", engineId: "ags", gameId: "primordia",
    files: [["primordia.exe", 727898212, 584883832], ["speech.vox", 212231939, 2479583785]],
  },
  {
    title: "Gemini Rue (Demo)", target: "geminirue-demo", engineId: "ags", gameId: "geminirue",
    files: [["gemini rue demo.exe", 61839853, 1256240307], ["speech.vox", 103642847, 1984807282]],
  },
  {
    title: "Myst (Demo)", target: "myst-demo", engineId: "mohawk", gameId: "myst",
    files: [["demo.dat", 488921, 3831070402], ["slides.dat", 9483618, 1854365890]],
  },
  {
    title: "Space Quest 6: Roger Wilco in the Spinal Frontier (Demo)", target: "sq6-demo", engineId: "sci", gameId: "sq6",
    files: [["resource.map", 2572, 1622953036], ["resource.000", 2272050, 3325270940]],
  },
  {
    title: "Freddy Pharkas: Frontier Pharmacist (Demo)", target: "freddypharkas-demo", engineId: "sci", gameId: "freddypharkas",
    files: [["resource.map", 1918, 1006686103], ["resource.000", 957382, 1863300513]],
  },
  {
    title: "Gabriel Knight: Sins of the Fathers (Demo)", target: "gk1-demo", engineId: "sci", gameId: "gk1demo",
    files: [["resource.map", 2490, 2514227026], ["resource.000", 1718450, 661574477]],
  },
  {
    title: "Goblins Quest 3 (Demo)", target: "gob3-demo", engineId: "gob", gameId: "gob3",
    files: [["intro.stk", 395561, 546295456], ["imd.itk", 83129, 1237808976]],
  },
  {
    title: "Gobliins 2: The Prince Buffoon (Demo)", target: "gob2-demo", engineId: "gob", gameId: "gob2",
    files: [["intro.stk", 492226, 2476912281], ["all.ask", 6078, 581017231]],
  },
  {
    title: "Gobliiins (Demo)", target: "gob1-demo", engineId: "gob", gameId: "gob1",
    files: [["intro.stk", 280044, 1661689621], ["disk1.stk", 662036, 670765929]],
  },
  {
    title: "Discworld (Demo)", target: "dw-demo", engineId: "tinsel", gameId: "dw",
    files: [["dw.gra", 781676, 2418090083], ["english.smp", 51889165, 1007388091]],
  },
  {
    title: "Broken Sword II: The Smoking Mirror (Demo)", target: "sword2-demo", engineId: "sword2", gameId: "sword2",
    files: [["general.clu", 8030769, 1224036629], ["docks.clu", 20262263, 238789565]],
  },
  {
    title: "Broken Sword: The Shadow of the Templars (Demo)", target: "sword1-demo", engineId: "sword1", gameId: "sword1",
    files: [["scripts.clm", 1088468, 3493304599], ["swordres.rif", 59788, 2626330415]],
  },
  {
    title: "The Dig (Demo)", target: "dig-demo", engineId: "scumm", gameId: "dig",
    files: [["dig.la0", 3472, 0x0d806066], ["dig.la1", 13564378, 0x792615a2]],
  },
  {
    title: "Sam & Max Hit the Road (Demo)", target: "samnmax-demo", engineId: "scumm", gameId: "samnmax",
    files: [["samdemo.000", 7505, 0x112b0cbd], ["samdemo.001", 1190282, 0xa0b3f988]],
  },
  {
    title: "Full Throttle (Demo)", target: "ft-demo", engineId: "scumm", gameId: "ft",
    files: [["ft.000", 7885, 0x5a4b7e9a], ["ft.001", 50371781, 0xb93903c9]],
  },
  {
    title: "God of Thunder",
    files: [["gotres.dat", 739710, 34139293]],
  },
  {
    title: "Hi-Res Adventure #1: Mystery House",
    files: [["mysthous.dsk", 143360, 1258297292]],
  },
  {
    title: "Sołtys",
    files: [["vol.cat", 50176, 623096146], ["vol.dat", 8430868, 1606659223]],
  },
  {
    title: "Sfinx",
    files: [["vol.cat", 129024, 950468179], ["vol.dat", 34182773, 4051689322]],
  },
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
    title: "The Curse of Monkey Island (Demo)", target: "comi-demo", engineId: "scumm", gameId: "comi",
    files: [["comi.la0", 18041, 0x2f43bb49], ["comi.la1", 10579949, 0x1ea49b19]],
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
