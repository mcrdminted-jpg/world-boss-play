// Display names for numbered bosses 1 to 100, from the primary boss sheet.
// Past 100 the name cycles with a tier suffix. Art cycles the same way.
// Ordered so each name fits its boss type (Construct, Beast, Humanoid, Flying, Magical rotate in that order,
// see bossType in combat.js). Bosses 1 to 5 match the five type images until each boss gets its own art.
export const BOSS_NAMES = [
  'Stone Golem', 'Dire Wolf Alpha', 'Obsidian Knight', 'The Storm Dragon', 'Crystal Warden', 'Lava Brute', 'Cave Troll', 'Frost Giant', 'Thunder Roc', 'Storm Elemental',
  'Crystal Guardian', 'Swamp Leviathan', 'Bone Overlord', 'Frost Phoenix', 'Forest Ent', 'Ironclad Sentinel', 'Venom Queen', 'Shadow Assassin', 'Obsidian Dragon', 'Ancient Treant',
  'Ice Colossus', 'The Devourer', 'Plague Lord', 'Wind Emperor', 'Vine Horror', 'Dune Behemoth', 'Magma Serpent', 'Crypt King', 'The Blazing Phoenix', 'Void Lord',
  'Sky Titan', 'Glacier Wurm', 'Death Revenant', 'The Stone Dragon', 'The Arcane Titan', 'Arcane Construct', 'Coral Kraken', 'Ash Tyrant', 'The Celestial Dragon', 'The Eclipse Lord',
  'Sun Guardian', 'Mire Fiend', 'The Drowned King', 'The Void Phoenix', 'The Chaos Bringer', 'Earth Titan', 'Blight Serpent', 'The Rotten King', 'The Nether Dragon', 'The Fire Overlord',
  'Celestial Sentinel', 'Nightmare Hound', 'The Sand Emperor', 'The Sky Empress', 'The Leviathan Queen', 'Sand Colossus', 'Storm Kraken', 'Inferno Lord', 'The Radiant Seraph', 'The Coral Monarch',
  'Void Colossus', 'Rotten Leviathan', 'The Shadow King', 'The Celestial Wyrm', 'The Deep One', 'The Frost Titan', 'Shadow Serpent', 'The Plague Mother', 'Fire Djinn', 'The Shadow Titan',
  'Infernal Colossus', 'The Blood Behemoth', 'The Tempest King', 'Sand Wraith', 'The Abyss Lord', 'The Iron Warden', 'The Toxic Hydra', 'The Tomb Lord', 'Tempest Leviathan', 'The World Eater',
  'The Crystal Titan', 'The Abyssal Kraken', 'The Ice King', 'Storm Leviathan', 'The Elemental King', 'The Solar Colossus', 'The Moon Serpent', 'The Soul Reaper', 'The Thunder Lord', 'The Chaos Titan',
  'The Time Guardian', 'The Dune Wyrm', 'The Magma King', 'The Star Eater', 'The Void Monarch', 'The Eternal Colossus', 'The Earth Devourer', 'The Infernal Warden', 'Void Stalker', 'Tidal Horror',
];

export function artIndex(n) {
  return ((Math.max(n, 1) - 1) % 100) + 1;
}

export function bossName(n) {
  const base = BOSS_NAMES[artIndex(n) - 1];
  const tier = Math.floor((Math.max(n, 1) - 1) / 100);
  return tier === 0 ? base : `${base} ${tier + 1}`;
}

const pad = (n) => String(n).padStart(3, '0');

// Art file for an active enemy. Lieutenants use the defeated boss's art, variant A/B/C (deeper rungs reuse C).
export function artPath(mainNumber, depth) {
  if (depth === 0) return `assets/bosses/${pad(artIndex(mainNumber))}.webp`;
  const variant = 'ABC'[Math.min(depth, 3) - 1];
  return `assets/lieutenants/${pad(artIndex(mainNumber - 1))}-${variant}.webp`;
}

export function enemyName(mainNumber, depth) {
  return depth === 0 ? bossName(mainNumber) : `${bossName(mainNumber - 1)} (Lieutenant)`;
}
