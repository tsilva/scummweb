"use client";

import { useEffect, useRef } from "react";

export default function DashboardNav({ children, overlaysHero }) {
  const navRef = useRef(null);

  useEffect(() => {
    if (!overlaysHero) return;

    const nav = navRef.current;
    const updateScrollState = () => nav.toggleAttribute("data-scrolled", window.scrollY > 0);

    window.addEventListener("scroll", updateScrollState, { passive: true });
    updateScrollState();
    return () => {
      window.removeEventListener("scroll", updateScrollState);
      nav.removeAttribute("data-scrolled");
    };
  }, [overlaysHero]);

  return (
    <nav className={overlaysHero ? "dashboard-nav dashboard-nav-home" : "dashboard-nav"} ref={navRef}>
      {children}
    </nav>
  );
}
