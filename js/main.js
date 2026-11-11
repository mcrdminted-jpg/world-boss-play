import { h, $, toast } from './dom.js';
import { createApi } from './api.js';
import { createHome } from './home.js';
import { createBoards } from './boards.js';
import { createProfile } from './profile.js';
import { createTree } from './tree.js';
import { createStore } from './store.js';
import { createGearScreen } from './gear.js';
import { formatBig, CLASSES } from '../shared/combat.js';
import { classGlyph, CLASS_COLOR } from './classes.js';
import { icon } from './icons.js';
import { countTo } from './fx.js';

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  boards: 'M5 21V10M12 21V3M19 21v-7',
  tree: 'M12 3v6M12 9l-6 5M12 9l6 5M6 14v6M18 14v6',
  store: 'M4 7h16l-1 13H5L4 7zM8 7a4 4 0 018 0',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
};
const TABS = [['home', 'Home'], ['tree', 'Tech Tree'], ['gear', 'Gear'], ['store', 'Store'], ['profile', 'Profile']]; // spec: four tabs; Leaderboard opens from Home and Profile

const coinPill = h('div', { class: 'pill', id: 'coin-pill' }, icon('coin', 18), h('span'));
const gemPill = h('div', { class: 'pill gem', id: 'gem-pill' }, icon('gem', 18), h('span'));
const shown = { coins: null, gems: null };
function setPill(el, key, v) {
  const span = el.lastChild, now = Number(v);
  // count up when the change is small enough to animate exactly; big numbers just snap to the formatted value
  if (shown[key] !== null && Number.isSafeInteger(now) && now > shown[key] && now - shown[key] < 1e6) {
    countTo(span, shown[key], now, (x) => formatBig(BigInt(Math.round(x))), 600);
  } else span.textContent = formatBig(v);
  shown[key] = Number.isSafeInteger(now) ? now : null;
}
const missingArt = new Set(); // art not delivered yet: stop re-requesting it every refresh
let api, state = null, tab = 'home', home, boards, profile, tree, store, gear;

const soon = (title, text) => h('div', { class: 'soon' }, h('div', null, h('h2', null, title), h('p', null, text)));

async function refresh() {
  try {
    state = await api.state();
    paintHeader();
    home.update(state);
    if (tab === 'profile') profile.render(state);
    if (tab === 'tree') tree.render(state);
    if (tab === 'store') store.render(state);
    if (tab === 'gear') gear.render(state);
  } catch (e) {
    toast('Cannot reach the server.');
  }
}

function paintHeader() {
  const p = state.player;
  const cls = p && p.cls;
  const av = h('button', { class: 'avatar', style: `--c:${CLASS_COLOR[cls] || '#6d7fd6'}`, onclick: () => go('profile') },
    missingArt.has(cls ? `assets/classes/${cls}.webp` : 'assets/ui/avatar.webp') ? null
      : h('img', { src: cls ? `assets/classes/${cls}.webp` : 'assets/ui/avatar.webp', alt: '', onerror: (e) => { missingArt.add(e.target.getAttribute('src')); e.target.remove(); } }),
    cls ? classGlyph(cls, 22) : icon('hood', 22));
  $('#top').replaceChildren(av,
    h('div', { class: 'who' }, h('b', null, p ? p.name : '...'),
      h('small', { class: 'clsline' }, cls ? CLASSES[cls].name : (api.mode === 'mock' ? 'Dev mode (offline mock)' : 'No class yet'))),
    coinPill, gemPill);
  setPill(coinPill, 'coins', p ? p.coins : '0');
  setPill(gemPill, 'gems', p ? p.gems : '0');
}

function paintNav() {
  const NAV_ICON = { home: 'home', tree: 'tree', gear: 'armor', store: 'chest', profile: 'person' };
  $('#nav').replaceChildren(...TABS.map(([k, label]) =>
    h('button', { class: k === tab ? 'on' : '', onclick: () => go(k) }, icon(NAV_ICON[k], 24, k === tab ? null : '#8a95c4'), label)));
}

function go(k) {
  tab = k;
  paintNav();
  const screen = $('#screen');
  if (k === 'home') screen.replaceChildren(home.el);
  else if (k === 'boards') { screen.replaceChildren(boards.el); boards.render(); }
  else if (k === 'profile') { screen.replaceChildren(profile.el); if (state) profile.render(state); }
  else if (k === 'tree') { screen.replaceChildren(tree.el); if (state) tree.render(state); }
  else if (k === 'store') { screen.replaceChildren(store.el); if (state) store.render(state); }
  else if (k === 'gear') { screen.replaceChildren(gear.el); if (state) gear.render(state); }
}

// Atlas Forever Studios splash: at least 1.6 s, and until the first game state has loaded.
function hideSplash(started) {
  const el = document.getElementById('studio-splash');
  if (!el) return;
  setTimeout(() => { el.classList.add('done'); setTimeout(() => el.remove(), 600); }, Math.max(0, 1600 - (Date.now() - started)));
}

async function boot() {
  const started = Date.now();
  api = await createApi();
  home = createHome(api, refresh, () => go('profile'), () => go('boards'), () => go('gear'));
  boards = createBoards(api, () => go('profile'));
  profile = createProfile(api, refresh, () => go('boards'));
  tree = createTree(api, refresh);
  store = createStore(api, refresh, () => go('tree'));
  gear = createGearScreen(api, refresh);
  paintNav();
  go('home');
  await refresh();
  hideSplash(started);
  setInterval(refresh, 3000);
  setInterval(() => home.tick(), 1000);
}
boot().catch((e) => { console.error(e); hideSplash(0); toast('Failed to start.'); });
