// Dev backend: runs the reference engine in the browser with fake players so the game can be played
// and tuned without a server. Add ?dev=1 for time-travel tools (window.wbDev).
import {
  createWorld, ensurePlayer, attack, buyUpgrade, claimRewards, setProfile, leaderboard, publicState, resolveExpiry,
  setBadge, playerCard,
} from '../shared/engine.js';
import { serialize, deserialize } from '../shared/serialize.js';

const KEY = 'wb-mock-v2'; // v2: perks, starter attack, name flag (old saves are dropped)
const ME = 'me';
const BOTS = [
  ['Frostfang', 'US', 'WA', '98391'], ['EmberWolf', 'US', 'WA', '98388'], ['NightOwl', 'US', 'WA', '98001'], ['Rook', 'US', 'OR', '97201'],
  ['Valkyrie', 'US', 'CA', '94105'], ['Thorn', 'US', 'TX', '73301'], ['Skald', 'CA', 'ON', ''], ['Mirage', 'GB', '', ''],
  ['IronWill', 'US', 'WA', '98390'], ['Tidecaller', 'AU', '', ''], ['Hex', 'US', 'NY', '10001'], ['Bramble', 'DE', '', ''],
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
  BOTS.forEach(([name, country, state, zip], i) => {
    const b = ensurePlayer(w, `bot-${i}`, Math.random, name, now() - (i + 1) * 86400000 * 9);
    if (!b.zip && !b.state) { b.country = country; b.state = state; b.zip = zip; b.damageRank = (i * 3) % 13; }
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
  }, 2000);
  setInterval(save, 4000);
  addEventListener('beforeunload', save);

  if (new URLSearchParams(location.search).get('dev') === '1') {
    window.wbDev = {
      world: w,
      skipDays(d) { offset += d * 86400000; resolveExpiry(w, now()); },
      coins(n) { w.players.get(ME).coins += BigInt(n); },
      rank(n) { w.players.get(ME).damageRank = n; },
      refill() { w.players.get(ME).attacksUsed = 0; },
      reset() { localStorage.removeItem(KEY); location.reload(); },
    };
  }

  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 40));
  return {
    mode: 'mock',
    state: () => delay(JSON.parse(JSON.stringify(publicState(w, ME, now()), (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))),
    attack: () => delay(attack(w, ME, now(), Math.random)),
    buy: (k) => delay(buyUpgrade(w, ME, k)),
    claim: () => delay(claimRewards(w, ME)),
    setProfile: (p) => delay(setProfile(w, ME, p)),
    setBadge: (b) => delay(setBadge(w, ME, b)),
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
