// Trang chủ + sảnh chờ (người chơi, bot, tuỳ chỉnh luật).
import { st, esc, toast, post, rerender, setSess, store, hooks } from './store.js';
import { SYM, initials } from './cards.js';

const HERO_CARDS = [
  { icon: '🔫', name: 'BANG!', rank: 'A', suit: 'S', kind: 'action' },
  { icon: '💨', name: 'Missed!', rank: '7', suit: 'C', kind: 'action' },
  { icon: '🍺', name: 'Beer', rank: '9', suit: 'H', kind: 'action' },
  { icon: '🛢️', name: 'Barrel', rank: 'K', suit: 'S', kind: 'equip' },
];
const heroCard = (c, i) => `<div class="card hero-card ${c.kind === 'equip' ? 'k-equip' : 'k-action'} ${c.suit === 'H' || c.suit === 'D' ? 'red' : ''}" style="--i:${i}" aria-hidden="true">
  <span class="c-corner">${c.rank}<i>${SYM[c.suit]}</i></span><span class="c-art">${c.icon}</span><span class="c-name">${c.name}</span><span class="c-corner c-br">${c.rank}<i>${SYM[c.suit]}</i></span></div>`;

// ---------- trang chủ ----------
export function homeHtml() {
  const q = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  const name = store.get('bang-name') || '';
  const other = q && st.sess && st.sess.room !== q ? st.sess.room : '';
  return `<main class="home">
    <section class="home-hero">
      <p class="eyebrow">Viễn Tây · 2–10 tay súng · chơi trên trình duyệt</p>
      <h1 class="wordmark" aria-label="BANG!"><span>BANG</span><b>!</b></h1>
      <p class="lede">Cảnh sát trưởng, phó cảnh sát, đám ngoài vòng pháp luật và một kẻ phản bội. Không ai biết ai — trừ ngôi sao trên ngực Sheriff.</p>
      <form class="home-form panel" data-form="home" autocomplete="off">
        ${st.ui.err ? `<p class="form-err">${esc(st.ui.err)}</p>` : ''}
        ${other ? `<p class="form-note">Bạn đang ở phòng <b>${esc(other)}</b>. Nhập tên để vào phòng <b>${esc(q)}</b>, hoặc <button type="button" class="link" data-a="resume">quay lại ${esc(other)}</button>.</p>` : ''}
        <label class="field"><span>Tên của bạn</span><input id="name" maxlength="16" value="${esc(name)}" placeholder="vd. Jesse" required></label>
        <div class="home-actions">
          <button class="btn btn-primary" type="button" data-a="create"><span>Tạo phòng mới</span><i aria-hidden="true">→</i></button>
          <button class="btn btn-ghost" type="button" data-a="quick" title="Tạo phòng, thêm 3 bot và chia bài luôn">🤖 Chơi nhanh với 3 bot</button>
        </div>
        <div class="join-row"><label class="field grow"><span>Mã phòng</span><input id="code" maxlength="4" value="${esc(q)}" placeholder="ABCD" class="code-input"></label>
          <button class="btn btn-ghost" type="button" data-a="join">Vào phòng</button></div>
      </form>
    </section>
    <section class="home-art" aria-hidden="true">
      <div class="lamp"></div>
      <div class="fan" data-tilt>${HERO_CARDS.map(heroCard).join('')}</div>
      <div class="star">★</div>
    </section>
  </main>`;
}

async function homeAct(kind) {
  const name = document.getElementById('name').value.trim();
  if (!name) { document.getElementById('name').focus(); return toast('Nhập tên trước đã', 'err'); }
  store.set('bang-name', name);
  try {
    const code = (document.getElementById('code').value || '').toUpperCase().trim();
    if (kind === 'join' && !code) return toast('Nhập mã phòng 4 chữ', 'err');
    const r = await post(kind === 'quick' ? 'create' : kind, { name, room: code });
    st.ui.err = '';
    history.replaceState(null, '', location.pathname);
    setSess({ room: r.room, token: r.token });
    if (kind === 'quick') {
      for (let i = 0; i < 3; i++) await post('addbot');
      await post('start');
    }
    hooks.connect();
  } catch (e) { toast(e.message, 'err'); }
}

// ---------- sảnh ----------
const settings = () => st.ui.draft || st.S.lobby.settings;
let draftTimer = 0;
// Sửa trên bản nháp, hiện ngay, gom các lần bấm liên tiếp rồi mới gửi (không mất thay đổi khi bấm nhanh).
function mutate(fn) {
  const s = JSON.parse(JSON.stringify(settings()));
  fn(s); st.ui.draft = s; rerender();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveSettings(st.ui.draft), 350);
}
async function saveSettings(s) {
  try { await post('settings', { settings: s }); st.ui.advErr = ''; } catch (e) { toast(e.message, 'err'); st.ui.advErr = e.message; }
  if (st.ui.draft === s) st.ui.draft = null;
  rerender();
}
const EMPTY = () => ({ rules: {}, cardCopies: {}, charactersOff: [], eventsOff: [], override: {} });

export function inviteUrl() {
  const L = st.S.lobby;
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const base = local && L.lan && L.lan.length ? L.lan[0] : location.origin;
  return `${base}/?room=${L.code}`;
}

function ticketHtml() {
  const L = st.S.lobby, link = inviteUrl();
  return `<div class="ticket">
    <div class="ticket-top"><span class="eyebrow">Mã phòng</span><button class="btn btn-ghost btn-sm" data-a="leave">Rời phòng</button></div>
    <div class="ticket-code">${esc(L.code)}</div>
    <div class="ticket-link"><input id="invite" readonly value="${esc(link)}" aria-label="Link mời"><button class="btn btn-sm" data-a="copylink">Chép link</button></div>
    <p class="hint">${/localhost|127\./.test(location.hostname) && L.lan && L.lan.length ? 'Link dùng IP mạng LAN — bạn bè cùng WiFi mở được.' : 'Gửi link hoặc đọc mã 4 chữ cho bạn bè.'}</p>
  </div>`;
}

function playersHtml() {
  const L = st.S.lobby, host = L.hostId === L.me, max = st.meta.maxPlayers, min = st.meta.minPlayers;
  const n = L.members.length;
  return `<div class="panel players">
    <div class="panel-head"><h2>Tay súng <small>${n}/${max}</small></h2>${host && n < max ? '<button class="btn btn-ghost btn-sm" data-a="addbot">＋ Thêm bot</button>' : ''}</div>
    <ul class="member-list">${L.members.map((m, i) => `<li class="member ${m.online ? 'on' : ''}" style="--i:${i}">
      <span class="avatar ${m.bot ? 'bot' : ''}">${m.bot ? '🤖' : initials(m.name)}</span>
      <span class="m-name">${esc(m.name)}${m.id === L.hostId ? ' <span class="crown" title="Chủ phòng">👑</span>' : ''}${m.id === L.me ? ' <span class="you">bạn</span>' : ''}</span>
      <span class="m-state">${m.bot ? 'máy' : m.online ? 'online' : 'offline'}</span>
      ${host && m.id !== L.me ? `<button class="icon-btn" data-a="kick" data-id="${esc(m.id)}" aria-label="Mời ${esc(m.name)} ra">✕</button>` : ''}
    </li>`).join('')}</ul>
    ${host ? `<button class="btn btn-primary btn-wide" data-a="start" ${n < min ? 'disabled' : ''}><span>${n < min ? `Cần ít nhất ${min} người` : 'Chia bài — bắt đầu ván'}</span><i aria-hidden="true">→</i></button>`
      : '<p class="hint center">Chờ chủ phòng chia bài…</p>'}
    ${host && n < min ? '<p class="hint center">Thiếu người? Bấm “Thêm bot”.</p>' : ''}
  </div>`;
}

function rulesTab(s, dis) {
  const m = st.meta;
  const rv = (d) => (s.rules[d.key] !== undefined ? s.rules[d.key] : d.value);
  const groups = [...new Set(m.rules.map((r) => r.group))];
  return groups.map((g) => `<h3 class="grp">${esc(g)}</h3><div class="rules">${m.rules.filter((r) => r.group === g).map((d) => {
    const v = rv(d), changed = s.rules[d.key] !== undefined && s.rules[d.key] !== d.value;
    let inp;
    if (d.type === 'boolean') inp = `<span class="switch"><input type="checkbox" data-c="rule" data-k="${d.key}" ${v ? 'checked' : ''} ${dis} aria-label="${esc(d.label)}"><i></i></span>`;
    else if (d.type === 'number') inp = `<span class="stepper"><button type="button" class="icon-btn" data-a="step" data-k="${d.key}" data-d="-1" ${dis || (v <= d.min ? 'disabled' : '')} aria-label="Giảm">−</button><output>${v}</output><button type="button" class="icon-btn" data-a="step" data-k="${d.key}" data-d="1" ${dis || (v >= d.max ? 'disabled' : '')} aria-label="Tăng">+</button></span>`;
    else inp = `<select data-c="rule" data-k="${d.key}" ${dis}>${d.options.map((o) => `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    return `<label class="rule ${changed ? 'changed' : ''}"><span>${esc(d.label)}</span>${inp}</label>`;
  }).join('')}</div>`).join('');
}
function cardsTab(s, dis) {
  const total = st.meta.cards.reduce((t, c) => t + c.count * (s.cardCopies[c.key] !== undefined ? s.cardCopies[c.key] : 1), 0);
  return `<p class="hint">Số bản sao của từng loại lá (0 = bỏ khỏi bộ, 2 = nhân đôi). Tổng bộ bài: <b>${total}</b> lá.</p><div class="cardrows">${st.meta.cards.map((c) => {
    const n = s.cardCopies[c.key] !== undefined ? s.cardCopies[c.key] : 1;
    return `<div class="cardrow ${n ? '' : 'off'}"><span class="cr-icon ${c.kind === 'equip' ? 'k-equip' : ''}">${esc(c.icon)}</span><span class="cr-name"><b>${esc(c.name)}</b><small>×${c.count} · ${esc(c.desc)}</small></span>
      <span class="stepper"><button class="icon-btn" data-a="copies" data-k="${esc(c.key)}" data-d="-1" ${dis || (n <= 0 ? 'disabled' : '')} aria-label="Bớt">−</button><output>${n}</output><button class="icon-btn" data-a="copies" data-k="${esc(c.key)}" data-d="1" ${dis || (n >= 6 ? 'disabled' : '')} aria-label="Thêm">+</button></span></div>`;
  }).join('')}</div>`;
}
const toggles = (list, off, a, dis, sub) => `<div class="chips">${list.map((x) => `<button type="button" class="chip ${off.includes(x.key) ? 'off' : ''}" data-a="${a}" data-k="${esc(x.key)}" ${dis} aria-pressed="${!off.includes(x.key)}"><span aria-hidden="true">${esc(x.icon)}</span><b>${esc(x.name)}</b>${sub(x)}</button>`).join('')}</div>`;

function settingsHtml(host) {
  const s = settings(), dis = host ? '' : 'disabled', m = st.meta, tab = st.ui.tab;
  const tabs = [['rules', '⚙️ Luật'], ['cards', '🂠 Bộ bài'], ['chars', '🤠 Nhân vật'], ['events', '🎴 Sự kiện'], ['adv', '🧪 Nâng cao']];
  let body;
  if (tab === 'rules') body = rulesTab(s, dis);
  else if (tab === 'cards') body = cardsTab(s, dis);
  else if (tab === 'chars') body = `<p class="hint">Bấm để bật/tắt nhân vật trong ván này.</p>${toggles(m.characters, s.charactersOff, 'tchar', dis, (c) => `<small>${c.life}❤ · ${esc(c.desc)}</small>`)}`;
  else if (tab === 'events') {
    const on = s.rules.eventsOn !== undefined ? s.rules.eventsOn : m.rules.find((r) => r.key === 'eventsOn').value;
    body = `<p class="hint">${on ? 'Sự kiện <b>đang bật</b>' : 'Sự kiện đang <b>tắt</b> — bật ở tab “Luật”'}. Từ vòng 2, đầu lượt Cảnh sát trưởng lật 1 lá; High Noon nằm cuối chồng.</p>${toggles(m.events, s.eventsOff, 'tevent', dis, (e) => `<small>${esc(e.desc)}</small>`)}`;
  } else {
    if (!st.ui.adv) st.ui.adv = Object.keys(s.override || {}).length ? JSON.stringify(s.override, null, 2) : '';
    body = `<p class="hint">Thêm/sửa <b>lá bài, nhân vật, sự kiện, vai trò</b> bằng JSON — chỉ cho phòng này. Muốn dùng lâu dài thì đặt vào thư mục <code>custom/</code> (xem README).</p>
      <textarea id="adv" ${dis} spellcheck="false" placeholder='{ "cards": { ... }, "characters": { ... } }'>${esc(st.ui.adv)}</textarea>
      ${st.ui.advErr ? `<p class="form-err">${esc(st.ui.advErr)}</p>` : ''}
      ${host ? '<div class="row"><button class="btn btn-sm" data-a="applyadv">Áp dụng</button><button class="btn btn-ghost btn-sm" data-a="clearadv">Xoá ghi đè</button></div>' : ''}
      <details><summary>Hiệu ứng / kỹ năng / mod có sẵn</summary>
        <p><b>effect.type:</b> ${m.effects.join(', ')}</p><p><b>abilities:</b> ${m.abilities.join(', ')}</p><p><b>mods:</b> ${m.mods.join(', ')}</p></details>`;
  }
  return `<div class="panel settings">
    <div class="panel-head"><h2>Luật chơi</h2>${host ? '' : '<small class="hint">chỉ chủ phòng sửa được</small>'}</div>
    ${host ? `<div class="presets">${m.presets.map((p) => `<button class="preset" data-a="preset" data-k="${esc(p.id)}"><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></button>`).join('')}</div>` : ''}
    <div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${tab === t[0]}" class="tab ${tab === t[0] ? 'on' : ''}" data-a="tab" data-k="${t[0]}">${t[1]}</button>`).join('')}</div>
    <div class="tab-body">${body}</div>
  </div>`;
}

export function lobbyRegions() {
  const L = st.S.lobby, host = L.hostId === L.me;
  return { 'l-ticket': ticketHtml(), 'l-players': playersHtml(), 'l-settings': settingsHtml(host) };
}
export const lobbySkeleton = () => `<main class="lobby"><header class="lobby-head"><span class="mini-mark">BANG<b>!</b></span><span class="eyebrow">Sảnh chờ</span></header>
  <div class="lobby-grid"><div class="lobby-side"><div id="l-ticket"></div><div id="l-players"></div></div><div id="l-settings"></div></div></main>`;

export const lobbyActions = {
  create: () => homeAct('create'), join: () => homeAct('join'), quick: () => homeAct('quick'),
  resume: () => { history.replaceState(null, '', location.pathname); hooks.connect(); },
  copylink: async () => {
    const link = inviteUrl();
    try { await navigator.clipboard.writeText(link); toast('Đã chép link mời ✓'); } catch (e) {
      const el = document.getElementById('invite'); el.focus(); el.select(); toast('Trình duyệt chặn chép tự động — bấm Ctrl+C để chép');
    }
  },
  addbot: () => post('addbot').catch((e) => toast(e.message, 'err')),
  kick: (el) => post('kick', { id: el.dataset.id }).catch((e) => toast(e.message, 'err')),
  start: () => post('start').catch((e) => toast(e.message, 'err')),
  tab: (el) => { st.ui.tab = el.dataset.k; rerender(); },
  preset: (el) => { const p = st.meta.presets.find((x) => x.id === el.dataset.k); mutate((s) => Object.assign(s, EMPTY(), JSON.parse(JSON.stringify(p.settings)), { override: s.override })); toast(`Đã chọn preset “${p.name}”`); },
  step: (el) => { const d = st.meta.rules.find((r) => r.key === el.dataset.k); mutate((s) => { const cur = s.rules[d.key] !== undefined ? s.rules[d.key] : d.value; s.rules[d.key] = Math.max(d.min, Math.min(d.max, cur + +el.dataset.d)); }); },
  copies: (el) => mutate((s) => { const k = el.dataset.k, cur = s.cardCopies[k] !== undefined ? s.cardCopies[k] : 1; s.cardCopies[k] = Math.max(0, Math.min(6, cur + +el.dataset.d)); }),
  tchar: (el) => mutate((s) => { const k = el.dataset.k; s.charactersOff = s.charactersOff.includes(k) ? s.charactersOff.filter((x) => x !== k) : [...s.charactersOff, k]; }),
  tevent: (el) => mutate((s) => { const k = el.dataset.k; s.eventsOff = s.eventsOff.includes(k) ? s.eventsOff.filter((x) => x !== k) : [...s.eventsOff, k]; }),
  applyadv: () => { let o = {}; try { o = st.ui.adv.trim() ? JSON.parse(st.ui.adv) : {}; } catch (x) { st.ui.advErr = 'JSON sai: ' + x.message; return rerender(); } mutate((s) => { s.override = o; }); },
  clearadv: () => { st.ui.adv = ''; mutate((s) => { s.override = {}; }); },
};
export function lobbyChange(el) {
  if (el.dataset.c !== 'rule') return;
  const d = st.meta.rules.find((r) => r.key === el.dataset.k);
  const v = d.type === 'boolean' ? el.checked : el.value;
  mutate((s) => { s.rules[d.key] = v; });
}
