// Store laid out like the mockup. Rewarded ads (Ad Boosts) are live in the app build; on the web they show "Soon".
// Gem packs and gem-bought items need in-app purchase and are still marked "Soon".
import { h, toast } from './dom.js';
import { formatBig } from '../shared/combat.js';
import { icon } from './icons.js';
import { adsSupported, playRewarded } from './ads.js';
import { sfx } from './sfx.js';

const PACKS = [['100', '$0.99', ''], ['550', '$4.99', '10% bonus'], ['1,200', '$9.99', '20% bonus'], ['2,800', '$19.99', '30% bonus'], ['7,500', '$49.99', '50% bonus'], ['16,000', '$99.99', '60% bonus']];
const ADS = [['attack', '+1 Attack', 'swords'], ['damage', '2x Damage', 'burst'], ['gems', 'Gems', 'gem']];
const AD_DONE = { attack: '+1 attack added.', damage: 'Your next attack does 2x damage.', gems: 'Gem added.' };
const BOOSTS = [['Lucky Boost', 'clover', '+50% gem drops', '1 hour'], ['Coin Boost', 'coin', '+100% coins', '1 hour'], ['Crit Boost', 'burst', '+100% crit damage', '1 hour']];

// Inside the App Store build, unfinished purchase/ad tiles are hidden (Apple rejects placeholder features).
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export function createStore(api, refresh, goTree) {
  const el = h('div', { class: 'scroll store' });
  const LIVE_ADS = adsSupported();
  let tab = NATIVE ? (LIVE_ADS ? 'boosts' : 'earn') : 'gems';
  let watching = false;
  function render(s) {
    const p = s.player; if (!p) return;
    const soon = () => toast('Opens with the App Store release.');
    const tabList = NATIVE ? (LIVE_ADS ? [['boosts', 'Ad Boosts'], ['earn', 'Earn free']] : null) : [['gems', 'Gems'], ['boosts', 'Boosts'], ['earn', 'Earn free']];
    const tabs = !tabList ? null : h('div', { class: 'seg' }, tabList.map(([k, l]) =>
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
          h('div', { class: 'boosts' }, ADS.map(([kind, n, ic]) => {
            const a = (p.ads && p.ads[kind]) || { left: 0, max: 0 };
            const used = a.max - a.left;
            if (!LIVE_ADS) {
              return h('button', { class: 'boost ad', onclick: soon },
                h('b', null, n), icon(ic, 30), h('small', null, `0 / ${a.max || '?'} today`), h('span', { class: 'watch' }, 'Watch ad'), h('em', { class: 'soon-tag' }, 'Soon'));
            }
            const out = a.left <= 0;
            return h('button', { class: `boost ad${out ? ' done' : ''}`, disabled: out || watching, onclick: () => watch(kind, s) },
              h('b', null, n), icon(ic, 30), h('small', null, `${used} / ${a.max} today`),
              h('span', { class: 'watch' }, out ? 'Back tomorrow' : watching ? 'Loading...' : 'Watch ad'));
          })),
          LIVE_ADS && p.boostLeft > 0 ? h('p', { class: 'fine' }, `2x Damage ready on your next ${p.boostLeft === 1 ? 'attack' : `${p.boostLeft} attacks`}.`) : null),
        NATIVE ? null : h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Special Items'), h('small', null, 'Temporary, gems')),
          h('div', { class: 'boosts' }, BOOSTS.map(([n, ic, eff, dur]) => h('button', { class: 'boost', onclick: soon },
            h('b', null, n), icon(ic, 30), h('small', null, eff), h('small', null, dur), h('span', { class: 'price' }, icon('gem', 13), '400'), h('em', { class: 'soon-tag' }, 'Soon'))))),
        NATIVE ? null : h('p', { class: 'fine' }, 'No paid item sells raw damage, unlimited attacks or a killing blow. Everything that makes you stronger can be earned by playing.'),
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
    el.replaceChildren(h('div', { class: 'store-head' }, icon('chest', 30), h('h2', null, 'Store')), tabs, ...[body].flat().filter(Boolean));
  }

  async function watch(kind, s) {
    if (watching) return;
    watching = true; render(s);
    try {
      const ok = await playRewarded();
      if (!ok) { toast('Ad closed early, no reward.'); return; }
      const r = await api.adReward(kind);
      if (!r || !r.ok) { toast(r && r.error === 'ad_limit' ? 'Daily limit reached. Back tomorrow.' : 'Reward failed. Try again.'); return; }
      toast(AD_DONE[kind], 2500);
      try { sfx.buy(); } catch { /* ignore */ }
    } catch (e) {
      toast('No ad available right now. Try again in a minute.');
    } finally {
      watching = false;
      await refresh();
    }
  }
  return { el, render };
}
