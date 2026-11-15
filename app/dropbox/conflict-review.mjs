export const conflictVersion = (conflict) => JSON.stringify([conflict.local.hash, conflict.remoteHash,
  [...conflict.tips].sort(), (conflict.others || []).map(({ hash }) => hash)]);

export function conflictReviewId(conflicts) {
  return conflicts.map((conflict) => `${conflict.profile}:${conflictVersion(conflict)}`).sort().join("|");
}

export function conflictOptions(conflict) {
  return [
    { value: "local", label: conflict.localLabel || "This device", set: conflict.local },
    { value: "remote", label: conflict.remoteLabel || "Dropbox", set: conflict.remote },
    ...(conflict.others || []).map((set, index) => ({ value: `other-${index}`, label: `Other saved copy ${index + 1}`, set })),
  ];
}

export function conflictSelection(conflict, choice) {
  const options = conflictOptions(conflict);
  const index = options.findIndex(({ value }) => value === choice);
  return index < 0 ? null : conflict.candidates?.[index] || options[index].set;
}
