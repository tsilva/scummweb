const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// Sort-only aliases for installments whose published titles omit their number
// or put the series name elsewhere. Display titles and route slugs stay intact.
const sortTitles = new Map([
  ["Space Quest: The Sarien Encounter", "Space Quest 1: The Sarien Encounter"],
  ["King's Quest: Quest for the Crown", "King's Quest 1: Quest for the Crown"],
  ["Police Quest: In Pursuit of the Death Angel", "Police Quest 1: In Pursuit of the Death Angel"],
  ["Leisure Suit Larry in the Land of the Lounge Lizards", "Leisure Suit Larry 1: In the Land of the Lounge Lizards"],
  ["Broken Sword: The Shadow of the Templars", "Broken Sword 1: The Shadow of the Templars"],
  ["EcoQuest: The Search for Cetus", "EcoQuest 1: The Search for Cetus"],
  ["Elvira: Mistress of the Dark", "Elvira 1: Mistress of the Dark"],
  ["Gabriel Knight: Sins of the Fathers", "Gabriel Knight 1: Sins of the Fathers"],
  ["The Beast Within: A Gabriel Knight Mystery", "Gabriel Knight 2: The Beast Within"],
  ["Hugo's House of Horrors", "Hugo 1: House of Horrors"],
  ["The Secret of Monkey Island", "Monkey Island 1: The Secret of Monkey Island"],
  ["The Curse of Monkey Island", "Monkey Island 3: The Curse of Monkey Island"],
  ["The Legend of Kyrandia", "The Legend of Kyrandia 1"],
  ["The Legend of Kyrandia: Hand of Fate", "The Legend of Kyrandia 2: Hand of Fate"],
  ["The Legend of Kyrandia: Book 3 - Malcolm's Revenge", "The Legend of Kyrandia 3: Malcolm's Revenge"],
  ["Gobliiins", "Goblins 1"],
  ["Gobliins 2: The Prince Buffoon", "Goblins 2: The Prince Buffoon"],
  ["Goblins Quest 3", "Goblins 3"],
  ["Riven: The Sequel to Myst", "Myst 2: Riven"],
]);

const romanValues = { I: 1, V: 5, X: 10 };

export function titleSortKey(title) {
  const text = String(title || "");
  const baseTitle = text.replace(/\s+\(Demo\)$/, "");
  const alias = sortTitles.get(baseTitle);
  const key = alias ? alias + text.slice(baseTitle.length) : text;
  // Recognize canonical chapter numerals I–XXXIX at the end of a title or
  // before a subtitle/edition. Do not reinterpret words or the pronoun "I".
  return key.replace(/\s+(X{0,3}(?:IX|IV|V?I{0,3}))(?=$|:|\.\d|\s+[-–—(])/g, (match, roman) => {
    if (!roman) return match;
    const value = [...roman].reduce((total, digit, index) => {
      const current = romanValues[digit];
      return total + (current < (romanValues[roman[index + 1]] || 0) ? -current : current);
    }, 0);
    return ` ${value}`;
  });
}

export function compareGameTitles(left, right) {
  return collator.compare(titleSortKey(left), titleSortKey(right));
}
