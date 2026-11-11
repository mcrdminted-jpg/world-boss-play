import { h, toast, openSheet, vibrate, ago, countdown } from './dom.js';
import { formatBig, groupDigits, damagePerHitText, PERK_LABEL, UPGRADES, CLASSES, critMultPct } from '../shared/combat.js';
import { nameTag, openCard } from './players.js';
import { classGlyph, openClassPicker, CLASS_COLOR } from './classes.js';
import { icon } from './icons.js';
import { createSparks, flyIcons } from './fx.js';
import { sfx } from './sfx.js';
import { adsSupported, playRewarded } from './ads.js';
import { TIERS, SLOT_NAME } from '../shared/gear.js';
import { DAILY, dailyText } from '../shared/daily.js';

const CLASS_SPARK = { warrior: ['#ffe6a0', '#ffb347', '#fff'], barbarian: ['#ff7a59', '#ffb347', '#ff3b2f'], rogue: ['#d1a8ff', '#9a5cff', '#fff'], archer: ['#a8ffb8', '#4fdc72', '#fff'], mage: ['#9fd8ff', '#4fa8ff', '#fff'] };

const TILES = ['base_damage', 'crit_chance', 'crit_damage', 'coin_bonus', 'double_strike', 'boss_damage'];
const TILE_ICON = { base_damage: 'sword', crit_chance: 'clover', crit_damage: 'burst', coin_bonus: 'coin', double_strike: 'double', boss_damage: 'skull' };
const TILE_SHORT = { base_damage: 'Damage', crit_chance: 'Crit %', crit_damage: 'Crit Dmg', coin_bonus: 'Coins', double_strike: 'Double', boss_damage: 'Boss Dmg' };
const TILE_HELP = {
  base_damage: 'Every rank multiplies your base damage by 1.25. Fractions are rounded randomly so the average is exact.',
  crit_chance: '+2% critical chance per rank, up to +50% from coins. The tech tree adds up to another 50%. Gems only drop on critical hits.',
  crit_damage: 'Critical hits deal 2x damage. Each rank adds +10% to that multiplier.',
  coin_bonus: '+5% coins from every hit per rank. Coins always come from the damage you actually dealt.',
  double_strike: '+2% chance per rank that an attack strikes twice. The second strike is free and does not use an attack.',
  boss_damage: '+2% damage against numbered World Bosses per rank. Lieutenants are not affected.',
};
const pct = (n) => `${n}%`;
const multText = (p) => `${(p / 100).toFixed(1)}x`;
function tileValue(key, p) {
  if (key === 'base_damage') return `${damagePerHitText(p.damageRank, p.perks.damage)} per hit`;
  if (key === 'crit_chance') return `${pct(p.critChance)} crit`;
  if (key === 'crit_damage') return `${multText(p.critMult)} crit`;
  if (key === 'coin_bonus') return `+${pct(p.coinBonus)} coins`;
  if (key === 'double_strike') return `${pct(p.doubleStrike)} chance`;
  return `+${pct(p.bossDamage)} vs bosses`;
}

// Embers drift up through the arena in the boss type's color.
function embers() {
  return h('div', { class: 'embers', 'aria-hidden': 'true' }, Array.from({ length: 14 }, (_, i) =>
    h('i', { style: `--x:${(i * 7.3 + 4) % 100}%;--d:${(i * 0.71) % 6}s;--t:${5 + (i % 5) * 1.3}s;--dx:${(i % 2 ? 1 : -1) * (8 + (i % 4) * 6)}px` })));
}

function resolveArt(srcs, cb) {
  const [first, ...rest] = srcs;
  if (!first) { cb(null); return; }
  const t = new Image();
  t.onload = () => cb(first);
  t.onerror = () => resolveArt(rest, cb);
  t.src = first;
}

export function createHome(api, refresh, goProfile, goBoards, goGear) {
  let s = null;
  let busy = false;
  let artKey = '';
  let pickerShown = false;

  const nameEl = h('small', { class: 'bossname' }); const labelEl = h('h1');
  const timerEl = h('b');
  const rewardEl = h('span', { class: 'chip gold' });
  const matchEl = h('span', { class: 'chip match', hidden: true });
  const guide = h('div', { class: 'guide', hidden: true });
  const claimBtn = h('button', { class: 'claim-big', hidden: true, onclick: onClaim });
  const art = h('div', { class: 'art' });
  const hpFill = h('b'); const hpGhost = h('i', { class: 'ghost' }); const hpText = h('span'); const hpPct = h('em');
  // Ads on Home: "More attacks?" under the ATTACK row once today's attacks are used, and 2x Damage on the arena under the trophy.
  const moreSub = h('small');
  const adMore = h('button', { class: 'ad-more', hidden: true, onclick: () => watchAd('attack') }, h('b', null, 'More attacks?'), h('span', null, 'Watch ad'), moreSub);
  const adBoost = h('button', { class: 'ad-boost', hidden: true, onclick: () => watchAd('damage') });
  // Live hit stream on the arena, like a stream chat: last 10 hits, newest at the bottom.
  const feed = h('div', { class: 'hit-stream' });
  const dailyBtn = h('button', { class: 'daily-btn', hidden: true, 'aria-label': 'Daily rewards', onclick: () => openDaily() }, icon('chest', 18, '#ffcf5a'), h('span', null, 'Daily'));
  const boardBtn = h('button', { class: 'board-btn', 'aria-label': 'Leaderboard', onclick: () => goBoards && goBoards() }, icon('trophy', 18, '#ffcf5a'));
  let feedTop = null;
  const stage = h('div', { class: 'stage' }, h('div', { class: 'arena' }), h('div', { class: 'aura' }), embers(), art,
    feed, boardBtn, adBoost, dailyBtn, h('div', { class: 'hp' }, hpGhost, hpFill, hpText, hpPct));
  const sparks = createSparks(stage);
  let lastPct = null;
  const leftNum = h('b'); const leftSub = h('small');
  let adBusy = false;
  const attackBtn = h('button', { class: 'attack', onclick: onAttack }, icon('swords', 30, '#ffe7a0'), h('span', null, 'ATTACK'));
  const abilityBtn = h('button', { class: 'ability', onclick: onAbility });
  const tileEls = new Map();
  const tilesEl = h('div', { class: 'tiles' }, TILES.map((key) => {
    const rk = h('small', { class: 'rk' });
    const buy = h('button', { class: 'buy', onclick: (e) => { e.stopPropagation(); buyNow(key); } });
    const el = h('div', { class: 'tile', onclick: () => openTile(key) },
      h('div', { class: 'tile-top' }, h('span', { class: 'tile-ico' }, icon(TILE_ICON[key], 26)),
        h('span', { class: 'tile-txt' }, h('b', { class: 'nm' }, TILE_SHORT[key]), rk)), buy);
    tileEls.set(key, { el, rk, buy });
    return el;
  }));
  const tagsEl = h('div', { class: 'boss-tags' }, matchEl, rewardEl);
  const el = h('section', { class: 'home' },
    h('div', { class: 'boss-head' }, h('div', { class: 'titles' }, labelEl, nameEl, h('div', { class: 'timeline' }, icon('clock', 12), timerEl))),
    tagsEl,
    stage,
    claimBtn,
    h('div', { class: 'actions' },
      h('div', { class: 'left' }, h('small', null, 'Attacks Left'), h('div', { class: 'left-num' }, icon('swords', 18), leftNum), leftSub),
      attackBtn,
      abilityBtn),
    adMore,
    guide,
    h('div', { class: 'panel upgrades' }, h('div', { class: 'panel-head' }, h('b', null, 'Upgrades'), h('small', null, 'Permanent, paid in coins')),
      tilesEl));

  // Boss rig, outside in: .rig takes hits and specials, .bob drifts, the legs stay planted while the
  // upper body breathes and leans on its own clock. Three unrelated periods keep it from looking looped.
  let rig = null;
  function setArt(b) {
    const key = `${b.attemptId}`;
    if (key === artKey) return;
    artKey = key;
    art.className = 'art';
    stage.dataset.type = String(b.type || '').toLowerCase();
    const typeArt = `assets/types/${String(b.type || '').toLowerCase()}.webp`;
    // Painted portraits: this boss's own, else the portrait of the same type (types rotate every 5 bosses), else the cutout.
    const n = b.depth === 0 ? b.mainNumber : b.mainNumber - 1;
    const sameType = `assets/bosses/${String(((Math.max(n, 1) - 1) % 5) + 1).padStart(3, '0')}.webp`;
    resolveArt([b.art, sameType, typeArt], (src) => {
      if (artKey !== key) return;
      stage.classList.toggle('portrait', !!src && src.includes('/bosses/'));
      if (src && src.includes('/bosses/')) {
        // Full painted scene: one image, the face fills the arena; it breathes, drifts and leans toward you.
        rig = h('div', { class: 'rig portrait' }, h('div', { class: 'bob' }, h('img', { src, alt: b.name, draggable: 'false' })));
      } else if (!src) {
        rig = h('div', { class: 'rig' }, h('div', { class: 'bob' }, h('div', { class: 'ph' },
          b.depth === 0 ? b.mainNumber : `${b.mainNumber - 1}${String.fromCharCode(64 + Math.min(b.depth, 26))}`)));
      } else {
        rig = h('div', { class: 'rig' }, h('div', { class: 'shadow' }),
          h('div', { class: 'bob' },
            h('div', { class: 'legs' }, h('img', { src, alt: b.name, draggable: 'false' })),
            h('div', { class: 'torso' }, h('img', { src, alt: '', draggable: 'false' }))));
      }
      art.replaceChildren(rig);
    });
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastHitAt = 0;
  function shake(power = 1) {
    if (reduced) return;
    const d = 4 * power;
    stage.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${d}px,${-d / 2}px)` }, { transform: `translate(${-d}px,${d / 2}px)` },
      { transform: `translate(${d / 2}px,${d / 2}px)` }, { transform: 'translate(0,0)' }], { duration: 260 + 80 * power });
  }
  function ring(color) {
    const r = h('div', { class: 'ring' }); if (color) r.style.borderColor = color;
    art.append(r); setTimeout(() => r.remove(), 800);
  }

  // Idle personality every 6 to 12 seconds unless you just hit it: roar, stomp or lunge.
  const SPECIALS = {
    roar: () => {
      sfx.roar();
      stage.classList.add('roar'); setTimeout(() => stage.classList.remove('roar'), 1100);
      rig.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06) translateY(-2%)', filter: 'brightness(1.35)' },
        { transform: 'scale(1.08) translateY(-2%)', filter: 'brightness(1.5)' }, { transform: 'scale(1)' }], { duration: 1100, easing: 'ease-in-out' });
      setTimeout(() => shake(0.6), 300);
    },
    stomp: () => {
      rig.animate([{ transform: 'translateY(0) scaleY(1)' }, { transform: 'translateY(0) scaleY(.94)', offset: 0.15 },
        { transform: 'translateY(-10%) scaleY(1.04)', offset: 0.5 }, { transform: 'translateY(0) scaleY(.9)', offset: 0.72 },
        { transform: 'translateY(0) scaleY(1)' }], { duration: 950, easing: 'ease-in-out' });
      setTimeout(() => { shake(1.4); ring(); }, 680);
    },
    swipe: () => {
      // the boss lashes out at you: wind-up, then claw marks rake the screen
      rig.animate([{ transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(-4%) rotate(-4deg) scale(.97)', offset: 0.35 },
        { transform: 'translateX(5%) rotate(5deg) scale(1.1)', filter: 'brightness(1.4)', offset: 0.6 }, { transform: 'translateX(0) rotate(0)' }],
      { duration: 900, easing: 'ease-in-out' });
      setTimeout(() => {
        const c = h('div', { class: 'claws' }, h('i'), h('i'), h('i'));
        stage.append(c); setTimeout(() => c.remove(), 900); sfx.swipe();
        stage.classList.add('flash'); setTimeout(() => stage.classList.remove('flash'), 260);
        shake(1.6); vibrate(25);
      }, 540);
    },
    lunge: () => {
      rig.animate([{ transform: 'scale(1) translateY(0)' }, { transform: 'scale(.96) translateY(1%)', offset: 0.3 },
        { transform: 'scale(1.16) translateY(4%)', filter: 'brightness(1.3)', offset: 0.55 }, { transform: 'scale(1) translateY(0)' }],
      { duration: 900, easing: 'ease-in-out' });
      setTimeout(() => shake(0.8), 480);
    },
  };
  const SPECIAL_KEYS = ['roar', 'stomp', 'lunge', 'swipe', 'swipe'];
  function scheduleSpecial() {
    setTimeout(() => {
      if (rig && !reduced && document.visibilityState === 'visible' && Date.now() - lastHitAt > 2500 && el.isConnected) {
        SPECIALS[SPECIAL_KEYS[Math.floor(Math.random() * SPECIAL_KEYS.length)]]();
      }
      scheduleSpecial();
    }, 6000 + Math.random() * 6000);
  }
  scheduleSpecial();

  // Hit reaction for YOUR attacks only. Other players' hits stay in the feed, so the boss is never stuck in a hit loop.
  const FX = ['slash', 'arrow', 'bonk', 'magic'];
  const CLASS_FX = { warrior: 'slash', barbarian: 'bonk', rogue: 'slash', archer: 'arrow', mage: 'magic' };
  function playHit(r) {
    lastHitAt = Date.now();
    const big = r.killed || r.crit;
    const kind = (s?.player?.cls && Math.random() < 0.75) ? CLASS_FX[s.player.cls] : FX[Math.floor(Math.random() * FX.length)];
    const fxX = 30 + Math.random() * 40, fxY = 22 + Math.random() * 36;
    const cols = r.crit ? ['#fff3c4', '#ffd36b', '#ff9a3d'] : (CLASS_SPARK[s?.player?.cls] || ['#ffe6a0', '#ffb347', '#fff']);
    sparks.burst(fxX / 100, fxY / 100 * 0.85, cols, r.killed ? 70 : r.crit ? 36 : 18, r.killed ? 2 : r.crit ? 1.5 : 1);
    const fx = h('div', { class: `fx fx-${kind}${big ? ' big' : ''}`, style: `left:${fxX}%;top:${fxY}%` },
      kind === 'bonk' ? h('span', null, r.crit ? 'CRIT' : 'BONK') : null);
    art.append(fx);
    setTimeout(() => fx.remove(), 700);
    if (big) shake(r.killed ? 2 : 1);
    if (rig && !reduced) {
      const dir = kind === 'arrow' ? 1 : -1;
      rig.animate([
        { transform: 'translateX(0) scale(1)', filter: 'none' },
        { transform: `translateX(${dir * 4}%) scale(${big ? 0.9 : 0.96})`, filter: 'brightness(2.2) saturate(.3)' },
        { transform: `translateX(${-dir * 2}%) scale(1.01)`, filter: 'brightness(1.15) sepia(.6) hue-rotate(-30deg) saturate(3)' },
        { transform: 'translateX(0) scale(1)', filter: 'none' },
      ], { duration: big ? 460 : 280, easing: 'ease-out' });
    }
  }

  function update(state) {
    s = state;
    done = 0; // fresh server count already includes every finished attack
    const b = s.boss, p = s.player;
    nameEl.textContent = b.type ? `${b.name} \u00b7 ${b.type}` : b.name;
    labelEl.textContent = b.label;
    stage.dataset.type = String(b.type || '').toLowerCase();
    rewardEl.hidden = !b.perk;
    if (b.perk) rewardEl.textContent = `Kill: +1% ${PERK_LABEL[b.perk]} forever`;
    const hp = BigInt(b.hp), max = BigInt(b.maxHp);
    const pctHp = max > 0n ? Number((hp * 1000n) / max) / 10 : 0;
    hpFill.style.width = `${pctHp}%`;
    // the pale ghost bar trails the real one, so every chunk of damage is visible
    if (lastPct === null || pctHp > lastPct) hpGhost.style.transition = 'none';
    else hpGhost.style.transition = '';
    hpGhost.style.width = `${pctHp}%`;
    lastPct = pctHp;
    stage.classList.toggle('enraged', pctHp > 0 && pctHp <= 25);
    hpText.textContent = `${groupDigits(hp)} / ${groupDigits(max)} HP`;
    hpPct.textContent = `${pctHp.toFixed(1)}%`;
    if (!busy) setArt(b);
    if (p) {
      leftNum.textContent = `${Math.max(0, p.attacksLeft - queued - (busy ? 1 : 0) - done)}`;
      leftSub.textContent = p.boostLeft > 0 ? `2x Damage: ${p.boostLeft} hit${p.boostLeft === 1 ? '' : 's'}`
        : p.bonusAttacks > 0 ? `${p.attacksMax} daily + ${p.bonusAttacks} bonus` : `of ${p.attacksMax} today`;
      leftSub.classList.toggle('boost-tag', p.boostLeft > 0);
      const live = adsSupported() && !!p.ads;
      adMore.hidden = !(live && p.attacksLeft <= 0 && p.ads.attack.left > 0);
      moreSub.textContent = live ? `${p.ads.attack.left} left today` : '';
      const canBoost = live && p.ads.damage.left > 0;
      adBoost.hidden = !(canBoost || p.boostLeft > 0);
      adBoost.classList.toggle('ready', p.boostLeft > 0);
      adBoost.replaceChildren(h('b', null, '2x'), h('span', null, p.boostLeft > 0 ? `Ready x${p.boostLeft}` : 'Watch ad'));
      adBoost.disabled = adBusy || !canBoost;
      lastDaily = p.daily || null;
      dailyBtn.hidden = !lastDaily;
      dailyBtn.classList.toggle('ready', !!(lastDaily && lastDaily.ready));
      dailyBtn.classList.toggle('low', !adBoost.hidden);
      // Show the calendar by itself once a day, but not during a brand-new player's first minute.
      if (lastDaily && lastDaily.ready && p.totalAttacks > 0 && !document.querySelector('#sheet-root .sheet')) {
        const k = `${lastDaily.claimed}`; let seen = null;
        try { seen = localStorage.getItem('wb-daily-shown'); } catch { /* ignore */ }
        if (seen !== k) { try { localStorage.setItem('wb-daily-shown', k); } catch { /* ignore */ } openDaily(); }
      }
      adMore.disabled = adBusy;
      attackBtn.disabled = p.attacksLeft <= 0;
      const pr = p.pendingRewards;
      claimBtn.hidden = !(pr && pr.count > 0);
      if (!claimBtn.hidden) claimBtn.replaceChildren(h('b', null, pr.count > 1 ? `${pr.count} bosses defeated!` : 'Boss defeated!'),
        h('span', null, `Claim ${formatBig(pr.coins)} coins${pr.gems && pr.gems !== '0' ? ` + ${pr.gems} gems` : ''} + gear`));
      const c = p.cls ? CLASSES[p.cls] : null;
      matchEl.hidden = !(c && c.prefers === b.type);
      matchEl.textContent = c ? `${c.name} vs ${b.type}` : '';
      tagsEl.hidden = matchEl.hidden && rewardEl.hidden;
      paintAbility(p);
      const coins = BigInt(p.coins);
      for (const key of TILES) {
        const x = tileEls.get(key), u = p.upgrades?.[key];
        if (!u) continue;
        x.rk.textContent = `Lv. ${u.rank}${u.max ? ` / ${u.max}` : ''}`;
        if (u.cost === null) { x.buy.replaceChildren('MAX'); x.buy.disabled = true; continue; }
        const cost = BigInt(u.cost);
        x.buy.replaceChildren(icon('coin', 15), formatBig(cost));
        x.buy.disabled = coins < cost;
        x.el.classList.toggle('afford', coins >= cost);
      }
    }
    renderFeed();
    renderGuide();
    tick();
  }

  const AD_OK = { attack: '+1 attack added.', damage: 'Your next attack does 2x damage.' };
  async function watchAd(kind) {
    if (adBusy) return;
    adBusy = true; adMore.disabled = true; adBoost.disabled = true;
    try {
      if (!(await playRewarded())) { toast('Ad closed early, no reward.'); return; }
      const r = await api.adReward(kind);
      if (!r || !r.ok) { toast(r && r.error === 'ad_limit' ? 'Daily ad limit reached. Back tomorrow.' : 'Reward failed. Try again.'); return; }
      toast(AD_OK[kind]); sfx.buy();
    } catch (e) { toast(`No ad right now. ${(e && e.message) || e || ''}`.trim(), 6000); }
    finally { adBusy = false; await refresh(); }
  }

  function paintAbility(p) {
    if (!p.cls) {
      abilityBtn.replaceChildren(h('small', null, 'Daily Ability'), icon('bolt', 22), h('b', null, 'Choose class'));
      abilityBtn.className = 'ability'; return;
    }
    const c = CLASSES[p.cls];
    if (p.abilityLeft > 0) {
      abilityBtn.replaceChildren(h('small', null, c.ability), classGlyph(p.cls, 22), h('b', null, `Active: ${p.abilityLeft} left`));
      abilityBtn.className = `ability live cls-${p.cls}`;
    } else if (p.abilityReady) {
      abilityBtn.replaceChildren(h('small', null, c.ability), classGlyph(p.cls, 22), h('b', null, 'Use now'));
      abilityBtn.className = `ability ready cls-${p.cls}`;
    } else {
      abilityBtn.replaceChildren(h('small', null, c.ability), classGlyph(p.cls, 22), h('b', null, 'Used today'));
      abilityBtn.className = `ability used cls-${p.cls}`;
    }
  }

  async function onAbility() {
    if (!s?.player) return;
    const p = s.player;
    if (!p.cls) { openClassPicker(api, s, refresh); return; }
    if (!p.abilityReady) {
      toast(p.abilityLeft > 0 ? `${CLASSES[p.cls].ability} is active. Keep attacking.` : 'Used today. It resets at midnight Pacific.');
      return;
    }
    const r = await api.useAbility();
    if (!r.ok) { toast(r.error === 'used_today' ? 'Used today. It resets at midnight Pacific.' : `Ability failed: ${r.error}`); return; }
    const c = CLASSES[p.cls];
    toast(`${c.ability}: ${c.desc}`, 3000);
    sfx.ability();
    stage.classList.add('roar'); setTimeout(() => stage.classList.remove('roar'), 1000);
    vibrate([20, 30, 20]);
    await refresh();
  }

  // First-run tips. Each tip shows one time only: the first session it applies, until its step is done or it is tapped.
  // Shown tips are remembered on the device, so they never come back on later visits.
  const TIPS_KEY = 'wb-tips';
  const tipsSeen = new Set((() => { try { return JSON.parse(localStorage.getItem(TIPS_KEY)) || []; } catch { return []; } })());
  const tipsLive = new Set();
  const tipOk = (k) => tipsLive.has(k) || !tipsSeen.has(k);
  function tipShown(k) {
    tipsLive.add(k);
    if (tipsSeen.has(k)) return;
    tipsSeen.add(k);
    try { localStorage.setItem(TIPS_KEY, JSON.stringify([...tipsSeen])); } catch { /* private mode: tips may repeat */ }
  }
  let tipKey = null;
  guide.addEventListener('click', (e) => {
    if (e.target.closest('button') || !tipKey) return;
    tipsLive.delete(tipKey); guide.hidden = true;
  });
  function renderGuide() {
    const p = s.player;
    let msg = null, act = null, key = null;
    if (p) {
      if (p.totalAttacks === 0 && tipOk('attack')) { key = 'attack'; msg = 'Tap ATTACK to hit the boss.'; }
      else if (p.damageRank === 0 && BigInt(p.coins) >= 1n && tipOk('coins')) { key = 'coins'; msg = 'You earn coins equal to the damage you deal. Spend them on Upgrades, starting with Damage.'; }
      else if (p.damageRank >= 1 && p.totalAttacks < 2 && tipOk('again')) { key = 'again'; msg = 'Stronger now. Attack again.'; }
      else if (!p.nameSet && p.totalAttacks > 0 && tipOk('name')) { key = 'name'; msg = 'Pick your player name.'; act = h('button', { class: 'btn', onclick: goProfile }, 'Set name'); }
      else if (!p.cls && p.totalAttacks > 0 && tipOk('class')) {
        key = 'class'; msg = 'Choose your class. Each one excels against one boss type.';
        act = h('button', { class: 'btn gold', onclick: () => openClassPicker(api, s, refresh, true) }, 'Choose');
        if (!pickerShown) { pickerShown = true; openClassPicker(api, s, refresh, true); }
      }
    }
    tipKey = key;
    if (key) tipShown(key);
    guide.hidden = !msg;
    if (msg) guide.replaceChildren(...[h('span', null, msg), act].filter(Boolean));
    tileEls.get('base_damage').el.classList.toggle('pulse', !!(p && p.damageRank === 0 && BigInt(p.coins) >= 1n));
    attackBtn.classList.toggle('pulse', !!(p && p.totalAttacks === 0));
  }

  // Name color = that player's share of THIS boss. Tap a line for their stat card.
  // Each hit stays 30 seconds, fading out over its last 5, then leaves the stream.
  const HIT_TTL = 30000;
  let feedLive = 0;
  const liveHits = (nowMs) => s.feed.slice(0, 10).filter((f) => nowMs - f.at < HIT_TTL);
  function renderFeed() {
    const nowMs = Date.now() + s.skew;
    const rows = liveHits(nowMs).reverse();
    feedLive = rows.length;
    const top = rows.length ? `${rows[rows.length - 1].pid}|${rows[rows.length - 1].at}` : '';
    const fresh = top !== feedTop && top !== '' && feedTop !== null;
    feedTop = top;
    feed.replaceChildren(...rows.map((f, i) => {
      const age = Math.max(0, (nowMs - f.at) / 1000).toFixed(2);
      const isNew = fresh && i === rows.length - 1;
      return h('div', { class: `hit${f.kill ? ' kill' : ''}${f.crit ? ' crit' : ''}`,
        style: `animation: hitfade 30s linear -${age}s forwards${isNew ? ', hitin .28s ease-out' : ''}`, onclick: () => openCard(api, f.pid) },
        nameTag(f.name, null, f.share), h('em', null, `${f.crit ? 'CRIT ' : ''}${formatBig(f.damage)}${f.kill ? ' KILL' : ''}`));
    }));
  }

  function tick() {
    if (!s) return;
    timerEl.textContent = `${countdown(s.boss.endsAt - (Date.now() + s.skew))} left`;
    if (liveHits(Date.now() + s.skew).length !== feedLive) renderFeed();
  }

  function float(text, cls) {
    const f = h('div', { class: `float ${cls || ''}`, style: `left:${18 + Math.random() * 55}%;top:${28 + Math.random() * 30}%` }, text);
    art.append(f);
    setTimeout(() => f.remove(), 1000);
  }

  // Fast taps all count: each tap is queued, the counter drops at once, and the server calls run one at a time.
  let queued = 0, done = 0;
  function onAttack() {
    if (!s?.player) return;
    const free = s.player.attacksLeft - queued - (busy ? 1 : 0) - done;
    if (free <= 0) { toast(busy ? 'Still sending your last attack. One moment.' : 'No attacks left today. They reset at midnight Pacific.'); return; }
    queued += 1;
    leftNum.textContent = `${Math.max(0, free - 1)}`;
    attackBtn.animate([{ transform: 'scale(1)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 140 });
    if (!busy) drain();
  }

  async function drain() {
    busy = true;
    while (queued > 0) {
      queued -= 1;
      const stop = await attackOnce();
      if (stop) { queued = 0; break; }
    }
    busy = false;
    await refresh();
  }

  async function attackOnce() {
    try {
      const r = await api.attack();
      if (!r.ok) {
        toast(r.error === 'no_attacks' ? 'No attacks left today. They reset at midnight Pacific.' : `Attack failed: ${r.error}`);
        return true;
      }
      done += 1;
      playHit(r);
      if (r.crit) sfx.crit(); else sfx.hit();
      if (BigInt(r.coins || 0) > 0n) setTimeout(() => sfx.coin(), 380);
      if (r.gem) setTimeout(() => sfx.gem(), 300);
      float(`${r.crit ? 'CRIT ' : ''}-${formatBig(r.damage)}`, r.killed ? 'kill' : r.crit ? 'crit' : '');
      if (r.double) setTimeout(() => float('DOUBLE STRIKE', 'dbl'), 160);
      if (r.gem) { setTimeout(() => float('+1 gem', 'gem'), 260); flyIcons(art, document.getElementById('gem-pill'), 'gem', 3); }
      if (BigInt(r.coins || 0) > 0n) flyIcons(art, document.getElementById('coin-pill'), 'coin', Math.min(7, 2 + String(r.coins).length));
      vibrate(r.killed ? [30, 40, 60] : r.crit ? [18, 20, 18] : 12);
      if (r.killed) {
        art.classList.add('dead');
        sfx.kill();
        sparks.burst(0.5, 0.5, ['#fff3c4', '#ffd36b', '#ff6a3d', '#ffffff'], 120, 2.6);
        const ban = h('div', { class: 'banner' }, h('b', null, 'DEFEATED'), h('small', null, r.slayer ? 'Killing blow: you' : r.attempt));
        stage.append(ban); setTimeout(() => ban.remove(), 2400);
        flyIcons(art, document.getElementById('coin-pill'), 'coin', 12);
        const perk = r.perk ? ` Permanent +1% ${PERK_LABEL[r.perk]}.` : '';
        toast(r.slayer ? `${r.attempt} defeated. You landed the killing blow!${perk}` : `${r.attempt} defeated.${perk} Next: ${r.next}`, 3600);
        await new Promise((res) => setTimeout(res, 700));
        artKey = ''; // next refresh loads the new boss
        return true; // stop the queue at a kill so leftover taps don't hit the next boss blind
      }
    } catch (e) {
      toast('Connection problem. Try again.');
      return true;
    }
    return false;
  }

  // Daily rewards: a 30-day calendar. One claim per day; missing a day never resets it.
  let lastDaily = null, dailyBusy = false;
  const DAILY_ICON = { attacks: ['swords', '#ffd36b'], boost: ['burst', '#ffb347'], scrap: ['chest', '#cfd6ff'], gems: ['gem', '#c48bff'], item: ['armor', '#5aa9ff'] };
  function openDaily() {
    const d = lastDaily; if (!d) return;
    const done = d.ready ? d.day - 1 : (d.day === 1 ? DAILY.length : d.day - 1); // days already collected this cycle
    const today = d.ready ? d.day : done;
    let close = () => {};
    const btn = h('button', { class: 'btn', disabled: !d.ready, onclick: async () => {
      if (dailyBusy) return; dailyBusy = true; btn.disabled = true;
      try {
        const r = await api.dailyClaim();
        close();
        if (r.ok) {
          sfx.coin();
          toast(`Day ${r.day}: ${r.kind === 'item' && r.item ? (r.item.scrapped ? 'bag full, gear turned into scrap' : `${TIERS[r.item.tier].name} ${SLOT_NAME[r.item.slot]} (see Gear)`) : dailyText(r)}`, 3500);
        } else toast(r.error === 'already_claimed' ? 'Already claimed today.' : 'Could not claim. Try again.');
      } catch (e) { toast('Connection problem. Try again.'); }
      dailyBusy = false;
      await refresh();
    } }, d.ready ? `Claim day ${d.day}: ${dailyText(DAILY[d.day - 1])}` : 'Come back tomorrow');
    close = openSheet(h('h2', null, 'Daily Rewards'),
      h('p', { class: 'muted', style: 'font-size:13px;margin:0 0 8px' }, `Day ${today} of ${DAILY.length}. One reward each day you play. Missing a day never resets it.`),
      h('div', { class: 'daily-grid' }, DAILY.map((r) => h('div', { class: `dday${r.day <= done ? ' got' : ''}${d.ready && r.day === d.day ? ' now' : ''}${r.kind === 'gems' || r.kind === 'item' ? ' big' : ''}` },
        h('small', null, r.day <= done ? 'Done' : `Day ${r.day}`), icon(DAILY_ICON[r.kind][0], 20, DAILY_ICON[r.kind][1]),
        h('b', null, r.kind === 'item' ? 'Rare' : r.kind === 'boost' ? `${r.n} x 2x` : r.kind === 'attacks' ? `+${r.n}` : `${r.n}`)))),
      h('div', { class: 'daily-key' }, [['attacks', 'Attacks'], ['scrap', 'Scrap'], ['boost', '2x damage'], ['gems', 'Gems'], ['item', 'Gear']].map(([k, n]) => h('span', null, icon(DAILY_ICON[k][0], 13, DAILY_ICON[k][1]), n))),
      h('div', { style: 'display:flex;gap:8px;margin-top:12px' }, btn, h('button', { class: 'btn ghost', onclick: () => close() }, 'Close')));
  }

  let claiming = false;
  async function onClaim() {
    if (claiming) return;
    claiming = true; claimBtn.disabled = true;
    try {
      const r = await api.claim();
      if (r.ok && r.claimed) {
        const drops = (r.drops || []).filter(Boolean);
        const got = drops.filter((d) => !d.scrapped), scrapped = drops.length - got.length;
        flyIcons(claimBtn, document.getElementById('coin-pill'), 'coin', 8);
        if (r.gems && r.gems !== '0') flyIcons(claimBtn, document.getElementById('gem-pill'), 'gem', 4);
        sfx.coin();
        let close = () => {};
        close = openSheet(h('h2', null, 'Rewards claimed'),
          h('div', { class: 'kv' }, h('span', null, 'Coins'), h('span', null, `+${formatBig(r.coins)}`)),
          r.gems && r.gems !== '0' ? h('div', { class: 'kv' }, h('span', null, 'Gems'), h('span', null, `+${r.gems}`)) : null,
          got.map((d) => h('div', { class: 'kv' }, h('span', null, 'Gear'), h('span', { class: `gt${d.tier}` }, `${TIERS[d.tier].name} ${SLOT_NAME[d.slot]}`))),
          scrapped ? h('div', { class: 'kv' }, h('span', null, 'Bag full'), h('span', null, `${scrapped} item${scrapped === 1 ? '' : 's'} turned into scrap`)) : null,
          h('div', { style: 'display:flex;gap:8px;margin-top:12px' },
            got.length && goGear ? h('button', { class: 'btn', onclick: () => { close(); goGear(); } }, 'Open Gear') : null,
            h('button', { class: 'btn ghost', onclick: () => close() }, 'Keep fighting')));
      } else if (!r.ok) toast('Could not claim. Try again.');
    } catch (e) { toast('Connection problem. Try again.'); }
    claiming = false; claimBtn.disabled = false;
    await refresh();
  }

  async function buyNow(key) {
    const r = await api.buy(key);
    if (!r.ok) toast(r.error === 'not_enough_coins' ? 'Not enough coins.' : r.error === 'maxed' ? 'Already maxed.' : 'Not available.');
    else { toast(`${UPGRADES[key].name} rank ${r.rank}`); sfx.buy(); }
    await refresh();
  }

  function openTile(key) {
    if (!s?.player) return;
    const p = s.player, u = p.upgrades[key];
    const cost = u.cost === null ? null : BigInt(u.cost);
    const close = openSheet(
      h('h3', null, UPGRADES[key].name),
      h('p', null, TILE_HELP[key]),
      h('div', { class: 'kv' }, h('span', null, 'Rank'), h('span', null, u.max ? `${u.rank} / ${u.max}` : u.rank)),
      h('div', { class: 'kv' }, h('span', null, 'Now'), h('span', null, tileValue(key, p))),
      key === 'crit_damage' ? h('div', { class: 'kv' }, h('span', null, 'Next rank'), h('span', null, `${multText(critMultPct(u.rank + 1))} crit`)) : null,
      h('div', { class: 'kv' }, h('span', null, 'Next cost'), h('span', null, cost === null ? 'Maxed' : `${groupDigits(cost)} coins`)),
      h('div', { class: 'kv' }, h('span', null, 'You have'), h('span', null, `${groupDigits(BigInt(p.coins))} coins`)),
      h('div', { style: 'margin-top:12px;display:grid' },
        h('button', { class: 'btn gold', disabled: cost === null || BigInt(p.coins) < cost, onclick: async () => { await buyNow(key); close(); } }, 'Buy rank')));
  }

  return { el, update, tick };
}
