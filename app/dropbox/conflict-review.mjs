export const conflictVersion = (conflict) => JSON.stringify([conflict.local.hash, conflict.remoteHash, [...conflict.tips].sort()]);

export function conflictReviewId(conflicts) {
  return conflicts.map((conflict) => `${conflict.profile}:${conflictVersion(conflict)}`).sort().join("|");
}
