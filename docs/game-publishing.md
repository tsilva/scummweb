# Publishing unchanged official demos

Game archives are separate from the application deployment. Keep the upstream
ZIP unchanged, review its redistribution terms, and retain its notices. A
ScummVM download link alone is not an express redistribution license.

Prepare one checksum-pinned demo from `data/classic-freeware.json`:

```sh
python3 -B scripts/game-publishing/plan.py gk1-demo
```

Preparation reads no credentials. It writes a private plan under
`.internal/evidence/game-publishing/<target>/plan.json`, binding the current
catalog, exact archive, byte count and SHA-256. Changed existing plans are
rejected. The source must be an owned, nonlinked ZIP in `downloads/`, preserved
unchanged and hosted under the official ScummVM demo directory. The maximum is
4 GiB, matching the application import limit.

## Optional Runbox connection

The game connection needs separate trusted provisioning and owner review. It is
independent of the artwork connection. Never reuse an artwork profile to publish
game data, restore a retired credential wrapper, or inject raw storage keys as a
fallback. Normal development and builds need no publishing connection.

The [profile example](game-publishing-runbox.example.yaml) describes the proposed
game-only connection. Merge its named profile into the canonical configuration
only through reviewed setup, preserving all existing profiles and approvals.
The example does not create a remote service or authorize itself. Its new access
bundle must contain only the loopback game relay: POST `/games/check`,
`/games/publish` and `/games/status`, with the existing ScummWEB Development `/`
R2 pair attached only to `X-Scummweb-R2-Credential`. No service key enters the
publishing client. Trusted provisioning must pin the credential fingerprint,
canonical source, runtime, public CA and reviewed Runbox release.

The owner-only signer policy contains version `1`, port `61788`, the credential
SHA-256, the exact source binding declared in `relay.py`, and the pinned check
object `gob3.zip` with `1055315` bytes. It contains no credential values. The machine
runtime must also pin the installed `/usr/bin/curl` with HTTP/2 support as
`binaries.game-curl`. Named machine-runtime resources `game-policy` and `game-base`
select this policy and its private lock directory. The source files remain integrity
pinned; the selected game plan remains data validated against the catalog.

After provisioning and approval, verify access with the bounded HEAD-only check:

```sh
runbox --profile game-publish check --online
runbox --profile game-publish run -- game-publish gk1-demo
```

The check reads no object body and uploads nothing. Publishing streams the exact
planned ZIP using a signed SHA-256, Content-MD5 and conditional `If-None-Match: *`
PUT. Packages larger than 5 MiB use checksum-verified 5 MiB parts and conditional
[multipart completion](https://developers.cloudflare.com/r2/api/s3/conditional-operations/#conditional-multipart-uploads).
Private owner-only receipts bind progress to the exact plan, source checksum and
part bytes; a later invocation resumes validated parts.
Only the selected object's multipart session can be created or completed; the
signer cannot list or delete objects. Receipts contain no credentials and remain
until full public verification succeeds. Existing objects are never overwritten.
A creation race also preserves the winner. The signer verifies the public
object's complete bytes, MIME type and
immutable cache metadata before reporting success. Signed HEAD and PUT requests
use the reviewed system curl with TLS 1.2 or newer, certificate and hostname
verification, and negotiated HTTP/2 or HTTP/1.1. Request signatures enter curl
through stdin and game bytes through an open file descriptor. No credentials
or signatures enter its arguments, environment or temporary files. Redirects
and legacy protocols fail; diagnostics expose only phase and numeric status.
Changed files, foreign destinations and arbitrary upload bodies fail explicitly.

The client sends only a placeholder and empty protocol requests through the
native proxy. Upload work runs in the trusted signer, with bounded status polling
so the proxy never has to carry the game ZIP. The client is sandboxed; the signer
and other processes running as the same host user remain trusted. There are no
delete, prune, force, bucket-listing or bucket-administration operations.

Refresh the selected fingerprint from the public bucket after successful upload:

```sh
node scripts/generate-bundled-game-files.mjs --remote gk1-demo
```

Local fingerprint preparation with `--local-dir` supports offline builds but
does not establish public delivery. Test the bucket-backed game in Brave, then
follow the existing CI-gated Production delivery workflow and replay it live.

## Synthetic verification

```sh
python3 -B -m unittest discover -s scripts/game-publishing -p 'test_*.py'
```

Tests use synthetic ZIPs and fake credentials. They exercise the actual proxy
client and streamed provider HTTP requests, source and plan drift, conditional
creates, existing-object verification, public readback, credential isolation and
error redaction. They do not claim live Runbox or storage access.
