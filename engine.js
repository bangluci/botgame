'use strict';
// Bộ máy luật BANG!. Luồng ván là 1 generator: mỗi `yield` là một câu hỏi gửi cho 1 người chơi.
const { resolve, RANKS } = require('./config');
const { ready, OVER, SYM, SUIT_VI, makeRng, shuffle, rnd, cdef, pubCard, cname, say, alive, dirOf, charAbs, ab, apacheSafe, prompt, nextAlive, othersFrom, distance, weaponRange, bangLimit, handLimit, beerAmount, beersFor, popDeck, drawCards, pull, suzy, takeHand, takeTable, heal } = require('./rules');
const { drawCheck, damage, dying, respondCards, defend, bangAttack, duel } = require('./combat');
const { ACTIVE, INLINE, asAbility, checkAbility, useAbility, abilitiesFor, whereFor } = require('./abilities');

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
  const plan = { card, def: d, target: null, zone: null, cardId: null, asBang, extra: null };
  if (d.cost) { // lá "bỏ kèm 1 lá" (Dodge City)
    plan.extra = p.hand.find((c) => c.id === a.extra && c !== card);
    if (!plan.extra) throw new Error('Chọn thêm 1 lá khác trên tay để bỏ kèm');
  }
  if (d.kind === 'green') { // lá xanh lá chỉ đặt trước mặt, lượt sau mới dùng
    if (p.table.some((c) => c.key === card.key)) throw new Error('Bạn đã có lá này trên bàn');
    return plan;
  }
  if (d.kind === 'equip' && !d.equip.weapon && !d.target && p.table.some((c) => c.key === card.key)) throw new Error('Bạn đã có lá này trên bàn');
  aim(g, p, a, d, d.effect || [], plan);
  return plan;
}
// Kiểm giới hạn BANG! và mục tiêu/khoảng cách cho lá đang chơi (eff = effect) hoặc lá xanh lá đang dùng (eff = use).
function aim(g, p, a, d, eff, plan) {
  if (eff.some((e) => e.type === 'bang') && !d.free) { // Punch, Springfield, lá xanh lá… không phải lá BANG! nên không bị giới hạn
    if (g.mods.noBang) throw new Error('Sự kiện đang cấm BANG!');
    if (p.bangs >= bangLimit(g, p)) throw new Error(`Mỗi lượt chỉ được bắn ${bangLimit(g, p)} BANG!`);
  }
  if (d.target === 'any') { // Tequila: ai cũng được, kể cả mình (không chọn = mình)
    const t = a.target === undefined ? p : g.players.find((x) => x.id === a.target && x.alive);
    if (!t) throw new Error('Hãy chọn 1 người còn sống');
    plan.target = t;
    return;
  }
  if (d.target !== 'other') return;
  const t = g.players.find((x) => x.id === a.target && x.alive);
  if (!t || t === p) throw new Error('Hãy chọn 1 mục tiêu hợp lệ');
  const range = d.range === undefined ? (eff.some((e) => e.type === 'bang') ? 'weapon' : 'any') : d.range;
  const dist = distance(g, p, t);
  if (range === 'weapon' && dist > weaponRange(g, p)) throw new Error(`${t.name} ở khoảng cách ${dist}, ngoài tầm súng (${weaponRange(g, p)})`);
  if (typeof range === 'number' && dist > range) throw new Error(`${t.name} ở khoảng cách ${dist}, quá xa (chỉ ${range})`);
  if (d.notSheriff && t.role === 'sheriff') throw new Error('Không thể dùng lên Cảnh sát trưởng');
  if (d.kind !== 'equip' && !eff.some((e) => e.type === 'duel') && apacheSafe(g, p, t, plan.card)) throw new Error(`${t.name} (Apache Kid) không bị ảnh hưởng bởi lá ♦`);
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
// Lá xanh lá đã đặt từ lượt trước: dùng trong lượt mình (action 'use'). Lá chỉ có react (Missed!) thì dùng khi đỡ đòn.
function planUse(g, p, a) {
  if (a.type !== 'use') throw new Error('Hành động không hợp lệ');
  const card = p.table.find((c) => c.id === a.card);
  const d = card && cdef(g, card);
  if (!d || d.kind !== 'green' || !d.use) throw new Error('Không có lá xanh lá dùng được này trên bàn');
  if (!ready(g, card)) throw new Error('Lá xanh lá vừa đặt, lượt sau mới dùng được');
  const plan = { card, def: d, target: null, zone: null, cardId: null, asBang: false, extra: null };
  aim(g, p, a, d, d.use, plan);
  return plan;
}
function* execUse(g, p, a) {
  const plan = planUse(g, p, a);
  const card = takeTable(p, a.card); g.discard.push(card);
  g.last = { pid: p.id, card: pubCard(card), target: plan.target ? plan.target.id : null, asBang: false };
  say(g, `🂠 ${p.name} dùng ${cname(g, card)}${plan.target ? ` → ${plan.target.name}` : ''}`);
  yield* runEffects(g, p, plan.def.use, plan);
}
function* runEffects(g, p, list, plan) {
  for (const e of list) {
    if (!p.alive) break;
    if (plan.target && !plan.target.alive && TARGETED.has(e.type)) continue;
    yield* runEffect(g, p, e, plan);
  }
}
// Brawl: lần lượt từng người khác, người chơi lá chọn 1 lá ngẫu nhiên trên tay hoặc 1 lá trên bàn của họ để bỏ.
function* brawl(g, p, plan) {
  for (const t of othersFrom(g, p)) {
    if (!t.alive || !(t.hand.length + t.table.length)) continue;
    if (apacheSafe(g, p, t, plan.card)) { say(g, `🪶 ${t.name} không bị ảnh hưởng bởi lá ♦ (Apache Kid).`); continue; }
    const opts = [...(t.hand.length ? [{ id: 'hand', label: `1 lá ngẫu nhiên trên tay (${t.hand.length})` }] : []), ...t.table.map((c) => ({ id: 'c' + c.id, label: cname(g, c), card: pubCard(c) }))];
    let id = opts[0].id;
    if (opts.length > 1) {
      const a = yield prompt(p, 'choice', { text: `Brawl: ${t.name} bỏ lá nào?`, pub: { kind: 'brawl', target: t.id, options: opts } },
        (act) => { if (act.type !== 'choice' || !opts.some((o) => o.id === act.id)) throw new Error('Hãy chọn 1 lá'); });
      id = a.id;
    }
    const c = id === 'hand' ? takeHand(g, t, rnd(g, t.hand).id) : takeTable(t, +id.slice(1));
    g.discard.push(c);
    say(g, `🤼 ${t.name} phải bỏ ${cname(g, c)}${id === 'hand' ? ' (từ tay)' : ''}.`);
  }
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
    case 'bang': if (!d.free) p.bangs++; yield* bangAttack(g, p, plan.target); break;
    case 'heal': {
      const targets = e.who === 'all' ? [p, ...othersFrom(g, p)] : e.who === 'target' ? [plan.target] : [p];
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
    case 'brawl': yield* brawl(g, p, plan); break;
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
  if (a.type === 'use') { yield* execUse(g, p, a); suzy(g, p); return; }
  const plan = planPlay(g, p, a);
  const card = pull(p, a.card); // Suzy chỉ rút sau khi lá này xong hiệu ứng (FAQ Q22)
  if (plan.extra) g.discard.push(pull(p, plan.extra.id)); // lá bỏ kèm
  const d = plan.def;
  g.last = { pid: p.id, card: pubCard(card), target: plan.target ? plan.target.id : null, asBang: plan.asBang };
  say(g, `🂠 ${p.name} chơi ${cname(g, card)}${plan.target && plan.target !== p ? ` → ${plan.target.name}` : ''}${plan.asBang ? ' (như BANG!)' : ''}${plan.extra ? `, bỏ kèm ${cname(g, plan.extra)}` : ''}`);
  if (d.kind === 'equip') yield* equip(g, p, card, d, plan.target);
  else if (d.kind === 'green') { card.placed = g.turnNo; p.table.push(card); say(g, `🌿 ${cname(g, card)} đặt trước mặt ${p.name} — từ lượt sau mới dùng.`); }
  else { g.discard.push(card); yield* runEffects(g, p, d.effect, plan); }
  suzy(g, p);
}
const TARGETED = new Set(['bang', 'duel', 'steal']);

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
  g.turnNo++; // lá xanh lá đặt ở lượt trước mới dùng được
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
      if (act.type === 'use') return void planUse(g, p, act);
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
  const sheriffIdx = Math.max(0, g.players.findIndex((p) => p.role === (g.threeP ? 'deputy' : 'sheriff'))); // 3 người: Deputy đi trước
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
  // Dodge City 3 người: Deputy/Outlaw/Renegade lật ngửa, mỗi người một mục tiêu riêng
  const threeP = n === 3 && !!cfg.rules.dodgeCity && !!cfg.rules.dodgeCity3p;
  const roles = threeP ? ['deputy', 'outlaw', 'renegade'] : cfg.roles[n];
  if (!roles) throw new Error(`Chưa có cấu hình vai trò cho ${n} người`);
  const rng = makeRng(seed);
  const rl = shuffle([...roles], rng);
  const players = shuffle(members.slice(), rng).map((m, i) => ({ id: m.id, name: m.name, role: rl[i], char: null, life: 0, maxLife: 0, hand: [], table: [], alive: true, bangs: 0, cuff: null, used: {}, vera: null, extraTurn: false, inExtra: false }));
  let nid = 1;
  const deck = shuffle(cfg.deck.map((c) => ({ ...c, id: nid++ })), rng);
  const g = { seed, rng, actions: [], round: 0, faults: 0, cfg, rules: cfg.rules, players, deck, discard: [], log: [], mods: {}, event: null, eventDeck: [], pending: null, winner: null, turn: null, last: null, ver: 0, first: null, noEvent: false, turnNo: 0, threeP };
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
const okNow = (g) => (a) => { try { g.pending.validate(a); return true; } catch (e) { return false; } };
// Những người action `base` nhắm được (kể cả kiểu lấy 1 lá trên bàn của họ).
const hitsFor = (g, p, base, extra = {}) => { const ok = okNow(g); return g.players.filter((q) => q.alive && q !== p).filter((q) => ok({ ...base, ...extra, target: q.id }) || q.table.some((t) => ok({ ...base, ...extra, target: q.id, zone: 'table', cardId: t.id }))).map((q) => q.id); };
function playableFor(g, p) {
  const ok = okNow(g);
  const others = g.players.filter((q) => q.alive && q !== p);
  const out = {};
  for (const c of p.hand) {
    const dc = cdef(g, c);
    const filler = dc.cost ? p.hand.find((x) => x !== c) : null; // lá "+1": thử với 1 lá bất kỳ khác để biết có chơi được không
    if (dc.cost && !filler) continue;
    const base = { type: 'play', card: c.id, ...(filler ? { extra: filler.id } : {}) };
    const hits = (extra) => hitsFor(g, p, base, extra);
    const needs = dc.kind !== 'green' && (dc.target === 'other' || dc.target === 'any'); // lá tự chơi bỏ qua target; lá xanh lá đặt xuống không cần mục tiêu (target là lúc dùng)
    const r = { self: (!needs || dc.target === 'any') && ok(base), targets: needs ? hits({}) : [] }; // Tequila: không chọn ai = cho mình
    if (dc.cost) r.cost = dc.cost;
    if (ab(g, p, 'janet') && cdef(g, c).react === 'missed') r.bangTargets = hits({ as: 'bang' });
    // người không nhắm được chỉ vì Apache Kid miễn lá ♦ — client ghi 'miễn ♦' thay vì 'ngoài tầm'
    const d = cdef(g, c);
    if (needs && d.kind === 'action' && !(d.effect || []).some((x) => x.type === 'duel')) { const imm = others.filter((q) => !r.targets.includes(q.id) && apacheSafe(g, p, q, c)).map((q) => q.id); if (imm.length) r.immune = imm; }
    if (r.self || r.targets.length || (r.bangTargets && r.bangTargets.length)) out[c.id] = r;
  }
  return out;
}
// Lá xanh lá trên bàn dùng được ngay trong lượt mình (client sinh nút "Dùng …").
function greensFor(g, p) {
  const ok = okNow(g);
  return p.table.filter((c) => cdef(g, c).kind === 'green' && cdef(g, c).use).map((c) => {
    const base = { type: 'use', card: c.id }, needs = cdef(g, c).target === 'other';
    return { id: c.id, self: !needs && ok(base), targets: needs ? hitsFor(g, p, base) : [] };
  }).filter((x) => x.self || x.targets.length);
}
function usableFor(g, p, pr) {
  if (pr.type === 'respond') return respondCards(g, p, pr.data.pub.kind).map((c) => c.id);
  if (pr.type === 'dying') return beersFor(g, p).map((c) => c.id);
  if (pr.type === 'discard') return p.hand.map((c) => c.id);
  return [];
}

function viewFor(g, pid) {
  const me = g.players.find((p) => p.id === pid);
  const showRole = (p) => p === me || p.role === 'sheriff' || g.threeP || (!p.alive && g.rules.revealRoleOnDeath) || !!g.winner; // 3 người: vai lật ngửa
  const pr = g.pending;
  const mine = !!(pr && me && pr.player === pid);
  let pending = null;
  if (pr) pending = { player: pr.player, type: pr.type, text: pr.data.text || '', ...(pr.data.pub || {}), ...(mine ? pr.data.priv || {} : {}) };
  const ev = g.event ? g.cfg.events[g.event] : null;
  return {
    ver: g.ver, round: g.round,
    players: g.players.map((p) => ({
      id: p.id, name: p.name, char: p.char, life: p.life, maxLife: p.maxLife, hand: p.hand.length, alive: p.alive,
      table: p.table.map((c) => (cdef(g, c).kind === 'green' && !ready(g, c) ? { ...pubCard(c), fresh: true } : pubCard(c))), role: showRole(p) ? p.role : null, vera: p.vera || null,
      dist: me && me.alive && p.alive && p !== me ? distance(g, me, p) : null,
    })),
    me: me ? {
      hand: me.hand.map(pubCard), role: me.role, bangs: me.bangs, cuff: me.cuff, bangLimit: bangLimit(g, me) === Infinity ? 0 : bangLimit(g, me), range: weaponRange(g, me),
      playable: mine && pr.type === 'play' ? playableFor(g, me) : null,
      greens: mine && pr.type === 'play' ? greensFor(g, me) : [],
      usable: mine ? usableFor(g, me, pr) : [],
      abilities: abilitiesFor(g, me, whereFor(g, me)),
    } : null,
    turn: g.turn, deck: g.deck.length, discard: g.discard.length,
    discardTop: g.discard.length ? pubCard(g.discard[g.discard.length - 1]) : null,
    last: g.last, event: ev ? { key: g.event, name: ev.name, icon: ev.icon, desc: ev.desc, final: !!ev.final } : null,
    eventsOn: g.cfg.eventsOn, reverse: !!g.mods.reverse, threeP: !!g.threeP,
    pending, winner: g.winner, log: g.log.slice(-150),
    defs: {
      cards: Object.fromEntries(Object.entries(g.cfg.cards).map(([k, c]) => [k, { name: c.name, icon: c.icon || '🂠', kind: c.kind, desc: c.desc || '', target: c.target || 'none', range: c.range, react: c.react, playable: c.playable, isBeer: !!c.isBeer, cost: c.cost || 0, use: !!c.use, steal: [...(c.effect || []), ...(c.use || [])].some((e) => e.type === 'steal'), bang: [...(c.effect || []), ...(c.use || [])].some((e) => e.type === 'bang') }])),
      chars: Object.fromEntries(Object.entries(g.cfg.characters).map(([k, c]) => [k, { name: c.name, icon: c.icon || '🙂', life: c.life, desc: c.desc || '', abilities: c.abilities || [] }])),
    },
    janet: me ? ab(g, me, 'janet') : false,
  };
}

module.exports = { newGame, apply, check, viewFor, SYM };
