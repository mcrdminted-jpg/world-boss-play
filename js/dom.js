// Tiny DOM helpers. Everything user-supplied (player names) goes in through text nodes, never innerHTML.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer;
export function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export function openSheet(...content) {
  const root = $('#sheet-root');
  const scrim = h('div', { class: 'scrim' });
  const sheet = h('div', { class: 'sheet', role: 'dialog' }, content);
  root.replaceChildren(scrim, sheet);
  root.style.pointerEvents = 'auto';
  requestAnimationFrame(() => { scrim.classList.add('open'); sheet.classList.add('open'); });
  const close = () => {
    scrim.classList.remove('open'); sheet.classList.remove('open');
    setTimeout(() => { root.replaceChildren(); root.style.pointerEvents = 'none'; }, 220);
  };
  scrim.addEventListener('click', close);
  return close;
}

export const vibrate = (ms) => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

export function ago(ms, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  if (d > 0) return `${d}d ${hh}h ${String(m).padStart(2, '0')}m`;
  return `${hh}h ${String(m).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
}
