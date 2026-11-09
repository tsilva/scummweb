// Beneath a Steel Sky opens the slideshow. The other ranked full games
// follow descending MobyGames player-rating counts as a popularity snapshot.
const fullGameOrder = [
  "sky:sky:full",
  "lure:lure:full",
  "queen:queen:full",
  "dreamweb:dreamweb:full",
  "adl:hires1:full",
  "sword25:sword25:full",
  "parallaction:nippon:full",
  "drascula:drascula:full",
  "cge:soltys:full",
  "cge2:sfinx:full",
  "draci:draci:full",
];

const zorkOrder = ["glk:zork1:full", "glk:zork2:full", "glk:zork3:full"];

function slideRank({ key, game }) {
  if (key.endsWith(":demo") || /\(Demo\)$/i.test(game.displayTitle)) {
    return fullGameOrder.length + 1 + zorkOrder.length;
  }
  const zorkIndex = zorkOrder.indexOf(key);
  if (zorkIndex >= 0) return fullGameOrder.length + 1 + zorkIndex;

  const fullGameIndex = fullGameOrder.indexOf(key);
  return fullGameIndex >= 0 ? fullGameIndex : fullGameOrder.length;
}

export function orderHeroGroups(groups) {
  return [...groups].sort((left, right) => slideRank(left) - slideRank(right));
}
