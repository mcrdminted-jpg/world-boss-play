// Pure combat and economy math. BigInt everywhere: no floating point for HP, damage or coins.
// The SQL functions in supabase/migrations mirror these formulas. Keep them in sync.

export const ceilDiv = (a, b) => (a + b - 1n) / b;

// Uniform BigInt in [0, n) from a float rng in [0,1). Slight modulo bias is negligible (64 extra bits).
export function randBelow(n, rng) {
  if (n <= 1n) return 0n;
  const bits = n.toString(2).length + 64;
  let r = 0n;
  for (let i = 0; i < bits; i += 32) {
    r = (r << 32n) | BigInt(Math.floor(rng() * 4294967296));
  }
  return r % n;
}

// Base damage = 1.25^rank = 5^rank / 4^rank. Whole part plus a fractional remainder.
export function damageFraction(rank) {
  const r = BigInt(rank);
  const num = 5n ** r;
  const den = 4n ** r;
  return { whole: num / den, rem: num % den, den };
}

// Stochastic rounding: expected value equals 1.25^rank exactly, result is always a whole number >= 1.
// Needed because floor(1.25^rank) alone gives no gain for ranks 1 to 3.
export function rollBaseDamage(rank, rng) {
  return rollDamage(rank, 0, rng);
}

// Stochastic rounding of num/den: expected value exact, never below the whole part.
export function stochRound(num, den, rng) {
  const whole = num / den, rem = num % den;
  return rem > 0n && randBelow(den, rng) < rem ? whole + 1n : whole;
}

// Damage per hit = 1.25^rank * (100 + damage perk %) / 100, at least 1.
export function rollDamage(rank, dmgPct, rng) {
  const r = BigInt(rank);
  const d = stochRound(5n ** r * BigInt(100 + dmgPct), 4n ** r * 100n, rng);
  return d < 1n ? 1n : d;
}

// Coins for credited damage: damage * (100 + coin perk %) / 100.
export function rollCoins(dmg, coinPct, rng) {
  return stochRound(BigInt(dmg) * BigInt(100 + coinPct), 100n, rng);
}

// Five boss types in a fixed rotation, each dropping one permanent +1 perk to every participant.
export const BOSS_TYPES = ['Construct', 'Beast', 'Humanoid', 'Flying', 'Magical'];
export const PERK_KEYS = ['damage', 'coins', 'crit', 'lucky', 'gem'];
export const PERK_LABEL = {
  damage: 'damage', coins: 'coins', crit: 'crit chance', lucky: 'lucky strike', gem: 'gem chance',
};
export const bossType = (n) => BOSS_TYPES[(Math.max(n, 1) - 1) % 5];
export const bossPerk = (n) => PERK_KEYS[(Math.max(n, 1) - 1) % 5];
export const emptyPerks = () => ({ damage: 0, coins: 0, crit: 0, lucky: 0, gem: 0 });

// Display text for average damage per hit, two decimals.
export function damagePerHitText(rank, dmgPct = 0) {
  const r = BigInt(rank);
  const scaled = 5n ** r * BigInt(100 + dmgPct) / 4n ** r;
  const s = scaled.toString().padStart(3, '0');
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

// Cost to buy the next Base Damage rank: ceil(5 * 1.35^rank). Rank 0 costs 5 coins.
// Rank 0 costs 1 coin (first-run demo: first hit pays 1 coin, buy immediately). Then ceil(5 * 1.35^rank).
export function upgradeCost(rank) {
  if (rank === 0) return 1n;
  const r = BigInt(rank);
  return ceilDiv(5n * 135n ** r, 100n ** r);
}

// Next numbered boss HP: prev * clamp(2 / max(D, 1/1440), 1.10, 10), D in days. Exact rationals, ceil.
export function nextBossHp(prevHp, durationMs) {
  const ms = BigInt(Math.max(0, Math.floor(Number(durationMs))));
  const den = ms < 60000n ? 60000n : ms; // 1/1440 day = 60,000 ms
  const num = 172800000n; // 2 days in ms
  if (num * 10n < den * 11n) return ceilDiv(prevHp * 11n, 10n);
  if (num > den * 10n) return prevHp * 10n;
  return ceilDiv(prevHp * num, den);
}

// After a failed 7-day attempt, the next rung down is sized from what the community actually did:
// 75% of the damage dealt that week, but at most 80% of the failed enemy's HP, and never below minHp.
// A population crash (streamer spike that leaves) is corrected in ONE failed week, not months.
export function retreatHp(failedHp, damageDealt, minHp) {
  const cap = ceilDiv(BigInt(failedHp) * 4n, 5n);
  const fit = ceilDiv(BigInt(damageDealt) * 3n, 4n);
  const v = cap < fit ? cap : fit;
  return v < minHp ? minHp : v;
}

// Legacy helper kept for reference tests: ceil(mainHp * 0.8^d), never below floorHp.
export function ladderHp(mainHp, depth, floorHp) {
  const d = BigInt(depth);
  const v = ceilDiv(mainHp * 4n ** d, 5n ** d);
  return v > floorHp ? v : floorHp;
}

// 1 -> A, 26 -> Z, 27 -> AA
export function letters(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

export function attemptLabel(mainNumber, depth) {
  return depth === 0 ? `World Boss #${mainNumber}` : `Lieutenant #${mainNumber - 1}-${letters(depth)}`;
}

// Participation reward (coins). Provisional defaults, tune after simulation.
export function rewardCoins(kind, mainNumber) {
  return kind === 'main' ? 10n * BigInt(mainNumber) : 5n * BigInt(Math.max(mainNumber - 1, 1));
}

// Number formatting for display only.
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
export function formatBig(n) {
  const v = BigInt(n);
  const neg = v < 0n;
  const s = (neg ? -v : v).toString();
  let out;
  if (s.length <= 3) out = s;
  else {
    const idx = Math.floor((s.length - 1) / 3);
    if (idx >= SUFFIX.length) {
      out = `${s[0]}.${s.slice(1, 3)}e${s.length - 1}`;
    } else {
      const head = s.length - idx * 3;
      out = `${s.slice(0, head)}.${s.slice(head, head + 2)}${SUFFIX[idx]}`;
    }
  }
  return neg ? `-${out}` : out;
}

export function groupDigits(n) {
  return BigInt(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
