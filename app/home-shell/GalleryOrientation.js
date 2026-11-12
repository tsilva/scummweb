"use client";

import { useEffect, useState } from "react";
import { isTouchMobileClient, lockOrientation } from "../game-player/immersive-mode.mjs";

export default function GalleryOrientation({ children }) {
  const [isTouchMobile, setIsTouchMobile] = useState(false);

  useEffect(() => {
    if (!isTouchMobileClient()) return;
    setIsTouchMobile(true);

    const lockPortrait = () => { void lockOrientation("portrait"); };
    lockPortrait();
    window.addEventListener("pageshow", lockPortrait);
    return () => window.removeEventListener("pageshow", lockPortrait);
  }, []);

  return (
    <div data-mobile-orientation={isTouchMobile ? "portrait" : undefined}>
      <div className="mobile-orientation-message">
        <svg
          aria-hidden="true"
          className="gallery-rotation-icon"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 48 48"
        >
          <rect x="18" y="14" width="16" height="28" rx="3" />
          <path d="M24 37h4M10 29A16 16 0 0 1 30 9M26 3l5 6-6 5" />
        </svg>
        <p role="status">Rotate your device to portrait to browse games.</p>
      </div>
      <div className="gallery-orientation-content">{children}</div>
    </div>
  );
}
