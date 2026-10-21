// Mảnh giao diện dùng chung: lá bài, máu, vai trò.
import { st, esc } from './store.js';

export const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_VI = { S: '♠ Bích', H: '♥ Cơ', D: '♦ Rô', C: '♣ Chuồn' };
export const ROLE_VI = { sheriff: 'Cảnh sát trưởng', deputy: 'Phó cảnh sát', outlaw: 'Ngoài vòng pháp luật', renegade: 'Kẻ phản bội' };
export const ROLE_ICON = { sheriff: '⭐', deputy: '🛡️', outlaw: '💀', renegade: '🎭' };
// Dodge City 3 người: vai lật ngửa, mỗi người phải tự tay hạ đúng 1 người
export const ROLE_HINT_3P = { deputy: 'Tự tay hạ Kẻ phản bội.', renegade: 'Tự tay hạ Kẻ ngoài vòng pháp luật.', outlaw: 'Tự tay hạ Phó cảnh sát.' };
export const ROLE_HINT = {
  sheriff: 'Hạ hết Outlaw và Renegade.', deputy: 'Bảo vệ Cảnh sát trưởng tới cùng.',
  outlaw: 'Hạ Cảnh sát trưởng.', renegade: 'Là người cuối cùng còn sống: hạ Outlaw trước, Cảnh sát trưởng sau.',
};

export const G = () => (st.replay && st.replay.view) || (st.S && st.S.game); // đang xem lại: ảnh chụp của bước đang xem
export const isRed = (c) => c.suit === 'H' || c.suit === 'D';
export const cardDef = (c) => (G() ? G().defs.cards[c.key] : null) || (st.meta && st.meta.cards.find((x) => x.key === c.key)) || { name: c.key, icon: '🂠', desc: '' };
export const charDef = (k) => (G() ? G().defs.chars[k] : null) || (st.meta && st.meta.characters.find((x) => x.key === k)) || null;

// Lá bài giấy: viền nâu = lá hành động, viền xanh = lá trang bị (như bản gốc).
export function cardHtml(c, o = {}) {
  const d = cardDef(c);
  const rank = `${esc(c.rank)}<i>${SYM[c.suit] || ''}</i>`;
  const attrs = o.a ? `data-a="${o.a}" data-id="${c.id}"` : 'tabindex="-1" disabled';
  return `<button type="button" class="card ${d.kind === 'equip' ? 'k-equip' : d.kind === 'green' ? 'k-green' : 'k-action'} ${isRed(c) ? 'red' : ''} ${o.cls || ''}" ${attrs} style="${o.style || ''}" aria-label="${esc(d.name)} ${SYM[c.suit] || ''}${esc(c.rank)}">
    <span class="c-corner">${rank}</span><span class="c-art" aria-hidden="true">${esc(d.icon)}</span>
    <span class="c-name">${esc(d.name)}</span><span class="c-corner c-br" aria-hidden="true">${rank}</span></button>`;
}
// Đồ trang bị nhỏ trên bàn của 1 người — bấm để xem mô tả.
export function gearHtml(c) {
  const d = cardDef(c);
  const kind = d.kind === 'equip' ? 'k-equip' : d.kind === 'green' ? 'k-green' : '';
  return `<button type="button" class="gear ${kind} ${c.fresh ? 'fresh' : ''}" data-a="info-card" data-key="${esc(c.key)}" title="${esc(d.name)}${c.fresh ? ' — vừa đặt, lượt sau mới dùng được' : ''}"><span aria-hidden="true">${esc(d.icon)}</span>${esc(d.name)}<small class="${isRed(c) ? 'red' : ''}">${SYM[c.suit] || ''}${esc(c.rank)}</small></button>`;
}
export function lifeHtml(p) {
  const life = Math.max(0, p.life);
  let s = '';
  for (let i = 0; i < p.maxLife; i++) s += `<i class="pip ${i < life ? 'on' : ''}"></i>`;
  return `<span class="life" role="img" aria-label="${life}/${p.maxLife} máu">${s}</span>`;
}
export const roleBadge = (r, full) => (r ? `<span class="role r-${r}" title="${esc(ROLE_VI[r])}">${ROLE_ICON[r]}${full ? `<span class="role-txt"> ${esc(ROLE_VI[r])}</span>` : ''}</span>` : '<span class="role r-unknown" title="Chưa lộ vai">?</span>');
export const initials = (name) => esc(String(name).replace(/^🤖\s*/, '').trim().slice(0, 2).toUpperCase());
