export default function DecorativeImage({
  className,
  decoding = "async",
  fetchPriority,
  height,
  loading = "lazy",
  sizes,
  src,
  srcSet,
  avifSrcSet,
  style,
  width,
}) {
  if (!src) {
    return null;
  }

  const resolvedFetchPriority = fetchPriority || (loading === "lazy" ? "low" : undefined);

  const image = (
    <img
      alt=""
      className={className}
      decoding={decoding}
      fetchPriority={resolvedFetchPriority}
      height={height}
      loading={loading}
      sizes={sizes}
      src={src}
      srcSet={srcSet}
      style={style}
      width={width}
    />
  );
  return avifSrcSet ? <picture><source type="image/avif" srcSet={avifSrcSet} sizes={sizes} />{image}</picture> : image;
}
