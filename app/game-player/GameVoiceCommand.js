import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dispatchGameCommand } from "./keyboard";
import { createVoiceCommand, getSpeechRecognition } from "./voice-command.mjs";

export default function GameVoiceCommand({ frameRef, enabled }) {
  const controllerRef = useRef(null);
  const pressRef = useRef(null);
  const [available, setAvailable] = useState(false);
  const [feedback, setFeedback] = useState({ state: "idle", message: "" });

  useEffect(() => {
    if (!getSpeechRecognition(window)) return;
    setAvailable(true);
    const controller = createVoiceCommand(window, {
      onState: (state, message) => setFeedback({ state, message }),
      onUnavailable: () => setAvailable(false),
      onCommand: (command) => dispatchGameCommand(frameRef.current, command),
    });
    controllerRef.current = controller;
    const cancel = () => { pressRef.current = null; controller.cancel(); };
    const onVisibility = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controllerRef.current = null;
      cancel();
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [frameRef]);

  useEffect(() => {
    if (!enabled) {
      pressRef.current = null;
      controllerRef.current?.cancel();
    }
  }, [enabled]);

  function start(press) {
    if (!enabled || pressRef.current !== null || feedback.state === "processing") return false;
    pressRef.current = press;
    if (!controllerRef.current?.start()) {
      pressRef.current = null;
      return false;
    }
    return true;
  }

  function release(press, cancelled = false) {
    if (pressRef.current !== press) return;
    pressRef.current = null;
    if (cancelled) controllerRef.current?.cancel();
    else controllerRef.current?.release();
  }

  const held = feedback.state === "listening" || feedback.state === "holding";
  return (
    <>
      {available && (
        <button
          aria-label="Hold to speak a command"
          aria-pressed={held}
          aria-busy={feedback.state === "processing"}
          className="game-route-control-button is-gamepad is-microphone"
          disabled={!enabled || feedback.state === "processing"}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            start(event.pointerId);
          }}
          onPointerUp={(event) => release(event.pointerId)}
          onPointerCancel={(event) => release(event.pointerId, true)}
          onLostPointerCapture={(event) => release(event.pointerId, true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              pressRef.current = null;
              controllerRef.current?.cancel();
            } else if ((event.key === " " || event.key === "Enter") && !event.repeat) {
              event.preventDefault();
              start(event.key);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              release(event.key);
            }
          }}
          onBlur={() => {
            if (typeof pressRef.current === "string") {
              pressRef.current = null;
              controllerRef.current?.cancel();
            }
          }}
          title="Hold to speak; release to send"
          type="button"
        >
          <Mic aria-hidden="true" size={20} />
        </button>
      )}
      {feedback.message && <span className="game-route-voice-status" role="status">{feedback.message}</span>}
    </>
  );
}
