// Placeholder icon set drawn in code, colored like the mockups. Replaced by the ChatGPT icon sheets
// (assets/ui/icons-a, icons-b) when that art lands: icon() then returns an <img> instead.
const P = {
  sword: ['M14.5 3.5l6 0 0 6-9 9-6-6z', 'M4 20l3.5-3.5M3 16l5 5', '#ffd36b'],
  clover: ['M12 12c-3-5-8-3-6 1 1 2 4 2 6-1zM12 12c5-3 3-8-1-6-2 1-2 4 1 6zM12 12c3 5 8 3 6-1-1-2-4-2-6 1zM12 12c-5 3-3 8 1 6 2-1 2-4-1-6zM12 12l2 9', null, '#5fe07a'],
  burst: ['M12 2l2 6 6-3-3 6 6 2-6 2 3 6-6-3-2 6-2-6-6 3 3-6-6-2 6-2-3-6 6 3z', null, '#ffb347'],
  coin: ['M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6-1 1.4-2.5 1.6-2.5.6-2.5 1.7 1 1.6 2.5 1.6 2.5-.6 2.5-1.5', null, '#ffcf4a'],
  double: ['M4 4l8 8M4 4h4M4 4v4M20 4l-8 8M20 4h-4M20 4v4M8 16l-4 4M16 16l4 4M7 13l4 4M17 13l-4 4', null, '#7fd3ff'],
  skull: ['M12 3c-5 0-8 3-8 7 0 3 2 4 2 6v2h12v-2c0-2 2-3 2-6 0-4-3-7-8-7zM9 11h.01M15 11h.01M10 18v3M14 18v3M3 4l3 3M21 4l-3 3', null, '#ff5a5a'],
  swords: ['M4 4l11 11M4 4h4M4 4v4M20 4L9 15M20 4h-4M20 4v4M13 17l4 4M11 17l-4 4M16 14l2 2M8 14l-2 2', null, '#ffd36b'],
  gem: ['M6 4h12l4 5-10 12L2 9zM2 9h20M9 4l3 17M15 4l-3 17', null, '#c48bff'],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z', null, '#7fd3ff'],
  clock: ['M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2', null, '#e7c27a'],
  hood: ['M12 3c-5 0-8 5-8 10v8h16v-8c0-5-3-10-8-10zM8 13c1-3 7-3 8 0-1 3-7 3-8 0z', null, '#9fb3ff'],
  trophy: ['M7 4h10v4a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 13v4M8 21h8M9 17h6', null, '#ffd36b'],
  lock: ['M6 11h12v10H6zM8 11V8a4 4 0 018 0v3', null, '#7b86b8'],
  home: ['M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10', null, '#ffd36b'],
  tree: ['M12 3v6M12 9l-6 5M12 9l6 5M6 14v6M18 14v6M12 3a1.5 1.5 0 100 .1', null, '#7fb0ff'],
  chest: ['M3 10h18v10H3zM3 10l2-5h14l2 5M10 13h4v3h-4zM3 14h7M14 14h7', null, '#ffb347'],
  person: ['M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', null, '#c8d2ff'],
  plus: ['M12 5v14M5 12h14', null, '#fff'],
};
export function icon(name, size = 20, color) {
  const [d1, d2, c] = P[name] || P.lock;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', size); svg.setAttribute('height', size);
  svg.setAttribute('class', `ico ico-${name}`);
  svg.style.color = color || c || '#ffd36b';
  for (const d of [d1, d2]) {
    if (!d) continue;
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d); svg.append(p);
  }
  return svg;
}
