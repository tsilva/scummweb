"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import styles from "./controls.module.css";

const ConsentContext = createContext(null);

export function PrivacyChoicesButton({ className }) {
  const { open } = useContext(ConsentContext);
  return <button className={className} type="button" onClick={(event) => open(event.currentTarget)}>Privacy choices</button>;
}

export function HeroPrivacyControls({ className }) {
  const { open, showPrompt, title, message, saveAll, heroDetails } = useContext(ConsentContext);
  const choicesButton = useRef(null);
  const headingId = useId();

  function decide(value) {
    saveAll(value);
    choicesButton.current?.focus({ preventScroll: true });
  }

  return <div className={className}>
    <div className={styles.heroQuick} hidden={Boolean(heroDetails)}>
      <section className={showPrompt ? `${styles.panel} ${styles.prompt}` : undefined}
        aria-labelledby={showPrompt ? headingId : undefined}>
        {showPrompt && <div className={styles.intro}>
          <h2 id={headingId}>{title}</h2>
          <p>{message}</p>
        </div>}
        <div className={showPrompt ? styles.actions : undefined}>
          <button className={showPrompt ? styles.textAction : styles.choiceLink} type="button" ref={choicesButton}
            onClick={(event) => open(event.currentTarget, "hero")}>{showPrompt ? "Customize" : "Privacy choices"}</button>
          {showPrompt && <div className={styles.decisionButtons}>
            <button className="secondary-button" type="button" onClick={() => decide(false)}>Reject all</button>
            <button className="secondary-button" type="button" onClick={() => decide(true)}>Accept all</button>
          </div>}
        </div>
      </section>
    </div>
    {heroDetails}
  </div>;
}

export function ConsentControls({ title, message, policyUrl, store, purposes, children }) {
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

  const details = editor ? (
    <section className={`${styles.panel} ${styles.details} ${placement === "hero" ? styles.heroDetails : styles.floatingDetails}`}
      aria-labelledby={headingId} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <h2 id={headingId}>Privacy choices</h2>
      <div>
        {purposes.map(({ id, label, description }, index) => {
          const labelId = `${headingId}-${id}-label`;
          const descriptionId = `${headingId}-${id}-description`;
          return <label className={styles.purpose} key={id}>
            <strong id={labelId}>{label}</strong>
            <input ref={index === 0 ? firstChoice : undefined}
              type="checkbox" role="switch" aria-labelledby={labelId} aria-describedby={descriptionId}
              checked={editor.choices[id]}
              onChange={(event) => {
                const checked = event.target.checked;
                setEditor((current) => ({ ...current, choices: { ...current.choices, [id]: checked } }));
              }} />
            <span className={styles.purposeDescription} id={descriptionId}>{description}</span>
          </label>;
        })}
      </div>
      <div className={styles.actions}>
        <a className={styles.textAction} href={policyUrl}>Privacy policy</a>
        <div className={styles.editorButtons}>
          <button className={styles.cancelButton} type="button" onClick={close}>Cancel</button>
          <button className={styles.saveButton} type="button" onClick={() => save(editor.choices)}>Save choices</button>
        </div>
      </div>
    </section>
  ) : null;

  return <ConsentContext.Provider value={{
    open, showPrompt: ready && !record, title, message, saveAll, heroDetails: placement === "hero" ? details : null,
  }}>
    {children}
    {placement === "floating" && details}
  </ConsentContext.Provider>;
}
