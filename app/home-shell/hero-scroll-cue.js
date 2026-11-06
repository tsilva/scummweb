"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export default function HeroScrollCue() {
  const [libraryViewed, setLibraryViewed] = useState(false);

  useEffect(() => {
    const firstCard = document.querySelector("#library .poster-entry");
    if (!firstCard) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some(({ isIntersecting, intersectionRatio }) => isIntersecting && intersectionRatio >= 0.5)) return;
      setLibraryViewed(true);
      observer.disconnect();
    }, { threshold: 0.5 });
    observer.observe(firstCard);
    return () => observer.disconnect();
  }, []);

  if (libraryViewed) return null;

  return (
    <a className="hero-scroll-cue" href="#game-screenshots">
      <ChevronDown size={20} aria-hidden="true" />Scroll for screenshots &amp; more games
    </a>
  );
}
