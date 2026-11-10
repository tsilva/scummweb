"use client";

import { useEffect } from "react";
import { observeInstalledFullscreenGestures } from "./game-player/immersive-mode.mjs";

export default function InstalledAppFullscreen() {
  useEffect(() => observeInstalledFullscreenGestures(window), []);
  return null;
}
