"use client";

import { getArtworkPlaceholderStyle } from "./artwork-image-props.mjs";

function clearPlaceholder(image) {
  if (image?.complete && image.naturalWidth) image.dataset.artworkLoaded = "true";
}

export default function DecorativeImage({
  alt = "",
  className,
  decoding = "async",
  fetchPriority,
  height,
  loading = "lazy",
  sizes,
  src,
  srcSet,
  avifSrcSet,
  placeholder,
  style,
  width,
}) {
  if (!src) {
    return null;
  }

  const resolvedFetchPriority = fetchPriority || (loading === "lazy" ? "low" : undefined);
  const preview = getArtworkPlaceholderStyle({ placeholder, width, height });

  const image = (
    <img
      key={src}
      alt={alt}
      className={preview ? ["artwork-placeholder", className].filter(Boolean).join(" ") : className}
      decoding={decoding}
      fetchPriority={resolvedFetchPriority}
      height={height}
      loading={loading}
      sizes={sizes}
      src={src}
      srcSet={srcSet}
      style={preview ? { ...style, ...preview } : style}
      width={width}
      ref={preview ? clearPlaceholder : undefined}
      onLoad={preview ? (event) => clearPlaceholder(event.currentTarget) : undefined}
    />
  );
  return avifSrcSet ? <picture><source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />{image}</picture> : image;
}
