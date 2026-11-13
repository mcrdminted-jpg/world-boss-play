// Store laid out like the mockup. Rewarded ads (Ad Boosts) are live in the app build; on the web they show "Soon".
// Gem packs and gem-bought items need in-app purchase and are still marked "Soon".
import { h, toast } from './dom.js';
import { formatBig } from '../shared/combat.js';
import { icon } from './icons.js';
import { adsSupported, playRewarded } from './ads.js';
import { GEM_PACKS, iapSupported, loadPrices, buyGems, recoverPurchases } from './iap.js';
import { sfx } from './sfx.js';

const AD_DONE = { attack: '+1 attack added.', damage: 'Your next attack does 2x damage.', gems: 'Gem added.' };
const BOOSTS = [['Lucky Boost', 'clover', '+50% gem drops', '1 hour'], ['Coin Boost', 'coin', '+100% coins', '1 hour'], ['Crit Boost', 'burst', '+100% crit damage', '1 hour']];

// Inside the App Store build, unfinished purchase/ad tiles are hidden (Apple rejects placeholder features).
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export function createStore(api, refresh, goTree) {
  const el = h('div', { class: 'scroll store' });
  const LIVE_ADS = adsSupported();
  let tab = NATIVE ? 'earn' : 'gems';
  let watching = false;
  const CAN_BUY = iapSupported();
  let prices = {}, buying = false, last = null;
  if (CAN_BUY) {
    loadPrices().then((p) => { prices = p; if (last) render(last); });
    recoverPurchases(api).then((n) => { if (n > 0) { toast(`${n} gem${n === 1 ? '' : 's'} from an earlier purchase added.`, 3000); refresh(); } });
  }
  const BUY_ERR = { pending: 'Purchase is waiting for approval. Gems arrive when it clears.', not_your_purchase: 'That purchase belongs to another account.',
    refunded: 'That purchase was refunded.', apple_key_not_configured: 'Purchases are not switched on yet.', google_key_not_configured: 'Purchases are not switched on yet.',
    google_permission_missing: 'Purchases are not switched on yet.', google_key_rejected: 'Purchases are not switched on yet.', verify_failed: 'Paid, but the server could not be reached. Your gems will be added next time you open the Store.' };
  async function buy(pack, s) {
    if (buying) return;
    buying = true; render(s);
    try {
      const r = await buyGems(api, pack.id);
      if (r && r.ok) { toast(`+${r.gems} gem${r.gems === 1 ? '' : 's'}. Thank you!`, 2500); try { sfx.buy(); } catch { /* ignore */ } }
      else if (r && r.error !== 'cancelled') toast(BUY_ERR[r.error] || `Purchase failed: ${r.error}`, 6000);
    } finally { buying = false; await refresh(); }
  }
  function gemPanel(s) {
    return h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Gem Packs'), h('small', null, 'Spend gems in the Tech Tree')),
      h('div', { class: 'packs four' }, GEM_PACKS.map((pk, i) => h('button', { class: 'pack', disabled: CAN_BUY && buying, onclick: () => (CAN_BUY ? buy(pk, s) : toast('Gem packs are sold in the phone app.')) },
        pk.tag ? h('span', { class: 'pack-tag' }, pk.tag) : null,
        h('span', { class: 'pack-n' }, `${pk.gems} Gem${pk.gems === 1 ? '' : 's'}`),
        h('span', { class: 'pack-ico', style: `--s:${0.8 + i * 0.1}` }, icon('gem', 30 + i * 4, '#c48bff')),
        h('span', { class: 'pack-price' }, CAN_BUY && buying ? '...' : (prices[pk.id] || pk.price)),
        CAN_BUY ? null : h('em', { class: 'soon-tag' }, 'App only')))),
      CAN_BUY ? h('p', { class: 'fine' }, 'One-time purchases. Gems are added to this account right away.') : null);
  }
  function render(s) {
    const p = s.player; if (!p) return;
    last = s;
    const soon = () => toast('Opens with the App Store release.');
    const tabList = NATIVE ? null : [['gems', 'Gems'], ['boosts', 'Boosts'], ['earn', 'Earn free']];
    const tabs = !tabList ? null : h('div', { class: 'seg' }, tabList.map(([k, l]) =>
      h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; render(s); } }, l)));
    let body;
    if (tab === 'gems') {
      body = gemPanel(s);
    } else if (tab === 'boosts') {
      body = [
        NATIVE ? null : h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Special Items'), h('small', null, 'Temporary, gems')),
          h('div', { class: 'boosts' }, BOOSTS.map(([n, ic, eff, dur]) => h('button', { class: 'boost', onclick: soon },
            h('b', null, n), icon(ic, 30), h('small', null, eff), h('small', null, dur), h('span', { class: 'price' }, icon('gem', 13), '400'), h('em', { class: 'soon-tag' }, 'Soon'))))),
        NATIVE ? null : h('p', { class: 'fine' }, 'No paid item sells raw damage, unlimited attacks or a killing blow. Everything that makes you stronger can be earned by playing.'),
      ];
    } else {
      const pr = p.pendingRewards || {};
      body = h('div', { class: 'panel store-panel' }, h('div', { class: 'panel-head' }, h('b', null, 'Earn gems free'), h('small', null, 'Live now')),
        h('div', { class: 'earn' },
          gemAdRow(p, s),
          h('div', { class: 'earn-row' }, icon('gem', 26), h('div', null, h('b', null, 'Critical hits'), h('small', null, `Every crit has a ${p.gemChance}% chance to drop a gem. Raise it in the Tech Tree.`))),
          h('div', { class: 'earn-row' }, icon('skull', 26), h('div', null, h('b', null, 'Help kill bosses'), h('small', null, 'Every fighter gets gems when a boss falls. Top damage gets the most: up to 10 gems for #1 on a World Boss.'))),
          h('div', { class: 'earn-row' }, icon('trophy', 26), h('div', null, h('b', null, 'Pending rewards'), h('small', null, `${pr.count || 0} waiting: ${formatBig(pr.coins || '0')} coins, ${formatBig(pr.gems || '0')} gems. Claim on Home.`))),
          h('button', { class: 'btn', onclick: goTree }, 'Spend gems in the Tech Tree')));
      if (CAN_BUY) body = [gemPanel(s), body];
    }
    el.replaceChildren(...[h('div', { class: 'store-head' }, icon('chest', 30), h('h2', null, 'Store')), tabs, body].flat().filter(Boolean));
  }

  // The only ad in the Store: a free gem. +1 Attack and 2x Damage ads live on the Home screen.
  function gemAdRow(p, s) {
    const a = p.ads && p.ads.gems;
    if (!LIVE_ADS || !a) return null;
    const out = a.left <= 0;
    return h('div', { class: 'earn-row ad-row' }, icon('gem', 26),
      h('div', null, h('b', null, `Watch an ad: +${a.each} gem`), h('small', null, `${a.max - a.left} of ${a.max} watched today.`)),
      h('button', { class: 'btn gold', disabled: out || watching, onclick: () => watch('gems', s) }, out ? 'Tomorrow' : watching ? 'Loading...' : 'Watch ad'));
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
      toast(`No ad right now. ${(e && e.message) || e || ''}`.trim(), 6000);
    } finally {
      watching = false;
      await refresh();
    }
  }
  return { el, render };
}
