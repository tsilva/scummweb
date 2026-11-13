const storageKey = "scummweb.hidden-catalog-versions.v1";

export function readHiddenCatalogVersions(storage = window.localStorage) {
  const value = JSON.parse(storage.getItem(storageKey) || "[]");
  if (!Array.isArray(value)) throw new Error("Could not read removed library games.");
  return [...new Set(value.filter((key) => typeof key === "string" && key.startsWith("catalog:")))];
}

export function writeHiddenCatalogVersions(keys, storage = window.localStorage) {
  storage.setItem(storageKey, JSON.stringify([...new Set(keys)]));
}

export function visibleLibraryGroups(groups, hiddenKeys) {
  const hidden = new Set(hiddenKeys);
  return groups.flatMap((group) => {
    const versions = group.versions.filter(({ key }) => !hidden.has(key));
    if (!versions.length) return [];
    if (versions.length === group.versions.length) return [group];
    return [{ ...group, ...versions[0], key: group.key, versions }];
  });
}

// Pointer movement and scrolling cancel the hold without blocking normal browsing.
export function createLibraryHold(onHold, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer, origin;
  function cancel() {
    clearTimer(timer);
    timer = undefined;
    origin = undefined;
  }
  return {
    cancel,
    start(event) {
      cancel();
      if (event.button !== 0 || event.isPrimary === false) return;
      origin = { x: event.clientX, y: event.clientY, id: event.pointerId };
      timer = setTimer(() => { cancel(); onHold(); }, 600);
    },
    move(event) {
      if (origin && (origin.id !== event.pointerId || Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10)) cancel();
    },
  };
}
