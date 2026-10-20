'use strict';
// AI cho bot BANG!: chỉ đọc view công khai (engine.viewFor), suy luận vai qua view.last (ai đánh ai).
// rank(view, mem) → danh sách action theo ưu tiên; decide() lấy cái hợp lệ đầu tiên.

const VAL = { missed: 9, beer: 8, bang: 7, barrel: 7, wellsfargo: 7, stagecoach: 6, panic: 6, catbalou: 6, duel: 5, gatling: 5, indians: 5, mustang: 5, hideout: 5, binocular: 4, winchester: 4, jail: 4, scope: 4, generalstore: 4, saloon: 3, volcanic: 3, schofield: 3, remington: 3, carabine: 3, dynamite: 0 };
const GUN = { volcanic: 1, schofield: 2, remington: 3, carabine: 4, winchester: 5 };
const GOOD_EQUIP = ['barrel', 'mustang', 'scope', 'binocular', 'hideout'];
const DRAW = ['wellsfargo', 'stagecoach', 'generalstore'];
const AOE = ['gatling', 'indians'];
// ponytail: số Outlaw theo config/roles.json mặc định — view không lộ bảng vai; lệch nếu phòng tự sửa roles
const OUTLAWS = { 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 3, 10: 4 };
const CHAR_BONUS = { willy: 3, slab: 3, jourdonnais: 2, bart: 2, sid: 2, lucky: 2, paul: 2, suzy: 1, jesse: 1, kit: 1, blackjack: 1, rose: 1, janet: 1, gringo: 1, vulture: 1, pedro: 1, elena: 3, pixie: 2, sean: 1, tequila: 1, greg: 1, herb: 1, bill: 1,
  doc: 3, belle: 2, apache: 2, molly: 2, chuck: 2, jose: 1, pat: 1, vera: 1 };
const SUITS = ['H', 'D', 'C', 'S'];

const newMemory = () => ({ sus: {}, seen: null });
const abil = (v, name) => (v.me.abilities || []).find((a) => a.name === name); // kỹ năng engine báo dùng được ngay

// Giá trị giữ bài: lá lạ (tự thêm) đoán theo defs.
function val(v, c) {
  if (VAL[c.key] !== undefined) return VAL[c.key];
  const d = v.defs.cards[c.key] || {};
  return d.react === 'missed' ? 9 : d.isBeer ? 8 : d.bang ? 7 : 3;
}
const byVal = (v, cs) => cs.slice().sort((a, b) => val(v, a) - val(v, b)); // thấp → cao

// Điểm nghi ngờ: dương = giống Outlaw, âm = giống phe Sheriff. Gọi lại nhiều lần với cùng view.last không sao.
function observe(v, mem) {
  const L = v.last;
  if (!L || !L.card) return;
  const k = `${L.pid}:${L.card.id}:${L.target}`;
  if (k === mem.seen) return;
  mem.seen = k;
  if (!L.target) return; // mọi lá có mục tiêu (BANG!, Duel, Panic, Cat Balou, Jail) đều là đòn thù địch
  const t = v.players.find((p) => p.id === L.target), a = v.players.find((p) => p.id === L.pid);
  if (!t || !a) return;
  const s = mem.sus, add = (id, n) => { s[id] = (s[id] || 0) + n; };
  if (t.role === 'sheriff') add(a.id, 3);
  else if (s[t.id]) add(a.id, s[t.id] > 0 ? -1 : 1); // đánh kẻ đáng ngờ → phe Sheriff, và ngược lại
  if (a.role === 'sheriff') add(t.id, 1);
}

// > 0 = kẻ địch muốn đánh, < 0 = đồng minh.
function score(v, mem, p) {
  const r = v.me.role, sus = mem.sus[p.id] || 0;
  if (p.role === 'sheriff') return r === 'outlaw' || (r === 'renegade' && v.players.filter((x) => x.alive).length <= 2) ? 10 : -99;
  if (r === 'outlaw') return -sus;
  const deadOut = v.players.filter((x) => !x.alive && x.role === 'outlaw').length;
  const noOutlaw = deadOut >= (OUTLAWS[v.players.length] || 0); // hết Outlaw → người còn lại đáng ngờ là Renegade
  // Deputy chỉ đánh người lạ khi ván đã dài (chống bế tắc khi chưa ai lộ mặt)
  return sus + (r === 'deputy' && (v.round || 0) < 4 ? 0 : 0.1) + (noOutlaw ? 20 : 0);
}

function playList(v, mem, self, others, sc) {
  const me = v.me, D = v.defs.cards;
  const enemies = others.filter((p) => sc(p) > 0).sort((a, b) => sc(b) - sc(a) || a.life - b.life);
  const allies = others.filter((p) => sc(p) < 0);
  const has = (f) => me.hand.filter((c) => f(c, D[c.key] || {}));
  const P = (c, extra) => ({ type: 'play', card: c.id, ...extra });
  // rút bài chỉ khi còn bài để rút — hết chồng rút + chồng bỏ thì đánh lá rút bài chỉ xoay vòng vô tận
  const out = v.deck + (v.discard || 0) > 3 ? has((c) => DRAW.includes(c.key)).map((c) => P(c)) : [];
  // Chuck Wengam: còn dư máu mà ít bài thì đổi 1 máu lấy 2 lá
  if (abil(v, 'chuck') && self.life > 2 && me.hand.length <= 3) out.push({ type: 'ability', name: 'chuck' });
  // trang bị
  const hasGun = self.table.some((c) => GUN[c.key]);
  const curW = Math.max(1, ...self.table.map((c) => GUN[c.key] || 0));
  const bangs = has((c, d) => d.bang);
  for (const c of me.hand) {
    if (c.key === 'volcanic' ? !hasGun && bangs.length >= 2 && enemies.some((p) => p.dist === 1) : GUN[c.key] > curW) out.push(P(c));
    if (GOOD_EQUIP.includes(c.key) && !self.table.some((t) => t.key === c.key)) out.push(P(c));
    if (c.key === 'dynamite' && (me.role === 'outlaw' || me.role === 'renegade' || self.life >= 4)) out.push(P(c));
  }
  // hồi máu
  if (self.life < self.maxLife) out.push(...has((c, d) => d.isBeer).map((c) => P(c)));
  const lost = (ps) => ps.reduce((s, p) => s + p.maxLife - p.life, 0);
  if (lost([self, ...allies]) > lost(enemies)) out.push(...has((c) => c.key === 'saloon').map((c) => P(c)));
  // tấn công theo thứ tự kẻ địch
  const loot = (t) => byVal(v, t.table.filter((c) => c.key !== 'jail' && c.key !== 'dynamite')).reverse();
  const missed = has((c, d) => d.react === 'missed');
  for (const e of enemies) {
    if (e.role !== 'sheriff') out.push(...has((c) => c.key === 'jail').map((c) => P(c, { target: e.id })));
    for (const c of has((c, d) => d.steal)) out.push(...loot(e).map((t) => P(c, { target: e.id, zone: 'table', cardId: t.id })), P(c, { target: e.id, zone: 'hand' }));
    if (bangs.length >= 2 || e.hand <= 1) out.push(...has((c) => c.key === 'duel').map((c) => P(c, { target: e.id })));
    out.push(...bangs.map((c) => P(c, { target: e.id })));
    if (v.janet && missed.length >= 2) out.push(P(missed[0], { target: e.id, as: 'bang' })); // giữ lại 1 Missed! để đỡ
    // Doc Holyday: bỏ 2 lá rẻ nhất để bắn thêm; bắn Apache Kid thì cặp lá không được toàn ♦
    const doc = abil(v, 'doc');
    if (doc && doc.targets.includes(e.id) && me.hand.length >= 3) {
      const lo = byVal(v, me.hand), pair = lo.slice(0, 2);
      if (e.char === 'apache' && pair.every((c) => c.suit === 'D')) pair[1] = lo.find((c) => c.suit !== 'D') || pair[1];
      out.push({ type: 'ability', name: 'doc', cards: pair.map((c) => c.id), target: e.id });
    }
  }
  if (enemies.length && enemies.length >= allies.length && !allies.some((p) => p.life <= 1)) out.push(...has((c) => AOE.includes(c.key)).map((c) => P(c)));
  // Sid: dư bài thì đổi 2 lá rẻ lấy 1 máu
  if (abil(v, 'sid') && me.hand.length > self.life + 1) { const lo = byVal(v, me.hand); out.push({ type: 'ability', name: 'sid', cards: [lo[0].id, lo[1].id] }); }
  // José Delgado: lá trang bị còn lại trên tay (không đáng đặt ra) đổi lấy 2 lá
  const jose = abil(v, 'jose');
  if (jose) out.push(...byVal(v, me.hand.filter((c) => jose.pick.includes(c.id))).map((c) => ({ type: 'ability', name: 'jose', cards: [c.id] })));
  out.push({ type: 'end' });
  return out;
}

function rank(v, mem) {
  observe(v, mem);
  const pr = v.pending, me = v.me, D = v.defs.cards;
  if (!pr || !me) return [];
  const self = v.players.find((p) => p.id === pr.player);
  const others = v.players.filter((p) => p.alive && p !== self);
  const sc = (p) => score(v, mem, p);
  const lo = byVal(v, me.hand);
  switch (pr.type) {
    case 'play': return playList(v, mem, self, others, sc);
    case 'respond': {
      // engine gửi sẵn lá đỡ được (me.usable) — bao cả Janet, Elena Fuente và nhân vật tự thêm
      const usable = new Set(me.usable || []);
      const ok = (c) => { const r = (D[c.key] || {}).react; return usable.has(c.id) || r === pr.kind || (v.janet && (r === 'bang' || r === 'missed')); };
      const exact = (c) => ((D[c.key] || {}).react === pr.kind ? 0 : 1);
      return [...lo.filter(ok).sort((a, b) => exact(a) - exact(b)).map((c) => ({ type: 'respond', card: c.id })), { type: 'pass' }];
    }
    case 'dying': return [...me.hand.filter((c) => (D[c.key] || {}).isBeer).map((c) => ({ type: 'beer', card: c.id })),
      ...(abil(v, 'sid') && lo.length >= 2 ? [{ type: 'sid', cards: [lo[0].id, lo[1].id] }] : []), { type: 'pass' }];
    case 'pick': {
      let cs = byVal(v, pr.cards).reverse();
      if (pr.flip) { // Lucky Duke chọn lá cho "rút!"
        const good = /Dynamite/.test(pr.text) ? (c) => !(c.suit === 'S' && /^[2-9]$/.test(c.rank)) : (c) => c.suit === 'H';
        cs = [...pr.cards.filter(good), ...pr.cards];
      }
      return cs.map((c) => ({ type: 'pick', card: c.id }));
    }
    case 'kit': return byVal(v, pr.cards).map((c) => ({ type: 'back', card: c.id }));
    case 'choice': {
      if (pr.kind === 'pat') { // lấy đồ tốt của kẻ địch, không thì rút 2 như thường
        const take = pr.options.filter((o) => o.card && o.pid !== self.id && val(v, o.card) >= 5 && sc(v.players.find((p) => p.id === o.pid)) > 0)
          .sort((a, b) => val(v, b.card) - val(v, a.card));
        return [...take.map((o) => ({ type: 'choice', id: o.id })), { type: 'choice', id: 'deck' }];
      }
      if (pr.kind === 'vera') return pr.options.slice().sort((a, b) => (CHAR_BONUS[b.id] || 0) - (CHAR_BONUS[a.id] || 0)).map((o) => ({ type: 'choice', id: o.id }));
      if (pr.options.some((o) => o.id === 'discard')) { // Pedro
        const top = v.discardTop && val(v, v.discardTop) >= 7;
        return [{ type: 'choice', id: top ? 'discard' : 'deck' }, { type: 'choice', id: 'deck' }];
      }
      const donors = others.filter((p) => sc(p) > 0 && pr.options.some((o) => o.id === p.id)).sort((a, b) => b.hand - a.hand);
      return [...donors.map((p) => ({ type: 'choice', id: p.id })), ...pr.options.map((o) => ({ type: 'choice', id: o.id }))];
    }
    case 'char': {
      const w = (k) => ((v.defs.chars[k] || {}).life || 0) * 2 + (CHAR_BONUS[k] || 0);
      return pr.options.slice().sort((a, b) => w(b) - w(a)).map((k) => ({ type: 'char', key: k }));
    }
    case 'suit': {
      const n = (s) => me.hand.filter((c) => c.suit === s).length;
      return SUITS.slice().sort((a, b) => n(b) - n(a)).map((s) => ({ type: 'suit', suit: s }));
    }
    case 'discard': return lo.map((c) => ({ type: 'discard', card: c.id }));
    default: return [];
  }
}

// Ứng viên thô (vét cạn) khi mọi ứng viên của rank() bị từ chối.
function raw(v) {
  const pr = v.pending, me = v.me, out = [];
  if (pr.type === 'play') {
    for (const c of me.hand) {
      out.push({ type: 'play', card: c.id }, { type: 'play', card: c.id, as: 'bang' });
      for (const o of v.players.filter((p) => p.alive && p.id !== pr.player)) {
        out.push({ type: 'play', card: c.id, target: o.id }, { type: 'play', card: c.id, target: o.id, zone: 'hand' }, { type: 'play', card: c.id, target: o.id, as: 'bang' });
        for (const t of o.table) out.push({ type: 'play', card: c.id, target: o.id, zone: 'table', cardId: t.id });
      }
    }
  }
  const ids = me.hand.map((c) => c.id);
  return out.concat({ type: 'end' }, { type: 'pass' }, ...ids.map((card) => ({ type: 'respond', card })), ...ids.map((card) => ({ type: 'beer', card })),
    ...ids.map((card) => ({ type: 'discard', card })), ...(pr.cards || []).flatMap((c) => [{ type: 'pick', card: c.id }, { type: 'back', card: c.id }]),
    ...(pr.options || []).map((o) => (typeof o === 'string' ? { type: 'char', key: o } : { type: 'choice', id: o.id })), ...SUITS.map((suit) => ({ type: 'suit', suit })));
}

function decide(v, mem, isLegal) {
  if (!v || !v.pending || !v.me) return null;
  return rank(v, mem).find(isLegal) || raw(v).find(isLegal) || null;
}

module.exports = { newMemory, rank, decide, observe };
