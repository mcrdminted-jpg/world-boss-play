// Tech Tree: one continuous branching map you can drag and pinch (spec: no tier pages). Locked nodes stay
// visible and inspectable; only complete prerequisites unlock a node. Gems pay for ranks.
import { h, toast, openSheet } from './dom.js';
import { NODES, NODE, EFFECTS, TIER_COST, techUnlocked } from '../shared/tech.js';
import { CLASSES, formatBig } from '../shared/combat.js';
import { icon } from './icons.js';
import { classGlyph } from './classes.js';
import { sfx } from './sfx.js';

const BRANCH = {
  damage: { color: '#ffc45a', label: 'Damage' }, crit: { color: '#5fe07a', label: 'Critical' }, gem: { color: '#c48bff', label: 'Gems' },
  attacks: { color: '#63ccff', label: 'Attacks' }, coins: { color: '#ffcf4a', label: 'Coins' }, class: { color: '#ff6a4d', label: 'Class' },
};
const EFFECT_ICON = { damage: 'sword', boss: 'skull', crit: 'clover', critdmg: 'burst', gem: 'gem', attacks: 'swords', coins: 'coin', type: 'sword' };
const UX = 74, UY = 92, NODE_W = 62; // map units to pixels
const minX = Math.min(...NODES.map((n) => n.x)), maxX = Math.max(...NODES.map((n) => n.x));
const maxY = Math.max(...NODES.map((n) => n.y));
const W = (maxX - minX) * UX + NODE_W + 80, H = maxY * UY + NODE_W + 120;
const px = (n) => (n.x - minX) * UX + 40 + NODE_W / 2, py = (n) => n.y * UY + 50 + NODE_W / 2;

export function createTree(api, refresh) {
  let s = null;
  let view = { x: 0, y: 0, k: 1 }, placed = false, visible = [NODES[0]];
  const world = h('div', { class: 'tree-world', style: `width:${W}px;height:${H}px` });
  const vp = h('div', { class: 'tree-vp' }, world);
  const gemsEl = h('b');
  const head = h('div', { class: 'tree-head' },
    h('div', { class: 'tree-title' }, icon('tree', 24), h('h2', null, 'Tech Tree')),
    h('div', { class: 'pill gem' }, icon('gem', 16), gemsEl));
  const legend = h('div', { class: 'tree-legend' }, Object.values(BRANCH).map((b) => h('span', { style: `--c:${b.color}` }, h('i'), b.label)));
  const tools = h('div', { class: 'tree-tools' },
    h('button', { onclick: () => zoomBy(1.2) }, '+'), h('button', { onclick: () => zoomBy(1 / 1.2) }, '-'),
    h('button', { onclick: () => { placed = false; place(true); } }, 'Fit'));
  const hint = h('div', { class: 'tree-hint' }, 'Drag to explore. Tap a node to see it. Gems drop on crits and from every boss you help kill.');
  const el = h('section', { class: 'tree' }, head, legend, vp, tools, hint);

  function apply() { world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.k})`; }
  // Opens zoomed in on the core, where every build starts. The Fit button shows the whole web.
  function place(fit = false) {
    if (placed || !vp.clientWidth) return;
    if (fit) {
      // Fit frames only the nodes uncovered so far.
      const xs = visible.map(px), ys = visible.map(py), pad = NODE_W + 30;
      const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
      const k = Math.min(1, vp.clientWidth / (x1 - x0), vp.clientHeight / (y1 - y0));
      view = { k, x: vp.clientWidth / 2 - ((x0 + x1) / 2) * k, y: vp.clientHeight / 2 - ((y0 + y1) / 2) * k };
    } else {
      const k = 0.72, core = NODES[0];
      view = { k, x: vp.clientWidth / 2 - px(core) * k, y: vp.clientHeight / 2 - py(core) * k };
    }
    placed = true; apply();
  }
  function zoomBy(f, cx = vp.clientWidth / 2, cy = vp.clientHeight / 2) {
    const k = Math.max(0.35, Math.min(2.2, view.k * f));
    view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; apply();
  }
  // drag + pinch with pointer events; a tap still reaches the node
  const pts = new Map(); let start = null, moved = false;
  vp.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false;
    start = { view: { ...view }, pts: new Map(pts) }; });
  vp.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pts.values()], [a0, b0] = [...start.pts.values()];
    if (pts.size === 1 && a0) {
      const dx = a.x - a0.x, dy = a.y - a0.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (moved) { view.x = start.view.x + dx; view.y = start.view.y + dy; apply(); }
    } else if (pts.size === 2 && b0) {
      moved = true;
      const d = Math.hypot(a.x - b.x, a.y - b.y), d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y);
      const r = vp.getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      view = { ...start.view }; zoomBy(d / d0, cx, cy);
    }
  });
  const end = (e) => { pts.delete(e.pointerId); start = { view: { ...view }, pts: new Map(pts) }; };
  vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
  vp.addEventListener('wheel', (e) => { e.preventDefault(); const r = vp.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); }, { passive: false });

  function render(state) {
    s = state;
    const p = s.player; if (!p) return;
    gemsEl.textContent = formatBig(p.gems);
    const tech = p.tech || {}, gems = BigInt(p.gems);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('class', 'tree-lines');
    // Fog: a node stays hidden until you own it or have put at least one rank into a node that leads to it.
    // A new player sees only the core; each purchase uncovers what comes next.
    const seen = (n) => n.req.length === 0 || (tech[n.id] || 0) > 0 || n.req.some((r) => (tech[r] || 0) > 0);
    const shown = NODES.filter(seen);
    visible = shown;
    for (const n of shown) for (const r of n.req) {
      if (!seen(NODE[r])) continue;
      const a = NODE[r], lit = (tech[r] || 0) >= a.ranks;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const x1 = px(a), y1 = py(a), x2 = px(n), y2 = py(n), my = (y1 + y2) / 2;
      path.setAttribute('d', `M${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`);
      path.setAttribute('class', lit ? 'lit' : '');
      path.style.setProperty('--c', BRANCH[n.branch].color);
      svg.append(path);
    }
    const nodes = shown.map((n) => {
      const rank = tech[n.id] || 0, open = techUnlocked(tech, n.id) && (!n.cls || p.cls), max = rank >= n.ranks;
      const afford = open && !max && gems >= BigInt(TIER_COST[n.tier]);
      const cls = `tnode${max ? ' max' : ''}${open ? '' : ' locked'}${afford ? ' afford' : ''}`;
      const glyph = n.effect === 'type' && p.cls ? classGlyph(p.cls, 26) : icon(open ? EFFECT_ICON[n.effect] : 'lock', 26, open ? BRANCH[n.branch].color : '#6c77a8');
      return h('button', { class: cls, style: `left:${px(n) - NODE_W / 2}px;top:${py(n) - NODE_W / 2}px;--c:${BRANCH[n.branch].color}`,
        onclick: () => { if (!moved) openNode(n); } },
        h('span', { class: 'tn-box' }, glyph, h('small', null, `${rank}/${n.ranks}`)),
        h('span', { class: 'tn-name' }, n.name));
    });
    const hidden = NODES.length - shown.length;
    hint.textContent = hidden > 0
      ? `${hidden} more ${hidden === 1 ? 'node is' : 'nodes are'} hidden. Buy a node to uncover what it leads to.`
      : 'The whole web is uncovered. Drag to explore.';
    const clsLabel = !seen(NODE.cls1) ? null : h('div', { class: 'tree-cls', style: `left:${px(NODE.cls1) - 60}px;top:${py(NODE.cls1) - NODE_W / 2 - 52}px` },
      p.cls ? [classGlyph(p.cls, 16), `${CLASSES[p.cls].name} mastery vs ${CLASSES[p.cls].prefers}`] : 'Class mastery: pick a class');
    world.replaceChildren(...[svg, clsLabel, ...nodes].filter(Boolean));
    requestAnimationFrame(() => place());
  }

  function openNode(n) {
    const p = s.player, tech = p.tech || {}, rank = tech[n.id] || 0, eff = EFFECTS[n.effect];
    const open = techUnlocked(tech, n.id), cost = BigInt(TIER_COST[n.tier]), max = rank >= n.ranks;
    const needs = n.req.filter((r) => (tech[r] || 0) < NODE[r].ranks);
    const rows = Array.from({ length: n.ranks }, (_, i) => h('div', { class: `trank${i < rank ? ' done' : i === rank ? ' next' : ''}` },
      h('i', null, i + 1), `+${(i + 1) * eff.per}${eff.label.startsWith('%') ? '' : ' '}${eff.label}${n.effect === 'attacks' && i > 0 ? 's' : ''}`));
    let why = null;
    if (n.cls && !p.cls) why = 'Pick a class first (Profile).';
    else if (!open) why = `Needs: ${needs.map((r) => `${NODE[r].name} ${(tech[r] || 0)}/${NODE[r].ranks}`).join(', ')}`;
    else if (!max && BigInt(p.gems) < cost) why = `Needs ${cost} gem${cost === 1n ? '' : 's'}. You have ${formatBig(p.gems)}.`;
    const close = openSheet(
      h('div', { class: 'tsheet-head', style: `--c:${BRANCH[n.branch].color}` },
        h('span', { class: 'tn-box' }, n.effect === 'type' && p.cls ? classGlyph(p.cls, 28) : icon(EFFECT_ICON[n.effect], 28, BRANCH[n.branch].color)),
        h('div', null, h('h3', null, n.name), h('small', null, `Tier ${n.tier} · ${rank}/${n.ranks} · ${cost} gem${cost === 1n ? '' : 's'} per rank`))),
      n.effect === 'type' && p.cls ? h('p', null, `Counts only against ${CLASSES[p.cls].prefers} bosses. Switching class refunds every gem spent here.`) : null,
      h('div', { class: 'tranks' }, rows),
      why ? h('p', { class: 'why' }, why) : null,
      h('div', { style: 'display:grid;margin-top:10px' },
        h('button', { class: 'btn gold', disabled: max || !!why, onclick: async () => {
          const r = await api.buyTech(n.id);
          if (!r.ok) { toast({ locked: 'Finish the nodes above it first.', not_enough_gems: 'Not enough gems.', no_class: 'Pick a class first.', maxed: 'Already maxed.' }[r.error] || r.error); return; }
          toast(`${n.name} ${r.rank}/${n.ranks}`); sfx.gem(); close(); await refresh();
        } }, max ? 'Maxed' : `Unlock rank ${rank + 1} · ${cost} gem${cost === 1n ? '' : 's'}`)));
  }

  return { el, render };
}
