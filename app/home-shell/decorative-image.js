export default function DecorativeImage({
  className,
  fetchPriority,
  loading = "lazy",
  src,
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
      src={src}
      style={style}
    />
  );
}
