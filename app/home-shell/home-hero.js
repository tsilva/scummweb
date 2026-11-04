"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import HeroStage from "./hero-stage";
import { getHeroPreloadImages } from "./hero-images.mjs";

const SLIDE_DURATION_MS = 8000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export default function HomeHero({ catalog, featuredGame, library }) {
  const catalogSlide = (game) => ({ id: `catalog:${game.target}`, game });
  const slides = [
    catalogSlide(featuredGame),
    ...library.map(({ source, game, action }) => ({ id: `library:${source.id}`, game, action })),
    ...catalog.filter((game) => game.target !== featuredGame.target).map(catalogSlide),
  ];
  const slideCount = slides.length;
  const [selectedId, setSelectedId] = useState(null);
  const slideIndex = Math.max(0, slides.findIndex(({ id }) => id === selectedId));
  const preloadedImages = useRef(new Map());
  const preloadKey = JSON.stringify(getHeroPreloadImages(slides, slideIndex));
  const [rotationPaused, setRotationPaused] = useState(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(false);
  const [hasPointer, setHasPointer] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isPaused = rotationPaused ?? prefersReducedMotion;
  const isCountingDown = isPageVisible && !isPaused && !hasPointer && !hasFocus;

  useEffect(() => {
    const nextImages = new Map();
    for (const props of JSON.parse(preloadKey)) {
      const key = JSON.stringify(props);
      let image = preloadedImages.current.get(key);
      if (!image) {
        image = new Image();
        image.decoding = "async";
        image.fetchPriority = "low";
        image.sizes = props.sizes;
        if (props.srcSet) image.srcset = props.srcSet;
        image.src = props.src;
        // Decode offscreen, keeping these images alive until they leave the window.
        void image.decode().catch(() => {});
      }
      nextImages.set(key, image);
    }
    preloadedImages.current = nextImages;
  }, [preloadKey]);

  useEffect(() => () => preloadedImages.current.clear(), []);

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
    advanceSlide(direction);
  }

  function advanceSlide(direction) {
    setSelectedId(slides[(slideIndex + direction + slideCount) % slideCount].id);
  }

  const currentSlide = slides[slideIndex];
  const RotationIcon = isPaused ? Play : Pause;

  return (
    <HeroStage
      carouselProps={slideCount > 1 ? {
        "aria-label": "Game slideshow",
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
              {currentSlide.game.displayTitle}, slide {slideIndex + 1} of {slideCount}
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
                key={currentSlide.id}
                cx="18"
                cy="18"
                r="17"
                pathLength="1"
                className="hero-carousel-ring-progress"
                style={{
                  animationDuration: `${SLIDE_DURATION_MS}ms`,
                  animationPlayState: isCountingDown ? "running" : "paused",
                }}
                onAnimationEnd={() => advanceSlide(1)}
              />
            </svg>
            <RotationIcon size={15} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      featuredGame={currentSlide.game}
      gameCount={slideCount}
      sourceAction={currentSlide.action}
      isHomePage
      isInitialSlide={slideIndex === 0}
    />
  );
}
