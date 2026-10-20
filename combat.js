'use strict';
// Đòn đánh và hậu quả: rút!, sát thương, sắp chết, bị loại (Vulture Sam chia bài), xét thắng, đỡ đòn, BANG!, Duel.
const { OVER, SYM, rnd, cdef, pubCard, cname, say, alive, ab, gear, prompt, nextAlive, othersFrom, beerAmount, beersFor, popDeck, drawCards, takeHand, heal, mollyCard, molly } = require('./rules');
const { checkAbility, useAbility, abilitiesFor, asAbility } = require('./abilities');

// ---------- rút! ----------
function* drawCheck(g, p, test, why) {
  const flips = [];
  for (let i = 0; i < (ab(g, p, 'lucky') ? 2 : 1); i++) { const c = popDeck(g); if (!c) break; g.discard.push(c); flips.push(c); }
  if (!flips.length) return false;
  let ch = flips[0];
  if (flips.length > 1) {
    const a = yield prompt(p, 'pick', { text: `Lucky Duke: chọn 1 lá cho "rút!" (${why})`, pub: { cards: flips.map(pubCard), flip: true } },
      (act) => { if (act.type !== 'pick' || !flips.some((c) => c.id === act.card)) throw new Error('Hãy chọn 1 trong các lá vừa lật'); });
    ch = flips.find((c) => c.id === a.card);
  }
  const suit = g.mods.drawSuit || ch.suit;
  const ok = !!test(suit, ch.rank);
  say(g, `🎴 ${p.name} rút! cho ${why}: ${SYM[suit]}${ch.rank} → ${ok ? 'được' : 'không'}`);
  return ok;
}

// ---------- sát thương, chết, thắng ----------
function* damage(g, t, amount, src, why) {
  if (!t.alive || amount <= 0) return;
  t.life -= amount;
  say(g, `💔 ${t.name} mất ${amount} máu (${why}) → ${Math.max(0, t.life)}/${t.maxLife}`);
  if (t.life <= 0) yield* dying(g, t, src);
  if (t.alive) {
    if (ab(g, t, 'bart')) { const d = drawCards(g, t, amount); if (d.length) say(g, `${t.name} rút ${d.length} lá (Bart).`); }
    if (ab(g, t, 'gringo') && src && src !== t && src.alive && src.hand.length) {
      for (let i = 0; i < amount && src.hand.length; i++) { const c = takeHand(g, src, rnd(g, src.hand).id); t.hand.push(c); }
      say(g, `${t.name} lấy bài từ tay ${src.name} (El Gringo).`);
    }
  }
}
function* dying(g, t, src) {
  while (t.life <= 0) {
    const canAb = abilitiesFor(g, t, 'dying').length > 0; // vd Sid bỏ 2 lá hồi máu
    if (!beersFor(g, t).length && !canAb) break;
    const need = Math.ceil((1 - t.life) / Math.max(1, beerAmount(g, null, t)));
    const a = yield prompt(t, 'dying', { text: `${t.name} sắp chết! Cần ${need} Beer để cứu.`, pub: { need } }, (act) => {
      if (act.type === 'pass') return;
      if (act.type === 'beer') { if (!beersFor(g, t).some((c) => c.id === act.card)) throw new Error('Hãy chọn 1 Beer trong tay'); return; }
      if (act.type === 'sid' || act.type === 'ability') { checkAbility(g, t, asAbility(act), 'dying'); return; }
      throw new Error('Hành động không hợp lệ');
    });
    if (a.type === 'pass') break;
    if (a.type === 'beer') {
      const c = takeHand(g, t, a.card); g.discard.push(c); heal(g, t, beerAmount(g, null, t));
      say(g, `🍺 ${t.name} uống Beer để cứu mạng → ${t.life}/${t.maxLife}`);
      molly(g, t, 1);
    } else yield* useAbility(g, t, asAbility(a), 'dying');
  }
  if (t.life <= 0) yield* die(g, t, src);
}
// ≥2 người có kỹ năng Vulture Sam (vd Vera mượn): chia lần lượt, người gần người chết nhất theo chiều kim đồng hồ chọn trước;
// mỗi lượt lấy 1 lá ngẫu nhiên trên tay hoặc 1 lá trên bàn (FAQ Dodge City). pub.limbo = số lá đang chờ chia.
function* vultureSplit(g, t, vul, hand, table) {
  for (let k = 0; hand.length || table.length; k++) {
    const q = vul[k % vul.length];
    const opts = [...(hand.length ? [{ id: 'hand', label: `1 lá ngẫu nhiên trên tay (${hand.length})` }] : []), ...table.map((c) => ({ id: 'c' + c.id, label: cname(g, c), card: pubCard(c) }))];
    let id = opts[0].id;
    if (opts.length > 1) {
      const a = yield prompt(q, 'choice', { text: `Vulture Sam: lấy lá nào của ${t.name}?`, pub: { kind: 'vulture', options: opts, limbo: hand.length + table.length } },
        (act) => { if (act.type !== 'choice' || !opts.some((o) => o.id === act.id)) throw new Error('Hãy chọn 1 lá'); });
      id = a.id;
    }
    const c = id === 'hand' ? hand.splice(Math.floor(g.rng() * hand.length), 1)[0] : table.splice(table.findIndex((x) => 'c' + x.id === id), 1)[0];
    q.hand.push(c);
    say(g, `🦅 ${q.name} lấy ${id === 'hand' ? '1 lá trên tay' : cname(g, c)} của ${t.name} (Vulture Sam).`);
  }
}
function* die(g, t, src) {
  t.alive = false; t.life = Math.min(0, t.life);
  say(g, `☠️ ${t.name} (${g.cfg.characters[t.char].name}) bị loại! Vai trò: ${ROLE_VI[t.role]}.`);
  if (g.first === t) g.first = nextAlive(g, t, 1); // giữ mốc "vòng" khi người mở vòng chết (chế độ không Sheriff)
  // Vulture Sam nhặt bài trước, rồi mới tới thưởng/phạt (FAQ chính thức Q18)
  const hand = t.hand, table = t.table; t.hand = []; t.table = [];
  const vul = othersFrom(g, t).filter((q) => ab(g, q, 'vulture')); // theo chiều kim đồng hồ từ người chết
  if (!vul.length || !(hand.length + table.length)) g.discard.push(...hand, ...table);
  else if (vul.length === 1) { vul[0].hand.push(...hand, ...table); say(g, `🦅 ${vul[0].name} nhặt ${hand.length + table.length} lá của ${t.name} (Vulture Sam).`); }
  else yield* vultureSplit(g, t, vul, hand, table);
  if (src && src !== t && src.alive) {
    if (t.role === 'outlaw' && g.rules.rewardOutlawKill) { drawCards(g, src, g.rules.rewardOutlawKill); say(g, `${src.name} hạ Outlaw và rút ${g.rules.rewardOutlawKill} lá.`); }
    if (src.role === 'sheriff' && t.role === 'deputy' && g.rules.sheriffPenalty) {
      src.hand.concat(src.table).forEach((c) => g.discard.push(c)); src.hand = []; src.table = [];
      say(g, `${src.name} (Cảnh sát trưởng) lỡ giết Deputy nên bỏ hết bài!`);
    }
  }
  // Greg Digger hồi 2 máu, Herb Hunter rút 2 lá mỗi khi có người khác bị loại
  for (const q of alive(g)) {
    if (ab(g, q, 'greg')) { const got = heal(g, q, 2); if (got) say(g, `⛏️ ${q.name} hồi ${got} máu (Greg Digger).`); }
    if (ab(g, q, 'herb')) { const d = drawCards(g, q, 2); if (d.length) say(g, `🦌 ${q.name} rút ${d.length} lá (Herb Hunter).`); }
  }
  checkWin(g);
}
const ROLE_VI = { sheriff: 'Cảnh sát trưởng', deputy: 'Phó cảnh sát', outlaw: 'Kẻ ngoài vòng pháp luật', renegade: 'Kẻ phản bội' };
function checkWin(g) {
  const al = alive(g);
  const sheriff = g.players.find((p) => p.role === 'sheriff');
  let team = null;
  if (sheriff) {
    if (!sheriff.alive) team = al.length === 1 && al[0].role === 'renegade' ? 'renegade' : 'outlaw';
    else if (!al.some((p) => p.role === 'outlaw' || p.role === 'renegade')) team = 'sheriff';
  } else if (al.length <= 1) team = 'ffa';
  if (!team) return;
  const inTeam = (p) => (team === 'sheriff' ? p.role === 'sheriff' || p.role === 'deputy' : team === 'ffa' || team === 'renegade' ? p.alive && (team === 'ffa' || p.role === team) : p.role === team);
  const names = { sheriff: 'Cảnh sát trưởng & Phó cảnh sát', outlaw: 'Kẻ ngoài vòng pháp luật', renegade: 'Kẻ phản bội', ffa: 'Người sống sót cuối cùng' };
  g.winner = { team, text: `${names[team]} thắng!`, players: g.players.filter(inTeam).map((p) => p.id) };
  say(g, `🏆 ${g.winner.text}`);
  throw OVER;
}

// ---------- đỡ đòn ----------
function respondCards(g, p, kind) {
  if (kind === 'missed' && ab(g, p, 'elena')) return p.hand.slice(); // Elena Fuente: lá nào cũng dùng như Missed!
  return p.hand.filter((c) => {
    const r = cdef(g, c).react;
    return r === kind || (ab(g, p, 'janet') && (r === 'bang' || r === 'missed') && (kind === 'bang' || kind === 'missed'));
  });
}
// Trả về true nếu né được. `need` = số lần đỡ cần; `barrel` = có được dùng Barrel không.
function* defend(g, src, t, kind, { need = 1, barrel = false, why = '', used = null } = {}) {
  if (barrel) {
    const n = gear(g, t).filter((c) => (cdef(g, c).equip || {}).barrel).length + (ab(g, t, 'jourdonnais') ? 1 : 0);
    for (let i = 0; i < n && need > 0 && t.alive; i++) {
      if (yield* drawCheck(g, t, (s) => s === 'H', 'Barrel')) { need--; say(g, `🛢️ ${t.name} né nhờ Barrel!`); }
    }
  }
  let mo = 0; // số lá Molly Stark được rút bù
  while (need > 0 && t.alive) {
    const cs = respondCards(g, t, kind);
    if (cs.length < need) break; // không đủ lá để đỡ hết (vd BANG! của Slab) thì khỏi phí lá
    const what = kind === 'missed' ? 'Missed!' : 'BANG!';
    const a = yield prompt(t, 'respond', { text: `${src ? src.name : 'Sự kiện'} tấn công ${t.name} (${why}) — đỡ bằng ${what}${need > 1 ? ` (cần ${need})` : ''}?`, pub: { kind, from: src ? src.id : null, need } }, (act) => {
      if (act.type === 'pass') return;
      if (act.type !== 'respond' || !respondCards(g, t, kind).some((c) => c.id === act.card)) throw new Error(`Hãy chọn 1 lá ${what} trong tay hoặc bấm "Chịu đòn"`);
    });
    if (a.type === 'pass') break;
    const c = takeHand(g, t, a.card); g.discard.push(c); need--;
    say(g, `🛡️ ${t.name} đỡ bằng ${cname(g, c)}`);
    if (mollyCard(g, c)) mo++;
  }
  if (used) used.set(t, (used.get(t) || 0) + mo); else molly(g, t, mo);
  return need <= 0;
}
function* bangAttack(g, src, t) {
  const need = (ab(g, src, 'slab') ? 2 : 1) + (g.mods.missedExtra || 0);
  const ok = yield* defend(g, src, t, 'missed', { need, barrel: true, why: 'BANG!' });
  if (!ok) yield* damage(g, t, 1, src, 'BANG!');
  else say(g, `${t.name} né được BANG!`);
}
function* duel(g, src, tgt) {
  let cur = tgt, other = src;
  const used = new Map(); // Molly Stark rút bù 1 lá cho mỗi BANG! khi Duel xong
  for (;;) {
    const ok = yield* defend(g, other, cur, 'bang', { need: 1, why: 'Duel', used });
    if (!ok || !cur.alive) break;
    [cur, other] = [other, cur];
  }
  // người chơi lá Duel luôn là "thủ phạm" (FAQ Q21/Q23): ảnh hưởng El Gringo, thưởng/phạt khi giết
  if (cur.alive) yield* damage(g, cur, 1, src, 'Duel');
  for (const [q, n] of used) molly(g, q, n);
}

module.exports = { drawCheck, damage, dying, vultureSplit, die, ROLE_VI, checkWin, respondCards, defend, bangAttack, duel };
