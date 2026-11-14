# Dropbox save syncing

ScummWEB can optionally keep saved progress in the player's Dropbox app folder.
The website supplies the UI; ScummVM supplies the native cloud storage API,
provider requests, transfers, pagination and access-token renewal. No ScummVM
launcher or cloud wizard appears. Personal game archives keep their existing
library/import flows; game discovery is outside this integration.

## Configure the application

1. Register a scoped Dropbox API application with **App folder** access.
2. Enable `account_info.read`, `files.metadata.read`, `files.content.read`, and
   `files.content.write`. Do not request Full Dropbox access or sharing scopes.
3. Ensure **Allow public clients** is enabled for PKCE authorization.
4. Register the exact callback URL for every supported site origin:
   `https://YOUR_SITE/dropbox-callback.html`.
5. Set `NEXT_PUBLIC_DROPBOX_APP_KEY` to the public application key before
   building the website. No application secret belongs in the browser or build.
6. Follow Dropbox's production-approval process before broad rollout.

The callback is the tracked static page `public/dropbox-callback.html`. Verify
that it returns HTTP 200 at each registered origin. `pnpm dev` and `pnpm start`
use `http://localhost:47831`; register
`http://localhost:47831/dropbox-callback.html` once for local testing. Production
also needs `https://scummweb.tsilva.eu/dropbox-callback.html`. Explicit port
overrides require a matching callback; there is no automatic fallback when the
default port is occupied.

Without the public key, Settings shows a disabled Connect Dropbox control.
Authentication uses a popup, PKCE S256, offline access, a checked state value,
and an exact-origin/source callback. The static callback contains no analytics
and removes its authorization query immediately. Denying access leaves saves
intact. The initial code exchange runs in the host; subsequent provider operations
run through ScummVM. Site-specific PKCE tokens renew directly with Dropbox rather
than ScummVM's authentication broker.

Native cloud configuration, including refresh credentials, is retained in the
site's IndexedDB. It is separate from game configuration, portable save backups,
application URLs, analytics and logs. This allows reconnection after a browser
restart without repeated sign-in. Disconnect removes local cloud credentials;
it retains browser saves, pending snapshots and cloud history. Clearing site
data also removes authorization; reconnecting the same Dropbox account restores
verified cloud saves. Browser-side credentials are accessible to scripts on the
same origin, so the usual application XSS protections remain essential.

## Player experience

Choose **Settings → Saved games → Connect Dropbox**. Active browser saves and
preserved backup sets are copied automatically, without deleting browser originals.
The normal status is **Dropbox connected**, with a white Dropbox icon. The
sync status shows a spinner while connecting or syncing. A compact **Disconnect**
button sits beside it and can cancel an ongoing sync.

Completed player saves are captured with companion files and queued in
IndexedDB before network publication. Pending native writes and isolated agent
runs are excluded. Cloud checks happen before a connected launch, after save
changes, when returning to the app, when connectivity returns, and periodically
while the page is visible. A running game's files are never replaced remotely.

Network, authorization and quota errors keep unsynced saves on the device and
show an actionable status. A closed browser cannot upload; reopening retries
durable work. Clearing site data before an upload finishes can still lose
unsynced progress. Only verified cloud copies survive a site-data reset.
Dropbox remains optional; unconnected play stays local.

### Import saves from desktop ScummVM

Copy ordinary ScummVM save files into **Apps → ScummWEB → saves** in Dropbox.
Keep their original filenames, and copy the complete set for the game, including
companion files (for Beneath a Steel Sky, include `SKY-VM.SAV` with its slots).
There is no ZIP step. ScummWEB checks the folder during normal synchronization
and imports stable, recognizable files automatically. The folder can be created
in Dropbox when first needed; an absent folder is treated as empty.

Matching uses the library games' save filename conventions. Unrecognized or
ambiguous names, subfolders, empty files and missing known companion files
produce an actionable Settings message; ScummWEB does not guess an edition.
Automatic matching currently covers catalog games, rather than arbitrary
personal-game versions with unrelated desktop target names. Use compatible game
editions and ScummVM versions; filename recognition cannot guarantee that an
engine can load a particular save format.

The copy-in folder is read-only to ScummWEB. Files are never removed or updated
there, and progress does not sync back to desktop ScummVM. The importer observes
the same contents twice before publication. Copies are published and verified
in the normal recoverable cloud history before browser files change. Different
existing progress uses the normal choice dialog, without silently merging slots
or choosing by modification time. Identical contents are skipped. Unchanged Dropbox revisions avoid repeated
downloads; size and modification time alone are never treated as identity. Import
identities remain in cloud history, so clearing browser data does not reimport
old inbox contents over newer progress. The inbox allows up to 4,096 files and
less than 63 MiB total.

If devices independently change an edition's progress, complete copies remain
in Dropbox. A small choice dialog selects which to continue; the alternatives
remain available through **Saved games**. A third device changing progress while
that dialog is open invalidates the choice and requires another review.
Choosing **Decide later** preserves both copies. Other games can launch once
their own saves have finished syncing; the conflicting edition still requires
a choice. An incomplete save scan or unfinished restore continues to block
launch until synchronization can establish that the selected game is ready.
Identical contents merge automatically. No timestamp winner or slot-by-slot
merge is used. An existing browser's saves are bound to the first connected
Dropbox account; use that account or a separate browser profile.

## Native boundary and recovery

A dedicated, hidden `cloud.html` service runs the compiled ScummVM cloud API
before GUI or engine-plugin initialization. Its configuration and transfer file
live in an isolated MEMFS root. It never mounts BrowserFS or a running game's
files. Its message bridge accepts only the same-origin parent, permits only
snapshot writes and read-only flat `/saves/` imports, bounds responses, and
returns sanitized errors. Credentials are persisted after native renewal before acknowledging an
operation. Service teardown discards incomplete scratch transfers.

The remote folder is `/scummweb-snapshots-v1/` inside the app folder. Every
snapshot is an ordinary `scummweb-save-backup` version 1 ZIP with an additional
cloud manifest. Its checksum-derived filename identifies its profile, complete
file contents, active/recovery role and parent snapshot IDs. Imported editions
with matching fingerprints share a profile across different browser source IDs.
Unknown editions remain preserved until their matching game is available.

A snapshot is uploaded and downloaded for integrity verification before the
outbox is acknowledged. Readback checks ZIP integrity, file hashes, profile and
snapshot identity. Retrying a lost response reuses the same logical identity.
Concurrent writers publish independent immutable nodes; neither can overwrite
the other's progress. Resolution creates a new node referencing all reviewed
tips. Missing ancestry or invalid archives stop synchronization and retain local
copies. There is no mutable cloud index or dependency on provider-specific
conditional writes, and no automatic history deletion.

The outbox requests strict IndexedDB durability where supported. An older
BrowserFS working copy cannot replace a newer durable pending set after restart.
Existing save locks protect migration and restoration; a separate cross-tab
lock serializes cloud coordination. Import/export retains its existing review,
preservation and activation behavior. Cloud ZIPs can also be imported manually
using **Saved games**. Save archives retain the 64 MiB limit. The current
collection scan permits up to 10,000 snapshot files; history is retained rather
than silently pruned. Scans stop safely above 256 MiB of decoded save history.

`app/cloud/native-client.mjs` owns the provider registry and native bridge.
Dropbox is enabled first. ScummVM's Google Drive, OneDrive and Box IDs are
reserved but disabled until their own authentication/setup adapters and browser
compatibility checks exist. The snapshot, recovery and conflict protocol is
provider independent. This folder format is specific to ScummWEB; it does not
synchronize directly with the standard native ScummVM `/saves/` folder.
The optional copy-in inbox imports ordinary files from `/saves/` in ScummWEB's
own app folder; it cannot access another Dropbox application's folder.

Stalled sync passes have a three-minute inactivity deadline in addition to
per-request deadlines. Cancellation removes the native service, releases the
cloud coordination lock, and fences late work from restoring or acknowledging
saves. Returning to a visible tab, reconnecting the network or the periodic
retry starts a fresh pass without reloading. Pending catalog requests are bounded
and evicted after cancellation. Launch waits for an existing sync coordinator
within the same deadline. Disconnect cancels a pending pass.

## Verification

```sh
node --test test/dropbox-sync.test.mjs test/dropbox-runtime.test.mjs test/dropbox-loose-import.test.mjs \
  test/save-backups.test.mjs test/game-route-frame.test.mjs
```

Tests cover faults around remote commits, lost replies, coordinator restarts,
independent browser-storage flushes, concurrent writers, stale conflict choices,
missing ancestry, account boundaries, live-player locks, checksum validation,
and portable ZIP round trips. Native changes require a full runtime rebuild
with `--enable-cloud` through the maintained build script.

Before rollout, verify real Dropbox authorization, renewal and two-device
save/restore with a configured application on supported desktop, mobile,
installed-app and TV browsers. Synthetic provider tests do not establish
production OAuth approval, CORS behavior or real-account compatibility.
