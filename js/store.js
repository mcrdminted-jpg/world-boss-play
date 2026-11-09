// Store laid out like the mockup. Purchases and rewarded ads need the App Store build (in-app purchase and an
// ad network), so those tiles are shown but marked "Soon". The "Earn gems" panel is real today.
import { h, toast } from './dom.js';
import { formatBig } from '../shared/combat.js';
import { icon } from './icons.js';

const PACKS = [['100', '$0.99', ''], ['550', '$4.99', '10% bonus'], ['1,200', '$9.99', '20% bonus'], ['2,800', '$19.99', '30% bonus'], ['7,500', '$49.99', '50% bonus'], ['16,000', '$99.99', '60% bonus']];
const ADS = [['+1 Attack', 'swords', '0 / 5 today'], ['2x Damage', 'burst', '0 / 10 today'], ['Gems', 'gem', '0 / 5 today']];
const BOOSTS = [['Lucky Boost', 'clover', '+50% gem drops', '1 hour'], ['Coin Boost', 'coin', '+100% coins', '1 hour'], ['Crit Boost', 'burst', '+100% crit damage', '1 hour']];

// Inside the App Store build, unfinished purchase/ad tiles are hidden (Apple rejects placeholder features).
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export function createStore(api, refresh, goTree) {
  const el = h('div', { class: 'scroll store' });
  let tab = NATIVE ? 'earn' : 'gems';
  function render(s) {
    const p = s.player; if (!p) return;
    const soon = () => toast('Opens with the App Store release.');
    const tabs = NATIVE ? null : h('div', { class: 'seg' }, [['gems', 'Gems'], ['boosts', 'Boosts'], ['earn', 'Earn free']].map(([k, l]) =>
      h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; render(s); } }, l)));
    let body;
    if (tab === 'gems') {
      body = h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Gem Packs')),
        h('div', { class: 'packs' }, PACKS.map(([n, price, bonus], i) => h('button', { class: 'pack', onclick: soon },
          h('span', { class: 'pack-n' }, `${n} Gems`),
          h('span', { class: 'pack-ico', style: `--s:${0.8 + i * 0.12}` }, icon(i < 2 ? 'gem' : 'chest', 34 + i * 4, i < 2 ? '#c48bff' : '#ffb347')),
          bonus ? h('span', { class: 'pack-bonus' }, bonus) : null,
          h('span', { class: 'pack-price' }, price), h('em', { class: 'soon-tag' }, 'Soon')))));
    } else if (tab === 'boosts') {
      body = [
        h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Ad Boosts'), h('small', null, 'Daily')),
          h('div', { class: 'boosts' }, ADS.map(([n, ic, cnt]) => h('button', { class: 'boost ad', onclick: soon },
            h('b', null, n), icon(ic, 30), h('small', null, cnt), h('span', { class: 'watch' }, 'Watch ad'), h('em', { class: 'soon-tag' }, 'Soon'))))),
        h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Special Items'), h('small', null, 'Temporary, gems')),
          h('div', { class: 'boosts' }, BOOSTS.map(([n, ic, eff, dur]) => h('button', { class: 'boost', onclick: soon },
            h('b', null, n), icon(ic, 30), h('small', null, eff), h('small', null, dur), h('span', { class: 'price' }, icon('gem', 13), '400'), h('em', { class: 'soon-tag' }, 'Soon'))))),
        h('p', { class: 'fine' }, 'No paid item sells raw damage, unlimited attacks or a killing blow. Everything that makes you stronger can be earned by playing.'),
      ];
    } else {
      const pr = p.pendingRewards || {};
      body = h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Earn gems free'), h('small', null, 'Live now')),
        h('div', { class: 'earn' },
          h('div', { class: 'earn-row' }, icon('gem', 26), h('div', null, h('b', null, 'Critical hits'), h('small', null, `Every crit has a ${p.gemChance}% chance to drop a gem. Raise it in the Tech Tree.`))),
          h('div', { class: 'earn-row' }, icon('skull', 26), h('div', null, h('b', null, 'Help kill bosses'), h('small', null, '2 gems for every World Boss you hit before it falls, 1 for each Lieutenant.'))),
          h('div', { class: 'earn-row' }, icon('trophy', 26), h('div', null, h('b', null, 'Pending rewards'), h('small', null, `${pr.count || 0} waiting: ${formatBig(pr.coins || '0')} coins, ${formatBig(pr.gems || '0')} gems. Claim on Home.`))),
          h('button', { class: 'btn', onclick: goTree }, 'Spend gems in the Tech Tree')));
    }
    el.replaceChildren(h('div', { class: 'store-head' }, icon('chest', 30), h('h2', null, 'Store')), tabs, ...[body].flat());
  }
  return { el, render };
}
