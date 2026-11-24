"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import styles from "./controls.module.css";

const OpenChoices = createContext(null);

export function PrivacyChoicesButton({ className }) {
  const open = useContext(OpenChoices);
  return <button className={className} type="button" onClick={(event) => open(event.currentTarget)}>Privacy choices</button>;
}

export function ConsentControls({ siteName, message, policyUrl, store, purposes, showPrompt, children }) {
  const record = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [ready, setReady] = useState(false);
  const [choices, setChoices] = useState(null);
  const trigger = useRef(null);
  const firstChoice = useRef(null);
  const promptChoicesButton = useRef(null);
  const headingId = useId();
  const customizing = choices !== null;

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (customizing) firstChoice.current?.focus();
    else if (trigger.current) {
      const previous = trigger.current.isConnected ? trigger.current : promptChoicesButton.current;
      previous?.focus();
      trigger.current = null;
    }
  }, [customizing]);

  function open(button) {
    trigger.current = button;
    setChoices(Object.fromEntries(purposes.map(({ id }) => [id, record?.choices[id] === true])));
  }

  function close() {
    setChoices(null);
  }

  function save(next) {
    store.decide(next);
    close();
  }

  function saveAll(value) {
    save(Object.fromEntries(purposes.map(({ id }) => [id, value])));
  }

  const showBanner = ready && showPrompt && !record;
  const all = purposes.length === 2 ? "both" : "all";

  return <OpenChoices.Provider value={open}>
    {children}
    {choices ? (
      <section className={`${styles.panel} ${styles.details}`} aria-labelledby={headingId}
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
        <h2 id={headingId}>Privacy choices</h2>
        {purposes.map(({ id, label, description }, index) => (
          <label className={styles.purpose} key={id}>
            <input ref={index === 0 ? firstChoice : undefined} type="checkbox" checked={choices[id]}
              onChange={(event) => setChoices({ ...choices, [id]: event.target.checked })} />
            <span><strong>{label}</strong><span>{description}</span></span>
          </label>
        ))}
        <div className={styles.actions}>
          <button type="button" onClick={() => save(choices)}>Save choices</button>
          <button type="button" onClick={close}>Cancel</button>
          <a href={policyUrl}>Privacy policy</a>
        </div>
      </section>
    ) : showBanner ? (
      <div className={styles.promptOverlay}>
        <section className={`${styles.panel} ${styles.prompt}`} aria-labelledby={headingId}>
          <h2 id={headingId}>Help improve {siteName}</h2>
          <p>{message}</p>
          <div className={styles.actions}>
            <button type="button" onClick={() => saveAll(true)}>Allow {all}</button>
            <button type="button" onClick={() => saveAll(false)}>Decline {all}</button>
            <button className={styles.linkButton} type="button" ref={promptChoicesButton}
              onClick={(event) => open(event.currentTarget)}>Privacy choices</button>
          </div>
        </section>
      </div>
    ) : null}
  </OpenChoices.Provider>;
}
