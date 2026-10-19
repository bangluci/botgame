'use strict';
const $app = document.getElementById('app');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_VI = { S: '♠ Bích', H: '♥ Cơ', D: '♦ Rô', C: '♣ Chuồn' };
const ROLE_VI = { sheriff: 'Cảnh sát trưởng', deputy: 'Phó cảnh sát', outlaw: 'Ngoài vòng pháp luật', renegade: 'Kẻ phản bội' };
const ROLE_ICON = { sheriff: '⭐', deputy: '🛡️', outlaw: '💀', renegade: '🎭' };
const ROLE_HINT = {
  sheriff: 'Hạ hết Outlaw và Renegade.', deputy: 'Bảo vệ Cảnh sát trưởng.',
  outlaw: 'Hạ Cảnh sát trưởng.', renegade: 'Sống sót cuối cùng (hạ Outlaw, rồi Cảnh sát trưởng).',
};

let sess = null;
try { sess = JSON.parse(localStorage.getItem('bang') || 'null'); } catch (e) {}
let S = null, meta = null;
let ui = { sel: null, multi: null, zone: null, err: '', adv: '', advErr: '', info: null, tab: 'rules' };
let toastTimer = 0, fails = 0, loopId = 0, ver = 0;

const clone = (o) => JSON.parse(JSON.stringify(o));
function toast(m) {
  const t = document.getElementById('toast'); t.textContent = m; t.className = 'on';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}
async function post(path, body = {}) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room: sess && sess.room, token: sess && sess.token, ...body }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Lỗi');
  return j;
}
async function act(action) {
  try { await post('action', { action }); ui.sel = null; ui.multi = null; ui.zone = null; render(); } catch (e) { toast(e.message); }
}

// ---------- kết nối (long-poll) ----------
function connect() {
  const id = ++loopId; ver = 0; fails = 0;
  (async () => {
    while (sess && id === loopId) {
      try {
        const r = await fetch(`/api/poll?room=${sess.room}&token=${sess.token}&v=${ver}`, { cache: 'no-store' });
        const j = await r.json();
        if (id !== loopId) return;
        if (!r.ok) throw new Error(j.error || 'lỗi');
        fails = 0; ver = j.v;
        if (!j.same) { S = j.data; if (!(S.game && S.game.pending && S.game.pending.player === S.lobby.me && S.game.pending.type === 'play')) { ui.sel = null; ui.multi = null; } render(); }
      } catch (e) {
        if (id !== loopId) return;
        if (++fails > 8) { localStorage.removeItem('bang'); sess = null; S = null; ui.err = 'Mất kết nối với phòng.'; render(); return; }
        await new Promise((r) => setTimeout(r, Math.min(1000 * fails, 4000)));
      }
    }
  })();
}
function setSess(s) { sess = s; localStorage.setItem('bang', JSON.stringify(s)); connect(); }

// ---------- trang chủ ----------
function renderHome() {
  const q = new URLSearchParams(location.search).get('room') || '';
  const name = localStorage.getItem('bang-name') || '';
  $app.innerHTML = `<div class="wrap" style="max-width:480px"><div class="panel center">
    <h1>🤠 BANG!</h1><div class="dim">Bản chơi riêng với bạn bè, phi thương mại</div>
    ${ui.err ? `<p style="color:var(--red)">${esc(ui.err)}</p>` : ''}
    <p><input id="name" placeholder="Tên của bạn" maxlength="16" value="${esc(name)}" style="width:100%"></p>
    <p><button data-a="create" style="width:100%">Tạo phòng mới</button></p>
    <p class="dim">hoặc vào phòng có sẵn</p>
    <div class="row"><input id="code" placeholder="Mã phòng" maxlength="4" value="${esc(q)}" style="flex:1;text-transform:uppercase"><button class="sec" data-a="join">Vào phòng</button></div>
  </div></div>`;
}
async function homeAct(kind) {
  const name = document.getElementById('name').value.trim();
  if (!name) return toast('Nhập tên trước đã');
  localStorage.setItem('bang-name', name);
  try {
    const r = await post(kind, { name, room: (document.getElementById('code').value || '').toUpperCase() });
    ui.err = ''; history.replaceState(null, '', location.pathname); setSess({ room: r.room, token: r.token });
  } catch (e) { toast(e.message); }
}

// ---------- sảnh & tuỳ chỉnh ----------
async function saveSettings(s) {
  try { await post('settings', { settings: s }); ui.advErr = ''; } catch (e) { toast(e.message); ui.advErr = e.message; render(); }
}
function mutate(fn) { const s = clone(S.lobby.settings); fn(s); saveSettings(s); }
const EMPTY = () => ({ rules: {}, cardCopies: {}, charactersOff: [], eventsOff: [], override: {} });

function renderSettings(host) {
  const s = S.lobby.settings, m = meta, dis = host ? '' : 'disabled';
  const tabs = [['rules', '⚙️ Luật'], ['cards', '🂠 Bộ bài'], ['chars', '🤠 Nhân vật'], ['events', '🎴 Sự kiện'], ['adv', '🧪 Nâng cao']];
  const rv = (d) => (s.rules[d.key] !== undefined ? s.rules[d.key] : d.value);
  let body = '';
  if (ui.tab === 'rules') {
    const groups = [...new Set(m.rules.map((r) => r.group))];
    body = groups.map((g) => `<div class="grp">${esc(g)}</div><div class="rules">` + m.rules.filter((r) => r.group === g).map((d) => {
      const v = rv(d); let inp;
      if (d.type === 'boolean') inp = `<input type="checkbox" data-c="rule" data-k="${d.key}" ${v ? 'checked' : ''} ${dis}>`;
      else if (d.type === 'number') inp = `<input type="number" data-c="rule" data-k="${d.key}" value="${v}" min="${d.min}" max="${d.max}" ${dis}>`;
      else inp = `<select data-c="rule" data-k="${d.key}" ${dis}>${d.options.map((o) => `<option value="${o[0]}" ${o[0] === v ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
      return `<label class="rule"><span>${esc(d.label)}${s.rules[d.key] !== undefined && s.rules[d.key] !== d.value ? ' <span class="badge sheriff">đã đổi</span>' : ''}</span>${inp}</label>`;
    }).join('') + '</div>').join('');
  } else if (ui.tab === 'cards') {
    const total = m.cards.reduce((t, c) => t + c.count * (s.cardCopies[c.key] !== undefined ? s.cardCopies[c.key] : 1), 0);
    body = `<p class="dim">Mỗi lá có số "bản sao" của cả bộ in sẵn (0 = bỏ lá đó, 2 = nhân đôi). Tổng bộ bài hiện tại: <b>${total}</b> lá.</p><div class="cardrows">` + m.cards.map((c) => {
      const n = s.cardCopies[c.key] !== undefined ? s.cardCopies[c.key] : 1;
      return `<div class="cardrow" title="${esc(c.desc)}"><span>${c.icon}</span><span class="nm">${esc(c.name)} <span class="dim">×${c.count}</span></span>
        <button class="sec" data-a="copies" data-k="${c.key}" data-d="-1" ${dis}>−</button><span class="n">${n}</span><button class="sec" data-a="copies" data-k="${c.key}" data-d="1" ${dis}>+</button></div>`;
    }).join('') + '</div>';
  } else if (ui.tab === 'chars') {
    body = `<p class="dim">Bấm để bật/tắt nhân vật trong ván này (mờ gạch = tắt).</p><div class="chips">` + m.characters.map((c) =>
      `<span class="chip ${s.charactersOff.includes(c.key) ? 'off' : ''}" data-a="tchar" data-k="${c.key}" title="${esc(c.desc)}">${c.icon} ${esc(c.name)} · ${c.life}❤</span>`).join('') + '</div>';
  } else if (ui.tab === 'events') {
    body = `<p class="dim">${rv(m.rules.find((r) => r.key === 'eventsOn')) ? 'Sự kiện <b>đang bật</b>.' : 'Sự kiện đang <b>tắt</b> — bật ở tab "Luật" → nhóm Sự kiện.'} Mỗi vòng (đầu lượt Cảnh sát trưởng) lật 1 lá. Chọn lá sẽ nằm trong bộ sự kiện:</p><div class="chips">` + m.events.map((e) =>
      `<span class="chip ${s.eventsOff.includes(e.key) ? 'off' : ''}" data-a="tevent" data-k="${e.key}" title="${esc(e.desc)}">${e.icon} ${esc(e.name)}</span>`).join('') + '</div>' +
      '<div class="dim" style="margin-top:8px">' + m.events.map((e) => `<div>${e.icon} <b>${esc(e.name)}</b>: ${esc(e.desc)}</div>`).join('') + '</div>';
  } else {
    if (!ui.adv) ui.adv = Object.keys(s.override).length ? JSON.stringify(s.override, null, 2) : '';
    body = `<p class="dim">Tự thêm/sửa <b>lá bài, nhân vật, sự kiện, vai trò</b> bằng JSON — chỉ áp dụng cho phòng này. Muốn dùng lâu dài, đặt cùng nội dung vào thư mục <code>custom/</code> (xem README).</p>
      <textarea id="adv" ${dis} placeholder='{ "cards": { ... }, "characters": { ... } }'>${esc(ui.adv)}</textarea>
      ${ui.advErr ? `<p style="color:var(--red)">${esc(ui.advErr)}</p>` : ''}
      ${host ? '<div class="row"><button data-a="applyadv">Áp dụng</button><button class="sec" data-a="clearadv">Xoá ghi đè</button></div>' : ''}
      <details><summary>Ví dụ: thêm lá Whiskey, nhân vật mới, sự kiện mới</summary><pre>${esc(JSON.stringify({
        cards: { whiskey: { name: 'Whiskey', icon: '🥃', kind: 'action', target: 'self', effect: [{ type: 'heal', amount: 2 }], desc: 'Hồi 2 máu', printings: ['H:2-4'] } },
        characters: { toi: { name: 'Nhân vật của tôi', icon: '😎', life: 5, abilities: ['sid', 'willy'], desc: 'Tuỳ ý mô tả' } },
        events: { mua: { name: 'Mưa bài', icon: '🌧️', desc: 'Đầu lượt rút thêm 1', mods: { turnStartDraw: 1 } } },
        roles: { 3: ['sheriff', 'outlaw', 'outlaw'] },
      }, null, 2))}</pre></details>
      <details><summary>Hiệu ứng / kỹ năng / mod có sẵn</summary>
        <p><b>Hiệu ứng lá bài (effect.type):</b> ${meta.effects.join(', ')}</p>
        <p><b>Kỹ năng nhân vật (abilities):</b> ${meta.abilities.join(', ')}</p>
        <p><b>Mod sự kiện (mods):</b> ${meta.mods.join(', ')}</p></details>`;
  }
  return `<div class="panel"><h3>🛠️ Tuỳ chỉnh ván chơi ${host ? '' : '<span class="dim">(chỉ chủ phòng sửa được)</span>'}</h3>
    ${host ? `<div class="row" style="margin-bottom:8px">${m.presets.map((p) => `<button class="preset" data-a="preset" data-k="${esc(p.id)}" title="${esc(p.desc)}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="row" style="margin-bottom:6px">${tabs.map((t) => `<button class="${ui.tab === t[0] ? '' : 'sec'}" data-a="tab" data-k="${t[0]}">${t[1]}</button>`).join('')}</div>${body}</div>`;
}

function renderLobby() {
  const L = S.lobby, host = L.hostId === L.me;
  const link = `${location.origin}/?room=${L.code}`;
  $app.innerHTML = `<div class="wrap">
    <div class="panel center"><h1>🤠 BANG!</h1><div class="dim">Mã phòng</div><div class="code">${L.code}</div>
      <div class="row" style="justify-content:center"><input readonly value="${esc(link)}" style="width:min(380px,100%)" onclick="this.select()"><button class="sec" data-a="copylink">Chép link</button></div></div>
    <div class="panel"><h3>Người chơi (${L.members.length}/${meta.maxPlayers})</h3><div class="members">${L.members.map((m) => `<div class="member"><span class="dot ${m.online ? 'on' : ''}"></span>${esc(m.name)}${m.id === L.hostId ? ' 👑' : ''}${m.id === L.me ? ' <span class="dim">(bạn)</span>' : ''}</div>`).join('')}</div>
      <p class="dim">Cần ${meta.minPlayers}–${meta.maxPlayers} người. Vai trò chia theo số người (sửa trong roles.json).</p>
      <div class="row">${host ? `<button data-a="start" ${L.members.length < meta.minPlayers ? 'disabled' : ''}>▶ Bắt đầu ván</button>` : '<span class="dim">Chờ chủ phòng bắt đầu…</span>'}<button class="sec" data-a="leave">Rời phòng</button></div></div>
    ${renderSettings(host)}</div>`;
}

// ---------- bàn chơi ----------
const G = () => S.game;
const DEF = (c) => G().defs.cards[c.key];
const meP = () => G().players.find((p) => p.id === S.lobby.me);
const isRed = (c) => c.suit === 'H' || c.suit === 'D';

function cardEl(c, o = {}) {
  const d = DEF(c);
  return `<div class="card ${isRed(c) ? 'red' : ''} ${o.cls || ''}" ${o.a ? `data-a="${o.a}"` : ''} data-id="${c.id}" title="${esc(d.name + ' — ' + d.desc)}">
    <div class="cr">${c.rank}${SYM[c.suit]}</div><div class="ci">${d.icon}</div><div class="cn">${esc(d.name)}</div></div>`;
}
const mini = (c) => `<span class="mini ${isRed(c) ? 'red' : ''}" title="${esc(DEF(c).desc)}">${DEF(c).icon} ${esc(DEF(c).name)} ${SYM[c.suit]}${c.rank}</span>`;
const hearts = (p) => `<span class="hearts">${'❤️'.repeat(Math.max(0, p.life))}${'🖤'.repeat(Math.max(0, p.maxLife - Math.max(0, p.life)))}</span>`;

// Lá nào trong tay đang bấm được?
function usable(c) {
  const g = G(), pe = g.pending;
  if (!pe || pe.player !== S.lobby.me) return false;
  const d = DEF(c);
  if (ui.multi) return true;
  switch (pe.type) {
    case 'play': return d.playable !== 'never' || (g.janet && d.react === 'missed');
    case 'respond': return d.react === pe.kind || (g.janet && (d.react === 'bang' || d.react === 'missed') && (pe.kind === 'bang' || pe.kind === 'missed'));
    case 'dying': return d.isBeer;
    case 'discard': return true;
    default: return false;
  }
}
function bangDef() { return Object.values(G().defs.cards).find((d) => d.bang); }
function onCard(id) {
  const g = G(), pe = g.pending;
  if (!pe || pe.player !== S.lobby.me) return;
  const c = g.me.hand.find((x) => x.id === id); if (!c) return;
  const d = DEF(c);
  if (ui.multi) {
    const i = ui.multi.ids.indexOf(id);
    if (i >= 0) ui.multi.ids.splice(i, 1); else ui.multi.ids.push(id);
    if (ui.multi.ids.length === 2) return act({ type: ui.multi.kind, cards: ui.multi.ids });
    return render();
  }
  if (pe.type === 'play') {
    let dd = d, asBang = false;
    if (d.react === 'missed' && g.janet) { dd = bangDef(); asBang = true; }
    if (dd.playable === 'never') return toast('Lá này chỉ dùng để đáp lại');
    if (dd.target === 'other') { ui.sel = ui.sel && ui.sel.id === id ? null : { id, asBang }; return render(); }
    return act({ type: 'play', card: id });
  }
  if (pe.type === 'respond') return act({ type: 'respond', card: id });
  if (pe.type === 'dying') return d.isBeer ? act({ type: 'beer', card: id }) : toast('Cần Beer để cứu');
  if (pe.type === 'discard') return act({ type: 'discard', card: id });
}
function inRange(p, d) {
  const range = d.range === undefined ? (d.bang ? 'weapon' : 'any') : d.range;
  if (range === 'weapon') return p.dist <= G().me.range;
  if (typeof range === 'number') return p.dist <= range;
  return true;
}
function onPlayer(id) {
  if (!ui.sel) return;
  const g = G(); const c = g.me.hand.find((x) => x.id === ui.sel.id); if (!c) return;
  const d = ui.sel.asBang ? bangDef() : DEF(c);
  const p = g.players.find((x) => x.id === id);
  if (!p.alive || p.id === S.lobby.me) return;
  if (d.steal) { ui.zone = { card: ui.sel.id, target: id }; return render(); }
  act({ type: 'play', card: ui.sel.id, target: id, as: ui.sel.asBang ? 'bang' : undefined });
}

function renderPrompt() {
  const g = G(), pe = g.pending, mine = pe && pe.player === S.lobby.me;
  if (g.winner) return '';
  if (!pe) return '';
  if (!mine) {
    const who = g.players.find((p) => p.id === pe.player);
    return `<div class="banner wait"><div class="t">⏳ Đang chờ ${esc(who ? who.name : '')}…</div><div class="dim">${esc(pe.text)}</div></div>`;
  }
  let btns = '', extra = '';
  switch (pe.type) {
    case 'play': {
      const sel = ui.sel;
      btns = `<button data-a="end">Kết thúc lượt</button>`;
      if (g.sid) btns += `<button class="sec" data-a="multi" data-k="ability">💉 Bỏ 2 lá → +1 máu</button>`;
      const hint = ui.multi ? `Chọn 2 lá để bỏ (${ui.multi.ids.length}/2)` : sel ? 'Chọn mục tiêu (người chơi sáng viền đỏ)' : 'Bấm 1 lá bài để chơi';
      if (g.me.cuff) btns += `<span class="badge sheriff">🔗 Chỉ chất ${SUIT_VI[g.me.cuff]}</span>`;
      extra = `<div class="dim">${hint} · BANG! đã bắn: ${g.me.bangs}${g.me.bangLimit ? '/' + g.me.bangLimit : ''}</div>`;
      break;
    }
    case 'respond': btns = `<button class="danger" data-a="pass">Chịu đòn</button>`; break;
    case 'dying':
      btns = `<button class="danger" data-a="passdie">Chịu chết</button>`;
      if (g.sid) btns += `<button class="sec" data-a="multi" data-k="sid">💉 Bỏ 2 lá → +1 máu</button>`;
      extra = `<div class="dim">Bấm 1 lá Beer trong tay để uống.</div>`;
      break;
    case 'discard': extra = `<div class="dim">Bấm lá muốn bỏ (còn ${pe.need}).</div>`; break;
    case 'choice': btns = pe.options.map((o) => `<button class="sec" data-a="choice" data-k="${esc(o.id)}">${esc(o.label)}</button>`).join(''); break;
    case 'suit': btns = ['S', 'H', 'D', 'C'].map((s) => `<button class="sec" data-a="suit" data-k="${s}">${SUIT_VI[s]}</button>`).join(''); break;
    default: break;
  }
  return `<div class="banner"><div class="t">👉 ${esc(pe.text)}</div>${extra}<div class="row" style="margin-top:6px">${btns}</div></div>`;
}

function renderModal() {
  const g = G(), pe = g.pending, mine = pe && pe.player === S.lobby.me;
  if (g.winner) {
    const w = g.winner, hostMe = S.lobby.hostId === S.lobby.me;
    return `<div class="modal"><div class="box center"><h2>🏆 ${esc(w.text)}</h2>
      ${g.players.map((p) => `<div class="opt" style="cursor:default;${w.players.includes(p.id) ? 'border-color:var(--gold)' : ''}"><span class="big">${g.defs.chars[p.char] ? g.defs.chars[p.char].icon : ''}</span><span style="flex:1;text-align:left"><b>${esc(p.name)}</b> <span class="dim">${esc(g.defs.chars[p.char] ? g.defs.chars[p.char].name : '')}</span></span><span class="badge ${p.role}">${ROLE_ICON[p.role]} ${ROLE_VI[p.role]}</span>${w.players.includes(p.id) ? '🏆' : ''}</div>`).join('')}
      <p>${hostMe ? '<button data-a="tolobby">Về sảnh (đổi luật / chơi lại)</button>' : '<span class="dim">Chờ chủ phòng đưa về sảnh…</span>'}</p></div></div>`;
  }
  if (ui.zone) {
    const t = g.players.find((p) => p.id === ui.zone.target);
    return `<div class="modal"><div class="box"><h3>Lấy/bắt bỏ lá của ${esc(t.name)}</h3>
      ${t.hand ? `<div class="opt" data-a="zone" data-k="hand"><span class="big">🂠</span><span>Một lá trên tay (ngẫu nhiên) — ${t.hand} lá</span></div>` : ''}
      ${t.table.map((c) => `<div class="opt" data-a="zone" data-k="${c.id}"><span class="big">${DEF(c).icon}</span><span>${esc(DEF(c).name)} ${SYM[c.suit]}${c.rank} (đang dùng)</span></div>`).join('')}
      <p><button class="sec" data-a="zonex">Huỷ</button></p></div></div>`;
  }
  if (!mine) {
    if (pe && pe.type === 'pick' && pe.cards) return `<div class="modal" style="pointer-events:none"><div class="box"><h3>${esc(pe.text)}</h3><div class="hand">${pe.cards.map((c) => cardEl(c)).join('')}</div></div></div>`;
    return '';
  }
  if (pe.type === 'pick') return `<div class="modal"><div class="box"><h3>${esc(pe.text)}</h3><div class="hand">${pe.cards.map((c) => cardEl(c, { a: 'pick', cls: 'ok' })).join('')}</div></div></div>`;
  if (pe.type === 'kit') return `<div class="modal"><div class="box"><h3>${esc(pe.text)}</h3><div class="hand">${pe.cards.map((c) => cardEl(c, { a: 'back', cls: 'ok' })).join('')}</div></div></div>`;
  if (pe.type === 'char') return `<div class="modal"><div class="box"><h3>${esc(pe.text)}</h3>${pe.options.map((k) => { const c = g.defs.chars[k]; return `<div class="opt" data-a="char" data-k="${k}"><span class="big">${c.icon}</span><span><b>${esc(c.name)}</b> · ${c.life}❤<br><span class="dim">${esc(c.desc)}</span></span></div>`; }).join('')}</div></div>`;
  return '';
}

function renderGame() {
  const g = G(), L = S.lobby, me = meP(), pe = g.pending;
  const mineTurn = g.turn === L.me;
  const selDef = ui.sel ? (ui.sel.asBang ? bangDef() : DEF(g.me.hand.find((x) => x.id === ui.sel.id) || { key: '' })) : null;
  const opps = g.players.filter((p) => p.id !== L.me);
  const oppEl = (p) => {
    const ch = g.defs.chars[p.char];
    const tgt = selDef && p.alive && selDef.target === 'other';
    const far = tgt && !inRange(p, selDef);
    return `<div class="pl ${g.turn === p.id ? 'turn' : ''} ${p.alive ? '' : 'dead'} ${tgt && !far ? 'tgt' : ''} ${far ? 'far' : ''}" ${tgt ? `data-a="player" data-id="${p.id}"` : ''}>
      <div class="nm"><span>${ch ? ch.icon : ''} ${esc(p.name)}</span>${p.role ? `<span class="badge ${p.role}">${ROLE_ICON[p.role]}</span>` : '<span class="badge">?</span>'}</div>
      <div class="ch" title="${esc(ch ? ch.desc : '')}">${ch ? esc(ch.name) : '…'}${p.dist != null ? ` · 📏${p.dist}` : ''}</div>
      <div>${p.alive ? hearts(p) : '☠️'} <span class="dim">🂠${p.hand}</span></div>
      <div>${p.table.map(mini).join('')}</div></div>`;
  };
  const myCh = g.defs.chars[me.char];
  const hand = g.me.hand.map((c) => {
    const ok = usable(c);
    const sel = ui.sel && ui.sel.id === c.id || (ui.multi && ui.multi.ids.includes(c.id));
    return cardEl(c, { a: ok ? 'card' : '', cls: `${ok ? 'ok' : (pe && pe.player === L.me ? 'no' : '')} ${sel ? 'sel' : ''}` });
  }).join('');
  $app.innerHTML = `<div class="game"><div class="main">
    <div class="topbar"><b>🤠 BANG!</b><span class="dim">Phòng ${L.code}</span>
      ${g.event ? `<div class="event">${g.event.icon} <b>Sự kiện: ${esc(g.event.name)}</b> — ${esc(g.event.desc)}</div>` : g.eventsOn ? '<div class="event dim">Sự kiện sẽ lật ở đầu lượt Cảnh sát trưởng</div>' : ''}</div>
    <div class="opps">${opps.map(oppEl).join('')}</div>
    <div class="mid"><div class="pile"><div class="back">${g.deck}</div>chồng rút</div>
      <div class="pile">${g.discardTop ? cardEl(g.discardTop, { cls: 'small' }) : '<div class="back" style="opacity:.3"></div>'}chồng bỏ</div>
      ${g.last ? `<div class="pile" style="max-width:150px">vừa chơi:<br><b>${esc((g.players.find((p) => p.id === g.last.pid) || {}).name)}</b> ${DEF(g.last.card).icon} ${esc(DEF(g.last.card).name)}</div>` : ''}</div>
    ${renderPrompt()}
    <div class="me ${mineTurn ? 'turn' : ''}">
      <div class="row" style="justify-content:space-between"><div><b>${myCh ? myCh.icon : ''} ${esc(me.name)}</b> · ${myCh ? esc(myCh.name) : ''} ${me.alive ? hearts(me) : '☠️ Đã bị loại'}</div>
        <div><span class="badge ${g.me.role}" title="${esc(ROLE_HINT[g.me.role])}">${ROLE_ICON[g.me.role]} ${ROLE_VI[g.me.role]}</span> <span class="dim">tầm súng ${g.me.range}</span></div></div>
      <div class="dim">${myCh ? esc(myCh.desc) : ''} · <i>${esc(ROLE_HINT[g.me.role])}</i></div>
      <div>${me.table.map(mini).join('')}</div>
      <div class="hand">${hand || '<span class="dim">Hết bài</span>'}</div></div>
  </div>
  <div class="side"><b>📜 Nhật ký</b><div class="log" id="log">${g.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div></div></div>${renderModal()}`;
  const lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
}

// ---------- vẽ & sự kiện ----------
let lastKey = '';
function render() {
  const y = window.scrollY, ae = document.activeElement;
  if (!sess || !S) renderHome();
  else if (!meta) { $app.innerHTML = '<div class="wrap center">Đang tải…</div>'; loadMeta(); }
  else if (S.lobby.started && S.game) renderGame();
  else renderLobby();
  const key = S && S.game && S.game.pending ? S.game.pending.player + S.game.pending.type : '';
  if (key !== lastKey) { lastKey = key; if (S && S.game && S.game.pending && S.game.pending.player === S.lobby.me && navigator.vibrate) navigator.vibrate(60); }
  window.scrollTo(0, y);
  const adv = document.getElementById('adv'); if (adv) adv.addEventListener('input', () => { ui.adv = adv.value; });
}
async function loadMeta() { try { meta = await (await fetch('/api/meta')).json(); if (meta.error) throw new Error(meta.error); render(); } catch (e) { $app.innerHTML = `<div class="wrap"><div class="panel">Lỗi cấu hình: ${esc(e.message)}</div></div>`; } }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, k = el.dataset.k, id = el.dataset.id;
  switch (a) {
    case 'create': case 'join': return homeAct(a);
    case 'copylink': navigator.clipboard && navigator.clipboard.writeText(`${location.origin}/?room=${S.lobby.code}`); return toast('Đã chép link');
    case 'start': return post('start').catch((x) => toast(x.message));
    case 'leave': return post('leave').then(() => { localStorage.removeItem('bang'); sess = null; S = null; loopId++; render(); }).catch((x) => toast(x.message));
    case 'tolobby': return post('lobby').catch((x) => toast(x.message));
    case 'tab': ui.tab = k; return render();
    case 'preset': { const p = meta.presets.find((x) => x.id === k); return saveSettings({ ...EMPTY(), ...clone(p.settings), override: S.lobby.settings.override }); }
    case 'copies': return mutate((s) => { const cur = s.cardCopies[k] !== undefined ? s.cardCopies[k] : 1; s.cardCopies[k] = Math.max(0, Math.min(6, cur + +el.dataset.d)); });
    case 'tchar': return mutate((s) => { const i = s.charactersOff.indexOf(k); if (i >= 0) s.charactersOff.splice(i, 1); else s.charactersOff.push(k); });
    case 'tevent': return mutate((s) => { const i = s.eventsOff.indexOf(k); if (i >= 0) s.eventsOff.splice(i, 1); else s.eventsOff.push(k); });
    case 'applyadv': { let o = {}; try { o = ui.adv.trim() ? JSON.parse(ui.adv) : {}; } catch (x) { ui.advErr = 'JSON sai: ' + x.message; return render(); } return mutate((s) => { s.override = o; }); }
    case 'clearadv': ui.adv = ''; return mutate((s) => { s.override = {}; });
    case 'card': return onCard(+id);
    case 'player': return onPlayer(id);
    case 'end': return act({ type: 'end' });
    case 'pass': return act({ type: 'pass' });
    case 'passdie': return act({ type: 'pass' });
    case 'multi': ui.sel = null; ui.multi = ui.multi ? null : { kind: k === 'sid' ? 'sid' : 'ability', ids: [] }; return render();
    case 'choice': return act({ type: 'choice', id: k });
    case 'suit': return act({ type: 'suit', suit: k });
    case 'pick': return act({ type: 'pick', card: +id });
    case 'back': return act({ type: 'back', card: +id });
    case 'char': return act({ type: 'char', key: k });
    case 'zone': return act(k === 'hand' ? { type: 'play', card: ui.zone.card, target: ui.zone.target, zone: 'hand' } : { type: 'play', card: ui.zone.card, target: ui.zone.target, zone: 'table', cardId: +k });
    case 'zonex': ui.zone = null; return render();
    default: break;
  }
});
document.addEventListener('change', (e) => {
  const el = e.target; if (el.dataset.c !== 'rule') return;
  const d = meta.rules.find((r) => r.key === el.dataset.k);
  const v = d.type === 'boolean' ? el.checked : d.type === 'number' ? +el.value : el.value;
  mutate((s) => { s.rules[d.key] = v; });
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'code') homeAct('join'); });

// zone: action 'play' với as=undefined bị JSON bỏ qua — đúng ý.
if (sess) connect(); else render();
