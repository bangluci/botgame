// Chat chữ: khung chat (sảnh + tab Chat trong ngăn nhật ký), bong bóng chữ trên ghế, gửi tin.
import { st, esc, toast, post, rerender } from './store.js';

const KEEP = 50; // giống server: giữ 50 tin gần nhất
const BUBBLE_MS = 6000, BUBBLE_LEN = 60;

export const lastChatId = () => (st.chat.length ? st.chat[st.chat.length - 1].id : 0);
// Server chỉ gửi tin mới hơn lastChatId(), nên chỉ việc nối vào.
export function mergeChat(list) {
  const fresh = (list || []).filter((c) => c.id > lastChatId());
  if (fresh.length) st.chat = [...st.chat, ...fresh].slice(-KEEP);
}
export const unread = () => lastChatId() > st.ui.chatSeen;

// Tin chat còn "nóng" của pid để vẽ bong bóng (cùng dạng với emote: { e, t }).
export function chatBubble(pid) {
  const c = [...st.chat].reverse().find((x) => x.pid === pid);
  if (!c || st.S.now - c.t > BUBBLE_MS) return null;
  return { e: c.text.length > BUBBLE_LEN ? c.text.slice(0, BUBBLE_LEN - 1) + '…' : c.text, t: c.t, text: true };
}

export function chatHtml() {
  const me = st.S.lobby.me;
  const items = st.chat.map((c) => `<li class="${c.pid === me ? 'mine' : ''}"><b>${c.spec ? '👀 ' : ''}${esc(c.name)}</b> ${esc(c.text)}</li>`).join('');
  return `<ol class="log-list chat-list">${items || '<li class="dim">Chưa có tin nào — chào cả bàn một câu đi!</li>'}</ol>
    <div class="chat-form"><input id="chat-input" maxlength="200" autocomplete="off" placeholder="Nhắn cả phòng…" value="${esc(st.ui.chatDraft)}" aria-label="Tin nhắn"><button class="btn btn-sm" data-a="chat-send">Gửi</button></div>`;
}

export async function sendChat() {
  const text = st.ui.chatDraft.trim();
  if (!text) return;
  try {
    await post('chat', { text });
    st.ui.chatDraft = '';
    const el = document.getElementById('chat-input');
    if (el) el.value = '';
  } catch (e) { toast(e.message, 'err'); }
  rerender();
}

export const chatActions = { 'chat-send': () => sendChat() };
