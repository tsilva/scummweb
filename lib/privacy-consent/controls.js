"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import styles from "./controls.module.css";

const ConsentContext = createContext(null);

function focusSettings() {
  document.querySelector('button[aria-controls="site-settings"]')?.focus({ preventScroll: true });
}

export function PrivacyChoicesButton({ className }) {
  const { open } = useContext(ConsentContext);
  return <button className={className} type="button" onClick={(event) => open(event.currentTarget)}>Privacy choices</button>;
}

export function HeroPrivacyControls({ className }) {
  const { open, showPrompt, title, message, policyHref, saveAll, heroDetails } = useContext(ConsentContext);
  const headingId = useId();

  if (!showPrompt && !heroDetails) return null;

  function decide(value) {
    saveAll(value);
    focusSettings();
  }

  return <div className={className}>
    <section className={`${styles.panel} ${styles.prompt}`} aria-labelledby={headingId}
      hidden={Boolean(heroDetails)}>
      <div className={styles.intro}>
        <h2 id={headingId}>{title}</h2>
        <p>{message}{policyHref && <> <a href={policyHref}>Privacy policy</a></>}</p>
      </div>
      <div className={styles.actions}>
        <button className={styles.textAction} type="button"
          onClick={(event) => open(event.currentTarget, "hero")}>Customize</button>
        <div className={styles.decisionButtons}>
          <button className="secondary-button" type="button" onClick={() => decide(false)}>Reject all</button>
          <button className="secondary-button" type="button" onClick={() => decide(true)}>Accept all</button>
        </div>
      </div>
    </section>
    {heroDetails}
  </div>;
}

function PermissionSwitches({ purposes, choices, onChange, firstChoice, className }) {
  const groupId = useId();

  return <div className={className}>
    {purposes.map(({ id, label, description }, index) => {
      const labelId = `${groupId}-${id}-label`;
      const descriptionId = `${groupId}-${id}-description`;
      return <label className={styles.purpose} key={id}>
        <strong id={labelId}>{label}</strong>
        <input ref={index === 0 ? firstChoice : undefined}
          type="checkbox" role="switch" aria-labelledby={labelId} aria-describedby={descriptionId}
          checked={choices?.[id] === true} onChange={(event) => onChange(id, event.target.checked)} />
        <span className={styles.purposeDescription} id={descriptionId}>{description}</span>
      </label>;
    })}
  </div>;
}

export function PrivacySettingsSwitches() {
  const { purposes, choices, savePermission } = useContext(ConsentContext);
  return <PermissionSwitches className={styles.settingsSwitches} purposes={purposes} choices={choices} onChange={savePermission} />;
}

export function ConsentControls({ title, message, policyHref, store, purposes, firstVisitPrompt = true, children }) {
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
      if (trigger.current.isConnected) trigger.current.focus({ preventScroll: true });
      else focusSettings();
      trigger.current = null;
    }
  }, [placement]);

  function readChoices() {
    return store.getSnapshot()?.choices ?? Object.fromEntries(purposes.map(({ id }) => [id, false]));
  }

  function open(button, placement = "floating") {
    trigger.current = button;
    setEditor({ placement, choices: readChoices() });
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

  function savePermission(id, checked) {
    save({ ...readChoices(), [id]: checked });
  }

  function editPermission(id, checked) {
    setEditor((current) => ({ ...current, choices: { ...current.choices, [id]: checked } }));
  }

  const details = editor ? (
    <section className={`${styles.panel} ${styles.details} ${placement === "hero" ? styles.heroDetails : styles.floatingDetails}`}
      aria-labelledby={headingId} onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <h2 id={headingId}>Privacy choices</h2>
      <PermissionSwitches purposes={purposes} choices={editor.choices} firstChoice={firstChoice} onChange={editPermission} />
      <div className={styles.actions}>
        <button className={styles.textAction} type="button" onClick={() => saveAll(false)}>Reject all</button>
        <div className={styles.editorButtons}>
          <button className={styles.cancelButton} type="button" onClick={close}>Cancel</button>
          <button className={styles.saveButton} type="button" onClick={() => save(editor.choices)}>Save choices</button>
        </div>
      </div>
    </section>
  ) : null;

  return <ConsentContext.Provider value={{
    open, showPrompt: firstVisitPrompt && ready && !record, title, message, policyHref, saveAll, heroDetails: placement === "hero" ? details : null,
    purposes, choices: record?.choices, savePermission,
  }}>
    {children}
    {placement === "floating" && details}
  </ConsentContext.Provider>;
}
