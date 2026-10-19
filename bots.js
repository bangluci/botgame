'use strict';
// Thêm bot vào phòng để chơi thử một mình.  Dùng: node bots.js MÃPHÒNG [số bot=3] [cổng=3001]
const code = (process.argv[2] || '').toUpperCase();
const n = +process.argv[3] || 3;
const base = `http://localhost:${process.argv[4] || 3001}`;
if (!code) { console.log('Dùng: node bots.js MÃPHÒNG [số bot]'); process.exit(1); }
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const call = async (p, b) => { const r = await fetch(base + '/api/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return { ok: r.ok, j: await r.json() }; };

function candidates(v, meId) {
  const pr = v.pending, me = v.me, others = v.players.filter((p) => p.alive && p.id !== meId);
  const out = [];
  switch (pr.type) {
    case 'play':
      for (const c of me.hand) {
        out.push({ type: 'play', card: c.id });
        for (const o of others) {
          out.push({ type: 'play', card: c.id, target: o.id }, { type: 'play', card: c.id, target: o.id, zone: 'hand' });
          for (const t of o.table) out.push({ type: 'play', card: c.id, target: o.id, zone: 'table', cardId: t.id });
        }
      }
      out.sort(() => Math.random() - 0.5); out.push({ type: 'end' }); return out;
    case 'respond': return [...me.hand.map((c) => ({ type: 'respond', card: c.id })), { type: 'pass' }];
    case 'dying': return [...me.hand.map((c) => ({ type: 'beer', card: c.id })), { type: 'pass' }];
    case 'pick': return pr.cards.map((c) => ({ type: 'pick', card: c.id }));
    case 'kit': return pr.cards.map((c) => ({ type: 'back', card: c.id }));
    case 'choice': return pr.options.map((o) => ({ type: 'choice', id: o.id }));
    case 'char': return pr.options.map((k) => ({ type: 'char', key: k }));
    case 'suit': return ['S', 'H', 'D', 'C'].map((s) => ({ type: 'suit', suit: s }));
    case 'discard': return me.hand.map((c) => ({ type: 'discard', card: c.id }));
    default: return [];
  }
}

async function runBot(i) {
  const j = await call('join', { room: code, name: `Bot${i + 1}` });
  if (!j.ok) { console.log('Bot không vào được:', j.j.error); return; }
  const { token } = j.j; let ver = 0;
  for (;;) {
    const r = await fetch(`${base}/api/poll?room=${code}&token=${token}&v=${ver}`).then((x) => x.json()).catch(() => null);
    if (!r) { await new Promise((s) => setTimeout(s, 1000)); continue; }
    ver = r.v;
    const g = r.data && r.data.game;
    if (!g || g.winner || !g.pending || g.pending.player !== r.data.lobby.me) continue;
    await new Promise((s) => setTimeout(s, 700 + Math.random() * 900));
    const list = candidates(g, r.data.lobby.me);
    const picks = g.pending.type === 'play' ? list : list.sort(() => Math.random() - 0.5);
    for (const a of picks) { const res = await call('action', { room: code, token, action: a }); if (res.ok) break; }
  }
}
for (let i = 0; i < n; i++) runBot(i);
console.log(`Đã thêm ${n} bot vào phòng ${code}. Giữ cửa sổ này mở khi chơi; bấm Bắt đầu ở sảnh.`);
