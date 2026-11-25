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
      <p>Last reviewed <time dateTime="2026-11-25">25 November 2026</time></p>
      <a className={styles.controllerLink} href="#privacy-correspondence">Controller and privacy requests</a>

      <section aria-labelledby="local-data">
        <h2 id="local-data">Games and saves</h2>
        <p>
          ScummWEB stores your imported games, settings, saves, and Recently Played activity in your browser.
          Your browser keeps this information until you remove it or the browser clears it. You can export saves
          from Settings, under Saved games. Export any saves you want to keep before clearing ScummWEB’s site data.
        </p>
        <p>
          We use browser storage to run the games and save features you request, remember your preferences,
          and respect your privacy choices. We rely on our legitimate interests in providing these features
          and respecting your choices where this involves personal data. Your privacy choices stay in your
          browser with the date and notice version until you change them, clear site data, or we ask you to choose again.
        </p>
        <p>
          If you open a game from an external ZIP link, your browser requests the file from that host. The host
          can see technical request information such as your IP address and may use it under its own privacy terms.
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
          Cloudflare proxies and protects ScummWEB and delivers game assets. Vercel hosts the app. Both handle
          technical request information such as IP addresses, requested URLs, and browser information.
          We use the country code Cloudflare derives from your IP address to decide whether to show the privacy prompt.
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
          If you consent to analytics, Google Analytics receives visit and browser information, site pages you
          visit, and details about catalog game launches, load times, and play milestones. We use these measurements
          to understand how people use ScummWEB and where games are slow to start. We set Google’s event data
          retention to two months and user data retention to 14 months, with the user data period resetting
          on new activity. Google keeps standard aggregate reports separately.
          {" "}<a href="https://support.google.com/analytics/answer/7667196">Google Analytics retention</a>
        </p>
        <p>
          Google’s tag sets two ScummWEB cookies. <code>_ga</code> distinguishes browsers and the cookie whose
          name starts with <code>_ga_</code> keeps track of the analytics session. The tag can read both cookies,
          and each has a configured lifetime of 180 days from creation, or less if your browser removes it sooner.
          {" "}<a href="https://support.google.com/analytics/answer/11397207">Google Analytics cookies</a>
        </p>
        <p>
          Open <strong>Settings → Privacy</strong> to manage analytics and error diagnostics separately.
          Changes there save immediately. You can also use <PrivacyChoicesButton className="privacy-choices-link" /> here
          to change or withdraw consent at any time. You can play with both options off. Withdrawal stops future
          collection for the selected purpose and leaves the lawfulness of earlier processing unaffected.
        </p>
      </section>

      <section aria-labelledby="diagnostics">
        <h2 id="diagnostics">Errors, bug reports, and voice commands</h2>
        <p>
          If you consent to error diagnostics, Sentry receives browser errors, logs, and performance measurements
          with technical details such as browser type and page information. We also use Sentry to diagnose server errors. If you send an
          in-game bug report, Sentry receives your description, game and browser details, and any game save you choose
          to attach. Sending a report is optional. We rely on our legitimate interests in keeping ScummWEB reliable
          and investigating problems for server diagnostics and bug reports. To prevent abuse, we use an
          IP-derived rate limit that counts submissions in ten-minute windows.
          ScummWEB uses Sentry’s EU storage region. On our current plan, Sentry retains errors, logs,
          performance traces, feedback, and attachments for 30 days.
          {" "}<a href="https://docs.sentry.io/security-legal-pii/security/data-retention-periods/">Sentry retention</a>
        </p>
        <p>
          If you choose to use voice commands in a supported game, your browser’s speech recognition service may
          process audio online under its own privacy terms. You can turn off microphone access in your browser.
          ScummWEB uses the transcript to enter the command in the game running in your browser.
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
          We use your email address, message, and any information needed to handle the request. We process
          requests about your privacy rights to comply with our legal obligations. For other enquiries, we rely
          on our legitimate interest in responding. We keep correspondence while the request is open. After
          closing it, we delete the contents when no longer needed for follow-up, to document how we handled
          it, or to meet a legal obligation.
        </p>
        <p>
          DuckDuckGo Email Protection forwards your message to the Gmail inbox where we handle privacy requests.
          {" "}<a href="https://duckduckgo.com/duckduckgo-help-pages/email-protection/what-is-duckduckgo-email-protection">DuckDuckGo forwarding</a>
          {" · "}<a href="https://policies.google.com/privacy">Google privacy policy</a>
        </p>
      </section>

      <section aria-labelledby="international-transfers">
        <h2 id="international-transfers">International transfers</h2>
        <p>
          Vercel and Cloudflare can process request data outside the European Economic Area. Their data
          processing terms include the European Commission’s Standard Contractual Clauses for restricted
          transfers. Sentry stores ScummWEB diagnostics in the EU. Sentry and Google describe their use of the
          EU–U.S. Data Privacy Framework where applicable and Standard Contractual Clauses for other restricted transfers.
          {" "}<a href="https://vercel.com/legal/dpa">Vercel transfer terms</a>
          {" · "}<a href="https://www.cloudflare.com/cloudflare-customer-dpa/">Cloudflare transfer terms</a>
          {" · "}<a href="https://sentry.io/legal/dpa/">Sentry transfer terms</a>
          {" · "}<a href="https://business.safety.google/adsdatatransfers/">Google transfer terms</a>
        </p>
        <p>
          Dropbox and the email providers may also process data outside the EEA. Their privacy notices describe
          their processing. <a href="#privacy-correspondence">Contact us</a> for information about an applicable
          transfer or for a copy of its safeguards.
          {" "}<a href="https://www.dropbox.com/privacy">Dropbox transfer information</a>
        </p>
      </section>

      <section aria-labelledby="privacy-rights">
        <h2 id="privacy-rights">Your privacy rights</h2>
        <p>
          Where applicable, you can ask to access, correct, delete, or restrict the use of your personal data.
          You can ask for data you provided in a portable format and request that it be sent to another controller
          where technically feasible. You can withdraw consent at any time. You can also complain to a
          supervisory authority, including Portugal’s
          {" "}<a href="https://www.cnpd.pt/cidadaos/participacoes/">Comissão Nacional de Proteção de Dados (CNPD)</a>.
        </p>
        <p><strong>You have the right to object to processing based on our legitimate interests.</strong></p>
        <p>
          We respond to rights requests within one month. Where the law allows more time, we tell you why within
          that month and may take up to two additional months.
          If we need more information to find a record or verify a request, we’ll ask for what’s needed. If we
          can’t match a record to you, we’ll explain that where possible. If you reported a bug, its report ID or
          the game and approximate submission time can help us find it. You manage ordinary save copies directly in
          your browser and Dropbox.
        </p>
      </section>
    </main>
  );
}
