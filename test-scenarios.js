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
  const g = fresh(4); const a = P(g);
  for (const q of g.players) q.char = 'bart'; // không ai có kỹ năng đổi khoảng cách
  const far = g.players.find((q) => q !== a && engine.viewFor(g, a.id).players.find((x) => x.id === q.id).dist === 2);
  const dist = () => engine.viewFor(g, a.id).players.find((x) => x.id === far.id).dist;
  for (const k of ['scope', 'binocular']) engine.apply(g, a.id, { type: 'play', card: give(g, a, k).id });
  assert.equal(dist(), 1, 'Scope + Binocular: 2 - 2 → tối thiểu 1');
  place(g, far, 'mustang'); place(g, far, 'hideout');
  assert.equal(dist(), 2, '2 + 2 (Mustang, Hideout) - 2 (Scope, Binocular)');
});
test('Không bật Dodge City thì không có nhân vật/lá mới', () => {
  const g = engine.newGame(members(4), {}, 3);
  assert.ok(!g.cfg.characters.pixie && !g.cfg.cards.binocular);
  assert.equal(g.cfg.deck.length, 80);
  const g2 = engine.newGame(members(4), DC, 3);
  assert.equal(g2.cfg.deck.length, 120); // 80 + 18 (phần 1) + 22 (phần 3)
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
  assert.deepEqual(engine.viewFor(g, a.id).me.playable[dBang.id].immune, [t.id], 'báo Apache miễn ♦ để ghế ghi đúng lý do');
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

test('Vulture Sam ×2 (Vera mượn): chia lần lượt từ người gần người chết nhất, chọn lá trên bàn hoặc bốc tay', () => {
  const g = fresh(5); const a = P(g), t = next(g, a), n1 = next(g, t), n2 = next(g, n1), n3 = next(g, n2);
  for (const q of [t, n1, n2, n3]) { q.char = 'willy'; q.vera = null; }
  n1.char = 'vulture'; n3.char = 'vera'; n3.vera = 'vulture';
  emptyHand(g, t); t.life = 1;
  const h1 = grab(g, t, (c) => c.key === 'panic'), h2 = grab(g, t, (c) => c.key === 'stagecoach' || c.key === 'wellsfargo');
  const sc = place(g, t, 'scope');
  const n1h = n1.hand.length, n3h = n3.hand.length;
  const bang = grab(g, a, (c) => c.key === 'bang' && c.suit !== 'D');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.ok(!t.alive && !t.hand.length && !t.table.length);
  assert.equal(g.pending.player, n1.id, 'người gần nhất theo chiều kim đồng hồ chọn trước');
  assert.equal(engine.viewFor(g, n1.id).pending.kind, 'vulture');
  engine.apply(g, n1.id, { type: 'choice', id: 'c' + sc.id });
  assert.equal(n1.hand.length, n1h + 2, 'n1: Scope + 1 lá bốc tay');
  assert.equal(n3.hand.length, n3h + 1, 'n3 (Vera): 1 lá bốc tay');
  assert.ok(n1.hand.includes(sc) && [h1, h2].every((c) => n1.hand.includes(c) || n3.hand.includes(c)) && !g.discard.includes(h1));
});

// ---------- Dodge City phần 3 ----------
const hasCard = (p, c) => p.hand.includes(c);
test('Lá xanh lá: đặt xuống, lượt đó chưa dùng được; Pony Express dùng lượt sau rút 3', () => {
  const g = fresh(); const p = P(g); p.char = 'willy';
  const pony = grab(g, p, (c) => c.key === 'ponyexpress'), knife = grab(g, p, (c) => c.key === 'knife');
  assert.deepEqual(engine.viewFor(g, p.id).me.playable[knife.id], { self: true, targets: [] }, 'lá xanh lá trên tay chỉ đặt xuống, không chọn mục tiêu');
  engine.apply(g, p.id, { type: 'play', card: pony.id });
  assert.ok(p.table.includes(pony) && !hasCard(p, pony));
  assert.throws(() => engine.apply(g, p.id, { type: 'use', card: pony.id }), /lượt sau/);
  assert.ok(engine.viewFor(g, p.id).players.find((x) => x.id === p.id).table[0].fresh, 'client thấy dấu "lượt sau"');
  g.turnNo++; // giả như đã sang lượt sau của p
  assert.ok(engine.viewFor(g, p.id).me.greens.some((x) => x.id === pony.id && x.self));
  const h = p.hand.length;
  engine.apply(g, p.id, { type: 'use', card: pony.id });
  assert.equal(p.hand.length, h + 3); assert.ok(!p.table.includes(pony) && g.discard.includes(pony));
});
test('Lá xanh lá có Missed! đỡ đòn ngoài lượt từ lượt kế tiếp; Bible đỡ xong rút 1', () => {
  const g = fresh(); const a = P(g), t = next(g, a); a.char = 'willy'; t.char = 'willy';
  emptyHand(g, t);
  const bible = place(g, t, 'bible'); bible.placed = g.turnNo - 1; // đặt từ lượt trước
  const life = t.life, bang = grab(g, a, (c) => c.key === 'bang' && c.suit !== 'D');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.equal(g.pending.type, 'respond'); assert.deepEqual(engine.viewFor(g, t.id).me.usable, [bible.id]);
  engine.apply(g, t.id, { type: 'respond', card: bible.id });
  assert.equal(t.life, life, 'né được'); assert.equal(t.hand.length, 1, 'Bible: rút 1 lá');
  assert.ok(!t.table.includes(bible));
  const g2 = fresh(); const a2 = P(g2), t2 = next(g2, a2); a2.char = 'willy'; t2.char = 'willy'; emptyHand(g2, t2);
  const hat = place(g2, t2, 'tengallonhat'); hat.placed = g2.turnNo; // vừa đặt trong lượt này
  const b2 = grab(g2, a2, (c) => c.key === 'bang' && c.suit !== 'D');
  const life2 = t2.life;
  engine.apply(g2, a2.id, { type: 'play', card: b2.id, target: t2.id });
  assert.equal(t2.life, life2 - 1, 'lá vừa đặt trong lượt hiện tại chưa đỡ được');
});
test('Lá xanh lá tấn công: Knife không tính giới hạn BANG!, Derringer bắn rồi rút 1', () => {
  const g = fresh(); const p = P(g), t = next(g, p); p.char = 'sid'; t.char = 'willy'; t.maxLife = t.life = 5; emptyHand(g, t);
  const knife = place(g, p, 'knife'); knife.placed = 0; const der = place(g, p, 'derringer'); der.placed = 0; g.turnNo = Math.max(g.turnNo, 1);
  const bang = grab(g, p, (c) => c.key === 'bang' && c.suit !== 'D');
  const life = t.life;
  engine.apply(g, p.id, { type: 'play', card: bang.id, target: t.id });
  engine.apply(g, p.id, { type: 'use', card: knife.id, target: t.id });
  const h = p.hand.length;
  engine.apply(g, p.id, { type: 'use', card: der.id, target: t.id });
  assert.equal(t.life, life - 3, 'BANG! + Knife + Derringer đều trúng'); assert.equal(p.hand.length, h + 1, 'Derringer rút 1');
});
test('Lá "+1": Springfield bắn xa không giới hạn, phải bỏ kèm lá khác; Whisky hồi 2', () => {
  const g = fresh(5); const p = P(g); p.char = 'willy';
  const far = g.players.find((q) => q !== p && engine.viewFor(g, p.id).players.find((x) => x.id === q.id).dist >= 2); far.char = 'willy'; emptyHand(g, far);
  const sp = grab(g, p, (c) => c.key === 'springfield');
  assert.equal(engine.viewFor(g, p.id).me.playable[sp.id].cost, 1);
  assert.throws(() => engine.apply(g, p.id, { type: 'play', card: sp.id, target: far.id }), /bỏ kèm/);
  const junk = grab(g, p, (c) => c.key === 'beer');
  const life = far.life;
  engine.apply(g, p.id, { type: 'play', card: sp.id, extra: junk.id, target: far.id });
  assert.equal(far.life, life - 1); assert.ok(g.discard.includes(junk) && !hasCard(p, junk));
  p.life = 1; const wh = grab(g, p, (c) => c.key === 'whisky'), j2 = grab(g, p, (c) => c.key !== 'whisky');
  engine.apply(g, p.id, { type: 'play', card: wh.id, extra: j2.id });
  assert.equal(p.life, 3);
});
test('Tequila hồi 1 máu cho người được chọn (hoặc mình); Dodge đỡ rồi rút 1; Punch không tính giới hạn', () => {
  const g = fresh(); const p = P(g), t = next(g, p); p.char = 'willy'; t.char = 'willy';
  t.life = t.maxLife - 2;
  const tq = grab(g, p, (c) => c.key === 'tequila'), j = grab(g, p, (c) => c.key !== 'tequila');
  engine.apply(g, p.id, { type: 'play', card: tq.id, extra: j.id, target: t.id });
  assert.equal(t.life, t.maxLife - 1);
  emptyHand(g, t); const dodge = grab(g, t, (c) => c.key === 'dodge');
  const bang = grab(g, p, (c) => c.key === 'bang' && c.suit !== 'D'), punch = grab(g, p, (c) => c.key === 'punch');
  engine.apply(g, p.id, { type: 'play', card: bang.id, target: t.id });
  engine.apply(g, t.id, { type: 'respond', card: dodge.id });
  assert.equal(t.hand.length, 1, 'Dodge: rút 1');
  const life = t.life; emptyHand(g, t);
  engine.apply(g, p.id, { type: 'play', card: punch.id, target: t.id });
  assert.equal(t.life, life - 1, 'Punch vẫn chơi được sau 1 BANG!');
});
test('Brawl: người chơi chọn với từng người bỏ lá trên tay hay trên bàn', () => {
  const g = fresh(4); const p = P(g); p.char = 'willy';
  const others = g.players.filter((q) => q !== p); for (const q of others) q.char = 'willy';
  const [o1, o2, o3] = [next(g, p), next(g, next(g, p)), next(g, next(g, next(g, p)))];
  const mus = place(g, o1, 'mustang'); emptyHand(g, o2); place(g, o2, 'barrel'); emptyHand(g, o3); grab(g, o3, (c) => c.key === 'beer');
  const br = grab(g, p, (c) => c.key === 'brawl'), j = grab(g, p, (c) => c.key !== 'brawl');
  const h1 = o1.hand.length;
  engine.apply(g, p.id, { type: 'play', card: br.id, extra: j.id });
  assert.equal(g.pending.player, p.id); assert.equal(engine.viewFor(g, p.id).pending.kind, 'brawl');
  engine.apply(g, p.id, { type: 'choice', id: 'c' + mus.id });
  assert.ok(!o1.table.includes(mus) && o1.hand.length === h1, 'o1 bỏ Mustang, giữ tay');
  assert.ok(!o2.table.length, 'o2 chỉ có 1 lá trên bàn nên tự bỏ'); assert.ok(!o3.hand.length, 'o3 chỉ có 1 lá trên tay nên tự bỏ');
});
test('Belle Star tắt lá xanh lá đỡ đòn; Apache Kid miễn Conestoga ♦', () => {
  const g = fresh(); const a = P(g), t = next(g, a); a.char = 'belle'; t.char = 'willy'; emptyHand(g, t);
  const plate = place(g, t, 'sombrero'); plate.placed = 0; g.turnNo = Math.max(g.turnNo, 1);
  const life = t.life, bang = grab(g, a, (c) => c.key === 'bang' && c.suit !== 'D');
  engine.apply(g, a.id, { type: 'play', card: bang.id, target: t.id });
  assert.equal(t.life, life - 1, 'trong lượt Belle không dùng được Sombrero');
  const g2 = fresh(); const p2 = P(g2), ap = next(g2, p2); p2.char = 'willy'; ap.char = 'apache';
  const con = place(g2, p2, 'conestoga'); con.placed = 0; g2.turnNo = Math.max(g2.turnNo, 1);
  assert.throws(() => engine.apply(g2, p2.id, { type: 'use', card: con.id, target: ap.id, zone: 'hand' }), /Apache Kid/);
});
test('Luật 3 người Dodge City: vai lật ngửa, Deputy đi trước, tự tay hạ mục tiêu thì thắng ngay', () => {
  const g = engine.newGame(members(3), DC, 5);
  while (g.pending.type !== 'play') { const pe = g.pending; engine.apply(g, pe.player, pe.type === 'choice' ? { type: 'choice', id: pe.data.pub.options[0].id } : { type: 'pass' }); }
  assert.ok(g.threeP); assert.deepEqual(g.players.map((p) => p.role).sort(), ['deputy', 'outlaw', 'renegade']);
  assert.equal(P(g).role, 'deputy', 'Deputy đi trước');
  const dep = P(g), out = g.players.find((p) => p.role === 'outlaw');
  assert.ok(engine.viewFor(g, out.id).players.every((p) => p.role), 'ai cũng thấy vai của nhau');
  const ren = g.players.find((p) => p.role === 'renegade');
  for (const p of g.players) { p.table = []; p.char = 'willy'; }
  emptyHand(g, ren); ren.life = 1;
  const bang = grab(g, dep, (c) => c.key === 'bang' && c.suit !== 'D');
  engine.apply(g, dep.id, { type: 'play', card: bang.id, target: ren.id });
  assert.ok(g.winner && g.winner.players.length === 1 && g.winner.players[0] === dep.id, 'Deputy tự tay hạ Renegade thì thắng');
  const g2 = engine.newGame(members(3), DC, 5);
  while (g2.pending.type !== 'play') { const pe = g2.pending; engine.apply(g2, pe.player, pe.type === 'choice' ? { type: 'choice', id: pe.data.pub.options[0].id } : { type: 'pass' }); }
  const d2 = P(g2), o2 = g2.players.find((p) => p.role === 'outlaw');
  for (const p of g2.players) { p.table = []; p.char = 'willy'; }
  emptyHand(g2, o2); o2.life = 1; const h = d2.hand.length;
  const b2 = grab(g2, d2, (c) => c.key === 'bang' && c.suit !== 'D');
  engine.apply(g2, d2.id, { type: 'play', card: b2.id, target: o2.id });
  assert.ok(!g2.winner, 'Deputy hạ Outlaw (không phải mục tiêu): chưa ai thắng, 2 người đấu tới cuối');
  assert.equal(d2.hand.length, h + 3, 'hạ ai cũng rút 3 (bốc 1 BANG!, chơi đi, được thưởng 3)');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log('✅', name); } catch (e) { fail++; console.log('❌', name, '—', e.message); }
}
console.log(fail ? `${fail}/${tests.length} kịch bản lỗi` : `OK ${tests.length}/${tests.length} kịch bản`);
process.exit(fail ? 1 : 0);
