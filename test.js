'use strict';
// Cho bot chơi nhiều ván với nhiều cấu hình để bắt lỗi luật.
//   node test.js [số ván] [seed]      — bot ngẫu nhiên (fuzz), in seed khi lỗi để chạy lại đúng ván đó
//   node test.js ai [số ván] [seed]   — bot AI (ai.js) đấu nhau + AI đấu bot ngẫu nhiên
const engine = require('./engine');
const { describe } = require('./config');

const args = process.argv.slice(2);
const AI_MODE = args[0] === 'ai';
if (AI_MODE) args.shift();
const N = +args[0] || 200;
const SEED = +args[1] || Math.floor(Math.random() * 1e9);

// PRNG riêng cho lựa chọn của bot, để cả lượt chạy tái hiện được từ SEED.
let rs = SEED >>> 0;
const rand = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = (a) => a[Math.floor(rand() * a.length)];

function candidates(g, pid) {
  const v = engine.viewFor(g, pid);
  const pr = v.pending;
  const me = v.me;
  const others = v.players.filter((p) => p.id !== pid && p.alive);
  const mine = v.players.find((p) => p.id === pid);
  const out = [];
  switch (pr.type) {
    case 'play':
      out.push({ type: 'end' });
      for (const c of me.hand) {
        out.push({ type: 'play', card: c.id });
        for (const o of others) {
          out.push({ type: 'play', card: c.id, target: o.id });
          out.push({ type: 'play', card: c.id, target: o.id, zone: 'hand' });
          for (const t of o.table) out.push({ type: 'play', card: c.id, target: o.id, zone: 'table', cardId: t.id });
        }
        out.push({ type: 'play', card: c.id, as: 'bang', target: rnd(others).id });
        const ex = me.hand.find((x) => x.id !== c.id); // lá "+1" (Dodge City): bỏ kèm 1 lá khác
        if (ex) {
          out.push({ type: 'play', card: c.id, extra: ex.id }, { type: 'play', card: c.id, extra: ex.id, target: pid });
          for (const o of others) {
            out.push({ type: 'play', card: c.id, extra: ex.id, target: o.id }, { type: 'play', card: c.id, extra: ex.id, target: o.id, zone: 'hand' });
            for (const t of o.table) out.push({ type: 'play', card: c.id, extra: ex.id, target: o.id, zone: 'table', cardId: t.id });
          }
        }
      }
      for (const c of mine.table) { // lá xanh lá trên bàn
        out.push({ type: 'use', card: c.id });
        for (const o of others) {
          out.push({ type: 'use', card: c.id, target: o.id }, { type: 'use', card: c.id, target: o.id, zone: 'hand' });
          for (const t of o.table) out.push({ type: 'use', card: c.id, target: o.id, zone: 'table', cardId: t.id });
        }
      }
      if (me.hand.length >= 2) out.push({ type: 'ability', cards: [me.hand[0].id, me.hand[1].id] }); // action Sid cũ không có name
      out.push(...abilityActs(me));
      break;
    case 'respond': out.push({ type: 'pass' }); for (const c of [...me.hand, ...mine.table]) out.push({ type: 'respond', card: c.id }); break;
    case 'dying': out.push({ type: 'pass' }, ...abilityActs(me)); for (const c of me.hand) out.push({ type: 'beer', card: c.id }); if (me.hand.length >= 2) out.push({ type: 'sid', cards: [me.hand[0].id, me.hand[1].id] }); break;
    case 'pick': for (const c of pr.cards) out.push({ type: 'pick', card: c.id }); break;
    case 'kit': for (const c of pr.cards) out.push({ type: 'back', card: c.id }); break;
    case 'choice': for (const o of pr.options) out.push({ type: 'choice', id: o.id }); break;
    case 'char': for (const k of pr.options) out.push({ type: 'char', key: k }); break;
    case 'suit': for (const s of 'SHDC') out.push({ type: 'suit', suit: s }); break;
    case 'discard': for (const c of me.hand) out.push({ type: 'discard', card: c.id }); out.push(...abilityActs(me)); break;
    default: throw new Error('prompt lạ: ' + pr.type);
  }
  return out;
}
// Kỹ năng engine báo dùng được: chọn lá ngẫu nhiên trong pick, thử mọi mục tiêu.
function abilityActs(me) {
  return me.abilities.flatMap((a) => {
    const cards = a.pick.slice().sort(() => rand() - 0.5).slice(0, a.cards);
    return (a.targets || [null]).map((t) => ({ type: 'ability', name: a.name, ...(a.cards ? { cards } : {}), ...(t ? { target: t } : {}) }));
  });
}
function randomAction(g, pid) {
  let cands = candidates(g, pid).filter((a) => engine.check(g, pid, a) === null);
  if (g.pending.type === 'play') { const nonEnd = cands.filter((a) => a.type !== 'end'); if (nonEnd.length && rand() < 0.85) cands = nonEnd; }
  if (!cands.length) throw new Error(`Bot ${pid} bí: ${g.pending.type}`);
  return rnd(cands);
}

// Lá đang "lơ lửng" chờ chọn: General Store (pick) và Kit Carlson (kit). Lá rút! của Lucky đã nằm ở chồng bỏ.
const limbo = (g) => { const d = g.pending && g.pending.data; if (!d) return 0; if (d.pub && typeof d.pub.limbo === 'number') return d.pub.limbo; /* bài người chết đang chờ chia (Vulture Sam) */ if (g.pending.type === 'kit') return d.priv.cards.length; return g.pending.type === 'pick' && !d.pub.flip ? d.pub.cards.length : 0; };
const cardCount = (g) => limbo(g) + g.deck.length + g.discard.length + g.players.reduce((s, p) => s + p.hand.length + p.table.length, 0);
function invariants(g) {
  if (cardCount(g) !== g.cfg.deck.length) throw new Error(`Lệch số bài: ${cardCount(g)} vs ${g.cfg.deck.length}`);
  for (const p of g.players) {
    const dyingNow = g.pending && g.pending.type === 'dying' && g.pending.player === p.id;
    if (p.char && p.alive && ((p.life <= 0 && !dyingNow) || p.life > p.maxLife || !Number.isInteger(p.life))) throw new Error(`Máu sai: ${p.name} ${p.life}/${p.maxLife} sau ${g.pending && g.pending.type}`);
    if (!p.alive && (p.hand.length || p.table.length)) throw new Error('Người chết còn bài');
  }
  if (g.log.some((l) => l.startsWith('⚠️ Lỗi luật'))) throw new Error('Engine báo lỗi luật: ' + g.log.find((l) => l.startsWith('⚠️')));
}

// pickFor(g, pid) → action. Thỉnh thoảng chen Sid ngoài lượt để thử nhánh "bất cứ lúc nào".
function playOne(settings, n, pickFor, maxSteps = 8000) {
  const members = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const seed = Math.floor(rand() * 2 ** 32);
  const g = engine.newGame(members, settings, seed);
  let steps = 0;
  while (!g.winner) {
    if (!g.pending) throw new Error('Không có prompt nhưng chưa có người thắng');
    if (++steps > maxSteps) throw new Error('Ván quá dài (kẹt?)');
    const sid = g.players.find((p) => p.alive && p.id !== g.pending.player && p.life < p.maxLife && p.hand.length >= 2 && engine.viewFor(g, p.id).me.abilities.some((a) => a.name === 'sid'));
    if (sid && rand() < 0.05) engine.apply(g, sid.id, { type: 'ability', name: 'sid', cards: [sid.hand[0].id, sid.hand[1].id] });
    else { const pid = g.pending.player; engine.apply(g, pid, pickFor(g, pid)); }
    invariants(g);
  }
  // dựng lại từ seed + chuỗi action phải ra đúng ván cũ (server dựa vào điều này để lưu phòng)
  if (rand() < 0.1) {
    const r = engine.newGame(members, settings, seed);
    for (const [pid, a] of g.actions) engine.apply(r, pid, a);
    if (r.log.join('\n') !== g.log.join('\n')) throw new Error('Replay lệch với ván gốc');
  }
  return { g, steps };
}

const meta = describe();
const EXAMPLE = {
  whiskey: { name: 'Whiskey', icon: '🥃', kind: 'action', target: 'self', effect: [{ type: 'heal', amount: 2 }], desc: 'Hồi 2 máu.', printings: ['H:2-4'] },
  machinegun: { name: 'Súng máy', icon: '🔫', kind: 'action', target: 'other', range: 'weapon', effect: [{ type: 'bang' }, { type: 'bang' }], printings: ['D:5', 'C:5'] },
  duelbang: { name: 'Duel rồi bắn', kind: 'action', target: 'other', range: 'any', effect: [{ type: 'duel' }, { type: 'bang' }], printings: ['S:3*2'] },
  robbang: { name: 'Cướp rồi bắn', kind: 'action', target: 'other', range: 1, effect: [{ type: 'steal', mode: 'take' }, { type: 'bang' }], printings: ['C:3*2'] },
  bang: { desc: 'Ví dụ ghi đè: chỉ đổi mô tả lá BANG!' },
  winchester: null,
};
const variants = [
  {},
  { rules: { eventsOn: true } },
  { rules: { drawPerTurn: 3, bangPerTurn: 0, startHandExtra: 1, charChoices: 2, handLimitBonus: 2 } },
  { rules: { lifeBonusAll: 1, sheriffBonusLife: 2, eventsOn: true, charChoices: 3 } },
  { rules: { beerDisabledAt: 0, handLimitUnlimited: true, jailEscapeSuit: 'S' } },
  meta.presets.find((p) => p.id === 'gunfight').settings,
  { rules: { eventsOn: true }, cardCopies: { dynamite: 3, jail: 3, panic: 2 } },
  { rules: { handLimitBonus: -2 }, charactersOff: meta.characters.map((c) => c.key).filter((k) => !['suzy', 'sid', 'vulture', 'janet', 'slab', 'lucky', 'kit', 'jesse', 'pedro', 'bart'].includes(k)) },
  meta.presets.find((p) => p.id === 'dodgecity').settings,
  { rules: { dodgeCity: true }, cardCopies: { knife: 3, derringer: 3, ponyexpress: 2, howitzer: 2, sombrero: 3, bible: 3, conestoga: 2, cancan: 2, springfield: 3, brawl: 3, tequila: 3, whisky: 2, ragtime: 2, dodge: 2, punch: 2 } }, // dồn lá Dodge City phần 3
  { rules: { dodgeCity: true, eventsOn: true, handLimitBonus: -2, charChoices: 2 }, charactersOff: meta.characters.filter((c) => !c.set).map((c) => c.key).slice(0, 10) }, // dồn về nhân vật Dodge City
  { // cơ chế tuỳ chỉnh: lá nhiều hiệu ứng, nhân vật mới, sự kiện mới, chế độ không Sheriff
    rules: { eventsOn: true },
    override: {
      cards: EXAMPLE,
      characters: { toi: { name: 'Tôi', icon: '😎', life: 5, abilities: ['sid', 'willy'] }, bart: null },
      events: { mua: { name: 'Mưa bài', mods: { turnStartDraw: 1, missedExtra: 0 } }, curse: null, vendetta2: { name: 'Vendetta+', mods: { vendetta: true, drawSuit: 'H' } } },
      roles: { 3: ['outlaw', 'outlaw', 'renegade'], 4: ['renegade', 'outlaw', 'outlaw', 'deputy'] },
    },
  },
];

const policies = AI_MODE ? require('./ai') : null;
function aiPicker() {
  const mem = {};
  return (gg, pid) => {
    const m = mem[pid] || (mem[pid] = policies.newMemory());
    const a = policies.decide(engine.viewFor(gg, pid), m, (x) => engine.check(gg, pid, x) === null);
    if (!a) throw new Error(`AI ${pid} trả null ở ${gg.pending.type}`);
    if (engine.check(gg, pid, a) !== null) throw new Error(`AI ${pid} trả nước sai ở ${gg.pending.type}`);
    return a;
  };
}

let games = 0; const wins = {}; let maxSteps = 0;
const aiStats = { aiSheriffWin: 0, aiSheriffGames: 0, aiOutlawWin: 0, aiOutlawGames: 0 };
for (let i = 0; i < N; i++) {
  const v = i % variants.length;
  const s = variants[v];
  const n = meta.minPlayers + (Math.floor(i / variants.length) % (meta.maxPlayers - meta.minPlayers + 1)); // mỗi biến thể chạy qua đủ số người
  try {
    let pick = randomAction;
    let mix = null;
    if (AI_MODE) {
      const ai = aiPicker();
      mix = i % 3; // 0: AI vs AI, 1: phe Sheriff là AI, 2: phe Outlaw/Renegade là AI
      pick = (g, pid) => {
        if (mix === 0) return ai(g, pid);
        const p = g.players.find((x) => x.id === pid);
        const lawful = p.role === 'sheriff' || p.role === 'deputy';
        return (mix === 1) === lawful ? ai(g, pid) : randomAction(g, pid);
      };
    }
    const { g, steps } = playOne(s, n, pick);
    if (mix === 1 && g.players.some((p) => p.role === 'sheriff')) { aiStats.aiSheriffGames++; if (g.winner.team === 'sheriff') aiStats.aiSheriffWin++; }
    if (mix === 2 && g.players.some((p) => p.role === 'sheriff')) { aiStats.aiOutlawGames++; if (g.winner.team !== 'sheriff') aiStats.aiOutlawWin++; }
    games++; wins[g.winner.team] = (wins[g.winner.team] || 0) + 1; maxSteps = Math.max(maxSteps, steps);
  } catch (e) {
    console.error(`LỖI ở ván ${i} (${n} người, biến thể ${v}, seed lượt chạy ${SEED}):`, e.stack);
    process.exit(1);
  }
}
console.log(`OK ${games}/${N} ván (seed ${SEED}). Người thắng:`, wins, '— ván dài nhất', maxSteps, 'bước');
if (AI_MODE) {
  const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '-');
  console.log(`AI phe Sheriff vs random: thắng ${pct(aiStats.aiSheriffWin, aiStats.aiSheriffGames)} · AI phe Outlaw/Renegade vs random: thắng ${pct(aiStats.aiOutlawWin, aiStats.aiOutlawGames)}`);
}
