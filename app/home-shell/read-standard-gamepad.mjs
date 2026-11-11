export function readStandardGamepad(navigator) {
  try {
    return Array.from(navigator.getGamepads?.() ?? [])
      .find((device) => device?.mapping === "standard") ?? null;
  } catch (error) {
    // Embedded browsers can expose the API while denying access by policy.
    if (error?.name === "SecurityError") return null;
    throw error;
  }
}
