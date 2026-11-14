import { defaultLibraryQuery, queryLibrary } from "./library-query.mjs";

export function orderHeroGroups(groups) {
  return queryLibrary(groups, defaultLibraryQuery);
}
