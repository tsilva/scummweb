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
    title: "Ruff's Bone (Demo)", target: "ruff-demo", engineId: "mohawk", gameId: "ruff",
    files: [["p01ep.ibm", 2744050, 2588385377], ["p01sp.ibm", 2767560, 2980424538], ["ruff.512", 693, 2000887134]],
  },
  {
    title: "Arthur's Teacher Trouble (Demo)", target: "arthur-demo", engineId: "mohawk", gameId: "arthur",
    files: [["p01e.ibm", 3374954, 1365000791], ["p01s.ibm", 3609898, 2006794541], ["pages.512", 642, 2220535430]],
  },
  {
    title: "Just Grandma and Me (Demo)", target: "grandma-demo", engineId: "mohawk", gameId: "grandma",
    files: [["p01e.ibm", 2432263, 3086336102], ["p01j.ibm", 2423661, 3599050856], ["p01s.ibm", 2567284, 355773652], ["pages.512", 824, 4215291410]],
  },
  {
    title: "Arthur's Birthday (Demo)", target: "arthurbday-demo", engineId: "mohawk", gameId: "arthurbday",
    files: [["birthday.512", 699, 2545112256], ["p01ep.ibm", 2478313, 1454066852], ["p01sp.ibm", 2837914, 702361151]],
  },
  {
    title: "Aesop's Fables: The Tortoise and the Hare (Demo)", target: "tortoise-demo", engineId: "mohawk", gameId: "tortoise",
    files: [["p01ep.ibm", 3493499, 2155196281], ["p01sp.ibm", 3462902, 2216245485], ["tortoise.512", 636, 1799113419]],
  },
  {
    title: "Let's Explore the Farm (Demo)", target: "farm-demo", engineId: "scumm", gameId: "farm",
    files: [["farmdemo.he0", 18149, 4064708643], ["farmdemo.he1", 8141104, 4243023337]],
  },
  {
    title: "Let's Explore the Airport (Demo)", target: "airport-demo", engineId: "scumm", gameId: "airport",
    files: [["airdemo.he0", 51131, 3554372771], ["airdemo.he1", 28668826, 3361941333]],
  },
  {
    title: "Blue's Clues: Blue's Birthday Adventure (Demo)", target: "bluesbirthday-demo", engineId: "scumm", gameId: "bluesbirthday",
    files: [["bluesbirthdaydemo.he0", 15789, 4262623801], ["bluesbirthdaydemo.(a)", 14266316, 388128617], ["bluesbirthdaydemo.(b)", 2679222, 2749443637]],
  },
  {
    title: "Blue's ABC Time Activities (Demo)", target: "bluesabctime-demo", engineId: "scumm", gameId: "bluesabctime",
    files: [["bluesabctimedemo.he0", 12186, 541661588], ["bluesabctimedemo.(a)", 3892429, 4009412535]],
  },
  {
    title: "Big Thinkers! Kindergarten (Demo)", target: "thinkerk-demo", engineId: "scumm", gameId: "thinkerk",
    files: [["kinddemo.he0", 29789, 1887773344], ["kinddemo.he1", 7003070, 2334537534]],
  },
  {
    title: "Big Thinkers! 1st Grade (Demo)", target: "thinker1-demo", engineId: "scumm", gameId: "thinker1",
    files: [["1grademo.he0", 30919, 813602397], ["1grademo.he1", 8031672, 3070787722]],
  },
  {
    title: "Bear Stormin' (Demo)", target: "brstorm-demo", engineId: "scumm", gameId: "brstorm",
    files: [["brstorm.he0", 5433, 2011138004], ["brstorm.he1", 237722, 491020587]],
  },
  {
    title: "Backyard Football (Demo)", target: "football-demo", engineId: "scumm", gameId: "football",
    files: [["footdemo.he0", 23135, 1468339392], ["footdemo.he2", 10696556, 3909202253]],
  },
  {
    title: "Fatty Bear's Birthday Surprise (Demo)", target: "fbear-demo", engineId: "scumm", gameId: "fbear",
    files: [["fbdemo.he0", 9593, 2725358755], ["fbdemo.he1", 1176219, 1667533979]],
  },
  {
    title: "Spy Fox 3: Operation Ozone (Demo)", target: "spyozon-demo", engineId: "scumm", gameId: "spyozon",
    files: [["sf3-demo.he0", 15317, 1494850748], ["sf3-demo.he2", 5876993, 2107715046]],
  },
  {
    title: "Putt-Putt Goes to the Moon (Demo)", target: "puttmoon-demo", engineId: "scumm", gameId: "puttmoon",
    files: [["moondemo.he0", 8856, 3451413547], ["moondemo.he1", 933372, 1040395290]],
  },
  {
    title: "Putt-Putt Enters the Race (Demo)", target: "puttrace-demo", engineId: "scumm", gameId: "puttrace",
    files: [["racedemo.he0", 13108, 25833763], ["racedemo.(a)", 6406987, 1004425682]],
  },
  {
    title: "Pajama Sam 3: You Are What You Eat From Your Head To Your Feet (Demo)", target: "pajama3-demo", engineId: "scumm", gameId: "pajama3",
    files: [["pj3demo.he0", 13911, 1009492682], ["pj3demo.(a)", 5476892, 450480674]],
  },
  {
    title: "Freddi Fish 4: The Case of the Hogfish Rustlers of Briny Gulch (Demo)", target: "freddi4-demo", engineId: "scumm", gameId: "freddi4",
    files: [["ff4demo.he0", 13600, 2900540967], ["ff4demo.(a)", 6322129, 3496239882]],
  },
  {
    title: "Freddi Fish 3: The Case of the Stolen Conch Shell (Demo)", target: "freddi3-demo", engineId: "scumm", gameId: "freddi3",
    files: [["f3-mdemo.he0", 22718, 3705901357], ["f3-mdemo.he1", 5579470, 864671203]],
  },
  {
    title: "Leisure Suit Larry 7: Love for Sail! (Demo)", target: "lsl7-demo", engineId: "sci", gameId: "lsl7",
    files: [["resmap.000", 2695, 285310727], ["ressci.000", 10195878, 2468665899]],
  },
  {
    title: "Phantasmagoria (Demo)", target: "phantasmagoria-demo", engineId: "sci", gameId: "phantasmagoria",
    files: [["resmap.001", 11518, 1988159651], ["ressci.001", 65844612, 3646433611]],
  },
  {
    title: "Flight of the Amazon Queen", target: "queen", engineId: "queen", gameId: "queen",
    files: [["queen.1c", 97380030, 2505654023]],
  },
  {
    title: "Lighthouse: The Dark Being (Demo)", target: "lighthouse-demo", engineId: "sci", gameId: "lighthouse",
    files: [["resmap.000", 1525, 1708619834], ["ressci.000", 11494351, 2082545035]],
  },
  {
    title: "Shivers (Demo)", target: "shivers-demo", engineId: "sci", gameId: "shivers",
    files: [["resmap.000", 7069, 592407770], ["ressci.000", 37404155, 377852859]],
  },
  {
    title: "Torin's Passage (Demo)", target: "torin-demo", engineId: "sci", gameId: "torin",
    files: [["resmap.000", 3403, 3083944811], ["ressci.000", 5073868, 1095201545]],
  },
  {
    title: "Rex Nebular and the Cosmic Gender Bender (Demo)", target: "nebular-demo", engineId: "mads", gameId: "nebular",
    files: [["section1.hag", 192065, 2775015795], ["section9.hag", 543156, 2326445887]],
  },
  {
    title: "Bud Tucker in Double Trouble (Demo)", target: "tucker-demo", engineId: "tucker", gameId: "tucker",
    files: [["infobar.txt", 203, 2809140262], ["tucker.exe", 233145, 3209492942]],
  },
  {
    title: "The Lost Files of Sherlock Holmes: The Case of the Serrated Scalpel (Demo)", target: "scalpel-demo", engineId: "sherlock", gameId: "scalpel",
    files: [["talk.lib", 121102, 1973471485], ["res03.rrm", 140669, 3291922347]],
  },
  {
    title: "Return to Zork (Demo)", target: "rtz-demo", engineId: "made", gameId: "rtz",
    files: [["rtzcd.red", 130683, 769598157], ["rtzcd.prj", 43016792, 2406992190]],
  },
  {
    title: "Tony Tough and the Night of Roasted Moths (Demo)", target: "tony-demo", engineId: "tony", gameId: "tony",
    files: [["roasted.mpc", 39211, 3632859460], ["roasted.mpr", 14972409, 2203660658], ["voices.vdb", 20189260, 2600640084]],
  },
  {
    title: "Touch\u00e9: The Adventures of the Fifth Musketeer (Demo)", target: "touche-demo", engineId: "touche", gameId: "touche",
    files: [["touche.dat", 8720683, 3670628460], ["obj", 5503572, 1897254655]],
  },
  {
    title: "Pajama Sam 2: Thunder and Lightning Aren't so Frightening (Demo)", target: "pajama2-demo", engineId: "scumm", gameId: "pajama2",
    files: [["pj2demo.he0", 58749, 374208885], ["pj2demo.he1", 6103756, 4209458581]],
  },
  {
    title: "Freddi Fish 2: The Case of the Haunted Schoolhouse (Demo)", target: "freddi2-demo", engineId: "scumm", gameId: "freddi2",
    files: [["ff2-demo.he0", 27298, 1506492051], ["ff2-demo.he1", 16911456, 1972877193]],
  },
  {
    title: "Putt-Putt Travels Through Time (Demo)", target: "putttime-demo", engineId: "scumm", gameId: "putttime",
    files: [["timedemo.he0", 18394, 3353746237], ["timedemo.he1", 12042331, 451864772]],
  },
  {
    title: "Putt-Putt Saves the Zoo (Demo)", target: "puttzoo-demo", engineId: "scumm", gameId: "puttzoo",
    files: [["zoodemo.he0", 14337, 1935052607], ["zoodemo.he1", 13326164, 1569084410]],
  },
  {
    title: "Lands of Lore: The Throne of Chaos (Demo)", target: "lol-demo", engineId: "kyra", gameId: "lol",
    files: [["general.pak", 710633, 385577937], ["l01.pak", 68733, 2853084991]],
  },
  {
    title: "The Legend of Kyrandia: Hand of Fate (Demo)", target: "kyra2-demo", engineId: "kyra", gameId: "kyra2",
    files: [["thanks.cps", 7768, 3139399110], ["hofcd.exe", 199284, 1859532215]],
  },
  {
    title: "Simon the Sorcerer II: The Lion, the Wizard and the Wardrobe (Demo)", target: "simon2", engineId: "agos", gameId: "simon2",
    files: [["gsptr30", 58757, 2279999647], ["simon2.gme", 4187270, 1777768517]],
  },
  {
    title: "Simon the Sorcerer (Demo)", target: "simon1-demo", engineId: "agos", gameId: "simon1",
    files: [["gamepc", 30879, 1563266732], ["simon.gme", 1237886, 3194878688]],
  },
  {
    title: "Toonstruck (Demo)", target: "toon-demo", engineId: "toon", gameId: "toon",
    files: [["local.pak", 2680573, 3491990584], ["generic.svl", 7739319, 281706566]],
  },
  {
    title: "The Neverhood (Demo)", target: "neverhood-demo", engineId: "neverhood", gameId: "neverhood",
    files: [["a.blb", 11973, 2870863031], ["nevdemo.blb", 22564568, 3388389503]],
  },
  {
    title: "Spy Fox in \"Dry Cereal\" (Demo)", target: "spyfox-demo", engineId: "scumm", gameId: "spyfox",
    files: [["foxdemo.he0", 20103, 1482007684], ["foxdemo.he1", 14746318, 1132169902]],
  },
  {
    title: "Pajama Sam: No Need to Hide When It's Dark Outside (Demo)", target: "pajama-demo", engineId: "scumm", gameId: "pajama",
    files: [["pjs-demo.he0", 18354, 4124670312], ["pjs-demo.he1", 13164357, 3769183567]],
  },
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
