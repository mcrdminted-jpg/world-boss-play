import { h, toast } from './dom.js';
import { formatBig, groupDigits, PERK_KEYS, PERK_LABEL } from '../shared/combat.js';
import { nameError, NAME_ERROR_TEXT, NAME_MAX } from '../shared/namefilter.js';
import { MILESTONES, BADGE_LABEL } from '../shared/badges.js';
import { nameTag, badgeChip } from './players.js';

const COUNTRIES = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['SE', 'Sweden'], ['NO', 'Norway'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['JP', 'Japan'], ['KR', 'South Korea'], ['IN', 'India'], ['PH', 'Philippines'], ['ZA', 'South Africa']];
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const ERR = { ...NAME_ERROR_TEXT, bad_zip: 'ZIP must be 5 digits.' };

export function createProfile(api, refresh) {
  const el = h('div', { class: 'scroll' });

  async function save(patch) {
    const r = await api.setProfile(patch);
    if (!r.ok) toast(ERR[r.error] || 'Could not save.');
    await refresh();
  }

  function render(s) {
    const p = s.player;
    if (!p) return;
    // Do not rebuild while the player is typing in a field.
    if (el.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    // Checked here only to show a clear message; the server enforces the same rules.
    const nameIn = h('input', { value: p.name, maxlength: NAME_MAX, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
      onchange: (e) => { const v = e.target.value.trim(); const err = nameError(v); if (err) { toast(ERR[err]); e.target.value = p.name; return; } save({ name: v }); } });
    const country = h('select', { onchange: (e) => save({ country: e.target.value, state: '' }) },
      COUNTRIES.map(([c, n]) => h('option', { value: c, selected: c === p.country }, n)));
    const state = p.country === 'US'
      ? h('label', { class: 'field' }, 'State', h('select', { onchange: (e) => save({ state: e.target.value }) },
        h('option', { value: '' }, 'Not set'), STATES.map((c) => h('option', { value: c, selected: c === p.state }, c))))
      : null;
    const zip = h('input', { value: p.zip, inputmode: 'numeric', maxlength: 5, placeholder: 'Optional', onchange: (e) => save({ zip: e.target.value.trim() }) });
    const badges = p.slayer.length
      ? h('div', { class: 'badges' }, p.slayer.map((n) => h('span', { class: 'badge' }, `Slayer of World Boss #${n}`)))
      : h('div', { style: 'color:var(--muted);font-size:14px' }, 'No killing blows yet.');
    el.replaceChildren(
      h('div', { class: 'card' }, h('h2', null, 'You'),
        h('label', { class: 'field' }, 'Player name', nameIn),
        h('label', { class: 'field' }, 'Country', country), state,
        h('label', { class: 'field' }, 'ZIP code (for local leaderboards)', zip),
        h('div', { style: 'color:var(--muted);font-size:12px' }, 'Only your name and damage are shown to others. Your ZIP is never shown. Names are letters and numbers only: no social media, contact info or bad words.')),
      h('div', { class: 'card' }, h('h2', null, 'Stats'),
        h('div', { class: 'kv' }, h('span', null, 'Total damage'), h('span', null, groupDigits(p.totalDamage))),
        h('div', { class: 'kv' }, h('span', null, 'Total attacks'), h('span', null, groupDigits(p.totalAttacks))),
        h('div', { class: 'kv' }, h('span', null, 'Highest hit'), h('span', null, groupDigits(p.highestHit))),
        h('div', { class: 'kv' }, h('span', null, 'Average per hit'), h('span', null, p.damagePerHit)),
        h('div', { class: 'kv' }, h('span', null, 'Community best'), h('span', null, s.highestDefeated ? `Boss #${s.highestDefeated} defeated` : 'None yet'))),
      h('div', { class: 'card' }, h('h2', null, 'Permanent boss perks'),
        h('div', { style: 'color:var(--muted);font-size:12px;margin-bottom:6px' },
          `${p.perkCount} earned. Every World Boss you hit gives +1% when it falls. Crit, lucky and gem perks are banked now and switch on when those systems launch.`),
        PERK_KEYS.map((k) => h('div', { class: 'kv' }, h('span', null, PERK_LABEL[k]), h('span', null, `+${p.perks[k]}%`)))),
      h('div', { class: 'card' }, h('h2', null, 'Your badge'),
        h('div', { style: 'margin:2px 0 8px' }, 'How others see you: ', nameTag(p.name, p.badge, p.share)),
        p.badgesEarned.length
          ? h('div', { class: 'picker' },
            [['auto', 'Highest'], ...p.badgesEarned.map((b) => [b, null]), ['none', 'Hide']].map(([k, label]) => {
              const on = (k === 'auto' && p.badgeChoice == null) || k === p.badgeChoice;
              return h('button', { class: `pick${on ? ' on' : ''}`, onclick: async () => {
                const r = await api.setBadge(k === 'auto' ? null : k);
                if (!r.ok) toast('Badge not earned yet.');
                await refresh();
              } }, label || badgeChip(k));
            }))
          : h('div', { style: 'color:var(--muted);font-size:14px' },
            `Help defeat ${MILESTONES[0] - p.perkCount} more World Bosses to earn your first badge (${p.perkCount}/${MILESTONES[0]}). A killing blow earns the Slayer badge.`),
        h('div', { style: 'color:var(--muted);font-size:12px;margin-top:8px' },
          'Name color shows your share of the current boss: white, then blood red at 40%, gold at 80%.')),
      h('div', { class: 'card' }, h('h2', null, 'Killing blows'), badges),
      h('div', { class: 'card' }, h('h2', null, 'Boss history'),
        s.history.length
          ? s.history.map((x) => h('div', { class: 'hist' },
            h('b', null, x.label), h('span', { class: x.status === 'defeated' ? 'ok' : 'bad' }, x.status === 'defeated' ? 'Defeated' : 'Retreated'),
            h('small', null, `${formatBig(x.damage)} of ${formatBig(x.maxHp)} HP, ${x.contributors} fighters${x.finalBlow ? `, final blow ${x.finalBlow}` : ''}`)))
          : h('div', { style: 'color:var(--muted);font-size:14px' }, 'No finished fights yet.')));
  }
  return { el, render };
}
