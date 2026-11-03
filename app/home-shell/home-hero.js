"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import HeroStage from "./hero-stage";

const SLIDE_DURATION_MS = 8000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export default function HomeHero({ catalog, featuredGame }) {
  const slides = [featuredGame, ...catalog.filter((game) => game.target !== featuredGame.target)];
  const slideCount = slides.length;
  const [slideIndex, setSlideIndex] = useState(0);
  const [rotationPaused, setRotationPaused] = useState(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(false);
  const [hasPointer, setHasPointer] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isPaused = rotationPaused ?? prefersReducedMotion;
  const isCountingDown = isPageVisible && !isPaused && !hasPointer && !hasFocus;

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const updatePreference = () => setPrefersReducedMotion(query.matches);

    updatePreference();
    query.addEventListener("change", updatePreference);
    return () => query.removeEventListener("change", updatePreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setIsPageVisible(!document.hidden);

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
  }, []);

  function moveSlide(direction) {
    setRotationPaused(true);
    setSlideIndex((index) => (index + direction + slideCount) % slideCount);
  }

  const currentSlide = slides[slideIndex];
  const RotationIcon = isPaused ? Play : Pause;

  return (
    <HeroStage
      carouselProps={slideCount > 1 ? {
        "aria-label": "Featured games",
        "aria-roledescription": "carousel",
        onPointerEnter: (event) => setHasPointer(event.pointerType === "mouse"),
        onPointerLeave: () => setHasPointer(false),
        onFocusCapture: () => setHasFocus(true),
        onBlurCapture: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHasFocus(false);
          }
        },
      } : undefined}
      controls={slideCount > 1 ? (
        <div className="hero-carousel-controls" role="group" aria-label="Slideshow controls">
          <button type="button" aria-label="Previous game" onClick={() => moveSlide(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="hero-carousel-count" aria-live={isPaused ? "polite" : "off"} aria-atomic="true">
            <span aria-hidden="true">{slideIndex + 1}/{slideCount}</span>
            <span className="hero-carousel-announcement">
              {currentSlide.displayTitle}, slide {slideIndex + 1} of {slideCount}
            </span>
          </span>
          <button type="button" aria-label="Next game" onClick={() => moveSlide(1)}>
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button
            className="hero-carousel-rotation"
            type="button"
            aria-label={isPaused ? "Resume slideshow" : "Pause slideshow"}
            onClick={() => setRotationPaused(!isPaused)}
          >
            <svg className="hero-carousel-ring" viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="17" className="hero-carousel-ring-track" />
              <circle
                key={slideIndex}
                cx="18"
                cy="18"
                r="17"
                pathLength="1"
                className="hero-carousel-ring-progress"
                style={{
                  animationDuration: `${SLIDE_DURATION_MS}ms`,
                  animationPlayState: isCountingDown ? "running" : "paused",
                }}
                onAnimationEnd={() => setSlideIndex((index) => (index + 1) % slideCount)}
              />
            </svg>
            <RotationIcon size={15} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      featuredGame={currentSlide}
      gameCount={catalog.length}
      isHomePage
      isInitialSlide={slideIndex === 0}
    />
  );
}
