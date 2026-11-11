// Gear screens: the six slots, the bag, item details, merging (4 into 1), recycling and crates.
// Rules live in shared/gear.js; the server is the authority (wb_gear_* RPCs).
import { h, toast, openSheet } from './dom.js';
import { icon } from './icons.js';
import { sfx } from './sfx.js';
import { SLOTS, SLOT_NAME, TIERS, BONUS_KEYS, BONUS_NAME, SETS, WEIGHT } from '../shared/gear.js';

const SLOT_ICON = { weapon: 'sword', helm: 'helm', chest: 'armor', gloves: 'gloves', boots: 'boots', ring: 'ring' };
const CLASS_NAME = { warrior: 'Warrior', barbarian: 'Barbarian', rogue: 'Rogue', archer: 'Archer', mage: 'Mage' };
const MYTHIC_TEXT = { warrior: 'Titan Strike 6x becomes 7x', barbarian: '+1 attack from the daily ability', rogue: '+1 Shadow Strike charge', archer: '+1 ability charge', mage: 'ability 3.5x becomes 4x' };
const ERR = { need_three: 'Pick exactly 3 items to feed.', tier_mismatch: 'All four items must be the same tier.', equipped: 'Unequip it first.', max_tier: 'Legendary is the top merge. Mythic only drops.',
  not_enough_scrap: 'Not enough scrap.', bag_full: 'Your bag is full. Merge or recycle first.', no_item: 'That item is gone.' };

export const fmtPct = (v) => { const a = Math.abs(v); const s = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3); return s.replace(/\.?0+$/, ''); };
// Tile labels must fit a 50px square: at most 4 digits, and a short word for the bonus type on its own line.
const shortPct = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3)).replace(/\.?0+$/, '');
// One dot per different bonus on the item, so a tile shows at a glance how many effects it has.
const BONUS_COLOR = { gold: '#ffcf4a', critdmg: '#ff9d3c', dmg: '#ff6a4d', boss: '#ff4d8d', crit: '#5fe07a', gem: '#c48bff' };
const BONUS_SHORT = { gold: 'Gold', critdmg: 'Crit Dmg', dmg: 'Damage', boss: 'Boss', crit: 'Crit %', gem: 'Gems' };
export const itemName = (it) => `${TIERS[it.tier].name} ${SLOT_NAME[it.slot]}`;
const linesOf = (it, weight) => BONUS_KEYS.filter((k) => it.stats[k]).map((k) => ({ k, pct: (it.stats[k] / 100) * (weight[k] ?? WEIGHT[k]) })).sort((a, b) => b.pct - a.pct);
const after = (fn) => setTimeout(fn, 260); // a closing sheet clears the sheet root 220ms later; open the next one after that
const points = (it) => Object.values(it.stats).reduce((a, b) => a + b, 0);

// A square tile for one item (or an empty slot). Used on Profile, in the bag and on player cards.
export function itemTile(it, slot, onclick, weight = WEIGHT) {
  if (!it) return h('button', { class: 'gtile empty', onclick }, icon(SLOT_ICON[slot], 24, '#5b6488'), h('small', null, SLOT_NAME[slot]));
  const T = TIERS[it.tier], all = linesOf(it, weight), top = all[0];
  return h('button', { class: `gtile t${it.tier}${it.equipped ? ' on' : ''}${it.set ? ' set' : ''}`, style: `--c:${T.color}`, onclick },
    icon(SLOT_ICON[it.slot], 20, T.color),
    h('small', null, top ? `+${shortPct(top.pct)}%` : ''), h('small', { class: 'gtype' }, top ? BONUS_SHORT[top.k] : ''),
    all.length > 1 ? h('span', { class: 'gdots' }, all.map((l) => h('i', { style: `background:${BONUS_COLOR[l.k]}` }))) : null,
    it.set ? h('i', { class: 'gset' }, 'SET') : null, it.cls ? h('i', { class: 'gcls' }, CLASS_NAME[it.cls][0]) : null);
}

export function gearRow(gear, weight = WEIGHT) {
  const by = Object.fromEntries((gear || []).map((g) => [g.slot, g]));
  return h('div', { class: 'gslots small' }, SLOTS.map((sl) => itemTile(by[sl] ? { ...by[sl], equipped: false } : null, sl, null, weight)));
}

export function createGearPanel(api, refresh) {
  let g = null, sig = '', busy = false;
  const el = h('div', { class: 'card gear' }, h('h2', null, 'Gear'), h('div', { class: 'muted', style: 'font-size:13px' }, 'Loading...'));

  async function load() { try { g = await api.gear(); } catch { g = null; } paint(); }
  const act = async (fn, okMsg) => {
    if (busy) return null;
    busy = true;
    try {
      const r = await fn();
      if (!r || !r.ok) { toast(ERR[r && r.error] || `Could not do that (${(r && r.error) || 'error'}).`, 3500); return null; }
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 2600);
      try { sfx.buy(); } catch { /* ignore */ }
      return r;
    } catch { toast('Connection problem. Try again.'); return null; }
    finally { busy = false; await load(); refresh(); }
  };

  function bonusLines() {
    const b = g.bonus, out = [];
    for (const k of BONUS_KEYS) if (b[k] > 0) out.push(`+${fmtPct(b[k])}% ${BONUS_NAME[k]}`);
    if (b.attacks > 0) out.push(`+${b.attacks} daily attack${b.attacks === 1 ? '' : 's'}`);
    return out;
  }
  function setLines() {
    return Object.entries(g.bonus.sets || {}).map(([id, n]) => {
      const S = SETS[id], step = n >= 6 ? 2 : n >= 4 ? 1 : n >= 2 ? 0 : -1;
      const now = step >= 0 ? `+${S.steps[step]}${S.key === 'attacks' ? '' : '%'} ${S.text}` : 'needs 2 pieces';
      return h('div', { class: 'gsetline' }, h('b', null, `${S.name} ${n}/6`), h('span', null, now));
    });
  }

  function paint() {
    if (!g || !g.ok) { el.replaceChildren(h('h2', null, 'Gear'), h('div', { class: 'muted', style: 'font-size:13px' }, 'Gear could not load. Pull down to retry.')); return; }
    const w = g.weight || WEIGHT, eq = Object.fromEntries(g.items.filter((x) => x.equipped).map((x) => [x.slot, x]));
    const bag = g.items.filter((x) => !x.equipped).sort((a, b) => b.tier - a.tier || points(b) - points(a));
    const bl = bonusLines();
    el.replaceChildren(
      h('h2', null, 'Gear'),
      h('div', { class: 'gslots' }, SLOTS.map((sl) => itemTile(eq[sl], sl, () => (eq[sl] ? openItem(eq[sl]) : openSlot(sl)), w))),
      h('div', { class: 'gbonus' }, bl.length ? bl.join(' · ') : 'Nothing equipped yet. Every boss you help kill drops one item.'),
      ...setLines(),
      h('div', { class: 'ghead' }, h('b', null, `Bag ${g.items.length}/${g.cap}`), h('span', null, icon('chest', 14, '#aab3c8'), `${g.scrap} scrap`)),
      bag.length ? h('div', { class: 'gbag' }, bag.map((it) => itemTile(it, it.slot, () => openItem(it), w)))
        : h('div', { class: 'muted', style: 'font-size:13px' }, 'Your bag is empty.'),
      h('div', { class: 'ghead' }, h('b', null, 'Crates'), h('span', null, 'A new random item of that tier')),
      h('div', { class: 'gcrates' }, [1, 2, 3, 4, 5].map((t) => h('button', { class: 'gcrate', style: `--c:${TIERS[t].color}`, disabled: g.scrap < TIERS[t].crate,
        onclick: () => act(() => api.gearCrate(t), (r) => `Crate: ${itemName(r.item)}`) }, h('b', null, TIERS[t].name), h('small', null, `${TIERS[t].crate} scrap`)))));
  }

  function openSlot(slot) {
    const list = g.items.filter((x) => x.slot === slot && !x.equipped).sort((a, b) => b.tier - a.tier || points(b) - points(a));
    if (!list.length) { toast(`No ${SLOT_NAME[slot].toLowerCase()} in your bag yet.`); return; }
    const close = openSheet(h('h2', null, `Equip ${SLOT_NAME[slot]}`),
      h('div', { class: 'gbag' }, list.map((it) => itemTile(it, slot, () => { close(); after(() => openItem(it)); }, g.weight))));
  }

  function openItem(it) {
    const T = TIERS[it.tier], w = g.weight || WEIGHT;
    const same = g.items.filter((x) => x.id !== it.id && x.tier === it.tier && !x.equipped);
    let close;
    const btn = (label, cls, fn, disabled) => h('button', { class: `btn ${cls}`, disabled, onclick: async () => { close(); await fn(); } }, label);
    close = openSheet(
      h('div', { class: 'gitem-head', style: `--c:${T.color}` }, h('span', { class: 'gbig' }, icon(SLOT_ICON[it.slot], 30, T.color)),
        h('div', null, h('b', null, itemName(it)), h('small', null, [it.set ? `${SETS[it.set].name} set` : null, it.cls ? `${CLASS_NAME[it.cls]} Mythic` : null, it.equipped ? 'Equipped' : null].filter(Boolean).join(' · ') || 'In your bag'))),
      h('div', { class: 'glines' }, linesOf(it, w).map((l) => h('div', { class: 'kv' }, h('span', null, h('i', { class: 'gdot', style: `background:${BONUS_COLOR[l.k]}` }), BONUS_NAME[l.k]), h('span', null, `+${fmtPct(l.pct)}%`)))),
      it.set ? h('p', { class: 'fine' }, `${SETS[it.set].name}: 2 / 4 / 6 pieces give +${SETS[it.set].steps.join(' / +')}${SETS[it.set].key === 'attacks' ? '' : '%'} ${SETS[it.set].text}.`) : null,
      it.cls ? h('p', { class: 'fine' }, `On a ${CLASS_NAME[it.cls]}: ${MYTHIC_TEXT[it.cls]}.`) : null,
      h('div', { class: 'gbtns' },
        it.equipped ? btn('Unequip', '', () => act(() => api.gearEquip(it.id, false))) : btn('Equip', 'gold', () => act(() => api.gearEquip(it.id, true), `${itemName(it)} equipped.`)),
        it.tier < 5 ? btn(`Merge (4 into 1 ${TIERS[it.tier + 1].name})`, '', async () => after(() => openMerge(it)), same.length < 3) : null,
        it.equipped ? null : btn(`Recycle (+${T.scrap} scrap)`, 'ghost', () => act(() => api.gearRecycle([it.id]), `+${T.scrap} scrap`))),
      it.tier < 5 && same.length < 3 ? h('p', { class: 'fine' }, `Merging needs 3 more unequipped ${T.name} items. You have ${same.length}.`) : null,
      it.tier === 5 ? h('p', { class: 'fine' }, 'Legendary is the top merge. Mythic only drops.') : null);
  }

  // Pick 3 same-tier items to feed into the kept one. The result is the total of all four.
  function openMerge(keep) {
    const w = g.weight || WEIGHT, T = TIERS[keep.tier], N = TIERS[keep.tier + 1];
    // Best feeders first: the most of the kept item's main bonus, then the biggest total. Feeding strong items makes a strong result.
    const main = (linesOf(keep, w)[0] || {}).k;
    const score = (x) => (x.stats[main] || 0) * 1000 + points(x);
    const pool = g.items.filter((x) => x.id !== keep.id && x.tier === keep.tier && !x.equipped).sort((a, b) => score(b) - score(a));
    const picked = new Set();
    const grid = h('div', { class: 'gbag' }), preview = h('div', { class: 'glines' }), go = h('button', { class: 'btn gold' });
    let close;
    function draw() {
      grid.replaceChildren(...pool.map((it) => { const t = itemTile(it, it.slot, () => { if (picked.has(it.id)) picked.delete(it.id); else if (picked.size < 3) picked.add(it.id); draw(); }, w); if (picked.has(it.id)) t.classList.add('pick'); return t; }));
      const total = { ...keep.stats };
      for (const it of pool) if (picked.has(it.id)) for (const [k, v] of Object.entries(it.stats)) total[k] = (total[k] || 0) + v;
      preview.replaceChildren(...linesOf({ stats: total }, w).map((l) => h('div', { class: 'kv' }, h('span', null, BONUS_NAME[l.k]), h('span', null, `+${fmtPct(l.pct)}%`))));
      go.textContent = picked.size === 3 ? `Merge into ${N.name} ${SLOT_NAME[keep.slot]}` : `Pick ${3 - picked.size} more`;
      go.disabled = picked.size !== 3;
    }
    go.onclick = async () => { close(); await act(() => api.gearMerge(keep.id, [...picked]), (r) => `Merged: ${itemName(r.item)}`); };
    close = openSheet(h('h2', null, `Merge into ${N.name}`),
      h('p', { class: 'fine' }, `Keeping your ${itemName(keep)}. Pick 3 ${T.name} items to feed in. They are destroyed and their bonuses are added to it, so strong items make a strong ${N.name}.`),
      h('button', { class: 'btn ghost', style: 'margin-bottom:8px', onclick: () => { picked.clear(); pool.slice(0, 3).forEach((x) => picked.add(x.id)); draw(); } }, 'Pick 3'),
      grid, h('div', { class: 'ghead' }, h('b', null, 'Result')), preview, h('div', { class: 'gbtns' }, go));
    draw();
  }

  return {
    el,
    // Reloads only when the bag or scrap changed (the state poll calls this every few seconds).
    sync(s) {
      const p = s && s.player; if (!p) return;
      const n = `${p.gearCount}|${p.scrap}|${p.cls}`;
      if (n !== sig) { sig = n; load(); }
    },
  };
}

// Gear has its own tab (2026-11-10): the same panel, on its own screen.
export function createGearScreen(api, refresh) {
  const panel = createGearPanel(api, refresh);
  const el = h('div', { class: 'scroll' }, panel.el);
  return { el, render: (s) => panel.sync(s) };
}
