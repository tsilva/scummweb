# Production secret delivery

Pushes to `main` and the **Production secret delivery** workflow's **Run workflow** button fetch the current production credential directly from Infisical using a short-lived GitHub OIDC identity. No Infisical login token or app credential is stored in GitHub. Changing a secret in Infisical alone does not trigger delivery: run this workflow on `main` after a rotation.

The GitHub `Production` environment accepts only `main`. OIDC trust is restricted to the exact workflow path, repository IDs and main branch. Credentials are available only to the provider step; checkout does not retain Git credentials. Fork/PR and superseded-commit runs cannot write. Runs are serialized. Provider responses, secret values and credential artifacts are not published.

Only `SENTRY_AUTH_TOKEN` is copied to the pinned Vercel project's Production environment. Preview and other variables are preserved, and no variables are deleted. The four Sentry-only production projects share a read-only Infisical identity; this identity cannot access their Development vaults or the Chatex runtime key. Each dedicated Vercel credential is scoped to its single hosting project; it is held in that repository's protected GitHub environment and expires after one year.

The independent Vercel Git deployment for `main` is disabled to prevent building before the sync. Preview Git deployments remain enabled. The workflow waits for the existing `CI` workflow on the exact pushed SHA to succeed, then starts a Vercel production build of that SHA and verifies READY status and commit metadata. A failed sync prevents deployment; failed CI holds deployment after a successful sync and leaves the existing site live. A manual retry still requires successful CI for that commit. Existing security and application gates are unchanged.

Watch the workflow result after pushes and rotations. A failed or canceled run requires review; provider writes are not blindly retried after an uncertain outcome. The existing local manual sync command remains available for recovery. Refresh the dedicated provider credential through the GitHub Production environment when it expires or is revoked.
