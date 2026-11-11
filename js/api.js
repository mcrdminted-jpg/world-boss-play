// One interface, two backends: the Supabase project (real, shared) or an in-browser mock (dev).
// Every method resolves to plain JSON with BigInt values as strings.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { damagePerHitText, upgradeCost } from '../shared/combat.js';
import { enemyName, artPath } from '../shared/boss-names.js';

export function normalize(s) {
  const b = s.boss;
  b.name = b.name || enemyName(b.mainNumber, b.depth);
  b.art = b.art || artPath(b.mainNumber, b.depth);
  if (s.player) {
    s.player.perks = s.player.perks || { damage: 0, coins: 0, crit: 0, lucky: 0, gem: 0 };
    s.player.damagePerHit = s.player.damagePerHit || damagePerHitText(s.player.damageRank, s.player.perks.damage);
    s.player.nextCost = s.player.nextCost || upgradeCost(s.player.damageRank).toString();
  }
  // Skew between this device and the server clock, so countdowns are right.
  s.skew = b.now - Date.now();
  return s;
}

export async function createApi() {
  const forceMock = new URLSearchParams(location.search).get('mock') === '1';
  let raw;
  if (SUPABASE_URL && SUPABASE_KEY && !forceMock) {
    raw = (await import('./supabase-api.js')).createSupabaseApi(SUPABASE_URL, SUPABASE_KEY);
  } else {
    raw = (await import('./mock-server.js')).createMock();
  }
  return {
    mode: raw.mode,
    state: async () => normalize(await raw.state()),
    attack: () => raw.attack(),
    buy: (key) => raw.buy(key),
    claim: () => raw.claim(),
    setProfile: (p) => raw.setProfile(p),
    leaderboard: (scope, period) => raw.leaderboard(scope, period),
    setBadge: (b) => raw.setBadge(b),
    card: (pid) => raw.card(pid),
    setClass: (c) => raw.setClass(c),
    useAbility: () => raw.useAbility(),
    buyTech: (n) => raw.buyTech(n),
    adReward: (k) => raw.adReward(k),
    gear: () => raw.gear(),
    gearEquip: (id, on = true) => raw.gearEquip(id, on),
    gearMerge: (keep, feed) => raw.gearMerge(keep, feed),
    gearRecycle: (ids) => raw.gearRecycle(ids),
    gearCrate: (tier) => raw.gearCrate(tier),
    iapVerify: (t) => (raw.iapVerify ? raw.iapVerify(t) : Promise.resolve({ ok: false, error: 'not_supported' })),
    userId: () => (raw.userId ? raw.userId() : Promise.resolve(null)),
    deleteMe: () => raw.deleteMe(),
  };
}
