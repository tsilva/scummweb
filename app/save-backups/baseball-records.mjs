export const baseballRecordsPath = "baseball-records.bbl";

export function hasEmptyBaseballRecords(set) {
  return set.files.some(file => file.path === baseballRecordsPath && file.data.length === 0);
}

export function newestBaseballRecords(sets, latest) {
  for (const set of sets) {
    const file = set.files.find(file => file.path === baseballRecordsPath && file.data.length);
    if (file && (!latest || file.modifiedAt > latest.modifiedAt)) latest = file;
  }
  return latest;
}
