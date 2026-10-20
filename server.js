'use strict';
// Server BANG! không cần thư viện ngoài: HTTP + long-poll. Bot chạy ngay trong server (ai.js),
// máy tự chơi thay người rớt mạng/AFK, phòng được lưu ra data/ để khởi động lại không mất ván.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const zlib = require('zlib');
const engine = require('./engine');
const config = require('./config');
const ai = require('./ai');

const PORT = +process.env.PORT || 3001;
const PUB = path.join(__dirname, 'public');
const DATA = process.env.BANG_DATA || path.join(__dirname, 'data', 'rooms.json');
const MAX_ROOMS = 200;
const ROOMS_PER_IP_HOUR = 30;
const BODY_LIMIT = 2e5;
const BOT_DELAY = process.env.BOT_DELAY_MS ? [+process.env.BOT_DELAY_MS, +process.env.BOT_DELAY_MS] : [700, 1400]; // bot "nghĩ" một chút để người xem kịp theo dõi
// Máy chơi thay người rớt mạng / đứng im: số giây là luật của phòng (offlineTakeover, idleTakeover — chỉnh trong sảnh).
const takeover = (room, key) => 1000 * config.rule(room.settings, key);
const HOST_HANDOVER = 30000; // chủ phòng offline 30 giây thì chuyển quyền chủ phòng
const BOT_NAMES = ['Doc', 'Wyatt', 'Annie', 'Butch', 'Belle', 'Kid', 'Pearl', 'Bat', 'Jesse', 'Sundance'];
const EMOTES = ['👍', '😂', '😱', '😡', '🎯', '🍺', '💀', '🤠', '👏', '🙏'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; base-uri 'none'";

const rooms = new Map();
const rid = () => crypto.randomBytes(8).toString('hex');
function roomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += A[crypto.randomInt(A.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = (n) => String(n || '').replace(/[<>"'&`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Người chơi';
const isOnline = (m) => !!m.bot || m.waiters.size > 0 || Date.now() - m.lastSeen < 8000;
const maxPlayers = () => config.describe().maxPlayers;

// Địa chỉ cho bạn bè cùng mạng; adapter ảo (VPN, WSL, Hyper-V…) xếp cuối vì bạn bè thường không vào được.
const VIRTUAL = /vEthernet|VirtualBox|VMware|WSL|Hyper-V|Radmin|Hamachi|ZeroTier|Tailscale|vpn|Loopback/i;
function lanAddrs() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push({ name, url: `http://${i.address}:${PORT}`, virtual: VIRTUAL.test(name) });
  return out.sort((a, b) => a.virtual - b.virtual);
}
const LAN = lanAddrs();

// ---------- phòng & ảnh chụp trạng thái ----------
const newMember = (name, extra) => ({ id: rid(), token: rid(), name: cleanName(name), waiters: new Set(), lastSeen: Date.now(), ...extra });
function newRoom(code, host) {
  const now = Date.now();
  return { code, hostId: host.id, members: [host], game: null, gameMembers: null, created: now, lastActivity: now, version: 1, settings: config.sanitize({}), mem: {}, timer: null, emotes: [] };
}
function lobbyView(room, me) {
  return {
    code: room.code, started: !!room.game, hostId: room.hostId, me, settings: room.settings, lan: LAN.filter((a) => !a.virtual).map((a) => a.url),
    lists: room.game ? null : config.roomLists(room.settings), // lá/nhân vật tự thêm qua "Nâng cao" hiện trong các tab của sảnh
    members: room.members.map((m) => ({ id: m.id, name: m.name, online: isOnline(m), bot: !!m.bot, auto: !!m.left })),
  };
}
// defs (định nghĩa lá/nhân vật của ván) chiếm ~70% mỗi ảnh chụp mà không đổi suốt ván: client gửi lại khoá
// của bản đang giữ (?d=), trùng thì server bỏ defs ra khỏi gói.
const defsKeys = new WeakMap();
function defsKey(g, defs) {
  if (!defsKeys.has(g)) defsKeys.set(g, crypto.createHash('sha1').update(JSON.stringify(defs)).digest('hex').slice(0, 12));
  return defsKeys.get(g);
}
function snapshot(room, m, haveDefs) {
  const g = room.game, t = room.timer;
  const now = Date.now();
  let game = null;
  if (g) {
    const { defs, ...v } = engine.viewFor(g, m.id), key = defsKey(g, defs);
    game = { ...v, defsKey: key, ...(haveDefs === key ? {} : { defs }), deadline: t && g.pending && t.ver === g.ver && t.kind !== 'bot' ? t.at : null };
  }
  return { now, lobby: lobbyView(room, m.id), emotes: room.emotes.filter((e) => now - e.t < 6000), game };
}
function pushAll(room) {
  room.version++;
  room.lastActivity = Date.now();
  schedule(room);
  if (room.game) for (const m of room.members) if (m.bot || m.left) ai.observe(engine.viewFor(room.game, m.id), room.mem[m.id] || (room.mem[m.id] = ai.newMemory()));
  for (const m of room.members) for (const w of [...m.waiters]) w();
  save();
}

// ---------- bot & chơi thay ----------
// Mỗi prompt chỉ hẹn 1 lần cho mỗi "kiểu" (bot / người offline / người đứng im).
function schedule(room) {
  const g = room.game;
  const t = room.timer;
  if (!g || g.winner || !g.pending) { if (t) clearTimeout(t.h); room.timer = null; return; }
  const m = room.members.find((x) => x.id === g.pending.player);
  if (!m) return;
  const kind = m.bot || m.left ? 'bot' : isOnline(m) ? 'idle' : 'offline';
  if (t && t.ver === g.ver && t.kind === kind) return;
  if (t) clearTimeout(t.h);
  const now = Date.now();
  const since = t && t.ver === g.ver ? t.since : now;
  const at = kind === 'bot' ? now + BOT_DELAY[0] + Math.random() * (BOT_DELAY[1] - BOT_DELAY[0]) : kind === 'idle' ? since + takeover(room, 'idleTakeover') : now + takeover(room, 'offlineTakeover');
  const ver = g.ver;
  room.timer = { ver, kind, since, at, h: setTimeout(() => autoPlay(room, g, ver), Math.max(0, at - now)) };
}
function autoPlay(room, g, ver) {
  if (room.game !== g || g.ver !== ver || !g.pending || g.winner) return;
  const pid = g.pending.player;
  const mem = room.mem[pid] || (room.mem[pid] = ai.newMemory());
  try {
    const a = ai.decide(engine.viewFor(g, pid), mem, (x) => engine.check(g, pid, x) === null);
    if (!a) throw new Error(`AI không tìm được nước cho prompt ${g.pending.type}`);
    engine.apply(g, pid, a);
  } catch (e) { console.error(`[bot ${room.code}]`, e.message); }
  pushAll(room);
}

// ---------- lưu / khôi phục phòng ----------
let saveTimer = null;
// Gom ghi đĩa tối đa ~1 lần/0.8s (throttle, không debounce: bot đánh liên tục thì debounce sẽ không bao giờ ghi).
function save() {
  if (!saveTimer) saveTimer = setTimeout(writeRooms, 800);
}
function writeRooms() {
  clearTimeout(saveTimer); saveTimer = null;
  const data = [...rooms.values()].map((r) => ({
    code: r.code, hostId: r.hostId, created: r.created, lastActivity: r.lastActivity, settings: r.settings,
    members: r.members.map((m) => ({ id: m.id, token: m.token, name: m.name, bot: !!m.bot, left: !!m.left })),
    game: r.game ? { members: r.gameMembers, seed: r.game.seed, actions: r.game.actions } : null,
  }));
  try {
    fs.mkdirSync(path.dirname(DATA), { recursive: true });
    fs.writeFileSync(DATA + '.tmp', JSON.stringify(data));
    fs.renameSync(DATA + '.tmp', DATA);
  } catch (e) { console.error('Không lưu được phòng:', e.message); }
}
function load() {
  let data;
  try { data = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') console.error('Không đọc được', DATA, '—', e.message); return; }
  for (const r of Array.isArray(data) ? data : []) {
    const room = { ...newRoom(r.code, { id: r.hostId }), ...r, version: 1, game: null, gameMembers: null, members: r.members.map((m) => ({ ...m, waiters: new Set(), lastSeen: Date.now() })) };
    if (r.game) {
      // dựng lại ván: cùng seed + cùng chuỗi action => đúng trạng thái cũ
      try {
        const g = engine.newGame(r.game.members, r.settings, r.game.seed);
        for (const [pid, a] of r.game.actions) engine.apply(g, pid, a);
        room.game = g; room.gameMembers = r.game.members;
      } catch (e) { console.error(`Phòng ${r.code}: không dựng lại được ván (${e.message}) — đưa về sảnh.`); }
    }
    rooms.set(room.code, room);
  }
  for (const room of rooms.values()) schedule(room);
  if (rooms.size) console.log(`Đã khôi phục ${rooms.size} phòng từ data/rooms.json`);
}

// ---------- HTTP ----------
// Nén gzip khi trình duyệt nhận được (ảnh chụp ván toàn chữ lặp lại: nhỏ đi ~4 lần).
function send(res, code, headers, data) {
  const gz = data.length > 1024 && /^(text\/|application\/json|image\/svg)/.test(headers['Content-Type']) && /\bgzip\b/.test(res.req.headers['accept-encoding'] || '');
  res.writeHead(code, gz ? { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : headers);
  res.end(gz ? zlib.gzipSync(data) : data);
}
function json(res, code, obj) {
  if (res.headersSent) return;
  send(res, code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify(obj));
}
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, over = false;
    req.on('data', (d) => { size += d.length; if (size > BODY_LIMIT) over = true; else chunks.push(d); });
    req.on('end', () => {
      if (over) return reject(Object.assign(new Error('Dữ liệu gửi lên quá lớn'), { status: 413 }));
      try { const s = Buffer.concat(chunks).toString('utf8'); resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(new Error('JSON không hợp lệ')); }
    });
    req.on('error', reject);
  });
}
function auth(b) {
  const room = rooms.get(String(b.room || '').toUpperCase());
  if (!room) throw new Error('Không tìm thấy phòng');
  const m = room.members.find((x) => x.token === b.token);
  if (!m) throw new Error('Phiên không hợp lệ');
  return { room, m };
}
const created = new Map(); // ip -> [thời điểm tạo phòng]
function limitIp(req) {
  const fwd = req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const local = /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
  const ip = (local && fwd) || req.socket.remoteAddress || '?';
  const now = Date.now();
  const list = (created.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.length >= ROOMS_PER_IP_HOUR) throw new Error('Tạo phòng quá nhiều, thử lại sau ít phút');
  created.set(ip, [...list, now]);
}
function firstHuman(room, except) { return room.members.find((x) => !x.bot && !x.left && x !== except && isOnline(x)) || room.members.find((x) => !x.bot && x !== except); }

function poll(req, res, url) {
  const { room, m } = auth({ room: url.searchParams.get('room'), token: url.searchParams.get('token') });
  const since = +url.searchParams.get('v') || 0;
  const wasOnline = isOnline(m);
  m.lastSeen = Date.now();
  if (!wasOnline) pushAll(room);
  const haveDefs = url.searchParams.get('d') || '';
  const reply = () => json(res, 200, room.version > since ? { v: room.version, data: snapshot(room, m, haveDefs) } : { v: room.version, same: true });
  if (room.version > since) return reply();
  let done = false;
  const finish = () => { if (done) return; done = true; clearTimeout(t); m.waiters.delete(finish); m.lastSeen = Date.now(); reply(); };
  const t = setTimeout(finish, 20000);
  m.waiters.add(finish);
  req.on('close', () => {
    if (done) return; done = true; clearTimeout(t); m.waiters.delete(finish); m.lastSeen = Date.now();
    setTimeout(() => { if (!isOnline(m) && rooms.get(room.code) === room) pushAll(room); }, 9000);
  });
}

function join(b) {
  const room = rooms.get(String(b.room || '').toUpperCase().trim());
  if (!room) throw new Error('Không tìm thấy phòng');
  const name = cleanName(b.name);
  // Vào lại ghế cũ bằng đúng tên (mất phiên, đổi máy…) khi người đó đang offline hoặc đã rời giữa ván.
  const same = room.members.find((x) => !x.bot && x.name.toLowerCase() === name.toLowerCase());
  if (same) {
    if (isOnline(same) && !same.left) throw new Error('Tên này đang có người dùng trong phòng');
    same.left = false; same.lastSeen = Date.now();
    return { room, m: same };
  }
  if (room.game) throw new Error('Phòng đang chơi — chỉ vào lại được bằng đúng tên cũ của bạn');
  if (room.members.length >= maxPlayers()) throw new Error('Phòng đã đầy');
  const m = newMember(name);
  room.members.push(m);
  return { room, m };
}

// Các lệnh cần phiên. Trả về true nếu đã tự trả lời.
function command(p, b, room, m) {
  const host = () => { if (m.id !== room.hostId) throw new Error('Chỉ chủ phòng làm được việc này'); };
  const lobbyOnly = () => { if (room.game) throw new Error('Chỉ làm được ở sảnh'); };
  switch (p) {
    case '/api/settings': {
      host(); lobbyOnly();
      const s = config.sanitize(b.settings);
      config.resolve(s); // báo lỗi sớm nếu JSON ghi đè sai
      room.settings = s;
      break;
    }
    case '/api/start': {
      host(); lobbyOnly();
      const min = config.describe().minPlayers;
      if (room.members.length < min) throw new Error(`Cần ít nhất ${min} người — bấm "Thêm bot" nếu thiếu`);
      room.gameMembers = room.members.map((x) => ({ id: x.id, name: x.name }));
      room.game = engine.newGame(room.gameMembers, room.settings);
      room.mem = {};
      break;
    }
    case '/api/action':
      if (!room.game) throw new Error('Chưa bắt đầu');
      m.left = false;
      engine.apply(room.game, m.id, b.action || {});
      break;
    case '/api/lobby': // huỷ ván / về sảnh: chủ phòng bất cứ lúc nào, mọi người khi ván đã xong
      if (!room.game) break;
      if (!room.game.winner) host();
      room.game = null; room.gameMembers = null;
      room.members = room.members.filter((x) => !x.left);
      if (!room.members.some((x) => x.id === room.hostId)) room.hostId = (firstHuman(room) || room.members[0]).id;
      break;
    case '/api/leave':
      if (room.game) m.left = true; // đang chơi: máy chơi thay tới hết ván
      else room.members = room.members.filter((x) => x !== m);
      if (!room.members.some((x) => !x.bot && !x.left)) { rooms.delete(room.code); save(); return false; }
      if (room.hostId === m.id) room.hostId = firstHuman(room, m).id;
      break;
    case '/api/addbot': {
      host(); lobbyOnly();
      if (room.members.length >= maxPlayers()) throw new Error('Phòng đã đầy');
      const used = new Set(room.members.map((x) => x.name));
      const nm = BOT_NAMES.map((n) => `🤖 ${n}`).find((n) => !used.has(n)) || `🤖 Bot ${room.members.length}`;
      room.members.push(newMember('', { name: nm, bot: true }));
      break;
    }
    case '/api/kick': { // ở sảnh: mời ra; đang chơi: cho máy chơi thay người đó
      host();
      const t = room.members.find((x) => x.id === b.id);
      if (!t || t === m) throw new Error('Không mời ra được người này');
      if (room.game) t.left = true;
      else room.members = room.members.filter((x) => x !== t);
      break;
    }
    case '/api/emote': {
      if (!EMOTES.includes(b.emoji)) throw new Error('Emote không hợp lệ');
      const now = Date.now();
      if (now - (m.lastEmote || 0) < 1200) throw new Error('Từ từ thôi 😅');
      m.lastEmote = now;
      room.emotes = [...room.emotes.filter((e) => now - e.t < 6000).slice(-15), { pid: m.id, e: b.emoji, t: now }];
      break;
    }
    default: return null;
  }
  return true;
}

async function api(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/meta') return json(res, 200, { ...config.describe(), emotes: EMOTES });
    if (req.method === 'GET' && url.pathname === '/api/poll') return poll(req, res, url);
    if (req.method !== 'POST') return json(res, 405, { error: 'Chỉ nhận POST' });
    const b = await body(req);
    if (url.pathname === '/api/create') {
      if (rooms.size >= MAX_ROOMS) throw new Error('Server đang có quá nhiều phòng, thử lại sau');
      limitIp(req);
      const m = newMember(b.name);
      const code = roomCode();
      rooms.set(code, newRoom(code, m));
      save();
      return json(res, 200, { room: code, token: m.token });
    }
    if (url.pathname === '/api/join') {
      const { room, m } = join(b);
      json(res, 200, { room: room.code, token: m.token });
      return pushAll(room);
    }
    const { room, m } = auth(b);
    const r = command(url.pathname, b, room, m);
    if (r === null) return json(res, 404, { error: 'Không có lệnh này' });
    json(res, 200, { ok: true });
    if (r) pushAll(room);
  } catch (e) {
    json(res, e.status || 400, { error: e.message });
  }
}

function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  const f = path.join(PUB, path.normalize(p === '/' ? '/index.html' : p));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    send(res, 200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' }, data);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (e) { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  serveStatic(req, res, url);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.error(`\n⚠️  Cổng ${PORT} đang bị dùng — có lẽ server đã mở ở cửa sổ khác. Đóng cửa sổ đó, hoặc chạy với PORT khác.\n`); process.exit(1); }
  throw e;
});
process.on('uncaughtException', (e) => console.error('[lỗi chưa bắt]', e));
process.on('unhandledRejection', (e) => console.error('[promise lỗi]', e));
// Tắt server (Ctrl+C) thì ghi nốt trạng thái phòng chưa kịp lưu.
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { writeRooms(); process.exit(0); });

load();
server.listen(PORT, '0.0.0.0', () => {
  try { config.describe(); } catch (e) { console.error('\n⚠️  Cấu hình đang lỗi:', e.message, '\n'); }
  console.log(`\n🤠 BANG! đang chạy!\n  Máy này:   http://localhost:${PORT}`);
  for (const a of LAN) console.log(`  ${a.virtual ? 'Mạng ảo:  ' : 'Cùng WiFi:'} ${a.url}   (${a.name})`);
  console.log('  Bạn bè không vào được? Cho phép Node.js qua Windows Firewall (mạng Private).\n');
});

// Dọn phòng: sảnh không ai online sau 1 giờ, mọi phòng im lặng sau 12 giờ. Chuyển chủ phòng khi chủ rớt mạng.
setInterval(() => {
  const now = Date.now();
  for (const [c, r] of rooms) {
    const humans = r.members.filter((m) => !m.bot);
    const idle = now - r.lastActivity;
    if ((!r.game && idle > 3600e3 && !humans.some(isOnline)) || idle > 12 * 3600e3) { rooms.delete(c); save(); continue; }
    const host = r.members.find((m) => m.id === r.hostId);
    if (host && !isOnline(host) && now - host.lastSeen > HOST_HANDOVER) {
      const next = humans.find((m) => m !== host && !m.left && isOnline(m));
      if (next) { r.hostId = next.id; pushAll(r); }
    }
    schedule(r);
  }
}, 5000);
