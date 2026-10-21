// Hướng dẫn chỉ tay lần đầu vào ván: khung sáng quanh từng phần của bàn chơi + chú thích "Tiếp / Bỏ qua".
// Lớp phủ gắn thẳng vào <body> (ngoài #app) để các lần vá DOM không xoá nó.
import { st } from './store.js';
import { G } from './cards.js';

const KEY = 'bang-tour'; // localStorage: 'done' = đã xem
const START_MS = 600; // chờ bàn chơi dựng xong mới bắt đầu
const STEPS = [
  { sel: '.role-card', title: 'Vai của bạn', text: 'Chỉ mình bạn thấy vai này (riêng Sheriff thì lộ mặt). Dòng chữ nhỏ là mục tiêu để thắng.' },
  { sel: '#g-hand', title: 'Tay bài', text: 'Tới lượt thì lá chơi được sáng lên. Chạm 1 lá để xem mô tả, rồi bấm nút chơi hoặc chạm vào ghế người muốn nhắm.' },
  { sel: '#g-seats .seat', title: 'Ghế & khoảng cách', text: 'Mỗi tờ truy nã là một người: máu ❤, số lá trên tay, đồ đang trang bị. ↔ là khoảng cách từ bạn — BANG! chỉ tới được người trong tầm súng 🎯.' },
  { sel: '#g-banner', title: 'Việc cần làm', text: 'Banner nói bạn đang phải làm gì: chơi bài, đỡ BANG!, bỏ bớt bài… Đồng hồ ⏱ hết giờ thì máy chơi thay nước đó.' },
  { sel: '.topbar [data-a="log-toggle"]', title: 'Nhật ký & chat', text: 'Xem ai vừa làm gì, và nhắn cả bàn ở tab 💬 Chat.' },
  { sel: '.topbar [data-a="help"]', title: 'Quên luật?', text: 'Nút ❓ mở luật nhanh, mô tả mọi lá và nhân vật trong ván. Muốn xem lại hướng dẫn này cũng vào đây.' },
];

let root = null, step = 0, pending = 0;
const seen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch (e) { return false; } };
const target = (s) => { const el = document.querySelector(s.sel); return el && el.getClientRects().length ? el : null; };

// Gọi sau mỗi lần vẽ: tự mở hướng dẫn cho người chơi (không phải người xem) chưa xem lần nào, khi không có modal.
export function maybeStartTour() {
  if (root || pending || seen() || st.replay) return;
  const ready = () => document.getElementById('app').dataset.screen === 'game' && G() && G().me && !document.getElementById('g-modal').innerHTML.trim();
  if (!ready()) return;
  pending = setTimeout(() => { pending = 0; if (!root && ready()) startTour(); }, START_MS);
}

export function startTour() {
  if (root) return;
  root = document.createElement('div');
  root.className = 'tour';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-live', 'polite');
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-tour]'); if (b) (b.dataset.tour === 'next' ? next() : finish()); });
  document.body.appendChild(root);
  addEventListener('resize', show);
  step = 0;
  show();
}
function next() { step++; show(); }
function finish() {
  removeEventListener('resize', show);
  if (root) root.remove();
  root = null;
  try { localStorage.setItem(KEY, 'done'); } catch (e) { /* trình duyệt chặn lưu: lần sau hiện lại, không sao */ }
}

function show() {
  if (!root) return;
  while (step < STEPS.length && !target(STEPS[step])) step++; // phần nào không có trên màn hình thì bỏ qua
  if (step >= STEPS.length) return finish();
  const s = STEPS[step], el = target(s);
  el.scrollIntoView({ block: 'nearest' });
  const r = el.getBoundingClientRect(), pad = 6, W = innerWidth, H = innerHeight;
  const tipW = Math.min(320, W - 24), left = Math.max(12, Math.min(W - tipW - 12, r.left + r.width / 2 - tipW / 2));
  root.innerHTML = `<div class="tour-spot" style="left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px"></div>
    <div class="tour-tip" style="left:${left}px;width:${tipW}px">
      <b>${s.title}</b><p>${s.text}</p>
      <div class="tour-row"><small>${step + 1}/${STEPS.length}</small><button class="btn btn-ghost btn-sm" data-tour="skip">Bỏ qua</button><button class="btn btn-primary btn-sm" data-tour="next">${step === STEPS.length - 1 ? 'Xong' : 'Tiếp'}</button></div>
    </div>`;
  // Đo chiều cao thật rồi mới chọn chỗ: dưới phần được chỉ nếu đủ, không thì phía trên (neo bằng bottom, khỏi đụng transform của animation).
  const tip = root.querySelector('.tour-tip'), gap = pad + 10;
  if (r.bottom + gap + tip.offsetHeight <= H - 12) tip.style.top = `${r.bottom + gap}px`;
  else tip.style.bottom = `${Math.min(H - 12 - tip.offsetHeight, H - r.top + gap)}px`;
}
