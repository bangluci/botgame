'use strict';
// Bộ máy luật BANG!. Luồng ván là 1 generator: mỗi `yield` là một câu hỏi gửi cho 1 người chơi.
const { resolve, RANKS } = require('./config');

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
function* die(g, t, src) {
  t.alive = false; t.life = Math.min(0, t.life);
  say(g, `☠️ ${t.name} (${g.cfg.characters[t.char].name}) bị loại! Vai trò: ${ROLE_VI[t.role]}.`);
  if (g.first === t) g.first = nextAlive(g, t, 1); // giữ mốc "vòng" khi người mở vòng chết (chế độ không Sheriff)
  // Vulture Sam nhặt bài trước, rồi mới tới thưởng/phạt (FAQ chính thức Q18)
  const loot = t.hand.concat(t.table); t.hand = []; t.table = [];
  const vul = g.players.find((q) => q.alive && q !== t && ab(g, q, 'vulture'));
  if (vul && loot.length) { vul.hand.push(...loot); say(g, `🦅 ${vul.name} nhặt ${loot.length} lá của ${t.name} (Vulture Sam).`); }
  else g.discard.push(...loot);
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

// ---------- chơi bài ----------
function planPlay(g, p, a) {
  if (a.type !== 'play') throw new Error('Hành động không hợp lệ');
  const card = p.hand.find((c) => c.id === a.card);
  if (!card) throw new Error('Không có lá bài này trong tay');
  let d = cdef(g, card); let asBang = false;
  if (a.as === 'bang') {
    if (!(ab(g, p, 'janet') && d.react === 'missed')) throw new Error('Không thể dùng lá này như BANG!');
    d = g.cfg.cards[g.cfg.bangKey]; asBang = true;
  }
  if (d.playable === 'never') throw new Error('Lá này chỉ dùng để đáp lại, không tự đánh được');
  if (p.cuff && card.suit !== p.cuff) throw new Error(`Còng tay: lượt này chỉ được chơi bài chất ${SUIT_VI[p.cuff]}`);
  const eff = d.effect || [];
  const plan = { card, def: d, target: null, zone: null, cardId: null, asBang };
  if (eff.some((e) => e.type === 'bang')) {
    if (g.mods.noBang) throw new Error('Sự kiện đang cấm BANG!');
    if (p.bangs >= bangLimit(g, p)) throw new Error(`Mỗi lượt chỉ được bắn ${bangLimit(g, p)} BANG!`);
  }
  if (d.kind === 'equip' && !d.equip.weapon && !d.target && p.table.some((c) => c.key === card.key)) throw new Error('Bạn đã có lá này trên bàn');
  if (d.target === 'other') {
    const t = g.players.find((x) => x.id === a.target && x.alive);
    if (!t || t === p) throw new Error('Hãy chọn 1 mục tiêu hợp lệ');
    const range = d.range === undefined ? (eff.some((e) => e.type === 'bang') ? 'weapon' : 'any') : d.range;
    const dist = distance(g, p, t);
    if (range === 'weapon' && dist > weaponRange(g, p)) throw new Error(`${t.name} ở khoảng cách ${dist}, ngoài tầm súng (${weaponRange(g, p)})`);
    if (typeof range === 'number' && dist > range) throw new Error(`${t.name} ở khoảng cách ${dist}, quá xa (chỉ ${range})`);
    if (d.notSheriff && t.role === 'sheriff') throw new Error('Không thể dùng lên Cảnh sát trưởng');
    if (d.kind === 'action' && !eff.some((e) => e.type === 'duel') && apacheSafe(g, p, t, card)) throw new Error(`${t.name} (Apache Kid) không bị ảnh hưởng bởi lá ♦`);
    if (d.equip && d.equip.jail && t.table.some((c) => (cdef(g, c).equip || {}).jail)) throw new Error('Người đó đã bị Jail rồi');
    plan.target = t;
    if (eff.some((e) => e.type === 'steal')) {
      if (a.zone === 'table') {
        if (!t.table.some((c) => c.id === a.cardId)) throw new Error('Lá đó không có trên bàn của người này');
        plan.zone = 'table'; plan.cardId = a.cardId;
      } else {
        if (!t.hand.length) throw new Error('Người này không còn bài trên tay');
        plan.zone = 'hand';
      }
    }
  }
  return plan;
}

function* equip(g, p, card, d, target) {
  const holder = target || p;
  if (d.equip.weapon) {
    const old = holder.table.find((c) => (cdef(g, c).equip || {}).weapon);
    if (old) { takeTable(holder, old.id); g.discard.push(old); }
  }
  holder.table.push(card);
  say(g, `🧰 ${cname(g, card)} đặt trước mặt ${holder.name}`);
}

function* runEffect(g, p, e, plan) {
  const d = plan.def;
  switch (e.type) {
    case 'bang': p.bangs++; yield* bangAttack(g, p, plan.target); break;
    case 'heal': {
      const targets = e.who === 'all' ? [p, ...othersFrom(g, p)] : [p];
      // Beer đầy máu / còn 2 người vẫn chơi được, chỉ là không hồi (FAQ Q16, Q25)
      const amt = d.isBeer ? beerAmount(g, e, p) : e.amount || 1;
      for (const t of targets) if (t.alive) { const got = heal(g, t, amt); if (got || t === p) say(g, `❤️ ${t.name} hồi ${got} máu → ${t.life}/${t.maxLife}`); }
      break;
    }
    case 'draw': { const got = drawCards(g, p, e.n || 1); say(g, `${p.name} rút ${got.length} lá.`); break; }
    case 'steal': {
      const t = plan.target; let c;
      if (plan.zone === 'table') { if (!t.table.some((x) => x.id === plan.cardId)) break; c = takeTable(t, plan.cardId); }
      else { if (!t.hand.length) break; c = takeHand(g, t, rnd(g, t.hand).id); }
      if (e.mode === 'take') {
        p.hand.push(c);
        say(g, `🫳 ${p.name} lấy ${plan.zone === 'table' ? cname(g, c) : '1 lá trên tay'} của ${t.name}.`);
      } else {
        g.discard.push(c);
        say(g, `🙀 ${t.name} phải bỏ ${cname(g, c)}${plan.zone === 'hand' ? ' (từ tay)' : ''}.`);
      }
      break;
    }
    case 'aoe':
      for (const t of othersFrom(g, p)) {
        if (!t.alive) continue;
        if (apacheSafe(g, p, t, plan.card)) { say(g, `🪶 ${t.name} không bị ảnh hưởng bởi lá ♦ (Apache Kid).`); continue; }
        const ok = yield* defend(g, p, t, e.respond, { need: 1, barrel: !!e.barrel, why: d.name });
        if (!ok && t.alive) yield* damage(g, t, e.damage || 1, p, d.name);
      }
      break;
    case 'duel': yield* duel(g, p, plan.target); break;
    case 'store': {
      const order = [p, ...othersFrom(g, p)].filter((x) => x.alive);
      const cards = [];
      for (let i = 0; i < order.length; i++) { const c = popDeck(g); if (c) cards.push(c); }
      say(g, `🏪 General Store: ${cards.map((c) => cname(g, c)).join(', ')}`);
      for (const q of order) {
        if (!cards.length) break;
        if (!q.alive) continue;
        let pick = cards[0];
        if (cards.length > 1) {
          const a = yield prompt(q, 'pick', { text: `${q.name} chọn 1 lá từ General Store`, pub: { cards: cards.map(pubCard) } },
            (act) => { if (act.type !== 'pick' || !cards.some((c) => c.id === act.card)) throw new Error('Hãy chọn 1 lá'); });
          pick = cards.find((c) => c.id === a.card);
        }
        cards.splice(cards.indexOf(pick), 1); q.hand.push(pick);
        say(g, `${q.name} lấy ${cname(g, pick)}.`);
      }
      g.discard.push(...cards);
      break;
    }
    default: throw new Error('Hiệu ứng không hỗ trợ: ' + e.type);
  }
}

function* execPlay(g, p, a) {
  if (a.type === 'ability') { yield* useAbility(g, p, a, 'play'); return; }
  const plan = planPlay(g, p, a);
  const card = pull(p, a.card); // Suzy chỉ rút sau khi lá này xong hiệu ứng (FAQ Q22)
  const d = plan.def;
  g.last = { pid: p.id, card: pubCard(card), target: plan.target ? plan.target.id : null, asBang: plan.asBang };
  say(g, `🂠 ${p.name} chơi ${cname(g, card)}${plan.target ? ` → ${plan.target.name}` : ''}${plan.asBang ? ' (như BANG!)' : ''}`);
  if (d.kind === 'equip') yield* equip(g, p, card, d, plan.target);
  else {
    g.discard.push(card);
    for (const e of d.effect) {
      if (!p.alive) break;
      if (plan.target && !plan.target.alive && TARGETED.has(e.type)) continue;
      yield* runEffect(g, p, e, plan);
    }
  }
  suzy(g, p);
}
const TARGETED = new Set(['bang', 'duel', 'steal']);

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
      yield* bangAttack(g, p, t);
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

// ---------- lượt chơi ----------
function* drawPhase(g, p) {
  let n = g.rules.drawPerTurn + (g.mods.drawDelta || 0);
  if (ab(g, p, 'pixie')) n += 1; // Pixie Pete: rút 3 thay vì 2
  if (ab(g, p, 'bill')) n += p.maxLife - p.life - 1; // Bill Noface: 1 lá + 1 lá cho mỗi máu đã mất
  n = Math.max(0, n);
  if (!n) { say(g, `${p.name} không được rút bài.`); return; }
  if (ab(g, p, 'pat')) {
    const loot = alive(g).flatMap((q) => q.table.map((c) => ({ q, c })));
    if (loot.length) {
      const a = yield prompt(p, 'choice', { text: `Pat Brennan: rút ${n} lá hay lấy 1 lá trên bàn?`, pub: { kind: 'pat', options: [{ id: 'deck', label: `Rút ${n} lá` },
        ...loot.map(({ q, c }) => ({ id: 'c' + c.id, label: `${cname(g, c)} · ${q === p ? 'của bạn' : q.name}`, pid: q.id, card: pubCard(c) }))] } },
      (act) => { if (act.type !== 'choice' || !(act.id === 'deck' || loot.some(({ q, c }) => 'c' + c.id === act.id && q.table.includes(c)))) throw new Error('Hãy chọn rút bài hoặc 1 lá trên bàn'); });
      if (a.id !== 'deck') {
        const { q, c } = loot.find((x) => 'c' + x.c.id === a.id);
        p.hand.push(takeTable(q, c.id)); say(g, `🪢 ${p.name} lấy ${cname(g, c)} trên bàn ${q === p ? 'mình' : q.name} thay cho pha rút bài (Pat Brennan).`);
        return;
      }
    }
  }
  let got = 0;
  if (ab(g, p, 'jesse')) {
    const donors = g.players.filter((q) => q.alive && q !== p && q.hand.length);
    if (donors.length) {
      const a = yield prompt(p, 'choice', { text: 'Jesse Jones: lá đầu lấy từ đâu?', pub: { options: [{ id: 'deck', label: 'Chồng rút' }, ...donors.map((q) => ({ id: q.id, label: `Tay ${q.name} (${q.hand.length})` }))] } },
        // kiểm lại tay người cho ngay lúc trả lời: Sid có thể vừa bỏ bài ngoài lượt
        (act) => { if (act.type !== 'choice' || !(act.id === 'deck' || donors.some((q) => q.id === act.id && q.hand.length))) throw new Error('Hãy chọn nguồn rút'); });
      if (a.id !== 'deck') { const q = g.players.find((x) => x.id === a.id); const c = takeHand(g, q, rnd(g, q.hand).id); p.hand.push(c); got++; say(g, `${p.name} lấy 1 lá từ tay ${q.name} (Jesse Jones).`); }
    }
  }
  if (ab(g, p, 'pedro') && g.discard.length && got < n) {
    const top = g.discard[g.discard.length - 1];
    const a = yield prompt(p, 'choice', { text: 'Pedro Ramirez: lá đầu lấy từ đâu?', pub: { options: [{ id: 'deck', label: 'Chồng rút' }, { id: 'discard', label: `Chồng bỏ (${cname(g, top)})` }] } },
      (act) => { if (act.type !== 'choice' || !['deck', 'discard'].includes(act.id)) throw new Error('Hãy chọn nguồn rút'); });
    if (a.id === 'discard') { const c = g.discard.pop(); p.hand.push(c); got++; say(g, `${p.name} lấy ${cname(g, c)} từ chồng bỏ (Pedro).`); }
  }
  const rest = n - got;
  if (rest <= 0) return;
  if (ab(g, p, 'kit')) {
    const look = []; for (let i = 0; i < rest + 1; i++) { const c = popDeck(g); if (c) look.push(c); }
    if (look.length > rest) {
      const a = yield prompt(p, 'kit', { text: 'Kit Carlson: chọn 1 lá trả lại lên chồng rút', pub: {}, priv: { cards: look.map(pubCard) } },
        (act) => { if (act.type !== 'back' || !look.some((c) => c.id === act.card)) throw new Error('Hãy chọn 1 lá để trả lại'); });
      const back = look.find((c) => c.id === a.card);
      g.deck.push(back); p.hand.push(...look.filter((c) => c !== back));
    } else p.hand.push(...look);
    say(g, `${p.name} rút ${Math.min(rest, look.length)} lá (Kit Carlson).`);
    return;
  }
  const cs = drawCards(g, p, rest);
  say(g, `${p.name} rút ${got + cs.length} lá.`);
  if (ab(g, p, 'blackjack')) {
    const second = got === 0 ? cs[1] : cs[0];
    if (second) {
      const suit = g.mods.drawSuit || second.suit;
      say(g, `🃏 Black Jack lật lá thứ 2: ${cname(g, second)}`);
      if (suit === 'H' || suit === 'D') { drawCards(g, p, 1); say(g, `${p.name} rút thêm 1 lá.`); }
    }
  }
}

// Vera Custer: sau Dynamite/Jail, trước pha rút bài, mượn kỹ năng 1 nhân vật khác còn sống tới lượt sau.
function* veraPick(g, p) {
  p.vera = null;
  if (g.mods.noAbilities) return;
  const opts = alive(g).filter((q) => q !== p && q.char).map((q) => ({ id: q.char, label: `${g.cfg.characters[q.char].name} (${q.name})`, pid: q.id }));
  if (!opts.length) return;
  let key = opts[0].id;
  if (opts.length > 1) {
    const a = yield prompt(p, 'choice', { text: 'Vera Custer: mượn kỹ năng của ai tới lượt sau?', pub: { kind: 'vera', options: opts } },
      (act) => { if (act.type !== 'choice' || !opts.some((o) => o.id === act.id)) throw new Error('Hãy chọn 1 nhân vật'); });
    key = a.id;
  }
  p.vera = key;
  say(g, `🎭 ${p.name} mượn kỹ năng của ${g.cfg.characters[key].name} tới lượt sau (Vera Custer).`);
}

// Chồng sự kiện xây 1 lần: lá có "final" nằm đáy, lật tới thì giữ tới hết ván. Không có lá final thì hết chồng xáo lại.
function nextEvent(g) {
  const cur = g.event && g.cfg.events[g.event];
  if (cur && cur.final) return;
  if (!g.eventDeck.length) {
    const keys = g.cfg.eventKeys, fin = (k) => !!g.cfg.events[k].final;
    g.eventDeck = [...keys.filter(fin), ...shuffle(keys.filter((k) => !fin(k)), g.rng)];
  }
  const key = g.eventDeck.pop();
  const ev = g.cfg.events[key];
  g.event = key; g.mods = { ...(ev.mods || {}) };
  say(g, `🎴 SỰ KIỆN: ${ev.name} — ${ev.desc || ''}`);
}

// Lỗi bất ngờ trong luật (thường do lá/sự kiện tự chế): ghi log rồi chơi tiếp thay vì làm chết cả ván.
function fault(g, e) {
  console.error('[engine]', e && e.stack ? e.stack : e);
  say(g, `⚠️ Lỗi luật: ${e && e.message} — bỏ qua bước này.`);
  if (++g.faults > 20) { g.winner = { team: 'error', text: 'Ván dừng vì lỗi luật lặp lại', players: [] }; throw OVER; }
}

function* playTurn(g, p) {
  p.bangs = 0; p.cuff = null; p.used = {}; g.last = null;
  if (p === g.first && !g.noEvent) { g.round++; if (g.cfg.eventsOn && g.round >= 2) nextEvent(g); }
  g.noEvent = false;
  g.turn = p.id;
  say(g, `━━ Lượt của ${p.name} ━━`);
  const m = g.mods;
  if (m.turnStartDamage) { yield* damage(g, p, m.turnStartDamage, null, g.cfg.events[g.event].name); if (!p.alive) return; }
  if (m.turnStartHeal) { const got = heal(g, p, m.turnStartHeal); if (got) say(g, `${p.name} hồi ${got} máu.`); }
  for (const dyn of p.table.filter((c) => (cdef(g, c).equip || {}).dynamite)) {
    const boom = yield* drawCheck(g, p, (s, r) => s === 'S' && RANKS.indexOf(r) <= 7, 'Dynamite');
    takeTable(p, dyn.id);
    if (boom) {
      g.discard.push(dyn);
      yield* damage(g, p, g.rules.dynamiteDamage, null, 'Dynamite nổ');
      if (!p.alive) return;
    } else {
      // Dynamite luôn chuyền theo chiều kim đồng hồ, bỏ qua người đã có Dynamite.
      let nx = nextAlive(g, p, 1);
      while (nx !== p && nx.table.some((c) => (cdef(g, c).equip || {}).dynamite)) nx = nextAlive(g, nx, 1);
      nx.table.push(dyn); say(g, `🧨 Dynamite chuyền sang ${nx.name}.`);
    }
  }
  const jail = p.table.find((c) => (cdef(g, c).equip || {}).jail);
  if (jail) {
    const esc = yield* drawCheck(g, p, (s) => s === g.rules.jailEscapeSuit, 'Jail');
    takeTable(p, jail.id); g.discard.push(jail);
    if (!esc) { p.vera = null; say(g, `⛓️ ${p.name} ở tù, mất lượt.`); return; } // Vera ở tù: không mượn được kỹ năng (FAQ Q13)
    say(g, `${p.name} thoát tù!`);
  }
  if (charAbs(g, p.char).includes('vera')) yield* veraPick(g, p);
  yield* drawPhase(g, p);
  if (m.turnStartDraw) drawCards(g, p, m.turnStartDraw);
  if (m.handcuffs) {
    const a = yield prompt(p, 'suit', { text: 'Còng tay: chọn 1 chất, lượt này chỉ chơi được bài chất đó', pub: {} },
      (act) => { if (act.type !== 'suit' || !SYM[act.suit]) throw new Error('Chọn 1 chất'); });
    p.cuff = a.suit; say(g, `🔗 ${p.name} chọn chất ${SUIT_VI[a.suit]}.`);
  }
  while (p.alive) {
    const a = yield prompt(p, 'play', { text: `Lượt của ${p.name}` }, (act) => {
      if (act.type === 'end') return;
      if (act.type === 'ability') return void checkAbility(g, p, act, 'play');
      planPlay(g, p, act);
    });
    if (a.type === 'end') break;
    try { yield* execPlay(g, p, a); } catch (e) { if (e === OVER) throw e; fault(g, e); }
  }
  if (!p.alive) return;
  while (p.hand.length > handLimit(g, p)) {
    const over = p.hand.length - handLimit(g, p);
    const a = yield prompt(p, 'discard', { text: `${p.name} bỏ ${over} lá cho đủ giới hạn ${handLimit(g, p)}`, pub: { need: over } }, (act) => {
      if (act.type === 'ability') return void checkAbility(g, p, act, 'discard');
      if (act.type !== 'discard' || !p.hand.some((c) => c.id === act.card)) throw new Error('Chọn 1 lá trong tay để bỏ');
    });
    if (a.type === 'ability') yield* useAbility(g, p, a, 'discard');
    else g.discard.push(pull(p, a.card));
  }
  suzy(g, p);
  if (m.vendetta && !p.inExtra && (yield* drawCheck(g, p, (s) => s === 'H', 'Vendetta'))) { p.extraTurn = true; say(g, `🩸 ${p.name} được chơi thêm 1 lượt!`); }
}

function* setup(g) {
  const pool = shuffle(Object.keys(g.cfg.characters), g.rng);
  const n = g.players.length;
  if (pool.length < n) throw new Error(`Chỉ có ${pool.length} nhân vật bật, không đủ cho ${n} người`);
  const sheriffIdx = Math.max(0, g.players.findIndex((p) => p.role === 'sheriff'));
  const order = [...g.players.slice(sheriffIdx), ...g.players.slice(0, sheriffIdx)];
  for (let i = 0; i < order.length; i++) {
    const p = order[i];
    const take = Math.max(1, Math.min(g.rules.charChoices, pool.length - (order.length - i - 1)));
    const offer = pool.splice(0, take);
    let pick = offer[0];
    if (offer.length > 1) {
      const a = yield prompt(p, 'char', { text: `${p.name} chọn nhân vật`, pub: {}, priv: { options: offer } },
        (act) => { if (act.type !== 'char' || !offer.includes(act.key)) throw new Error('Hãy chọn 1 nhân vật'); });
      pick = a.key; pool.push(...offer.filter((k) => k !== pick));
    }
    p.char = pick;
    p.maxLife = g.cfg.characters[pick].life + g.rules.lifeBonusAll + (p.role === 'sheriff' ? g.rules.sheriffBonusLife : 0);
    p.life = p.maxLife;
    say(g, `${p.name} là ${g.cfg.characters[pick].name} (${p.life} máu)${p.role === 'sheriff' ? ' — Cảnh sát trưởng' : ''}.`);
  }
  for (const p of g.players) drawCards(g, p, Math.max(0, p.life + g.rules.startHandExtra));
  g.first = g.players[sheriffIdx];
}

function* main(g) {
  try {
    yield* setup(g);
    let p = g.first;
    for (;;) {
      try { yield* playTurn(g, p); } catch (e) { if (e === OVER) throw e; fault(g, e); }
      if (p.alive && p.extraTurn) { p.extraTurn = false; p.inExtra = true; g.noEvent = true; continue; }
      p.inExtra = false;
      p = nextAlive(g, p, dirOf(g));
    }
  } catch (e) { if (e !== OVER) throw e; }
  g.pending = null; g.turn = null;
}

// ---------- API ----------
function run(g, input) {
  g.faults = 0;
  const r = g.co.next(input);
  g.ver++;
  if (r.done) { g.pending = null; return; }
  g.pending = r.value;
}
// seed quyết định mọi lần xáo/ngẫu nhiên; server lưu seed + g.actions để dựng lại ván.
function newGame(members, settings, seed = Math.floor(Math.random() * 2 ** 32)) {
  const cfg = resolve(settings);
  const n = members.length;
  const roles = cfg.roles[n];
  if (!roles) throw new Error(`Chưa có cấu hình vai trò cho ${n} người`);
  const rng = makeRng(seed);
  const rl = shuffle([...roles], rng);
  const players = shuffle(members.slice(), rng).map((m, i) => ({ id: m.id, name: m.name, role: rl[i], char: null, life: 0, maxLife: 0, hand: [], table: [], alive: true, bangs: 0, cuff: null, used: {}, vera: null, extraTurn: false, inExtra: false }));
  let nid = 1;
  const deck = shuffle(cfg.deck.map((c) => ({ ...c, id: nid++ })), rng);
  const g = { seed, rng, actions: [], round: 0, faults: 0, cfg, rules: cfg.rules, players, deck, discard: [], log: [], mods: {}, event: null, eventDeck: [], pending: null, winner: null, turn: null, last: null, ver: 0, first: null, noEvent: false };
  g.co = main(g);
  run(g);
  return g;
}
function apply(g, pid, action) {
  if (g.winner) throw new Error('Ván đã kết thúc');
  if (!action || typeof action !== 'object') throw new Error('Hành động không hợp lệ');
  const pr = g.pending;
  // Kỹ năng dùng "bất cứ lúc nào" (Sid Ketchum), kể cả ngoài lượt mình: chạy ngay, prompt đang chờ giữ nguyên.
  if (action.type === 'ability' && !(pr && pr.player === pid && INLINE.has(pr.type))) {
    const p = g.players.find((x) => x.id === pid);
    if (!p || !p.alive) throw new Error('Hành động không hợp lệ');
    useAbility(g, p, action, 'any').next(); // kỹ năng 'any' không hỏi ai nên chạy xong trong 1 bước
    g.actions.push([pid, action]); g.ver++;
    return;
  }
  if (!pr) throw new Error('Chưa tới lúc');
  if (pr.player !== pid) throw new Error('Chưa tới lượt bạn');
  if (pr.validate) pr.validate(action);
  g.pending = null;
  g.actions.push([pid, action]);
  run(g, action);
}
// Kiểm tra mà không thực hiện (dùng cho bot/test). Trả về null nếu hợp lệ, hoặc chuỗi lỗi.
function check(g, pid, action) {
  const pr = g.pending;
  if (!pr || pr.player !== pid) return 'not your turn';
  try { if (pr.validate) pr.validate(action); return null; } catch (e) { return e.message; }
}

// Lá nào đang chơi được và nhắm được ai — client dùng để tô sáng đúng, khỏi đoán luật.
function playableFor(g, p) {
  const ok = (a) => { try { g.pending.validate(a); return true; } catch (e) { return false; } };
  const others = g.players.filter((q) => q.alive && q !== p);
  const out = {};
  for (const c of p.hand) {
    const base = { type: 'play', card: c.id };
    const hits = (extra) => others.filter((q) => ok({ ...base, ...extra, target: q.id }) || q.table.some((t) => ok({ ...base, ...extra, target: q.id, zone: 'table', cardId: t.id }))).map((q) => q.id);
    const needs = cdef(g, c).target === 'other'; // lá tự chơi bỏ qua target nên không được liệt kê mục tiêu
    const r = { self: !needs && ok(base), targets: needs ? hits({}) : [] };
    if (ab(g, p, 'janet') && cdef(g, c).react === 'missed') r.bangTargets = hits({ as: 'bang' });
    if (r.self || r.targets.length || (r.bangTargets && r.bangTargets.length)) out[c.id] = r;
  }
  return out;
}
function usableFor(g, p, pr) {
  if (pr.type === 'respond') return respondCards(g, p, pr.data.pub.kind).map((c) => c.id);
  if (pr.type === 'dying') return beersFor(g, p).map((c) => c.id);
  if (pr.type === 'discard') return p.hand.map((c) => c.id);
  return [];
}

function viewFor(g, pid) {
  const me = g.players.find((p) => p.id === pid);
  const showRole = (p) => p === me || p.role === 'sheriff' || (!p.alive && g.rules.revealRoleOnDeath) || !!g.winner;
  const pr = g.pending;
  const mine = !!(pr && me && pr.player === pid);
  let pending = null;
  if (pr) pending = { player: pr.player, type: pr.type, text: pr.data.text || '', ...(pr.data.pub || {}), ...(mine ? pr.data.priv || {} : {}) };
  const ev = g.event ? g.cfg.events[g.event] : null;
  return {
    ver: g.ver, round: g.round,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, char: p.char, life: p.life, maxLife: p.maxLife, hand: p.hand.length, alive: p.alive,
      table: p.table.map(pubCard), role: showRole(p) ? p.role : null, vera: p.vera || null,
      dist: me && me.alive && p.alive && p !== me ? distance(g, me, p) : null,
    })),
    me: me ? {
      hand: me.hand.map(pubCard), role: me.role, bangs: me.bangs, cuff: me.cuff, bangLimit: bangLimit(g, me) === Infinity ? 0 : bangLimit(g, me), range: weaponRange(g, me),
      playable: mine && pr.type === 'play' ? playableFor(g, me) : null,
      usable: mine ? usableFor(g, me, pr) : [],
      abilities: abilitiesFor(g, me, whereFor(g, me)),
    } : null,
    turn: g.turn, deck: g.deck.length, discard: g.discard.length,
    discardTop: g.discard.length ? pubCard(g.discard[g.discard.length - 1]) : null,
    last: g.last, event: ev ? { key: g.event, name: ev.name, icon: ev.icon, desc: ev.desc, final: !!ev.final } : null,
    eventsOn: g.cfg.eventsOn, reverse: !!g.mods.reverse,
    pending, winner: g.winner, log: g.log.slice(-150),
    defs: {
      cards: Object.fromEntries(Object.entries(g.cfg.cards).map(([k, c]) => [k, { name: c.name, icon: c.icon || '🂠', kind: c.kind, desc: c.desc || '', target: c.target || 'none', range: c.range, react: c.react, playable: c.playable, isBeer: !!c.isBeer, steal: (c.effect || []).some((e) => e.type === 'steal'), bang: (c.effect || []).some((e) => e.type === 'bang') }])),
      chars: Object.fromEntries(Object.entries(g.cfg.characters).map(([k, c]) => [k, { name: c.name, icon: c.icon || '🙂', life: c.life, desc: c.desc || '', abilities: c.abilities || [] }])),
    },
    janet: me ? ab(g, me, 'janet') : false,
  };
}

module.exports = { newGame, apply, check, viewFor, SYM };
