const storageKey = "scummweb.hidden-catalog-versions.v1";

export function restoreIncludedCatalog(storage = window.localStorage) {
  // Old releases allowed hiding bundled games. They are always included now.
  storage.removeItem(storageKey);
}

export function removableLibraryVersions(item) {
  return item.versions.filter(({ source }) => source);
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
