import { h, toast, openSheet, vibrate, ago, countdown } from './dom.js';
import { formatBig, groupDigits, damagePerHitText, PERK_LABEL, UPGRADES, CLASSES, critMultPct } from '../shared/combat.js';
import { nameTag, openCard } from './players.js';
import { classGlyph, openClassPicker, CLASS_COLOR } from './classes.js';
import { icon } from './icons.js';
import { createSparks, flyIcons } from './fx.js';
import { sfx } from './sfx.js';
import { adsSupported, playRewarded } from './ads.js';

const CLASS_SPARK = { warrior: ['#ffe6a0', '#ffb347', '#fff'], barbarian: ['#ff7a59', '#ffb347', '#ff3b2f'], rogue: ['#d1a8ff', '#9a5cff', '#fff'], archer: ['#a8ffb8', '#4fdc72', '#fff'], mage: ['#9fd8ff', '#4fa8ff', '#fff'] };

const TILES = ['base_damage', 'crit_chance', 'crit_damage', 'coin_bonus', 'double_strike', 'boss_damage'];
const TILE_ICON = { base_damage: 'sword', crit_chance: 'clover', crit_damage: 'burst', coin_bonus: 'coin', double_strike: 'double', boss_damage: 'skull' };
const TILE_SHORT = { base_damage: 'Damage', crit_chance: 'Crit Chance', crit_damage: 'Crit Damage', coin_bonus: 'Coin Bonus', double_strike: 'Double Hit', boss_damage: 'Boss Damage' };
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

export function createHome(api, refresh, goProfile, goBoards) {
  let s = null;
  let busy = false;
  let artKey = '';
  let pickerShown = false;

  const nameEl = h('small', { class: 'bossname' }); const labelEl = h('h1');
  const timerEl = h('b');
  const typeEl = h('span', { class: 'chip type' }); const rewardEl = h('span', { class: 'chip gold' });
  const matchEl = h('span', { class: 'chip match', hidden: true });
  const statsEl = h('div', { class: 'stats' });
  const guide = h('div', { class: 'guide', hidden: true });
  const claimBtn = h('button', { class: 'claim', hidden: true, onclick: onClaim });
  const art = h('div', { class: 'art' });
  const hpFill = h('b'); const hpGhost = h('i', { class: 'ghost' }); const hpText = h('span'); const hpPct = h('em');
  const stage = h('div', { class: 'stage' }, h('div', { class: 'arena' }), h('div', { class: 'aura' }), embers(), art,
    h('div', { class: 'hp' }, hpGhost, hpFill, hpText, hpPct));
  const sparks = createSparks(stage);
  let lastPct = null;
  const leftNum = h('b'); const leftSub = h('small');
  let adBusy = false;
  const adPlus = h('button', { class: 'ad-plus', hidden: true, onclick: onAdPlus }, 'Watch ad: +1');
  const attackBtn = h('button', { class: 'attack', onclick: onAttack }, icon('swords', 30, '#ffe7a0'), h('span', null, 'ATTACK'));
  const abilityBtn = h('button', { class: 'ability', onclick: onAbility });
  const feed = h('div', { class: 'feed-rows' });
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
  const el = h('section', { class: 'home' },
    h('div', { class: 'boss-head' }, h('div', { class: 'titles' }, labelEl, nameEl), h('div', { class: 'timer' }, h('small', null, 'Time Left'), timerEl)),
    h('div', { class: 'boss-tags' }, typeEl, matchEl, rewardEl, claimBtn),
    stage,
    h('div', { class: 'actions' },
      h('div', { class: 'left' }, h('small', null, 'Attacks Left'), h('div', { class: 'left-num' }, icon('swords', 18), leftNum), leftSub, adPlus),
      attackBtn,
      abilityBtn),
    guide,
    h('div', { class: 'panel feed' }, h('div', { class: 'panel-head' }, h('b', null, 'Recent Attacks'),
      h('button', { class: 'link', onclick: () => goBoards && goBoards() }, icon('trophy', 14), 'Leaderboard')), feed),
    h('div', { class: 'panel upgrades' }, h('div', { class: 'panel-head' }, h('b', null, 'Coin Upgrades'), h('small', null, 'Permanent')),
      tilesEl, statsEl));

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
    nameEl.textContent = b.name;
    labelEl.textContent = b.label;
    stage.dataset.type = String(b.type || '').toLowerCase();
    typeEl.textContent = b.type;
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
      adPlus.hidden = !(adsSupported() && p.attacksLeft <= 0 && p.ads && p.ads.attack && p.ads.attack.left > 0);
      leftSub.hidden = !adPlus.hidden;
      adPlus.disabled = adBusy;
      attackBtn.disabled = p.attacksLeft <= 0;
      const pr = p.pendingRewards;
      claimBtn.hidden = !(pr && pr.count > 0);
      if (!claimBtn.hidden) claimBtn.textContent = `Claim ${formatBig(pr.coins)} coins${pr.gems && pr.gems !== '0' ? ` + ${pr.gems} gems` : ''}`;
      const c = p.cls ? CLASSES[p.cls] : null;
      matchEl.hidden = !(c && c.prefers === b.type);
      matchEl.textContent = c ? `${c.name} vs ${b.type}` : '';
      const stat = (ic, label, v) => h('div', { class: 'stat' }, icon(ic, 18), h('span', null, h('small', null, label), h('b', null, v)));
      statsEl.replaceChildren(
        stat('clover', 'Crit Chance', pct(p.critChance)),
        stat('burst', 'Crit Damage', pct(p.critMult)),
        stat('coin', 'Coin Bonus', `+${pct(p.coinBonus)}`),
        stat('gem', 'Gem Chance', pct(p.gemChance)));
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

  async function onAdPlus() {
    if (adBusy) return;
    adBusy = true; adPlus.disabled = true; adPlus.textContent = 'Loading...';
    try {
      if (!(await playRewarded())) { toast('Ad closed early, no reward.'); return; }
      const r = await api.adReward('attack');
      if (!r || !r.ok) { toast(r && r.error === 'ad_limit' ? 'Daily ad limit reached. Back tomorrow.' : 'Reward failed. Try again.'); return; }
      toast('+1 attack added.'); sfx.buy();
    } catch { toast('No ad available right now. Try again in a minute.'); }
    finally { adBusy = false; adPlus.textContent = 'Watch ad: +1'; await refresh(); }
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

  // First-run demo, driven by player state, so it survives reloads with no extra storage.
  function renderGuide() {
    const p = s.player;
    let msg = null, act = null;
    if (p) {
      if (p.totalAttacks === 0) msg = 'Tap ATTACK. Your first hit is free.';
      else if (p.damageRank === 0 && BigInt(p.coins) >= 1n) msg = 'You earned a coin. Tap Base Damage to buy rank 1 for 1 coin.';
      else if (p.damageRank >= 1 && p.totalAttacks < 2) msg = 'Stronger now. Attack again.';
      else if (!p.nameSet) { msg = 'Pick your player name.'; act = h('button', { class: 'btn', onclick: goProfile }, 'Set name'); }
      else if (!p.cls) {
        msg = 'Choose your class. Each one excels against one boss type.';
        act = h('button', { class: 'btn gold', onclick: () => openClassPicker(api, s, refresh, true) }, 'Choose');
        if (!pickerShown) { pickerShown = true; openClassPicker(api, s, refresh, true); }
      }
    }
    guide.hidden = !msg;
    if (msg) guide.replaceChildren(...[h('span', null, msg), act].filter(Boolean));
    tileEls.get('base_damage').el.classList.toggle('pulse', !!(p && p.damageRank === 0 && BigInt(p.coins) >= 1n));
    attackBtn.classList.toggle('pulse', !!(p && p.totalAttacks === 0));
  }

  function renderFeed() {
    if (!s.feed.length) { feed.replaceChildren(h('div', { class: 'empty' }, 'No hits yet. Be the first.')); return; }
    const nowMs = Date.now() + s.skew;
    // Name color = that player's share of THIS boss (white -> blood red -> gold). Tap a row for their stat card.
    feed.replaceChildren(...s.feed.slice(0, 8).map((f) =>
      h('div', { class: `row${f.kill ? ' kill' : ''}${f.crit ? ' crit' : ''}`, onclick: () => openCard(api, f.pid) },
        h('span', { class: 'who' }, h('i', { class: 'av', style: `--c:${CLASS_COLOR[f.cls] || '#5b6488'}` }, f.cls ? classGlyph(f.cls, 12) : icon('hood', 12)), nameTag(f.name, f.badge, f.share)),
        h('span', null, f.crit ? h('i', { class: 'critmark' }, 'CRIT') : null, h('em', null, formatBig(f.damage)), h('small', null, ago(f.at, nowMs))))));
  }

  function tick() {
    if (!s) return;
    timerEl.textContent = countdown(s.boss.endsAt - (Date.now() + s.skew));
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
    if (free <= 0) { toast('No attacks left today. They reset at midnight Pacific.'); return; }
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

  async function onClaim() {
    const r = await api.claim();
    if (r.ok && r.claimed) {
      toast(`Claimed ${formatBig(r.coins)} coins${r.gems && r.gems !== '0' ? ` and ${r.gems} gems` : ''}`);
      flyIcons(claimBtn, document.getElementById('coin-pill'), 'coin', 8);
      if (r.gems && r.gems !== '0') flyIcons(claimBtn, document.getElementById('gem-pill'), 'gem', 4);
    }
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
