# Maintaining ScummWEB

- [Play, import games, and back up saves](#playing-and-importing-games)
- [Develop and test](#local-development)
- [Rebuild ScummVM and add freeware](#rebuilding-and-upgrading-scummvm)
- [Manage artwork](#artwork-storage-and-publishing)
- [Deploy and publish game files](production-delivery.md)

## Playing and importing games

Choose a game from the library or Recently Played, then select **Play**.
For games with multiple copies, the version selector remembers your available
choice. Otherwise it favors the latest known revision, with the included copy
or browser language used to break ties. Demos have separate cards. **Game not
included** means you need your own copy. Check the
[compatibility results](game-testing.md) for tested editions.

Recently Played shows the last played copy of each game, its recorded **Played**
time and **Last played** date, and a direct **Continue** button when a compatible
save exists (otherwise **Play**). Imported copies retain their file-access and
locate actions. Supported editions also show verified story progress; see
[progress tracking](game-progress.md#recently-played).
Use the arrow buttons beside Recently Played to scroll through the cards with
a mouse or keyboard. They appear when the row overflows; touch and trackpad
scrolling also remain available.
Play time starts after the game is ready and counts visible play, including
cutscenes. Loading, background tabs, the shared game menu, rotation prompts and
exiting do not count. Progress made before time tracking was introduced has no
recorded duration or date. These statistics are recorded per copy. With Dropbox
connected, [play activity sync](dropbox-save-sync.md#recently-played-across-devices)
shares them across devices with the same game edition.

The app-install invitation becomes eligible on the third homepage visit in the
same browser. A fresh page load counts once; client-side navigation and component
remounts do not add visits. Dismissing it permanently suppresses the invitation,
including in other open tabs, while the browser retains the site's local data.
Installed apps, embedded pages and browsers without writable local storage do
not show it. Installation still depends on browser support.

Recognized in-app browsers show an **Open in browser** screen before the library
or player loads. This covers Facebook, Messenger, Instagram, TikTok, LinkedIn,
Snapchat, Pinterest, LINE, WeChat and Android webviews with explicit signatures.
Detection is best effort: apps that identify themselves as ordinary browsers
cannot always be distinguished. Normal browser tabs and link-preview crawlers
keep the usual experience.

The screen retains the original page URL, including its query and fragment.
On Android, **Open in browser** attempts a browser intent without requiring a
specific installed browser. Apps may block the attempt. On iPhone and other
platforms, the button focuses instructions for the containing app's menu.
**Copy link** offers a selectable URL if clipboard access is denied. Browser
menu labels vary; opening externally does not transfer browser-local saves or
imported files. The handoff uses an uncached request rewrite; assets, API calls,
cloud callbacks and monitoring bypass it. Ordinary browser page requests also bypass the proxy function through a static user-agent matcher; the legacy `/scummvm.html` handler remains unconditional. Keep the matcher a superset of the in-app detector. Verify these rules with
`node --test test/in-app-browser.test.mjs` and test the native handoff on real
devices when changing app-specific behavior.

Use **Add a game**, or drop ZIPs, ISOs, or a folder containing them onto the
homepage or a game page. Pack one game per ZIP, with its data at the root or
inside one enclosing folder. Local archives support up to 4 GiB including
unpacked contents. ISO imports support ISO 9660 and Joliet data discs with
2048-byte sectors and read game files directly from the image. Imported ZIPs and
ISOs detect games at the archive root first, then search subfolders and launch
from the detected data directory. Installers beside the game data can stay in
place. Import checks the file contents to distinguish editions; large discs can
take longer to scan.
UDF-only images, raw BIN/CUE images, interleaved files and multi-extent files
need to be extracted and packed as a ZIP first. Disc images must contain
ScummVM game data; installer-only discs need installation/extraction first.
Large compressed ZIPs need temporary browser storage. A large ZIP with
compression disabled can be read directly from disk. See
[packaging a collection](#package-a-local-scummvm-collection).

When the browser gives the library file handles for a dropped folder, ScummWEB
remembers which archives came from that folder, including its subfolders. While
the tab is visible, the library rotates one probe at a time across folders and
archives without a known folder. It backs off from three to 30 seconds between
probes. When an archive becomes readable again, ScummWEB checks the other
unavailable archives from its folder. For an archive with no known folder, it
checks the other ungrouped archives.

**Locate ZIP or ISO** checks that game's saved path immediately and opens the
picker if you still need to reconnect it. Use **Allow file access** if your
browser needs permission again. Reimporting the same archives by dropping their
folder records the shared folder for existing entries and preserves their saves.
While file access is being checked, the library card shows a spinner in its
top-left corner. Hover over the card or focus it with the keyboard to reveal
**Checking files**. The status remains available to screen readers, and reduced
motion disables the spinner animation.

Once the library contains an imported version, press and hold a game cover, or
choose **Manage library**, to enter removal mode. The button stays hidden when
the library contains only bundled games.
Only cards with removable imported versions shake in this mode.
Use the **×** on an imported game's cover to remove its library reference; original game files,
cached archives and saved games stay untouched. A card with multiple versions
opens a chooser with a trash button beside each imported version. Removed rows
fade out and collapse; the chooser stays open to remove another version or close
when finished. Bundled versions cannot be removed. **Undo** restores removals in reverse
order during the current visit, including the original imported-game IDs.
The removal notice offers Undo for five seconds, then fades out.
Choose **Done** or press Escape to return to browsing. Previously hidden bundled
games are restored automatically when the library loads. These library changes
apply to the current browser only.

An import with the same game data as an included copy uses the bundled version.
Reimport an older unverified archive to make a distinct edition selectable again.
Fingerprints compare normalized data paths, uncompressed sizes, and CRC-32
values, ignoring manuals, licenses, launchers, and configuration. Regenerate
[`data/bundled-game-files.json`](../data/bundled-game-files.json) with
`node scripts/generate-bundled-game-files.mjs` after publishing changed ZIPs.
The command uses public range reads.

### Player controls

In-game overlay buttons and touch pads share the translucent surface, border,
icon colors and interaction states in [`game-controls.css`](../app/styles/game-controls.css).
Adjust the `--game-control-*` variables together to keep every control consistent.
Idle controls use subdued colors; hover, keyboard focus, pressed and expanded
states increase their opacity. Top and bottom controls share vertical insets,
and both sides share horizontal insets, using the larger safe-area inset on
each axis to preserve symmetric spacing around cutouts.

- **Esc** or **Open game menu** opens the shared menu. **Esc** returns from a
  picker or closes the menu. Clicking or tapping outside the menu closes it
  when no save or load is in progress. The game pauses at a supported update
  boundary.
  **Sound Volume** starts at 100% and scales the whole audio mix. Each player
  launch sets ScummVM's music and effects levels to maximum and clears their
  mute settings, including overrides carried over from earlier sessions.
  Game Speed starts at 1.0× and ranges from 0.5× to 2× in 0.1× steps.
  Subtitles start enabled with speech each launch.
  Games with optional subtitles show a **Subtitles** switch;
  changes apply to the running game for the current session. **Resume Game** returns focus to the game, and
  **Quit Game** returns to the game page or library. Choosing Exit or Quit Game
  immediately removes the toolbar and touch controls while navigation completes.
- **Save Game** and **Load Game** use the selected edition's native slots.
  **New Save** takes an unused manual slot. Overwriting asks for confirmation
  and keeps the existing caption. Games can deny saving or loading during
  cutscenes. Unsupported actions offer the native menu. Maintain verified
  shortcuts in [`game-menu.mjs`](../app/game-player/game-menu.mjs).
- **Report a bug** is the last game-menu action. Describe the problem and send
  the report; game identity and player settings are included automatically.
  Opening the form requests a native diagnostic save when the engine permits
  it. The temporary save and companion files live only in memory, outside the
  library, Continue index, save backups and cloud synchronization. Cancelling
  discards the capture. Unsupported, failed or timed-out saves do not block
  reports; the report records a bounded failure reason when available. Each
  completed capture restores the native save listing to the player directory,
  so consecutive reports can reuse the temporary slot without stale entries.
- On desktop, move the pointer to the top edge or outside the game canvas to
  reveal the toolbar. Keyboard focus or an open game menu keeps it visible.
  Press **Esc** to release cursor capture and reveal the toolbar.
- On recognized TVs, use the D-pad and **OK** to navigate. During play,
  **Back** focuses **Exit game**, Left/Right moves between toolbar buttons, and
  Down returns to the game. In mouse-driven games, tap **OK** to left-click or
  hold and release to right-click.

If the browser suspends audio, choose **Start audio**. Nonfatal engine messages
appear as a **Compatibility warning** icon; click it to read every notice for
the current launch. This includes King's Quest VII's unfinished subtitles and
optional font, music and codec warnings. Notices do not open automatically or
interrupt startup. Fatal errors stop startup; game and file choices still ask
for input.

### Mobile play

Browse in portrait; gameplay uses landscape. Leaving a game requests portrait
again. If the browser refuses rotation, the gallery shows a phone rotation icon
and a prompt to turn your device upright. If fullscreen is refused, use
the fullscreen button beside the game menu to try again. It is available outside
fullscreen on supported devices once the game has opened.
The game remains open when you rotate back. **Exit game** stays available.
While **Skip intro** is visible, the toolbar and touch gameplay controls stay
hidden. They return to their normal visibility when the action disappears.

- Tap the game to position the cursor. Double-tap or press **L** to left-click.
  Use **R** for right-click. Drag the cursor pad while holding either button
  to drag in the game. You can also hold and drag directly on the canvas.
- Touch pads share a circular disc and thumb cap. The pointer symbol marks
  cursor control: moving your finger moves the cursor; holding still does not.
  Lifting resets the cap without repositioning the game cursor. Arrows mark
  movement controls, which retain each game's directional behavior.
- In Grim Fandango and Escape from Monkey Island, the stick walks or turns. The lightning button opens
  Use/Talk, Examine, Pick up/Put away, and Inventory. When dialogue choices are
  available, the right-hand actions become a single checkmark to confirm the
  highlighted line (Enter). Move the stick up/down to change the selection.
  Exploration actions return automatically when choices close. In Hugo games,
  the stick walks in the direction you drag.
- In Hugo, Apple II Hi-Res Adventures, and Zork I–III, tap the keyboard icon
  and press Enter to submit a command. An empty field sends Enter by itself.
- In Zork I–III, supported phone browsers also show a microphone beside the
  keyboard. Hold it while speaking an English command; release to transcribe
  and submit it automatically, without opening the keyboard. This uses the
  browser's built-in speech recognition (Siri's speech engine in Safari),
  which may require a network connection and microphone permission. The mic
  stays hidden when recognition is unsupported, and hides if permission or
  the speech service is unavailable. Cancelling the touch, leaving the player,
  or opening the game menu discards the recording without sending a command.
  If the permission prompt leaves fullscreen, the player tries to restore it
  when recording starts or focus returns. Browsers that require another gesture
  retry on the next tap or key press in the player.
- In Castle Master, hold the movement stick up/down to walk or left/right to
  turn; release it to stop. The lightning button opens Use/Activate, Throw rock,
  Look up/down, Face forward, Walk, Run, Crawl, and Game information. Tap the
  game to aim; double-tap to dismiss a title screen. The bundled DOS demo
  automatically selects the prince and skips character selection on both Play
  and Skip intro.

### Continue and native saves

In the Dropbox preview (`?dropbox=true`), **Continue** loads the latest intact ScummWEB autosave for the selected
edition. It skips damaged checkpoints and can fall back to older checkpoints
or an eligible native save. Supported games keep three hidden checkpoints,
updated about every two minutes and at the first safe moment after loading.
The browser captures the engine's native save and companion files without
overwriting any manual slot. Saved story progress uses checkpoint data where a
compatible story map is available. Outside the preview, **Continue** uses the
latest eligible native save. **Start from beginning** keeps your saves.
Games without compatible save and startup-load support use their in-game menu.

The browser-local index supplies launch actions from checked save files.
Changed or unknown entries trigger a background native metadata query that
yields to a launch. Imported copies keep separate save paths, and older shared
saves remain available for backup. Existing settings take precedence over the
shell's original-menu defaults. The native output bridge marks saves pending
before opening them and refreshes the index after compression and close.

AgentSCUMM may request an isolated save scope outside the normal library and
backup directories. Its scoped Sky launch can copy one legacy manual slot
before startup, preserving the original and any existing scoped save.

Run the save and menu regressions after changing either bridge.

```sh
node --test test/browser-saves.test.mjs test/continue-saves.test.mjs \
  test/native-save-completion.test.mjs test/hero-launch-actions.test.mjs \
  test/save-backups.test.mjs test/game-menu.test.mjs test/game-route-frame.test.mjs \
  test/player-controls.test.mjs
```

### Backing up and transferring saved progress

Optional [Dropbox save syncing](dropbox-save-sync.md) copies existing browser
saves and preserved backups automatically after connection. Configure the public
Dropbox app key and callback before enabling it. Game archive storage is unchanged.

Close every game tab, then open **Settings → Saved games → Transfer saves → Export saves**.
The ZIP includes active and preserved saves. Saves live in the current browser
profile and clearing site data removes them. Backup and restore require Web
Locks for site-wide coordination.

When save storage is busy, the game's launch button shows **Updating…** and
becomes available once storage is ready. Exiting a game flushes pending writes
before the player releases its save locks.

On the destination device, add the matching game edition and choose **Import
saves** in **Transfer saves**. Select ordinary ScummVM files or a ZIP. Original
filenames and companion files are required; unrecognized filenames prompt for
the matching library game. Compatible separate slots combine automatically,
with incoming overlapping slots taking precedence. Changed companion/index files
keep the complete incoming copy together. Previous progress is preserved for
recovery before activation. Identical contents are skipped.

Exports contain ordinary ScummVM save files with unchanged bytes, grouped by
game edition and current/recovery copy. Extract the chosen copy into desktop
ScummVM's save folder. Exported collections preserve edition identities in their
folder names for reimport. Unavailable editions remain recoverable until their
matching game is added. The recovery view groups earlier copies by game;
**Restore this copy…** reviews and activates the selected complete copy, retaining
the previous progress. All copies remain in exports.

Dropbox uses a single app-owned `saves` folder of checksum-named archives.
Automatic reconciliation requires no conflict choices and retains the original
competing copies. Desktop transfers use Import/Export rather than copying into
Dropbox. Internal cloud archives use `scummweb-save-backup` v1 with checksums and
a cloud manifest; they can also be imported for recovery. Desktop ZIPs need no
application manifest. Transfers retain the 64 MiB archive and 4,096-file limits;
ordinary save payloads total less than 63 MiB. Restoring can temporarily need
space for both save trees. Quota failure preserves the active tree.

### Installing the web app

Use **Install app** when offered. In Safari use **Add to Home Screen** on
iPhone or iPad or **Add to Dock** on macOS Sonoma and later.
ScummWEB opens in its own window after installation. Fullscreen follows the
same controls and device-specific rules as play in a browser tab.

The homepage captures early browser installation offers before hydration. It
loads the invitation stylesheet only after an eligible offer; keep the native
installation prompt inside the click handler. `pnpm test` covers early offers,
stylesheet failures, installation gestures, and persisted dismissal.

### Library and game files

Capture file-picker and drop handles in the original user event before loading
import processing. Keep saved-source restoration and permission requests eager.
Library transactions abort on synchronous write or clone failures, retaining the
original error and preventing partial saves or removals. `pnpm test` covers these
boundaries, chunk-load failure recovery, and temporary-file fallback.

For a direct ZIP link, URL-encode a direct HTTPS archive URL in the fragment.

```text
/local/play#zip=https%3A%2F%2Fexample.com%2Fgame.zip
```

The host must allow cross-origin GET requests. Hosted ZIPs are limited to
128 MiB compressed and 256 MiB unpacked. For early game recognition, support
byte ranges and expose `Content-Range` through CORS. Otherwise the player can
inspect the archive after downloading it once. If the host blocks access,
download the ZIP yourself and import it locally.

The browser downloads directly with credentials omitted, redirects rejected,
and no referrer. Validation rejects unsafe paths, symlinks, duplicate entries,
encrypted archives, and size or entry-count violations. The fragment stays
client-side. [ZIP recognition](../app/archive-game-presentation.mjs) selects
presentation by file signatures. ScummVM detects the actual game at startup.

The browser can retain up to four verified catalog or hosted installations,
keyed by the full archive URL. Saves are stored separately. Use a versioned
URL when replacing a hosted archive so cached launches pick up the new files.

### Intro checkpoints

Bundled **Skip intro** uses a native startup option or a checkpoint captured
before the first player decision. Preserve language, character, or control
selection when the original game requires it. An edition without a checkpoint
can use its engine's live intro action, shown only while that engine reports
an opening segment that can be skipped. Full Throttle's demo uses this path
because saving is unavailable before its first decision. Imported games offer **Skip intro**
while their engine exposes a supported opening segment. The action advances
through the game's original transition and preserves its menus and choices.
Continue omits the action. The Big Red Adventure can skip its publisher slides
to the original New Game, Load and See Intro menu. Chivalry is Not Dead retains
its instructions dialog, then can skip its title sequence through the original
scene initializer, preserving its first story choice. Iceman’s opening includes its credits and Tahiti
prologue, ending when the beach accepts player input. Myst closes the action
permanently at its original linking book or demo preview menu.
Gobliiins’ bundled interactive DOS demo uses the native
intro action and retains its original character controls; saving through the
ScummWEB game menu is unavailable for this edition. Gobliins 2’s interactive DOS
demo starts at its original clickable title and uses British English (`gb`) for
exact engine detection; it also has no saving through the ScummWEB game menu.
Goblins Quest 3’s English interactive demo likewise starts from a clickable title
and enters its ship scene directly, with no intro checkpoint or menu saving.

Gabriel Knight’s Day One demo retains its original Intro/Play menu. Choose Play
to enter the bookshop; native saves and restore are supported.

Freddy Pharkas’s voiced CD demo retains its original Windows package; ScummVM
identifies the shared game data as its English DOS CD demo. Saving and loading
are supported in this edition. Its bundled intro checkpoint starts at the first
playable town scene after the original narration, before any player action.

Space Quest 6’s voiced interactive demo retains its original title, instructions
and opening scenes. This edition explicitly disables saving and restoring, so
it has no intro checkpoint or Continue.

Myst’s Windows CD demo retains its original preview menu and interactive library.
Native Skip intro advances past the publisher opening while preserving the
Sneak Preview, Scenes from Myst and Making of Myst choices. Saving and loading
are disabled for this demo, so it has no checkpoint or Continue.

Toonstruck’s English DOS demo uses the complete unchanged official ZIP and shares the original game’s artwork. Native intro skip preserves the opening Zanydu scene. Walking, Save/Load and Continue are verified; the original demo content and choices remain intact.

Simon the Sorcerer’s English DOS CD demo keeps its complete unchanged official ZIP, including installer files and notices. Its brief publisher splash leads directly to the original prison scene. Movement and verb selection work. ScummWEB Save/Load and the original quick-save command are rejected at the tested opening scenes; launcher Continue is unavailable for this engine. No checkpoint is seeded.

Simon the Sorcerer II’s English DOS CD demo preserves the complete unchanged official ZIP, including its compressed setup bundle and notices. The original intro can be skipped with the supported native action. Movement and in-session Save/Load work; launcher Continue is unavailable for this engine, so restart and use Load Game. No checkpoint is seeded. Its catalog target follows the original fixed simon2 save prefix.

Hand of Fate’s English DOS interactive CD demo preserves the complete unchanged official ZIP, with original game fonts, drivers and notices. Native intro skip reaches Zanthia’s laboratory, and walking works. Bucket-backed Save/Load and cached Continue restored the tested save positions. Native guards can reject further save/load requests in the opening room; no checkpoint is seeded.

Lands of Lore’s English DOS interactive CD demo preserves the complete unchanged official ZIP and its original notices. Native intro skip reaches the original Gladstone dungeon. Turning, personal-import and bucket-backed Save/Load and cached Continue restored the tested direction. Let movement settle before loading; an immediate post-turn request was rejected. No checkpoint is seeded.

Putt-Putt Saves the Zoo’s English Windows HE72 demo keeps its complete unchanged official ZIP, including original executable, W32 runtime and compiled Help. Native intro skip reaches the original raft scene, and selecting the inventory log works. Personal and hosted saving is rejected in that tested scene; no Continue checkpoint is seeded.

Putt-Putt Travels Through Time’s English US Windows HE90 demo preserves the complete unchanged official ZIP and its original notices. Native intro skip retains the four-era portal choice; selecting the dinosaur portal enters its original scene. Personal and hosted saving is rejected in that tested scene; no Continue checkpoint is seeded.

Freddi Fish 2’s English Windows HE80 demo keeps the complete unchanged official ZIP, including original runtime libraries, executable, settings and compiled Help. Native intro skip reaches the original turtle scene; clicking the pipe triggers Tucker’s dialogue and animation. Personal and hosted saving is rejected in that tested scene; no Continue checkpoint is seeded.

Pajama Sam 2’s English Windows HE95 demo preserves the complete unchanged official ZIP and its original notices. Native intro skip reaches the original storeroom; interacting with the vacuum cleaner triggers its character animation. Personal and hosted saving is rejected in that tested scene; no Continue checkpoint is seeded.

Touché’s English DOS demo preserves the complete unchanged official ZIP, including its DATABASE directory and root speech files. The native intro action reaches the original street without a seeded checkpoint. Movement, Save/Load and Continue restore the tested character position.

Tony Tough’s English Windows extracted demo keeps the complete unchanged official ZIP with all music and speech directories. It retains the original New Game menu and native intro action. Movement works in the office; the original demo disables saving and loading, so no Continue checkpoint is seeded.

Return to Zork’s English DOS v1.2 CD demo preserves the complete unchanged official ZIP, including its compressed RED driver archives and original Anthology readme. The original valley, native intro action and sign interactions work. Use the game’s F2 Save and F3 Load menus; saved progress restores after a fresh launch, while ScummWEB’s save drawer and Continue are unavailable for this engine. The upstream demo has no ripped CD audio tracks and displays ScummVM’s CD-audio notice; acknowledge it to proceed. Its checksum-pinned ZIP exceeds the standard 128 MiB download limit, so this catalog target allows 150 MiB while retaining the standard 256 MiB expanded limit.

Sherlock Holmes: The Serrated Scalpel’s English DOS interactive demo preserves the complete unchanged official ZIP. It starts with the original Lestrade dialogue and verb interface, without a seeded checkpoint; examination, movement and native save/Continue restoration are verified.

Bud Tucker’s English DOS interactive demo keeps the complete unchanged official ZIP, including its original source/data files, sound drivers and WAV audio. It starts directly in the original Plugs scene without a seeded checkpoint. Movement, scene scrolling, the F1 action-panel switch, Save/Load and Continue are verified.

Rex Nebular’s English DOS three-room interactive demo keeps the complete unchanged official ZIP, including its original intro, executables and sound drivers. It preserves the original opening and native Skip intro without a seeded checkpoint. Movement and in-session Save/Load are verified. Continue is disabled because fresh startup loading misplaces Rex.

Torin’s Passage’s English DOS/Windows interactive demo keeps its complete unchanged official ZIP, including the original packed setup, Help, drivers, documents and audio. Its original preview menu and Escarpa start prompt are preserved without a seeded browser checkpoint. Movement, scene navigation and native pause are verified. Saving was rejected in both tested Escarpa views; Load and Continue have no verified player save. Its original Windows Write README is delivered as readable UTF-8 text; the source ZIP remains unchanged.

Shivers’ English Windows interactive demo keeps its complete unchanged official ZIP, including packed Sierra setup, Microsoft video runtimes, Help and original movies. It fits the ordinary archive limits. The original menu, New Game movie and office start prompt are preserved without a seeded browser checkpoint. Scrapbook interaction and page navigation work. Saving was rejected in both the scrapbook and stable office views; Load and Continue have no verified player save.

Lighthouse: The Dark Being’s English interactive demo keeps its complete unchanged official Windows ZIP, including original packed setup, Help, robot movies and notices. The pinned native detector identifies this edition as DOS/English. Its original menu and Island Fortress prompt are preserved without a seeded browser checkpoint; scene navigation works. Saving was rejected in the tested reached scene; Load and Continue have no verified player save. Its Word 6 README, named README.WRI upstream, is delivered as readable UTF-8 text with the original ZIP unchanged.

Phantasmagoria’s English DOS v1.100.000 interactive demo keeps the complete unchanged official ZIP, including all movies, drivers, packed setup and original notices. Its original menu, game naming and chapter selection are preserved without a seeded browser checkpoint. Shift+Escape sends the native movie skip action while Escape opens the browser game menu. Movies and kitchen navigation work; the original P control-panel Save/Restore bookmark and native Continue Old Game work. ScummWEB’s separate Save is rejected and Load remains empty even after a native bookmark; reopen with Play and use the original game controls. The original PDOCO.TXT gameplay guide is exposed as readable text. Only this demo receives a 400 MiB archive/450 MiB expanded limit and a 15-minute download timeout, covering its pinned 363,714,852-byte ZIP and 436,843,348-byte expansion.

Leisure Suit Larry 7: Love for Sail!’s English DOS v1.0 demo keeps its complete unchanged official ZIP, including original drivers, PKLITE-packed installer, DOS Help, audio/music and README. The pinned demo uses SCI2.1, while the full edition uses SCI3. Its original menu offers a promotional tour and a playable Liar’s Dice scene; tutorial and dice quantity selection work. Saving was rejected in the tested dice scene, with no verified Load or Continue save. No browser checkpoint is seeded.

Freddi Fish 3’s English Windows HE90 mini demo keeps the complete unchanged official ZIP, including original runtime libraries, promotional bitmap, settings and compiled Help. Native intro skip reaches Pelican Sam’s landing; buoy navigation opens the net scene. Saving was rejected in that tested scene; no browser checkpoint is seeded.

Freddi Fish 4’s English UK Windows HE99 demo keeps the complete unchanged official ZIP, including original executable/runtime library, settings, compiled Help and icon. Native intro skip and canyon navigation reach Gill Barker’s wheel-nut stall. ScummWEB saving is unavailable and the original demo computer opens only Quit; no browser checkpoint is seeded.

Pajama Sam 3’s English UK Windows HE99 demo keeps the complete unchanged official ZIP, including original executable/runtime library, settings, compiled Help and icon. Native intro skip reaches the sweets’ jail with Florette; inspecting the key triggers Sam’s original response. ScummWEB saving is unavailable in the tested scene; no browser checkpoint is seeded.

Putt-Putt Enters the Race’s English UK Windows HE99 demo keeps the complete unchanged official ZIP, including original executable/runtime library, settings, compiled Help and icon. Native intro skip and road navigation reach the apple-tree scene. Original demo Save/Load are greyed out and ScummWEB saving is unavailable; no browser checkpoint is seeded.

Putt-Putt Goes to the Moon’s English Windows HE70 demo keeps its complete unchanged official ZIP, including original launcher/runtime, HE data and compiled Help. Native intro skip reaches the lunar crater scene, where hotspot animation and movement work. ScummWEB saving is unavailable in the tested scene; no browser checkpoint is seeded.

Spy Fox 3: Operation Ozone’s English US Windows demo keeps its complete unchanged official ZIP, including original launcher, runtime and game data. Native intro skip reaches the courtyard; entering the bowling alley pro shop works. ScummWEB saving is unavailable in the tested scene; no browser checkpoint is seeded.

The English Windows HE70 demo of Fatty Bear’s Birthday Surprise keeps its complete unchanged official ZIP, including original launcher/runtime and all game data. Native intro skip reaches the front yard, where skateboarding and movement work. ScummWEB saving is unavailable in the tested scene; no browser checkpoint is seeded.

Backyard Football’s English Windows demo preserves its original mode selection and bundled two-player controls note. The one-player matchup and kick return work. The original note specifies mouse input for the 49ers and a joystick or gamepad for the Melonheads in two-player mode. ScummWEB saving was unavailable in the tested play.

Bear Stormin’ is the standalone DOS version of the Putt-Putt Goes to the Moon flying minigame. The ScummVM downloads page lists it as a demo. Press Space to pause or resume flight. The original level prompts display passcodes. ScummWEB saving was unavailable during the tested flight.

Big Thinkers! 1st Grade’s American English Windows demo opens in Ben and Becky’s activity room. The native Skip Intro action works. Select the puzzle box to start the jigsaw and move pieces from the tray to the board. ScummWEB saving was unavailable in the tested puzzle.

Big Thinkers! Kindergarten’s American English Windows demo includes Bird Perch Math, Hide ’n’ Seek, and Mealtime Mazes. The native Skip Intro action reaches the original backyard. Choose the fence to play Bird Perch Math, then select the number that matches the birds. ScummWEB saving was unavailable in the tested activity. The complete original Windows Help file remains inside the download.

Blue’s ABC Time Activities’ English Windows Sneak Peek demo includes Bathtime Rhymes. Native Skip Intro reaches the bathtub. Choose a picture bubble, then choose a picture whose word rhymes with the first. The original Windows Help and rights notices remain in the download. ScummWEB saving was unavailable during the activity.

Blue’s Birthday Adventure’s English Windows Sneak Peek demo includes the toy room, farm, and one clue. Click the farm picture, follow the garden sign, and give the watering can to the chick to reveal the clue. The complete archive retains its original live-action clips and Windows Help. The original Help says this demo does not save game progress.

The English Windows demo of Let’s Explore the Airport opens at an airplane boarding gate. The native Skip Intro action works. Select the open airplane door to enter the passenger cabin, and use the green arrow to go back. ScummWEB saving was unavailable in the tested cabin scene.

The English Windows demo of Let’s Explore the Farm opens in the barn. The native Skip Intro action works. Select the book to open the glossary and choose a word to see its illustrated entry. The original demo does not support saving.

The original Windows v1.0 demo of The Tortoise and the Hare contains one page in English and Spanish. Select a language on the book menu, then choose Read to Me for word highlighting or Let Me Play to explore the animated page. The cottage door reacts to clicks. Saving and loading through the ScummWEB menu are unavailable.

The original Windows demo of Arthur’s Birthday contains one page in English and Spanish. Choose a language, then use Read to Me to follow the highlighted words or Let Me Play to explore the kitchen. The calendar reacts to clicks. Saving and loading through the ScummWEB menu are unavailable.

The original Windows v1.0 demo of Just Grandma and Me contains one animated page in English, Japanese and Spanish. Choose a language, then open Read to Me or Let Me Play. The round marker beside the text replays the passage. Saving and loading through the ScummWEB menu are unavailable.

The original Windows demo of Arthur’s Teacher Trouble contains one animated school hallway page in English and Spanish. Choose a language, then select Read to Me or Let Me Play. The right arrow opens the original end-of-demo page. Saving and loading through the ScummWEB menu are unavailable.

The original Windows demo of Ruff’s Bone contains one animated story page in English and Spanish. Choose a language, then select Read to Me or Let Me Play. The right arrow opens the original end-of-demo page. Saving and loading through the ScummWEB menu are unavailable.

The original Windows v1.1 demo of The New Kid on the Block includes one English poem. Read to Me shows one illustrated page. Let Me Play includes two interactive pages. The right arrow advances to the original publisher message after the last page. Saving and loading through the ScummWEB menu are unavailable.

The original Commodore 64 Maniac Mansion demo offers a Hands-On Demo and a Self-Running Demo. F7 returns to the original menu. ScummWEB can save and restore progress in the hands-on mode.

The original DOS Christmas Card 1988 opens a message editor. Type a greeting and press Enter to watch it scroll across the card before the holiday animation.

The original DOS EGA edition of The Seasoned Professional plays Sierra’s animated holiday short. Press F9 and choose Restart to replay it. The title opens directly into the original animation.

The original DOS Christmas Card 1992 starts its animated holiday greeting when launched. Use the ScummWEB game menu for playback speed or to return to the library.

The original DOS guide opens at its instructions. Press Space to visit the next attraction.

The Neverhood’s English Windows demo keeps its complete unchanged archive,
including its original data, executable and Smacker library. The original opening
and first clay room render; native intro skip, waking Klaymen and walking work.
Save, Load and Continue restore the saved position. The existing native intro
action is used without a seeded save. Its published hero and faithful box-front
cover are shared with personal imports.

Spy Fox’s English US Windows demo retains its complete unchanged package,
including executable libraries, audio, original Windows Help and settings.
No express rehosting grant or redistribution ban was found in the inspected
notices; official promotional hosting supports the cautious assessment recorded
in the catalog. The original opening, native intro action and phone-booth keypad
work. Saving is unavailable in the tested first playable scene; no checkpoint
is supplied. The demo shares its existing published hero and box art.

Pajama Sam’s English Windows demo retains its complete unchanged package,
including its compiled Help, configuration and notices. Native intro skip
reaches the original treehouse scene, and clicking its path enters the next
room. Saving is unavailable in the tested first scene, so no intro checkpoint
is bundled. The existing shared hero and box art are reused.

Freddi Fish and the Case of the Missing Kelp Seeds’ English Windows demo
retains its unchanged original package, including its Help file and notices.
Native intro skip reaches the shipwreck scene, which accepts object-click input.
Saving is unavailable in that tested scene; no intro checkpoint is bundled.
The existing shared hero and box art are reused.

Putt-Putt Joins the Parade’s English Windows demo retains its complete original
Windows package, including the compiled Help file. Native intro skip advances
the opening, and the first road scene accepts click-point input. Saving is
unavailable in the tested opening and first playable scene; no intro checkpoint
is bundled. Its existing shared artwork is reused.

Technobabylon’s English Windows demo preserves its original Start menu and
opening. Its approximately 206 MiB unchanged ZIP has a target-only 300 MiB download,
900 MiB expanded-data allowance and 10-minute timeout. The first Trance scene
accepts walking. Host save creation failed verification, so saving and Continue
are unreliable for this demo. Its embedded nedraed fonts retain their CC BY-SA 3.0
notices; a separate launcher notice provides the original font titles, creator,
source links and license link. This font license does not cover the game itself.

Primordia’s English Windows demo retains its original Start Game menu and opening.
The unchanged archive is approximately 804 MiB, so this target alone allows a
900 MiB download, 1 GiB expanded data and a 15-minute download timeout. Its
first deck scene accepts walking input. Save attempts currently produce empty
files in the browser runtime; saving and Continue are unreliable for this demo.
Keep this limitation in the compatibility record and play the demo in one sitting.

Gemini Rue’s English Windows demo supports native saving and restoration. Its
intro checkpoint starts on the first playable street scene after the original
prologue and phone conversation, before any player action. The complete archive
retains its manual, credits, original voice pack and plugins.

Resonance’s Windows demo remains personal-import only while its embedded font
redistribution restrictions are unresolved. Its original archive is preserved
unchanged; no public game-data package is published. Existing AGS import support
reaches the original menu.

The Riven Windows demo remains personal-import only because its included
QuickTime installer license restricts distribution and network transmission.
The intact archive is not published or stripped of its original components.

Humongous games can load legacy DXA conversions when the requested DAT or SMK
movie is absent. Existing original movies take precedence; a converted movie
does not replace a corrupt original or other missing game resources.

Keep bundled checkpoints in [`launcher/skip-intro/`](../scummvm-shell/launcher/skip-intro/)
and their edition-specific settings in
[`launcher-game-overrides.json`](../launcher-game-overrides.json). Use
`checkpointOnly` when a seeded launch opens directly at gameplay. Checkpoints
are loaded from memory and excluded from player save lists. Remove older saved
copies only when their bytes match a shipped checkpoint.

After editing metadata, regenerate the catalog and rebuild the shell.

```sh
node scripts/create_launcher_metadata.mjs scummvm-shell/scummvm.ini scummvm-shell/games.json
pnpm run build:scummvm --shell-only
```

## Local development

### Game pages and search discovery

[`app/recognized-games.mjs`](../app/recognized-games.mjs) projects catalog
and import recognition into game landing pages, play routes, and the sitemap.
Keep existing URLs and separate demo identities. Import-only pages require
a matching ZIP before play. Legacy bucket URLs forward to the current player
while preserving source and save identity. Unidentified games use `/local/play`.

Landing pages are canonical. Play routes reuse their share metadata and use
`noindex`. Use optional `shortTitle` for long search titles without changing
display titles or slugs. The editorial budgets are 65 characters for titles
and 160 for descriptions. Supply developer and publisher structured-data
credits only when verified independently of the generic `studio` field.

Full Throttle imports support legacy `MONSTER.SOF` FLAC speech as well as the
original `MONSTER.SOU`. The runtime reconstructs one mono 11025/22050-Hz speech
line at a time for digital iMUSE, preserving mouth animation and save restoration.
Legacy lossy FT speech and recompressed DIG/COMI bundles remain unsupported.

### Development commands

Follow the [README quickstart](../README.md#run-locally) for a credential-free
server. Development needs no private service credentials. `pnpm secrets:check` verifies credential absence without
retrieving source values.

The pinned patches in `patches/dependencies/` replace Rollup's vulnerable
`picomatch` calls with the already pinned `minimatch` implementation. Package
extensions supply the replacement; overrides remove both direct dependencies
and fdir's unused optional peer. Both CommonJS and ES module entry points are
patched. This covers Sentry's current filters and wrapping, plus ordinary
dynamic target globs, rather than promising identical semantics for every
picomatch-specific glob form. `test/dependency-security.test.mjs` checks bounded
ReDoS inputs, both entry points, CommonJS wrapping, source maps, dotfiles and
ordered dynamic target exclusions. Remove the patches, extensions and removal
overrides together once an audited upstream release replaces the affected
dependency. Keep the full dependency audit and supply-chain holds enabled.

| Command | Purpose |
| --- | --- |
| `pnpm lint` | Check JavaScript and JSX syntax. |
| `pnpm test` | Run the Node tests. |
| `pnpm build` | Stage assets and build the app. |
| `pnpm run dev` | Develop at `http://localhost:47831`. |
| `pnpm run start` | Serve the production build at `http://localhost:47831`. |
| `pnpm run record:preview` | Stream distinct preview frames as MPEG-TS. |
| `pnpm run verify` | Boot detected games with the Chrome/Chromium harness. |

The app stages the tracked `scummvm-shell/` into `public/`. Edit
`web-shell/` for browser-runtime changes. Keep the core and engine plugins
from the same build. Set the same project-relative `SCUMMWEB_DIST_DIR` for
build and start when an audit must coexist with another server.

Production builds use Next.js `experimental.inlineCss` to include each route's
existing styles in its HTML, removing the first-render stylesheet request.
Development and client-side navigation retain Next's normal stylesheet handling.
Check HTML size, cold and cached visits, responsive layouts and interactive
states when changing this setting; inline styles cannot be cached independently
of the HTML.

Local app servers default to port `47831` so Dropbox can use one stable callback:
`http://localhost:47831/dropbox-callback.html`. An occupied port fails startup
instead of selecting another port. Explicit `--port NUMBER` and `--port auto`
remain available for isolated checks; OAuth on those origins requires its own
registered callback.

`SCUMMVM_GAMES_ORIGIN` selects the game bucket and `NEXT_PUBLIC_SITE_URL`
sets canonical URLs. Game data downloads directly from the bucket. Local
verification can use `/games-proxy/*`. The Broken Sword Macintosh and Gemini Rue demos keep
their complete upstream archives and each has a 200 MiB download allowance with a
ten-minute timeout. Downloads up to 256 MiB use memory backing to avoid browser
temporary-file reservation failures; larger catalog ZIPs retain Blob backing.

Local builds skip Sentry source-map uploads. For startup reports, filter Sentry
by `component:scummvm-player` and narrow by `startup_stage`, `game_source`,
or `game_slug`. Imported-game reports omit private source details. The
[production workflow](production-delivery.md) handles deployment credentials.

For mobile changes, check the launcher, settings, gallery, and player at
320px and 390px portrait widths, short landscape, and tablet widths. Test
rotation, fullscreen refusal, audio, and touch input on physical Android and
iOS devices before claiming device coverage.

The initial library renders complete HTML on the server. Its interactive bundle loads after the hero decodes and receives two animation frames, or immediately on keyboard, pointer or drag input. A one-second deadline releases a stalled image. File drops capture handles during the original event and hand them to the importer once it is ready. This uses Turbopack's `import.meta.env.SSR` branch elimination; keep the server-rendered markup intact when changing the loading boundary.

Browser error listeners start before hydration. The full Sentry SDK loads after the initial hero decodes and has a paint opportunity; an early error, explicit report or router transition loads it immediately. Errors retain their original objects and unhandled mechanisms until initialization completes. Global errors, install-prompt failures and private startup reports use this shared loader. SDK options and server-side reporting remain unchanged. Automatic breadcrumbs, logs and request instrumentation begin when the SDK initializes.

### Sentry issue reads

`pnpm sentry:issues -- --days 14 --limit 10` uses the process's explicitly configured
Sentry credentials, organization and project. It never opens dotenv files. Failed authentication stops the read.

### Bug report collection

`POST /api/bug-report` accepts the game menu's description and diagnostic save
attachments. It uses the existing server Sentry configuration and sends a
Feedback event only after explicit submission. Delivery failures retain the
description for retry. Success requires a successful Sentry ingestion response.
The route returns 503 when reporting is disabled or unconfigured.

Each report includes `reproduction.json` with the catalog identity or detected
engine/game/edition, runtime version, player settings, native slot, original
save filenames and SHA-256 checksums. Download its save attachments, verify their
checksums and restore them with the matching edition and native filenames.
Game data is not attached; reproducing an imported game requires the same game
edition. Saves restore progress, not browser/audio state or a crashed process.
Reports omit automatic personal library titles, archive filenames, private ZIP
URLs, request cookies and breadcrumbs. The player's description and native save
contents are submitted as entered/captured. Sentry controls report retention.

Missing snapshots include an allowlisted `capture.reason` when available, such
as `slot-unavailable`, `native-save-rejected` or `capture-timeout`. Raw native
errors are excluded because they may contain private paths. Older reports may
have only a status and cannot identify the exact capture failure.

Sentry's project-level **Enable Spam Detection** setting can automatically
classify feedback as spam. These reports remain stored but are hidden from the
normal feedback inbox and do not trigger feedback alerts. Include the Spam
folder when reviewing reports; successful ingestion does not imply inbox or
alert delivery. Keep this setting enabled unless deliberately changed in
**Settings → Projects → scummweb → User Feedback**.

The collector requires a same-origin request, limits descriptions to 4,000
characters, and accepts at most 16 save files totaling 2 MiB within a 3 MiB request.
It validates filenames and metadata and applies a bounded per-instance limit of
five attempts per ten minutes. Identical retries reuse a report ID within that
instance. These are best-effort serverless limits; hosting-level protection is
needed for shared limits across instances. No additional storage service is used.

Regression checks:

```sh
node --test test/bug-report.test.mjs test/sentry-bug-report.test.mjs test/diagnostic-saves.test.mjs test/player-controls.test.mjs
```

The SDK test uses an in-process transport and sends no live reports. Browser QA
can point the standard Sentry DSN settings at a local envelope receiver. Verify
menu order, capture, cancel, success, failed delivery/retry, unsupported saves and
mobile layout. Compare player saves and Continue before and after capture, and
restore an attached save with the matching edition. Native patch and shell changes
require the normal [runtime rebuild](#rebuilding-and-upgrading-scummvm).

## Maintaining game compatibility

[`data/game-compatibility.json`](../data/game-compatibility.json) is the
source for [game testing](game-testing.md) and the searchable compatibility
page. Each checked edition records its native `gameId`, `edition`,
`status`, and `observation`.

- `startup-verified` means the game reached a screen, menu, original prompt,
  or first scene. State how far testing went.
- `startup-warning` and `startup-failed` cover engine or browser-runtime
  problems. Set `issueScope` to `scummvm` or `scummweb`, including in
  historical checks. Keep copy-specific missing, corrupt, or mismatched file
  diagnostics in private QA. Omit editions where invalid files prevented a
  startup check.
- `not-tested` records a game without a checked edition. Its upstream rating
  comes from the pinned `upstreamReference`.

When retesting, preserve earlier observations in `history`, update the current
result, and set `recordedOn`. Regenerate the summary after changing the data.

```sh
node scripts/generate-compatibility-docs.mjs
node scripts/generate-compatibility-docs.mjs --check
```

## Evaluator telemetry

The host sets `__scummwebEvaluationEnabled` before launch to opt in.
`__scummwebEvaluationGame` exposes native game identity. Queen and SCUMM
publish room and variable data through bounded queues. Drain
`__scummwebEvaluationEvents` and `__scummwebEvaluationGameVariableEvents`
in place and handle each queue's overflow flag. Both hold at most 256 records.
Variable streams begin with a baseline. Loads reset that baseline, and SCUMM
also resets it on restart. Changes between engine ticks can be missed.
Keep raw evaluator data out of ordinary player observations.

### Querying game state

Append `?telemetry=1` to the play URL. In the game frame or its same-origin
parent, `window.scummwebTelemetry.read()` returns a detached
`{ identity, snapshot }` with each field initially `null`. The opt-in snapshot
stays in the frame. It uses `schema_version: 1`, `room_id`, optional
`room_name` and `room_ready`, monotonic `sample_time_ms`, and `banks`.
Banks contain up to 4,096 indexed or named values. Engines sample at update
boundaries, typically every 250 ms and on room changes.

[Patch 19](../patches/scummvm/19-query-engine-game-state.patch) defines the query
interface, and [patch 20](../patches/scummvm/20-extend-native-game-telemetry.patch)
adds engine providers. Use `ScummWebTelemetry::Sample` at a native
update boundary when adding a provider. Verify an initial sample and a change
in an actual game. For edition identity and story rules, see the
[map guide](game-progress.md).

## Rebuilding and upgrading ScummVM

Use `pnpm run build:scummvm --shell-only` for browser templates. It regenerates
the staged shell using the existing compiled runtime. Changes to native patches
or generated `scummvm.js` require the full build and a matching
[corresponding-source archive](../scummvm-shell/doc/scummvm-source.html).

Keep generated adapters in the staging path. Native unload signals must wait
for runtime initialization, including native constructors. Optional Web Speech
support may leave no voices; it must not abort startup or cleanup. Startup
resource reports identify only scripts created by the player, while runtime
exceptions and failures of those dependencies remain visible.

The startup watchdog reports slow launches while retaining the runtime frame
and prepared game files. A late, validated ready signal clears only that timeout and cancels its
watchdog; other startup failures remain visible. Exiting still releases the
selected game and cancels the launch.

The browsing hero and launch screen share `GameHeroScene`: the selected game's
title, edition metadata, summary, artwork source, crop and viewport geometry
stay fixed during launch. The homepage also shows the selected game's title.
The reserved action area changes from Play/Continue to the current loading
message; it never moves the title or resizes the artwork. The hero toolbar keeps
the original logo and consistent navigation links on the left, with Settings at
the right edge. Loading shows only the same exit control used during play,
including while the route is being prepared. The spinner and progress accent are
indeterminate and stop animating with reduced motion enabled. Startup failures
replace them with a static warning in the same reserved area. Check direct
launches, selected imported editions, long titles and errors on narrow and short
landscape viewports, including the route handoff and scrollbar spacing.

Follow [the upgrade skill](../.codex/skills/scummweb_upgrade-scummvm/SKILL.md)
to change the engine or SDK pin. It owns the ordered patch procedure,
[patch ledger](../.codex/skills/scummweb_upgrade-scummvm/references/patches.json),
and [upgrade memory](../.codex/skills/scummweb_upgrade-scummvm/references/upgrade-memory.md).
For a native rebuild with the existing catalog, run from the repository root.

```sh
python3 .codex/skills/scummweb_upgrade-scummvm/scripts/upgrade_check.py --offline
SCUMMVM_REUSE_CATALOG=1 pnpm run build:scummvm
pnpm test
```

The build verifies the pinned checkout and plugin coverage, then syncs
`dist/` to `scummvm-shell/`. Keep `runtime-assets.json` and
`runtime-version.json` with the staged bundle. Test a bundled game and a local
ZIP for startup, audio, input, save and resume. Confirm a catalog launch loads
only its selected engine plugin.

For launch diagnostics, use `?startupTrace=1` and inspect the
`[scummweb:startup]` console record. Compare cold, prepared-cache, and
legacy-cache runs. When comparing User Timing marks manually across frames,
add each frame's `performance.timeOrigin`.

### Classic freeware additions

Follow the [add-game skill](../.codex/skills/scummweb_add-game/SKILL.md)
for complete metadata, tags, redistribution checks, engine registration,
fingerprints, bucket delivery, hero and box art, gameplay and live verification. [`data/classic-freeware.json`](../data/classic-freeware.json)
pins the approved packages, upstream URLs, and SHA-256 values. Put exact
archives and required source files in `downloads/`. The additive build
preserves existing targets and writes packages to `dist/games/<gameId>.zip`.
For a catalog rebuild with The Secret of Monkey Island (Demo), use the
[English DOS EGA demo ZIP](https://downloads.scummvm.org/frs/demos/scumm/monkey1-dos-ega-demo-en.zip).
The God of Thunder engine is available for personal imports. The official
`gotfree.zip` remains excluded because its included license prohibits
redistribution.

Nippon Safes uses the official ScummVM freeware game data. In the browser,
its opening choice keeps the L/R mouse controls available: left click watches
the intro and right click starts the game. It does not offer a separate
**Skip intro** action.
The original **Saved Game** choice opens ScummWEB's **Load Game** drawer.
Closing it returns to the New Game/Saved Game choice; choosing a save restores
the saved story directly.
Its original manual-code screen is replaced with an interactive version of the
game's own portrait screen. Click Donna, Dough or Dino to start that character's
original reveal and story, including after completing a part. Hovering highlights
the portrait and displays its original name graphic. Keyboard users can select
with Tab or 1–3 (left to right), then confirm with Enter or Space. Escape and
clicks outside the portraits do not start a story. Language selection,
introductions and saved progress keep their original behavior. This applies to
Amiga and DOS imports; desktop ScummVM retains its own character-selection screen.

Build the Zork I–III packages with [ZILF 1.9](https://github.com/taradinoc/zilf/releases/tag/1.9)
and `python3 scripts/build_zork_packages.py /path/to/zilf/bin`. The packages
include the compiled stories and their license and source information.

To preview staged packages, run
`python3 -m http.server 0 --bind 127.0.0.1 --directory dist/games`.
Point `SCUMMVM_GAMES_ORIGIN` at that server and start
`pnpm run dev`. Publish and verify each ZIP before deploying
its catalog entry. See [game-library publishing](production-delivery.md#game-library-publishing).

## Game launch analytics

The catalog funnel emits each event at most once per play page visit. It
excludes local imports, direct ZIP links, and saved external launches.

| Event | When it fires |
| --- | --- |
| `game_launch_attempt` | The player starts preparing a catalog game. |
| `game_launch` | ScummVM renders the first frame. `load_time_ms` measures time since the attempt. |
| `game_launch_failed` | Startup fails or times out. `failure_reason` is `startup_error` or `first_frame_timeout`. |
| `game_play_30s` | The ready player accumulates 30 visible seconds with controls available. |
| `game_play_60s` | The ready player accumulates 60 visible seconds with controls available. |
| `game_play_milestone` | The ready player accumulates five visible minutes with controls available. `play_time_seconds` is 300. |

Events share `game_slug`, `entry_point` (`hero`, `library`, `game_detail`,
or `direct`), `launch_mode` (`fresh` or `continue`), and a random `launch_id`.
The ID identifies one catalog play-page visit, stays stable through failure
recovery and intro skips, and changes for another visit. It contains no user or
save identity. A visit can recover after a failure, so failure and success counts
are not mutually exclusive. Milestones use cumulative visible, ready time, pause
while hidden or controls are unavailable, and fire once per threshold. They do
not establish active input or puzzle progress. The existing five-minute event
retains its meaning; shorter milestones have distinct names.

Page locations sent to GA4 omit URL fragments; Vercel Analytics redacts direct
ZIP fragments. Do not include ZIP URLs, file names, saves, or input contents in
analytics fields.

### GA4 custom definitions

Sending a parameter alone does not make it available in standard reports.
In the production property's **Admin → Data display → Custom definitions**,
maintain these event-scoped definitions:

| Parameter | Definition | Reporting API name |
| --- | --- | --- |
| `game_slug` | Dimension: Game slug | `customEvent:game_slug` |
| `entry_point` | Dimension: Entry point | `customEvent:entry_point` |
| `launch_mode` | Dimension: Launch mode | `customEvent:launch_mode` |
| `failure_reason` | Dimension: Failure reason | `customEvent:failure_reason` |
| `play_time_seconds` | Dimension: Play milestone seconds | `customEvent:play_time_seconds` |
| `traffic_type` | Dimension: Traffic type | `customEvent:traffic_type` |
| `automation_reason` | Dimension: Automation reason | `customEvent:automation_reason` |
| `load_time_ms` | Metric: Load time, unit Milliseconds | `customEvent:load_time_ms` |

Use `averageCustomEvent:load_time_ms` for average startup latency; the unprefixed
custom metric sums durations. `play_time_seconds` is a milestone category, not a
measure to sum into total play time. Allow 24–48 hours for new custom definitions
to become reportable; do not assume historical values are backfilled. See
[Google's custom-definition guidance](https://support.google.com/analytics/answer/14240153).

Keep `launch_id` as a raw event parameter for DebugView or an already configured
event export. Do not register a unique-per-launch ID as a reporting dimension:
it can cause high-cardinality aggregation. Exact launch matching requires raw
events; aggregate Data API counts alone are not a matched funnel. These changes
do not configure an export or provision another service.

Validate these names through the property’s reporting API after registration.

### Artwork signing relay

The signing relay limits requests to the approved immutable artwork plan.
Access verification performs HEAD for one pinned existing object and reads no
object body. Publishing requires separate approval of the exact plan. Before
listening, the relay checks the active mapping hash, canonical nonlinked workspace,
content-addressed keys, MIME types, checksums and limits of 512 objects and 2 MiB
per object. The single-object route selects one exact logical entry and requires
its planned local bytes; its signer cannot access sibling entries.

Creates use `If-None-Match: *`; existing objects are verified without overwrites.
The publisher verifies bytes and immutable cache metadata after delivery. These
routes include no games, pruning, bucket administration or automatic activation.
Keep the signing policy private and credential rotation separate from publishing.
Failed authentication stops the operation.

Run synthetic signer and plan checks without provider access:

```sh
pnpm test:artwork-relay
```

### Generated heroes and card box art

Use the [game-assets skill](../.codex/skills/scummweb_game-assets/SKILL.md) and
its [generation reference](../.codex/skills/scummweb_game-assets/references/generation.md).
[`data/generated-artwork.json`](../data/generated-artwork.json) records
reference credits, dates, prompts, hashes, dimensions, and any approved
illustrated compositions. The game mappings retain source credits and
`heroImageMobilePosition` can adjust the narrow-screen crop.
Demos and full versions share the same hero and box art; keep demo labels and
edition-specific gameplay captures separate from those shared images.
Desktop hero titles shrink to preserve whole words; mobile titles wrap naturally.
The hero slideshow uses the catalogue's Featured order, including imported games
and demos, regardless of the catalogue's current sort or genre filter.

Generate heroes from original promotional references. Faithfully restore
original box fronts for card covers. Keep gameplay screenshots as original
captures, with delivery resizing or lossless encoding only.

The homepage sends artwork delivery metadata only for the heroes and covers it renders, plus the featured screenshot strip. Alternate mobile sources remain available for heroes without responsive renditions. All responsive candidates and image placeholders are preserved; other screenshot metadata loads when its gallery becomes visible.

### Delivery encoding and sizing

Use full-resolution lossless WebP for PNG captures and lossless WebP for
smaller screenshot variants. Posters and heroes use WebP quality 80, effort 6.
Preserve aspect ratios and source objects. Avoid upscaling.

The explicit optimizer tests 4:4:4 AVIF at quality 70 or 60, effort 6. A
candidate must save at least 10% against WebP and reach 35 dB decoded RGB PSNR.
Inspect text, fine detail, gradients, and pixel art before publishing. Offer
AVIF only when it covers every WebP width. Match preload sizes and sources to
the visible hero so the browser can reuse its request.
Game cards preload and decode their matching responsive hero at high priority
when hovered, focused or pressed, alongside the cover animation. Navigation also
warms it as a fallback. Only the latest card's preload is retained; slideshow
neighbors continue loading at low priority. Leaving or blurring a card cancels
its unfinished preload by clearing both AVIF and fallback sources. Completed
covers stay warm; clicking commits the preload through the navigation handoff.
Obsolete slideshow preloads clear their sources too.
The selected slide commits before scrolling into view, avoiding a frame of the
previous game. Slideshow warming waits for the rendered hero to decode and have
a paint opportunity; the initial hero does not create a hidden duplicate.
The initial backdrop requests synchronous decoding on home and game pages.
Already decoded neighbors remain available for immediate navigation.

## Branding

The [branding provenance](../image-assets/provenance.json) and
[export manifest](../public/brand/manifest.json) identify logo, social, and
icon sources. After replacing an icon source, update provenance and run
`node scripts/generate-favicon-assets.mjs` to refresh exports, manifests, and
content versions. The generated favicon SVG is an export.

When updating the homepage social JPEG, set the URL version in
[`lib/seo.mjs`](../lib/seo.mjs) to `v=sw-` plus the first 16 characters of
its SHA-256.

### Social preview assets

Run `pnpm generate:social-cards` after changing catalog copy or artwork.
Track [`data/social-cards.json`](../data/social-cards.json), which records the
inputs and checksums. The generated 1200×630 JPEGs are ignored build outputs.
The build regenerates missing, changed, or corrupt cards from verified local,
cached, or public artwork. Game metadata uses content-versioned static URLs.
Legacy game image routes rewrite to the same JPEG.

## Catalog fixtures and artwork

The baseline game is Beneath a Steel Sky from `downloads/bass-cd-1.2.zip`.
`/scummvm.html#sky` forwards to its current play page.

Maintain game metadata, logical artwork paths, and per-image credits in
[`app/game-presentation.js`](../app/game-presentation.js) and
[`app/retro-game-artwork.json`](../app/retro-game-artwork.json).
Give each recognized game a summary, studio, genre, and metadata sources.
Keep summaries, including mobile summaries, focused on the story and gameplay.
Put platform, language, voice support, media, and edition details in metadata
instead of descriptions; keep the `(Demo)` title suffix for demos.
Keep its specific `genre` description and set an explicit `category` from
`libraryCategories` in `app/home-shell/library-query.mjs` for library filtering
and sorting. Preserve the category when sharing metadata with demos and imports.
Use Sports for the Backyard sports games, Cards & board games for card and
board collections, Family & education for children's activities and adventures,
and Animation for the non-interactive Christmas cards. Genre inference remains
a fallback for older imports without a category.
Give every bundled target play-style and theme launch tags in
`app/game-player/launch-tags.mjs`; year and platform come from edition metadata.
Record unresolved credits in `metadataNote`. Keep remakes and demos distinct,
and share art across editions when it accurately represents the game.
Prefer three distinct gameplay captures showing locations, puzzles, or actions.
Preserve exact edition and source credits where available.

Earlier artwork sources whose exact credits are only recorded here include
Muttill's signed 1994 Flight of the Amazon Queen promotional art and the
following originals.

| Game | Box art | Gameplay |
| --- | --- | --- |
| The Secret of Monkey Island (Demo) | [Steve Purcell's DOS cover](https://gamesdb.launchbox-app.com/games/images/139-the-secret-of-monkey-island) | [DOS EGA demo](https://www.dosgamesarchive.com/download/the-secret-of-monkey-island) |
| Sfinx | [Box scan](https://gamesdb.launchbox-app.com/games/images/86024-sfinx) | [English DOS, images 2–4](https://www.scummvm.org/screenshots/lkavalon/) |
| Fate of Atlantis | [DOS box scan](https://gamesdb.launchbox-app.com/games/images/5386-indiana-jones-and-the-fate-of-atlantis) | [ScummVM gallery](https://www.scummvm.org/screenshots/lucasarts/indy/) |
| Last Crusade | [Amiga box scan](https://gamesdb.launchbox-app.com/games/images/18310-indiana-jones-and-the-last-crusade-the-graphic-adventure) | [ScummVM gallery](https://www.scummvm.org/screenshots/lucasarts/indy/) |
| Day of the Tentacle | [DOS cover](https://gamesdb.launchbox-app.com/games/images/3575-maniac-mansion-day-of-the-tentacle) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/tentacle/tentacle_dos_en_1_2_full.png) |
| Loom | [Original cover](https://gamesdb.launchbox-app.com/games/images/5391-loom) | [English DOS VGA](https://www.scummvm.org/data/screenshots/scumm/loom/loom_dos_en_2_2_full.png) |
| Maniac Mansion | [Amiga cover](https://gamesdb.launchbox-app.com/games/images/41172-maniac-mansion) | [English Amiga](https://www.scummvm.org/screenshots/lucasarts/maniac/) |
| Monkey Island 2 | [Original cover](https://gamesdb.launchbox-app.com/games/images/723-monkey-island-2-lechucks-revenge) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/monkey2/monkey2_dos_en_1_1_full.png) |
| Sam & Max Hit the Road | [DOS cover](https://gamesdb.launchbox-app.com/games/images/58-sam-max-hit-the-road) | [English DOS](https://www.scummvm.org/data/screenshots/scumm/samnmax/samnmax_dos_en_1_3_full.png) |
| Zak McKracken and the Alien Mindbenders | [Amiga cover](https://openretro.org/amiga/zak-mckracken-and-the-alien-mindbenders) | [English Amiga](https://www.scummvm.org/screenshots/lucasarts/scumm:zak/) |

[Planète Aventure](https://www.planete-aventure.net/jeux.php?cat=screenshots&num_jeu=1822)
also supplied a supplemental capture.

## Package a local ScummVM collection

```sh
python3 scripts/package_retro_games.py --source /path/to/game-folders --output /path/to/game-archives
```

Run first to inventory the collection and check the output volume. Append
`--write` to package and verify the ZIPs. Matching outputs are reused,
conflicts are preserved, and source folders stay intact. Import the output
ZIPs through **Add a game**.
