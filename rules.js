'use strict';
// Tiện ích trạng thái ván dùng chung cho engine: lá bài, khoảng cách, tầm súng, rút/bỏ bài, kỹ năng thụ động đọc trạng thái.
const OVER = { over: true };
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_VI = { S: '♠ Bích', H: '♥ Cơ', D: '♦ Rô', C: '♣ Chuồn' };
// PRNG có seed (mulberry32): cùng seed + cùng chuỗi action => ván y hệt, nhờ đó server dựng lại ván sau khi khởi động lại.
function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (g, a) => a[Math.floor(g.rng() * a.length)];

// ---------- tiện ích ----------
const cdef = (g, c) => g.cfg.cards[c.key];
const pubCard = (c) => ({ id: c.id, key: c.key, suit: c.suit, rank: c.rank });
const cname = (g, c) => `${cdef(g, c).name} ${SYM[c.suit]}${c.rank}`;
const say = (g, t) => { g.log.push(t); if (g.log.length > 300) g.log.shift(); };
const alive = (g) => g.players.filter((p) => p.alive);
const dirOf = (g) => (g.mods.reverse ? -1 : 1);
const charAbs = (g, key) => (g.cfg.characters[key] && g.cfg.characters[key].abilities) || [];
// Vera Custer có thêm kỹ năng của nhân vật đã mượn (p.vera) tới đầu lượt sau của cô.
const ab = (g, p, name) => !g.mods.noAbilities && (charAbs(g, p.char).includes(name) || (!!p.vera && charAbs(g, p.vera).includes(name)));
// Đồ trên bàn đang có tác dụng: trong lượt Belle Star, đồ của người khác coi như không có.
function gear(g, p) {
  const t = g.turn && g.turn !== p.id ? g.players.find((q) => q.id === g.turn) : null;
  return t && t.alive && ab(g, t, 'belle') ? [] : p.table;
}
const tableSum = (p, g, f) => gear(g, p).reduce((s, c) => s + ((cdef(g, c).equip || {})[f] || 0), 0);
// Apache Kid: lá ♦ người khác đánh vào anh không có tác dụng, trừ Duel (FAQ Dodge City Q10). Đồ viền xanh vẫn dùng bình thường.
const apacheSafe = (g, src, t, card) => card.suit === 'D' && t !== src && ab(g, t, 'apache');
const prompt = (player, type, data, validate) => ({ player: player.id, type, data: data || {}, validate });

// Lá xanh lá đặt ở lượt trước mới dùng được (sách luật Dodge City).
const ready = (g, c) => c.placed !== undefined && c.placed < g.turnNo;

function nextAlive(g, p, dir = 1) {
  const n = g.players.length;
  let i = g.players.indexOf(p);
  for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (g.players[i].alive) return g.players[i]; }
  return p;
}
function othersFrom(g, p) {
  const out = []; const seen = new Set([p]);
  // hiệu ứng lá luôn đi theo chiều kim đồng hồ, kể cả khi Gold Rush đảo thứ tự lượt
  let q = nextAlive(g, p, 1);
  while (!seen.has(q)) { seen.add(q); out.push(q); q = nextAlive(g, q, 1); }
  return out;
}
function rawDist(g, a, b) {
  const al = alive(g); const d = Math.abs(al.indexOf(a) - al.indexOf(b));
  return Math.min(d, al.length - d);
}
function distance(g, a, b) {
  const d = rawDist(g, a, b) + tableSum(b, g, 'distIn') - tableSum(a, g, 'distOut') + (ab(g, b, 'paul') ? 1 : 0) - (ab(g, a, 'rose') ? 1 : 0);
  return Math.max(1, d);
}
function weaponRange(g, p) {
  const w = gear(g, p).map((c) => (cdef(g, c).equip || {}).weapon).filter(Boolean);
  return (w.length ? Math.max(...w) : 1) + (g.mods.rangeBonus || 0);
}
function bangLimit(g, p) {
  if (!g.rules.bangPerTurn || ab(g, p, 'willy') || gear(g, p).some((c) => (cdef(g, c).equip || {}).unlimitedBang)) return Infinity;
  return g.rules.bangPerTurn + (g.mods.bangBonus || 0);
}
function handLimit(g, p) {
  if (g.rules.handLimitUnlimited) return Infinity;
  const lim = Math.max(0, p.life + g.rules.handLimitBonus + (g.mods.handLimitDelta || 0));
  return ab(g, p, 'sean') ? Math.max(lim, 10) : lim; // Sean Mallory giữ được tới 10 lá
}
const beerBlocked = (g) => g.rules.beerDisabledAt > 0 && alive(g).length <= g.rules.beerDisabledAt;
// Beer hồi bao nhiêu (sự kiện có thể đổi); 0 khi bị vô hiệu vì còn ít người.
function beerAmount(g, e, p) {
  const base = beerBlocked(g) ? 0 : g.mods.beerHeal !== undefined ? g.mods.beerHeal : (e && e.amount) || 1;
  return base > 0 && p && ab(g, p, 'tequila') ? base + 1 : base; // Tequila Joe: Beer hồi thêm 1
}
const beersFor = (g, p) => (beerAmount(g, null, p) > 0 ? p.hand.filter((c) => cdef(g, c).isBeer) : []);

function popDeck(g) {
  if (!g.deck.length) {
    if (g.discard.length <= 1) return null;
    const top = g.discard.pop();
    g.deck = shuffle(g.discard, g.rng); g.discard = [top];
    say(g, '♻️ Xáo lại chồng bài bỏ thành chồng rút.');
  }
  return g.deck.pop() || null;
}
function drawCards(g, p, n) {
  const got = [];
  for (let i = 0; i < n; i++) { const c = popDeck(g); if (!c) break; p.hand.push(c); got.push(c); }
  return got;
}
function pull(p, id) {
  const i = p.hand.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Không có lá bài đó');
  return p.hand.splice(i, 1)[0];
}
function suzy(g, p) {
  if (!p.hand.length && p.alive && ab(g, p, 'suzy')) { const d = drawCards(g, p, 1); if (d.length) say(g, `${p.name} hết bài nên rút 1 lá (Suzy).`); }
}
function takeHand(g, p, id) { const c = pull(p, id); suzy(g, p); return c; }
function takeTable(p, id) {
  const i = p.table.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Không có lá bài đó');
  return p.table.splice(i, 1)[0];
}
const heal = (g, p, n) => { const before = p.life; p.life = Math.min(p.maxLife, p.life + n); return p.life - before; };
// Molly Stark: ngoài lượt mình, mỗi lá Missed!/Beer/BANG! tự dùng từ tay thì rút 1 lá, rút sau khi đòn đã xử lý xong.
const mollyCard = (g, c) => { const d = cdef(g, c); return !!(d.react || d.isBeer); };
function molly(g, p, n) {
  if (n > 0 && p.alive && g.turn !== p.id && ab(g, p, 'molly')) { const d = drawCards(g, p, n); if (d.length) say(g, `🎀 ${p.name} rút ${d.length} lá (Molly Stark).`); }
}

module.exports = { ready, OVER, SYM, SUIT_VI, makeRng, shuffle, rnd, cdef, pubCard, cname, say, alive, dirOf, charAbs, ab, gear, tableSum, apacheSafe, prompt, nextAlive, othersFrom, rawDist, distance, weaponRange, bangLimit, handLimit, beerBlocked, beerAmount, beersFor, popDeck, drawCards, pull, suzy, takeHand, takeTable, heal, mollyCard, molly };
