"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import styles from "./controls.module.css";

const ConsentContext = createContext(null);

export function PrivacyChoicesButton({ className }) {
  const { open } = useContext(ConsentContext);
  return <button className={className} type="button" onClick={(event) => open(event.currentTarget)}>Privacy choices</button>;
}

export function PrivacyConsentPrompt() {
  return useContext(ConsentContext).prompt;
}

export function ConsentControls({ message, policyUrl, store, purposes, children }) {
  const record = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [ready, setReady] = useState(false);
  const [choices, setChoices] = useState(null);
  const trigger = useRef(null);
  const firstChoice = useRef(null);
  const headingId = useId();
  const customizing = choices !== null;

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (customizing) firstChoice.current?.focus();
    else if (trigger.current) {
      trigger.current.focus();
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

  const all = purposes.length === 2 ? "both" : "all";
  const prompt = ready && !record ? (
    <section className={styles.prompt} aria-label="Optional analytics and error diagnostics">
      <span>{message}</span>
      <div className={styles.actions}>
        <button type="button" onClick={() => saveAll(true)}>Allow {all}</button>
        <button type="button" onClick={() => saveAll(false)}>Decline {all}</button>
      </div>
    </section>
  ) : null;

  return <ConsentContext.Provider value={{ open, prompt }}>
    {children}
    {choices ? (
      <section className={styles.details} aria-labelledby={headingId}
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
    ) : null}
  </ConsentContext.Provider>;
}
