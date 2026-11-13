// Dev backend: runs the reference engine in the browser with fake players so the game can be played
// and tuned without a server. Add ?dev=1 for time-travel tools (window.wbDev).
import {
  createWorld, ensurePlayer, attack, buyUpgrade, claimRewards, setProfile, leaderboard, publicState, resolveExpiry,
  setBadge, playerCard, setClass, useAbility, buyTech, adReward, claimDaily, claimGift, stateSpawn, gearInfo, gearEquip, gearUnequip, gearMerge, gearRecycle, gearCrate, gearReroll,
} from '../shared/engine.js';
import { dropItem } from '../shared/gear.js';
import { serialize, deserialize } from '../shared/serialize.js';

const KEY = 'wb-mock-v4'; // v4: tech tree, participation gems (old saves are dropped)
const ME = 'me';
const BOTS = [
  ['Frostfang', 'US', 'WA'], ['EmberWolf', 'US', 'WA'], ['NightOwl', 'US', 'WA'], ['Rook', 'US', 'OR'],
  ['Valkyrie', 'US', 'CA'], ['Thorn', 'US', 'TX'], ['Skald', 'CA', ''], ['Mirage', 'GB', ''],
  ['IronWill', 'US', 'WA'], ['Tidecaller', 'AU', ''], ['Hex', 'US', 'NY'], ['Bramble', 'DE', ''],
];

function load() {
  try {
    const t = localStorage.getItem(KEY);
    if (!t) return null;
    const s = deserialize(t);
    s.active = s.attempts.find((a) => a.id === s.activeId);
    delete s.activeId;
    return s.active ? s : null;
  } catch { return null; }
}

export function createMock() {
  let offset = 0; // dev clock offset in ms
  const now = () => Date.now() + offset;
  let w = load() || createWorld(now());
  ensurePlayer(w, ME, Math.random, undefined, now());
  BOTS.forEach(([name, country, state], i) => {
    const b = ensurePlayer(w, `bot-${i}`, Math.random, name, now() - (i + 1) * 86400000 * 9);
    if (!b.seeded) { b.seeded = true; b.country = country; b.state = state; b.damageRank = (i * 3) % 13; b.cls = ['warrior', 'barbarian', 'rogue', 'archer', 'mage'][i % 5]; b.up.crit_chance = i % 9; }
  });

  const save = () => {
    try {
      if (w.attempts.length > 200) w.attempts.splice(0, w.attempts.length - 200);
      localStorage.setItem(KEY, serialize({ ...w, active: undefined, activeId: w.active.id }));
    } catch { /* storage full or blocked */ }
  };

  // Fake community: one random bot swings every couple of seconds.
  setInterval(() => {
    if (Math.random() < 0.35) attack(w, `bot-${Math.floor(Math.random() * BOTS.length)}`, now(), Math.random, { skipLimit: true });
    // Bots in a region with a State Boss chip at it too.
    if (Math.random() < 0.2) attack(w, `bot-${Math.floor(Math.random() * BOTS.length)}`, now(), Math.random, { skipLimit: true, target: 'state' });
  }, 2000);
  setInterval(save, 4000);
  addEventListener('beforeunload', save);

  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.wbDev = {
      world: w,
      skipDays(d) { offset += d * 86400000; resolveExpiry(w, now()); },
      coins(n) { w.players.get(ME).coins += BigInt(n); },
      rank(n) { w.players.get(ME).damageRank = n; },
      gems(n) { w.players.get(ME).gems += BigInt(n); },
      gear(n = 10, luck = 1) { for (let i = 0; i < n; i++) dropItem(w.players.get(ME), Math.random, luck); },
      scrap(n) { const p = w.players.get(ME); gearInfo(w, ME); p.scrap += n; },
      refill() { w.players.get(ME).attacksUsed = 0; },
      summon(n = 1) { w.players.get(ME).summons = (w.players.get(ME).summons || 0) + n; },
      botSummon(i = 3) { const b = w.players.get(`bot-${i}`); b.summons = 1; return stateSpawn(w, b.id, now()); },
      reset() { localStorage.removeItem(KEY); location.reload(); },
    };
  }

  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 40));
  return {
    mode: 'mock',
    state: () => delay(JSON.parse(JSON.stringify(publicState(w, ME, now()), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))),
    attack: (target) => delay(attack(w, ME, now(), Math.random, { target })),
    stateSpawn: () => delay(stateSpawn(w, ME, now())),
    buy: (k) => delay(buyUpgrade(w, ME, k)),
    claim: () => delay(claimRewards(w, ME)),
    gear: () => delay(JSON.parse(JSON.stringify(gearInfo(w, ME)))),
    gearEquip: (id, on) => delay(on === false ? gearUnequip(w, ME, id) : gearEquip(w, ME, id)),
    gearMerge: (keep, feed) => delay(JSON.parse(JSON.stringify(gearMerge(w, ME, keep, feed)))),
    gearRecycle: (ids) => delay(gearRecycle(w, ME, ids)),
    gearCrate: (tier) => delay(JSON.parse(JSON.stringify(gearCrate(w, ME, tier)))),
    gearReroll: (id, what) => delay(JSON.parse(JSON.stringify(gearReroll(w, ME, id, what)))),
    setProfile: (p) => delay(setProfile(w, ME, p, now())),
    setBadge: (b) => delay(setBadge(w, ME, b)),
    setClass: (c) => delay(setClass(w, ME, c, now())),
    useAbility: () => delay(useAbility(w, ME, now())),
    buyTech: (n) => delay(buyTech(w, ME, n)),
    dailyClaim: () => delay(JSON.parse(JSON.stringify(claimDaily(w, ME, now())))),
    giftClaim: (code) => delay(claimGift(w, ME, code, now())),
    adReward: (k) => delay(JSON.parse(JSON.stringify(adReward(w, ME, k, now()), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))),
    deleteMe: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } return delay({ ok: true }); },
    card: (pid) => delay(JSON.parse(JSON.stringify(playerCard(w, pid), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))),
    leaderboard: (scope, period) => {
      resolveExpiry(w, now());
      const r = leaderboard(w, ME, scope, period);
      r.top.forEach((x) => delete x.id);
      if (r.me) delete r.me.id;
      return delay(r);
    },
  };
}
