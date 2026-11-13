// Reference game engine: the full Phase 1 and 2 rules as a plain state machine.
// The mock server runs it in the browser, the tests run it in Node, and the SQL functions
// in supabase/migrations/ implement the same rules inside Postgres. Keep all three in sync.
import {
  rollDamage, rollCoins, upgradeCost, nextBossHp, retreatHp, attemptLabel,
  rewardCoins, rankGems, damagePerHitText, bossType, bossPerk, emptyPerks,
  UPGRADES, UPGRADE_KEYS, emptyUpgrades, costOf, randInt, CLASSES, CLASS_KEYS, CLASS_SWITCH_GEMS,
  FREE_SWITCH_DAYS, MONTHLY_SWITCH_DAYS, critChancePct, critMultPct, rollStrike, stochRound,
} from './combat.js';
import { enemyName, artPath } from './boss-names.js';
import { nameError } from './namefilter.js';
import { earnedBadges, displayBadge } from './badges.js';
import { NODE, techSum, techUnlocked, techCost } from './tech.js';

import { gearBonus, dropItem, gearState, equipItem, unequipItem, mergeItems, recycleItems, buyCrate, equippedOf, rollItem, grantItem, rerollItem } from './gear.js';
import { DAILY, DAILY_LEN } from './daily.js';
import { GIFTS, giftFor } from './holidays.js';
import { regionOf } from './regions.js';
export { GIFTS };
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

// State Boss: a rare summon drops from World Boss rewards. The holder spawns a cheap boss that only their region
// (US state, or country outside the US) can attack, using the same daily attacks. Mirrors 0023_state_boss.sql.
// Gems on a kill (Andy, 2026-11-12): the summoner gets 20, everyone else who hit it gets 1. No ranking.
export const STATE_BOSS = { summonPpm: 100, hpPct: 10, ms: 3 * 86400000, moveDays: 7, summonerGems: 20, helperGems: 1 };
const regionOfP = (p) => regionOf(p.country, p.state);
const stateMap = (w) => (w.stateBosses || (w.stateBosses = new Map()));
export function resolveStateExpiry(w, now) {
  for (const [r, a] of stateMap(w)) if (now >= a.endsAt) { a.status = 'failed'; a.endedAt = a.endsAt; w.stateBosses.delete(r); }
}
export const stateBossOf = (w, p, now) => { resolveStateExpiry(w, now); const r = p && regionOfP(p); return r ? stateMap(w).get(r) || null : null; };
export function stateSpawn(w, id, now) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  resolveExpiry(w, now); resolveStateExpiry(w, now);
  const region = regionOfP(p);
  if (!region) return { ok: false, error: 'no_region' };
  if (!(p.summons > 0)) return { ok: false, error: 'no_summon' };
  if (stateMap(w).has(region)) return { ok: false, error: 'already_active' };
  let hp = (w.mainHps.get(w.mainNumber) * BigInt(STATE_BOSS.hpPct)) / 100n;
  if (hp < w.config.minHp) hp = w.config.minHp;
  const a = {
    id: ++w.seq, kind: 'state', region, summoner: id, mainNumber: w.mainNumber, depth: 0, label: `State Boss ${region}`,
    maxHp: hp, hp, startedAt: now, endsAt: now + STATE_BOSS.ms, status: 'active', endedAt: null, damage: 0n, attacks: 0,
    contributions: new Map(), finalBlowBy: null,
  };
  w.stateBosses.set(region, a);
  p.summons -= 1;
  return { ok: true, region, attemptId: a.id };
}
function winState(w, a, killer, now) {
  a.status = 'defeated'; a.endedAt = now; a.finalBlowBy = killer.id;
  const coins = rewardCoins('state', a.mainNumber);
  const paid = [...a.contributions].filter(([, c]) => c.damage >= 1n).map(([pid]) => pid);
  // The summoner is paid even if they never hit it.
  if (!paid.includes(a.summoner) && w.players.has(a.summoner)) paid.push(a.summoner);
  for (const pid of paid) {
    const gems = BigInt(pid === a.summoner ? STATE_BOSS.summonerGems : STATE_BOSS.helperGems);
    w.ledger.push({ id: ++w.seq, playerId: pid, attemptId: a.id, label: a.label, coins, gems, claimed: false, luck: 1, lieutenant: true });
  }
  w.stateBosses.delete(a.region);
  return { slayer: false, next: null, perk: null };
}

// Rewarded ads (Store spots). Mirrors wb_ad_reward in supabase/migrations/0007_ad_rewards.sql.
export const AD_REWARDS = { attack: { max: 10 }, damage: { max: 10 }, gems: { max: 5, each: 1 } };

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
  // Gear luck by damage share: top 10% of contributors x1.5 on Rare-and-above, top half x1.25, everyone else x1.
  const ranked = [...a.contributions].filter(([, c]) => c.damage >= 1n).sort((x, y) => (x[1].damage === y[1].damage ? 0 : x[1].damage > y[1].damage ? -1 : 1));
  ranked.forEach(([pid, c], i) => {
    const luck = i * 10 < ranked.length ? 1.5 : i * 2 < ranked.length ? 1.25 : 1;
    const place = 1 + ranked.filter(([, o]) => o.damage > c.damage).length; // ties share the better place
    const gems = BigInt(rankGems(a.kind, place, ranked.length));
    w.ledger.push({ id: ++w.seq, playerId: pid, attemptId: a.id, label: a.label, coins, gems, place, claimed: false, luck, lieutenant: a.kind !== 'main' });
  });
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
      country: 'US', state: '', regionAt: null, summons: 0, idem: new Map(),
      perks: emptyPerks(), bonusAttacks: w.config.starterBonusAttacks, nameSet: !!name,
      up: emptyUpgrades(), cls: null, classFirstAt: null, classSwitchAt: null,
      abilityDay: null, abilityKind: null, abilityLeft: 0, crits: 0, gemsEarned: 0n,
      tech: {}, classGems: 0n, adDay: null, ads: { attack: 0, damage: 0, gems: 0 }, boostLeft: 0,
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
  // Gear adds on top, and can carry fractions of a percent (damage, crit chance, gem chance and gold keep 2 decimals).
  const g = gearBonus(p);
  const r2 = (x) => Math.round(x * 100) / 100;
  return {
    dmgPct: r2(100 + p.perks.damage + techSum(t, 'damage') + typeBonus + g.dmg + (attempt.kind === 'main' ? 2 * p.up.boss_damage + techSum(t, 'boss') + g.boss : 0)),
    critChance: r2(Math.min(100, critChancePct(p.up.crit_chance, p.perks.crit + techSum(t, 'crit')) + g.crit)),
    critMult: critMultPct(p.up.crit_damage) + techSum(t, 'critdmg') + Math.floor(g.critdmg),
    gemChance: r2(Math.min(100, p.perks.gem + techSum(t, 'gem') + g.gem)),
    coinPct: r2(p.perks.coins + 5 * p.up.coin_bonus + techSum(t, 'coins') + g.gold),
    maxAttacks: w.config.dailyAttacks + techSum(t, 'attacks') + g.attacks,
    typeBonus, mythic: g.mythic,
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
  const st0 = statsOf(w, p, opts.target === 'state' ? (stateBossOf(w, p, now) || w.active) : w.active);
  if (!opts.skipLimit && !useBonus && p.attacksUsed >= st0.maxAttacks) return { ok: false, error: 'no_attacks' };
  const toState = opts.target === 'state';
  const a = toState ? stateBossOf(w, p, now) : w.active;
  if (!a) return { ok: false, error: 'no_state_boss' };
  // Daily class ability charges (Titan Strike, Rain of Arrows, Arcane Burst multiply; Shadow Strike forces a crit).
  let abilityPct = 100, forceCrit = false;
  if (p.abilityLeft > 0 && p.abilityKind) {
    const c = CLASSES[p.abilityKind];
    if (c.mult) abilityPct = c.mult;
    if (c.crit) forceCrit = true;
    p.abilityLeft -= 1;
    if (p.abilityLeft === 0) p.abilityKind = null;
  }
  // Rewarded-ad 2x Damage charge doubles this attack (both strikes of a Double Strike).
  const boost = (p.boostLeft || 0) > 0;
  if (boost) p.boostLeft -= 1;
  const boostPct = boost ? 2 : 1;
  const st = st0;
  const dmgPct = st.dmgPct;
  const chance = st.critChance;
  const mult = st.critMult;
  const natural = randInt(10000, rng) < Math.round(chance * 100); // would this hit have crit on its own?
  const crit = forceCrit || natural;
  // Rogue Shadow Strike: always a crit, worth at least double an average hit (same as Archer's 2x), capped at 3x a
  // normal hit for crit-damage-only builds. Mirrors wb_attack in 0011_class_balance.sql.
  if (forceCrit) abilityPct = Math.round((100 * Math.max(Math.min(mult, 300), 2 * (100 + (chance * (mult - 100)) / 100))) / mult);
  // Mythic gear on its own class sharpens the ability: Warrior 6x becomes 7x, Mage 3.5x becomes 4x.
  if (st.mythic && abilityPct === 600) abilityPct = 700; else if (st.mythic && abilityPct === 350) abilityPct = 400;
  const strike = (critPct, abPct) => { const r = BigInt(p.damageRank); const d = stochRound(5n ** r * BigInt(Math.round(dmgPct * 100)) * BigInt(critPct) * BigInt(abPct), 4n ** r * 100000000n, rng); return d < 1n ? 1n : d; };
  let rolled = strike(crit ? mult : 100, abilityPct * boostPct);
  // Double Strike: a free follow-up hit. The class ability carries to it, so every class scales with it the same way.
  let double = false, crits = crit ? 1 : 0;
  if (randInt(100, rng) < 2 * p.up.double_strike) {
    double = true;
    const crit2 = forceCrit || randInt(10000, rng) < Math.round(chance * 100);
    if (crit2) crits += 1;
    rolled += strike(crit2 ? mult : 100, abilityPct * boostPct);
  }
  const dmg = rolled > a.hp ? a.hp : rolled;
  // Gems drop only on a critical hit, at the player's gem chance (gem perk now, tech tree later).
  const gem = natural && randInt(10000, rng) < Math.round(st.gemChance * 100); // natural crits only: a forced crit is not a gem roll
  // Double Gem (tech): a gem drop has a chance to be 2 gems.
  const gems = gem ? (randInt(100, rng) < techSum(p.tech || {}, 'gem2') ? 2 : 1) : 0;
  if (gem) { p.gems += BigInt(gems); p.gemsEarned += BigInt(gems); }
  p.crits += crits;
  a.hp -= dmg;
  a.damage += dmg;
  a.attacks += 1;
  const c = a.contributions.get(id) || { damage: 0n, attacks: 0 };
  c.damage += dmg; c.attacks += 1;
  a.contributions.set(id, c);
  if (useBonus) p.bonusAttacks -= 1;
  else if (!opts.skipLimit) p.attacksUsed += 1;
  const coins = stochRound(dmg * BigInt(Math.round((100 + st.coinPct) * 100)), 10000n, rng); // 1 coin per credited damage, plus perks, Coin Bonus and tech
  p.coins += coins;
  p.totalDamage += dmg;
  p.totalAttacks += 1;
  if (dmg > p.highestHit) p.highestHit = dmg;
  const label = a.label;
  let kill = null;
  if (a.hp === 0n) kill = toState ? winState(w, a, p, now) : winActive(w, p, now);
  const res = {
    ok: true, damage: dmg.toString(), coins: coins.toString(), killed: !!kill,
    slayer: kill ? kill.slayer : false, attempt: label, next: kill ? kill.next : null,
    perk: kill ? kill.perk : null, crit, double, gem, gems, ability: abilityPct !== 100 || forceCrit, boost, target: toState ? 'state' : 'world',
    attacksLeft: p.bonusAttacks + Math.max(0, st.maxAttacks - p.attacksUsed),
  };
  w.events.push({ id: ++w.seq, attemptId: a.id, playerId: id, name: p.name, damage: dmg, kill: !!kill, crit, at: now, state: toState });
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
    perks: { ...p.perks }, since: p.createdAt, worldRank: rank >= 0 ? rank + 1 : null, gear: equippedOf(p),
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
  const cost = techCost(nodeId, rank + 1);
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
  // Mythic gear on its own class: Barbarian +1 attack, Rogue and Archer +1 charge (Warrior and Mage get a bigger multiplier in attack()).
  const myth = gearBonus(p).mythic ? 1 : 0;
  if (c.extra) p.bonusAttacks += c.extra + myth;
  else { p.abilityKind = p.cls; p.abilityLeft = c.charges + (myth && (p.cls === 'rogue' || p.cls === 'archer') ? 1 : 0); }
  return { ok: true, cls: p.cls, ability: c.ability };
}

// Gifts: a fixed window (a holiday) when players in the matching countries can claim a one-time gift. The table is shared/holidays.js.
export function giftInfo(p, now) {
  if (!p) return null;
  const g = GIFTS.find((x) => now >= x.starts && now < x.ends && giftFor(x, p.country) && !(p.gifts || []).includes(x.code));
  return g ? { code: g.code, title: g.title, gems: g.gems, attacks: g.attacks, ends: g.ends } : null;
}
export function claimGift(w, id, code, now) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  const g = GIFTS.find((x) => x.code === code);
  if (!g || now < g.starts || now >= g.ends || !giftFor(g, p.country)) return { ok: false, error: 'no_gift' };
  p.gifts = p.gifts || [];
  if (p.gifts.includes(code)) return { ok: false, error: 'already_claimed' };
  p.gifts.push(code); p.gems += BigInt(g.gems); p.gemsEarned += BigInt(g.gems); p.bonusAttacks += g.attacks;
  return { ok: true, code, gems: g.gems, attacks: g.attacks };
}

// Daily reward: one claim per calendar day, day N of a 30-day cycle = your Nth claim. No streak to lose.
export function dailyInfo(p, now) {
  const count = (p && p.dailyCount) || 0;
  return { day: (count % DAILY_LEN) + 1, claimed: count, ready: !p || p.dailyDay !== dayKey(now) };
}
export function claimDaily(w, id, now, rng = Math.random) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  const info = dailyInfo(p, now);
  if (!info.ready) return { ok: false, error: 'already_claimed', daily: info };
  const r = DAILY[info.day - 1];
  let item = null;
  if (r.kind === 'attacks') p.bonusAttacks += r.n;
  else if (r.kind === 'boost') p.boostLeft = (p.boostLeft || 0) + r.n;
  else if (r.kind === 'scrap') { gearState(p); p.scrap = (p.scrap || 0) + r.n; }
  else if (r.kind === 'gems') { p.gems += BigInt(r.n); p.gemsEarned += BigInt(r.n); }
  else item = grantItem(p, rollItem(rng, r.n));
  p.dailyDay = dayKey(now); p.dailyCount = (p.dailyCount || 0) + 1;
  return { ok: true, day: r.day, kind: r.kind, n: r.n, item, daily: dailyInfo(p, now) };
}

export function adsInfo(p, now) {
  const fresh = !p || p.adDay !== dayKey(now);
  const used = (k) => (fresh ? 0 : p.ads[k]);
  return {
    attack: { max: AD_REWARDS.attack.max, left: Math.max(0, AD_REWARDS.attack.max - used('attack')) },
    damage: { max: AD_REWARDS.damage.max, left: Math.max(0, AD_REWARDS.damage.max - used('damage')) },
    gems: { max: AD_REWARDS.gems.max, left: Math.max(0, AD_REWARDS.gems.max - used('gems')), each: AD_REWARDS.gems.each },
  };
}

export function adReward(w, id, kind, now) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  if (!AD_REWARDS[kind]) return { ok: false, error: 'bad_kind' };
  const k = dayKey(now);
  if (p.adDay !== k) { p.adDay = k; p.ads = { attack: 0, damage: 0, gems: 0 }; }
  if (p.ads[kind] >= AD_REWARDS[kind].max) return { ok: false, error: 'ad_limit', ads: adsInfo(p, now) };
  p.ads[kind] += 1;
  if (kind === 'attack') p.bonusAttacks += 1;
  else if (kind === 'damage') p.boostLeft = (p.boostLeft || 0) + 1;
  else { const g = BigInt(AD_REWARDS.gems.each); p.gems += g; p.gemsEarned += g; }
  return { ok: true, kind, ads: adsInfo(p, now) };
}

export function claimRewards(w, id, rng = Math.random) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  let total = 0n, gems = 0n, n = 0, summons = 0;
  const drops = []; // one piece of gear for every boss or lieutenant you helped kill
  for (const r of w.ledger) {
    if (r.playerId === id && !r.claimed) {
      r.claimed = true; total += r.coins; gems += r.gems || 0n; n += 1;
      drops.push(dropItem(p, rng, r.luck || 1, !!r.lieutenant));
      // A World Boss reward has a tiny chance to carry a State Boss summon.
      if (!r.lieutenant && randInt(1000000, rng) < STATE_BOSS.summonPpm) summons += 1;
    }
  }
  p.coins += total;
  p.gems += gems;
  p.summons = (p.summons || 0) + summons;
  return { ok: true, claimed: n, coins: total.toString(), gems: gems.toString(), drops, summons };
}

// Gear actions (rules live in shared/gear.js).
const withPlayer = (w, id, f) => { const p = w.players.get(id); return p ? f(p) : { ok: false, error: 'no_player' }; };
export const gearInfo = (w, id) => withPlayer(w, id, (p) => gearState(p));
export const gearEquip = (w, id, item) => withPlayer(w, id, (p) => equipItem(p, item));
export const gearUnequip = (w, id, item) => withPlayer(w, id, (p) => unequipItem(p, item));
export const gearMerge = (w, id, keep, feed, rng = Math.random) => withPlayer(w, id, (p) => mergeItems(p, keep, feed, rng));
export const gearReroll = (w, id, item, what = 'stats', rng = Math.random) => withPlayer(w, id, (p) => rerollItem(p, item, what, rng));
export const gearRecycle = (w, id, items) => withPlayer(w, id, (p) => recycleItems(p, items));
export const gearCrate = (w, id, tier, rng = Math.random) => withPlayer(w, id, (p) => buyCrate(p, tier, rng));

const clean = (s, max) => String(s || '').trim().slice(0, max);

export function setProfile(w, id, { name, country, state } = {}, now = Date.now()) {
  const p = w.players.get(id);
  if (!p) return { ok: false, error: 'no_player' };
  let n = null, c = p.country, st = p.state;
  if (name !== undefined) {
    n = String(name ?? '').trim();
    const err = nameError(n);
    if (err) return { ok: false, error: err };
  }
  if (country !== undefined) {
    c = clean(country, 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return { ok: false, error: 'bad_country' };
  }
  if (state !== undefined) {
    st = clean(state, 3).toUpperCase();
    if (st && !/^[A-Z]{2,3}$/.test(st)) return { ok: false, error: 'bad_state' };
  }
  if (c !== 'US') st = '';
  // Moving to another region (to join a friend's State Boss) is allowed once every 7 days. The first pick is free.
  const was = regionOfP(p), next = regionOf(c, st);
  if (was !== next) {
    const until = p.regionAt == null ? 0 : p.regionAt + STATE_BOSS.moveDays * 86400000;
    if (now < until) return { ok: false, error: 'state_locked', nextAt: until };
    if (was) p.regionAt = now;
  }
  if (n !== null) { p.name = n; p.nameSet = true; }
  p.country = c; p.state = st;
  return { ok: true };
}

// scope: world | country | state. period: current | all.
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

// What a player sees of the State Boss in their own region.
function stateBossView(w, p, now) {
  const a = stateBossOf(w, p, now);
  if (!a) return null;
  const top = [...a.contributions].sort((x, y) => (x[1].damage === y[1].damage ? 0 : x[1].damage > y[1].damage ? -1 : 1)).slice(0, 5);
  return {
    attemptId: a.id, region: a.region, label: a.label, hp: a.hp.toString(), maxHp: a.maxHp.toString(), endsAt: a.endsAt,
    summoner: w.players.get(a.summoner)?.name || null, fighters: a.contributions.size,
    myDamage: (a.contributions.get(p.id)?.damage || 0n).toString(),
    top: top.map(([pid, c]) => ({ name: w.players.get(pid)?.name || '', damage: c.damage.toString(), me: pid === p.id })),
  };
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
      country: p.country, state: p.state, region: regionOfP(p), summons: p.summons || 0,
      regionNextAt: p.regionAt != null && now < p.regionAt + STATE_BOSS.moveDays * 86400000 ? p.regionAt + STATE_BOSS.moveDays * 86400000 : null,
      stateBoss: stateBossView(w, p, now),
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
      ads: adsInfo(p, now), boostLeft: p.boostLeft || 0, daily: dailyInfo(p, now), gift: giftInfo(p, now),
      scrap: p.scrap || 0, gearCount: (p.items || []).length, gearBonus: gearBonus(p),
    } : null,
    stateBosses: [...stateMap(w).values()].filter((x) => now < x.endsAt).sort((x, y) => y.startedAt - x.startedAt).slice(0, 10).map((x) => ({
      region: x.region, summoner: w.players.get(x.summoner)?.name || null, hp: x.hp.toString(), maxHp: x.maxHp.toString(), endsAt: x.endsAt, fighters: x.contributions.size,
    })),
    feed: w.events.filter((e) => !e.state).slice(-w.config.feedSize).reverse().map((e) => {
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
