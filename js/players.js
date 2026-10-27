// Name tags (color + badge) and the read-only stat card shared by the feed, leaderboards and profile.
import { h, openSheet, toast } from './dom.js';
import { formatBig, groupDigits, PERK_KEYS, PERK_LABEL } from '../shared/combat.js';
import { BADGE_LABEL, shareColor } from '../shared/badges.js';

export function badgeChip(badge) {
  if (!badge) return null;
  return h('span', { class: `bdg bdg-${badge}` }, BADGE_LABEL[badge] || '');
}

// share = this player's fraction of damage on the current boss (null on all-time boards: stays white).
export function nameTag(name, badge, share) {
  return h('span', { class: 'tag' }, badgeChip(badge),
    h('span', { class: 'tagname', style: share == null ? '' : `color:${shareColor(share)}` }, name));
}

export async function openCard(api, pid) {
  if (pid == null) return;
  let c;
  try { c = await api.card(pid); } catch { toast('Could not load that player.'); return; }
  if (!c || !c.ok) { toast('Player not found.'); return; }
  const since = c.since ? new Date(c.since).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '--';
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('span', null, v));
  const close = openSheet(
    h('div', { class: 'cardhead' }, nameTag(c.name, c.badge, c.share),
      h('small', null, c.share > 0 ? `${(c.share * 100).toFixed(1)}% of this boss` : 'Not on this boss yet')),
    kv('World rank (all time)', c.worldRank ? `#${groupDigits(c.worldRank)}` : '--'),
    kv('Total damage', groupDigits(c.totalDamage)),
    kv('Attacks', groupDigits(c.totalAttacks)),
    kv('Highest hit', formatBig(c.highestHit)),
    kv('Bosses helped defeat', groupDigits(c.bossesHelped)),
    kv('Killing blows', c.slayer.length ? c.slayer.map((n) => `#${n}`).join(', ') : 'None'),
    kv('Permanent perks', PERK_KEYS.filter((k) => c.perks[k] > 0).map((k) => `+${c.perks[k]}% ${PERK_LABEL[k]}`).join(', ') || 'None yet'),
    kv('Playing since', since),
    h('div', { style: 'margin-top:12px;display:grid' }, h('button', { class: 'btn', onclick: () => close() }, 'Close')));
}
