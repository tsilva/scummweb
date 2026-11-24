export function createConsentStore({ site, version, purposes, getWindow = () => globalThis.window, now = Date.now }) {
  const key = `privacy-consent:${site}`;
  const listeners = new Set();
  let snapshot = null;
  let initialized = false;

  function parse(value) {
    try {
      const record = JSON.parse(value);
      if (record?.version !== version || !Number.isFinite(record.decidedAt)
        || !purposes.every((purpose) => typeof record.choices?.[purpose] === "boolean")) return null;
      const choices = Object.freeze(Object.fromEntries(purposes.map((purpose) => [purpose, record.choices[purpose]])));
      return Object.freeze({ version, decidedAt: record.decidedAt, choices });
    } catch {
      return null;
    }
  }

  function getSnapshot() {
    const target = getWindow();
    if (!initialized && target) {
      initialized = true;
      try { snapshot = parse(target.localStorage.getItem(key)); }
      catch { /* Storage may be blocked. The default is undecided. */ }
    }
    return snapshot;
  }

  function update(record) {
    snapshot = record;
    for (const listener of listeners) listener();
  }

  function onStorage(event) {
    if (event.key === key || event.key === null) update(parse(event.newValue));
  }

  return {
    getSnapshot,
    getServerSnapshot: () => null,
    allows: (purpose) => getSnapshot()?.choices[purpose] === true,
    subscribe(listener) {
      getSnapshot();
      const target = getWindow();
      if (!listeners.size) target?.addEventListener("storage", onStorage);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) target?.removeEventListener("storage", onStorage);
      };
    },
    decide(choices) {
      const record = parse(JSON.stringify({ version, decidedAt: now(), choices }));
      if (!record) throw new TypeError("A choice is required for each consent purpose.");
      getSnapshot();
      try { getWindow()?.localStorage.setItem(key, JSON.stringify(record)); }
      catch { /* Keep choices for this page if storage is blocked. */ }
      update(record);
    },
  };
}
