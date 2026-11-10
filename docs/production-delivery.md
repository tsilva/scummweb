# Production delivery

A push to `main` starts [Production delivery](../.github/workflows/production-delivery.yml).
It scans for committed secrets, then calls a pinned shared workflow that waits
for CI on the exact commit and syncs the Production allowlist from Infisical.
A separate job builds and stages the artifact on Vercel, checks the deployment
and its function inventory, and rechecks the head of `main` before promotion.
Vercel's automatic Git deployments are disabled.

The [pinned trust contract](https://github.com/tsilva/.github/blob/48a4449de4ac5f4d5e14343f70fe5fc57bc2cd74/.github/actions/production-delivery/README.md)
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

## Game-library publishing

Game ZIPs ship separately from the app. Name each archive `<gameId>.zip`
using [the catalog](../scummvm-shell/games.json) and put game files at its
root. The public bucket must allow cross-origin GETs from ScummWEB.
Keep notices under `/launcher/notices/`.

Use `dist/games` or set `SCUMMVM_GAMES_UPLOAD_DIR` to a staged payload
directory. For an additive release, publish only the selected archive, for
example Sołtys.

```sh
pnpm run publish:games --game soltys.zip
```

Existing objects are skipped by default. `--force` overwrites them.
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
catalog entry. Use the separate [artwork publishing flow](maintaining-scummweb.md#artwork-storage-and-publishing)
for images.
