export default function DecorativeImage({
  className,
  fetchPriority,
  loading = "lazy",
  sizes,
  src,
  srcSet,
  style,
}) {
  if (!src) {
    return null;
  }

  const resolvedFetchPriority = fetchPriority || (loading === "lazy" ? "low" : undefined);

  return (
    <img
      alt=""
      className={className}
      decoding="async"
      fetchPriority={resolvedFetchPriority}
      loading={loading}
      sizes={sizes}
      src={src}
      srcSet={srcSet}
      style={style}
    />
  );
}
