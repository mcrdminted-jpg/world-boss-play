import { h, toast } from './dom.js';
import { formatBig, groupDigits, PERK_KEYS, PERK_LABEL } from '../shared/combat.js';
import { nameError, NAME_ERROR_TEXT, NAME_MAX } from '../shared/namefilter.js';
import { MILESTONES, BADGE_LABEL } from '../shared/badges.js';
import { nameTag, badgeChip } from './players.js';
import { CLASSES } from '../shared/combat.js';
import { classGlyph, openClassPicker, CLASS_COLOR } from './classes.js';
import { icon } from './icons.js';
import { bossName } from '../shared/boss-names.js';
import { bossType } from '../shared/combat.js';
import { ago } from './dom.js';
import { getSetting, setSetting, sfx } from './sfx.js';

// Hold to confirm (about a second, with a filling ring) instead of an "Are you sure?" dialog.
function holdButton(label, action) {
  let t = null;
  const b = h('button', { class: 'btn hold' }, h('i'), h('span', null, label));
  const start = () => { b.classList.add('holding'); t = setTimeout(() => { b.classList.remove('holding'); action(); }, 1100); };
  const stop = () => { b.classList.remove('holding'); clearTimeout(t); };
  b.addEventListener('pointerdown', start); ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
  return b;
}

// Slide switch: solid blue on, solid gray off, applies instantly (no Save button).
function slide(label, key, after) {
  const on = getSetting(key);
  return h('button', { class: `slide${on ? ' on' : ''}`, role: 'switch', 'aria-checked': on ? 'true' : 'false', onclick: (e) => {
    const v = !getSetting(key); setSetting(key, v);
    e.currentTarget.classList.toggle('on', v); e.currentTarget.setAttribute('aria-checked', v ? 'true' : 'false');
    if (after) after(v);
  } }, h('span', null, label), h('i', null, h('b')));
}

const TYPE_COLOR = { Construct: '#ff8a3d', Beast: '#6fe07a', Humanoid: '#ff5468', Flying: '#63ccff', Magical: '#c08bff' };
function achievements(p) {
  const helped = p.perkCount || 0, kills = (p.slayer || []).length;
  const list = MILESTONES.map((m) => ({ key: `b${m}`, title: `${m} Bosses`, sub: 'helped defeat', have: helped >= m, prog: `${Math.min(helped, m)}/${m}`, ic: 'trophy' }));
  list.unshift({ key: 'slayer', title: 'Slayer', sub: 'killing blow', have: kills > 0, prog: kills ? `${kills}` : '0/1', ic: 'skull' });
  return list;
}

const COUNTRIES = [['US', 'United States'], ['CA', 'Canada'], ['GB', 'United Kingdom'], ['AU', 'Australia'], ['NZ', 'New Zealand'], ['IE', 'Ireland'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['IT', 'Italy'], ['NL', 'Netherlands'], ['SE', 'Sweden'], ['NO', 'Norway'], ['MX', 'Mexico'], ['BR', 'Brazil'], ['JP', 'Japan'], ['KR', 'South Korea'], ['IN', 'India'], ['PH', 'Philippines'], ['ZA', 'South Africa']];
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const ERR = { ...NAME_ERROR_TEXT, bad_zip: 'ZIP must be 5 digits.' };

import { createGearPanel } from './gear.js';
export function createProfile(api, refresh, goBoards) {
  const gearPanel = createGearPanel(api, refresh);
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
    const c = p.cls ? CLASSES[p.cls] : null;
    const classCard = h('div', { class: 'card' }, h('h2', null, 'Class'),
      c ? h('div', { class: `cls-card cls-${p.cls} on`, style: 'margin-bottom:10px' },
        h('div', { class: 'cls-ico' }, h('img', { src: `assets/classes/${p.cls}.webp`, alt: '', onerror: (e) => e.target.replaceWith(classGlyph(p.cls, 30)) })),
        h('div', null, h('div', { class: 'cls-name' }, c.name, h('small', null, `${c.dmg} damage`)),
          h('div', { class: 'cls-pref' }, `Excels vs ${c.prefers}`),
          h('div', { class: 'cls-abil' }, h('b', null, `Daily: ${c.ability}`), ` ${c.desc}`)))
        : h('p', { class: 'muted' }, 'No class yet.'),
      h('div', { style: 'display:flex;gap:8px' }, h('button', { class: 'btn', onclick: () => openClassPicker(api, s, refresh) }, c ? 'Switch class' : 'Choose class'),
        h('button', { class: 'btn ghost', onclick: () => goBoards && goBoards() }, 'Leaderboards')));
    const crate = p.totalAttacks ? ((Number(p.crits || 0) / p.totalAttacks) * 100).toFixed(1) : '0.0';
    const stat = (ic, label, v, color) => h('div', { class: 'pstat' }, icon(ic, 22, color), h('div', null, h('small', null, label), h('b', null, v)));
    const hero = h('div', { class: 'card phero', style: `--c:${CLASS_COLOR[p.cls] || '#6d7fd6'}` },
      h('div', { class: 'phero-av' }, p.cls ? h('img', { src: `assets/classes/${p.cls}.webp`, alt: '', onerror: (e) => e.target.replaceWith(classGlyph(p.cls, 44)) }) : icon('hood', 44)),
      h('div', { class: 'phero-txt' }, nameTag(p.name, p.badge, p.share), h('small', null, c ? `${c.name} · ${c.dmg} damage` : 'No class yet'),
        h('div', { class: 'phero-bar' }, h('i', { style: `width:${Math.min(100, (p.share || 0) * 100)}%` })),
        h('small', null, `${((p.share || 0) * 100).toFixed(1)}% of the current boss`)));
    const stats = h('div', { class: 'card' }, h('h2', null, 'Player Stats'),
      h('div', { class: 'pstats' },
        stat('sword', 'Total damage', formatBig(p.totalDamage), '#ffd36b'),
        stat('skull', 'Bosses helped', groupDigits(p.perkCount || 0), '#ff5a5a'),
        stat('burst', 'Highest hit', formatBig(p.highestHit), '#ffb347'),
        stat('swords', 'Total attacks', groupDigits(p.totalAttacks), '#7fd3ff'),
        stat('clover', 'Critical hits', `${groupDigits(p.crits || 0)} (${crate}%)`, '#5fe07a'),
        stat('gem', 'Gems earned', groupDigits(p.gemsEarned || 0), '#c48bff'),
        stat('trophy', 'Killing blows', groupDigits((p.slayer || []).length), '#ffd36b'),
        stat('coin', 'Avg per hit', p.damagePerHit, '#ffcf4a')),
      h('div', { class: 'pnote' }, s.highestDefeated ? `Community: World Boss #${s.highestDefeated} is the highest defeated so far.` : 'Community: no World Boss defeated yet.'));
    const achList = achievements(p);
    const ach = h('div', { class: 'card' }, h('div', { class: 'card-row' }, h('h2', null, 'Achievements'), h('small', null, `${achList.filter((a) => a.have).length}/${achList.length}`)),
      h('div', { class: 'achs' }, achList.map((a) => h('div', { class: `ach${a.have ? ' have' : ''}` },
        h('span', { class: 'ach-medal' }, icon(a.have ? a.ic : 'lock', 26, a.have ? (a.key === 'slayer' ? '#ff6a3d' : '#ffd36b') : '#6c77a8')),
        h('b', null, a.title), h('small', null, a.have ? a.sub : a.prog)))));
    const nowMs = Date.now() + (s.skew || 0);
    const hist = h('div', { class: 'card' }, h('h2', null, 'Recent Bosses'),
      s.history.length
        ? s.history.slice(0, 10).map((x) => {
          const m = /#(\d+)(?:-([A-Z]+))?/.exec(x.label) || [];
          const num = Number(m[1] || 1), lt = !!m[2];
          const type = bossType(num);
          return h('div', { class: 'hrow' },
            h('span', { class: 'hico', style: `--c:${TYPE_COLOR[type] || '#8a95c4'}` }, icon(lt ? 'swords' : 'skull', 18, TYPE_COLOR[type] || '#8a95c4')),
            h('div', { class: 'htxt' }, h('b', null, lt ? x.label : `#${num} ${bossName(num)}`),
              h('small', null, `${formatBig(x.damage)} dmg · ${x.contributors} fighter${x.contributors === 1 ? '' : 's'}${x.finalBlow ? ` · final blow ${x.finalBlow}` : ''}`)),
            h('span', { class: `hstat ${x.status === 'defeated' ? 'ok' : 'bad'}` }, x.status === 'defeated' ? 'Defeated' : 'Retreated', h('small', null, x.endedAt ? ago(x.endedAt, nowMs) : '')));
        })
        : h('div', { class: 'muted', style: 'font-size:14px' }, 'No finished fights yet.'));
    gearPanel.sync(s);
    el.replaceChildren(
      hero, gearPanel.el, stats, ach, classCard, hist,
      h('div', { class: 'card' }, h('h2', null, 'Settings'),
        slide('Sound effects', 'sound', (v) => { if (v) sfx.coin(); }),
        slide('Vibration', 'vibration'),
        h('a', { class: 'plink', href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy policy')),
      h('div', { class: 'card danger' }, h('h2', null, 'Delete account'),
        h('p', { class: 'muted', style: 'font-size:13px;margin:0 0 10px' }, 'Deletes your player, progress, gems and coins from the server for good. Bosses you hit keep their HP. Hold the button to confirm.'),
        holdButton('Hold to delete account', async () => {
          const r = await api.deleteMe();
          if (!r || !r.ok) { toast('Could not delete. Try again.'); return; }
          toast('Account deleted.'); setTimeout(() => location.reload(), 900);
        })),
      h('div', { class: 'card' }, h('h2', null, 'You'),
        h('label', { class: 'field' }, 'Player name', nameIn),
        h('label', { class: 'field' }, 'Country', country), state,
        h('label', { class: 'field' }, 'ZIP code (for local leaderboards)', zip),
        h('div', { style: 'color:var(--muted);font-size:12px' }, 'Only your name and damage are shown to others. Your ZIP is never shown. Names are letters and numbers only: no social media, contact info or bad words.')),
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
          'Name color shows your share of the current boss: white, then blood red at 40%, gold at 80%.')));
  }
  return { el, render };
}
