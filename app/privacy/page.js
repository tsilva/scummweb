import Link from "next/link";
import { connection } from "next/server";
import { getPrivacyRequestDelivery } from "../../lib/privacy-request-delivery.mjs";
import { PrivacyChoicesButton } from "../../lib/privacy-consent/controls";
import PrivacyRequestForm from "./privacy-request-form";
import styles from "./privacy.module.css";

export const metadata = {
  title: "Privacy Policy | ScummWEB",
  description: "How ScummWEB handles game saves, optional Dropbox sync, analytics, and privacy requests.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  await connection();
  const intakeAvailable = Boolean(getPrivacyRequestDelivery());
  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/">Back to ScummWEB</Link>
      <h1>ScummWEB Privacy Policy</h1>
      <a className={styles.controllerLink} href="#privacy-correspondence">Controller and privacy requests</a>

      <section aria-labelledby="local-data">
        <h2 id="local-data">Games and saves</h2>
        <p>
          ScummWEB stores your imported games, settings, saves, and Recently Played activity in your browser.
          We use this storage to provide the gameplay and save features you request. Your browser keeps this
          information until you remove it
          or the browser clears it. You can export saves from Settings, under Saved games. Export any saves you
          want to keep before clearing ScummWEB’s site data.
        </p>
      </section>

      <section aria-labelledby="dropbox-sync">
        <h2 id="dropbox-sync">Optional Dropbox sync</h2>
        <p>
          When you connect Dropbox, your browser syncs saves and Recently Played activity directly to
          ScummWEB’s app folder in your own Dropbox account. Activity can include when you last played,
          playtime, and recorded story progress. ScummWEB stores your Dropbox account ID and authorization
          credentials in your browser to keep the connection working.
        </p>
        <p>
          Sync is optional. Our legal basis for this processing is your consent when you choose to connect and
          authorize access in Dropbox. You can withdraw consent by disconnecting or
          {" "}<a href="https://help.dropbox.com/integrations/third-party-apps">revoking access in Dropbox</a>.
          Disconnecting removes the credentials from that browser. Local saves and connection records can
          remain until you clear site data. Dropbox copies remain in your account until you remove them, subject
          to Dropbox’s own retention and recovery rules. <a href="https://www.dropbox.com/privacy">Dropbox Privacy Policy</a>
        </p>
      </section>

      <section aria-labelledby="site-operation">
        <h2 id="site-operation">Hosting and security</h2>
        <p>
          Vercel hosts ScummWEB and Cloudflare delivers game assets. They handle technical request information
          to deliver and protect the site. This can include IP addresses, requested URLs, and browser information.
          We rely on our legitimate interests in operating and securing ScummWEB. Request logs available to us
          expire under the providers’ logging settings. If we save an extract to investigate a problem, we keep
          it until the investigation and any necessary follow-up are complete, or longer when required by law.
          Vercel and Cloudflare explain how they retain data for their own purposes in their privacy notices.
          {" "}<a href="https://vercel.com/legal/privacy-notice">Vercel Privacy Notice</a>
          {" · "}<a href="https://www.cloudflare.com/privacypolicy/">Cloudflare Privacy Policy</a>
        </p>
      </section>

      <section aria-labelledby="analytics">
        <h2 id="analytics">Analytics</h2>
        <p>
          Optional analytics are off until you allow them. If you opt in, Google Analytics measures site
          visits and catalog game launches using cookies and browser identifiers. We set Google’s event data
          retention to two months and user data retention to 14 months, with the user data period resetting
          on new activity. Google keeps standard aggregate reports separately.
          {" "}<a href="https://support.google.com/analytics/answer/7667196">Google Analytics retention</a>
        </p>
        <p>
          With your permission, Vercel Web Analytics measures site traffic using an identifier derived from
          the web request. Vercel discards that identifier after 24 hours. Reports follow its separate reporting window.
          {" "}<a href="https://vercel.com/docs/analytics/privacy-policy">Vercel Web Analytics privacy</a>
          {" · "}<a href="https://vercel.com/docs/analytics/limits-and-pricing#what-is-the-reporting-window">Reporting windows</a>
        </p>
        <p>
          At the bottom of the homepage hero, choose <strong>Accept both</strong> or <strong>Reject both</strong>.
          Use <PrivacyChoicesButton className="privacy-choices-link" /> in the hero, the site footer, or here to manage
          analytics and error diagnostics separately or withdraw consent at any time.
        </p>
      </section>

      <section aria-labelledby="diagnostics">
        <h2 id="diagnostics">Errors, bug reports, and voice commands</h2>
        <p>
          With your consent, Sentry receives automatic browser diagnostics to help fix errors. Separately,
          ScummWEB uses Sentry to diagnose server errors. If you submit an in-game bug report, Sentry receives
          your description, technical details, and sometimes a copy of a game save. For server diagnostics and
          reports you send, we rely on our legitimate interests in keeping ScummWEB reliable and investigating problems.
          ScummWEB uses Sentry’s EU storage region. Sentry’s retention period for errors, feedback, and
          attachments on the current plan is 30 days.
          {" "}<a href="https://docs.sentry.io/security-legal-pii/security/data-retention-periods/">Sentry retention</a>
        </p>
        <p>
          If you use voice commands in a supported game, your browser’s speech recognition service may process
          audio online. Your browser manages microphone permission and its speech service.
        </p>
      </section>

      <section aria-labelledby="privacy-correspondence">
        <h2 id="privacy-correspondence">Controller and privacy requests</h2>
        <p>Tiago Silva is the data controller for ScummWEB.</p>
        <p>
          Use the form at the end of this page for privacy requests. We use your reply address, message, and any
          information needed to handle the request. We process requests about your privacy rights to comply with
          our legal obligations. For other enquiries, we rely on our legitimate interest in responding. We keep
          submissions and correspondence while the request is open. After closing it, we delete the contents
          when no longer needed for follow-up, to document how we handled it, or to meet a legal obligation.
        </p>
        <p>
          When the form is available, Resend sends your request to a DuckDuckGo address, and DuckDuckGo Email
          Protection forwards it to our private Gmail mailbox. Resend processes
          your reply address, message, request type and reference in the United States and retains email
          contents and delivery logs for 30 days on the plan we use. Its data processing agreement includes
          the European Commission’s Standard Contractual Clauses for international transfers.
          {" "}<a href="https://resend.com/security/gdpr">Resend storage and retention</a>
          {" · "}<a href="https://resend.com/legal/dpa">Resend transfer terms</a>
          {" · "}<a href="https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection/">DuckDuckGo forwarding</a>
          {" · "}<a href="https://policies.google.com/privacy">Google privacy policy</a>
        </p>
      </section>

      <section aria-labelledby="international-transfers">
        <h2 id="international-transfers">International transfers</h2>
        <p>
          Vercel and Cloudflare can process request data outside the European Economic Area. Their data
          processing terms include the European Commission’s Standard Contractual Clauses for restricted
          transfers. Sentry stores ScummWEB diagnostics in the EU and describes safeguards for international
          access and processing in its transfer terms. Google describes the safeguards used for analytics data.
          {" "}<a href="https://vercel.com/legal/dpa">Vercel transfer terms</a>
          {" · "}<a href="https://www.cloudflare.com/cloudflare-customer-dpa/">Cloudflare transfer terms</a>
          {" · "}<a href="https://sentry.io/trust/">Sentry transfer terms</a>
          {" · "}<a href="https://business.safety.google/adsdatatransfers/">Google transfer terms</a>
        </p>
        <p>
          If you connect Dropbox, Dropbox explains where it processes data in your account and which safeguards
          apply. Use the form below for more information or a copy of applicable safeguards.
          {" "}<a href="https://www.dropbox.com/privacy">Dropbox transfer information</a>
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your privacy rights</h2>
        <p>
          Where applicable, you can ask to access, correct, delete, restrict, or receive a copy of your personal
          data. You can also object to processing, withdraw consent where it applies, or lodge a complaint
          with your local data protection authority.
        </p>
        <p>
          If we need more information to find a record or verify a request, we’ll ask for what’s needed. If we
          can’t match a record to you, we’ll explain that where possible. If you reported a bug, the game and
          approximate submission time can help us find the report. You manage ordinary save copies directly in
          your browser and Dropbox.
        </p>
      </section>

      <section className={styles.request} aria-labelledby="submit-request">
        <h2 id="submit-request">Submit a privacy request</h2>
        {intakeAvailable ? <PrivacyRequestForm /> : <p>The privacy request form is temporarily unavailable.</p>}
      </section>
    </main>
  );
}
