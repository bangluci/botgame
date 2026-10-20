'use strict';
const { cdef, pubCard, cname, say, alive, ab, prompt, distance, weaponRange, drawCards, pull, suzy, heal } = require('./rules');

// ---------- kỹ năng chủ động: action { type: 'ability', name, cards?, target? } ----------
// on = loại prompt của chính người đó cho phép dùng; 'any' = lúc nào cũng được, kể cả ngoài lượt (Sid).
// cards = số lá phải bỏ từ tay (pick lọc lá hợp lệ); why → lý do chưa dùng được; run chạy sau khi đã bỏ lá.
const ACTIVE = {
  sid: {
    on: ['play', 'discard', 'dying', 'any'], cards: 2, label: '💉 Bỏ 2 lá → +1 máu',
    why: (g, p) => p.life >= p.maxLife && 'Bạn đang đầy máu',
    run: (g, p) => { heal(g, p, 1); say(g, `💉 ${p.name} bỏ 2 lá để hồi 1 máu (Sid) → ${p.life}/${p.maxLife}`); },
  },
  chuck: {
    on: ['play'], cards: 0, label: '🩸 Mất 1 máu → rút 2 lá',
    why: (g, p) => p.life <= 1 && 'Không được mất máu cuối cùng',
    run: (g, p) => { p.life--; const d = drawCards(g, p, 2); say(g, `🩸 ${p.name} mất 1 máu để rút ${d.length} lá (Chuck Wengam) → ${p.life}/${p.maxLife}`); },
  },
  doc: {
    on: ['play'], cards: 2, target: true, label: '🔫 Bỏ 2 lá → BANG!',
    why: (g, p) => p.used.doc && 'Mỗi lượt chỉ dùng 1 lần',
    // cs = null khi chỉ hỏi "có cặp lá nào bắn được không" (để tô mục tiêu)
    reach: (g, p, t, cs) => {
      const dist = distance(g, p, t);
      if (dist > weaponRange(g, p)) return `${t.name} ở khoảng cách ${dist}, ngoài tầm súng (${weaponRange(g, p)})`;
      if (ab(g, t, 'apache') && !(cs || p.hand).some((c) => c.suit !== 'D')) return 'Bắn Apache Kid thì phải có ít nhất 1 lá bỏ không phải ♦';
      return null;
    },
    run: function* (g, p, cs, t) {
      p.used.doc = true; // không tính vào giới hạn BANG! mỗi lượt
      g.last = { pid: p.id, card: pubCard(cs[0]), target: t.id, asBang: true };
      say(g, `🔫 ${p.name} bỏ ${cs.map((c) => cname(g, c)).join(', ')} để bắn ${t.name} (Doc Holyday)`);
      yield* require('./combat').bangAttack(g, p, t); // nạp lười: combat cũng nạp abilities
    },
  },
  jose: {
    on: ['play'], cards: 1, pick: (g, c) => cdef(g, c).kind === 'equip', pickWhy: 'Chọn 1 lá trang bị (viền xanh) trong tay', label: '🧰 Bỏ 1 trang bị → rút 2 lá',
    why: (g, p) => (p.used.jose || 0) >= 2 && 'Mỗi lượt chỉ dùng 2 lần',
    run: (g, p, cs) => { p.used.jose = (p.used.jose || 0) + 1; const d = drawCards(g, p, 2); say(g, `🧰 ${p.name} bỏ ${cname(g, cs[0])} để rút ${d.length} lá (José Delgado)`); },
  },
};
const INLINE = new Set(['play', 'discard', 'dying']); // prompt tự xử lý action ability; prompt khác thì ability chạy ngoài luồng
const asAbility = (act) => (act.type === 'sid' ? { ...act, type: 'ability', name: 'sid' } : act); // action 'sid' cũ lúc sắp chết

function checkAbility(g, p, act, where) {
  const name = act.name === undefined ? 'sid' : act.name; // action Sid cũ không có name
  const A = typeof name === 'string' && Object.hasOwn(ACTIVE, name) ? ACTIVE[name] : null;
  if (!A || !ab(g, p, name)) throw new Error('Bạn không có kỹ năng này');
  if (!A.on.includes(where)) throw new Error('Lúc này chưa dùng được kỹ năng này');
  const no = A.why(g, p);
  if (no) throw new Error(no);
  const ids = act.cards === undefined ? [] : act.cards;
  if (!Array.isArray(ids) || ids.length !== A.cards || new Set(ids).size !== ids.length) throw new Error(A.cards ? `Chọn đúng ${A.cards} lá khác nhau trong tay` : 'Kỹ năng này không cần bỏ lá');
  const cs = ids.map((id) => p.hand.find((c) => c.id === id));
  if (cs.some((c) => !c || (A.pick && !A.pick(g, c)))) throw new Error(A.pickWhy || `Chọn đúng ${A.cards} lá khác nhau trong tay`);
  let t = null;
  if (A.target) {
    t = g.players.find((x) => x.id === act.target && x.alive);
    if (!t || t === p) throw new Error('Hãy chọn 1 mục tiêu hợp lệ');
    const bad = A.reach(g, p, t, cs);
    if (bad) throw new Error(bad);
  }
  return { A, cs, t };
}
function* useAbility(g, p, act, where) {
  const { A, cs, t } = checkAbility(g, p, act, where);
  for (const c of cs) g.discard.push(pull(p, c.id));
  const r = A.run(g, p, cs, t);
  if (r) yield* r;
  suzy(g, p);
}
// Kỹ năng dùng được ngay lúc này (client sinh nút, bot chọn theo danh sách này).
function abilitiesFor(g, p, where) {
  if (!p.alive || !p.char) return [];
  const out = [];
  for (const [name, A] of Object.entries(ACTIVE)) {
    if (!ab(g, p, name) || !A.on.includes(where) || A.why(g, p)) continue;
    const pick = p.hand.filter((c) => !A.pick || A.pick(g, c)).map((c) => c.id);
    if (pick.length < A.cards) continue;
    const targets = A.target ? g.players.filter((t) => t.alive && t !== p && !A.reach(g, p, t, null)).map((t) => t.id) : null;
    if (targets && !targets.length) continue;
    out.push({ name, label: A.label, cards: A.cards, pick, ...(targets ? { targets } : {}) });
  }
  return out;
}
const whereFor = (g, p) => { const pr = g.pending; return pr && pr.player === p.id && INLINE.has(pr.type) ? pr.type : 'any'; };

module.exports = { ACTIVE, INLINE, asAbility, checkAbility, useAbility, abilitiesFor, whereFor };
