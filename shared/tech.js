// Gem tech tree, v2 (2026-11-10): an 81-node spiderweb, 5 ranks each. Every v1 node id is kept, so nothing a player owns is lost.
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
// The tree is a spiderweb. The core sits in the middle; six builds run outward as spokes (Damage, Critical,
// Attacks, Gems, Utility, Class), each a chain you climb one node at a time. Between every pair of neighbouring
// spokes hang web nodes that need BOTH neighbours at that ring, and the outer rim closes the web.
// Capped stats keep their caps: Critical I-V (+50%), Gem Chance I-V (+50%), Extra Attacks I-V and Onslaught I-V (+50), Type Damage I-V (+50%).
const SPOKE = { damage: 0, crit: 60, attacks: 120, gem: 180, coins: 240, class: 300 }; // degrees, clockwise from the top
const RING = 1.55;                                                                       // map units between rings
const at = (deg, ring) => {
  const a = (deg * Math.PI) / 180;
  return [Math.round(Math.sin(a) * ring * RING * 100) / 100, Math.round(-Math.cos(a) * ring * RING * 100) / 100];
};
const RAW = [];
const N = (id, name, branch, tier, effect, deg, ring, req = [], cls = false) => {
  const [x, y] = at(deg, ring);
  RAW.push({ id, name, branch, tier, effect, x, y, req, cls, ranks: 5 });
};
const R = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
const SIDE = 16; // a side strand runs this many degrees off its spoke, half a ring out from the spoke nodes

N('dmg1', 'Core Power', 'damage', 1, 'damage', 0, 0);

// Damage build: raw damage up the spoke, Boss Damage on the strand beside it.
N('pow1', 'Power I', 'damage', 1, 'damage', SPOKE.damage, 1, ['dmg1']);
for (let k = 2; k <= 5; k++) N(`dmg${k}`, `Damage ${R[k]}`, 'damage', k, 'damage', SPOKE.damage, k, [k === 2 ? 'pow1' : `dmg${k - 1}`]);
N('dmg6', 'Damage VI', 'damage', 5, 'damage', SPOKE.damage, 6, ['dmg5']);
N('boss1', 'Boss Damage I', 'damage', 3, 'boss', SPOKE.damage + SIDE, 2.5, ['dmg2']);
N('boss2', 'Boss Damage II', 'damage', 4, 'boss', SPOKE.damage + SIDE, 3.5, ['boss1']);
N('boss3', 'Boss Damage III', 'damage', 5, 'boss', SPOKE.damage + SIDE, 4.5, ['boss2']);
N('boss4', 'Boss Damage IV', 'damage', 5, 'boss', SPOKE.damage + SIDE, 5.5, ['boss3']);

// Critical build: crit chance up the spoke, Crit Damage on the strand.
for (let k = 1; k <= 5; k++) N(`crit${k}`, `Critical ${R[k]}`, 'crit', k, 'crit', SPOKE.crit, k, [k === 1 ? 'dmg1' : `crit${k - 1}`]);
for (let k = 1; k <= 4; k++) N(`cdmg${k}`, `Crit Damage ${R[k]}`, 'crit', k + 1, 'critdmg', SPOKE.crit + SIDE, k + 0.5, [k === 1 ? 'crit1' : `cdmg${k - 1}`]);
N('cdmg5', 'Crit Damage V', 'crit', 5, 'critdmg', SPOKE.crit + SIDE, 5.5, ['cdmg4']);

// Attacks build: more daily attacks up the spoke and on the Onslaught strand (50 ranks, +1 attack each), Fury (damage) on the other strand.
for (let k = 1; k <= 5; k++) N(`atk${k}`, `Extra Attacks ${R[k]}`, 'attacks', k, 'attacks', SPOKE.attacks, k, [k === 1 ? 'dmg1' : `atk${k - 1}`]);
for (let k = 1; k <= 5; k++) N(`ons${k}`, `Onslaught ${R[k]}`, 'attacks', Math.min(5, k + 1), 'attacks', SPOKE.attacks - SIDE, k + 0.5, [k === 1 ? 'atk1' : `ons${k - 1}`]);
for (let k = 1; k <= 4; k++) N(`fury${k}`, `Fury ${R[k]}`, 'attacks', k + 1, 'damage', SPOKE.attacks + SIDE, k + 0.5, [k === 1 ? 'atk1' : `fury${k - 1}`]);

// Gem build: gem drop chance on crits.
for (let k = 1; k <= 5; k++) N(`gem${k}`, `Gem Chance ${R[k]}`, 'gem', k, 'gem', SPOKE.gem, k, [k === 1 ? 'dmg1' : `gem${k - 1}`]);

// Utility build: coins.
N('coin0', 'Fortune', 'coins', 1, 'coins', SPOKE.coins, 1, ['dmg1']);
for (let k = 1; k <= 4; k++) N(`coin${k}`, `Coin Bonus ${R[k]}`, 'coins', k + 1, 'coins', SPOKE.coins, k + 1, [`coin${k - 1}`]);
N('coin5', 'Coin Bonus V', 'coins', 5, 'coins', SPOKE.coins, 6, ['coin4']);

// Class build: Type Damage for the equipped class (+2% per rank vs its preferred boss type). Refunded on a class switch.
for (let k = 1; k <= 5; k++) N(`cls${k}`, `Type Damage ${R[k]}`, 'class', k, 'type', SPOKE.class, k, [k === 1 ? 'dmg1' : `cls${k - 1}`], true);

// The web. main(build, ring) is the spoke node at that ring.
const main = (b, k) => ({ damage: k === 1 ? 'pow1' : `dmg${k}`, crit: `crit${k}`, attacks: `atk${k}`, gem: `gem${k}`, coins: `coin${k - 1}`, class: `cls${k}` })[b];
const WEB = [
  ['damage', 'crit', 'brutal', 'Brutal Strikes', 'crit', 'critdmg'],
  ['crit', 'attacks', 'flurry', 'Flurry', 'attacks', 'damage'],
  ['attacks', 'gem', 'scav', 'Scavenger', 'gem', 'coins'],
  ['gem', 'coins', 'hunt', 'Treasure Hunter', 'coins', 'coins'],
  ['coins', 'class', 'bounty', 'Bounty Hunter', 'damage', 'boss'],
  ['class', 'damage', 'slayer', 'Giant Slayer', 'damage', 'boss'],
];
for (const [a, b, id, name, branch, effect] of WEB) {
  const mid = SPOKE[a] + 30;
  for (let k = 2; k <= 5; k++) N(`${id}${k - 1}`, `${name} ${R[k - 1]}`, branch, k, effect, mid, k, [main(a, k), main(b, k)]);
  N(`${id}5`, `${name} Apex`, branch, 5, effect, mid, 6, [main(a, 5), main(b, 5)]); // outer rim
}
const MIN_Y = Math.min(...RAW.map((n) => n.y));
export const NODES = RAW.map((n) => ({ ...n, y: Math.round((n.y - MIN_Y) * 100) / 100 }));
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
