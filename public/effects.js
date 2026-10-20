// Hiệu ứng: âm thanh tổng hợp (WebAudio), vệt đạn giữa 2 ghế, rung khi trúng, đếm ngược, báo tới lượt.
import { st } from './store.js';

let ac = null;
export function unlockAudio() {
  if (!ac) { const A = window.AudioContext || window.webkitAudioContext; if (A) ac = new A(); }
  if (ac && ac.state === 'suspended') ac.resume();
}
function env(node, t0, attack, decay, peak) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  node.connect(g); g.connect(ac.destination);
}
function blip(freq, at, dur, type, vol) {
  const o = ac.createOscillator(), t = ac.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  env(o, t, 0.008, dur, vol); o.start(t); o.stop(t + dur + 0.05);
}
const SOUNDS = {
  shot() { // tiếng súng: nhiễu trắng tắt nhanh qua lọc thấp + cú "bụp" trầm
    const n = Math.floor(ac.sampleRate * 0.35), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
    const s = ac.createBufferSource(), f = ac.createBiquadFilter();
    s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 2200; s.connect(f);
    env(f, ac.currentTime, 0.002, 0.32, 0.55); s.start();
    blip(85, 0, 0.16, 'sine', 0.3);
  },
  card() { blip(1400, 0, 0.05, 'triangle', 0.04); blip(900, 0.03, 0.06, 'triangle', 0.03); },
  hit() { blip(150, 0, 0.22, 'sawtooth', 0.09); blip(95, 0.05, 0.25, 'sine', 0.12); },
  turn() { blip(660, 0, 0.16, 'triangle', 0.11); blip(990, 0.13, 0.26, 'triangle', 0.09); },
  alert() { blip(880, 0, 0.09, 'square', 0.05); blip(880, 0.14, 0.09, 'square', 0.05); },
  win() { [523, 659, 784, 1046].forEach((f, i) => blip(f, i * 0.12, 0.35, 'triangle', 0.09)); },
};
export function sound(name) {
  if (!st.ui.sound || !ac) return;
  try { SOUNDS[name](); } catch (e) { /* trình duyệt chặn âm thanh thì thôi, không ảnh hưởng ván */ }
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const seatEl = (id) => document.querySelector(`[data-seat="${CSS.escape(id)}"]`);
function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

// Vệt đạn cong từ người chơi lá tới mục tiêu, có chớp nòng và vòng trúng.
export function tracer(fromId, toId, hot) {
  const a = seatEl(fromId), b = seatEl(toId), fx = document.getElementById('fx');
  if (!a || !b || !fx || reduced()) return;
  const p = centerOf(a), q = centerOf(b);
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2 - Math.min(120, Math.hypot(q.x - p.x, q.y - p.y) * 0.18);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `tracer ${hot ? 'hot' : 'cool'}`);
  svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  svg.innerHTML = `<path class="t-glow" d="M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}" pathLength="1"/><path class="t-line" d="M${p.x},${p.y} Q${mx},${my} ${q.x},${q.y}" pathLength="1"/>
    <circle class="t-muzzle" cx="${p.x}" cy="${p.y}" r="14"/><circle class="t-impact" cx="${q.x}" cy="${q.y}" r="10"/>`;
  fx.appendChild(svg);
  setTimeout(() => svg.remove(), 1100);
  if (hot) { // khói súng bốc lên ở người bắn
    const puff = document.createElement('span');
    puff.className = 'puff'; puff.style.left = `${p.x}px`; puff.style.top = `${p.y}px`;
    fx.appendChild(puff); setTimeout(() => puff.remove(), 1400);
  }
}
export function floatText(id, text, cls) {
  const el = seatEl(id), fx = document.getElementById('fx');
  if (!el || !fx) return;
  const c = centerOf(el), s = document.createElement('span');
  s.className = `float ${cls || ''}`; s.textContent = text;
  s.style.left = `${c.x}px`; s.style.top = `${c.y - 20}px`;
  fx.appendChild(s); setTimeout(() => s.remove(), 1300);
}
function flash(id, cls, ms = 700) { poke(seatEl(id), cls, ms); }
// Gắn lại class để chạy lại animation CSS (lỗ đạn, lá đập xuống bàn, lá bay vào tay…).
function poke(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  if (ms) setTimeout(() => el.classList.remove(cls), ms);
}

// So trạng thái cũ/mới để biết vừa có chuyện gì (ai mất máu, ai chơi lá gì, tới lượt mình…).
const lastKey = (L) => (L && L.card ? `${L.pid}:${L.card.id}:${L.target}` : '');
export function sync(prev, g, meId) {
  if (!g) return;
  const was = prev && prev.ver !== undefined ? prev : null;
  if (lastKey(g.last) && lastKey(g.last) !== lastKey(was && was.last)) {
    const d = g.defs.cards[g.last.card.key] || {};
    const hot = d.bang || g.last.asBang || g.last.card.key === 'duel';
    if (g.last.target) tracer(g.last.pid, g.last.target, hot);
    sound(hot ? 'shot' : 'card');
  }
  if (was) {
    let hurt = false;
    for (const p of g.players) {
      const o = was.players.find((x) => x.id === p.id);
      if (!o) continue;
      if (p.life < o.life) { flash(p.id, 'hit', 2200); hurt = true; floatText(p.id, `−${o.life - p.life}`, 'dmg'); sound('hit'); }
      else if (p.life > o.life && p.alive) floatText(p.id, `+${p.life - o.life}`, 'heal');
      if (o.alive && !p.alive) flash(p.id, 'just-dead', 1600);
    }
    if (hurt && !reduced()) poke(document.querySelector('.g-main'), 'quake', 500); // rung bàn khi có người trúng đạn
    if (g.winner && !was.winner) sound('win');
    // lá vừa ra chồng bỏ đập xuống bàn; lá mới vào tay mình bay từ chồng rút xuống
    if (g.discardTop && (!was.discardTop || g.discardTop.id !== was.discardTop.id)) poke(document.querySelector('.discard .card'), 'slap', 900);
    if (g.me && was.me) {
      const had = new Set(was.me.hand.map((c) => c.id));
      g.me.hand.filter((c) => !had.has(c.id)).forEach((c, k) => { const el = document.querySelector(`.hand .card[data-id="${c.id}"]`); if (el) el.style.setProperty('--k', k); poke(el, 'drawn', 1400); });
    }
  }
  const pe = g.pending, ppe = was && was.pending;
  const myNow = pe && pe.player === meId, myBefore = ppe && ppe.player === meId && ppe.type === pe.type;
  if (myNow && !myBefore) {
    sound(pe.type === 'play' ? 'turn' : pe.type === 'respond' || pe.type === 'dying' ? 'alert' : 'card');
    const b = document.querySelector('.banner.mine'); if (b) { b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping'); }
    // trình duyệt chỉ cho rung sau khi người dùng đã chạm vào trang
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(pe.type === 'play' ? 60 : [40, 60, 40]);
  }
  titleAlert(!!myNow);
}

const BASE_TITLE = 'BANG! — chơi cùng bạn bè';
let alertOn = false;
function titleAlert(on) {
  alertOn = on;
  document.title = on && document.hidden ? '🔴 Tới lượt bạn! — BANG!' : BASE_TITLE;
}
document.addEventListener('visibilitychange', () => titleAlert(alertOn));

// Đếm ngược tới lúc máy chơi thay (giờ server).
setInterval(() => {
  for (const el of document.querySelectorAll('[data-deadline]')) {
    const left = Math.max(0, Math.ceil((+el.dataset.deadline - (Date.now() + st.skew)) / 1000));
    el.textContent = left > 99 ? '⏱' : `⏱ ${left}s`;
    el.classList.toggle('urgent', left <= 10);
  }
}, 500);
