// Xem lại ván đã xong: tua bàn chơi theo từng bước. Server dựng lại ván từ seed + action (/api/replay),
// client vẽ bằng chính table.js ở chế độ chỉ xem (G() / meId() trỏ sang st.replay).
import { st, esc, toast, rerender } from './store.js';
import { ROLE_VI } from './cards.js';

const AUTO_MS = 800; // tự chạy: mỗi bước 0,8 giây
let timer = 0, seq = 0;
let defs = null; // { key, val }: như poll, server chỉ gửi defs khi khoá khác

// Bước xa nhất tua được (ván ghi bằng luật cũ hỏng giữa chừng thì dừng ở bước cuối dựng được).
const limit = (r) => (r.error ? r.step : r.total);

async function load(step, pid) {
  const r = st.replay, s = st.sess, mine = ++seq; // bỏ kết quả cũ khi người dùng tua nhanh
  const q = new URLSearchParams({ room: s.room, token: s.token, id: r.id, step, pid: pid || r.pid, d: defs ? defs.key : '' });
  const res = await fetch('/api/replay?' + q);
  const j = await res.json().catch(() => ({ error: 'Server trả dữ liệu lạ' }));
  if (!res.ok) throw new Error(j.error || 'Lỗi');
  if (j.view.defs) defs = { key: j.view.defsKey, val: j.view.defs };
  if (mine !== seq || !st.replay || st.replay.id !== r.id) return; // đã có yêu cầu mới hơn, hoặc đã thoát
  st.replay = { ...st.replay, total: j.total, step: j.step, pid: j.pid, error: j.error, view: { ...j.view, defs: defs.val } };
}
async function go(step, pid) {
  try { await load(step, pid); } catch (e) { toast(e.message, 'err'); return closeReplay(); }
  rerender();
}

export function openReplay(id) {
  stop();
  st.replay = { id, total: 0, step: 0, pid: '', view: null, error: null, playing: false };
  rerender();
  return go(0);
}
export function closeReplay() { stop(); st.replay = null; rerender(); }
export const goStep = (k) => st.replay && go(Math.max(0, Math.min(limit(st.replay), k)));
function stop() { clearInterval(timer); timer = 0; if (st.replay) st.replay = { ...st.replay, playing: false }; }
function togglePlay() {
  const r = st.replay;
  if (r.playing) { stop(); return rerender(); }
  if (r.step >= limit(r)) goStep(0); // đang ở cuối: chạy lại từ đầu
  st.replay = { ...r, playing: true };
  timer = setInterval(() => { const x = st.replay; if (!x || x.step >= limit(x)) { stop(); rerender(); } else goStep(x.step + 1); }, AUTO_MS);
  rerender();
}

// Thanh trên cùng khi xem lại: tua, tự chạy, chọn ghế, thoát.
export function replayBar() {
  const r = st.replay, ps = r.view.players;
  return `<span class="mini-mark">BANG<b>!</b></span><span class="tchip">🎞️<span class="wide-only"> Xem lại</span></span>
    <button class="icon-btn" data-a="rp-prev" aria-label="Lùi 1 bước" ${r.step <= 0 ? 'disabled' : ''}>◀</button>
    <button class="icon-btn" data-a="rp-play" aria-label="${r.playing ? 'Dừng' : 'Tự chạy'}">${r.playing ? '⏸' : '⏵'}</button>
    <button class="icon-btn" data-a="rp-next" aria-label="Tới 1 bước" ${r.step >= limit(r) ? 'disabled' : ''}>▶</button>
    <input type="range" id="rp-range" class="rp-range" min="0" max="${limit(r)}" value="${r.step}" aria-label="Bước">
    <select id="rp-seat" class="rp-seat" aria-label="Xem từ ghế của">${ps.map((p) => `<option value="${esc(p.id)}" ${p.id === r.pid ? 'selected' : ''}>${esc(p.name)} · ${esc(ROLE_VI[p.role] || '')}</option>`).join('')}</select>
    <span class="spacer"></span>
    <button class="icon-btn" data-a="rp-close" aria-label="Thoát xem lại">✕</button>`;
}
export function replayBanner() {
  const r = st.replay, log = r.view.log, last = log.length ? log[log.length - 1] : 'Chưa có nước nào';
  return `<div class="banner wait"><span class="b-icon">🎞️</span><div class="b-text"><b>Bước ${r.step}/${r.total}</b><small>${esc(last)}</small>${r.error ? `<small class="warn">⚠️ ${esc(r.error)}</small>` : ''}</div></div>`;
}

export const replayActions = {
  replay: (el) => openReplay(el.dataset.k),
  'replay-last': () => { const h = st.S.lobby.history[0]; if (h) openReplay(h.id); },
  'rp-prev': () => goStep(st.replay.step - 1),
  'rp-next': () => goStep(st.replay.step + 1),
  'rp-play': () => togglePlay(),
  'rp-close': () => closeReplay(),
};
// Thanh kéo (thả tay mới tải bước đó) và ô chọn ghế.
export function replayChange(el) {
  if (!st.replay) return;
  if (el.id === 'rp-range') goStep(+el.value);
  if (el.id === 'rp-seat') go(st.replay.step, el.value);
}
