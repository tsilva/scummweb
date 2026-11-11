// Calibrated in the default 960 × 720 viewport. Other viewport sizes keep the
// full viewport for these games so their coordinates are still fixed.
const fixedGameCrops = new Map([
  ['elvira-ii-the-jaws-of-cerberus', { x: 154, y: 115, width: 651, height: 490 }],
  ['flight-of-the-amazon-queen', { x: 154, y: 115, width: 651, height: 490 }],
]);

export function fixedGameCrop(game, viewport) {
  const crop = fixedGameCrops.get(game);
  if (!crop) return undefined;
  if (viewport.width === 960 && viewport.height === 720) return { ...crop };
  return { x: 0, y: 0, ...viewport };
}
