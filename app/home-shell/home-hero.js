"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import HeroStage from "./hero-stage";
import { getHeroPreloadImages } from "./hero-images.mjs";
import { chooseGameVersion, getGameFamilyKey, readChosenVersion, rememberGameVersion } from "../game-versions.mjs";
import { buildGameExitHref } from "./hero-selection.mjs";
import { useGameNavigation } from "./game-navigation";

const SLIDE_DURATION_MS = 8000;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const MOBILE_QUERY = "(max-width: 48rem)";

export default function HomeHero({ groups, featuredGame, isHomePage = true, selection = null, navigationId = 0, notice }) {
  const router = useRouter();
  const selectGame = useGameNavigation();
  const featuredKey = getGameFamilyKey(featuredGame) || `catalog:${featuredGame.target}`;
  const slides = groups.map((group) => ({ ...group, id: group.key }));
  const slideCount = slides.length;
  const routeKey = `${isHomePage}:${featuredKey}:${selection}:${navigationId}`;
  const [selectedSlide, setSelectedSlide] = useState(null);
  const [mobileHero, setMobileHero] = useState(null);
  const isMobile = mobileHero?.matches ?? false;
  const selectedId = selectedSlide?.routeKey === routeKey ? selectedSlide.id : null;
  const requestedId = selection;
  const slideIndex = Math.max(0, slides.findIndex(({ id }) => id === (selectedId ?? requestedId ?? featuredKey)));
  const currentSlide = slides[slideIndex];
  const [chosen, setChosen] = useState(null);
  const versionKeys = JSON.stringify(currentSlide.versions.map(({ key, status }) => [key, status]));
  const version = chooseGameVersion(currentSlide.versions, chosen?.group === currentSlide.id ? chosen.key : null);
  useEffect(() => {
    const language = new Intl.DisplayNames(["en"], { type: "language" }).of(navigator.language.split("-")[0]);
    const preferred = chooseGameVersion(currentSlide.versions, readChosenVersion(currentSlide.id), language);
    setChosen({ group: currentSlide.id, key: preferred.key });
  }, [currentSlide.id, versionKeys]);
  const preloadedImages = useRef(new Map());
  const preloadKey = JSON.stringify(isMobile
    ? getHeroPreloadImages([currentSlide], 0) : getHeroPreloadImages(slides, slideIndex));
  const [rotation, setRotation] = useState(null);
  const rotationPaused = rotation?.routeKey === routeKey ? rotation.paused : null;
  function setRotationPaused(paused) { setRotation({ routeKey, paused }); }
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(false);
  const [hasPointer, setHasPointer] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isPaused = rotationPaused ?? (!isHomePage || Boolean(requestedId) || prefersReducedMotion);
  const isCountingDown = !isMobile && isPageVisible && !isPaused && !hasPointer && !hasFocus;

  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobileHero({ matches: query.matches });
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const nextImages = new Map();
    for (const props of JSON.parse(preloadKey)) {
      const key = JSON.stringify(props);
      let picture = preloadedImages.current.get(key);
      if (!picture) {
        picture = document.createElement("picture");
        picture.hidden = true;
        if (props.avifSrcSet) {
          const source = document.createElement("source");
          source.type = "image/avif";
          source.sizes = props.sizes;
          source.srcset = props.avifSrcSet;
          picture.append(source);
        }
        const image = new Image();
        picture.append(image);
        document.body.append(picture);
        image.decoding = "async";
        image.fetchPriority = "low";
        image.sizes = props.sizes;
        if (props.srcSet) image.srcset = props.srcSet;
        image.src = props.src;
        // Decode offscreen, keeping these images alive until they leave the window.
        void image.decode().catch(() => {});
      }
      nextImages.set(key, picture);
    }
    for (const [key, picture] of preloadedImages.current) {
      if (!nextImages.has(key)) picture.remove();
    }
    preloadedImages.current = nextImages;
  }, [preloadKey]);

  useEffect(() => () => {
    for (const picture of preloadedImages.current.values()) picture.remove();
    preloadedImages.current.clear();
  }, []);

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

  function advanceSlide(direction, navigate = true) {
    const next = slides[(slideIndex + direction + slideCount) % slideCount];
    setSelectedSlide({ routeKey, id: next.id });
    if (navigate) {
      setRotationPaused(true);
      if (!selectGame?.(next.game)) router.push(buildGameExitHref(next.game), { scroll: false });
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  const RotationIcon = isPaused ? Play : Pause;

  return (
    <HeroStage
      carouselProps={!isMobile && slideCount > 1 ? {
        "aria-label": "Game slideshow",
        "aria-roledescription": "carousel",
        onPointerOver: (event) => setHasPointer(
          event.pointerType === "mouse" && !event.target.closest(".hero-carousel-controls"),
        ),
        onPointerLeave: () => setHasPointer(false),
        onFocusCapture: (event) => setHasFocus(!event.target.closest(".hero-carousel-controls")),
        onBlurCapture: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHasFocus(false);
          }
        },
      } : undefined}
      controls={!isMobile && slideCount > 1 ? (
        <div className="hero-carousel-controls" role="group" aria-label="Slideshow controls">
          <button type="button" aria-label="Previous game" onClick={() => advanceSlide(-1)}>
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="hero-carousel-count" aria-live={isPaused ? "polite" : "off"} aria-atomic="true">
            <span aria-hidden="true">{slideIndex + 1}/{slideCount}</span>
            <span className="hero-carousel-announcement">
              {currentSlide.game.displayTitle}, slide {slideIndex + 1} of {slideCount}
            </span>
          </span>
          <button type="button" aria-label="Next game" onClick={() => advanceSlide(1)}>
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
                onAnimationEnd={() => advanceSlide(1, false)}
              />
            </svg>
            <RotationIcon size={15} fill="currentColor" aria-hidden="true" />
          </button>
        </div>
      ) : null}
      featuredGame={version.game}
      sourceAction={version.source ? undefined : version.action}
      sourceVersion={version.source ? version : undefined}
      versions={currentSlide.versions}
      selectedVersionKey={version.key}
      onVersionChange={(key) => {
        setChosen({ group: currentSlide.id, key });
        rememberGameVersion(currentSlide.id, key);
        setRotationPaused(true);
      }}
      onLaunch={() => rememberGameVersion(currentSlide.id, version.key)}
      notice={notice}
      isHomePage={isHomePage}
      isInitialSlide={!selectedId && !requestedId}
    />
  );
}
