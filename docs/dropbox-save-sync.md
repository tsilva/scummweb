# Dropbox save syncing

ScummWEB can optionally keep saves and Recently Played activity in the player's
Dropbox app folder. ScummVM supplies the native save storage API, uploads,
pagination and access-token renewal. The website uses that same authorized
session for concurrent snapshot downloads. No ScummVM launcher or cloud wizard
appears. Personal game archives keep their existing library and import flows.

## Configure the application

1. Register a scoped Dropbox API application with **App folder** access.
2. Enable `account_info.read`, `files.metadata.read`, `files.content.read`, and
   `files.content.write`. Do not request Full Dropbox access or sharing scopes.
3. Ensure **Allow public clients** is enabled for PKCE authorization.
4. Register the exact callback URL for every supported site origin:
   `https://YOUR_SITE/dropbox-callback.html`.
5. Set `NEXT_PUBLIC_DROPBOX_APP_KEY` to the public application key before
   building the website. No application secret belongs in the browser or build.
6. Enable additional users in the Dropbox Developer Console. Dropbox normally
   starts reviewing production applications at 50 linked accounts. From that
   point, new connections can be frozen if approval takes more than two weeks.
   See the [Dropbox production approval guide](https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide#production-approval).

The callback is the tracked static page `public/dropbox-callback.html`. Verify
that it returns HTTP 200 at each registered origin. `pnpm dev` and `pnpm start`
use `http://localhost:47831`; register
`http://localhost:47831/dropbox-callback.html` once for local testing. Production
also needs `https://scummweb.tsilva.eu/dropbox-callback.html`. Explicit port
overrides require a matching callback; there is no automatic fallback when the
default port is occupied.

Without the public key, Settings shows a disabled **Connect** button and explains
that Dropbox sync is unavailable.
Authentication uses a popup, PKCE S256, offline access, a checked state value,
and an exact-origin/source callback. The static callback contains no analytics
and removes its authorization query immediately. Denying access leaves saves
intact. The initial code exchange runs in the host. Save operations and token
renewal run through ScummVM. Site-specific PKCE tokens renew directly with Dropbox rather
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

Choose **Settings → Saved games → Dropbox sync → Connect**. Active browser saves and
preserved backup sets are copied automatically, without deleting browser originals.
The main Saved games view contains Dropbox sync and Transfer saves. Transfer saves
offers Export saves and Import saves side by side.
A spinner appears while the Settings interface loads and during save transfers.
Once the interface is visible, you can open either section while ScummWEB reads
local saves. The transfer buttons stay disabled during that read.
Export starts the ZIP download automatically. The export button briefly shows
**Downloaded** when the browser takes over the download.
To play from an earlier copy, open the matching game edition and go to
**Load Game → Backed-up saves**. Select a slot to load it directly. ScummWEB
opens the backup and its companion files in temporary storage. Your active
save files stay intact. Use **Save Game** to keep playing from that point
in a normal save slot. The backup list appears in games that support
loading through the ScummWEB menu.
The status is read-only. Routine metadata checks keep **Saves up to date** and
its checkmark visible after verification. Before verification, the status shows
**Checking saves…** or **Connected**. A completed new save shows
**Preparing saves…** while being queued. Actual backup uploads, downloads and
local restoration show **Syncing saves…**, with an inline activity line such as
**42% · Beneath a Steel Sky · Uploading**. The percentage measures bytes for the
current backup, rather than elapsed time or the entire account. An incoming backup
advances as its bytes are received. Publication counts the uploaded bytes and the
required equal-sized verification readback, so upload occupies the first half and
**Verifying** occupies the second half. Upload progress advances only when Dropbox
confirms a native upload chunk; small backups may jump directly to verification.
Uploads and authentication continue to use ScummVM's native provider.

The game name comes from the save set. A previously unseen remote backup briefly
shows **Identifying game…** until its contents and identity have been verified.
Missing or inconsistent byte totals show the activity without a fabricated percentage.
**100%** reports transferred bytes; verification and local restoration still finish
before the connected checkmark appears. A retry measures its current transfer
again; it never treats a previous partial percentage as a durable acknowledgement.
Connecting also shows its progress.
Only the current activity is shown; an old notice does not remain under
an active sync spinner. A compact **Disconnect**
button sits beside it and can cancel an ongoing sync.

Completed player saves are captured with companion files and queued in
IndexedDB before network publication. Active saves are also stored in IndexedDB,
including when Dropbox is disabled. On the first visit, ScummWEB automatically
moves legacy browser saves and their metadata after committing a recoverable
copy. A failed migration leaves the original storage intact. Legacy files whose
bytes are missing or truncated stay out of the active collection, and the
migration archive retains their original records. Pending native writes and isolated agent
runs are excluded. Files remaining in the game's save folder are retained even
when absent from the native save list or named like a skip-intro checkpoint;
only the shell's exact-byte checkpoint cleanup can identify bundled copies.
For Backyard Baseball, Dropbox sync automatically recovers an interrupted
write that left an empty `baseball-records.bbl`. ScummWEB keeps the empty
file in the recovery export and uses the newest intact copy from that game
edition's backups when available. If no copy exists, the remaining saves
still sync.
Continue chooses the newest intact manual save or autosave at launch. If
Dropbox has already downloaded progress for that edition, Continue lets the
restore finish before choosing. An intact local save can open while unrelated
games are still syncing. Routine background checks read a committed save
snapshot while the game's launch controls stay available. A launch that needs
cloud progress verifies and restores the selected edition first, then lets the
other games continue syncing in the background.
On the first sync of an account, ScummWEB downloads and verifies unseen
snapshots in small groups. Large ZIPs are verified one at a time. Subsequent
checks reuse the metadata for unchanged Dropbox revisions. Changed editions
share a folder refresh, and upload readback is reused when its revision
matches the listing. Sync also runs after saves change, when returning to
the app, when connectivity returns, and periodically while the page is visible.
During play, the active game's completed local saves get priority for upload.
Other editions can upload and restore in the background while their save
folders are idle. Incoming progress for a running edition is retained and
applies after the player exits. The transfer row keeps the last named game
visible until the next game is identified.

When the browser goes offline, Settings shows **Offline · Saves stay on this device**
and sync resumes automatically on reconnect. **Reconnect Dropbox** is available
when Dropbox requires sign-in again. Other failures show **Saves waiting to sync**
with details. Unsynced saves stay on the device. Restores reuse unchanged save
files. If one game's cloud copy exceeds the available browser space, its restore is deferred and
other games can still sync. A closed browser cannot upload; reopening retries
durable work. Clearing site data before an upload finishes can still lose
unsynced progress. Only verified cloud copies survive a site-data reset.
Dropbox remains optional; unconnected play stays local.

The export retains current and recovery files. Select **Export saves** again to
create another ZIP.

### Transfer saves to and from desktop ScummVM

Use **Settings → Saved games → Import saves** to select ordinary ScummVM save
files or a ZIP containing them. Keep original filenames and include companion
files, such as `SKY-VM.SAV` with Beneath a Steel Sky slots. Recognizable catalog
filenames are matched automatically. If a game cannot be identified safely,
choose the matching library game; the selected files remain available for that
choice. Use compatible game editions and ScummVM versions. Filename recognition
cannot guarantee that an engine can load a particular save format.

Import shows a confirmation of the incoming saves, without conflict choices.
Compatible separate slots are combined; incoming overlapping slots take precedence.
A changed companion/index selects the complete incoming copy. Previous progress is available under
**Load Game → Backed-up saves**. Additional copies for the same game are retained for
recovery. Confirmation refreshes current saves under the exclusive save lock and
merges the original incoming files again, so background synchronization during
review does not discard newly completed compatible slots or require reopening the ZIP. Games absent from an exported collection remain unchanged.

**Export saves** downloads a ZIP of ordinary ScummVM save files with original
filenames and unchanged bytes. Each game edition has its own folder, with
`current` and separate `recovery-…` copies so matching filenames never overwrite
each other. Extract the chosen copy's contents into desktop ScummVM's save
folder. Exported collections can also be imported back into ScummWEB; edition
identities in folder names preserve matching across browsers. The ZIP requires
no ScummWEB manifest. Cloud backup ZIPs can still be imported for recovery.

ScummWEB manages **Apps → ScummWEB → saves** for save syncing. Use **Import
saves** to transfer desktop saves.
Desktop ScummVM does not automatically sync with ScummWEB.

### Recently Played across devices

ScummWEB records playtime, last-played dates and verified story progress in the
browser's IndexedDB, including when Dropbox is disabled. Existing records are
copied from browser local storage on first use, using the existing browser
identity so previously synced playtime is counted once.

With the same Dropbox account connected on each device, ScummWEB also
syncs recorded playtime, last-played dates and verified story progress. Existing
browser records contribute on the next sync. Older cards with no time or date
recorded cannot supply those values. Activity can make a game appear in Recently
Played on a device that has the matching copy but has never opened it.

Playtime sums each browser's recorded contribution. Last played uses the newest
recorded date. The story bar uses the highest verified percentage for the same
edition and map revision. Flight of the Amazon Queen can still show progress
from its selected Continue save. Imported archives sync activity when they have
a matching fingerprint. Game files and library imports are set up on each device.

Activity lives in `play-activity-v1.json` in the Dropbox app folder using the same
authorization as saves. Separate browser counters and Dropbox revision checks
keep retries and overlapping uploads from double counting play. A failed activity
sync retries in the background and does not hold up save sync or game launches.
Native save exports continue to contain only save files.

### Automatic reconciliation

Compatible files merge automatically across all devices, including first
connections without a local sync baseline. Shared ancestry lets edits to
different files combine and distinguishes deletions from missing files. Without
shared history, missing files are treated as additional saves to retain.
Binary file contents are never spliced together.

Overlapping changes resolve automatically, with no conflict dialog or queued
user decisions. The copy with the latest recorded save time supplies the
conflicting slots; equal times use a stable content-hash order independent of
device and directory listing order. Compatible separate slots are retained.
When a changed companion/index or file/folder collision makes combining unsafe,
the complete preferred copy is selected. All original competing copies are
published and verified as recovery copies before the result is acknowledged;
their playable slots remain available under **Load Game → Backed-up saves**. The recorded preference
time is included in the immutable snapshot identity.

Recorded save times cannot establish which story position is furthest ahead,
and clocks can differ across devices. Shared ancestry remains authoritative for
ordinary sequential saves; time is only a preference between concurrent copies.
Recovery preserves the alternative without interrupting normal play.

A running game's files are never replaced remotely. An unfinished write
quietly holds cloud changes for its edition while the player can continue from
an intact local save. An unidentified write holds the scan conservatively.
Cloud archives that fail verification leave local copies available. Each
ScummWEB autosave keeps its native slot and companion data in one checksummed
record. When devices have different records in the same rotation slot, the
newest valid record takes precedence and cloud history keeps the alternatives.
An existing browser's saves are bound to the first connected Dropbox account;
use that account or a separate browser profile.

## Native boundary and recovery

A dedicated, hidden `cloud.html` service runs the compiled ScummVM cloud API
before GUI or engine-plugin initialization. Its configuration and transfer file
live in an isolated MEMFS root. It never mounts BrowserFS or a running game's
files. Its message bridge accepts only the same-origin parent, permits only
checksum-named snapshot transfers inside `/saves/`, bounds responses, and
returns sanitized errors. Credentials are persisted after native renewal before acknowledging an
operation. Service teardown discards incomplete scratch transfers.

Save transfers use `/saves/` inside the app folder. Every
snapshot is an ordinary `scummweb-save-backup` version 1 ZIP with an additional
cloud manifest. Its checksum-derived filename identifies its profile, complete
file contents, recorded save time, active/recovery role and parent snapshot IDs. Imported editions
with matching fingerprints share a profile across different browser source IDs.
Unknown editions remain preserved until their matching game is available.
Preserving these editions does not restart synchronization or initialize an
empty browser's game files.

A snapshot is uploaded and downloaded for integrity verification before the
outbox is acknowledged. Readback checks ZIP integrity, file hashes, profile and
snapshot identity. Retrying a lost response reuses the same logical identity.
Concurrent writers publish independent immutable nodes; neither can overwrite
the other's progress. Automatic reconciliation creates a new node referencing every observed
tip. If an archive fails verification, an empty browser edition can recover
from its latest verified active archive. Existing local progress takes
precedence while cloud writes wait for verifiable history. There is no mutable
cloud index or dependency on provider-specific
conditional writes, and no automatic history deletion. Automatic file merges
also reference every merged tip and are read back before restoration. A fresh
listing after publication incorporates arrivals during the merge; a continually
changing collection waits for a later pass. A cloud snapshot can contain no files
when compatible deletions remove the last saves.

The outbox requests strict IndexedDB durability where supported. An older
BrowserFS working copy cannot replace a newer durable pending set after restart.
Existing save locks protect migration and restoration; a separate cross-tab
lock serializes cloud coordination. Import and recovery retain revision checks, preservation before activation and
exclusive save locks. Cloud ZIPs can also be imported manually
using **Saved games**. Each save archive retains the 64 MiB limit. ScummWEB
keeps the entire Dropbox history and caches verified snapshot metadata by
Dropbox revision. A new browser can verify up to four small listed snapshots
at once. Later checks reuse verified metadata and download save bytes when
needed for a restore or merge. Dropbox's download response provides the exact
byte count for validation and size limits. The native listing can round sizes,
so they only guide download scheduling. Fresh listings detect new, changed and missing
snapshots. One refresh covers a batch of independent uploads before
reconciliation, and a final fresh check fences the completed pass. Conflicting
histories are verified and reconciled before local activation. New cloud
changes or newly queued completed saves
trigger up to three immediate passes before a launch succeeds; continued changes
leave a retryable waiting status instead of launching with unchecked progress.
Import, export and activation briefly retry a busy save lock so a short sync
restore or metadata check does not immediately report an open game. A running
player still prevents these operations; the wait is bounded to two seconds.

`app/cloud/native-client.mjs` owns the provider registry and native bridge.
Dropbox is enabled first. ScummVM's Google Drive, OneDrive and Box IDs are
reserved but disabled until their own authentication/setup adapters and browser
compatibility checks exist. The snapshot, recovery and automatic-reconciliation protocol is
provider independent. This folder format is specific to ScummWEB; it does not
synchronize directly with the standard native ScummVM `/saves/` folder.


Stalled sync passes have a three-minute inactivity deadline in addition to
per-request deadlines. Cancellation removes the native service, releases the
cloud coordination lock, and fences late work from restoring or acknowledging
saves. Returning to a visible tab, reconnecting the network or the periodic
retry starts a fresh pass without reloading. Pending catalog requests are bounded
and evicted after cancellation. A launch can redirect a background pass in its
own tab to the selected edition. An existing sync in another tab retains the
coordination lock within the same deadline. Disconnect cancels a pending pass.

## Verification

```sh
node --test test/dropbox-activity.test.mjs test/dropbox-sync.test.mjs test/dropbox-merge.test.mjs test/dropbox-runtime.test.mjs test/dropbox-ui.test.mjs test/scummvm-transfer.test.mjs \
  test/save-backups.test.mjs test/game-route-frame.test.mjs
```

Tests cover faults around remote commits, lost replies, coordinator restarts,
independent browser-storage flushes, concurrent writers, deterministic automatic choices,
missing ancestry, account boundaries, live-player locks, checksum validation,
portable ZIP round trips, compatible unions, concurrent file edits and deletions,
multiple-device overlaps, interrupted merges, native desktop files, recovery without
conflict dialogs and activity convergence after a lost upload response.
Native changes require a full runtime rebuild
with `--enable-cloud` through the maintained build script.

Before rollout, verify real Dropbox authorization, renewal and two-device
save/restore with a configured application on supported desktop, mobile,
installed-app and TV browsers. Synthetic provider tests do not establish
production OAuth approval, CORS behavior or real-account compatibility.
