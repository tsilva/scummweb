"use client";

import { useLayoutEffect, useRef } from "react";

import { fitHeroTitle } from "./hero-title-fit.mjs";

export default function HeroTitle({ title, children, fit = true }) {
  const headingRef = useRef(null);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    if (!fit) {
      heading?.firstElementChild?.style.removeProperty("font-size");
      if (heading) delete heading.__scummwebTitleFit;
      return;
    }
    let active = true;

    function fitHeading() {
      if (!active) return;
      fitHeroTitle(heading);
    }

    fitHeading();
    const observer = new ResizeObserver(fitHeading);
    observer.observe(heading);
    void document.fonts.ready.then(fitHeading);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [title, fit]);

  return <h1 ref={headingRef}><span className="hero-title-text" suppressHydrationWarning>{children}</span></h1>;
}
