// Mảnh giao diện dùng chung: lá bài, máu, vai trò.
import { st, esc } from './store.js';

export const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_VI = { S: '♠ Bích', H: '♥ Cơ', D: '♦ Rô', C: '♣ Chuồn' };
export const ROLE_VI = { sheriff: 'Cảnh sát trưởng', deputy: 'Phó cảnh sát', outlaw: 'Ngoài vòng pháp luật', renegade: 'Kẻ phản bội' };
export const ROLE_ICON = { sheriff: '⭐', deputy: '🛡️', outlaw: '💀', renegade: '🎭' };
export const ROLE_HINT = {
  sheriff: 'Hạ hết Outlaw và Renegade.', deputy: 'Bảo vệ Cảnh sát trưởng tới cùng.',
  outlaw: 'Hạ Cảnh sát trưởng.', renegade: 'Là người cuối cùng còn sống: hạ Outlaw trước, Cảnh sát trưởng sau.',
};

export const G = () => st.S && st.S.game;
export const isRed = (c) => c.suit === 'H' || c.suit === 'D';
export const cardDef = (c) => (G() ? G().defs.cards[c.key] : null) || (st.meta && st.meta.cards.find((x) => x.key === c.key)) || { name: c.key, icon: '🂠', desc: '' };
export const charDef = (k) => (G() ? G().defs.chars[k] : null) || (st.meta && st.meta.characters.find((x) => x.key === k)) || null;

// Lá bài giấy: viền nâu = lá hành động, viền xanh = lá trang bị (như bản gốc).
export function cardHtml(c, o = {}) {
  const d = cardDef(c);
  const rank = `${esc(c.rank)}<i>${SYM[c.suit] || ''}</i>`;
  const attrs = o.a ? `data-a="${o.a}" data-id="${c.id}"` : 'tabindex="-1" disabled';
  return `<button type="button" class="card ${d.kind === 'equip' ? 'k-equip' : 'k-action'} ${isRed(c) ? 'red' : ''} ${o.cls || ''}" ${attrs} style="${o.style || ''}" aria-label="${esc(d.name)} ${SYM[c.suit] || ''}${esc(c.rank)}">
    <span class="c-corner">${rank}</span><span class="c-art" aria-hidden="true">${esc(d.icon)}</span>
    <span class="c-name">${esc(d.name)}</span><span class="c-corner c-br" aria-hidden="true">${rank}</span></button>`;
}
// Đồ trang bị nhỏ trên bàn của 1 người — bấm để xem mô tả.
export function gearHtml(c) {
  const d = cardDef(c);
  return `<button type="button" class="gear ${d.kind === 'equip' ? 'k-equip' : ''}" data-a="info-card" data-key="${esc(c.key)}" title="${esc(d.name)}"><span aria-hidden="true">${esc(d.icon)}</span>${esc(d.name)}<small class="${isRed(c) ? 'red' : ''}">${SYM[c.suit] || ''}${esc(c.rank)}</small></button>`;
}
export function lifeHtml(p) {
  const life = Math.max(0, p.life);
  let s = '';
  for (let i = 0; i < p.maxLife; i++) s += `<i class="pip ${i < life ? 'on' : ''}"></i>`;
  return `<span class="life" role="img" aria-label="${life}/${p.maxLife} máu">${s}</span>`;
}
export const roleBadge = (r, full) => (r ? `<span class="role r-${r}" title="${esc(ROLE_VI[r])}">${ROLE_ICON[r]}${full ? `<span class="role-txt"> ${esc(ROLE_VI[r])}</span>` : ''}</span>` : '<span class="role r-unknown" title="Chưa lộ vai">?</span>');
export const initials = (name) => esc(String(name).replace(/^🤖\s*/, '').trim().slice(0, 2).toUpperCase());
