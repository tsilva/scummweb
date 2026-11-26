# Production delivery

Use the [build and release skill](../.codex/skills/scummweb_build-release/SKILL.md)
for agent-operated builds, deployments and production verification.

[CI](../.github/workflows/ci.yml) runs the application gates and Dependency
Review in parallel. CI calls `tsilva/.github` on `main` for Dependency Review
and the Node and pnpm setup. The shared setup installs from ScummWEB's lockfile
and runs the [local application checks](../.github/actions/node-pnpm-checks/action.yml).
CI reports the results under the required `Dependency security and application
gates` and `Dependency review` checks.
Both checks must pass on the current `main` push before
[Production delivery](../.github/workflows/production-delivery.yml) can proceed.
Delivery scans for committed secrets, then calls a pinned shared workflow that
rechecks completed CI on that exact commit and syncs the Production allowlist
from Infisical.
A separate job builds and stages the artifact on Vercel, checks the deployment
and its function inventory, and rechecks the head of `main` before promotion.
Vercel's automatic Git deployments are disabled.

The standalone [secret-scanning workflow](../.github/workflows/secret-scanning.yml)
calls the shared scanner on `tsilva/.github` `main` for every branch push. It
scans commits reachable from the pushed tip and absent from the previous tip.
If a history rewrite leaves the previous tip unavailable at checkout, it scans
all history reachable from the new tip. Production delivery scans the checked-out
files by default.

CI and the separate Vercel staging job prepare a complete ScummVM bundle before
testing or building the app. Both jobs use a shared cache key derived from the
runner platform and tracked runtime build inputs. Browser-tool installs and
test-only edits leave that key unchanged. A cache miss builds the pinned engine
and its corresponding source archive. Both jobs verify the runtime and archive
checksums, and Vercel staging checks them again in the finished deployment artifact.

Automatic delivery accepts only successful main-push CI from this repository,
for the same SHA as the delivery run and the current head of `main`. The CI
workflow path, immutable repository IDs, run ID and rerun attempt are checked
again against GitHub before secret access. Failed, cancelled, forked, stale or
superseded runs cannot deploy. Manual and secret-change relay dispatches remain
available, but fail immediately if the latest exact-commit CI is not already
successful. CI artifacts and caches are not imported into the trusted sync job.

The [pinned trust contract](https://github.com/tsilva/.github/blob/5c2df7794a257d5fba85d3c5b99ae649134efee5/.github/actions/production-delivery/README.md)
defines the OIDC policy, caller-to-vault mapping, and allowlist. The trusted
sync job keeps application secrets inside its boundary. Vercel supplies
runtime secrets at deployment. Keep **Require Separate Values** enabled and
classify public settings in the pinned `configNames` list. Disable redundant
native Infisical syncs once delivery has successfully replaced them.

The GitHub Production environment holds `VERCEL_TOKEN` and the source-map
credential `SENTRY_AUTH_TOKEN`. Rotate the deployment token before its
one-year expiry. When rotating the Sentry credential in Infisical, update
the GitHub environment secret before running delivery. The build reads the
public browser DSN from Vercel.

The Infisical webhook relay can dispatch the same workflow on `main`.
Its signed webhook is scoped to `prod`, `/`, and `secrets.modified`.
Confirm activation and per-app delivery before relying on it. A relay or
dispatch acknowledgement confirms acceptance. Check the exact commit's
workflow and Vercel Production status for deployment success.

After fixing a failed gate, use **Actions → Production delivery → Run
workflow → main**. To stage a Production-configured artifact without
assigning production domains, use **Stage prebuilt deployment** from
`main`. Its run summary links to the staged deployment.

## Dependency updates

[Dependabot](../.github/dependabot.yml) groups npm and GitHub Actions patch and
minor version updates into one Monday pull request for manual review. Both
ecosystems use a seven-day release cooldown. Open a separate pull request for
major upgrades. Dependabot security updates follow their own policy.

After you merge a Dependabot pull request, the update follows the main-push CI
and Production delivery path.

## Privacy request intake

`/privacy` displays a direct email link to the existing DuckDuckGo Email
Protection alias in `SCUMMWEB_PRIVACY_REQUEST_TO`. The page reads the value at
runtime and displays it only if it is an `@duck.com` address. Use the public
forwarding alias in this setting and keep the destination mailbox private.

Manage the Production value in ScummWEB's Infisical `prod` root and let the
existing delivery workflow sync it to Vercel. A change can dispatch Production
delivery through the Infisical webhook. Verify that the deployed policy shows
the expected alias and that the alias forwards to the monitored inbox.

Track the date each rights request arrives. Respond within one month. If a lawful
extension is needed, explain the reason within that month and record the revised
deadline. Verify the requester only to the extent needed to handle the request.
Use the report ID, or the game and approximate submission time, to look for an
in-game bug report in Sentry.

## Production performance audits

Lighthouse CI runs after successful Production delivery, or by manual dispatch.
It uses the exact Lighthouse version pinned in the package lock, the standard
simulated desktop settings, and three runs. Existing analytics request exclusions
remain; application and Cloudflare bot-protection scripts are included.

The run summary lists every score and identifies Lighthouse's representative run
using its median FCP/TTI selection. The `lighthouse` artifact retains every HTML
and JSON report plus traces and network logs for seven days. Cookie and authorization
values are removed in memory before artifacts are written. Automatic audits
require all samples to match the triggering Production deployment; mixed or
superseded deployments fail verification. Manual audits report the deployment
actually measured. Run `node --test test/lighthouse-ci.test.mjs` for collector
validation without launching a browser.

## Game-library publishing

For agent-operated unchanged demo uploads and the reviewed Queen lossless recipe, use the separately provisioned and
reviewed [game-only Runbox connection](game-publishing.md). Artwork access does
not grant game publishing access.

Game ZIPs ship separately from the app. Name each archive `<gameId>.zip`
using [the catalog](../scummvm-shell/games.json) and put game files at its
root. The public bucket must allow cross-origin GETs from ScummWEB.
Catalog downloads and artwork use `https://games.scummweb.tsilva.eu`.
The player also fetches saved ZIP links to the former official hostname through
the current hostname. It keeps existing save and browser cache identities,
including each archive's filename and query string. Keep the old hostname
serving directly from the same bucket for older clients and external links.
Keep notices under `/launcher/notices/`.
Reviewed revisions may instead select a checksum-derived immutable filename in
`data/game-downloads.json`; see [revised game downloads](game-downloads.md).
Publish and verify that object before deploying its selection, and retain the
old object for older clients. Download revisions must preserve compatible saves.

Use `dist/games` or set `SCUMMVM_GAMES_UPLOAD_DIR` to a staged payload
directory. For an additive release, publish only the selected archive, for
example Sołtys.

```sh
pnpm run publish:games --game soltys.zip
```

Existing objects are skipped by default. `--force` overwrites them.
The game publisher signs payloads with SHA-256 and avoids optional AWS chunked
checksum trailers for R2 compatibility. Archives up to 5 MiB use one PUT with
a content checksum and conditional creation unless overwriting was requested;
larger files use sequential 5 MiB multipart transfers, with per-part checksums,
progress, and conditional completion. Private owner-only receipts under ignored
`.internal/evidence/game-publishing/` retain completed parts after a failure.
Retrying the same exact archive resumes its session; changed bytes or metadata
use a different receipt. Successful completion removes the receipt. Concurrent
publishers of the same archive are rejected. Receipts contain no credentials.
Requests use a 10-second connection
timeout, a 120-second read timeout, and at most two attempts. Stage messages are
flushed immediately; SDK failures report their category and HTTP status without
provider details. After a failed transfer, check the public object before retrying.
Transfers omit the optional `Expect: 100-continue` handshake for compatibility
with HTTPS forwarding transports; TLS and payload signing remain enabled.
For a connection that repeatedly closes during SDK part uploads, an explicit
`SCUMMVM_R2_HTTP2=1` selects curl's negotiated HTTP/2 for multipart bodies.
The existing SDK signs a 15-minute URL bound to the part, length and MD5;
curl receives it over stdin with no service keys, credential environment,
redirects or persistent URL files. Only game bytes enter an owner-only temporary
file, removed after the request. TLS verification remains enabled, each request
is limited to ten minutes, and failures preserve the same upload receipt.
This option requires an HTTP/2-enabled curl; it does not select another endpoint
or credential source. Verify the completed public archive's SHA-256 as usual.
`--prune` deletes remote game objects absent locally within the selected
scope. Without `--game`, it can prune the entire game library. The
`artwork/` namespace is reserved and excluded.

The manual launcher pins the `scummvm-games` bucket and passes the R2
write pair from ScummWEB Development `/` to the publishing subprocess.
Agents require explicit authorization for that credential operation until
a compatible broker is reviewed. Rotate the scoped R2 token before expiry,
update both Development entries, verify a scoped synthetic upload, clean
it up, then revoke and verify rejection of the old token. The documented
publisher token expires **October 15, 2027**.

Verify the hosted ZIP and refresh its fingerprint before deploying a new
catalog entry with `node scripts/generate-bundled-game-files.mjs --remote TARGET`.
This refreshes only that target from the bucket, preserving other fingerprints.
Use the separate [artwork publishing flow](maintaining-scummweb.md#artwork-storage-and-publishing)
for images.
