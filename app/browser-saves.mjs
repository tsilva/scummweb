// These engines accept a save slot on the command line. Their filenames
// come from the corresponding ScummVM 2.9.1 metaengines.
const savePatterns = {
  drascula: /^drascula\.(\d{3})$/,
  "dreamweb-cd": /^DREAMWEB\.D(\d{2})$/,
  lure: /^lure\.(\d{3})$/,
  queen: /^queen\.s(\d{2})$/,
  sky: /^SKY-VM\.(\d{3})$/,
};
const saveDirectory = [".local", "share", "scummvm", "saves"];
const checkpoints = new Map();

// The shell mounts BrowserFS 2.0.0's base64 LocalStorage filesystem at
// /home/web_user. Read its inodes without initializing or writing to it.
function readInode(storage, key) {
  if (!key) return null;
  const value = storage.getItem(key);
  if (!value) return null;
  const binary = atob(value);
  if (binary.length <= 30) return null;

  const metadata = new DataView(Uint8Array.from(binary.slice(0, 30), (byte) => byte.charCodeAt(0)).buffer);
  return {
    dataKey: binary.slice(30),
    type: metadata.getUint16(4, true) & 0xf000,
    modifiedAt: metadata.getFloat64(14, true),
  };
}

function readDirectory(storage, key) {
  const inode = readInode(storage, key);
  if (inode?.type !== 0x4000) return {};
  const bytes = Uint8Array.from(atob(storage.getItem(inode.dataKey) || ""), (byte) => byte.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function getCheckpoint(url) {
  if (!checkpoints.has(url)) {
    checkpoints.set(url, fetch(url).then(async (response) => {
      if (!response.ok) throw new Error("Could not read the bundled intro checkpoint");
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }).catch(() => {
      checkpoints.delete(url);
      return null;
    }));
  }
  return checkpoints.get(url);
}

export async function getLatestBrowserSave(game, assetVersion) {
  const pattern = Object.hasOwn(savePatterns, game?.target) ? savePatterns[game.target] : null;
  if (!pattern) return null;

  try {
    const storage = window.localStorage;
    let listing = readDirectory(storage, "/");
    for (const folder of saveDirectory) {
      listing = readDirectory(storage, listing[folder]);
    }

    const saves = Object.entries(listing).flatMap(([name, key]) => {
      const match = pattern.exec(name);
      const inode = match ? readInode(storage, key) : null;
      if (inode?.type !== 0x8000 || !Number.isFinite(inode.modifiedAt)) return [];
      return [{ ...inode, name, slot: Number(match[1]) }];
    });
    saves.sort((left, right) => right.modifiedAt - left.modifiedAt);

    for (const save of saves) {
      const contents = storage.getItem(save.dataKey);
      if (!contents) continue;
      if (game.skipIntro?.saveFiles.includes(save.name)) {
        const url = `/launcher/skip-intro/${encodeURIComponent(game.target)}/${encodeURIComponent(save.name)}?v=${encodeURIComponent(assetVersion)}`;
        const checkpoint = await getCheckpoint(url);
        if (!checkpoint || contents === checkpoint) continue;
      }
      return save.slot;
    }
  } catch {
    // Missing, corrupt, or unavailable browser storage still permits Play.
  }
  return null;
}
