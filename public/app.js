// Điểm vào client: kết nối long-poll, chọn màn (trang chủ / sảnh / bàn chơi), vá DOM theo vùng, phân phát thao tác.
import { st, esc, toast, post, onRender, setSess, clearSel, hooks } from './store.js';
import { homeHtml, lobbySkeleton, lobbyRegions, lobbyActions, lobbyChange } from './lobby.js';
import { gameSkeleton, gameRegions, tableActions } from './table.js';
import { sync, unlockAudio } from './effects.js';
import { mergeChat, lastChatId, sendChat, chatActions } from './chat.js';
import { replayBar, replayBanner, replayActions, replayChange } from './replay.js';
import { maybeStartTour } from './tour.js';

const $app = document.getElementById('app');
let loopId = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- kết nối ----------
function connect() {
  const id = ++loopId;
  let ver = 0, fails = 0;
  let defs = null; // { key, val }: server chỉ gửi defs khi khoá client đang giữ khác của ván hiện tại
  st.chat = []; // vòng poll mới: xin lại 50 tin gần nhất
  (async () => {
    while (st.sess && id === loopId) {
      try {
        const r = await fetch(`/api/poll?room=${encodeURIComponent(st.sess.room)}&token=${encodeURIComponent(st.sess.token)}&v=${ver}&d=${defs ? defs.key : ''}&c=${lastChatId()}`, { cache: 'no-store' });
        const j = await r.json();
        if (id !== loopId) return;
        if (!r.ok) {
          // chỉ bỏ phiên khi server nói rõ phòng/phiên không còn; lỗi mạng thì thử lại mãi
          if (/Không tìm thấy phòng|Phiên không hợp lệ/.test(j.error || '')) return leaveLocal(`${j.error} — có thể phòng đã đóng.`);
          throw new Error(j.error || 'lỗi');
        }
        fails = 0;
        const wasRetry = st.conn !== 'ok'; st.conn = 'ok';
        ver = j.v;
        if (!j.same) {
          const g = j.data.game;
          if (g && g.defs) defs = { key: g.defsKey, val: g.defs }; else if (g) g.defs = defs.val;
          mergeChat(j.data.chat);
          const prev = st.S; st.S = j.data; st.skew = j.data.now - Date.now(); onState(prev);
        } else if (wasRetry) render();
      } catch (e) {
        if (id !== loopId) return;
        fails++;
        if (fails > 1 && st.conn !== 'retry') { st.conn = 'retry'; render(); }
        await sleep(Math.min(700 * fails, 5000));
      }
    }
  })();
}
function onState(prev) {
  const g = st.S.game, me = st.S.lobby.me;
  const pe = g && g.pending, mine = pe && pe.player === me;
  if (!mine || pe.type !== 'play') { st.ui.sel = null; st.ui.zone = null; st.ui.use = null; }
  if (!mine) st.ui.multi = null;
  if (!g) { st.ui.hideEnd = false; st.ui.modal = null; }
  if (st.ui.draft && !(st.S.lobby.hostId === me)) st.ui.draft = null;
  render();
  if (g && !st.replay) sync(prev && prev.game, g, me); // đang xem lại thì không phát hiệu ứng của ván thật
}
async function loadMeta() {
  try {
    const r = await fetch('/api/meta');
    const m = await r.json();
    if (m.error) throw new Error(m.error);
    st.meta = m; render();
  } catch (e) {
    $app.innerHTML = `<main class="home"><div class="panel"><h2>Lỗi cấu hình</h2><p>${esc(e.message)}</p></div></main>`;
    $app.dataset.screen = 'error';
  }
}
function leaveLocal(msg) {
  loopId++; setSess(null); st.S = null; st.conn = 'ok'; clearSel();
  st.ui.err = msg || ''; st.ui.modal = null; st.ui.draft = null; st.ui.adv = '';
  render();
}
hooks.leaveLocal = leaveLocal;
hooks.connect = () => { connect(); render(); };

// ---------- vẽ: chỉ thay vùng nào có HTML đổi, giữ focus/scroll ----------
function patch(id, html) {
  const el = document.getElementById(id);
  if (!el || el._h === html) return;
  const list = el.querySelector('.log-list');
  const stick = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 40; // lần đầu thì cuộn xuống cuối
  const keep = list ? list.scrollTop : 0;
  el.innerHTML = html; el._h = html;
  const nl = el.querySelector('.log-list');
  if (nl) nl.scrollTop = stick ? nl.scrollHeight : keep;
}
function focusKey() {
  const a = document.activeElement;
  if (!a || a === document.body || !$app.contains(a)) return null;
  if (a.id) return { sel: `#${CSS.escape(a.id)}`, s: a.selectionStart, e: a.selectionEnd };
  const d = a.dataset;
  if (!d.a && !d.k) return null;
  return { sel: ['a', 'k', 'id'].filter((k) => d[k] !== undefined).map((k) => `[data-${k}="${CSS.escape(d[k])}"]`).join('') };
}
function restoreFocus(f) {
  if (!f || (document.activeElement && document.activeElement !== document.body)) return;
  const el = $app.querySelector(f.sel);
  if (!el) return;
  el.focus({ preventScroll: true });
  if (f.s != null && el.setSelectionRange) try { el.setSelectionRange(f.s, f.e); } catch (e) { /* input không hỗ trợ chọn chữ */ }
}
function screen(name, skeleton) {
  if ($app.dataset.screen === name) return false;
  $app.innerHTML = skeleton; $app.dataset.screen = name;
  // animation vào màn chỉ chạy lần đầu; các lần vá vùng sau đó không lặp lại
  $app.classList.add('intro'); clearTimeout(screen.t); screen.t = setTimeout(() => $app.classList.remove('intro'), 1800);
  return true;
}
let homeKey = '';
function render() {
  const S = st.S;
  document.body.classList.toggle('offline', st.conn === 'retry');
  if (!st.sess || !S) {
    const key = `${st.ui.err}|${st.sess && st.sess.room}|${location.search}`;
    if (screen('home', homeHtml()) || key !== homeKey) { $app.innerHTML = homeHtml(); $app.dataset.screen = 'home'; }
    homeKey = key;
    return;
  }
  if (!st.meta) { screen('loading', '<main class="home"><p class="loading">Đang lên đạn…</p></main>'); return; }
  const f = focusKey();
  if (st.replay) { // xem lại ván: vẽ bàn chơi ở chế độ chỉ xem
    if (!st.replay.view) { screen('loading', '<main class="home"><p class="loading">Đang tua lại ván…</p></main>'); return; }
    screen('replay', gameSkeleton());
    for (const [id, html] of Object.entries({ ...gameRegions(), 'g-top': replayBar(), 'g-banner': replayBanner() })) patch(id, html);
  } else if (S.lobby.started && S.game) { screen('game', gameSkeleton()); for (const [id, html] of Object.entries(gameRegions())) patch(id, html); }
  else { screen('lobby', lobbySkeleton()); for (const [id, html] of Object.entries(lobbyRegions())) patch(id, html); }
  restoreFocus(f);
  maybeStartTour();
}
onRender(render);

// ---------- thao tác ----------
const appActions = {
  leave: () => post('leave').catch(() => {}).finally(() => leaveLocal()),
};
document.addEventListener('click', (e) => {
  unlockAudio();
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const h = appActions[el.dataset.a] || chatActions[el.dataset.a] || replayActions[el.dataset.a] || lobbyActions[el.dataset.a] || tableActions[el.dataset.a];
  if (!h) return;
  e.preventDefault();
  h(el, e);
});
document.addEventListener('change', (e) => { replayChange(e.target); lobbyChange(e.target); });
document.addEventListener('input', (e) => {
  if (e.target.id === 'adv') st.ui.adv = e.target.value;
  if (e.target.id === 'chat-input') st.ui.chatDraft = e.target.value;
});
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.key === 'Enter' && t.id === 'chat-input') { e.preventDefault(); sendChat(); return; }
  if (e.key === 'Enter' && (t.id === 'code' || t.id === 'name')) { e.preventDefault(); lobbyActions[document.getElementById('code').value.trim() ? 'join' : 'create'](); return; }
  if (e.key === 'Escape' && (st.ui.modal || st.ui.zone || st.ui.sel || st.ui.multi)) { st.ui.modal = null; clearSel(); render(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('[role="button"][data-a]')) { e.preventDefault(); t.click(); }
});
// Nghiêng nhẹ quạt bài ở trang chủ theo chuột.
document.addEventListener('pointermove', (e) => {
  const fan = document.querySelector('[data-tilt]');
  if (!fan || e.pointerType !== 'mouse') return;
  const x = e.clientX / innerWidth - 0.5, y = e.clientY / innerHeight - 0.5;
  fan.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`); fan.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
});
window.addEventListener('error', (e) => toast('Lỗi giao diện: ' + e.message, 'err'));

// ---------- khởi động ----------
const q = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
if (st.sess && (!q || q === st.sess.room)) { if (q) history.replaceState(null, '', location.pathname); connect(); }
loadMeta();
render();
