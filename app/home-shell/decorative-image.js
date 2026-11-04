export default function DecorativeImage({
  className,
  decoding = "async",
  fetchPriority,
  height,
  loading = "lazy",
  sizes,
  src,
  srcSet,
  style,
  width,
}) {
  if (!src) {
    return null;
  }

  const resolvedFetchPriority = fetchPriority || (loading === "lazy" ? "low" : undefined);

  return (
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
}
