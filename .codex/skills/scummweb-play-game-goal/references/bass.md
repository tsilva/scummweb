# Beneath a Steel Sky

Use these notes when the active target is `sky`.

Source note: this is a distilled agent reference built from a user-provided full-game walkthrough plus repo-specific port findings. Optimize for fast checkpoint lookup, not prose fidelity.

## Launch Rules

- Prefer the seeded skip-intro route when available:
  `/scummvm.html?skipIntroTarget=sky#-x 0 sky`
- For full-run objectives in this repo, this seeded route is still the preferred start because it skips only the noninteractive intro and lands at the canonical first playable state.
- The normal entry is `/scummvm.html#sky`.

## Control And Inventory Quirks

- In BASS, left click is usually `look/examine`; right click is usually `act/pick up/use`.
- Right click changes meaning when an inventory item is armed. If an item interaction fails, test in this order:
  plain right click on hotspot
  selected-item right click on hotspot
  selected-item left click on hotspot
- Moving the pointer to the top edge opens the inventory tray.
- The inventory tray can remain open and block the room. Close it before trying to walk or use a hotspot.
- Item use can require three separate states:
  select the item in the tray
  right click the selected item to arm it
  right click the destination hotspot
- Verify the selected item name from the inventory header before applying it.

## Goal Lookup

- `Checkpoint 1: Escape and wake Joey`
  Use when Foster has just started the game or is still below the first factory level.
- `Checkpoint 2: Top-level factory, power plant, and lift access`
  Use when Foster is outside the factory on the upper level, still working through Lamb's factory sabotage, or about to fix the lift with the cable.
- `Checkpoint 3: Apartments, Lamb, Burke, insurance, and office break-in`
  Use when the lift works, Foster can access apartment level shops and offices, or needs the grappling hook and LINC-space office access.
- `Checkpoint 4: Ground-level setup, cathedral, reactor, club, and tunnel entry`
  Use when Phoenix access is enabled and Foster is working around the pool, club, security-services office, or backstage tunnel route.
- `Checkpoint 5: Tunnel, medical, restricted area, virus, KEN, and finale`
  Use when Foster has entered the narrow passage or is already inside the late-game medical / monitoring / restricted areas.

## Walkthrough Checkpoints

### Checkpoint 1: Escape and wake Joey

**Preconditions**

- Foster is at the canonical first playable state or still in the first factory section.
- Joey is not active yet.
- The guard is still a threat on the opening screens.

**Critical actions**

1. Pick up the `RUNG` on the left side of the opening walkway.
2. Use the `RUNG` on the right-hand `DOOR` and move through.
3. Go west back to the factory.
4. Go down the stairs, then east.
5. Examine the robot `SHELL` in the junk pile south of the elevator.
6. Insert the `CIRCUIT BOARD` into the shell.
7. Talk to `JOEY`.
8. Stand on the elevator in the middle of the room.
9. When `HOBBINS` leaves to shut off the alarm, go east immediately.
10. Open the low `CABINET` on the north wall.
11. Take the `WRENCH`.
12. Talk to `HOBBINS` until he explains how the transporter / elevator system works and mentions the broken charge device.
13. Go west.
14. Tell `JOEY` to fix the `TRANSPORTER`.
15. When the transport robot places a barrel on the elevator, climb down the hole.
16. Wait for `JOEY`, then tell him to open the door.
17. Search `REICH'S CORPSE`.
18. Talk to `JOEY` to wake him up.
19. Go east to reach the upper city level outside the factory.

**Optional / Nonblocking**

- Take the `SANDWICH` from the cabinet if there is time. It is not needed for progression.

**Proof of progress**

- Foster is outside the factory on the upper level.
- `JOEY` is active again.
- `WRENCH` is in inventory.
- `REICH` has been searched and his card is available for later use.

**Common failure / recovery**

- Opening room: do not click the stairs while the guard is still below; it is lethal.
- Opening door puzzle: the left-side item is the short dark `RUNG`, not the red hanging pipe.
- Opening door puzzle: on the opening walkway screen, the `RUNG` hotspot is the small horizontal metal bar mounted on the wall just above and slightly right of the red hanging pipe.
- If the transporter cannot be fixed, talk to `HOBBINS` again until he mentions the charge-device problem.
- If `JOEY` stays inert after `REICH` appears, talk to him again after searching the corpse.

### Checkpoint 2: Top-level factory, power plant, and lift access

**Preconditions**

- Foster has reached the upper level outside the factory.
- `JOEY` is active.
- `WRENCH` is in inventory.

**Critical actions**

1. Use a nearby `LINC TERMINAL` and look up `REICH` for background context.
2. Enter the factory at the east end of the level.
3. Talk to `ANITA` until `LAMB` orders her away.
4. Go east to the visible machinery.
5. Insert the `WRENCH` into the open machine where gears are visible, then take it back.
6. Go back southwest.
7. Use the `WRENCH` on the `WELDER`.
8. Ask `JOEY` if he wants a new shell so he takes the welder body.
9. Go east again.
10. Look through the stores `WINDOW`.
11. Tell `JOEY` to investigate the `STORES`.
12. When he returns, ask for his report.
13. Tell `JOEY` to disable the `FUSE BOX`.
14. After the `BZZT`, enter the stores.
15. Move the `GANGWALK`.
16. Take the `PUTTY` hidden underneath.
17. Leave east; let `POTTS` search Foster if needed.
18. Go to the `POWER PLANT` on the west side of the level.
19. Use the `WRENCH` on both east-side `BUTTONS`.
20. Tell `JOEY` to push one button while Foster pushes the other.
21. After the pipe bursts and the old man leaves, use the switch on the barred machine.
22. Take the `LIGHT BULB`.
23. Put the `PUTTY` into the empty `SOCKET`.
24. Throw the same switch again to blow open the bars.
25. Use the switch that is pointing up so both switches point down.
26. Return to the elevator area.
27. Before entering the lift, tell `JOEY` to cut the `CABLE` on the east side of the screen.
28. Use a `LINC CARD` on the lift slot.
29. Enter the lift.
30. Pick up the `CABLE`.

**Optional / Nonblocking**

- Talk to `POTTS` beyond required gating dialogue.
- Keep or lose `REICH'S GLASSES`; `POTTS` can confiscate them and they are not required later.

**Proof of progress**

- `JOEY` has the welder shell.
- `PUTTY`, `LIGHT BULB`, and `CABLE` have all been collected.
- The lift works and Foster can move into the apartment-level arc.

**Common failure / recovery**

- If `JOEY` cannot disable the stores, re-run the sequence in order: inspect window, ask him to investigate, ask for report, then tell him to disable the fuse box.
- If `POTTS` confiscates `KEY`, `OIL`, or `GLASSES`, keep going; they are not required for the critical path here.
- If the lift does not advance, make sure `JOEY` cut the cable before Foster uses the lift slot and enters.

### Checkpoint 3: Apartments, Lamb, Burke, insurance, and office break-in

**Preconditions**

- Foster has the `CABLE`.
- The lift can reach the apartment level.
- `JOEY` is in welder form.

**Critical actions**

1. Go west from the lift area.
2. Enter the northeast door beside the other elevator.
3. Use the card on the western slot.
4. Enter the west door into the apartment.
5. Move the `PILLOW`.
6. Take the `MAGAZINE`.
7. Leave and go to the `TRAVEL AGENCY`.
8. Talk to the `AGENT` until Foster is scheduled for a tour.
9. Give the `MAGAZINE` to the agent.
10. Take the `TICKET` from the desk.
11. Find `LAMB`.
12. Give `LAMB` the `TICKET`.
13. Go to `LAMB'S FACTORY` and wait for him if needed.
14. Ask `LAMB` about the promised factory tour.
15. After Lamb leaves because of the broken machine, go east.
16. Talk to `ANITA`.
17. When she asks for the `LINC CARD`, give it to her.
18. Continue talking until she explains `D-LINCS`, `SCHRIEBMANN PORTS`, and gives the `JAMMER` program.
19. Leave the factory.
20. If `LAMB` is standing outside, use the `LINC TERMINAL`.
21. Open `SECURITY SERVICES`, `D-LINC LAMB`, and freeze his assets.
22. Wait until `LAMB` tries to use the elevator.
23. Ask him if he has a problem.
24. Offer to feed his cat.
25. Go down to `LAMB'S APARTMENT`.
26. Use your card to enter.
27. Take the `VIDEOTAPE` from the shelf.
28. Go to `DR. BURKE'S OFFICE`.
29. Talk to the holographic receptionist until she refuses entry.
30. Ask `JOEY` to talk to her and tell him to use his natural charm.
31. Go west when the door opens.
32. Ask `BURKE` about a `SCHRIEBMANN PORT`.
33. Keep talking until he installs it.
34. Ask `BURKE` how to get out of the city; note that `WILLIE` is `ANCHOR` the insurance agent.
35. Go to the `INSURANCE OFFICE`.
36. Tell `JOEY` to use the computer so he scrambles the hard drive.
37. Ask `ANCHOR` about a special policy.
38. Say `DR. BURKE` sent Foster, not `LAMB`.
39. When `ANCHOR` walks into the back room, tell `JOEY` to use the welder on the `STATUE`.
40. Take the loose `ANCHOR`.
41. Combine the `ANCHOR` with the `CABLE` to make a grappling hook.
42. Return to `HOBBINS' FACTORY` on the top level.
43. Go onto the ledge where Foster escaped the first security officer.
44. Use the grappling hook on the large `S` sign on the opposite building.
45. Move through the broken window.
46. Go east.
47. Use your card on the `INTERFACE SLOT`.
48. Use the `INTERFACE` to enter LINC-space.
49. Take the `BALL`.
50. Go east.
51. Use `OPEN` on the `CARPET BAG`.
52. Take the `MAGNIFYING GLASS` and `SURPRISE GIFT`.
53. Use `DECRYPT` on both `?` documents.
54. Use `DECOMPRESS` on the compressed data.
55. Go east.
56. Use the password swirls to open the north-side door.
57. Take the `BUST` and `BOOK`.
58. Use `DECRYPT` on the new document.
59. Disconnect.
60. Use the card on the right-side terminal in the room.
61. Open `SECURITY SERVICES`.
62. View the documents.
63. Enable `SPECIAL PHOENIX ACCESS`.
64. Use the elevator slot and go to ground level.

**Optional / Nonblocking**

- Talk to `GALLAGHER` on the apartment level. It does not advance the route.
- Feed `LAMB'S CAT`. It is not required before taking the videotape.

**Proof of progress**

- Foster has the grappling hook and has already broken into the office.
- `JAMMER` is acquired.
- The Schriebmann port is installed.
- `SPECIAL PHOENIX ACCESS` is enabled and the ground level is reachable.

**Common failure / recovery**

- If `ANITA` does not hand over the `JAMMER`, keep talking until all useful dialogue is exhausted after giving her the card.
- If `ANCHOR` does not leave the desk, make sure `JOEY` scrambled the hard drive first and Foster identified himself as sent by `DR. BURKE`.
- In LINC-space, solve the password swirls only far enough to open the north door; do not wander once the required document path is clear.

### Checkpoint 4: Ground-level setup, cathedral, reactor, club, and tunnel entry

**Preconditions**

- `SPECIAL PHOENIX ACCESS` is enabled.
- Foster can ride to ground level.
- Foster has the `VIDEOTAPE`.

**Critical actions**

1. On ground level, wait for the large older woman to pass, then talk to `OFFICER BLUNT`.
2. Talk to `MRS. PIERMONT`.
3. Go to the small shack on the south side of the pool.
4. Examine the door and lock.
5. Use a `LINC CARD` on the lock and enter.
6. Take the `SECATEURS`.
7. Go to the `ST. JAMES CLUB` entrance.
8. Talk to the `DOORMAN`.
9. Find `MRS. PIERMONT` again and ask her to sponsor Foster.
10. Go to the apartment entrance on the east side of the pool.
11. Talk to the `GARDENER` about the flowers.
12. Ask the `BOY` about `DANDELIONS`.
13. Talk to the gardener again so he admits he is not the real gardener.
14. Use the `INTERCOM` next to the elevator.
15. Go up and talk to `PIERMONT`.
16. Ask her about the club.
17. When she gets up to call the club, put the `VIDEOTAPE` in the `VCR`.
18. When `SPUNKY` barks at the monitor, examine his bowl.
19. Take the `DOG BISCUITS`.
20. Leave the apartment.
21. Go to the `BRICKS` and `PLANK`.
22. Put the dog biscuits on the plank.
23. Enter `ST. JAMES CLUB`.
24. Talk around the room briefly, then leave.
25. Wait until `SPUNKY` finds the biscuits outside.
26. Use the `ROPE` to launch `SPUNKY` into the pool.
27. When `BLUNT` leaves to help `PIERMONT`, enter the `CATHEDRAL`.
28. Examine the dummies.
29. Enter the middle door.
30. Open the lockers and identify `ANITA`.
31. Return to the top-level factory.
32. Go to the locker area where `ANITA` was last seen alive.
33. Open the middle locker and wear the `OVERALLS` / radiation suit.
34. Go east into the `REACTOR LOBBY`.
35. Use the console to open the reactor door.
36. Enter the reactor room.
37. Take the `LINC CARD`.
38. Leave the reactor and close the reactor door from the console if desired.
39. Leave the lobby.
40. Wear the `COAT` again.
41. Enter the `SECURITY SERVICES OFFICE`.
42. Use `REICH'S CARD` on the elevator slot.
43. Use `ANITA'S CARD` on the interface slot.
44. Use the interface.
45. Blind the first `EYE`.
46. Go east and blind the second `EYE`.
47. Go north twice.
48. Ignore the `CRUSADER` for now.
49. Go east.
50. Take the `TUNING FORK` while the eye stays blinded.
51. Go back west.
52. Use `PLAYBACK` on the `WELL`.
53. Disconnect.
54. Leave the building and return to ground level.
55. Talk to the fake gardener again and learn he is `EDUARDO`.
56. Enter the `COURTHOUSE` next to the club and clear the short Hobbins scene.
57. Return to `ST. JAMES CLUB` after the band leaves.
58. Use the `JUKEBOX` until it skips and `COLSTON` gets up.
59. Take `COLSTON'S GLASS`.
60. Go back to `DR. BURKE'S OFFICE`.
61. Give the glass to `BURKE` so Foster gets `COLSTON'S` fingerprints.
62. Return to the club.
63. Use the panel to the right of the stage.
64. Use the `CROWBAR` on the packing case.
65. Take the `LID` and use it on the smaller box.
66. Stand on the box and use the `CROWBAR` on the `GRILL`.
67. Use the `SECATEURS` to remove the grill completely.
68. Enter the `NARROW PASSAGE`.

**Optional / Nonblocking**

- Spend more time talking in the club or courthouse. It is not needed once the gate condition is met.

**Proof of progress**

- Foster has `SECATEURS`, the reactor `LINC CARD`, and the `TUNING FORK`.
- `ANITA'S CARD` has been used to reach the security-services LINC area.
- `COLSTON'S` fingerprints are on Foster's hand.
- Foster has entered the narrow passage under the club stage.

**Common failure / recovery**

- If the doorman still blocks the club, re-talk to `MRS. PIERMONT` until the sponsorship gate is clearly set.
- If `SPUNKY` does not react, confirm the videotape was inserted before leaving the apartment and that the dog biscuits were placed on the plank.
- If the cathedral route is still blocked, wait until `BLUNT` fully leaves the area after the pool distraction.
- In security-services LINC-space, move quickly until the `TUNING FORK` is collected; after that, the timer pressure eases.

### Checkpoint 5: Tunnel, medical, restricted area, virus, KEN, and finale

**Preconditions**

- Foster has entered the narrow passage.
- Foster has the `LIGHT BULB`, `CROWBAR`, `SECATEURS`, and `TUNING FORK`.
- `ANITA'S CARD` and `REICH'S CARD` are available.

**Critical actions**

1. Move east, then northeast, then east.
2. Insert the `LIGHT BULB` into the socket beside the large hole.
3. Go east.
4. Go east again.
5. When the tunnel collapses, run through the southeast door immediately.
6. Use the `CROWBAR` on the plaster behind the vein.
7. Use the `CROWBAR` on the exposed brickwork.
8. Take the `BRICK`.
9. Jam the crowbar into the swelling vein.
10. Use the `BRICK` on the crowbar to force it further.
11. When the medical robot enters, go east.
12. Go north.
13. Use the east-side `CONTROL UNIT` and lower the temperature.
14. Stand on the nearly closed `APERATURE` and pull the metal bar to loosen the grate.
15. Go west and look through the grill into the `TANK ROOM`.
16. Go east twice.
17. Insert the `CIRCUIT BOARD` into the `MEDICAL ROBOT`.
18. Tell `JOEY` to inspect the `TANK ROOM`.
19. When he returns, ask for a full report, especially about the `NUTRIENT TANK`.
20. Tell `JOEY` to open the tap on the nutrient tank.
21. After the dripping starts, enter the tank room so the android falls through the loosened grate.
22. Go northeast twice to reach the monitoring room.
23. Use `REICH'S CARD` on the terminal by the entrance door.
24. Open access to the restricted area door.
25. Go west.
26. After `GALLAGHER` confronts Foster and `JOEY` kills him, search the corpse for the `RED CARD`.
27. Search `JOEY` for the `CIRCUIT BOARD`.
28. Go northeast.
29. Use the `RED CARD` on the interface slot and enter LINC-space.
30. Go east.
31. Blind the eye and go north quickly.
32. Use `DIVINE WRATH` on the `CRUSADER`.
33. Disconnect.
34. Use `ANITA'S CARD` on the slot and enter LINC-space again.
35. Return to the area the crusader was guarding.
36. Go east through that door.
37. Use the `OSCILLATOR` / `TUNING FORK` on the `CRYSTAL`.
38. Take the `HELIX` virus so it is stored on `ANITA'S CARD`.
39. Disconnect.
40. Go west, then southeast.
41. Use `ANITA'S CARD` on the north-wall console so the monitor turns to static.
42. Take the `TONGS` hanging beside the east door.
43. Use the tongs on the tank full of flesh bits.
44. Use the tongs and flesh on the frozen tank.
45. Go east.
46. Open the cabinet beside the middle android.
47. Put the `CIRCUIT BOARD` into the cabinet.
48. Use the console above it.
49. Choose `DOWNLOAD CHARACTER DATA`, then `RUN STARTUP PROGRAM`.
50. Talk to `JOEY / KEN`.
51. Go east.
52. Tell `KEN` to put his hand on one panel.
53. Put Foster's hand on the other panel.
54. Leave `KEN` in place when the door opens and his hand stays stuck.
55. Go east twice.
56. Tie the `CABLE` to the pipe support.
57. Climb down the rungs.
58. Use the `FROZEN FLESH` on the `ORIFICE`.
59. Swing across to the newly opened door using the cable.
60. Finish the automated conversation with Foster's father.
61. When control returns and `KEN` arrives, tell `KEN` to sit in the `CHAIR`.

**Proof of progress**

- The `HELIX` virus is captured on `ANITA'S CARD`.
- `KEN` has been activated from the android cabinet.
- Foster reaches the heart of `LINC`.
- `KEN` sits in the chair and the endgame resolves.

**Common failure / recovery**

- After lighting the tunnel socket, save-state discipline matters. If the collapse sequence kills Foster, reload the nearest stable state before the timed run.
- If the android does not fall in the tank room, confirm the grate was loosened at the `APERATURE` before sending `JOEY` to open the nutrient-tank tap.
- If the crusader path stays blocked, make sure the first LINC-space pass used the `RED CARD`, blinded the eye, and fired `DIVINE WRATH` before disconnecting.
- If the final organic door does not open, confirm the flesh was frozen before using it on the orifice.

## High-Risk Failure Points

- Opening escape room: the stairs are lethal while the guard is still downstairs.
- Opening escape room: the useful pickup is the `RUNG` / metal-bar-like hotspot near the left ledge, not the red hanging pipe.
- `HOBBINS` cabinet run: go east as soon as he leaves; if he returns before Foster takes the `WRENCH`, redo the distraction cycle rather than probing elsewhere.
- Security-services LINC segment with the `TUNING FORK`: treat it as a timed pickup until the fork is collected.
- Club tunnel collapse: move immediately to the southeast door; do not stop to inspect anything once the collapse starts.

## Port-Specific Interaction Notes

- The default room interaction split is stable across the game: left click examines, right click acts.
- In the opening door puzzle, the reliable sequence is:
  1. right click the `RUNG` to pick it up
  2. open inventory at the top edge
  3. select `RUNG`
  4. right click the selected `RUNG` to arm it
  5. right click the right-hand `DOOR`
- In practice, Foster may only walk into position on the first door click. If he reaches the door and it stays shut, right click the door again.
- When a nearby walk hotspot can trigger death or an alarm, confirm the hotspot label before clicking even if the puzzle solution is already known.
- Separate these checks whenever an item-use step feels inconsistent:
  item selected
  item armed
  destination hotspot confirmed
