// Gem tech tree, v1 slice of the spec's 500-node design: 31 universal + 5 class nodes, 5 ranks each.
// One source of truth: the UI draws it, the engine applies it, and scripts/gen-tech-sql.mjs seeds the SQL table.
// A node unlocks only when every prerequisite node is complete (all ranks). Viewing never unlocks anything.
export const TIER_COST = [0, 1, 2, 4, 8, 16]; // gems per rank, by tier
export const EFFECTS = {
  damage:  { label: '% damage', per: 2 },
  boss:    { label: '% damage vs World Bosses', per: 2 },
  crit:    { label: '% crit chance', per: 2 },
  critdmg: { label: '% crit damage', per: 10 },
  gem:     { label: '% gem chance on crit', per: 2 },
  attacks: { label: 'daily attack', per: 1 },
  coins:   { label: '% coins', per: 5 },
  type:    { label: '% damage vs your class type', per: 2 },
};
const N = (id, name, branch, tier, effect, x, y, req = [], cls = false) => ({ id, name, branch, tier, effect, x, y, req, cls, ranks: 5 });
export const NODES = [
  N('dmg1', 'Damage I', 'damage', 1, 'damage', 0, 0),
  N('crit1', 'Critical I', 'crit', 1, 'crit', -2, 1, ['dmg1']),
  N('gem1', 'Gem Chance I', 'gem', 1, 'gem', 2, 1, ['dmg1']),
  N('atk1', 'Extra Attacks I', 'attacks', 1, 'attacks', 0, 1, ['dmg1']),
  N('dmg2', 'Damage II', 'damage', 2, 'damage', 0, 2, ['atk1']),
  N('crit2', 'Critical II', 'crit', 2, 'crit', -2.6, 2, ['crit1']),
  N('cdmg1', 'Crit Damage I', 'crit', 2, 'critdmg', -1.4, 2, ['crit1']),
  N('gem2', 'Gem Chance II', 'gem', 2, 'gem', 2.6, 2, ['gem1']),
  N('coin1', 'Coin Bonus I', 'coins', 2, 'coins', 1.4, 2, ['gem1']),
  N('atk2', 'Extra Attacks II', 'attacks', 2, 'attacks', 0, 3, ['dmg2']),
  N('dmg3', 'Damage III', 'damage', 3, 'damage', -0.8, 4, ['atk2']),
  N('boss1', 'Boss Damage I', 'damage', 3, 'boss', 0.8, 4, ['atk2']),
  N('crit3', 'Critical III', 'crit', 3, 'crit', -2.6, 3, ['crit2']),
  N('cdmg2', 'Crit Damage II', 'crit', 3, 'critdmg', -1.6, 3.4, ['cdmg1']),
  N('gem3', 'Gem Chance III', 'gem', 3, 'gem', 2.6, 3, ['gem2']),
  N('coin2', 'Coin Bonus II', 'coins', 3, 'coins', 1.6, 3.4, ['coin1']),
  N('atk3', 'Extra Attacks III', 'attacks', 3, 'attacks', 0, 5, ['dmg3', 'boss1']),
  N('crit4', 'Critical IV', 'crit', 4, 'crit', -2.6, 4.4, ['crit3']),
  N('cdmg3', 'Crit Damage III', 'crit', 4, 'critdmg', -1.8, 5, ['cdmg2']),
  N('gem4', 'Gem Chance IV', 'gem', 4, 'gem', 2.6, 4.4, ['gem3']),
  N('coin3', 'Coin Bonus III', 'coins', 4, 'coins', 1.8, 5, ['coin2']),
  N('dmg4', 'Damage IV', 'damage', 4, 'damage', -0.8, 6, ['atk3']),
  N('boss2', 'Boss Damage II', 'damage', 4, 'boss', 0.8, 6, ['atk3']),
  N('atk4', 'Extra Attacks IV', 'attacks', 4, 'attacks', 0, 7, ['dmg4', 'boss2']),
  N('crit5', 'Critical V', 'crit', 5, 'crit', -2.6, 5.8, ['crit4']),
  N('gem5', 'Gem Chance V', 'gem', 5, 'gem', 2.6, 5.8, ['gem4']),
  N('dmg5', 'Damage V', 'damage', 5, 'damage', -0.8, 8, ['atk4']),
  N('boss3', 'Boss Damage III', 'damage', 5, 'boss', 0.8, 8, ['atk4']),
  N('atk5', 'Extra Attacks V', 'attacks', 5, 'attacks', 0, 9, ['dmg5', 'boss3']),
  N('cdmg4', 'Crit Damage IV', 'crit', 5, 'critdmg', -2.2, 7, ['cdmg3', 'crit5']),
  N('coin4', 'Coin Bonus IV', 'coins', 5, 'coins', 2.2, 7, ['coin3', 'gem5']),
  // class mastery: Type Damage I-V for the equipped class (+2% per rank vs its preferred boss type, 25 ranks = +50%)
  N('cls1', 'Type Damage I', 'class', 1, 'type', -4.4, 1, ['dmg1'], true),
  N('cls2', 'Type Damage II', 'class', 2, 'type', -4.4, 2.2, ['cls1'], true),
  N('cls3', 'Type Damage III', 'class', 3, 'type', -4.4, 3.4, ['cls2'], true),
  N('cls4', 'Type Damage IV', 'class', 4, 'type', -4.4, 4.6, ['cls3'], true),
  N('cls5', 'Type Damage V', 'class', 5, 'type', -4.4, 5.8, ['cls4'], true),
];
export const NODE = Object.fromEntries(NODES.map((n) => [n.id, n]));
export const techCost = (id) => BigInt(TIER_COST[NODE[id].tier]);

// Sum of one effect across the player's ranks (tech is { nodeId: rank }).
export function techSum(tech, effect) {
  let s = 0;
  for (const n of NODES) if (n.effect === effect) s += (tech[n.id] || 0) * EFFECTS[effect].per;
  return s;
}
export function techUnlocked(tech, id) {
  return NODE[id].req.every((r) => (tech[r] || 0) >= NODE[r].ranks);
}
// Max possible: crit 25 ranks x 2 = 50, attacks 25 ranks = +25, gem 25 ranks x 2 = 50 (spec v1.2).
