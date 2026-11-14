"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { externalBrowserHref } from "./in-app-browser.mjs";
import "./styles/in-app-browser.css";

export default function InAppBrowserScreen() {
  const [href, setHref] = useState("");
  const [browserHref, setBrowserHref] = useState(null);
  const [copyState, setCopyState] = useState("idle");
  const [showHelp, setShowHelp] = useState(false);
  const instructions = useRef(null);
  const linkInput = useRef(null);

  useEffect(() => {
    function refreshLink() {
      // The address bar still contains the original URL after the server rewrite.
      const url = new URL(window.location.href);
      if (url.pathname === "/in-app-browser") {
        url.pathname = "/";
        url.search = "";
        url.hash = "";
      }
      setHref(url.href);
      setBrowserHref(externalBrowserHref(url.href, navigator.userAgent));
      setCopyState("idle");
    }
    refreshLink();
    window.addEventListener("hashchange", refreshLink);
    return () => window.removeEventListener("hashchange", refreshLink);
  }, []);

  function openBrowser(event) {
    setShowHelp(true);
    if (!browserHref) {
      event.preventDefault();
      instructions.current?.focus();
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(href);
      setCopyState("copied");
    } catch {
      // Clipboard access is often disabled in webviews. Leave a selectable URL.
      setCopyState("manual");
    }
  }

  useEffect(() => {
    if (copyState === "manual") {
      linkInput.current?.focus();
      linkInput.current?.select();
    }
  }, [copyState]);

  const CopyIcon = copyState === "copied" ? Check : Copy;

  return (
    <div className="browser-handoff">
      <header className="browser-handoff-header">
        <img alt="ScummWEB" className="browser-handoff-logo" height="32" src="/logo-nav.png" width="146" />
      </header>
      <main className="browser-handoff-main">
        <img alt="" className="browser-handoff-art" height="190" src="/brand/in-app-browser-doorway.webp" width="342" />
        <h1>Your adventure awaits.</h1>
        <p className="browser-handoff-description">Open ScummWEB in your browser to start playing. Games may not work inside Facebook or other apps.</p>
        <a aria-describedby="browser-handoff-help" className="browser-handoff-open" href={browserHref || "#browser-handoff-instructions"} onClick={openBrowser}>
          Open in browser <ExternalLink aria-hidden="true" size={23} strokeWidth={2.4} />
        </a>
        <p className="browser-handoff-help" id="browser-handoff-help" role="status">
          {showHelp ? "If the app keeps you here, use its menu to open this page in your browser." : "Still here? Use the steps below."}
        </p>
        <section aria-labelledby="browser-handoff-instructions" className="browser-handoff-manual">
          <h2 id="browser-handoff-instructions" ref={instructions} tabIndex={-1}>Open it manually</h2>
          <ol>
            <li>Tap the app’s menu (••• or ⋮).</li>
            <li>Choose “Open in browser” or “Open in Safari”.</li>
          </ol>
          <button className="browser-handoff-copy" disabled={!href} onClick={copyLink} type="button">
            <CopyIcon aria-hidden="true" size={23} /> {copyState === "copied" ? "Link copied" : "Copy link"}
          </button>
          <p className="browser-handoff-copy-status" role="status">
            {copyState === "copied" ? "Paste the link into your browser." : copyState === "manual" ? "Touch and hold the selected link to copy it, then paste it into your browser." : ""}
          </p>
          {copyState === "manual" ? <input aria-label="Link to open in your browser" className="browser-handoff-url" readOnly ref={linkInput} value={href} /> : null}
          <p className="browser-handoff-domain">{href ? new URL(href).host : "scummweb.tsilva.eu"}</p>
        </section>
      </main>
    </div>
  );
}
