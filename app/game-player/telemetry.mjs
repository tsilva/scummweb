export function withGameTelemetry(href, current) {
  const launch = new URL(current);
  if (launch.searchParams.get("telemetry") !== "1") return href;
  const destination = new URL(href, launch);
  if (destination.origin !== launch.origin) return href;
  destination.searchParams.set("telemetry", "1");
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
