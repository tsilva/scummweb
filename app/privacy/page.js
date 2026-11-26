import Link from "next/link";
import { connection } from "next/server";
import { PrivacyChoicesButton } from "../../lib/privacy-consent/controls";
import styles from "./privacy.module.css";

export const metadata = {
  title: "Privacy Policy | ScummWEB",
  description: "How ScummWEB handles game saves, optional Dropbox sync, analytics, and privacy requests.",
  alternates: { canonical: "/privacy" },
};

export default async function PrivacyPage() {
  await connection();
  const email = process.env.SCUMMWEB_PRIVACY_REQUEST_TO?.trim() ?? "";
  const privacyEmail = /^[a-z0-9][a-z0-9._-]{0,63}@duck\.com$/i.test(email) ? email : null;
  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/">Back to ScummWEB</Link>
      <h1>ScummWEB Privacy Policy</h1>
      <p>Last reviewed <time dateTime="2026-11-26">26 November 2026</time></p>
      <a className={styles.controllerLink} href="#privacy-correspondence">Controller and privacy requests</a>

      <section aria-labelledby="local-data">
        <h2 id="local-data">Games and saves</h2>
        <p>
          Imported games, settings, saves, and Recently Played activity stay in your browser until you or your
          browser clear them. We use browser storage to run games, remember preferences, and respect your privacy
          choices. Where this involves personal data, we rely on our legitimate interests in providing those features.
        </p>
        <p>
          Your browser stores your privacy choices, the date, and the notice version until you change your choices,
          clear site data, or we ask you to choose again. When you open an external ZIP link, its host receives
          request data such as your IP address under its own privacy terms.
        </p>
      </section>

      <section aria-labelledby="dropbox-sync">
        <h2 id="dropbox-sync">Optional Dropbox sync</h2>
        <p>
          With your consent, your browser syncs saves and play history, including playtime and story progress,
          directly to your Dropbox account. Your browser stores your Dropbox account ID and credentials to keep
          sync working. You can withdraw consent by disconnecting or
          {" "}<a href="https://help.dropbox.com/integrations/third-party-apps">revoking access in Dropbox</a>.
          Disconnecting removes credentials from that browser. Local saves and connection records may remain until
          you clear site data. Dropbox copies remain until you delete them, subject to Dropbox’s retention and
          recovery rules.
        </p>
      </section>

      <section aria-labelledby="site-operation">
        <h2 id="site-operation">Hosting and security</h2>
        <p>
          Vercel and Cloudflare handle IP addresses, requested URLs, and browser details to deliver and secure
          ScummWEB. We use the country inferred from your IP address to decide whether to show the privacy prompt.
          Our legitimate interests are site operation and security. Request logs expire under provider settings.
          We keep investigation extracts through follow-up or longer if required by law.
        </p>
      </section>

      <section aria-labelledby="analytics">
        <h2 id="analytics">Analytics and cookies</h2>
        <p>
          With consent, Google Analytics measures site use and performance using pages visited, browser details,
          catalog game launches, load times, and play milestones. User-level data is retained for 14 months,
          resetting with new activity, and other event data for two months.
        </p>
        <p>
          Google’s tag sets and can read two analytics cookies for up to 180 days from creation.
          {" "}<code>_ga</code> distinguishes browsers. The cookie starting with <code>_ga_</code> tracks the session.
        </p>
        <p>
          Use <strong>Settings → Privacy</strong> or <PrivacyChoicesButton className="privacy-choices-link" /> to
          withdraw analytics or browser diagnostics consent at any time. You can play with both off. Withdrawal
          stops future collection for that purpose and leaves earlier lawful processing unaffected.
        </p>
      </section>

      <section aria-labelledby="diagnostics">
        <h2 id="diagnostics">Errors, bug reports, and voice commands</h2>
        <p>
          If you opt in to browser diagnostics, Sentry receives errors, logs, performance data, and technical details.
          Sentry also receives server errors and, if you report a bug, your description, game and browser details, and
          any save you attach. We rely on our legitimate interests in fixing problems and preventing abuse for server
          diagnostics, bug reports, and IP-based submission limits. Sentry stores diagnostics and reports in the EU
          for 30 days.
        </p>
        <p>
          If you use voice commands, your browser’s speech service may process audio online under its own terms.
          The game uses the transcript locally. You can revoke microphone access in your browser.
        </p>
      </section>

      <section aria-labelledby="privacy-correspondence">
        <h2 id="privacy-correspondence">Controller and privacy requests</h2>
        <p>Tiago Silva is the data controller for ScummWEB.</p>
        <p>
          {privacyEmail
            ? <>For privacy requests, email <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</>
            : "The privacy email address is temporarily unavailable. Please check back later."}
        </p>
        <p>
          DuckDuckGo Email Protection and Gmail handle correspondence. We use your address, message, and any
          information needed to respond. We handle rights requests to meet legal obligations and other enquiries
          based on our legitimate interest in responding. We retain correspondence while a request is open and
          afterward as needed for follow-up, to document our response, or to meet legal obligations.
        </p>
      </section>

      <section aria-labelledby="international-transfers">
        <h2 id="international-transfers">International transfers</h2>
        <p>
          Vercel and Cloudflare can process request data outside the European Economic Area (EEA). Their terms include
          EU Standard Contractual Clauses for restricted transfers. Sentry and Google describe their use of the
          EU–U.S. Data Privacy Framework where applicable and Standard Contractual Clauses for other restricted transfers.
          {" "}<a href="https://vercel.com/legal/dpa">Vercel transfer terms</a>
          {" · "}<a href="https://www.cloudflare.com/cloudflare-customer-dpa/">Cloudflare transfer terms</a>
          {" · "}<a href="https://sentry.io/legal/dpa/">Sentry transfer terms</a>
          {" · "}<a href="https://business.safety.google/adsdatatransfers/">Google transfer terms</a>
        </p>
        <p>
          Dropbox and email providers may also process data outside the EEA. Use the
          {" "}<a href="#privacy-correspondence">privacy contact</a> to ask about a transfer destination or obtain
          a copy of the applicable safeguards.
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your privacy rights</h2>
        <p>
          Where applicable, you can ask to access, correct, delete, or restrict use of your personal data. You can
          ask for a portable copy of data you provided or ask us to send it directly to another controller where
          technically feasible. You can withdraw consent at any time. You can complain to a data protection authority,
          including where you live or work or where the alleged infringement occurred.
          {" "}<a href="https://www.edpb.europa.eu/about-edpb/our-members_en">Find your data protection authority</a>.
        </p>
        <p><strong>You have the right to object to processing based on our legitimate interests.</strong></p>
        <p>
          We respond to rights requests within one month. If a legal extension is needed, we explain why within that
          month and may take up to two additional months.
        </p>
      </section>
    </main>
  );
}
