'use strict';
// Kiểm tích hợp server qua HTTP: chat, người xem, lịch sử + xem lại ván. Chạy: node test-server.js
// Dựng server thật ở cổng ngẫu nhiên với data tạm, bot đánh không chờ (BOT_DELAY_MS=0).
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const engine = require('./engine');
const ai = require('./ai');

const PORT = 4100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bang-test-'));
const DATA = path.join(DIR, 'rooms.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Phòng HONG có sẵn 1 ván trong lịch sử với action thứ 3 là rác: xem lại phải dừng ở bước 2, server không sập.
function seedBrokenRoom() {
  const members = [0, 1, 2, 3].map((i) => ({ id: 'p' + i, name: 'P' + i }));
  const g = engine.newGame(members, {}, 7), mem = {};
  for (let i = 0; i < 2; i++) {
    const pid = g.pending.player;
    engine.apply(g, pid, ai.decide(engine.viewFor(g, pid), mem[pid] || (mem[pid] = ai.newMemory()), (x) => engine.check(g, pid, x) === null));
  }
  const actions = [...g.actions, ['p0', { type: 'rác' }], ['p1', { type: 'end' }]];
  fs.writeFileSync(DATA, JSON.stringify([{ code: 'HONG', hostId: 'h1', created: Date.now(), lastActivity: Date.now(), settings: {}, chat: [], chatSeq: 0, game: null,
    members: [{ id: 'h1', token: 'tok-hong', name: 'Hỏng', bot: false, left: false }],
    history: [{ id: 'v1', ended: Date.now(), members, settings: {}, seed: 7, actions, winner: { text: '—', players: [] } }] }]));
}

async function api(p, body) {
  const r = await fetch(`${BASE}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
async function ok(p, body) {
  const r = await api(p, body);
  assert.equal(r.status, 200, `${p}: ${r.body.error}`);
  return r.body;
}
async function refused(p, body, re) {
  const r = await api(p, body);
  assert.equal(r.status, 400, `${p} lẽ ra bị từ chối`);
  assert.match(r.body.error, re);
}
const poll = async (s, extra = '') => (await (await fetch(`${BASE}/api/poll?room=${s.room}&token=${s.token}&v=0${extra}`)).json()).data;
async function replay(s, q) {
  const r = await fetch(`${BASE}/api/replay?room=${s.room}&token=${s.token}&${q}`);
  return { status: r.status, body: await r.json() };
}

async function run() {
  // 0. ván ghi hỏng giữa chừng
  const hong = { room: 'HONG', token: 'tok-hong' };
  const broken = await replay(hong, 'id=v1&step=99');
  assert.equal(broken.status, 200);
  assert.equal(broken.body.step, 2);
  assert.match(broken.body.error, /phiên bản luật cũ/);
  console.log('replay ván hỏng OK');

  // 1. A tạo phòng 4 người (3 bot) và chia bài
  const A = await ok('create', { name: 'An' });
  for (let i = 0; i < 3; i++) await ok('addbot', A);
  await ok('start', A);

  // 2. người xem
  const B = await ok('join', { room: A.room, name: 'Bình' });
  let d = await poll(B);
  assert.equal(d.game.me, null, 'người xem không có ghế');
  assert.ok(d.game.players.every((p) => typeof p.hand === 'number'), 'không thấy bài trên tay ai');
  assert.ok(d.lobby.members.find((m) => m.name === 'Bình').spectator);
  await refused('action', { ...B, action: { type: 'end' } }, /đang xem/);
  const watchers = [];
  for (let i = 0; i < 9; i++) watchers.push(await ok('join', { room: A.room, name: 'Xem' + i }));
  await refused('join', { room: A.room, name: 'Xem9' }, /đủ người xem/);
  console.log('spectator OK');

  // 3. chat
  await ok('chat', { ...B, text: 'chào cả bàn' });
  await refused('chat', { ...B, text: 'gửi nhanh quá' }, /Từ từ/);
  await refused('chat', { ...watchers[0], text: '   ' }, /trống/);
  await refused('chat', { ...watchers[1], text: 'x'.repeat(201) }, /200/);
  d = await poll(B);
  assert.equal(d.chat.length, 1);
  assert.ok(d.chat[0].spec, 'tin của người xem có cờ spec');
  d = await poll(B, `&c=${d.chat[0].id}`);
  assert.equal(d.chat.length, 0, 'chỉ gửi tin mới hơn tin client có');
  console.log('chat OK');

  // 4. A rời ván: máy chơi thay tới hết ván
  await ok('leave', A);
  const t0 = Date.now();
  do { d = await poll(B); if (!d.game.winner) await sleep(200); } while (!d.game.winner && Date.now() - t0 < 60000);
  assert.ok(d.game.winner, 'ván phải xong trong 60 giây');

  // 5. lịch sử: cất đúng 1 lần
  for (let i = 0; i < 3; i++) d = await poll(B);
  assert.equal(d.lobby.history.length, 1);
  const h = d.lobby.history[0];
  assert.equal(h.text, d.game.winner.text);

  // 6. xem lại
  const end = await replay(B, `id=${h.id}&step=${h.steps}`);
  assert.equal(end.status, 200);
  assert.equal(end.body.step, h.steps);
  assert.equal(end.body.view.winner.text, h.text, 'bước cuối trùng kết quả ván');
  assert.ok(end.body.view.players.every((p) => p.role), 'xem lại lật vai mọi người');
  assert.ok(end.body.view.defs, 'lần đầu có defs');
  const start = await replay(B, `id=${h.id}&step=0&d=${end.body.view.defsKey}`);
  assert.equal(start.status, 200);
  assert.equal(start.body.view.defs, undefined, 'đã có defs thì không gửi lại');
  const seat = start.body.view.players[1].id;
  const other = await replay(B, `id=${h.id}&step=5&pid=${seat}`);
  assert.equal(other.body.pid, seat);
  assert.ok(Array.isArray(other.body.view.me.hand), 'xem từ ghế khác thấy bài người đó');
  assert.equal((await replay(B, 'id=khongco&step=1')).status, 400);
  console.log('replay OK');

  // 7. về sảnh: người xem lên ghế theo thứ tự vào phòng, tới khi đủ 10 ghế
  await ok('lobby', B);
  d = await poll(B);
  const m = (name) => d.lobby.members.find((x) => x.name === name);
  assert.ok(!m('Bình').spectator, 'Bình vào trước nên được lên ghế');
  assert.equal(d.lobby.members.filter((x) => !x.spectator).length, 10);
  assert.ok(m('Xem8').spectator, 'hết ghế thì vẫn là người xem');
  console.log('về sảnh OK');
}

seedBrokenRoom();
const server = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(PORT), BANG_DATA: DATA, BOT_DELAY_MS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
server.stdout.on('data', (b) => { log += b; });
server.stderr.on('data', (b) => { log += b; });
(async () => {
  let code = 0;
  try {
    for (let i = 0; i < 50 && !/đang chạy/.test(log); i++) await sleep(100);
    if (!/đang chạy/.test(log)) throw new Error('server không khởi động được:\n' + log);
    await run();
    console.log('OK test-server');
  } catch (e) {
    code = 1;
    console.log('❌ test-server —', e.message);
  } finally {
    server.kill();
    fs.rmSync(DIR, { recursive: true, force: true });
  }
  process.exit(code);
})();
