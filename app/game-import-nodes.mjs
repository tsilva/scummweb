export function fileNode(file) {
  return { kind: "file", name: file.name, getFile: async () => file };
}

export function handleNode(handle) {
  if (handle.kind === "file") {
    return { kind: "file", name: handle.name, handle, getFile: () => handle.getFile() };
  }
  return {
    kind: "directory", name: handle.name,
    async *children() {
      for await (const child of handle.values()) yield handleNode(child);
    },
  };
}

function entryNode(entry) {
  if (entry.isFile) {
    return {
      kind: "file", name: entry.name,
      getFile: () => new Promise((resolve, reject) => entry.file(resolve, reject)),
    };
  }
  return {
    kind: "directory", name: entry.name,
    async *children() {
      const reader = entry.createReader();
      // Chromium returns directory entries in batches, not necessarily all at once.
      while (true) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) return;
        for (const child of batch) yield entryNode(child);
      }
    },
  };
}

export function captureGameDrop(transfer) {
  const items = [...transfer.items].filter((item) => item.kind === "file");
  if (!items.length) return [...transfer.files].map((file) => Promise.resolve(fileNode(file)));

  // Capture all access methods during the drop event, before awaiting any of them.
  return items.map((item) => {
    const entry = item.webkitGetAsEntry?.();
    const file = item.getAsFile();
    const handle = item.getAsFileSystemHandle?.();
    return Promise.resolve(handle).catch(() => null).then((value) => {
      if (value) return handleNode(value);
      if (entry) return entryNode(entry);
      return file ? fileNode(file) : null;
    });
  });
}
