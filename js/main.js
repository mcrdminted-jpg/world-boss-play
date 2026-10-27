import { h, $, toast } from './dom.js';
import { createApi } from './api.js';
import { createHome } from './home.js';
import { createBoards } from './boards.js';
import { createProfile } from './profile.js';
import { formatBig } from '../shared/combat.js';

const ICONS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  boards: 'M5 21V10M12 21V3M19 21v-7',
  tree: 'M12 3v6M12 9l-6 5M12 9l6 5M6 14v6M18 14v6',
  store: 'M4 7h16l-1 13H5L4 7zM8 7a4 4 0 018 0',
  profile: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
};
const TABS = [['home', 'Home'], ['boards', 'Boards'], ['tree', 'Tech Tree'], ['store', 'Store'], ['profile', 'Profile']];

let api, state = null, tab = 'home', home, boards, profile;

const soon = (title, text) => h('div', { class: 'soon' }, h('div', null, h('h2', null, title), h('p', null, text)));

async function refresh() {
  try {
    state = await api.state();
    paintHeader();
    home.update(state);
    if (tab === 'profile') profile.render(state);
  } catch (e) {
    toast('Cannot reach the server.');
  }
}

function paintHeader() {
  const p = state.player;
  $('#top').replaceChildren(
    h('div', { class: 'who' }, h('b', null, p ? p.name : '...'), h('small', null, api.mode === 'mock' ? 'Dev mode (offline mock)' : 'World Boss')),
    h('div', { class: 'pill' }, h('i', { class: 'coin' }), p ? formatBig(p.coins) : '0'),
    h('div', { class: 'pill' }, h('i', { class: 'gem' }), p ? formatBig(p.gems) : '0'));
}

function paintNav() {
  $('#nav').replaceChildren(...TABS.map(([k, label]) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[k]);
    svg.append(path);
    return h('button', { class: k === tab ? 'on' : '', onclick: () => go(k) }, svg, label);
  }));
}

function go(k) {
  tab = k;
  paintNav();
  const screen = $('#screen');
  if (k === 'home') screen.replaceChildren(home.el);
  else if (k === 'boards') { screen.replaceChildren(boards.el); boards.render(); }
  else if (k === 'profile') { screen.replaceChildren(profile.el); if (state) profile.render(state); }
  else if (k === 'tree') screen.replaceChildren(soon('Tech Tree', 'The branching gem tree and classes arrive in the next update.'));
  else screen.replaceChildren(soon('Store', 'Boosts and gem packs arrive in a later update.'));
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
  home = createHome(api, refresh, () => go('profile'));
  boards = createBoards(api, () => go('profile'));
  profile = createProfile(api, refresh);
  paintNav();
  go('home');
  await refresh();
  hideSplash(started);
  setInterval(refresh, 3000);
  setInterval(() => home.tick(), 1000);
}
boot().catch((e) => { console.error(e); hideSplash(0); toast('Failed to start.'); });
