// Reference game engine: the full Phase 1 and 2 rules as a plain state machine.
// The mock server runs it in the browser, the tests run it in Node, and the SQL functions
// in supabase/migrations/ implement the same rules inside Postgres. Keep all three in sync.
import {
  rollDamage, rollCoins, upgradeCost, nextBossHp, retreatHp, attemptLabel,
  rewardCoins, damagePerHitText, bossType, bossPerk, emptyPerks,
  UPGRADES, UPGRADE_KEYS, emptyUpgrades, costOf, randInt, CLASSES, CLASS_KEYS, CLASS_SWITCH_GEMS,
  FREE_SWITCH_DAYS, MONTHLY_SWITCH_DAYS, critChancePct, critMultPct, rollStrike, stochRound,
} from './combat.js';
import { enemyName, artPath } from './boss-names.js';
import { nameError } from './namefilter.js';
import { earnedBadges, displayBadge } from './badges.js';
import { NODE, techSum, techUnlocked, techCost } from './tech.js';

export const CONFIG = {
  attemptMs: 7 * 86400000,
  dailyAttacks: 5,
  starterBonusAttacks: 1, // first-run demo: one free attack on top of the daily five
  boss1Hp: 10n,
  minHp: 10n,
  tz: 'America/Los_Angeles',
  feedSize: 20,
  leaderboardSize: 50,
};

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: CONFIG.tz, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayKey = (ms) => dayFmt.format(new Date(ms));

const ADJ = ['Swift', 'Brave', 'Iron', 'Silent', 'Wild', 'Ember', 'Frost', 'Storm', 'Shadow', 'Golden', 'Rogue', 'Lucky'];
const NOUN = ['Wolf', 'Hawk', 'Fox', 'Bear', 'Raven', 'Tiger', 'Viper', 'Falcon', 'Lynx', 'Otter', 'Stag', 'Drake'];
export function autoName(rng) {
  // Re-roll until the name passes the same filter players face (digits can spell blocked words).
  for (let i = 0; i < 50; i++) {
    const a = ADJ[Math.floor(rng() * ADJ.length)];
    const n = NOUN[Math.floor(rng() * NOUN.length)];
    const name = `${a}${n}${1000 + Math.floor(rng() * 9000)}`;
    if (!nameError(name)) return name;
  }
  return 'Hero' + (1000 + Math.floor(rng() * 9000));
}

export function createWorld(now, config = CONFIG) {
  const w = {
    config,
    mainNumber: 1,
    depth: 0,
    mainHps: new Map([[1, config.boss1Hp]]),
    rungHp: new Map(), // lieutenant depth -> HP, for the current numbered boss
    attempts: [],
    active: null,
    players: new Map(),
    events: [],
    ledger: [],
    slayers: new Map(), // main boss number -> player id (first defeat only)
    perkGrants: [], // { playerId, mainNumber, key }
    seq: 0,
  };
  startAttempt(w, now);
  return w;
}

function startAttempt(w, now) {
  const kind = w.depth === 0 ? 'main' : 'lieutenant';
  const maxHp = w.depth === 0 ? w.mainHps.get(w.mainNumber) : w.rungHp.get(w.depth);
  const a = {
    id: ++w.seq,
    kind,
    mainNumber: w.mainNumber,
    depth: w.depth,
    label: attemptLabel(w.mainNumber, w.depth),
    maxHp,
    hp: maxHp,
    startedAt: now,
    endsAt: now + w.config.attemptMs,
    status: 'active',
    endedAt: null,
    damage: 0n,
    attacks: 0,
    contributions: new Map(),
    finalBlowBy: null,
  };
  w.attempts.push(a);
  w.active = a;
  return a;
}

function failActive(w, at) {
  const a = w.active;
  a.status = 'failed';
  a.endedAt = at;
  // Boss #1 has no lower rung, so it simply restarts.
  if (w.mainNumber === 1 && w.depth === 0) { startAttempt(w, at); return; }
  w.depth += 1;
  w.rungHp.set(w.depth, retreatHp(a.maxHp, a.damage, w.config.minHp));
  startAttempt(w, at);
}

export function resolveExpiry(w, now) {
  let guard = 0;
  while (now >= w.active.endsAt && guard++ < 200) failActive(w, w.active.endsAt);
}

function winActive(w, killer, now) {
  const a = w.active;
  a.status = 'defeated';
  a.endedAt = now;
  a.finalBlowBy = killer.id;
  let slayer = false;
  if (a.kind === 'main' && !w.slayers.has(a.mainNumber)) {
    w.slayers.set(a.mainNumber, killer.id);
    slayer = true;
  }
  if (a.kind === 'main') {
    // Every participant gets a permanent +1 of this boss type's perk, even if offline.
    const key = bossPerk(a.mainNumber);
    for (const [pid, c] of a.contributions) {
      if (c.damage < 1n) continue;
      const pl = w.players.get(pid);
      pl.perks[key] += 1;
      w.perkGrants.push({ playerId: pid, mainNumber: a.mainNumber, key });
    }
  }
  const coins = rewardCoins(a.kind, a.mainNumber);
  for (const [pid, c] of a.contributions) {
    if (c.damage >= 1n) w.ledger.push({ id: ++w.seq, playerId: pid, attemptId: a.id, label: a.label, coins, gems: a.kind === 'main' ? 2n : 1n, claimed: false });
  }
  if (w.depth > 0) {
    // Climb one rung. The rung above (or the numbered boss itself) is re-sized to at most what this
    // community just proved it can kill, scaled by kill speed. This is how a shrunken player base recovers.
    const up = w.depth - 1;
    const scaled = nextBossHp(a.maxHp, now - a.startedAt);
    if (up === 0) { if (scaled < w.mainHps.get(w.mainNumber)) w.mainHps.set(w.mainNumber, scaled); }
    else if (scaled < w.rungHp.get(up)) w.rungHp.set(up, scaled);
    w.rungHp.delete(w.depth);
    w.depth = up;
  } else {
    w.mainNumber += 1;
    w.rungHp.clear();
    if (!w.mainHps.has(w.mainNumber)) w.mainHps.set(w.mainNumber, nextBossHp(a.maxHp, now - a.startedAt));
  }
  startAttempt(w, now);
  return { slayer, next: w.active.label, perk: a.kind === 'main' ? bossPerk(a.mainNumber) : null };
}

// Test and tooling helper: jump straight to a rung with a fresh attempt. Not used by gameplay.
export function startRung(w, mainNumber, depth, mainHp, now) {
  w.mainNumber = mainNumber;
  w.depth = depth;
  w.mainHps.set(mainNumber, mainHp);
  w.rungHp.clear();
  w.active.status = 'abandoned';
  return startAttempt(w, now);
}

export function ensurePlayer(w, id, rng, name, now = 0) {
  let p = w.players.get(id);
  if (!p) {
    p = {
      id, pid: ++w.seq, createdAt: now, badge: null, name: name || autoName(rng), coins: 0n, gems: 0n, damageRank: 0,
      attackDay: null, attacksUsed: 0, totalDamage: 0n, totalAttacks: 0, highestHit: 0n,
      country: 'US', state: '', zip: '', idem: new Map(),
      perks: emptyPerks(), bonusAttacks: w.config.starterBonusAttacks, nameSet: !!name,
      up: emptyUpgrades(), cls: null, classFirstAt: null, classSwitchAt: null,
      abilityDay: null, abilityKind: null, abilityLeft: 0, crits: 0, gemsEarned: 0n,
      tech: {}, classGems: 0n,
    };
    w.players.set(id, p);
  }
  return p;
}

// Everything the tech tree adds, in one place. Class Type Damage counts only against the class's preferred type.
export function statsOf(w, p, attempt) {
  const t = p.tech || {};
  const type = bossType(attempt.depth === 0 ? attempt.mainNumber : attempt.mainNumber - 1);
  const typeBonus = p.cls && CLASSES[p.cls].prefers === type ? techSum(t, 'type') : 0;
  return {
    dmgPct: 100 + p.perks.damage + techSum(t, 'damage') + typeBonus + (attempt.kind === 'main' ? 2 * p.up.boss_damage + techSum(t, 'boss') : 0),
    critChance: critChancePct(p.up.crit_chance, p.perks.crit + techSum(t, 'crit')),
    critMult: critMultPct(p.up.crit_damage) + techSum(t, 'critdmg'),
    gemChance: Math.min(100, p.perks.gem + techSum(t, 'gem')),
    coinPct: p.perks.coins + 5 * p.up.coin_bonus + techSum(t, 'coins'),
    maxAttacks: w.config.dailyAttacks + techSum(t, 'attacks'),
    typeBonus,
  };
}

function rollover(w, p, now) {
  const k = dayKey(now);
  if (p.attackDay !== k) { p.attackDay = k; p.attacksUsed = 0; }
}

export function attack(w, id, now, rng, opts = {}) {
  resolveExpiry(w, now);
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (opts.key && p.idem.has(opts.key)) return p.idem.get(opts.key);
  rollover(w, p, now);
  const useBonus = !opts.skipLimit && p.bonusAttacks > 0;
  const st0 = statsOf(w, p, w.active);
  if (!opts.skipLimit && !useBonus && p.attacksUsed >= st0.maxAttacks) return { ok: false, error: 'no_attacks' };
  const a = w.active;
  // Daily class ability charges (Titan Strike, Rain of Arrows, Arcane Burst multiply; Shadow Strike forces a crit).
  let abilityPct = 100, forceCrit = false;
  if (p.abilityLeft > 0 && p.abilityKind) {
    const c = CLASSES[p.abilityKind];
    if (c.mult) abilityPct = c.mult;
    if (c.crit) forceCrit = true;
    p.abilityLeft -= 1;
    if (p.abilityLeft === 0) p.abilityKind = null;
  }
  const st = st0;
  const dmgPct = st.dmgPct;
  const chance = st.critChance;
  const mult = st.critMult;
  const crit = forceCrit || randInt(100, rng) < chance;
  let rolled = rollStrike(p.damageRank, dmgPct, crit ? mult : 100, abilityPct, rng);
  // Double Strike: a free follow-up hit with its own crit roll, no ability bonus, no extra gem roll.
  let double = false, crits = crit ? 1 : 0;
  if (randInt(100, rng) < 2 * p.up.double_strike) {
    double = true;
    const crit2 = randInt(100, rng) < chance;
    if (crit2) crits += 1;
    rolled += rollStrike(p.damageRank, dmgPct, crit2 ? mult : 100, 100, rng);
  }
  const dmg = rolled > a.hp ? a.hp : rolled;
  // Gems drop only on a critical hit, at the player's gem chance (gem perk now, tech tree later).
  const gem = crit && randInt(100, rng) < st.gemChance;
  if (gem) { p.gems += 1n; p.gemsEarned += 1n; }
  p.crits += crits;
  a.hp -= dmg;
  a.damage += dmg;
  a.attacks += 1;
  const c = a.contributions.get(id) || { damage: 0n, attacks: 0 };
  c.damage += dmg; c.attacks += 1;
  a.contributions.set(id, c);
  if (useBonus) p.bonusAttacks -= 1;
  else if (!opts.skipLimit) p.attacksUsed += 1;
  const coins = rollCoins(dmg, st.coinPct, rng); // 1 coin per credited damage, plus perks, Coin Bonus and tech
  p.coins += coins;
  p.totalDamage += dmg;
  p.totalAttacks += 1;
  if (dmg > p.highestHit) p.highestHit = dmg;
  const label = a.label;
  let kill = null;
  if (a.hp === 0n) kill = winActive(w, p, now);
  const res = {
    ok: true, damage: dmg.toString(), coins: coins.toString(), killed: !!kill,
    slayer: kill ? kill.slayer : false, attempt: label, next: kill ? kill.next : null,
    perk: kill ? kill.perk : null, crit, double, gem, ability: abilityPct !== 100 || forceCrit,
    attacksLeft: p.bonusAttacks + Math.max(0, st.maxAttacks - p.attacksUsed),
  };
  w.events.push({ id: ++w.seq, attemptId: a.id, playerId: id, name: p.name, damage: dmg, kill: !!kill, crit, at: now });
  if (w.events.length > 500) w.events.splice(0, w.events.length - 500);
  if (opts.key) {
    p.idem.set(opts.key, res);
    if (p.idem.size > 50) p.idem.delete(p.idem.keys().next().value);
  }
  return res;
}

// Public status helpers. pid is the public player number used by the feed, leaderboards and stat cards;
// the private account id is never sent to other players.
const bossesHelped = (w, id) => w.perkGrants.filter((g) => g.playerId === id).length;
const slayerKills = (w, id) => [...w.slayers.values()].filter((pid) => pid === id).length;
export const badgeOf = (w, p) => displayBadge(p.badge, bossesHelped(w, p.id), slayerKills(w, p.id));
function shareOf(w, attempt, id) {
  if (!attempt || attempt.damage <= 0n) return 0;
  const c = attempt.contributions.get(id);
  return c ? Number((c.damage * 10000n) / attempt.damage) / 10000 : 0;
}

export function setBadge(w, id, key) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (key === null || key === 'none') { p.badge = key; return { ok: true }; }
  if (!earnedBadges(bossesHelped(w, id), slayerKills(w, id)).includes(key)) return { ok: false, error: 'not_earned' };
  p.badge = key;
  return { ok: true };
}

// Read-only stat card for any player. Numbers only: no free text beyond the filtered name.
export function playerCard(w, pid) {
  const p = [...w.players.values()].find((x) => x.pid === pid);
  if (!p) return { ok: false, error: 'not_found' };
  const all = [...w.players.values()].filter((x) => x.totalDamage > 0n).sort((a, b) => (a.totalDamage === b.totalDamage ? 0 : a.totalDamage > b.totalDamage ? -1 : 1));
  const rank = all.findIndex((x) => x.id === p.id);
  return {
    ok: true, pid: p.pid, name: p.name, badge: badgeOf(w, p), share: shareOf(w, w.active, p.id),
    totalDamage: p.totalDamage.toString(), totalAttacks: p.totalAttacks, highestHit: p.highestHit.toString(),
    bossesHelped: bossesHelped(w, p.id), slayer: [...w.slayers].filter(([, pid]) => pid === p.id).map(([n]) => n),
    perks: { ...p.perks }, since: p.createdAt, worldRank: rank >= 0 ? rank + 1 : null,
  };
}

export function buyUpgrade(w, id, key) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (!UPGRADE_KEYS.includes(key)) return { ok: false, error: 'not_available' };
  const rank = key === 'base_damage' ? p.damageRank : p.up[key];
  const max = UPGRADES[key].max;
  if (max !== null && rank >= max) return { ok: false, error: 'maxed' };
  const cost = costOf(key, rank);
  if (p.coins < cost) return { ok: false, error: 'not_enough_coins' };
  p.coins -= cost;
  if (key === 'base_damage') p.damageRank += 1; else p.up[key] += 1;
  return { ok: true, key, rank: rank + 1, cost: cost.toString(), nextCost: costOf(key, rank + 1).toString() };
}

// Class rules: first pick is free. Switching is free for 7 days after the first pick, then once per
// 30 days for free, otherwise 100 gems. Switching never refills attacks or re-arms the daily ability.
export function classInfo(p, now) {
  const DAY = 86400000;
  const freeUntil = p.classFirstAt === null ? null : p.classFirstAt + FREE_SWITCH_DAYS * DAY;
  const monthlyAt = p.classSwitchAt === null ? 0 : p.classSwitchAt + MONTHLY_SWITCH_DAYS * DAY;
  const free = p.cls === null || now < freeUntil || now >= monthlyAt;
  return { freeUntil, nextFreeAt: free ? now : monthlyAt, freeNow: free };
}

export function setClass(w, id, cls, now) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (!CLASS_KEYS.includes(cls)) return { ok: false, error: 'bad_class' };
  if (p.cls === cls) return { ok: true, cls, paid: '0' };
  let paid = 0n;
  if (p.cls === null) p.classFirstAt = now;
  else {
    const DAY = 86400000;
    if (now < p.classFirstAt + FREE_SWITCH_DAYS * DAY) { /* free during the first week */ }
    else if (p.classSwitchAt === null || now >= p.classSwitchAt + MONTHLY_SWITCH_DAYS * DAY) p.classSwitchAt = now;
    else if (p.gems >= CLASS_SWITCH_GEMS) { p.gems -= CLASS_SWITCH_GEMS; paid = CLASS_SWITCH_GEMS; }
    else return { ok: false, error: 'switch_locked', nextFreeAt: p.classSwitchAt + MONTHLY_SWITCH_DAYS * DAY };
  }
  p.cls = cls;
  p.abilityKind = null; p.abilityLeft = 0; // leftover charges do not follow you to the new class
  // Spec: switching refunds 100% of gems actually spent on the old class tree and clears it.
  const refund = p.classGems;
  for (const nid of Object.keys(p.tech)) if (NODE[nid]?.cls) delete p.tech[nid];
  p.gems += refund; p.classGems = 0n;
  if (refund > 0n) return { ok: true, cls, paid: paid.toString(), refund: refund.toString() };
  return { ok: true, cls, paid: paid.toString() };
}

export function buyTech(w, id, nodeId) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  const n = NODE[nodeId];
  if (!n) return { ok: false, error: 'bad_node' };
  if (n.cls && !p.cls) return { ok: false, error: 'no_class' };
  const rank = p.tech[nodeId] || 0;
  if (rank >= n.ranks) return { ok: false, error: 'maxed' };
  if (!techUnlocked(p.tech, nodeId)) return { ok: false, error: 'locked' };
  const cost = techCost(nodeId);
  if (p.gems < cost) return { ok: false, error: 'not_enough_gems' };
  p.gems -= cost;
  p.tech[nodeId] = rank + 1;
  if (n.cls) p.classGems += cost;
  return { ok: true, node: nodeId, rank: rank + 1, cost: cost.toString() };
}

export function useAbility(w, id, now) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (!p.cls) return { ok: false, error: 'no_class' };
  const k = dayKey(now);
  if (p.abilityDay === k) return { ok: false, error: 'used_today' };
  p.abilityDay = k;
  const c = CLASSES[p.cls];
  if (c.extra) p.bonusAttacks += c.extra;
  else { p.abilityKind = p.cls; p.abilityLeft = c.charges; }
  return { ok: true, cls: p.cls, ability: c.ability };
}

export function claimRewards(w, id) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  let total = 0n, gems = 0n, n = 0;
  for (const r of w.ledger) {
    if (r.playerId === id && !r.claimed) { r.claimed = true; total += r.coins; gems += r.gems || 0n; n += 1; }
  }
  p.coins += total;
  p.gems += gems;
  return { ok: true, claimed: n, coins: total.toString(), gems: gems.toString() };
}

const clean = (s, max) => String(s || '').trim().slice(0, max);

export function setProfile(w, id, { name, country, state, zip } = {}) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (name !== undefined) {
    const n = String(name ?? '').trim();
    const err = nameError(n);
    if (err) return { ok: false, error: err };
    p.name = n;
    p.nameSet = true;
  }
  if (country !== undefined) {
    const c = clean(country, 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return { ok: false, error: 'bad_country' };
    p.country = c;
  }
  if (state !== undefined) {
    const s = clean(state, 3).toUpperCase();
    if (s && !/^[A-Z]{2,3}$/.test(s)) return { ok: false, error: 'bad_state' };
    p.state = s;
  }
  if (zip !== undefined) {
    const z = clean(zip, 10);
    if (z && !/^\d{5}$/.test(z)) return { ok: false, error: 'bad_zip' };
    p.zip = z;
  }
  return { ok: true };
}

// scope: world | country | state | local (same 3-digit ZIP prefix). period: current | all.
export function leaderboard(w, id, scope, period) {
  const me = w.players.get(id);
  let rows = [];
  if (period === 'current') {
    for (const [pid, c] of w.active.contributions) rows.push({ p: w.players.get(pid), damage: c.damage });
  } else {
    for (const p of w.players.values()) if (p.totalDamage > 0n) rows.push({ p, damage: p.totalDamage });
  }
  rows = rows.filter(({ p }) => {
    if (scope === 'world' || !me) return true;
    if (scope === 'country') return p.country === me.country;
    if (scope === 'state') return p.country === me.country && p.state && p.state === me.state;
    if (scope === 'local') return me.zip && p.zip && p.zip.slice(0, 3) === me.zip.slice(0, 3);
    return true;
  });
  rows.sort((x, y) => (x.damage === y.damage ? 0 : x.damage > y.damage ? -1 : 1));
  const ranked = rows.map((r, i) => ({
    rank: i + 1, id: r.p.id, pid: r.p.pid, name: r.p.name, damage: r.damage.toString(), me: r.p.id === id,
    badge: badgeOf(w, r.p), share: period === 'current' ? shareOf(w, w.active, r.p.id) : null,
  }));
  const mine = ranked.find((r) => r.me) || null;
  return { scope, period, total: ranked.length, top: ranked.slice(0, w.config.leaderboardSize), me: mine };
}

export function publicState(w, id, now) {
  resolveExpiry(w, now);
  const a = w.active;
  const p = w.players.get(id);
  if (p) rollover(w, p, now);
  const pending = p ? w.ledger.filter((r) => r.playerId === id && !r.claimed) : [];
  return {
    boss: {
      attemptId: a.id, kind: a.kind, mainNumber: a.mainNumber, depth: a.depth, label: a.label,
      name: enemyName(a.mainNumber, a.depth), art: artPath(a.mainNumber, a.depth),
      type: bossType(a.depth === 0 ? a.mainNumber : a.mainNumber - 1),
      perk: a.depth === 0 ? bossPerk(a.mainNumber) : null,
      hp: a.hp.toString(), maxHp: a.maxHp.toString(), startedAt: a.startedAt, endsAt: a.endsAt,
      attacks: a.attacks, contributors: a.contributions.size, now,
    },
    player: p ? {
      id: p.id, name: p.name, coins: p.coins.toString(), gems: p.gems.toString(), damageRank: p.damageRank,
      damagePerHit: damagePerHitText(p.damageRank, p.perks.damage), nextCost: upgradeCost(p.damageRank).toString(),
      attacksLeft: p.bonusAttacks + Math.max(0, statsOf(w, p, a).maxAttacks - p.attacksUsed), attacksMax: statsOf(w, p, a).maxAttacks,
      bonusAttacks: p.bonusAttacks, nameSet: p.nameSet, perks: { ...p.perks },
      perkCount: w.perkGrants.filter((g) => g.playerId === id).length,
      pid: p.pid, badgeChoice: p.badge, badge: badgeOf(w, p),
      badgesEarned: earnedBadges(bossesHelped(w, id), slayerKills(w, id)),
      share: shareOf(w, a, id),
      totalDamage: p.totalDamage.toString(), totalAttacks: p.totalAttacks, highestHit: p.highestHit.toString(),
      country: p.country, state: p.state, zip: p.zip,
      pendingRewards: { count: pending.length, coins: pending.reduce((s, r) => s + r.coins, 0n).toString(), gems: pending.reduce((s, r) => s + (r.gems || 0n), 0n).toString() },
      slayer: [...w.slayers].filter(([, pid]) => pid === id).map(([n]) => n),
      upgrades: Object.fromEntries(UPGRADE_KEYS.map((key) => {
        const rank = key === 'base_damage' ? p.damageRank : p.up[key];
        const max = UPGRADES[key].max;
        return [key, { rank, max, cost: max !== null && rank >= max ? null : costOf(key, rank).toString() }];
      })),
      critChance: statsOf(w, p, a).critChance, critMult: statsOf(w, p, a).critMult,
      coinBonus: statsOf(w, p, a).coinPct, gemChance: statsOf(w, p, a).gemChance, doubleStrike: 2 * p.up.double_strike,
      tech: { ...p.tech }, classGems: p.classGems.toString(), typeBonus: statsOf(w, p, a).typeBonus, dmgPct: statsOf(w, p, a).dmgPct,
      bossDamage: 2 * p.up.boss_damage, crits: p.crits, gemsEarned: p.gemsEarned.toString(),
      cls: p.cls, classFreeUntil: classInfo(p, now).freeUntil, classNextFreeAt: classInfo(p, now).nextFreeAt,
      classSwitchFree: classInfo(p, now).freeNow,
      abilityReady: !!p.cls && p.abilityDay !== dayKey(now), abilityKind: p.abilityKind, abilityLeft: p.abilityLeft,
    } : null,
    feed: w.events.slice(-w.config.feedSize).reverse().map((e) => {
      const fp = w.players.get(e.playerId);
      const att = w.attempts.find((x) => x.id === e.attemptId);
      return {
        pid: fp ? fp.pid : null, name: e.name, damage: e.damage.toString(), kill: e.kill, crit: !!e.crit, at: e.at, cls: fp ? fp.cls : null,
        badge: fp ? badgeOf(w, fp) : null, share: shareOf(w, att, e.playerId),
      };
    }),
    history: w.attempts.filter((x) => x.status !== 'active').slice(-20).reverse().map((x) => ({
      label: x.label, status: x.status, maxHp: x.maxHp.toString(), damage: x.damage.toString(),
      contributors: x.contributions.size, attacks: x.attacks, endedAt: x.endedAt,
      finalBlow: x.finalBlowBy ? w.players.get(x.finalBlowBy)?.name : null,
    })),
    highestDefeated: Math.max(0, ...[...w.slayers.keys()]),
  };
}
