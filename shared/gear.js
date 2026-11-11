// Gear (design: GEAR-DESIGN.md). One source of truth for the rules; supabase/migrations/0012_gear.sql mirrors it.
// Every item has a slot, a tier and bonus lines. Line sizes are stored in hundredths of a point (integers), summed by type.
// A point turns into a % through WEIGHT, which lives in the server config so it can be tuned without a new build.
import { randInt } from './combat.js';

export const SLOTS = ['weapon', 'helm', 'chest', 'gloves', 'boots', 'ring'];
export const SLOT_NAME = { weapon: 'Weapon', helm: 'Helm', chest: 'Chest', gloves: 'Gloves', boots: 'Boots', ring: 'Ring' };
// odds are in hundredths of a percent; min/max are hundredths of a point per line
export const TIERS = [null,
  { name: 'Common', color: '#aab3c8', odds: 5000, lines: 1, min: 1, max: 100, scrap: 2, crate: 10 },
  { name: 'Uncommon', color: '#5fe07a', odds: 2800, lines: 1, min: 100, max: 300, scrap: 3, crate: 15 },
  { name: 'Rare', color: '#5aa9ff', odds: 1400, lines: 2, min: 200, max: 600, scrap: 4, crate: 20 },
  { name: 'Epic', color: '#c48bff', odds: 500, lines: 3, min: 600, max: 1500, scrap: 6, crate: 30 },
  { name: 'Legendary', color: '#ff9d3c', odds: 200, lines: 4, min: 2000, max: 4400, scrap: 8, crate: 40 },
  { name: 'Mythic', color: '#ff4d5e', odds: 100, lines: 5, min: 6000, max: 14000, scrap: 12, crate: 0 },
];
export const BONUS_KEYS = ['gold', 'critdmg', 'dmg', 'boss', 'crit', 'gem'];
export const BONUS_NAME = { gold: 'Gold', critdmg: 'Crit Damage', dmg: 'Damage', boss: 'Boss Damage', crit: 'Crit Chance', gem: 'Gem Chance' };
// % per point. Full Legendary in one type (about 768 points): +768% gold, +768% crit damage, +384% damage.
export const WEIGHT = { gold: 1, critdmg: 1, dmg: 0.5, boss: 0.5, crit: 0.1, gem: 0.05 };
export const SETS = {
  titan: { name: "Titan's Wrath", key: 'dmg', steps: [5, 10, 15], text: 'damage' },
  shadow: { name: 'Shadowfang', key: 'critdmg', steps: [25, 50, 75], text: 'crit damage' },
  tempest: { name: 'Tempest', key: 'attacks', steps: [1, 2, 3], text: 'daily attacks' },
  prospector: { name: 'Prospector', key: 'gold', steps: [15, 30, 50], text: 'gold' },
  giantsbane: { name: 'Giantsbane', key: 'boss', steps: [5, 10, 15], text: 'boss damage' },
};
export const SET_KEYS = Object.keys(SETS);
export const CLASS_KEYS = ['warrior', 'barbarian', 'rogue', 'archer', 'mage'];
export const INV_CAP = 80, MERGE_MAX_TIER = 5, PITY_AT = 10, SET_CHANCE = 30, CRATE_UP = 5;

// Tier roll. luck multiplies Rare-and-above odds (1, 1.25 or 1.5 by damage share); lieutenants halve Epic-and-above.
// Mythic never passes 1.5%. Whatever is left over lands on Common.
export function rollTier(rng, luck = 1, lieutenant = false, pity = 0) {
  const w = TIERS.map((t, i) => (i === 0 ? 0 : t.odds));
  for (let t = 3; t <= 6; t++) w[t] = Math.floor(w[t] * luck * (lieutenant && t >= 4 ? 0.5 : 1));
  w[6] = Math.min(w[6], 150);
  const r = randInt(10000, rng);
  let acc = 0, tier = 1;
  for (let t = 6; t >= 2; t--) { acc += w[t]; if (r < acc) { tier = t; break; } }
  if (tier < 3 && pity >= PITY_AT) tier = 3;
  return tier;
}

export function rollItem(rng, tier) {
  const T = TIERS[tier], stats = {};
  for (let i = 0; i < T.lines; i++) {
    const k = BONUS_KEYS[randInt(BONUS_KEYS.length, rng)];
    stats[k] = (stats[k] || 0) + T.min + randInt(T.max - T.min + 1, rng);
  }
  return {
    slot: SLOTS[randInt(SLOTS.length, rng)], tier, stats,
    set: tier >= 3 && randInt(100, rng) < SET_CHANCE ? SET_KEYS[randInt(SET_KEYS.length, rng)] : null,
    cls: tier === 6 ? CLASS_KEYS[randInt(CLASS_KEYS.length, rng)] : null, // only Mythic is class gear
    equipped: false,
  };
}

const gearOf = (p) => { if (!p.items) { p.items = []; p.scrap = 0; p.pity = 0; p.itemSeq = 0; } return p; };
const find = (p, id) => gearOf(p).items.find((x) => x.id === Number(id));

// Adds an item, or turns it straight into scrap when the bag is full.
export function grantItem(p, item) {
  gearOf(p);
  if (p.items.length >= INV_CAP) { p.scrap += TIERS[item.tier].scrap; return { ...item, id: 0, scrapped: true }; }
  const it = { ...item, id: ++p.itemSeq };
  p.items.push(it);
  return it;
}
export function dropItem(p, rng, luck = 1, lieutenant = false) {
  gearOf(p);
  const tier = rollTier(rng, luck, lieutenant, p.pity);
  p.pity = tier >= 3 ? 0 : p.pity + 1;
  return grantItem(p, rollItem(rng, tier));
}

// Everything the equipped gear gives, in %, plus set bonuses (highest step only) and the Mythic class match.
export function gearBonus(p, weight = WEIGHT) {
  const out = { gold: 0, critdmg: 0, dmg: 0, boss: 0, crit: 0, gem: 0, attacks: 0, mythic: false, sets: {} };
  for (const it of (p.items || [])) {
    if (!it.equipped) continue;
    for (const [k, v] of Object.entries(it.stats)) out[k] += (v / 100) * weight[k];
    if (it.set) out.sets[it.set] = (out.sets[it.set] || 0) + 1;
    if (it.tier === 6 && it.cls && it.cls === p.cls) out.mythic = true;
  }
  for (const [id, n] of Object.entries(out.sets)) {
    const step = n >= 6 ? 2 : n >= 4 ? 1 : n >= 2 ? 0 : -1;
    if (step >= 0) out[SETS[id].key] += SETS[id].steps[step];
  }
  for (const k of BONUS_KEYS) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}

export function equipItem(p, id) {
  const it = find(p, id);
  if (!it) return { ok: false, error: 'no_item' };
  for (const o of p.items) if (o.slot === it.slot) o.equipped = false;
  it.equipped = true;
  return { ok: true };
}
export function unequipItem(p, id) {
  const it = find(p, id);
  if (!it) return { ok: false, error: 'no_item' };
  it.equipped = false;
  return { ok: true };
}
// 4 into 1: the kept item goes up a tier and takes the TOTAL of all four items' bonuses. Stops at Legendary.
export function mergeItems(p, keepId, feedIds) {
  const keep = find(p, keepId), ids = [...new Set((feedIds || []).map(Number))];
  if (!keep) return { ok: false, error: 'no_item' };
  if (ids.length !== 3 || ids.includes(keep.id)) return { ok: false, error: 'need_three' };
  if (keep.tier >= MERGE_MAX_TIER) return { ok: false, error: 'max_tier' };
  const feed = ids.map((i) => find(p, i));
  if (feed.some((f) => !f)) return { ok: false, error: 'no_item' };
  if (feed.some((f) => f.tier !== keep.tier)) return { ok: false, error: 'tier_mismatch' };
  if (feed.some((f) => f.equipped)) return { ok: false, error: 'equipped' };
  for (const f of feed) for (const [k, v] of Object.entries(f.stats)) keep.stats[k] = (keep.stats[k] || 0) + v;
  keep.tier += 1;
  p.items = p.items.filter((x) => !ids.includes(x.id));
  return { ok: true, item: keep };
}
export function recycleItems(p, itemIds) {
  gearOf(p);
  const ids = [...new Set((itemIds || []).map(Number))], its = ids.map((i) => find(p, i));
  if (!ids.length || its.some((x) => !x)) return { ok: false, error: 'no_item' };
  if (its.some((x) => x.equipped)) return { ok: false, error: 'equipped' };
  const scrap = its.reduce((s, x) => s + TIERS[x.tier].scrap, 0);
  p.items = p.items.filter((x) => !ids.includes(x.id));
  p.scrap += scrap;
  return { ok: true, scrap, total: p.scrap };
}
// A crate is one new item of that tier, with a small chance of one tier higher (never Mythic).
export function buyCrate(p, tier, rng) {
  gearOf(p);
  const T = TIERS[tier];
  if (!T || tier < 1 || tier > 5) return { ok: false, error: 'bad_tier' };
  if (p.scrap < T.crate) return { ok: false, error: 'not_enough_scrap' };
  if (p.items.length >= INV_CAP) return { ok: false, error: 'bag_full' };
  p.scrap -= T.crate;
  const up = tier < 5 && randInt(100, rng) < CRATE_UP ? 1 : 0;
  return { ok: true, item: grantItem(p, rollItem(rng, tier + up)), scrap: p.scrap };
}
export function gearState(p, weight = WEIGHT) {
  gearOf(p);
  return { ok: true, items: p.items.map((x) => ({ ...x, stats: { ...x.stats } })), scrap: p.scrap, cap: INV_CAP, bonus: gearBonus(p, weight), weight: { ...weight } };
}
export const equippedOf = (p) => (p.items || []).filter((x) => x.equipped).map((x) => ({ slot: x.slot, tier: x.tier, set: x.set, cls: x.cls, stats: { ...x.stats } }));
