# Live test details

## Baselines and oracles

Use the selected origin, account and Brave profile. Show the gated Dropbox row
with `?dropbox=true` when required; game exit can remove that query without
disabling background sync.

The sole managed cloud folder is `/Apps/ScummWEB/saves/`, containing immutable
checksum-named snapshot ZIPs. Desktop saves enter through **Import saves**;
copying loose files into Dropbox is not an import path. Existing obsolete test
folders/loose files are recovery material, not a second supported layout. Preserve
them without migration or deletion. Native transport uses hidden `cloud.html`;
never dump its configuration.

Use `app/save-backups/scummvm-transfer.mjs` for native transfers,
`app/save-backups/backups.mjs` for set identity/recovery archives and
`app/dropbox/protocol.mjs` for snapshot identity/ancestry. The audit helper reuses
these readers. Capture tested source and deployed SHA separately if publication
changes during QA; attribute results only to matching bytes.

Compare exact file/set hashes, profile fingerprints and node IDs/parents. Counts
alone miss loss and duplicates. Autosaves may change during play; compare prior
manual slots byte for byte and retain older autosaves in history rather than
restoring them over progress. In Sky, slot 0 is reserved for autosave. Keep files
absent from a native save list; an unlisted file is not proof of disposability.

## Native transfers and deliberate recovery

1. Export the latest collection. Verify native filenames/bytes in each edition's
   `current` and separate `recovery-…` folders; no ScummWEB manifest is required.
   Extract one chosen copy into a compatible desktop ScummVM save folder when
   testing desktop loading. Do not mix game editions or recovery copies.
2. Import an ordinary native multi-file selection and a ZIP through the real
   picker. Include required companions, such as `SKY-VM.SAV` with Sky slots.
   Recognized catalog filenames match automatically; unknown files request a game
   and remain available when it is selected. Filename matching alone does not
   prove engine compatibility: load the intended slot natively.
3. Review and confirm import without conflict radios. Distinct compatible slots
   combine; incoming overlapping slots take precedence. A changed companion/index
   selects the complete incoming copy. Verify prior current progress remains in
   **Load Game → Backed-up saves** and games absent from the import stay unchanged.
4. For a review race, complete a legitimate compatible save or let authorized
   sync finish while review remains open. Confirmation must recompute from the
   original incoming files and freshest current set under the save lock, retaining
   the new slot. Do not accept lost progress or a needless stale-review restart.
5. Re-export an unchanged collection and compare edition/set identities and every
   save filename/hash, including recovery copies. ZIP timestamps/compression can
   differ. Re-importing the identical current/recovery collection must leave
   current contents unchanged and add no cloud nodes solely because the ZIP
   container changed. Deliberately importing older incoming files can replace
   overlapping slots; prior presence in cloud history does not cancel that intent.

Open an older slot under **Load Game → Backed-up saves** and verify the
resulting game state. Compare the active slots and companion files
byte for byte before and after loading. Use **Save Game** and confirm the new
slot appears in the active list. Cloud snapshot ZIPs remain acceptable manual
recovery inputs. The audit helper accepts both native exports and cloud ZIPs.

## Automatic reconciliation fixtures

Prefer real complete alternate sets from verified recovery archives. Keep bytes
and recorded times; do not corrupt saves or invent live timestamps to force a
winner. Use deterministic synthetic clock/listing permutations in regression
fixtures, clearly distinguished from live observations.

Exercise independent new slots, different bytes at the same slot, changed
companion/index files and incompatible file/folder layouts. Introduce concurrent
branches through separately authorized device/browser workflows or fixture
transports, never loose Dropbox copy-in. Record origins, profile identities,
branch hashes, original files and expected retained alternatives.

Verify the production rule: shared ancestry handles ordinary sequential saves;
independent edits merge. Concurrent overlaps prefer the latest recorded save
time, with equal times ordered by content hash. Compatible separate slots remain.
Companion/index or layout conflicts select a coherent complete preferred set;
binary bytes are never spliced. Time cannot establish furthest story progress.

Every competing original must remain in immutable history. For overlapping
automatic selections, require verified recovery copies before acknowledgement.
Inspect actual
conflicting paths and the final native load, not a status label alone. Repeat
with reordered listings, retries and multiple devices: final bytes must converge,
all observed tips must be referenced, and unchanged rechecks must add no logical
merge duplicates. No conflict dialog, queued choices, Decide later or manual
resolution step belongs in the current flow. Continuous new changes may produce
a retryable waiting state, not an unchecked launch or a user-choice queue.

## Close/kill timing

Back up first and identify the durable phase: a completed save queued locally,
a publication with an unacknowledged response, or automatic reconciliation that
has begun preserving alternatives/publishing its result. Use authorized visible
transfer progress plus independent archives or fixture receipts; do not inspect
private runtime state or invent an Applying choices phase. If durability/timing
cannot be established, record the case as unverified.

Immediately before each approved browser kill, recheck the exact main PID and
all running ScummWEB games. Explain that it closes all Brave windows. Use only
that approved PID. A requested tab close and a browser process kill are distinct
cases. If work already finished, record a missed window; another kill needs
fresh confirmation.

Reopen Brave Stable through documented APIs and fresh tab inventory. If session
restoration is blank, open the known origin in the same profile. Observe automatic
recovery without reconnecting, clicking Sync or choosing winners. Export and
independently download cloud history; verify pending bytes, alternatives, ancestry,
no duplicate logical publication and native Load. Preserve unrelated tabs/data.

## A genuine offline test

Inventory all ScummWEB tabs immediately before disconnection and before the cloud
checkpoint. Identify the tested **origin and profile**: same-origin online tabs
can drain the shared queue, including while another game runs. Different origins
have separate browser stores/queues and are separate sync clients. Wait for other
owners or obtain an authorized isolation method; never alter their games yourself.
A partial outage with an online coordinator is a cross-tab resilience test.

Load the game online and prepare a new manual slot. Use documented per-tab
controls, or ask the user to set that exact game tab Offline in DevTools Network
throttling. Keep chat and an independent Dropbox page online; never change host
networking, install interception or use unsupported APIs. Ask the user to leave
the new slot untouched and avoid opening another same-origin ScummWEB tab.

After confirmation, create the slot and observe native completion. Independently
download cloud history and prove the slot is absent from **every** snapshot for
its profile. An Offline setting or waiting toast alone is insufficient. If it
already uploaded, retain the evidence and investigate isolation; mark the outage
case inconclusive rather than passing it.

Exit/close the game while still offline. Full-navigation exit may show the browser's
offline page; this does not prove data loss. If Dropbox is also offline, keep every
tested-origin coordinator closed, ask for **No throttling**, and obtain the cloud
checkpoint before reopening ScummWEB. A fresh task-owned Dropbox tab can avoid
stale tab-specific throttling/download failures without starting a coordinator.

Restore connectivity and reopen the known origin. Verify automatic recovery,
one new logical publication of the completed set, exact cloud/browser bytes,
unchanged prior manual slots and a native Load. Treat extra genuine autosave
changes separately. Profile purge survival is not established: unsent saves still
depend on local storage until verified in Dropbox.

## Browser observations and downloads

Ground actions in fresh AX/DOM state. After an ambiguous timeout, inspect before
repeating Save, import, restore or deletion. Async verification and native
metadata scans may outlast an automation wait; distinguish continued progress
from a failed/stalled operation. Connected text alone is not verified sync: wait
for the synced checkmark. Capture it before a focused transfer control scrolls it
out of view.

**Export saves** starts downloading automatically. **Exporting → Downloading →
Downloaded** reports browser handoff; verify the actual completed ZIP and its
integrity. There is no second Download ZIP link. Record filenames before the
action to distinguish duplicates. Blob download events can be absent despite a
successful download; discover the actual directory through supported runtime or
observed download information, then checksum the evidence copy before removing
a task-owned duplicate. Never hardcode a personal download path in the skill.
Dropbox folder Download normally provides a regular download event. If it fails,
inspect the visible error and retry boundedly through a fresh authorized task tab.

For file pickers, register the chooser wait before the action. A documented AX
click with a short press can activate the real picker when a synthetic locator
click does not. Native canvas controls also need a press spanning frames; use
fresh screenshots for coordinates. Native Load may need Resume or another frame
before repaint: confirm restored gameplay before closing the task tab.
