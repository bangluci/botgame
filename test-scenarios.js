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
// Lấy 1 lá thoả f đưa vào tay p (có sẵn trên tay thì dùng luôn; không thì tìm ở chồng rút, chồng bỏ, tay người khác).
function grab(g, p, f) {
  const own = p.hand.find(f);
  if (own) return own;
  for (const pile of [g.deck, g.discard, ...g.players.filter((q) => q !== p).map((q) => q.hand)]) {
    const i = pile.findIndex(f);
    if (i >= 0) { const [c] = pile.splice(i, 1); p.hand.push(c); return c; }
  }
  return assert.fail('không tìm thấy lá phù hợp');
}
// Đặt 1 lá key trước mặt p.
const place = (g, p, key) => { const c = grab(g, p, (x) => x.key === key); p.hand.splice(p.hand.indexOf(c), 1); p.table.push(c); return c; };
const abilities = (g, p) => engine.viewFor(g, p.id).me.abilities.map((a) => a.name);
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
    const pe = g.pending; engine.apply(g, pe.player, pe.type === 'choice' ? { type: 'choice', id: pe.data.pub.options[0].id } : { type: 'pass' });
  }
  for (const p of g.players) { p.table = []; p.vera = null; } // bàn sạch, không ai đang mượn kỹ năng (Vera)
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

test('Khung kỹ năng: Sid dùng action cũ không name, cả ngoài lượt; viewFor gửi danh sách', () => {
  const g = fresh(); const a = P(g), t = next(g, a); t.char = 'sid'; t.life = t.maxLife - 1;
  assert.ok(abilities(g, t).includes('sid'), 'Sid dùng được ngoài lượt');
  assert.ok(!('sid' in engine.viewFor(g, t.id)) && !('sidCan' in engine.viewFor(g, t.id).me), 'bỏ cờ sid/sidCan cũ');
  const [c1, c2] = t.hand;
  engine.apply(g, t.id, { type: 'ability', cards: [c1.id, c2.id] });
  assert.equal(t.life, t.maxLife); assert.equal(g.pending.player, a.id, 'prompt của người đang tới lượt giữ nguyên');
  assert.ok(!abilities(g, t).includes('sid'), 'đầy máu thì không còn nút Sid');
});
test('Chuck Wengam: mất 1 máu rút 2, lặp được, không mất máu cuối, chỉ trong lượt mình', () => {
  const g = fresh(); const p = P(g), nx = next(g, p); p.char = 'chuck'; p.life = 3; nx.char = 'chuck';
  assert.ok(abilities(g, p).includes('chuck'));
  assert.throws(() => engine.apply(g, nx.id, { type: 'ability', name: 'chuck' }), /chưa dùng được/);
  const h = p.hand.length;
  engine.apply(g, p.id, { type: 'ability', name: 'chuck' });
  engine.apply(g, p.id, { type: 'ability', name: 'chuck' });
  assert.equal(p.life, 1); assert.equal(p.hand.length, h + 4);
  assert.throws(() => engine.apply(g, p.id, { type: 'ability', name: 'chuck' }), /máu cuối/);
  assert.ok(!abilities(g, p).includes('chuck'));
});
test('Doc Holyday: bỏ 2 lá bắn BANG!, không tính giới hạn, mỗi lượt 1 lần', () => {
  const g = fresh(); const a = P(g), t = next(g, a); a.char = 'doc'; t.char = 'willy';
  emptyHand(g, t); const life = t.life;
  const bang = grab(g, a, (c) => c.key === 'bang');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.equal(t.life, life - 1);
  const c1 = grab(g, a, (c) => c.key === 'beer'), c2 = grab(g, a, (c) => c.key === 'beer' && c !== c1);
  const doc = engine.viewFor(g, a.id).me.abilities.find((x) => x.name === 'doc');
  assert.ok(doc && doc.targets.includes(t.id), 'người cạnh bên là mục tiêu của Doc');
  emptyHand(g, t);
  engine.apply(g, a.id, { type: 'ability', name: 'doc', cards: [c1.id, c2.id], target: t.id });
  assert.equal(t.life, life - 2, 'đã bắn 1 BANG! vẫn dùng được Doc');
  assert.ok(g.discard.includes(c1) && g.discard.includes(c2) && !a.hand.includes(c1));
  const [d1, d2] = a.hand;
  assert.throws(() => engine.apply(g, a.id, { type: 'ability', name: 'doc', cards: [d1.id, d2.id], target: t.id }), /1 lần/);
});
test('José Delgado: bỏ 1 trang bị rút 2, tối đa 2 lần mỗi lượt', () => {
  const g = fresh(); const p = P(g); p.char = 'jose';
  const [e1, e2, e3] = ['barrel', 'mustang', 'scope'].map((k) => grab(g, p, (c) => c.key === k));
  const beer = grab(g, p, (c) => c.key === 'beer');
  const jose = engine.viewFor(g, p.id).me.abilities.find((x) => x.name === 'jose');
  assert.ok(jose.pick.includes(e1.id) && !jose.pick.includes(beer.id), 'chỉ lá viền xanh chọn được');
  assert.throws(() => engine.apply(g, p.id, { type: 'ability', name: 'jose', cards: [beer.id] }), /trang bị/);
  const h = p.hand.length;
  engine.apply(g, p.id, { type: 'ability', name: 'jose', cards: [e1.id] });
  engine.apply(g, p.id, { type: 'ability', name: 'jose', cards: [e2.id] });
  assert.equal(p.hand.length, h + 2);
  assert.throws(() => engine.apply(g, p.id, { type: 'ability', name: 'jose', cards: [e3.id] }), /2 lần/);
});
test('Pat Brennan: lấy 1 lá trên bàn bất kỳ ai thay cho rút 2', () => {
  const g = fresh(); const nx = next(g, P(g)); nx.char = 'pat';
  const other = next(g, nx); const b = place(g, other, 'barrel');
  const h = nx.hand.length; endTurn(g);
  assert.equal(g.pending.type, 'choice'); assert.equal(g.pending.player, nx.id);
  assert.equal(engine.viewFor(g, nx.id).pending.kind, 'pat');
  engine.apply(g, nx.id, { type: 'choice', id: 'c' + b.id });
  assert.ok(nx.hand.includes(b) && !other.table.includes(b)); assert.equal(nx.hand.length, h + 1, 'chỉ 1 lá đó, không rút thêm');
  const g2 = fresh(); const n2 = next(g2, P(g2)); n2.char = 'pat'; place(g2, P(g2), 'mustang');
  const h2 = n2.hand.length; endTurn(g2);
  engine.apply(g2, n2.id, { type: 'choice', id: 'deck' });
  assert.equal(n2.hand.length, h2 + 2, 'chọn rút bài thì rút 2 như thường');
});
test('Vera Custer: mượn kỹ năng nhân vật khác tới lượt sau; ở tù thì mất kỹ năng (FAQ Q13)', () => {
  const g = fresh(); const nx = next(g, P(g)); nx.char = 'vera';
  const other = next(g, nx); other.char = 'pixie';
  const h = nx.hand.length; endTurn(g);
  assert.equal(g.pending.player, nx.id); assert.equal(engine.viewFor(g, nx.id).pending.kind, 'vera');
  assert.ok(!g.pending.data.pub.options.some((o) => o.id === 'vera'), 'không tự chọn chính mình');
  engine.apply(g, nx.id, { type: 'choice', id: 'pixie' });
  assert.equal(nx.hand.length, h + 3, 'rút 3 nhờ kỹ năng Pixie Pete');
  endTurn(g);
  assert.equal(engine.viewFor(g, P(g).id).players.find((x) => x.id === nx.id).vera, 'pixie', 'giữ kỹ năng mượn tới lượt sau');
  const g2 = fresh(); const v2 = next(g2, P(g2)); v2.char = 'vera'; v2.vera = 'pixie';
  place(g2, v2, 'jail');
  const spade = grab(g2, P(g2), (c) => c.suit === 'S'); P(g2).hand.pop(); g2.deck.push(spade); // lá rút! đầu chồng là ♠ → không thoát
  endTurn(g2);
  assert.notEqual(g2.pending.player, v2.id, 'ở tù mất lượt'); assert.equal(v2.vera, null, 'không còn kỹ năng mượn');
});
test('Belle Star: trong lượt cô, Barrel và Mustang của người khác mất tác dụng', () => {
  const g = fresh(); const a = P(g), t = next(g, a); a.char = 'belle'; t.char = 'willy';
  place(g, t, 'barrel'); place(g, t, 'mustang');
  const dist = () => engine.viewFor(g, a.id).players.find((x) => x.id === t.id).dist;
  assert.equal(dist(), 1, 'Mustang không tính');
  emptyHand(g, t); const life = t.life, n = g.log.length;
  const bang = grab(g, a, (c) => c.key === 'bang');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.equal(t.life, life - 1, 'trúng đạn');
  assert.ok(!g.log.slice(n).some((l) => l.includes('Barrel')), 'không được rút! Barrel');
  a.char = 'willy';
  assert.equal(dist(), 2, 'không phải Belle thì Mustang có tác dụng lại');
});
test('Apache Kid: lá ♦ người khác đánh vào không có tác dụng, trừ Duel; Doc cần 1 lá không ♦', () => {
  const g = fresh(); const a = P(g), t = next(g, a); t.char = 'apache'; a.char = 'doc';
  for (const q of g.players) if (q !== a) { q.char = 'willy'; emptyHand(g, q); }
  t.char = 'apache';
  const dBang = grab(g, a, (c) => c.key === 'bang' && c.suit === 'D');
  assert.throws(() => engine.apply(g, a.id, { type: 'play', card: dBang.id, target: t.id }), /Apache Kid/);
  assert.ok(!((engine.viewFor(g, a.id).me.playable[dBang.id] || {}).targets || []).includes(t.id), 'không tô Apache là mục tiêu');
  const lives = g.players.map((q) => q.life);
  const ind = grab(g, a, (c) => c.key === 'indians' && c.suit === 'D');
  engine.apply(g, a.id, { type: 'play', card: ind.id });
  g.players.forEach((q, i) => assert.equal(q.life, lives[i] - (q === a || q === t ? 0 : 1), 'Indians! ♦ với ' + q.name));
  const ti = g.players.indexOf(t);
  const d1 = grab(g, a, (c) => c.suit === 'D' && c.key !== 'bang'), d2 = grab(g, a, (c) => c.suit === 'D' && c !== d1 && c.key !== 'bang');
  assert.throws(() => engine.apply(g, a.id, { type: 'ability', name: 'doc', cards: [d1.id, d2.id], target: t.id }), /không phải ♦/);
  const ok = grab(g, a, (c) => c.suit !== 'D');
  engine.apply(g, a.id, { type: 'ability', name: 'doc', cards: [d1.id, ok.id], target: t.id });
  assert.equal(t.life, lives[ti] - 1, 'Doc bắn trúng nhờ 1 lá không ♦');
  const duel = grab(g, a, (c) => c.key === 'duel' && c.suit === 'D');
  engine.apply(g, a.id, { type: 'play', card: duel.id, target: t.id });
  assert.equal(t.life, lives[ti] - 2, 'Duel ♦ vẫn có tác dụng');
});
test('Molly Stark: ngoài lượt dùng Missed!/BANG! thì rút 1; Duel rút bù khi xong; trong lượt mình thì không', () => {
  const g = fresh(); const a = P(g), t = next(g, a); t.char = 'molly'; a.char = 'willy';
  emptyHand(g, t); const m = grab(g, t, (c) => c.key === 'missed');
  const bang = grab(g, a, (c) => c.key === 'bang');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  engine.apply(g, t.id, { type: 'respond', card: m.id });
  assert.equal(t.hand.length, 1, 'đỡ BANG! xong rút 1 lá');
  const g2 = fresh(); const a2 = P(g2), t2 = next(g2, a2); t2.char = 'molly'; a2.char = 'willy';
  emptyHand(g2, t2); emptyHand(g2, a2);
  const b1 = grab(g2, t2, (c) => c.key === 'bang'), b2 = grab(g2, t2, (c) => c.key === 'bang' && c !== b1);
  const duel = grab(g2, a2, (c) => c.key === 'duel'), myBang = grab(g2, a2, (c) => c.key === 'bang');
  engine.apply(g2, a2.id, { type: 'play', card: duel.id, target: t2.id });
  engine.apply(g2, t2.id, { type: 'respond', card: b1.id });
  assert.equal(t2.hand.length, 1, 'giữa Duel chưa rút');
  engine.apply(g2, a2.id, { type: 'respond', card: myBang.id });
  const life = a2.life;
  engine.apply(g2, t2.id, { type: 'respond', card: b2.id });
  assert.equal(a2.life, life - 1, 'người chơi Duel hết BANG! nên mất máu');
  assert.equal(t2.hand.length, 2, 'Duel xong rút bù 2 lá');
  const g3 = fresh(); const p3 = P(g3); p3.char = 'molly'; p3.life = 1;
  const beer = grab(g3, p3, (c) => c.key === 'beer'), h3 = p3.hand.length;
  engine.apply(g3, p3.id, { type: 'play', card: beer.id });
  assert.equal(p3.hand.length, h3 - 1, 'trong lượt mình không rút');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('✅', name); } catch (e) { fail++; console.log('❌', name, '—', e.message); }
}
console.log(fail ? `${fail}/${tests.length} kịch bản lỗi` : `OK ${tests.length}/${tests.length} kịch bản`);
process.exit(fail ? 1 : 0);
