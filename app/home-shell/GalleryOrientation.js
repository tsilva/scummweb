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
        <p role="status">Rotate your device to portrait to browse games.</p>
      </div>
      <div className="gallery-orientation-content">{children}</div>
    </div>
  );
}
