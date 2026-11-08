export function withGameTelemetry(href, current) {
  const launch = new URL(current);
  const telemetry = launch.searchParams.get("telemetry") === "1";
  const agentSaveScope = launch.searchParams.get("agentSaveScope");
  if (!telemetry && agentSaveScope === null) return href;
  const destination = new URL(href, launch);
  if (destination.origin !== launch.origin) return href;
  if (telemetry) destination.searchParams.set("telemetry", "1");
  if (agentSaveScope !== null) {
    destination.searchParams.set("agentSaveScope", agentSaveScope);
    const slot = launch.searchParams.get("agentLegacySkySlot");
    if (slot !== null) destination.searchParams.set("agentLegacySkySlot", slot);
  }
  return `${destination.pathname}${destination.search}${destination.hash}`;
}
