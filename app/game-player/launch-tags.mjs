import { getVersionMetadata } from "../game-versions.mjs";

const launchTagsByTarget = new Map([
  ["sky", ["Point-and-click", "Cyberpunk"]],
  ["sword25", ["Point-and-click", "Templar conspiracy", "Windows"]],
  ["draci", ["Point-and-click", "Fantasy comedy"]],
  ["drascula", ["Point-and-click", "Vampire comedy"]],
  ["dreamweb-cd", ["Top-down adventure", "Cyberpunk thriller"]],
  ["queen", ["Point-and-click", "Jungle caper"]],
  ["hires1", ["Typed commands", "Murder mystery"]],
  ["lure", ["Point-and-click", "Castle intrigue"]],
  ["nippon-amiga", ["Point-and-click", "Heist comedy"]],
  ["sfinx", ["Point-and-click", "Character switching"]],
  ["soltys", ["Point-and-click", "Wedding caper"]],
  ["zork1", ["Text adventure", "Treasure hunt", "Z-machine"]],
  ["zork2", ["Text adventure", "Wizard’s realm", "Z-machine"]],
  ["zork3", ["Text adventure", "Dungeon trials", "Z-machine"]],
  ["castlemaster-demo", ["First-person adventure", "Haunted castle"]],
  ["monkey4-demo", ["3D adventure", "Pirate comedy"]],
  ["grim-demo", ["3D adventure", "Noir mystery"]],
  ["hugo1-demo", ["Typed commands", "Horror comedy"]],
  ["hugo2-demo", ["Typed commands", "Murder mystery"]],
  ["hugo3-demo", ["Typed commands", "Jungle rescue"]],
  ["atlantis-demo", ["Point-and-click", "Lost civilization"]],
  ["qfi-demo", ["Adventure RPG", "Dark comedy"]],
  ["teenagent-demo", ["Point-and-click", "Spy comedy"]],
  ["comi-demo", ["Point-and-click", "Pirate comedy"]],
  ["pegasus-demo", ["First-person adventure", "Time travel"]],
  ["monkey-demo", ["Point-and-click", "Pirate comedy"]],
  ["ft-demo", ["Point-and-click", "Biker thriller"]],
  ["samnmax-demo", ["Point-and-click", "Road-trip comedy"]],
  ["dig-demo", ["Point-and-click", "Alien archaeology"]],
  ["sword1-demo", ["Point-and-click", "Templar conspiracy"]],
  ["sword2-demo", ["Point-and-click", "Ancient conspiracy"]],
  ["dw-demo", ["Point-and-click", "Fantasy comedy"]],
  ["gob1-demo", ["Point-and-click", "Fantasy puzzles"]],
  ["gob2-demo", ["Point-and-click", "Fantasy puzzles"]],
  ["gob3-demo", ["Point-and-click", "Surreal fantasy"]],
  ["gk1-demo", ["Point-and-click", "Supernatural mystery"]],
  ["freddypharkas-demo", ["Point-and-click", "Western comedy"]],
]);

export function getBundledLaunchTags(game) {
  if (!game?.path) return null;
  const tags = launchTagsByTarget.get(game.target);
  if (!tags) return null;

  const [playStyle, theme, platform] = tags;
  return [playStyle, theme, game.year, platform ?? getVersionMetadata(game).platform].filter(Boolean);
}
