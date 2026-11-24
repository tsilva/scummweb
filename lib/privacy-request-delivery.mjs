import { isPrivacyRequestEmail } from "./privacy-request.mjs";

export function getPrivacyRequestDelivery() {
  const apiKey = process.env.SCUMMWEB_PRIVACY_REQUEST_RESEND_API_KEY?.trim();
  const from = process.env.SCUMMWEB_PRIVACY_REQUEST_FROM?.trim();
  const to = process.env.SCUMMWEB_PRIVACY_REQUEST_TO?.trim();
  if (!apiKey || !isPrivacyRequestEmail(from) || !isPrivacyRequestEmail(to)) return null;
  return { apiKey, from, to };
}

export async function sendPrivacyRequest(delivery, { site, siteName, reference, type, replyTo, message }) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${delivery.apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `privacy-request/${site}/${reference}`,
    },
    body: JSON.stringify({
      from: delivery.from,
      to: [delivery.to],
      reply_to: replyTo,
      subject: `[${siteName}] Privacy request`,
      text: `Request type: ${type}\nReference: ${reference}\n\n${message}`,
    }),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    return false;
  }
  const result = await response.json();
  return typeof result?.id === "string" && result.id.length > 0;
}
