import { h, toast, openSheet, vibrate, ago, countdown } from './dom.js';
import { formatBig, groupDigits, damagePerHitText, PERK_LABEL } from '../shared/combat.js';
import { nameTag, openCard } from './players.js';

const TILES = [
  { key: 'base_damage', name: 'Base Damage', live: true },
  { key: 'crit_chance', name: 'Critical Chance' },
  { key: 'crit_damage', name: 'Critical Damage' },
  { key: 'coin_bonus', name: 'Coin Bonus' },
  { key: 'double_strike', name: 'Double Strike' },
  { key: 'boss_damage', name: 'Boss Damage' },
];

export function createHome(api, refresh, goProfile) {
  let s = null;
  let busy = false;
  let artKey = '';

  const nameEl = h('h1'); const labelEl = h('small'); const timerEl = h('div', { class: 'timer' });
  const typeEl = h('span', { class: 'chip' }); const rewardEl = h('span', { class: 'chip gold' });
  const guide = h('div', { class: 'guide', hidden: true });
  const claimBtn = h('button', { class: 'claim', hidden: true, onclick: onClaim });
  const art = h('div', { class: 'art' });
  const hpFill = h('b'); const hpText = h('span');
  const stage = h('div', { class: 'stage' }, art, h('div', { class: 'hp' }, hpFill, hpText));
  const leftNum = h('b'); const leftSub = h('small'); const attackBtn = h('button', { class: 'attack', onclick: onAttack }, 'ATTACK');
  const feed = h('div', { class: 'feed' });
  const tileEls = new Map();
  const tilesEl = h('div', { class: 'tiles' }, TILES.map((t) => {
    const rk = h('div', { class: 'rk' });
    const buy = h('button', { class: 'buy', onclick: (e) => { e.stopPropagation(); if (t.live) buyNow(); } });
    const el = h('div', { class: `tile${t.live ? '' : ' locked'}`, onclick: () => openTile(t) }, h('div', { class: 'nm' }, t.name), rk, buy);
    tileEls.set(t.key, { rk, buy });
    return el;
  }));
  const el = h('section', { class: 'home' },
    h('div', { class: 'boss-head' }, h('div', null, nameEl, labelEl), timerEl),
    stage,
    h('div', { class: 'chips' }, typeEl, rewardEl),
    h('div', { class: 'actions' },
      h('div', { class: 'left' }, h('small', null, 'Attacks'), leftNum, leftSub),
      attackBtn,
      h('div', { style: 'display:grid;gap:6px' },
        h('div', { class: 'ad' }, h('b', null, '+1 Attack'), 'Watch ad 0/5 (soon)'),
        h('div', { class: 'ad' }, h('b', null, '2x next hit'), 'Watch ad 0/10 (soon)'))),
    feed, tilesEl);
  stage.append(claimBtn, guide);
  claimBtn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:2';

  // Boss rig: .rig takes hits and specials, .sway idles forever underneath, so they never fight each other.
  let rig = null;
  function setArt(b) {
    const key = `${b.attemptId}`;
    if (key === artKey) return;
    artKey = key;
    art.className = 'art';
    const ph = () => h('div', { class: 'ph' }, b.depth === 0 ? b.mainNumber : `${b.mainNumber - 1}${String.fromCharCode(64 + Math.min(b.depth, 26))}`);
    const img = h('img', { src: b.art, alt: b.name, draggable: 'false' });
    const typeArt = `assets/types/${String(b.type || '').toLowerCase()}.webp`;
    img.addEventListener('error', () => {
      if (img.dataset.fallback) { img.replaceWith(ph()); return; }
      img.dataset.fallback = '1';
      img.src = typeArt; // no art for this boss yet: use its type's art
    });
    rig = h('div', { class: 'rig' }, h('div', { class: 'sway' }, img));
    art.replaceChildren(rig);
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lastHitAt = 0;

  // Idle personality: every 7 to 14 seconds the boss does something on its own, unless it was just hit.
  const SPECIALS = [
    [{ transform: 'scale(1)' }, { transform: 'scale(1.12) translateY(-2%)', filter: 'brightness(1.5) drop-shadow(0 0 18px #ff3b2f)' }, { transform: 'scale(1)' }],
    [{ transform: 'translateY(0)' }, { transform: 'translateY(-9%)' }, { transform: 'translateY(0)' }, { transform: 'translateY(-3%)' }, { transform: 'translateY(0)' }],
    [{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }],
  ];
  function scheduleSpecial() {
    setTimeout(() => {
      if (rig && !reduced && document.visibilityState === 'visible' && Date.now() - lastHitAt > 2500 && el.isConnected) {
        rig.animate(SPECIALS[Math.floor(Math.random() * SPECIALS.length)], { duration: 900, easing: 'ease-in-out' });
      }
      scheduleSpecial();
    }, 7000 + Math.random() * 7000);
  }
  scheduleSpecial();

  // Hit reaction for YOUR attacks only. Other players' hits stay in the feed, so the boss is never stuck in a hit loop.
  const FX = ['slash', 'arrow', 'bonk', 'magic'];
  function playHit(big) {
    lastHitAt = Date.now();
    const kind = FX[Math.floor(Math.random() * FX.length)];
    const fx = h('div', { class: `fx fx-${kind}`, style: `left:${30 + Math.random() * 30}%;top:${25 + Math.random() * 30}%` },
      kind === 'bonk' ? h('span', null, 'BONK') : null);
    art.append(fx);
    setTimeout(() => fx.remove(), 700);
    if (rig && !reduced) {
      const dir = kind === 'arrow' ? 1 : -1;
      rig.animate([
        { transform: 'translateX(0) scale(1)', filter: 'none' },
        { transform: `translateX(${dir * 4}%) scale(${big ? 0.92 : 0.96})`, filter: 'brightness(2.2) saturate(.3)' },
        { transform: `translateX(${-dir * 2}%) scale(1.01)`, filter: 'brightness(1.2)' },
        { transform: 'translateX(0) scale(1)', filter: 'none' },
      ], { duration: big ? 420 : 260, easing: 'ease-out' });
    }
  }

  function update(state) {
    s = state;
    done = 0; // fresh server count already includes every finished attack
    const b = s.boss, p = s.player;
    nameEl.textContent = b.name;
    labelEl.textContent = b.label;
    typeEl.textContent = b.type;
    rewardEl.hidden = !b.perk;
    if (b.perk) rewardEl.textContent = `Kill reward: +1% ${PERK_LABEL[b.perk]} forever`;
    const hp = BigInt(b.hp), max = BigInt(b.maxHp);
    const pct = max > 0n ? Number((hp * 1000n) / max) / 10 : 0;
    hpFill.style.width = `${pct}%`;
    hpText.textContent = `${groupDigits(hp)} / ${groupDigits(max)}  ${pct.toFixed(1)}%`;
    if (!busy) setArt(b);
    if (p) {
      leftNum.textContent = `${Math.max(0, p.attacksLeft - queued - (busy ? 1 : 0) - done)}`;
      leftSub.textContent = p.bonusAttacks > 0 ? `left today (+${p.bonusAttacks} free)` : `left of ${p.attacksMax} today`;
      attackBtn.disabled = p.attacksLeft <= 0;
      const pr = p.pendingRewards;
      claimBtn.hidden = !(pr && pr.count > 0);
      if (!claimBtn.hidden) claimBtn.textContent = `Claim ${formatBig(pr.coins)} coins`;
      const base = tileEls.get('base_damage');
      base.rk.textContent = `Rank ${p.damageRank}`;
      const cost = BigInt(p.nextCost);
      base.buy.textContent = `${formatBig(cost)} coin${cost === 1n ? '' : 's'}`;
      base.buy.disabled = BigInt(p.coins) < cost;
      for (const t of TILES) {
        if (t.live) continue;
        const x = tileEls.get(t.key);
        x.rk.textContent = '--'; x.buy.textContent = 'Soon'; x.buy.disabled = true;
      }
    }
    renderFeed();
    renderGuide();
    tick();
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
    }
    guide.hidden = !msg;
    if (msg) guide.replaceChildren(...[h('span', null, msg), act].filter(Boolean));
    const base = tilesEl.firstChild;
    base.classList.toggle('pulse', !!(p && p.damageRank === 0 && BigInt(p.coins) >= 1n));
    attackBtn.classList.toggle('pulse', !!(p && p.totalAttacks === 0));
  }

  function renderFeed() {
    if (!s.feed.length) { feed.replaceChildren(h('div', { class: 'empty' }, 'No hits yet. Be the first.')); return; }
    const nowMs = Date.now() + s.skew;
    // Name color = that player's share of THIS boss (white -> blood red -> gold). Tap a row for their stat card.
    feed.replaceChildren(...s.feed.slice(0, 6).map((f) =>
      h('div', { class: `row${f.kill ? ' kill' : ''}`, onclick: () => openCard(api, f.pid) },
        nameTag(f.name, f.badge, f.share), h('span', null, h('em', null, formatBig(f.damage)), h('small', null, ago(f.at, nowMs))))));
  }

  function tick() {
    if (!s) return;
    timerEl.textContent = countdown(s.boss.endsAt - (Date.now() + s.skew));
  }

  function floatDamage(text, big) {
    const f = h('div', { class: 'float', style: `left:${20 + Math.random() * 55}%;top:${30 + Math.random() * 30}%;${big ? 'font-size:34px;color:#ffd36b' : ''}` }, text);
    art.append(f);
    setTimeout(() => f.remove(), 950);
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
      } else {
        done += 1;
        playHit(r.killed);
        floatDamage(`-${formatBig(r.damage)}`, r.killed);
        vibrate(r.killed ? [30, 40, 60] : 12);
        if (r.killed) {
          art.classList.add('dead');
          const perk = r.perk ? ` Permanent +1% ${PERK_LABEL[r.perk]}.` : '';
          toast(r.slayer ? `${r.attempt} defeated. You landed the killing blow!${perk}` : `${r.attempt} defeated.${perk} Next: ${r.next}`, 3600);
          await new Promise((res) => setTimeout(res, 700));
          artKey = ''; // next refresh loads the new boss
          return true; // stop the queue at a kill so leftover taps don't hit the next boss blind
        }
      }
    } catch (e) {
      toast('Connection problem. Try again.');
      return true;
    }
    return false;
  }

  async function onClaim() {
    const r = await api.claim();
    if (r.ok && r.claimed) toast(`Claimed ${formatBig(r.coins)} coins`);
    await refresh();
  }

  async function buyNow() {
    const r = await api.buy('base_damage');
    if (!r.ok) toast(r.error === 'not_enough_coins' ? 'Not enough coins.' : 'Not available yet.');
    else toast(`Base Damage rank ${r.rank}`);
    await refresh();
  }

  function openTile(t) {
    if (!s?.player) return;
    const p = s.player;
    if (!t.live) {
      const close = openSheet(h('h3', null, t.name), h('p', null, 'Unlocks in the next update.'), h('button', { class: 'btn', onclick: () => close() }, 'OK'));
      return;
    }
    const cur = damagePerHitText(p.damageRank, p.perks.damage), next = damagePerHitText(p.damageRank + 1, p.perks.damage);
    const cost = BigInt(p.nextCost);
    const close = openSheet(
      h('h3', null, 'Base Damage'),
      h('p', null, `Every rank multiplies your base damage by 1.25. Average damage per hit: ${cur} now, ${next} after this rank. Fractions are rounded randomly so the average is exact.`),
      h('div', { class: 'kv' }, h('span', null, 'Rank'), h('span', null, p.damageRank)),
      h('div', { class: 'kv' }, h('span', null, 'Next cost'), h('span', null, `${groupDigits(cost)} coins`)),
      h('div', { class: 'kv' }, h('span', null, 'You have'), h('span', null, `${groupDigits(BigInt(p.coins))} coins`)),
      h('div', { style: 'margin-top:12px;display:grid' },
        h('button', { class: 'btn gold', disabled: BigInt(p.coins) < cost, onclick: async () => { await buyNow(); close(); } }, 'Buy rank')));
  }

  return { el, update, tick };
}
