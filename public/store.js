// Trạng thái dùng chung của client + gọi server.
export const st = {
  sess: null, // { room, token }
  S: null, // ảnh chụp từ server: { lobby, game, emotes, now }
  meta: null, // /api/meta
  skew: 0, // giờ server - giờ máy (ms), để đếm ngược đúng
  conn: 'ok', // 'ok' | 'retry'
  ui: {
    sel: null, // { id, asBang } lá đang chọn trong lượt
    zone: null, // { card, target } đang chọn lấy lá nào của mục tiêu (Panic/Cat Balou)
    multi: null, // { kind: 'ability'|'sid', ids: [] } chọn 2 lá cho Sid Ketchum
    modal: null, // 'help' | 'emote' | 'info' | 'log' | null
    info: null, // { kind: 'card'|'char'|'player', key, id }
    tab: 'rules', adv: '', advErr: '',
    draft: null, // bản nháp settings đang chờ gửi
    hideEnd: false,
    sound: true,
  },
};

const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } return null; };
export const store = { get: (k) => LS(k), set: (k, v) => LS(k, v) };
try { st.sess = JSON.parse(LS('bang') || 'null'); } catch (e) { st.sess = null; }
st.ui.sound = LS('bang-sound') !== 'off';

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c]));

let toastTimer = 0;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = `on ${kind}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

export const hooks = { leaveLocal: () => {}, connect: () => {} }; // app.js gắn vào, tránh import vòng
let renderFn = () => {};
export const onRender = (f) => { renderFn = f; };
export const rerender = () => renderFn();

export class ApiError extends Error {}
export async function post(path, body = {}) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: st.sess && st.sess.room, token: st.sess && st.sess.token, ...body }) });
  const j = await r.json().catch(() => ({ error: 'Server trả dữ liệu lạ' }));
  if (!r.ok) throw new ApiError(j.error || 'Lỗi');
  return j;
}

export function clearSel() { st.ui.sel = null; st.ui.zone = null; st.ui.multi = null; }
export async function act(action) {
  try { await post('action', { action }); clearSel(); } catch (e) { clearSel(); toast(e.message, 'err'); }
  rerender();
}
export const setSess = (s) => { st.sess = s; LS('bang', s ? JSON.stringify(s) : null); };
