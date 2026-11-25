import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bugReportLimits, reportGameIdentity, reportPlayerSettings } from "../../lib/bug-report.mjs";
import { scummvmAssetVersion } from "../asset-paths";

const noSnapshot = { status: "omitted", files: [] };

export default function GameBugReport({ frameRef, game, onBusyChange, onCancel, onResume }) {
  const [message, setMessage] = useState("");
  const [includeSave, setIncludeSave] = useState(false);
  const [capture, setCapture] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sentReportId, setSentReportId] = useState(null);
  const initialGame = useRef(game);
  const context = useRef(null);
  const submission = useRef(null);
  const request = useRef(null);

  useEffect(() => {
    const frame = frameRef.current?.contentWindow;
    const player = frame?.scummwebPlayerControls;
    context.current = {
      version: 1,
      game: reportGameIdentity(initialGame.current, frame?.__scummwebSaveStatus),
      player: reportPlayerSettings(player?.read() ?? {}),
      runtimeVersion: scummvmAssetVersion,
    };
    return () => request.current?.abort();
  }, [frameRef]);

  useEffect(() => {
    if (!includeSave) return;
    let current = true;
    const player = frameRef.current?.contentWindow?.scummwebPlayerControls;
    Promise.resolve().then(() => current ? player?.run("report") ?? { status: "unavailable", files: [], reason: "runtime-unavailable" } : null)
      .then((result) => {
        if (current) setCapture(result?.status ? result : { status: "unavailable", files: [] });
      }, () => { if (current) setCapture({ status: "failed", files: [] }); });
    return () => { current = false; };
  }, [frameRef, includeSave]);

  async function submit(event) {
    event.preventDefault();
    const snapshot = includeSave ? capture : noSnapshot;
    if (sending || !snapshot || !context.current || !message.trim()) return;
    setSending(true);
    onBusyChange(true);
    setError("");
    if (submission.current?.message !== message || submission.current.snapshot !== snapshot) {
      submission.current = { message, snapshot, id: crypto.randomUUID() };
    }
    const { id } = submission.current;
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const form = new FormData();
      form.set("message", message);
      form.set("metadata", JSON.stringify({ ...context.current, reportId: id,
        capture: { status: snapshot.status, slot: snapshot.slot, reason: snapshot.reason,
          files: snapshot.files.map(({ name }) => ({ name })) } }));
      snapshot.files.forEach(({ name, data }, index) => {
        form.set(`save-${index}`, new Blob([data], { type: "application/octet-stream" }), name);
      });
      const response = await fetch("/api/bug-report", { method: "POST", body: form,
        credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      const result = await response.json().catch(() => ({ ok: false, message: "The report could not be sent. Please try again." }));
      if (!response.ok || !result.ok) throw new Error(result.message || "The report could not be sent. Please try again.");
      setCapture({ status: "sent", files: [] });
      setMessage("");
      setSentReportId(id);
    } catch (failure) {
      setError(failure.name === "AbortError" ? "Sending took too long. Please try again."
        : failure instanceof TypeError ? "Could not connect. Please try again." : failure.message);
    } finally {
      clearTimeout(timer);
      request.current = null;
      setSending(false);
      onBusyChange(false);
    }
  }

  if (sentReportId) return (
    <div className="game-bug-report game-bug-report-success" role="status">
      <CheckCircle2 aria-hidden="true" size={44} />
      <h3>Report sent</h3>
      <p>Thanks for helping improve ScummWEB.</p>
      <p className="game-menu-note">Report ID {sentReportId}</p>
      <p className="game-menu-note">Your saved games are unchanged.</p>
      <button className="game-menu-primary" data-menu-focus onClick={onResume} type="button">Resume game</button>
    </div>
  );

  return (
    <form className="game-bug-report" onSubmit={submit} aria-busy={sending}>
      <label htmlFor="game-bug-description">What went wrong?</label>
      <textarea id="game-bug-description" data-menu-focus required maxLength={bugReportLimits.message}
        placeholder="Tell us what happened…" rows={6} value={message} disabled={sending}
        onChange={(event) => setMessage(event.target.value)} />
      <p className="game-menu-note">
        We send your description and technical details to Sentry to investigate the problem. Leave out personal information.
        {" "}<a href="/privacy#diagnostics" target="_blank" rel="noreferrer">Privacy policy</a>
      </p>
      <label>
        <input type="checkbox" checked={includeSave} disabled={sending} onChange={(event) => {
          setCapture(null);
          setIncludeSave(event.target.checked);
        }} />{" "}Attach a copy of this game’s current save
      </label>
      {includeSave && <p className="game-menu-note" role="status">
        {!capture ? "Preparing a game save…" : capture.status === "captured"
          ? "A copy of your game save will be included." : "A game save is unavailable. You can still send the report."}
      </p>}
      {error && <p className="game-menu-note" role="alert">{error}</p>}
      <div className="game-bug-report-actions">
        <button className="game-menu-primary" disabled={(includeSave && !capture) || sending || !message.trim()} type="submit">
          {sending ? "Sending…" : "Send report"}
        </button>
        <button className="game-bug-report-cancel" disabled={sending} onClick={onCancel} type="button">Cancel</button>
      </div>
    </form>
  );
}
