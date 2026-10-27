// Display names for numbered bosses 1 to 100, from the primary boss sheet.
// Past 100 the name cycles with a tier suffix. Art cycles the same way.
export const BOSS_NAMES = [
  'Stone Golem', 'Cave Troll', 'Forest Ent', 'Sand Wraith', 'Dire Wolf Alpha', 'Swamp Leviathan', 'Frost Giant', 'Lava Brute', 'Storm Elemental', 'Bone Overlord',
  'Crystal Guardian', 'Venom Queen', 'Ironclad Sentinel', 'The Devourer', 'Ancient Treant', 'Shadow Assassin', 'Magma Serpent', 'Ice Colossus', 'Thunder Roc', 'Plague Lord',
  'Dune Behemoth', 'Coral Kraken', 'Sky Titan', 'Obsidian Knight', 'Vine Horror', 'Arcane Construct', 'Fire Djinn', 'Glacier Wurm', 'Tempest Leviathan', 'Crypt King',
  'Mire Fiend', 'Sun Guardian', 'Void Stalker', 'Earth Titan', 'Blight Serpent', 'Celestial Sentinel', 'Inferno Lord', 'Tidal Horror', 'Wind Emperor', 'Death Revenant',
  'Ash Tyrant', 'Frost Phoenix', 'Rotten Leviathan', 'Sand Colossus', 'Nightmare Hound', 'Storm Kraken', 'Obsidian Dragon', 'Crystal Warden', 'Void Colossus', 'The Drowned King',
  'Shadow Serpent', 'The Frost Titan', 'Infernal Colossus', 'Void Lord', 'Storm Leviathan', 'The Blazing Phoenix', 'The Rotten King', 'The Sand Emperor', 'The Stone Dragon', 'The Arcane Titan',
  'The Abyssal Kraken', 'The Eclipse Lord', 'The Iron Warden', 'The Plague Mother', 'The Celestial Dragon', 'The Blood Behemoth', 'The Tempest King', 'The Crystal Titan', 'The Shadow King', 'The Earth Devourer',
  'The Solar Colossus', 'The Moon Serpent', 'The Toxic Hydra', 'The Void Phoenix', 'The Chaos Bringer', 'The Ice King', 'The Fire Overlord', 'The Star Eater', 'The Leviathan Queen', 'The Tomb Lord',
  'The Nether Dragon', 'The Thunder Lord', 'The Coral Monarch', 'The Dune Wyrm', 'The Soul Reaper', 'The Magma King', 'The Sky Empress', 'The Deep One', 'The Infernal Warden', 'The Storm Dragon',
  'The Shadow Titan', 'The Radiant Seraph', 'The Abyss Lord', 'The World Eater', 'The Time Guardian', 'The Elemental King', 'The Chaos Titan', 'The Celestial Wyrm', 'The Void Monarch', 'The Eternal Colossus',
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
