"use client";

import { useEffect } from "react";

export default function LaunchButton({ href }) {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign(href);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [href]);

  return (
    <a className="launch-button" href={href}>
      Launch ScummVM
    </a>
  );
}
