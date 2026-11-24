"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import styles from "./controls.module.css";

const ConsentContext = createContext(null);

export function PrivacyChoicesButton({ className }) {
  const { open } = useContext(ConsentContext);
  return <button className={className} type="button" onClick={(event) => open(event.currentTarget)}>Privacy choices</button>;
}

export function HeroPrivacyControls({ className }) {
  const { open, showPrompt, message, all, saveAll, heroDetails } = useContext(ConsentContext);
  const choicesButton = useRef(null);

  function decide(value) {
    saveAll(value);
    choicesButton.current?.focus({ preventScroll: true });
  }

  return <div className={className}>
    <div className={styles.heroQuick} hidden={Boolean(heroDetails)}>
      {showPrompt && <section className={styles.prompt} aria-label="Optional analytics and error diagnostics">
        <span>{message}</span>
        <div className={styles.actions}>
          <button type="button" onClick={() => decide(true)}>Accept {all}</button>
          <button type="button" onClick={() => decide(false)}>Reject {all}</button>
        </div>
      </section>}
      <button className={styles.choiceLink} type="button" ref={choicesButton}
        onClick={(event) => open(event.currentTarget, "hero")}>Privacy choices</button>
    </div>
    {heroDetails}
  </div>;
}

export function ConsentControls({ message, policyUrl, store, purposes, children }) {
  const record = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [ready, setReady] = useState(false);
  const [editor, setEditor] = useState(null);
  const trigger = useRef(null);
  const firstChoice = useRef(null);
  const headingId = useId();
  const placement = editor?.placement;

  useEffect(() => { setReady(true); }, []);
  useEffect(() => {
    if (placement) {
      const input = firstChoice.current;
      input?.focus({ preventScroll: true });
      const panel = placement === "hero" ? input?.closest("section") : null;
      if (panel) {
        const { top, bottom } = panel.getBoundingClientRect();
        if (top < 0 || bottom > window.innerHeight) panel.scrollIntoView({ block: "nearest" });
      }
    } else if (trigger.current) {
      trigger.current.focus({ preventScroll: true });
      trigger.current = null;
    }
  }, [placement]);

  function open(button, placement = "floating") {
    trigger.current = button;
    const choices = Object.fromEntries(purposes.map(({ id }) => [id, record?.choices[id] === true]));
    setEditor({ placement, choices });
  }

  function close() {
    setEditor(null);
  }

  function save(next) {
    store.decide(next);
    close();
  }

  function saveAll(value) {
    save(Object.fromEntries(purposes.map(({ id }) => [id, value])));
  }

  const all = purposes.length === 2 ? "both" : "all";
  const details = editor ? (
      <section className={`${styles.details} ${placement === "hero" ? styles.heroDetails : styles.floatingDetails}`} aria-labelledby={headingId}
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
        <h2 id={headingId}>Privacy choices</h2>
        {purposes.map(({ id, label, description }, index) => (
          <label className={styles.purpose} key={id}>
            <input ref={index === 0 ? firstChoice : undefined} type="checkbox" checked={editor.choices[id]}
              onChange={(event) => {
                const checked = event.target.checked;
                setEditor((current) => ({ ...current, choices: { ...current.choices, [id]: checked } }));
              }} />
            <span><strong>{label}</strong><span>{description}</span></span>
          </label>
        ))}
        <div className={styles.actions}>
          <button type="button" onClick={() => save(editor.choices)}>Save choices</button>
          <button type="button" onClick={close}>Cancel</button>
          <a href={policyUrl}>Privacy policy</a>
        </div>
      </section>
  ) : null;

  return <ConsentContext.Provider value={{
    open, showPrompt: ready && !record, message, all, saveAll, heroDetails: placement === "hero" ? details : null,
  }}>
    {children}
    {placement === "floating" && details}
  </ConsentContext.Provider>;
}
