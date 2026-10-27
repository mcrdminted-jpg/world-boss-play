// Status shown next to a player's name in the feed and leaderboards. No free text anywhere: only these.
// Mirrored on the server (wb_badges_earned / wb_set_badge in 0002_functions.sql).

// Milestones for numbered bosses a player helped defeat (1+ damage). Nothing shows before 10.
export const MILESTONES = [10, 25, 50, 100, 250, 500, 1000];
export const BADGE_LABEL = {
  b10: '10', b25: '25', b50: '50', b100: '100', b250: '250', b500: '500', b1000: '1K', slayer: 'SLAYER',
};

export function earnedBadges(bossesHelped, slayerKills) {
  const out = MILESTONES.filter((m) => bossesHelped >= m).map((m) => `b${m}`);
  if (slayerKills >= 1) out.push('slayer');
  return out;
}

// The badge actually displayed: the player's pick if they still own it, otherwise their highest milestone,
// otherwise Slayer, otherwise none.
export function displayBadge(chosen, bossesHelped, slayerKills) {
  const earned = earnedBadges(bossesHelped, slayerKills);
  if (chosen === 'none') return null;
  if (chosen && earned.includes(chosen)) return chosen;
  const miles = earned.filter((b) => b !== 'slayer');
  if (miles.length) return miles[miles.length - 1];
  return earned.includes('slayer') ? 'slayer' : null;
}

// Name color from this player's share of damage on the CURRENT boss, linear:
// 0% white -> 40% blood red -> 80%+ gold. Resets to white on every new boss.
const WHITE = [255, 255, 255], RED = [179, 0, 27], GOLD = [255, 200, 61];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
export function shareColor(share) {
  const s = Math.max(0, Math.min(1, Number(share) || 0));
  const rgb = s <= 0.4 ? mix(WHITE, RED, s / 0.4) : s < 0.8 ? mix(RED, GOLD, (s - 0.4) / 0.4) : GOLD;
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
