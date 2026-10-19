'use strict';
// Thêm bot AI vào phòng để chơi thử một mình.  Dùng: node bots.js MÃPHÒNG [số bot=3] [cổng=3001]
const ai = require('./ai');
const code = (process.argv[2] || '').toUpperCase();
const n = +process.argv[3] || 3;
const base = `http://localhost:${process.argv[4] || 3001}`;
if (!code) { console.log('Dùng: node bots.js MÃPHÒNG [số bot] [cổng]'); process.exit(1); }
const MAX_TRIES = 30;
const FATAL = ['Không tìm thấy phòng', 'Phiên không hợp lệ'];
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const call = async (p, b) => {
  try {
    const r = await fetch(base + '/api/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    return { ok: r.ok, j: await r.json() };
  } catch (e) { return { ok: false, j: { error: e.message } }; }
};

async function act(token, view, mem) {
  const safe = { play: { type: 'end' }, respond: { type: 'pass' }, dying: { type: 'pass' } }[view.pending.type];
  const list = ai.rank(view, mem).slice(0, MAX_TRIES);
  if (safe) list.push(safe);
  for (const a of list) if ((await call('action', { room: code, token, action: a })).ok) return true;
  return false;
}

async function runBot(i) {
  const name = `Bot${i + 1}`;
  const j = await call('join', { room: code, name });
  if (!j.ok) { console.log(`${name} không vào được:`, j.j.error); return; }
  const { token } = j.j;
  let ver = 0, wait = 1000, mem = ai.newMemory(), gver = 0;
  for (;;) {
    const r = await fetch(`${base}/api/poll?room=${code}&token=${token}&v=${ver}`).then((x) => x.json()).catch((e) => ({ error: e.message }));
    if (r.error || typeof r.v !== 'number') {
      const err = r.error || 'phản hồi poll không hợp lệ';
      if (FATAL.includes(err)) { console.log(`${name} dừng: ${err}`); return; }
      await sleep(wait); wait = Math.min(wait * 2, 15000); continue; // backoff, không spin
    }
    wait = 1000; ver = r.v;
    const g = r.data && r.data.game;
    if (!g) continue;
    if (g.ver < gver) mem = ai.newMemory(); // g.ver đếm lại từ đầu → ván mới, quên nghi ngờ cũ
    gver = g.ver;
    ai.observe(g, mem);
    if (g.winner || !g.pending || g.pending.player !== r.data.lobby.me) continue;
    await sleep(700 + Math.random() * 900);
    if (!(await act(token, g, mem))) console.log(`${name}: server từ chối mọi nước đi (${g.pending.type})`);
  }
}
for (let i = 0; i < n; i++) runBot(i);
console.log(`Đã thêm ${n} bot AI vào phòng ${code}. Giữ cửa sổ này mở khi chơi; bấm Bắt đầu ở sảnh.`);
