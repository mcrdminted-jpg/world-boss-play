import { h } from './dom.js';
import { formatBig } from '../shared/combat.js';
import { nameTag, openCard } from './players.js';

const SCOPES = [['local', 'Local'], ['state', 'State'], ['country', 'Country'], ['world', 'World']];
const PERIODS = [['current', 'This boss'], ['all', 'All time']];

export function createBoards(api, goProfile) {
  let scope = 'world', period = 'current';
  const body = h('div', { class: 'lb card' });
  const scopeSeg = h('div', { class: 'seg' });
  const periodSeg = h('div', { class: 'seg' });
  const el = h('div', { class: 'scroll' }, scopeSeg, periodSeg, body);

  function seg(root, items, cur, set) {
    root.replaceChildren(...items.map(([k, label]) => h('button', { class: k === cur ? 'on' : '', onclick: () => { set(k); render(); } }, label)));
  }

  const row = (x, me) => h('div', { class: `row${me ? ' me' : ''}`, onclick: () => openCard(api, x.pid) },
    h('span', { class: 'n' }, x.rank), h('span', { class: 'nm' }, nameTag(x.name, x.badge, x.share)), h('span', { class: 'd' }, formatBig(x.damage)));

  async function render() {
    seg(scopeSeg, SCOPES, scope, (k) => { scope = k; });
    seg(periodSeg, PERIODS, period, (k) => { period = k; });
    body.replaceChildren(h('div', { class: 'empty' }, 'Loading...'));
    try {
      const r = await api.leaderboard(scope, period);
      const rows = r.top.map((x) => row(x, x.me));
      if (r.me && r.me.rank > r.top.length) rows.push(row(r.me, true));
      if (!rows.length) {
        const need = scope === 'local' ? 'Add your ZIP code in Profile to see local damage.' : scope === 'state' ? 'Pick your state in Profile to see state damage.' : 'No damage dealt here yet.';
        body.replaceChildren(h('div', { class: 'empty' }, need), (scope === 'local' || scope === 'state') ? h('div', { style: 'text-align:center' }, h('button', { class: 'btn', onclick: goProfile }, 'Open Profile')) : null);
      } else body.replaceChildren(...rows);
    } catch { body.replaceChildren(h('div', { class: 'empty' }, 'Could not load the leaderboard.')); }
  }

  return { el, render };
}
