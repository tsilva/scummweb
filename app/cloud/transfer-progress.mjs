// Percentages measure transferred bytes, never elapsed time. Publication includes
// both the upload and its required readback; incoming backups measure downloads.
export function trackCloudTransfers(client, report) {
  const uploaded = new Map();
  let active, displayed;
  const emit = (activity) => {
    active = activity;
    if (!activity.title) {
      if (displayed === undefined) { displayed = null; report(null); }
      return;
    }
    if (!displayed || ["name", "stage", "direction", "title", "percentage"].some(key => displayed[key] !== activity[key])) {
      displayed = activity;
      report(activity);
    }
  };
  async function download(name, options = {}, copied = false) {
    const publication = uploaded.get(name);
    const title = publication?.title || options.title;
    let live = true;
    const stage = publication ? "verify" : "download";
    const direction = publication ? "upload" : "download";
    const send = (percentage) => emit({ name, stage, direction, title, percentage });
    send(publication ? 50 : null);
    try {
      const blob = await client[copied ? "downloadImport" : "download"](name, { ...options, onProgress({ loaded, total }) {
        if (!live) return;
        const size = publication?.size || total;
        send(size > 0 && loaded <= size ? Math.floor(100 * (loaded + (publication ? size : 0)) / (size * (publication ? 2 : 1))) : null);
      } });
      emit({ name, stage: "verify", direction, title, percentage: 100 });
      return blob;
    } finally { live = false; }
  }
  return { ...client,
    async upload(name, blob, { title } = {}) {
      uploaded.set(name, { title, size: blob.size });
      let live = true;
      emit({ name, stage: "upload", direction: "upload", title, percentage: 0 });
      try {
        await client.upload(name, blob, { onProgress({ loaded }) {
          if (live && blob.size > 0 && loaded <= blob.size) emit({ name, stage: "upload", direction: "upload", title,
            percentage: Math.floor(50 * loaded / blob.size) });
        } });
        emit({ name, stage: "verify", direction: "upload", title, percentage: 50 });
      } finally { live = false; }
    },
    download,
    downloadImport: (name, options) => download(name, options, true),
    verified(name, set) {
      if (active?.name === name) emit({ ...active, title: set.destination.title, percentage: 100 });
      else emit({ name, stage: "verify", direction: "download", title: set.destination.title, percentage: 100 });
      uploaded.delete(name);
      client.verified?.(name, set);
    },
  };
}

export function transferProgressDetails(activity) {
  if (!activity?.title) return null;
  const direction = activity.stage === "restore" ? "Restoring" : activity.stage === "verify" ? "Verifying"
    : activity.direction === "upload" ? "Uploading" : "Downloading";
  const percentage = Number.isInteger(activity.percentage) && activity.percentage >= 0 && activity.percentage <= 100
    ? activity.percentage : null;
  return { percentage, title: activity.title, direction };
}
export function transferProgressLabel(activity) {
  const detail = transferProgressDetails(activity);
  return detail ? `${detail.percentage === null ? "" : detail.percentage + "% · "}${detail.title} · ${detail.direction}` : "";
}
