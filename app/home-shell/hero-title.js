"use client";

import { useLayoutEffect, useRef } from "react";

export default function HeroTitle({ title, children }) {
  const headingRef = useRef(null);
  const textRef = useRef(null);

  useLayoutEffect(() => {
    const heading = headingRef.current;
    const text = textRef.current;
    let active = true;

    function fit() {
      if (!active) return;
      const maximum = parseFloat(getComputedStyle(heading).fontSize);
      let low = 1;
      let high = maximum;
      text.style.fontSize = `${maximum}px`;
      if (text.scrollHeight <= heading.clientHeight && text.scrollWidth <= heading.clientWidth) return;
      for (let step = 0; step < 12; step++) {
        const size = (low + high) / 2;
        text.style.fontSize = `${size}px`;
        if (text.scrollHeight <= heading.clientHeight && text.scrollWidth <= heading.clientWidth) low = size;
        else high = size;
      }
      text.style.fontSize = `${low}px`;
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

  return <h1 ref={headingRef}><span className="hero-title-text" ref={textRef}>{children}</span></h1>;
}
