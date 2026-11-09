// Game feel: particle sparks on a canvas over the boss, and icons that fly into the header purse.
// Pure DOM/canvas, no libraries. Everything is skipped when the player prefers reduced motion.
import { icon } from './icons.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createSparks(host) {
  const cv = document.createElement('canvas');
  cv.className = 'sparks';
  host.append(cv);
  const ctx = cv.getContext('2d');
  let parts = [], running = false, dpr = 1;
  function size() {
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.max(1, host.clientWidth * dpr); cv.height = Math.max(1, host.clientHeight * dpr);
  }
  new ResizeObserver(size).observe(host);
  function frame() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'lighter';
    parts = parts.filter((p) => p.life > 0);
    for (const p of parts) {
      p.life -= 1; p.vx *= 0.96; p.vy = p.vy * 0.96 + p.g; p.x += p.vx; p.y += p.vy;
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      if (p.streak) { ctx.lineWidth = p.r * dpr; ctx.strokeStyle = p.c; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke(); }
      else { ctx.arc(p.x, p.y, p.r * dpr * (0.5 + a / 2), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    if (parts.length) requestAnimationFrame(frame); else running = false;
  }
  return {
    // x, y as fractions of the host box
    burst(fx, fy, colors, n = 18, power = 1) {
      if (reduced) return;
      const x = fx * cv.width, y = fy * cv.height;
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2, sp = (2 + Math.random() * 6) * power * dpr;
        parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 1.5 * dpr, g: 0.18 * dpr,
          r: 1.5 + Math.random() * 2.5, c: colors[i % colors.length], life: 22 + Math.random() * 22, max: 44, streak: Math.random() < 0.55 });
      }
      if (!running) { running = true; requestAnimationFrame(frame); }
    },
  };
}

// Fly n small icons from one element to another (coins to the coin pill, gems to the gem pill).
export function flyIcons(fromEl, toEl, name, n = 5) {
  if (reduced || !fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'flyer';
    el.append(icon(name, 18));
    document.body.append(el);
    const sx = a.left + a.width * (0.3 + Math.random() * 0.4), sy = a.top + a.height * (0.35 + Math.random() * 0.3);
    const ex = b.left + 14, ey = b.top + b.height / 2;
    const mx = sx + (Math.random() - 0.5) * 120, my = Math.min(sy, ey) - 40 - Math.random() * 60;
    el.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${ex}px, ${ey}px) scale(.7)`, opacity: 1 },
    ], { duration: 650 + i * 70, easing: 'cubic-bezier(.4,0,.6,1)', delay: i * 40, fill: 'both' }).onfinish = () => {
      el.remove();
      toEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 180 });
    };
  }
}

// Count a number element up to its new value.
export function countTo(el, from, to, fmt, ms = 500) {
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
