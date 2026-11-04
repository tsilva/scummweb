"use client";

import { useLayoutEffect, useRef } from "react";

import { fitHeroTitle } from "./hero-title-fit.mjs";

export default function HeroTitle({ title, children }) {
  const headingRef = useRef(null);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    let active = true;

    function fit() {
      if (!active) return;
      fitHeroTitle(heading);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(heading);
    void document.fonts.ready.then(fit);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [title]);

  return <h1 ref={headingRef}><span className="hero-title-text" suppressHydrationWarning>{children}</span></h1>;
}
