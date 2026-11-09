// Sound effects synthesized with Web Audio: no audio files, no third-party service.
// Settings (sound, vibration) are per-device conveniences in localStorage.
const KEY = 'wb-settings';
let settings = { sound: true, vibration: true };
try { settings = { ...settings, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* storage blocked */ }
export const getSetting = (k) => settings[k];
export function setSetting(k, v) {
  settings[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage blocked */ }
}

let ctx = null, master = null;
function ac() {
  if (!settings.sound) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol = 0.3, freq = 1200, delay = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(master); src.start(t);
}
export const sfx = {
  hit() { noise(0.12, 0.45, 900); tone(140, 0.14, 'triangle', 0.35, 60); },
  crit() { noise(0.18, 0.5, 2200); tone(880, 0.18, 'square', 0.12, 1320); tone(1320, 0.25, 'sine', 0.15, null, 0.05); },
  coin() { tone(1568, 0.08, 'square', 0.06); tone(2093, 0.14, 'square', 0.06, null, 0.06); },
  gem() { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, null, i * 0.05)); },
  roar() { noise(0.7, 0.35, 380); tone(90, 0.7, 'sawtooth', 0.12, 55); },
  swipe() { noise(0.25, 0.4, 3000); tone(600, 0.25, 'sawtooth', 0.06, 150); },
  kill() { noise(0.6, 0.5, 700); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.18, null, 0.15 + i * 0.11)); },
  buy() { tone(660, 0.07, 'square', 0.08); tone(990, 0.12, 'square', 0.08, null, 0.06); },
  ability() { tone(220, 0.5, 'sawtooth', 0.1, 880); noise(0.4, 0.2, 1600, 0.1); },
};
