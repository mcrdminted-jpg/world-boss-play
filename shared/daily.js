// Daily rewards: one small reward per day you open the game, over a 30-day cycle that then starts again.
// Missing a day never resets progress: day N is simply your Nth claim. Mirrored on the server (0015_daily_rewards.sql).
// kind: attacks (bonus attacks), boost (2x damage charges), scrap, gems, item (one gear item of tier n).
const WEEK = (a, s, b, a2, s2, b2, g) => [['attacks', a], ['scrap', s], ['boost', b], ['attacks', a2], ['scrap', s2], ['boost', b2], ['gems', g]];
export const DAILY = [
  ...WEEK(1, 5, 1, 2, 10, 2, 1),
  ...WEEK(2, 10, 2, 3, 15, 3, 2),
  ...WEEK(3, 15, 3, 4, 20, 4, 2),
  ...WEEK(4, 20, 4, 5, 25, 5, 3),
  ['item', 3], ['gems', 5],
].map(([kind, n], i) => ({ day: i + 1, kind, n }));
export const DAILY_LEN = DAILY.length; // 30

export function dailyText(r) {
  if (r.kind === 'attacks') return `+${r.n} attack${r.n === 1 ? '' : 's'}`;
  if (r.kind === 'boost') return `${r.n} x 2x damage`;
  if (r.kind === 'scrap') return `${r.n} scrap`;
  if (r.kind === 'gems') return `${r.n} gem${r.n === 1 ? '' : 's'}`;
  return 'Rare gear';
}
