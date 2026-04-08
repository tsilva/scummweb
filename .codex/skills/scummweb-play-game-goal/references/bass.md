# Beneath a Steel Sky

Use these notes when the active target is `sky`.

## Launch Rules

- Prefer the seeded skip-intro route when available:
  `/scummvm.html?skipIntroTarget=sky#-x 0 sky`
- For full-run objectives in this repo, this seeded route is still the preferred start because it skips only the noninteractive intro and lands at the canonical first playable state.
- The normal entry is `/scummvm.html#sky`.

## Control Rules

- For normal room interactions in BASS, treat left click as examine/look and right click as action/pickup/use.
- Right click can still change meaning depending on whether an inventory item is selected.
- If an item interaction fails, test:
  plain right click on hotspot
  selected-item right click on hotspot
  selected-item left click on hotspot

## Inventory Rules

- Moving the pointer to the top edge opens the inventory tray.
- The tray can remain open and block scene interactions; close it before trying to walk or use a hotspot.
- Selecting an item is not always enough to use it. In BASS, item use can require selecting the item in the tray, then right clicking the item, then right clicking the destination hotspot.
- Verify the selected item name from the header text before applying it.

## Verified BASS-Specific Findings

- The default room interaction split is stable across rooms: left click examines, right click acts.
- In the opening escape room, the stairs are temporarily lethal while the guard is still downstairs. Clicking the stair hotspot sends Foster down and gets him shot.
- In that same room, confirm the hotspot label before any click near the left ledge/stair area. A stair mis-click can look like an item-targeting miss.
- In the right-door puzzle room, the loose item on the left is the `Metal bar` / crowbar-like item.
- The pickup hotspot is the short dark horizontal `Rung` near the left ledge, not the red hanging pipe below it.
- To pick up that bar from the ledge, right click the bar hotspot.
- For the same puzzle, the reliable sequence is:
  1. right click the bar in the room to pick it up
  2. move to the top edge and open inventory
  3. select the `Metal bar`
  4. right click the selected `Metal bar`
  5. move to the right-hand door
  6. right click the door
- In practice, Foster may only walk into position on the first door click; if the door is still shut once he reaches it, right click the door again to open it and transition through.
- After the bar is applied correctly, the actor can open the door and move through to the next screen.

## Minimization Rules

- When the room and puzzle are already known, go straight to the needed actor and hotspot instead of probing unrelated exits.
- If the actor is already standing near the target door, do not re-run the entire item-selection chain unless the item state was lost.
