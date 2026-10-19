'use strict';
// Bộ máy luật BANG!. Luồng ván là 1 generator: mỗi `yield` là một câu hỏi gửi cho 1 người chơi.
const { resolve, RANKS } = require('./config');

const OVER = { over: true };
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_VI = { S: '♠ Bích', H: '♥ Cơ', D: '♦ Rô', C: '♣ Chuồn' };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

// ---------- tiện ích ----------
const cdef = (g, c) => g.cfg.cards[c.key];
const pubCard = (c) => ({ id: c.id, key: c.key, suit: c.suit, rank: c.rank });
const cname = (g, c) => `${cdef(g, c).name} ${SYM[c.suit]}${c.rank}`;
const say = (g, t) => { g.log.push(t); if (g.log.length > 300) g.log.shift(); };
const alive = (g) => g.players.filter((p) => p.alive);
const dirOf = (g) => (g.mods.reverse ? -1 : 1);
const ab = (g, p, name) => !g.mods.noAbilities && !!(g.cfg.characters[p.char] && (g.cfg.characters[p.char].abilities || []).includes(name));
const tableSum = (p, g, f) => p.table.reduce((s, c) => s + ((cdef(g, c).equip || {})[f] || 0), 0);
const prompt = (player, type, data, validate) => ({ player: player.id, type, data: data || {}, validate });

function nextAlive(g, p, dir = 1) {
  const n = g.players.length;
  let i = g.players.indexOf(p);
  for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (g.players[i].alive) return g.players[i]; }
  return p;
}
function othersFrom(g, p) {
  const out = []; const seen = new Set([p]);
  let q = nextAlive(g, p, dirOf(g));
  while (!seen.has(q)) { seen.add(q); out.push(q); q = nextAlive(g, q, dirOf(g)); }
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
  const w = p.table.map((c) => (cdef(g, c).equip || {}).weapon).filter(Boolean);
  return (w.length ? Math.max(...w) : 1) + (g.mods.rangeBonus || 0);
}
function bangLimit(g, p) {
  if (!g.rules.bangPerTurn || ab(g, p, 'willy') || p.table.some((c) => (cdef(g, c).equip || {}).unlimitedBang)) return Infinity;
  return g.rules.bangPerTurn + (g.mods.bangBonus || 0);
}
const handLimit = (g, p) => (g.rules.handLimitUnlimited ? Infinity : Math.max(0, p.life + g.rules.handLimitBonus + (g.mods.handLimitDelta || 0)));
const beerBlocked = (g) => g.rules.beerDisabledAt > 0 && alive(g).length <= g.rules.beerDisabledAt;

function popDeck(g) {
  if (!g.deck.length) {
    if (g.discard.length <= 1) return null;
    const top = g.discard.pop();
    g.deck = shuffle(g.discard); g.discard = [top];
    say(g, '♻️ Xáo lại chồng bài bỏ thành chồng rút.');
  }
  return g.deck.pop() || null;
}
function drawCards(g, p, n) {
  const got = [];
  for (let i = 0; i < n; i++) { const c = popDeck(g); if (!c) break; p.hand.push(c); got.push(c); }
  return got;
}
function takeHand(g, p, id) {
  const i = p.hand.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Không có lá bài đó');
  const [c] = p.hand.splice(i, 1);
  if (!p.hand.length && p.alive && ab(g, p, 'suzy')) { const d = drawCards(g, p, 1); if (d.length) say(g, `${p.name} hết bài nên rút 1 lá (Suzy).`); }
  return c;
}
function takeTable(p, id) {
  const i = p.table.findIndex((c) => c.id === id);
  if (i < 0) throw new Error('Không có lá bài đó');
  return p.table.splice(i, 1)[0];
}
const heal = (g, p, n) => { const before = p.life; p.life = Math.min(p.maxLife, p.life + n); return p.life - before; };

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
      for (let i = 0; i < amount && src.hand.length; i++) { const c = takeHand(g, src, rnd(src.hand).id); t.hand.push(c); }
      say(g, `${t.name} lấy bài từ tay ${src.name} (El Gringo).`);
    }
  }
}
function* dying(g, t, src) {
  while (t.life <= 0) {
    const beers = beerBlocked(g) ? [] : t.hand.filter((c) => cdef(g, c).isBeer);
    const canSid = ab(g, t, 'sid') && t.hand.length >= 2;
    if (!beers.length && !canSid) break;
    const need = 1 - t.life;
    const a = yield prompt(t, 'dying', { text: `${t.name} sắp chết! Cần ${need} Beer để cứu.`, pub: { need } }, (act) => {
      if (act.type === 'pass') return;
      if (act.type === 'beer') { if (!beers.some((c) => c.id === act.card)) throw new Error('Hãy chọn 1 Beer trong tay'); return; }
      if (act.type === 'sid') { checkSid(g, t, act); return; }
      throw new Error('Hành động không hợp lệ');
    });
    if (a.type === 'pass') break;
    if (a.type === 'beer') {
      const c = takeHand(g, t, a.card); g.discard.push(c); heal(g, t, 1);
      say(g, `🍺 ${t.name} uống Beer để cứu mạng → ${t.life}/${t.maxLife}`);
    } else sidDiscard(g, t, a);
  }
  if (t.life <= 0) yield* die(g, t, src);
}
function checkSid(g, p, act) {
  if (!ab(g, p, 'sid')) throw new Error('Bạn không phải Sid Ketchum');
  const ids = act.cards;
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] || !ids.every((id) => p.hand.some((c) => c.id === id))) throw new Error('Chọn đúng 2 lá khác nhau trong tay');
  if (p.life >= p.maxLife) throw new Error('Bạn đang đầy máu');
}
function sidDiscard(g, p, act) {
  for (const id of act.cards) g.discard.push(takeHand(g, p, id));
  heal(g, p, 1); say(g, `💉 ${p.name} bỏ 2 lá để hồi 1 máu (Sid) → ${p.life}/${p.maxLife}`);
}
function* die(g, t, src) {
  t.alive = false; t.life = Math.min(0, t.life);
  say(g, `☠️ ${t.name} (${g.cfg.characters[t.char].name}) bị loại! Vai trò: ${ROLE_VI[t.role]}.`);
  if (src && src !== t && src.alive) {
    if (t.role === 'outlaw' && g.rules.rewardOutlawKill) { drawCards(g, src, g.rules.rewardOutlawKill); say(g, `${src.name} hạ Outlaw và rút ${g.rules.rewardOutlawKill} lá.`); }
    if (src.role === 'sheriff' && t.role === 'deputy' && g.rules.sheriffPenalty) {
      src.hand.concat(src.table).forEach((c) => g.discard.push(c)); src.hand = []; src.table = [];
      say(g, `${src.name} (Cảnh sát trưởng) lỡ giết Deputy nên bỏ hết bài!`);
    }
  }
  const loot = t.hand.concat(t.table); t.hand = []; t.table = [];
  const vul = g.players.find((q) => q.alive && q !== t && ab(g, q, 'vulture'));
  if (vul && loot.length) { vul.hand.push(...loot); say(g, `🦅 ${vul.name} nhặt ${loot.length} lá của ${t.name} (Vulture Sam).`); }
  else g.discard.push(...loot);
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
  const inTeam = (p) => (team === 'sheriff' ? p.role === 'sheriff' || p.role === 'deputy' : team === 'ffa' ? p.alive : p.role === team);
  const names = { sheriff: 'Cảnh sát trưởng & Phó cảnh sát', outlaw: 'Kẻ ngoài vòng pháp luật', renegade: 'Kẻ phản bội', ffa: 'Người sống sót cuối cùng' };
  g.winner = { team, text: `${names[team]} thắng!`, players: g.players.filter(inTeam).map((p) => p.id) };
  say(g, `🏆 ${g.winner.text}`);
  throw OVER;
}

// ---------- đỡ đòn ----------
function respondCards(g, p, kind) {
  return p.hand.filter((c) => {
    const r = cdef(g, c).react;
    return r === kind || (ab(g, p, 'janet') && (r === 'bang' || r === 'missed') && (kind === 'bang' || kind === 'missed'));
  });
}
// Trả về true nếu né được. `need` = số lần đỡ cần; `barrel` = có được dùng Barrel không.
function* defend(g, src, t, kind, { need = 1, barrel = false, why = '' } = {}) {
  if (barrel) {
    const n = t.table.filter((c) => (cdef(g, c).equip || {}).barrel).length + (ab(g, t, 'jourdonnais') ? 1 : 0);
    for (let i = 0; i < n && need > 0 && t.alive; i++) {
      if (yield* drawCheck(g, t, (s) => s === 'H', 'Barrel')) { need--; say(g, `🛢️ ${t.name} né nhờ Barrel!`); }
    }
  }
  while (need > 0 && t.alive) {
    const cs = respondCards(g, t, kind);
    if (!cs.length) break;
    const what = kind === 'missed' ? 'Missed!' : 'BANG!';
    const a = yield prompt(t, 'respond', { text: `${src ? src.name : 'Sự kiện'} tấn công ${t.name} (${why}) — đỡ bằng ${what}${need > 1 ? ` (cần ${need})` : ''}?`, pub: { kind, from: src ? src.id : null, need } }, (act) => {
      if (act.type === 'pass') return;
      if (act.type !== 'respond' || !cs.some((c) => c.id === act.card)) throw new Error(`Hãy chọn 1 lá ${what} trong tay hoặc bấm "Chịu đòn"`);
    });
    if (a.type === 'pass') break;
    const c = takeHand(g, t, a.card); g.discard.push(c); need--;
    say(g, `🛡️ ${t.name} đỡ bằng ${cname(g, c)}`);
  }
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
  for (;;) {
    const ok = yield* defend(g, other, cur, 'bang', { need: 1, why: 'Duel' });
    if (!ok || !cur.alive) break;
    [cur, other] = [other, cur];
  }
  if (cur.alive) yield* damage(g, cur, 1, other, 'Duel');
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
  if (d.isBeer) {
    if (p.life >= p.maxLife) throw new Error('Bạn đang đầy máu');
    if (beerBlocked(g)) throw new Error(`Chỉ còn ${alive(g).length} người nên Beer vô hiệu`);
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
      const amt = d.isBeer && g.mods.beerHeal !== undefined ? g.mods.beerHeal : e.amount || 1;
      for (const t of targets) if (t.alive) { const got = heal(g, t, amt); if (got || t === p) say(g, `❤️ ${t.name} hồi ${got} máu → ${t.life}/${t.maxLife}`); }
      break;
    }
    case 'draw': { const got = drawCards(g, p, e.n || 1); say(g, `${p.name} rút ${got.length} lá.`); break; }
    case 'steal': {
      const t = plan.target; let c;
      if (plan.zone === 'table') c = takeTable(t, plan.cardId);
      else c = takeHand(g, t, rnd(t.hand).id);
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
  if (a.type === 'ability') { sidDiscard(g, p, a); return; }
  const plan = planPlay(g, p, a);
  const card = takeHand(g, p, a.card);
  const d = plan.def;
  g.last = { pid: p.id, card: pubCard(card), target: plan.target ? plan.target.id : null };
  say(g, `🂠 ${p.name} chơi ${cname(g, card)}${plan.target ? ` → ${plan.target.name}` : ''}${plan.asBang ? ' (như BANG!)' : ''}`);
  if (d.kind === 'equip') { yield* equip(g, p, card, d, plan.target); return; }
  g.discard.push(card);
  for (const e of d.effect) { if (!p.alive && e.type !== 'bang') break; yield* runEffect(g, p, e, plan); }
}

// ---------- lượt chơi ----------
function* drawPhase(g, p) {
  const n = Math.max(0, g.rules.drawPerTurn + (g.mods.drawDelta || 0));
  if (!n) { say(g, `${p.name} không được rút bài.`); return; }
  let got = 0;
  if (ab(g, p, 'jesse')) {
    const donors = g.players.filter((q) => q.alive && q !== p && q.hand.length);
    if (donors.length) {
      const a = yield prompt(p, 'choice', { text: 'Jesse Jones: lá đầu lấy từ đâu?', pub: { options: [{ id: 'deck', label: 'Chồng rút' }, ...donors.map((q) => ({ id: q.id, label: `Tay ${q.name} (${q.hand.length})` }))] } },
        (act) => { if (act.type !== 'choice' || !(act.id === 'deck' || donors.some((q) => q.id === act.id))) throw new Error('Hãy chọn nguồn rút'); });
      if (a.id !== 'deck') { const q = g.players.find((x) => x.id === a.id); const c = takeHand(g, q, rnd(q.hand).id); p.hand.push(c); got++; say(g, `${p.name} lấy 1 lá từ tay ${q.name} (Jesse Jones).`); }
    }
  }
  if (ab(g, p, 'pedro') && g.discard.length && got < n) {
    const top = g.discard[g.discard.length - 1];
    const a = yield prompt(p, 'choice', { text: 'Pedro Ramirez: lá đầu lấy từ đâu?', pub: { options: [{ id: 'deck', label: 'Chồng rút' }, { id: 'discard', label: `Chồng bỏ (${cname(g, top)})` }] } },
      (act) => { if (act.type !== 'choice' || !['deck', 'discard'].includes(act.id)) throw new Error('Hãy chọn nguồn rút'); });
    if (a.id === 'discard') { p.hand.push(g.discard.pop()); got++; say(g, `${p.name} lấy ${cname(g, top)} từ chồng bỏ (Pedro).`); }
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

function* nextEvent(g) {
  if (!g.eventDeck.length) g.eventDeck = shuffle(g.cfg.eventKeys.slice());
  const key = g.eventDeck.pop();
  const ev = g.cfg.events[key];
  g.event = key; g.mods = { ...(ev.mods || {}) };
  say(g, `🎴 SỰ KIỆN: ${ev.name} — ${ev.desc || ''}`);
}

function* playTurn(g, p) {
  p.bangs = 0; p.cuff = null;
  if (g.cfg.eventsOn && p === g.first && !g.noEvent) yield* nextEvent(g);
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
    } else { const nx = nextAlive(g, p, dirOf(g)); nx.table.push(dyn); say(g, `🧨 Dynamite chuyền sang ${nx.name}.`); }
  }
  const jail = p.table.find((c) => (cdef(g, c).equip || {}).jail);
  if (jail) {
    const esc = yield* drawCheck(g, p, (s) => s === g.rules.jailEscapeSuit, 'Jail');
    takeTable(p, jail.id); g.discard.push(jail);
    if (!esc) { say(g, `⛓️ ${p.name} ở tù, mất lượt.`); return; }
    say(g, `${p.name} thoát tù!`);
  }
  yield* drawPhase(g, p);
  if (m.turnStartDraw) drawCards(g, p, m.turnStartDraw);
  if (m.handcuffs) {
    const a = yield prompt(p, 'suit', { text: 'Còng tay: chọn 1 chất, lượt này chỉ chơi được bài chất đó', pub: {} },
      (act) => { if (act.type !== 'suit' || !SYM[act.suit]) throw new Error('Chọn 1 chất'); });
    p.cuff = a.suit; say(g, `🔗 ${p.name} chọn chất ${SUIT_VI[a.suit]}.`);
  }
  while (p.alive) {
    const a = yield prompt(p, 'play', { text: 'Đến lượt bạn' }, (act) => {
      if (act.type === 'end') return;
      if (act.type === 'ability') return checkSid(g, p, act);
      planPlay(g, p, act);
    });
    if (a.type === 'end') break;
    yield* execPlay(g, p, a);
  }
  if (!p.alive) return;
  while (p.hand.length > handLimit(g, p)) {
    const over = p.hand.length - handLimit(g, p);
    const a = yield prompt(p, 'discard', { text: `Bỏ ${over} lá cho đủ giới hạn ${handLimit(g, p)}`, pub: { need: over } },
      (act) => { if (act.type !== 'discard' || !p.hand.some((c) => c.id === act.card)) throw new Error('Chọn 1 lá trong tay để bỏ'); });
    g.discard.push(takeHand(g, p, a.card));
  }
  if (m.vendetta && (yield* drawCheck(g, p, (s) => s === 'H', 'Vendetta'))) { p.extraTurn = true; say(g, `🩸 ${p.name} được chơi thêm 1 lượt!`); }
}

function* setup(g) {
  const pool = shuffle(Object.keys(g.cfg.characters));
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
      yield* playTurn(g, p);
      if (p.alive && p.extraTurn) { p.extraTurn = false; g.noEvent = true; continue; }
      p = nextAlive(g, p, dirOf(g));
    }
  } catch (e) { if (e !== OVER) throw e; }
  g.pending = null; g.turn = null;
}

// ---------- API ----------
function run(g, input) {
  const r = g.co.next(input);
  g.ver++;
  if (r.done) { g.pending = null; return; }
  g.pending = r.value;
}
function newGame(members, settings) {
  const cfg = resolve(settings);
  const n = members.length;
  const roles = cfg.roles[n];
  if (!roles) throw new Error(`Chưa có cấu hình vai trò cho ${n} người`);
  const rl = shuffle([...roles]);
  const players = shuffle(members.slice()).map((m, i) => ({ id: m.id, name: m.name, role: rl[i], char: null, life: 0, maxLife: 0, hand: [], table: [], alive: true, bangs: 0, cuff: null, extraTurn: false }));
  let nid = 1;
  const deck = shuffle(cfg.deck.map((c) => ({ ...c, id: nid++ })));
  const g = { cfg, rules: cfg.rules, players, deck, discard: [], log: [], mods: {}, event: null, eventDeck: [], pending: null, winner: null, turn: null, last: null, ver: 0, first: null, noEvent: false };
  g.co = main(g);
  run(g);
  return g;
}
function apply(g, pid, action) {
  if (g.winner) throw new Error('Ván đã kết thúc');
  const pr = g.pending;
  if (!pr) throw new Error('Chưa tới lúc');
  if (pr.player !== pid) throw new Error('Chưa tới lượt bạn');
  if (!action || typeof action !== 'object') throw new Error('Hành động không hợp lệ');
  if (pr.validate) pr.validate(action);
  g.pending = null;
  run(g, action);
}
// Kiểm tra mà không thực hiện (dùng cho bot/test). Trả về null nếu hợp lệ, hoặc chuỗi lỗi.
function check(g, pid, action) {
  const pr = g.pending;
  if (!pr || pr.player !== pid) return 'not your turn';
  try { if (pr.validate) pr.validate(action); return null; } catch (e) { return e.message; }
}

function viewFor(g, pid) {
  const me = g.players.find((p) => p.id === pid);
  const showRole = (p) => p === me || p.role === 'sheriff' || (!p.alive && g.rules.revealRoleOnDeath) || !!g.winner;
  const pr = g.pending;
  let pending = null;
  if (pr) pending = { player: pr.player, type: pr.type, text: pr.data.text || '', ...(pr.data.pub || {}), ...(pr.player === pid ? pr.data.priv || {} : {}) };
  const ev = g.event ? g.cfg.events[g.event] : null;
  return {
    ver: g.ver,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, char: p.char, life: p.life, maxLife: p.maxLife, hand: p.hand.length, alive: p.alive,
      table: p.table.map(pubCard), role: showRole(p) ? p.role : null,
      dist: me && me.alive && p.alive && p !== me ? distance(g, me, p) : null,
    })),
    me: me ? { hand: me.hand.map(pubCard), role: me.role, bangs: me.bangs, cuff: me.cuff, bangLimit: bangLimit(g, me) === Infinity ? 0 : bangLimit(g, me), range: weaponRange(g, me) } : null,
    turn: g.turn, deck: g.deck.length,
    discardTop: g.discard.length ? pubCard(g.discard[g.discard.length - 1]) : null,
    last: g.last, event: ev ? { key: g.event, name: ev.name, icon: ev.icon, desc: ev.desc } : null,
    eventsOn: g.cfg.eventsOn,
    pending, winner: g.winner, log: g.log.slice(-100),
    defs: {
      cards: Object.fromEntries(Object.entries(g.cfg.cards).map(([k, c]) => [k, { name: c.name, icon: c.icon || '🂠', kind: c.kind, desc: c.desc || '', target: c.target || 'none', range: c.range, react: c.react, playable: c.playable, isBeer: !!c.isBeer, steal: (c.effect || []).some((e) => e.type === 'steal'), bang: (c.effect || []).some((e) => e.type === 'bang') }])),
      chars: Object.fromEntries(Object.entries(g.cfg.characters).map(([k, c]) => [k, { name: c.name, icon: c.icon || '🙂', life: c.life, desc: c.desc || '', abilities: c.abilities || [] }])),
    },
    janet: me ? ab(g, me, 'janet') : false, sid: me ? ab(g, me, 'sid') : false,
  };
}

module.exports = { newGame, apply, check, viewFor, SYM };
