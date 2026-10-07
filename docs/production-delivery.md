# Production delivery

Push to `main` triggers `.github/workflows/production-delivery.yml`. It tests delivery boundaries and waits for the same commit’s CI before retrieving secrets. Then it syncs the fixed production allowlist in `.github/scripts/production-delivery.json`, deploys that exact commit, and verifies the resulting deployment. Vercel’s automatic Git deployments are disabled so they cannot race the sync.

Infisical remains the source of application secrets. Local development uses the existing human CLI login and Development environment. Production uses GitHub OIDC to obtain a 15-minute read-only Infisical session, restricted to the approved repository, main branch, Production environment and delivery workflow. The provider credential is a project-scoped `VERCEL_TOKEN` stored in the repository’s GitHub Production environment. No general CLI login is copied into GitHub.

The workflow does not run on pull requests or forks, export `.env` files, upload secret artifacts, delete destination variables, or change preview/development variables. All required source keys and destination targets are checked before writes. Failed CI or sync prevents deployment. Existing production remains live on failure.

After changing a production secret, use **Actions → Production delivery → Run workflow → main** to sync and deploy. A secret change alone does not trigger delivery. There is no schedule or automatic retry; rerun a failed workflow manually after fixing the cause. For an old failed commit superseded by a newer main commit, run a fresh workflow on main. Deployment tokens expire after one year and need rotation before expiry.

Native Infisical syncs are disabled after this workflow has successfully replaced them. Updating a deployment credential in GitHub does not replace application keys in Infisical.
