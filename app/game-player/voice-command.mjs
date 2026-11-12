export function isZorkVoiceGame({ engineId, gameId } = {}) {
  return engineId === "glk" && /^zork[123]$/.test(gameId);
}

export function getSpeechRecognition(host) {
  if (!host || host.isSecureContext === false) return null;
  const Recognition = host.SpeechRecognition || host.webkitSpeechRecognition;
  return typeof Recognition === "function" ? Recognition : null;
}

function normalizeCommand(transcript) {
  return transcript.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "").trim().toLowerCase();
}

// One held gesture owns one recognition session and at most one submitted command.
export function createVoiceCommand(host, { onState, onCommand, onUnavailable, onCaptureStarted = () => {} }) {
  let session = null;
  let timer = null;

  function clearTimer() {
    if (timer !== null) host.clearTimeout(timer);
    timer = null;
  }

  function cancel() {
    const current = session;
    session = null;
    clearTimer();
    if (current) {
      try { current.recognition.abort(); } catch {}
    }
    onState("idle", "");
  }

  function fail(message, unavailable = false) {
    cancel();
    onState("idle", message);
    if (unavailable) onUnavailable();
  }

  function finish(current) {
    if (session !== current || !current.released || !current.ended) return;
    session = null;
    clearTimer();
    const command = normalizeCommand(current.transcript);
    if (!command) {
      onState("idle", "No speech recognized. Hold the microphone to try again.");
    } else if (command.length > 255 || /[^ -~]/.test(command)) {
      onState("idle", "Try a shorter command in English.");
    } else {
      onState("idle", onCommand(command) ? "" : "Could not send the command. Please try again.");
    }
  }

  return {
    start() {
      if (session) return false;
      const Recognition = getSpeechRecognition(host);
      if (!Recognition) { onUnavailable(); return false; }
      let recognition;
      try { recognition = new Recognition(); } catch {
        onUnavailable();
        return false;
      }
      const current = { recognition, released: false, ended: false, transcript: "" };
      session = current;
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (session === current) onCaptureStarted();
        // Release can happen while the phone's permission prompt is still open.
        if (session === current && current.released) {
          try { recognition.stop(); } catch { fail("Could not finish recording. Please try again."); }
        }
      };
      recognition.onresult = (event) => {
        if (session !== current) return;
        current.transcript = Array.from(event.results)
          .filter((result) => result.isFinal).map((result) => result[0].transcript).join(" ");
      };
      recognition.onend = () => {
        if (session !== current) return;
        current.ended = true;
        if (!current.released) onState("holding", "Release to send.");
        finish(current);
      };
      recognition.onerror = ({ error }) => {
        if (session !== current) return;
        const unavailable = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"].includes(error);
        fail(unavailable ? "Voice input is unavailable. Use the keyboard instead."
          : "No speech recognized. Hold the microphone to try again.", unavailable);
      };
      onState("listening", "Listening… Release to send.");
      timer = host.setTimeout(() => fail("Recording timed out. Please try again."), 60_000);
      try { recognition.start(); } catch {
        fail("Voice input is unavailable. Use the keyboard instead.", true);
        return false;
      }
      return true;
    },
    release() {
      const current = session;
      if (!current || current.released) return;
      current.released = true;
      if (current.ended) { finish(current); return; }
      clearTimer();
      onState("processing", "Transcribing…");
      timer = host.setTimeout(() => fail("Transcription timed out. Please try again."), 10_000);
      try { current.recognition.stop(); } catch { fail("Could not finish recording. Please try again."); }
    },
    cancel,
  };
}
