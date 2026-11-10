# Production delivery

Push to `main` triggers `.github/workflows/production-delivery.yml`. After secret scanning, it calls the trusted workflow in public `tsilva/.github`, pinned to a reviewed full commit SHA. The privileged job checks out only the shared implementation, waits for the exact latest main commit's CI, and syncs its fixed Production allowlist. A separate GitHub Actions job builds and checks that commit's artifact, uploads it to Vercel, and verifies the staged deployment and its function inventory. It rechecks the head of `main` before promoting the deployment. Vercel's automatic Git deployments are disabled.

Infisical remains the source of application secrets. Development uses the existing human CLI login. The shared GitHub reader has Viewer access to the assigned production vaults, and the completed rollout requires its server-side OIDC policy to match the exact approved reusable workflow revision, caller repository IDs, owner ID, main branch and Production context. The trusted `apps.json` selects the source vault and destination from the immutable caller repository ID; app files and inputs cannot change that mapping. The reader itself can access all assigned vaults inside the trusted job. Its token and fetched values never leave that job. The Vercel deployment credential remains in this repository's GitHub Production environment.

The pinned shared source and [trust contract](https://github.com/tsilva/.github/blob/48a4449de4ac5f4d5e14343f70fe5fc57bc2cd74/.github/actions/production-delivery/README.md) are authoritative. Source and destination mappings, credential handling and boundary tests are maintained centrally. The secret sync job runs only shared code. The build receives ScummWEB's source-map credential from the GitHub `Production` environment. When rotating `SENTRY_AUTH_TOKEN` in Infisical, update that environment secret before running production delivery.

Delivery runs on `main` and checks all required source keys and destination targets before secret synchronization. The build reads the public browser DSN from Vercel, uploads source maps to Sentry, and stages the artifact without production domains. Vercel supplies runtime credentials when it creates the deployment. Failed CI, sync, source-map upload, or artifact checks prevent promotion.

Automatic secret-change delivery uses a standalone Cloudflare Worker with a private GitHub App, independent of application deployments. Each vault's signed General webhook is restricted to `prod`, `/`, and `secrets.modified`. The relay receives event metadata and never fetches application secrets. It verifies raw-body HMACs and timestamps, stores pending routing metadata durably, coalesces bursts and retries dispatches during GitHub outages. A per-repository installation token starts only the fixed entry workflow on `main`. The relay endpoint is `https://production-deployment-relay.tsilva-production-delivery.workers.dev/infisical`. Webhook activation and per-app live verification are required before calling the automatic path operational.

Use **Actions → Production delivery → Run workflow → main** to recover after fixing a failed workflow. A relay acknowledgement confirms durable acceptance, and a GitHub dispatch acknowledgement confirms only that the run was accepted. Neither confirms deployment success. There is no polling schedule. Deployment credentials expire after one year and need rotation before expiry.

Native Infisical syncs are disabled after this workflow has successfully replaced them. Updating a deployment credential in GitHub does not replace application keys in Infisical.

**Stage prebuilt deployment** can be run manually from `main`. It builds the
ScummWEB artifact on a standard GitHub runner and uploads it to Vercel with
production settings and `--skip-domain`. The run summary identifies the staged
deployment. The build receives the public browser Sentry DSN. Vercel supplies
private runtime variables when it creates the deployment.

## Game-library publishing

Game publishing is a separate manual operation: `pnpm run publish:games`, optionally with `--game <target-or-folder>`, `--force`, or `--prune`. It fetches only the shared `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` entries from ScummWeb Development (`e1c358f8-0678-45d7-a2a8-270c2f29aadd`, `dev`, `/`) through the existing human Infisical login. The publishing subprocess receives that pair instead of inherited or dotenv credentials, plus the pinned `scummvm-games` bucket and Cloudflare account endpoint. Target overrides are rejected. Sentry/OpenRouter and Infisical authentication values are excluded from the publisher's environment.

Build `dist/games` before publishing, or select an existing payload directory with `SCUMMVM_GAMES_UPLOAD_DIR`. Normal publishing skips existing files; `--force` overwrites them, and scoped uploads refresh ancestor `index.json` manifests. `--prune` deletes remote game objects missing locally; without `--game`, it applies across the bucket except the reserved `artwork/` namespace. CI and production delivery do not invoke the publisher or receive this R2 pair. The public player reads existing game objects without the writer token.

Artwork uses a separate content-addressed publisher and a public checksum gate.
See [artwork storage and publishing](maintaining-scummweb.md#artwork-storage-and-publishing).
The existing publisher injects the R2 pair into its subprocess. Agents need an
explicit exception for that credential operation until a reviewed compatible
broker route is available; the migration request alone does not grant one.

The regular catalog player reads `<gameId>.zip` from the bucket root. Put each
game's files at the archive root and name the ZIP after its `gameId` in
`scummvm-shell/games.json`. Stage the ZIP in a separate payload directory and
use `SCUMMVM_GAMES_UPLOAD_DIR` with `pnpm run publish:games --game <gameId>.zip`
for a single-object upload. The bucket must allow cross-origin GETs from
ScummWEB. Hosted launchers and the verification harness use the same ZIPs.
Game notices ship with the site under `/launcher/notices/`.

Rotate the account-owned single-bucket Object Read & Write token before its expiry: update both shared Development entries, readback-check them, verify a scoped synthetic upload through `pnpm run publish:games` and clean it up, then revoke the old token. Check for a running publisher before rotation. Retain a finite expiry and verify old-credential rejection after revocation. Never print credentials or place them in command arguments, logs, or checked-in files.

The current publisher token is `scummweb-games-publisher-20261015`, expiring **October 15, 2027**. Its Infisical pair and managed publishing command were verified before and after retiring `R2: scummvm-games` on October 15, 2026. No website redeployment was required.

Production delivery classifies public settings through the pinned `configNames` list; all other allowlisted values remain write-only Secrets. Vercel’s Require Separate Values policy stays enabled: real Production secrets must differ from non-production values. Existing variables are updated by their exact Production IDs. A legacy Secret explicitly listed as public configuration is replaced only in Production because Vercel cannot convert it to Config in place; Preview and Development rows are preserved. Provider responses and credential values are never logged. A failed sync holds deployment; rerun delivery after fixing the named key at its source.
