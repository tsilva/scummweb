"use client";

import { useRef, useState } from "react";
import { privacyRequestLimits, privacyRequestTypes } from "../../lib/privacy-request.mjs";
import styles from "./privacy.module.css";

export default function PrivacyRequestForm() {
  const [status, setStatus] = useState({ phase: "idle" });
  const pending = useRef(false);
  const previous = useRef(null);
  const sending = status.phase === "sending";

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const request = {
      type: fields.get("type"),
      replyTo: fields.get("replyTo").trim(),
      message: fields.get("message").trim(),
    };
    if (!request.message) {
      setStatus({ phase: "error", message: "Please describe your request." });
      return;
    }
    const content = JSON.stringify(request);
    if (previous.current?.content !== content) {
      previous.current = { content, id: window.crypto.randomUUID() };
    }
    const id = previous.current.id;
    pending.current = true;
    setStatus({ phase: "sending" });
    try {
      const response = await fetch("/api/privacy-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, id }),
      });
      const result = await response.json();
      if (!response.ok || result.reference !== id) {
        setStatus({ phase: "error", message: result.message || "Your request could not be sent. Please try again." });
        return;
      }
      form.reset();
      previous.current = null;
      setStatus({ phase: "received", reference: id });
    } catch {
      setStatus({ phase: "error", message: "Your request could not be sent. Please try again." });
    } finally {
      pending.current = false;
    }
  }

  return (
    <form className={styles.requestForm} method="post" action="/api/privacy-requests" onSubmit={submit}>
      <div className={styles.fields}>
        <label>
          Request type (optional)
          <select name="type" defaultValue="" disabled={sending}>
            <option value="">Select a request type</option>
            {privacyRequestTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Email for replies
          <input name="replyTo" type="email" autoComplete="email" maxLength={privacyRequestLimits.replyTo}
            required disabled={sending} />
        </label>
      </div>
      <label>
        What would you like us to do?
        <textarea name="message" rows={4} maxLength={privacyRequestLimits.message} aria-describedby="privacy-request-hint"
          required disabled={sending} />
      </label>
      <p className={styles.hint} id="privacy-request-hint">
        If you reported a bug, the game and approximate time can help us find it. Leave out passwords and identity documents.
      </p>
      <button type="submit" disabled={sending}>
        {sending ? "Sending…" : "Send request"}
      </button>
      {status.phase === "error" && <p role="alert">{status.message}</p>}
      {status.phase === "received" && (
        <p className={styles.receipt} role="status">Request submitted. Your reference is {status.reference}.</p>
      )}
    </form>
  );
}
