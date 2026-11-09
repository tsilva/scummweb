"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Minimize2 } from "lucide-react";
import { getArtworkImageProps, getArtworkPlaceholderStyle } from "./artwork-image-props.mjs";
import DecorativeImage from "./decorative-image";
import { useArtworkDelivery } from "./artwork-delivery";

export default function GameScreenshots({ game }) {
  const artwork = useArtworkDelivery();
  const [selected, setSelected] = useState(null);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const strip = useRef(null);
  const thumbnails = useRef([]);
  const viewer = useRef(null);
  const shots = game.screenshots || [];
  const fullImage = selected === null ? null : getArtworkImageProps(shots[selected], "gallery", artwork);

  useEffect(() => {
    if (!strip.current || showThumbnails) return;
    if (typeof IntersectionObserver !== "function") {
      setShowThumbnails(true);
      return;
    }
    // Native lazy loading can fetch the entire strip while the hero is painting.
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setShowThumbnails(true);
      observer.disconnect();
    }, { rootMargin: "0px 0px 32px" });
    observer.observe(strip.current);
    return () => observer.disconnect();
  }, [shots.length, showThumbnails]);

  if (!shots.length) return null;
  const { width, height } = getArtworkImageProps(shots[0], "gallery", artwork);
  const viewerStyle = width > 0 && height > 0 ? { "--gallery-aspect": `${width} / ${height}` } : undefined;

  function close() {
    const index = selected;
    setSelected(null);
    thumbnails.current[index]?.focus();
  }

  return <section id="game-screenshots" className="game-screenshots content-band" aria-labelledby="game-screenshots-heading">
    <div className="section-header">
      <h2 id="game-screenshots-heading"><span className="section-mark" />Screenshots</h2>
      <span className="game-screenshot-hint">Click to enlarge</span>
    </div>
    <div className="game-screenshot-strip" ref={strip}>
      {shots.map((shot, index) => {
        const image = getArtworkImageProps(shot, "gallery", artwork);
        const thumbnail = <DecorativeImage {...image}
          sizes="(max-width: 48rem) 9rem, calc((min(100vw, 100rem) - 8.5rem) / 3)"
          alt={`${game.displayTitle} screenshot ${index + 1}`} loading="lazy" decoding="async" />;
        return <button key={shot} type="button" className="game-screenshot-thumb artwork-placeholder"
          style={showThumbnails ? undefined : getArtworkPlaceholderStyle(image)}
          ref={(element) => { thumbnails.current[index] = element; }}
          aria-label={`View ${game.displayTitle} screenshot ${index + 1}`}
          aria-expanded={selected === index} aria-controls="game-screenshot-viewer"
          onClick={() => {
            setSelected(index);
            requestAnimationFrame(() => {
              viewer.current?.scrollIntoView({ behavior: "instant", block: "start" });
              viewer.current?.focus({ preventScroll: true });
            });
          }}>
          {showThumbnails ? thumbnail : <noscript>{thumbnail}</noscript>}
        </button>;
      })}
    </div>
    {selected !== null && <div ref={viewer} id="game-screenshot-viewer" className="game-screenshot-viewer"
      role="region" aria-label={`${game.displayTitle} screenshot viewer`} tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setSelected((selected + (event.key === "ArrowLeft" ? -1 : 1) + shots.length) % shots.length);
        }
      }}>
      <div className="game-screenshot-viewer-image" style={viewerStyle}>
        <DecorativeImage src={fullImage.src} width={fullImage.width} height={fullImage.height} placeholder={fullImage.placeholder}
          alt={`${game.displayTitle} screenshot ${selected + 1}`} loading="eager" />
      </div>
      <div className="game-screenshot-toolbar">
        <button type="button" aria-label="Previous screenshot" onClick={() => setSelected((selected + shots.length - 1) % shots.length)}><ChevronLeft size={20} /></button>
        <span aria-live="polite">{selected + 1} / {shots.length}</span>
        <button type="button" aria-label="Next screenshot" onClick={() => setSelected((selected + 1) % shots.length)}><ChevronRight size={20} /></button>
        <button type="button" className="game-screenshot-collapse" onClick={close}><Minimize2 size={17} />Close screenshot</button>
      </div>
    </div>}
  </section>;
}
