"use client";

import { useEffect, useState } from "react";

const NOTICE_DISMISSED_KEY = "scummvm-project-notice-dismissed";

export default function ProjectNoticeModal({ officialHref, sourceHref }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(NOTICE_DISMISSED_KEY) !== "true") {
        setIsOpen(true);
      }
    } catch {
      setIsOpen(true);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        dismissNotice();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  function dismissNotice() {
    try {
      window.localStorage.setItem(NOTICE_DISMISSED_KEY, "true");
    } catch {}

    setIsOpen(false);
  }

  if (!isReady || !isOpen) {
    return null;
  }

  return (
    <div className="project-notice-modal" role="dialog" aria-modal="true" aria-labelledby="project-notice-title">
      <div className="project-notice-backdrop" onClick={dismissNotice} />
      <div className="project-notice project-notice-panel">
        <p className="project-notice-kicker" id="project-notice-title">
          ScummVM Status
        </p>
        <p>
          This is not the official ScummVM website or a stock ScummVM release. It is an
          unofficial WebAssembly build forked from ScummVM for browser deployment, with source
          and license materials published here to respect ScummVM&apos;s GPL terms.
        </p>
        <div className="project-notice-links">
          <a href={officialHref} onClick={dismissNotice} rel="noreferrer" target="_blank">
            Visit the original ScummVM project
          </a>
          <a href={sourceHref} onClick={dismissNotice}>
            Review source and license
          </a>
        </div>
        <button className="project-notice-dismiss" onClick={dismissNotice} type="button">
          Continue
        </button>
      </div>
    </div>
  );
}
