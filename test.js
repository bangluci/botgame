'use strict';
// Cho bot chơi ngẫu nhiên nhiều ván với nhiều cấu hình để bắt lỗi luật.  Chạy: node test.js [số ván]
const engine = require('./engine');
const { describe } = require('./config');

const rnd = (a) => a[Math.floor(Math.random() * a.length)];

function candidates(g, pid) {
  const v = engine.viewFor(g, pid);
  const pr = v.pending;
  const me = v.me;
  const others = v.players.filter((p) => p.id !== pid && p.alive);
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
      }
      if (me.hand.length >= 2) out.push({ type: 'ability', cards: [me.hand[0].id, me.hand[1].id] });
      break;
    case 'respond': out.push({ type: 'pass' }); for (const c of me.hand) out.push({ type: 'respond', card: c.id }); break;
    case 'dying': out.push({ type: 'pass' }); for (const c of me.hand) out.push({ type: 'beer', card: c.id }); if (me.hand.length >= 2) out.push({ type: 'sid', cards: [me.hand[0].id, me.hand[1].id] }); break;
    case 'pick': for (const c of pr.cards) out.push({ type: 'pick', card: c.id }); break;
    case 'kit': for (const c of pr.cards) out.push({ type: 'back', card: c.id }); break;
    case 'choice': for (const o of pr.options) out.push({ type: 'choice', id: o.id }); break;
    case 'char': for (const k of pr.options) out.push({ type: 'char', key: k }); break;
    case 'suit': for (const s of 'SHDC') out.push({ type: 'suit', suit: s }); break;
    case 'discard': for (const c of me.hand) out.push({ type: 'discard', card: c.id }); break;
    default: throw new Error('prompt lạ: ' + pr.type);
  }
  return out;
}

function playOne(settings, n, maxSteps = 6000) {
  const members = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const g = engine.newGame(members, settings);
  let steps = 0;
  while (!g.winner) {
    if (!g.pending) throw new Error('Không có prompt nhưng chưa có người thắng');
    if (++steps > maxSteps) throw new Error('Ván quá dài (kẹt?)');
    const pid = g.pending.player;
    let cands = candidates(g, pid).filter((a) => engine.check(g, pid, a) === null);
    if (g.pending.type === 'play') { const nonEnd = cands.filter((a) => a.type !== 'end'); if (nonEnd.length && Math.random() < 0.85) cands = nonEnd; }
    if (!cands.length) throw new Error(`Bot ${pid} bí: ${g.pending.type}`);
    engine.apply(g, pid, rnd(cands));
    // bất biến
    for (const p of g.players) {
      const dyingNow = g.pending && g.pending.type === 'dying' && g.pending.player === p.id;
      if (p.char && p.alive && ((p.life <= 0 && !dyingNow) || p.life > p.maxLife)) throw new Error(`Máu sai: ${p.name} ${p.life}/${p.maxLife} sau ${g.pending && g.pending.type}`);
      if (!p.alive && (p.hand.length || p.table.length)) throw new Error('Người chết còn bài');
    }
  }
  const total = g.deck.length + g.discard.length + g.players.reduce((s, p) => s + p.hand.length + p.table.length, 0);
  return { steps, winner: g.winner.team, total, deckSize: g.cfg.deck.length };
}

const N = +process.argv[2] || 200;
const meta = describe();
const variants = [
  {},
  { rules: { eventsOn: true } },
  { rules: { drawPerTurn: 3, bangPerTurn: 0, startHandExtra: 1, charChoices: 2, handLimitBonus: 2 } },
  { rules: { lifeBonusAll: 1, sheriffBonusLife: 2, eventsOn: true, charChoices: 3 } },
  { rules: { beerDisabledAt: 0, handLimitUnlimited: true, jailEscapeSuit: 'S' } },
  meta.presets.find((p) => p.id === 'gunfight').settings,
  { rules: { eventsOn: true }, cardCopies: { dynamite: 3, jail: 3, panic: 2 } },
  { // thử cơ chế tuỳ chỉnh: lá mới, nhân vật mới, sự kiện mới, vai trò mới
    rules: { eventsOn: true },
    override: {
      cards: { ...JSON.parse(require('fs').readFileSync(__dirname + '/custom/cards.example.json', 'utf8')) },
      characters: { toi: { name: 'Tôi', icon: '😎', life: 5, abilities: ['sid', 'willy'] }, bart: null },
      events: { mua: { name: 'Mưa bài', mods: { turnStartDraw: 1, missedExtra: 0 } }, curse: null },
      roles: { 3: ['sheriff', 'outlaw', 'outlaw'] },
    },
  },
];
let games = 0; const wins = {}; let maxSteps = 0;
for (let i = 0; i < N; i++) {
  const s = variants[i % variants.length];
  const n = meta.minPlayers + (i % (Math.min(meta.maxPlayers, 8) - meta.minPlayers + 1));
  try {
    const r = playOne(s, n);
    if (r.total !== r.deckSize) throw new Error(`Lệch số bài: ${r.total} vs ${r.deckSize}`);
    games++; wins[r.winner] = (wins[r.winner] || 0) + 1; maxSteps = Math.max(maxSteps, r.steps);
  } catch (e) {
    console.error(`LỖI ở ván ${i} (${n} người, biến thể ${i % variants.length}):`, e.stack);
    process.exit(1);
  }
}
console.log(`OK ${games}/${N} ván. Người thắng:`, wins, '— ván dài nhất', maxSteps, 'bước');
