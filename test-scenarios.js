'use strict';
// Kịch bản kiểm từng kỹ năng/luật cụ thể (bổ sung cho fuzz ở test.js).  Chạy: node test-scenarios.js
const assert = require('assert');
const engine = require('./engine');

const DC = { rules: { dodgeCity: true } };
const members = (n) => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
const P = (g) => g.players.find((p) => p.id === g.pending.player);
const next = (g, p) => { const ps = g.players, i = ps.indexOf(p); for (let k = 1; k < ps.length; k++) { const q = ps[(i + k) % ps.length]; if (q.alive) return q; } return p; };
// Rút 1 lá cụ thể từ chồng rút đưa vào tay (để dựng tình huống).
function give(g, p, key) {
  const i = g.deck.findIndex((c) => c.key === key);
  assert.ok(i >= 0, `chồng rút không còn lá ${key}`);
  const [c] = g.deck.splice(i, 1); p.hand.push(c); return c;
}
// Bỏ hết bài trên tay vào chồng bỏ (để người đó không đỡ được gì).
const emptyHand = (g, p) => { g.discard.push(...p.hand); p.hand = []; };
// Người đang tới lượt kết thúc lượt; nếu phải bỏ bài thì bỏ lá đầu.
function endTurn(g) {
  const p = P(g);
  engine.apply(g, p.id, { type: 'end' });
  while (g.pending && g.pending.player === p.id && g.pending.type === 'discard') engine.apply(g, p.id, { type: 'discard', card: p.hand[0].id });
}
// Ván mới, dừng ở prompt 'play' đầu tiên của Cảnh sát trưởng.
function fresh(n = 4, settings = DC, seed = 7) {
  const g = engine.newGame(members(n), settings, seed);
  while (g.pending.type !== 'play') { // Jesse/Pedro… đầu lượt: chọn chồng rút
    const pe = g.pending; engine.apply(g, pe.player, pe.type === 'choice' ? { type: 'choice', id: 'deck' } : { type: 'pass' });
  }
  for (const p of g.players) { p.table = []; } // bàn sạch: không Barrel/Mustang lệch kết quả
  return g;
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Pixie Pete rút 3 lá đầu lượt', () => {
  const g = fresh(); const nx = next(g, P(g)); nx.char = 'pixie';
  const before = nx.hand.length; endTurn(g);
  assert.equal(P(g), nx); assert.equal(nx.hand.length, before + 3);
});
test('Bill Noface rút 1 + số máu đã mất', () => {
  const g = fresh(); const nx = next(g, P(g)); nx.char = 'bill'; nx.life = nx.maxLife - 2;
  const before = nx.hand.length; endTurn(g);
  assert.equal(nx.hand.length, before + 3);
  const g2 = fresh(); const n2 = next(g2, P(g2)); n2.char = 'bill'; n2.life = n2.maxLife;
  const b2 = n2.hand.length; endTurn(g2);
  assert.equal(n2.hand.length, b2 + 1, 'đầy máu chỉ rút 1');
});
test('Sean Mallory giữ được tới 10 lá', () => {
  const g = fresh(); const p = P(g); p.char = 'sean'; p.life = 2;
  while (p.hand.length < 9) give(g, p, g.deck[g.deck.length - 1].key);
  engine.apply(g, p.id, { type: 'end' });
  assert.notEqual(g.pending.player, p.id, 'không phải bỏ bài khi có 9 lá');
  assert.equal(p.hand.length, 9);
});
test('Tequila Joe: Beer hồi 2 máu, kể cả lúc sắp chết', () => {
  const g = fresh(); const p = P(g); p.char = 'tequila'; p.life = 1;
  const beer = give(g, p, 'beer');
  engine.apply(g, p.id, { type: 'play', card: beer.id });
  assert.equal(p.life, 3);
  // sắp chết: 1 Beer đưa từ 0 lên 2
  const g2 = fresh(); const a = P(g2), t = next(g2, a); t.char = 'tequila'; t.life = 1;
  emptyHand(g2, t); give(g2, t, 'beer');
  const bang = give(g2, a, 'bang');
  engine.apply(g2, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.equal(g2.pending.type, 'dying'); assert.equal(g2.pending.player, t.id);
  engine.apply(g2, t.id, { type: 'beer', card: t.hand[0].id });
  assert.equal(t.life, 2); assert.ok(t.alive);
});
test('Greg Digger hồi 2 máu, Herb Hunter rút 2 lá khi có người bị loại', () => {
  const g = fresh(5); const a = P(g), t = next(g, a);
  const others = g.players.filter((x) => x !== a && x !== t);
  const greg = others[0], herb = others[1];
  greg.char = 'greg'; greg.life = 1; herb.char = 'herb';
  t.char = 'bart'; t.life = 1; t.role = 'outlaw'; a.role = a.role === 'sheriff' ? 'sheriff' : 'deputy';
  emptyHand(g, t);
  const herbBefore = herb.hand.length;
  const bang = give(g, a, 'bang');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.ok(!t.alive, 'mục tiêu bị loại');
  assert.equal(greg.life, 3, 'Greg hồi 2');
  assert.equal(herb.hand.length, herbBefore + 2, 'Herb rút 2');
});
test('Elena Fuente đỡ BANG! bằng lá bất kỳ', () => {
  const g = fresh(); const a = P(g), t = next(g, a); t.char = 'elena';
  emptyHand(g, t); give(g, t, 'beer');
  const life = t.life, bang = give(g, a, 'bang');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.equal(g.pending.type, 'respond'); assert.equal(g.pending.player, t.id);
  const v = engine.viewFor(g, t.id);
  assert.deepEqual(v.me.usable, [t.hand[0].id], 'Beer được tô là lá đỡ được');
  engine.apply(g, t.id, { type: 'respond', card: t.hand[0].id });
  assert.equal(t.life, life, 'né được, không mất máu');
});
test('Binocular dùng chung với Scope, Hideout dùng chung với Mustang', () => {
  const g = fresh(4); const a = P(g); a.char = 'bart';
  const far = g.players.find((q) => q !== a && engine.viewFor(g, a.id).players.find((x) => x.id === q.id).dist === 2);
  far.char = 'bart';
  const dist = () => engine.viewFor(g, a.id).players.find((x) => x.id === far.id).dist;
  for (const k of ['scope', 'binocular']) engine.apply(g, a.id, { type: 'play', card: give(g, a, k).id });
  assert.equal(dist(), 1, 'Scope + Binocular: 2 - 2 → tối thiểu 1');
  far.table.push(...['mustang', 'hideout'].map((k) => { const i = g.deck.findIndex((c) => c.key === k); return g.deck.splice(i, 1)[0]; }));
  assert.equal(dist(), 2, '2 + 2 (Mustang, Hideout) - 2 (Scope, Binocular)');
});
test('Không bật Dodge City thì không có nhân vật/lá mới', () => {
  const g = engine.newGame(members(4), {}, 3);
  assert.ok(!g.cfg.characters.pixie && !g.cfg.cards.binocular);
  assert.equal(g.cfg.deck.length, 80);
  const g2 = engine.newGame(members(4), DC, 3);
  assert.equal(g2.cfg.deck.length, 98);
});

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('✅', name); } catch (e) { fail++; console.log('❌', name, '—', e.message); }
}
console.log(fail ? `${fail}/${tests.length} kịch bản lỗi` : `OK ${tests.length}/${tests.length} kịch bản`);
process.exit(fail ? 1 : 0);
