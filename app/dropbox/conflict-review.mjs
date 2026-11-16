import { connectionKey } from "./client.mjs";

export const conflictVersion = (conflict) => JSON.stringify([conflict.local.hash, conflict.remoteHash,
  [...conflict.tips].sort(), (conflict.others || []).map(({ hash }) => hash)]);

export function conflictReviewId(conflicts) {
  // Dismissal follows the actual copies, not their provider-listing order.
  // Radio selections still use the stricter, ordered conflictVersion above.
  return conflicts.map((conflict) => JSON.stringify([conflict.profile,
    [conflict.local.hash, conflict.remoteHash, ...(conflict.others || []).map(({ hash }) => hash)].sort(),
    [...conflict.tips].sort()])).sort().join("|");
}

export const conflictDismissalKey = "scummweb.dropbox-review-dismissed.v1";
export function readDismissedConflictReview(storage) {
  try {
    const account = JSON.parse(storage.getItem(connectionKey))?.accountId;
    const saved = JSON.parse(storage.getItem(conflictDismissalKey));
    return account && saved?.account === account && typeof saved.review === "string" ? saved.review : "";
  } catch { return ""; }
}
export function rememberDismissedConflictReview(storage, review) {
  try {
    const account = JSON.parse(storage.getItem(connectionKey))?.accountId;
    if (account) storage.setItem(conflictDismissalKey, JSON.stringify({ account, review }));
  } catch { /* Preference failures must not block saving or closing review. */ }
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
