const promptCountries = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
  "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK",
  "IS", "LI", "NO", "GB",
]);

export function GET(request) {
  const country = request.headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
  const countryKnown = /^[A-Z]{2}$/.test(country) && country !== "XX" && country !== "ZZ";

  return Response.json({ showPrompt: !countryKnown || promptCountries.has(country), countryKnown }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
