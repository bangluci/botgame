'use strict';
// Server BANG! không cần thư viện ngoài: HTTP + long-poll.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const engine = require('./engine');
const config = require('./config');

const PORT = process.env.PORT || 3001;
const PUB = path.join(__dirname, 'public');
const rooms = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const rid = () => crypto.randomBytes(8).toString('hex');
function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (n) => String(n || '').replace(/[<>]/g, '').trim().slice(0, 16) || 'Người chơi';
const isOnline = (m) => m.waiters.size > 0 || Date.now() - m.lastSeen < 8000;

function lobbyView(room, me) {
  return {
    code: room.code, started: !!room.game, hostId: room.hostId, me, settings: room.settings,
    members: room.members.map((m) => ({ id: m.id, name: m.name, online: isOnline(m) })),
  };
}
function snapshot(room, m) {
  return { lobby: lobbyView(room, m.id), game: room.game ? engine.viewFor(room.game, m.id) : null };
}
function pushAll(room) {
  room.version = (room.version || 0) + 1;
  for (const m of room.members) for (const w of [...m.waiters]) w();
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 2e5) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('JSON không hợp lệ')); } });
  });
}
function auth(b) {
  const room = rooms.get(String(b.room || '').toUpperCase());
  if (!room) throw new Error('Không tìm thấy phòng');
  const m = room.members.find((x) => x.token === b.token);
  if (!m) throw new Error('Phiên không hợp lệ');
  return { room, m };
}
const newMember = (name) => ({ id: rid(), token: rid(), name: cleanName(name), waiters: new Set(), lastSeen: Date.now() });

async function api(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/meta') return json(res, 200, config.describe());
    if (req.method === 'GET' && url.pathname === '/api/poll') {
      const { room, m } = auth({ room: url.searchParams.get('room'), token: url.searchParams.get('token') });
      const since = +url.searchParams.get('v') || 0;
      const wasOnline = isOnline(m);
      m.lastSeen = Date.now();
      if (!wasOnline) pushAll(room);
      const reply = () => json(res, 200, room.version > since ? { v: room.version, data: snapshot(room, m) } : { v: room.version, same: true });
      if ((room.version || 0) > since) return reply();
      let done = false;
      const finish = () => { if (done) return; done = true; clearTimeout(t); m.waiters.delete(finish); m.lastSeen = Date.now(); reply(); };
      const t = setTimeout(finish, 20000);
      m.waiters.add(finish);
      req.on('close', () => {
        if (done) return; done = true; clearTimeout(t); m.waiters.delete(finish); m.lastSeen = Date.now();
        setTimeout(() => { if (!isOnline(m) && rooms.has(room.code)) pushAll(room); }, 9000);
      });
      return;
    }
    const b = await body(req);
    if (url.pathname === '/api/create') {
      const code = roomCode();
      const m = newMember(b.name);
      rooms.set(code, { code, hostId: m.id, members: [m], game: null, created: Date.now(), version: 1, settings: config.sanitize({}) });
      return json(res, 200, { room: code, token: m.token });
    }
    if (url.pathname === '/api/join') {
      const room = rooms.get(String(b.room || '').toUpperCase().trim());
      if (!room) throw new Error('Không tìm thấy phòng');
      if (room.game) throw new Error('Phòng đã bắt đầu ván');
      if (room.members.length >= config.describe().maxPlayers) throw new Error('Phòng đã đầy');
      const m = newMember(b.name);
      room.members.push(m);
      json(res, 200, { room: room.code, token: m.token });
      return pushAll(room);
    }
    const { room, m } = auth(b);
    const host = () => { if (m.id !== room.hostId) throw new Error('Chỉ chủ phòng làm được việc này'); };
    if (url.pathname === '/api/settings') {
      host();
      if (room.game) throw new Error('Không đổi luật khi đang chơi');
      const s = config.sanitize(b.settings);
      config.resolve(s); // báo lỗi sớm nếu JSON ghi đè sai
      room.settings = s;
    } else if (url.pathname === '/api/start') {
      host();
      const min = config.describe().minPlayers;
      if (room.members.length < min) throw new Error(`Cần ít nhất ${min} người`);
      room.game = engine.newGame(room.members.map((x) => ({ id: x.id, name: x.name })), room.settings);
    } else if (url.pathname === '/api/action') {
      if (!room.game) throw new Error('Chưa bắt đầu');
      engine.apply(room.game, m.id, b.action || {});
    } else if (url.pathname === '/api/lobby') {
      host(); room.game = null;
    } else if (url.pathname === '/api/leave') {
      if (!room.game) {
        room.members = room.members.filter((x) => x !== m);
        if (!room.members.length) rooms.delete(room.code);
        else if (room.hostId === m.id) room.hostId = room.members[0].id;
      }
    } else return json(res, 404, { error: 'Not found' });
    json(res, 200, { ok: true });
    pushAll(room);
  } catch (e) {
    json(res, 400, { error: e.message });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  const f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, '0.0.0.0', () => {
  try { config.describe(); } catch (e) { console.error('\n⚠️  Cấu hình đang lỗi:', e.message, '\n'); }
  console.log(`\nBANG! đang chạy!\n  Máy này:   http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list) if (i.family === 'IPv4' && !i.internal) console.log(`  Cùng WiFi: http://${i.address}:${PORT}`);
  console.log('');
});

setInterval(() => {
  for (const [c, r] of rooms) if (Date.now() - r.created > 12 * 3600e3 && r.members.every((m) => !isOnline(m))) rooms.delete(c);
}, 3600e3);
