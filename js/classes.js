// Class picker and class glyphs. Rules live in shared/engine.js (setClass, useAbility) and the SQL mirror.
import { h, toast, openSheet } from './dom.js';
import { CLASSES, CLASS_KEYS } from '../shared/combat.js';

// One-tone line glyphs, drawn in the class color.
const GLYPH = {
  warrior: 'M5 19l9-9M14 4l6 0 0 6-6 6-6-6zM4 20l3-3M6 15l3 3',
  barbarian: 'M12 3v18M12 5c-4 0-7 2-8 5 3 0 6-1 8-3M12 5c4 0 7 2 8 5-3 0-6-1-8-3',
  rogue: 'M19 5L8 16l-3 3M19 5l-2 6-6 2M8 16l-1-3M8 16l3 1',
  archer: 'M6 3c7 2 11 8 9 18M6 3l9 18M4 12h15M16 9l3 3-3 3',
  mage: 'M8 21l7-12M15 9a3 3 0 103-3M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
};
export const CLASS_COLOR = { warrior: '#f2b84b', barbarian: '#ff5a43', rogue: '#b07cff', archer: '#5fd16a', mage: '#4fa8ff' };

export function classGlyph(cls, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', 'glyph');
  svg.style.color = CLASS_COLOR[cls] || '#8a95c4';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', GLYPH[cls] || 'M12 4v16M4 12h16');
  svg.append(path);
  return svg;
}

const when = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

// forced = end of the first-run demo: no way to dismiss without picking.
export function openClassPicker(api, s, refresh, forced = false) {
  const p = s.player;
  const bossType = s.boss.type;
  let note;
  if (!p.cls) note = 'Pick your class. You can switch for free during your first 7 days.';
  else if (p.classFreeUntil && Date.now() + s.skew < p.classFreeUntil) note = `Free switching until ${when(p.classFreeUntil)}.`;
  else if (p.classSwitchFree) note = 'Your monthly free switch is ready.';
  else note = `Next free switch ${when(p.classNextFreeAt)}, or switch now for 100 gems.`;
  const cards = CLASS_KEYS.map((k) => {
    const c = CLASSES[k];
    const on = p.cls === k;
    const match = c.prefers === bossType;
    return h('button', { class: `cls-card cls-${k}${on ? ' on' : ''}`, onclick: () => pick(k) },
      h('div', { class: 'cls-ico' }, h('img', { src: `assets/classes/${k}.webp`, alt: '', onerror: (e) => e.target.replaceWith(classGlyph(k, 30)) })),
      h('div', { class: 'cls-body' },
        h('div', { class: 'cls-name' }, c.name, h('small', null, `${c.dmg} damage`)),
        h('div', { class: 'cls-pref' }, `Excels vs ${c.prefers}`, match ? h('em', null, 'current boss') : null),
        h('div', { class: 'cls-abil' }, h('b', null, `Daily: ${c.ability}`), ` ${c.desc}`)),
      on ? h('span', { class: 'cls-on' }, 'Yours') : null);
  });
  const close = openSheet(h('h3', null, p.cls ? 'Switch class' : 'Choose your class'), h('p', { class: 'muted' }, note),
    h('div', { class: 'cls-list' }, cards),
    forced ? null : h('button', { class: 'btn', onclick: () => close() }, 'Close'));
  if (forced) document.querySelector('.scrim')?.replaceWith(h('div', { class: 'scrim open' }));

  async function pick(k) {
    if (p.cls === k) { if (!forced) close(); return; }
    const r = await api.setClass(k);
    if (!r.ok) {
      toast(r.error === 'switch_locked' ? `Next free switch ${when(r.nextFreeAt)}. Or keep 100 gems ready.` : `Could not switch: ${r.error}`, 3200);
      return;
    }
    toast(r.paid !== '0' ? `You are now a ${CLASSES[k].name} (100 gems).` : `You are now a ${CLASSES[k].name}.`);
    close();
    await refresh();
  }
  return close;
}
