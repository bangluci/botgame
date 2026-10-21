// Bàn chơi: ghế quanh bàn bầu dục, tay bài, banner hành động, nhật ký, các modal.
import { st, esc, toast, post, act, rerender, clearSel, hooks } from './store.js';
import { chatHtml, chatBubble, lastChatId, unread } from './chat.js';
import { SYM, SUIT_VI, ROLE_VI, ROLE_HINT, ROLE_HINT_3P, G, cardDef, charDef, cardHtml, gearHtml, lifeHtml, roleBadge } from './cards.js';

const meId = () => st.S.lobby.me;
const meP = () => G().players.find((p) => p.id === meId());
const nameOf = (id) => { const p = G().players.find((x) => x.id === id); return p ? p.name : '?'; };
const mine = () => { const pe = G().pending; return !!(pe && pe.player === meId()); };
const member = (id) => st.S.lobby.members.find((m) => m.id === id) || {};

// Người ngồi sau mình theo chiều lượt đi trước — đúng thứ tự ghế quanh bàn.
function seatOrder() {
  const ps = G().players, i = ps.findIndex((p) => p.id === meId());
  return i < 0 ? ps : [...ps.slice(i + 1), ...ps.slice(0, i)];
}
const handCard = (id) => G().me.hand.find((c) => c.id === id);
const playInfo = (id) => (G().me.playable || {})[id] || null;
// Kỹ năng chủ động đang dùng được (server tính sẵn) và đang chọn lá cho kỹ năng nào
const abilityOf = (name) => (G().me.abilities || []).find((a) => a.name === name) || null;
const multiAb = () => (st.ui.multi ? abilityOf(st.ui.multi.name) : null);
const multiReady = () => { const a = multiAb(); return !!(a && a.targets && st.ui.multi.ids.length === a.cards); };
// Lá đang chọn (hoặc kỹ năng đã chọn đủ lá) nhắm được ai
// Lá xanh lá trên bàn dùng được ngay (server tính sẵn) và lá đang chọn để dùng
const greenOf = (id) => (G().me.greens || []).find((x) => x.id === id) || null;
const myTable = () => (meP() || { table: [] }).table;
const needExtra = (s) => { const pl = s && playInfo(s.id); return !!(pl && pl.cost && !s.extra); }; // lá "+1" chưa chọn lá bỏ kèm
const withExtra = (s) => (s.extra ? { extra: s.extra } : {});
function selTargets() {
  if (multiReady()) return multiAb().targets;
  if (st.ui.use) { const gr = greenOf(st.ui.use); return gr ? gr.targets : []; }
  const s = st.ui.sel; if (!s) return null;
  if (needExtra(s)) return null; // chọn xong lá bỏ kèm mới tô mục tiêu
  const pl = playInfo(s.id); if (!pl) return [];
  const list = s.asBang ? pl.bangTargets || [] : pl.targets;
  return list.length || !pl.self || s.asBang ? list : null; // lá tự chơi: không làm mờ ghế nào
}

// ---------- ghế ----------
function seatHtml(p, i, k) {
  const g = G(), ch = charDef(p.char), m = member(p.id), pe = g.pending;
  const a = ((90 + ((i + 1) * 360) / (k + 1)) * Math.PI) / 180;
  const x = 50 + 40 * Math.cos(a), y = 54 + 37 * Math.sin(a); // chừa chỗ cho ghế cao (có đồ trang bị) ở mép trên
  const targets = selTargets();
  const tgt = targets && p.alive && targets.includes(p.id), far = targets && p.alive && !tgt;
  const immune = far && !multiReady() && st.ui.sel && !st.ui.sel.asBang && ((playInfo(st.ui.sel.id) || {}).immune || []).includes(p.id); // Apache Kid miễn lá ♦
  const cls = ['seat', g.turn === p.id && 'turn', pe && pe.player === p.id && 'pend', !p.alive && 'dead', tgt && 'tgt', far && 'far',
    pe && pe.type === 'respond' && pe.from === p.id && 'shooter', pe && pe.type === 'respond' && pe.player === p.id && 'under-fire'].filter(Boolean).join(' ');
  const bub = bubbleOf(p.id);
  return `<div class="${cls}" style="--x:${x.toFixed(1)};--y:${y.toFixed(1)};--d:${i}" data-seat="${esc(p.id)}" data-a="${tgt ? 'player' : 'seat-info'}" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.name)}${tgt ? ' — chọn làm mục tiêu' : ''}">
    <div class="plate">
      <div class="p-top"><span class="avatar">${esc(ch ? ch.icon : '🂠')}</span><div class="p-who"><b>${esc(p.name)}</b><small>${esc(ch ? ch.name : 'đang chọn…')}${p.vera ? ` · 🎭 ${esc(charDef(p.vera).name)}` : ''}</small></div>${roleBadge(p.role)}</div>
      ${p.alive ? lifeHtml(p) : '<span class="rip">☠ Bị loại</span>'}
      <div class="p-meta"><span class="hc" title="Số lá trên tay"><i class="mini-back"></i>${p.hand}</span>${p.dist != null ? `<span class="dist" title="Khoảng cách từ bạn">↔ ${p.dist}</span>` : ''}${!m.online && !m.bot ? '<span class="tag off">offline</span>' : ''}${m.auto ? '<span class="tag auto">máy chơi thay</span>' : ''}</div>
      ${p.table.length ? `<div class="p-gear">${p.table.map(gearHtml).join('')}</div>` : ''}
    </div>
    ${tgt ? '<span class="crosshair" aria-hidden="true"></span>' : ''}${far ? `<span class="far-tag">${immune ? 'miễn ♦' : 'ngoài tầm'}</span>` : ''}
    ${bubble(bub)}
  </div>`;
}
// Bong bóng trên ghế: emote hoặc tin chat của người đó, cái nào mới hơn.
function bubbleOf(pid) {
  const em = (st.S.emotes || []).filter((e) => e.pid === pid).pop(), ch = chatBubble(pid);
  return !em ? ch : !ch ? em : em.t >= ch.t ? em : ch;
}
const bubble = (e) => (e ? `<span class="bubble${e.text ? ' text' : ''}" style="animation-delay:-${Math.max(0, st.S.now - e.t)}ms" aria-hidden="true">${esc(e.e)}</span>` : '');

function centerHtml() {
  const g = G(), ev = g.event, L = g.last;
  const lastCard = L && L.card ? cardDef(L.card) : null;
  return `<div class="piles">
      <div class="deck" title="Chồng rút"><div class="back-stack"><span>${g.deck}</span></div><small>chồng rút</small></div>
      <div class="discard">${g.discardTop ? cardHtml(g.discardTop, { cls: 'mini-card' }) : '<div class="slot"></div>'}<small>chồng bỏ · ${g.discard || 0}</small></div>
      ${ev ? `<button class="event ${ev.final ? 'final' : ''}" data-a="info-event"><span class="ev-icon">${esc(ev.icon || '🎴')}</span><b>${esc(ev.name)}</b><small>${esc(ev.desc)}</small></button>`
    : g.eventsOn ? '<div class="event idle"><span class="ev-icon">🎴</span><small>Sự kiện lật từ vòng 2</small></div>' : ''}
    </div>
    <div class="last-play">${lastCard ? `<b>${esc(nameOf(L.pid))}</b> <span class="lp-card">${esc(lastCard.icon)} ${esc(L.asBang ? 'BANG!' : lastCard.name)}</span>${L.target ? ` <i>→</i> <b>${esc(nameOf(L.target))}</b>` : ''}` : `<span class="dim">Vòng ${g.round || 1}${g.reverse ? ' · ↺ thứ tự đảo' : ''}</span>`}</div>`;
}

function mebarHtml() {
  const g = G(), me = meP(), ch = charDef(me.char), m = g.me;
  const bub = bubbleOf(me.id);
  return `<div class="mebar ${g.turn === me.id ? 'turn' : ''} ${me.alive ? '' : 'dead'}" data-seat="${esc(me.id)}">
    <button class="me-avatar" data-a="info-char" data-key="${esc(me.char || '')}" aria-label="Xem kỹ năng nhân vật">${esc(ch ? ch.icon : '🂠')}</button>
    <div class="me-who"><b>${esc(me.name)} <small>· ${esc(ch ? ch.name : '')}</small></b><span class="me-skill">${esc(ch ? ch.desc : '')}${me.vera ? ` · 🎭 Đang mượn ${esc(charDef(me.vera).name)}: ${esc(charDef(me.vera).desc)}` : ''}</span></div>
    <div class="me-stats">${me.alive ? lifeHtml(me) : '<span class="rip">☠ Đã bị loại</span>'}
      <span class="stat" title="Tầm súng">🎯 ${m.range}</span><span class="stat" title="BANG! đã bắn lượt này">🔫 ${m.bangs}${m.bangLimit ? '/' + m.bangLimit : ''}</span>${m.cuff ? `<span class="stat warn">🔗 ${SUIT_VI[m.cuff]}</span>` : ''}</div>
    <span class="role-card r-${m.role}" title="${esc((g.threeP ? ROLE_HINT_3P : ROLE_HINT)[m.role])}">${roleBadge(m.role, true)}<small>${esc((g.threeP ? ROLE_HINT_3P : ROLE_HINT)[m.role])}</small></span>
    ${me.table.length ? `<div class="me-gear">${me.table.map(gearHtml).join('')}</div>` : ''}
    ${bubble(bub)}
  </div>`;
}

// ---------- banner hành động ----------
function clock() {
  const d = G().deadline;
  const left = d ? Math.max(0, Math.ceil((d - (Date.now() + st.skew)) / 1000)) : 0;
  return d ? `<span class="clock ${left <= 10 ? 'urgent' : ''}" data-deadline="${d}" title="Hết giờ thì máy chơi thay">⏱ ${left}s</span>` : '';
}
// Nút cho từng kỹ năng chủ động engine báo dùng được ở prompt này
const abilityBtns = () => (G().me.abilities || []).map((a) => `<button class="btn btn-ghost btn-sm ${st.ui.multi && st.ui.multi.name === a.name ? 'on' : ''}" data-a="ability" data-k="${esc(a.name)}">${esc(a.label)}</button>`).join('');
function multiHint() {
  const a = multiAb(), m = st.ui.multi;
  if (!a) return '';
  return multiReady() ? 'Chọn mục tiêu trên bàn — ghế sáng viền đỏ' : `Chọn ${a.cards} lá để bỏ (${m.ids.length}/${a.cards}) · bấm lại nút kỹ năng để huỷ`;
}
const greenName = (id) => { const c = myTable().find((x) => x.id === id); return c ? cardDef(c).name : ''; };
const greenBtns = () => (G().me.greens || []).map((gr) => { const c = myTable().find((x) => x.id === gr.id); if (!c) return ''; const d = cardDef(c);
  return `<button class="btn btn-ghost btn-sm ${st.ui.use === gr.id ? 'on' : ''}" data-a="use" data-k="${gr.id}">Dùng ${esc(d.icon)} ${esc(d.name)}</button>`; }).join('');
function bannerHtml() {
  const g = G(), pe = g.pending, me = meP();
  if (g.winner) return `<div class="banner end"><span class="b-icon">🏆</span><div class="b-text"><b>${esc(g.winner.text)}</b></div><div class="b-actions"><button class="btn btn-sm" data-a="show-end">Xem kết quả</button></div></div>`;
  if (!pe) return '';
  if (!mine()) {
    const who = nameOf(pe.player), m = member(pe.player);
    return `<div class="banner wait"><span class="b-icon spin">⏳</span><div class="b-text"><b>Đang chờ ${esc(who)}${m.bot ? ' 🤖' : ''}</b><small>${esc(pe.text)}</small></div>${clock()}</div>`;
  }
  const u = st.ui;
  let icon = '👉', title = pe.text, sub = '', btns = '';
  switch (pe.type) {
    case 'play':
      icon = '🤠'; title = 'Lượt của bạn';
      sub = u.multi ? multiHint() : u.use ? `Chọn mục tiêu cho ${greenName(u.use)} — ghế sáng viền đỏ · bấm lại nút để huỷ` : u.sel ? ((selTargets() || []).length ? 'Chọn mục tiêu trên bàn — ghế sáng viền đỏ' : 'Xem lá bên dưới') : 'Chạm 1 lá để xem và chơi · xong thì kết thúc lượt';
      btns += abilityBtns() + greenBtns() + `<button class="btn btn-sm btn-primary" data-a="end"><span>Kết thúc lượt</span></button>`;
      break;
    case 'respond':
      icon = '💥'; sub = g.me.usable.length ? 'Chạm lá sáng để đỡ' : '';
      btns = myTable().filter((c) => g.me.usable.includes(c.id)).map((c) => `<button class="btn btn-ghost btn-sm" data-a="respond-table" data-k="${c.id}">Đỡ bằng ${esc(cardDef(c).icon)} ${esc(cardDef(c).name)}</button>`).join('')
        + `<button class="btn btn-sm btn-danger" data-a="pass">Chịu đòn</button>`;
      break;
    case 'dying':
      icon = '☠️'; sub = u.multi ? multiHint() : g.me.usable.length ? 'Chạm Beer để uống' : '';
      btns += abilityBtns() + `<button class="btn btn-sm btn-danger" data-a="pass">Chịu chết</button>`;
      break;
    case 'discard':
      icon = '🗑️'; title = `Bỏ bớt ${pe.need} lá`; sub = u.multi ? multiHint() : `Giới hạn bài cuối lượt bằng số máu (${me.life}). Chạm lá muốn bỏ.`;
      btns += abilityBtns();
      break;
    case 'choice': icon = '🤔'; btns = pe.options.map((o) => `<button class="btn btn-ghost btn-sm" data-a="choice" data-k="${esc(o.id)}">${esc(o.label)}</button>`).join(''); break;
    case 'suit': icon = '🔗'; btns = ['S', 'H', 'D', 'C'].map((s) => `<button class="btn btn-ghost btn-sm suit-${s}" data-a="suit" data-k="${s}">${SUIT_VI[s]}</button>`).join(''); break;
    default: icon = '🃏'; break;
  }
  return `<div class="banner mine t-${pe.type}"><span class="b-icon">${icon}</span><div class="b-text"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>${clock()}<div class="b-actions">${btns}</div></div>`;
}

// Lá đang chọn: mô tả + nút chơi (chạm 2 bước, tránh bấm nhầm trên điện thoại).
function dockHtml() {
  const s = st.ui.sel; if (!s || !mine()) return '';
  const c = handCard(s.id); if (!c) return '';
  const d = cardDef(c), pl = playInfo(c.id), me = meP();
  let acts = '', note = '';
  if (!pl) note = 'Lá này chưa chơi được lúc này.';
  else {
    if (needExtra(s)) note = 'Lá này phải bỏ kèm 1 lá: chạm thêm 1 lá khác trên tay.';
    else {
      const ex = s.extra && handCard(s.extra);
      if (pl.self && !s.asBang) acts += `<button class="btn btn-primary btn-sm" data-a="play-self"><span>${pl.targets.length ? 'Chơi cho mình' : `Chơi ${esc(d.name)}`}</span><i aria-hidden="true">→</i></button>`;
      if (pl.targets.length && !s.asBang) note = pl.self ? 'Hoặc chọn 1 người trên bàn.' : 'Chọn mục tiêu trên bàn.';
      if (ex) note = `Bỏ kèm: ${cardDef(ex).name}. ${note}`;
    }
    if (pl.bangTargets && pl.bangTargets.length) acts += `<button class="btn btn-ghost btn-sm ${s.asBang ? 'on' : ''}" data-a="as-bang">${s.asBang ? '✓ Đang dùng như BANG!' : 'Dùng như BANG!'}</button>`;
    if (d.isBeer && me.life >= me.maxLife) note = '⚠️ Bạn đang đầy máu — Beer sẽ không hồi gì.';
  }
  return `<div class="dock"><div class="dock-body"><b>${esc(d.icon)} ${esc(d.name)} <small class="${c.suit === 'H' || c.suit === 'D' ? 'red' : ''}">${SYM[c.suit]}${esc(c.rank)}</small></b><p>${esc(d.desc)}</p>${note ? `<p class="note">${esc(note)}</p>` : ''}</div>
    <div class="dock-actions">${acts}<button class="btn btn-ghost btn-sm" data-a="unsel">Huỷ</button></div></div>`;
}

function usable(c) {
  if (!mine()) return null;
  const pe = G().pending;
  if (st.ui.multi) { const a = multiAb(); return !!(a && a.pick.includes(c.id)); }
  if (pe.type === 'play') return needExtra(st.ui.sel) ? c.id !== st.ui.sel.id || null : !!playInfo(c.id);
  if (pe.type === 'respond' || pe.type === 'dying' || pe.type === 'discard') return G().me.usable.includes(c.id);
  return null;
}
function handHtml() {
  const hand = G().me.hand, n = hand.length;
  if (!n) return '<p class="empty-hand">Hết bài trên tay</p>';
  return hand.map((c, i) => {
    const ok = usable(c);
    const sel = (st.ui.sel && st.ui.sel.id === c.id) || (st.ui.multi && st.ui.multi.ids.includes(c.id));
    const extra = st.ui.sel && st.ui.sel.extra === c.id;
    return cardHtml(c, { a: 'card', cls: `${extra ? 'extra' : ok === true ? 'ok' : ok === false ? 'no' : ''} ${sel ? 'sel' : ''}`, style: `--i:${i};--n:${n}` });
  }).join('');
}

// ---------- nhật ký ----------
const logOpen = () => { const el = document.getElementById('game'); return !!(el && el.classList.contains('log-open')); };
function logHtml() {
  const tab = st.ui.logTab;
  const tabs = [['log', '📜 Nhật ký'], ['chat', `💬 Chat${unread() ? '<i class="dot"></i>' : ''}`]];
  const head = `<div class="log-head"><div class="log-tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-a="log-tab" data-k="${k}">${t}</button>`).join('')}</div><button class="icon-btn only-narrow" data-a="log-toggle" aria-label="Đóng nhật ký">✕</button></div>`;
  if (tab === 'chat') return head + chatHtml();
  const me = (meP() || {}).name; // người xem: không có dòng nào là "của mình"
  const lines = G().log.map((l) => {
    const t = esc(l);
    if (l.startsWith('━━')) return `<li class="turn-h">${esc(l.replace(/━/g, '').trim())}</li>`;
    const cls = l.startsWith('🎴 SỰ KIỆN') ? 'ev' : l.startsWith('☠️') ? 'death' : l.startsWith('🏆') ? 'win' : l.startsWith('⚠️') ? 'warn' : me && l.includes(me) ? 'mine' : '';
    return `<li class="${cls}">${t}</li>`;
  });
  return `${head}<ol class="log-list">${lines.join('')}</ol>`;
}

// ---------- modal ----------
function endModal() {
  const g = G(), w = g.winner;
  return `<div class="modal"><div class="sheet end-sheet"><div class="end-star" aria-hidden="true">★</div><h2>${esc(w.text)}</h2>
    <ul class="end-list">${g.players.map((p) => { const ch = charDef(p.char); const won = w.players.includes(p.id); return `<li class="${won ? 'won' : ''} ${p.alive ? '' : 'dead'}"><span class="avatar">${esc(ch ? ch.icon : '')}</span><span class="e-name"><b>${esc(p.name)}</b><small>${esc(ch ? ch.name : '')}</small></span>${roleBadge(p.role, true)}${won ? '<span class="trophy">🏆</span>' : ''}</li>`; }).join('')}</ul>
    <div class="row center"><button class="btn btn-primary" data-a="tolobby"><span>Về sảnh — chơi ván mới</span><i aria-hidden="true">→</i></button><button class="btn btn-ghost" data-a="hide-end">Xem lại bàn</button></div></div></div>`;
}
function zoneModal() {
  const z = st.ui.zone, t = G().players.find((p) => p.id === z.target);
  return `<div class="modal" data-a="close-modal"><div class="sheet" data-a="noop"><h3>Lấy lá nào của ${esc(t.name)}?</h3>
    <div class="opts">${t.hand ? `<button class="opt" data-a="zone" data-k="hand"><span class="big">🂠</span><span><b>Một lá trên tay</b><small>ngẫu nhiên — ${t.hand} lá</small></span></button>` : ''}
    ${t.table.map((c) => { const d = cardDef(c); return `<button class="opt" data-a="zone" data-k="${c.id}"><span class="big">${esc(d.icon)}</span><span><b>${esc(d.name)}</b><small>đang trang bị · ${esc(d.desc)}</small></span></button>`; }).join('')}</div>
    <div class="row"><button class="btn btn-ghost btn-sm" data-a="unsel">Huỷ</button></div></div></div>`;
}
function pickModal() {
  const pe = G().pending;
  if (pe.type === 'pick') return `<div class="modal"><div class="sheet"><h3>${esc(pe.text)}</h3><div class="pick-row">${pe.cards.map((c) => cardHtml(c, { a: 'pick', cls: 'ok' })).join('')}</div></div></div>`;
  if (pe.type === 'kit') return `<div class="modal"><div class="sheet"><h3>${esc(pe.text)}</h3><p class="hint">Lá bạn chọn sẽ quay lại đầu chồng rút, 2 lá còn lại vào tay.</p><div class="pick-row">${pe.cards.map((c) => cardHtml(c, { a: 'back', cls: 'ok' })).join('')}</div></div></div>`;
  if (pe.type === 'char') return `<div class="modal"><div class="sheet"><h3>Chọn nhân vật của bạn</h3><div class="opts">${pe.options.map((k) => { const c = charDef(k); return `<button class="opt" data-a="char" data-k="${esc(k)}"><span class="big">${esc(c.icon)}</span><span><b>${esc(c.name)} · ${c.life}❤</b><small>${esc(c.desc)}</small></span></button>`; }).join('')}</div></div></div>`;
  return '';
}
function helpModal() {
  const g = G();
  return `<div class="modal" data-a="close-modal"><div class="sheet help" data-a="noop"><div class="row between"><h2>Luật nhanh</h2><button class="icon-btn" data-a="close-modal" aria-label="Đóng">✕</button></div>
    <ol class="help-steps"><li><b>Đầu lượt</b> — xử lý Dynamite (rút! ra ♠2–9 thì nổ, mất 3 máu), rồi Jail (rút! ra ♥ mới thoát), rồi rút 2 lá.</li>
      <li><b>Chơi bài</b> — bao nhiêu lá cũng được, nhưng chỉ <b>1 BANG!</b> mỗi lượt (trừ Volcanic / Willy the Kid). Mỗi loại trang bị chỉ giữ 1 lá, súng mới thay súng cũ.</li>
      <li><b>Cuối lượt</b> — bỏ bớt bài cho bằng số máu hiện có.</li>
      <li><b>Khoảng cách</b> — đếm số ghế ngắn nhất tới người đó (người đã chết không tính). BANG! chỉ tới được người trong <b>tầm súng</b>; Panic! chỉ khoảng cách 1. Mustang làm người khác thấy bạn xa hơn 1, Scope làm bạn thấy người khác gần hơn 1.</li>
      <li><b>Sắp chết</b> — uống Beer để cứu (Beer vô hiệu khi chỉ còn 2 người).</li>
      <li><b>Thắng</b> — Sheriff & Deputy: hạ hết Outlaw và Renegade. Outlaw: hạ Sheriff. Renegade: là người cuối cùng còn sống.</li>
      <li><b>Hạ Outlaw</b> được rút 3 lá. Sheriff lỡ giết Deputy thì bỏ hết bài.</li></ol>
    <h3>Lá bài trong ván này</h3><dl class="gloss">${Object.values(g.defs.cards).map((d) => `<div><dt>${esc(d.icon)} ${esc(d.name)} <small>${d.kind === 'equip' ? 'trang bị' : d.kind === 'green' ? 'lá xanh lá' : 'hành động'}</small></dt><dd>${esc(d.desc)}</dd></div>`).join('')}</dl>
    <h3>Nhân vật</h3><dl class="gloss">${Object.values(g.defs.chars).map((c) => `<div><dt>${esc(c.icon)} ${esc(c.name)} <small>${c.life}❤</small></dt><dd>${esc(c.desc)}</dd></div>`).join('')}</dl></div></div>`;
}
function infoModal() {
  const inf = st.ui.info, g = G();
  let body = '';
  if (inf.kind === 'card') { const d = g.defs.cards[inf.key] || {}; body = `<div class="info-big">${esc(d.icon)}</div><h3>${esc(d.name)}</h3><p class="hint">${d.kind === 'equip' ? 'Lá trang bị (viền xanh) — đặt trên bàn' : d.kind === 'green' ? 'Lá xanh lá — đặt trên bàn, từ lượt sau mới dùng' : 'Lá hành động (viền nâu)'}</p><p>${esc(d.desc)}</p>`; }
  if (inf.kind === 'event') { const e = g.event || {}; body = `<div class="info-big">${esc(e.icon || '🎴')}</div><h3>${esc(e.name)}</h3><p>${esc(e.desc)}</p>${e.final ? '<p class="hint">Lá cuối chồng sự kiện — giữ tới hết ván.</p>' : ''}`; }
  if (inf.kind === 'char') { const c = charDef(inf.key) || {}; body = `<div class="info-big">${esc(c.icon)}</div><h3>${esc(c.name)} · ${c.life}❤</h3><p>${esc(c.desc)}</p>`; }
  if (inf.kind === 'player') {
    const p = g.players.find((x) => x.id === inf.id), c = charDef(p.char) || {}, m = member(p.id);
    body = `<div class="info-big">${esc(c.icon || '🂠')}</div><h3>${esc(p.name)}${m.bot ? ' 🤖' : ''}</h3><p><b>${esc(c.name || '')}</b> — ${esc(c.desc || '')}</p>${p.vera ? `<p>🎭 Đang mượn kỹ năng <b>${esc(charDef(p.vera).name)}</b> — ${esc(charDef(p.vera).desc)}</p>` : ''}
      <p>${p.role ? `Vai: <b>${esc(ROLE_VI[p.role])}</b>` : 'Vai: chưa lộ'} · ${p.alive ? `${p.life}/${p.maxLife} máu · ${p.hand} lá trên tay${p.dist != null ? ` · cách bạn ${p.dist}` : ''}` : 'đã bị loại'}</p>
      ${p.table.length ? `<div class="p-gear">${p.table.map(gearHtml).join('')}</div>` : ''}
      ${st.S.lobby.hostId === meId() && !m.bot && !m.auto && p.id !== meId() ? `<p><button class="btn btn-ghost btn-sm" data-a="takeover" data-id="${esc(p.id)}">🤖 Cho máy chơi thay người này</button></p>` : ''}`;
  }
  return `<div class="modal" data-a="close-modal"><div class="sheet info" data-a="noop"><button class="icon-btn close" data-a="close-modal" aria-label="Đóng">✕</button>${body}</div></div>`;
}
function emoteModal() {
  return `<div class="modal light" data-a="close-modal"><div class="sheet emote-tray" data-a="noop">${(st.meta.emotes || []).map((e) => `<button class="emote" data-a="emote" data-k="${esc(e)}">${esc(e)}</button>`).join('')}</div></div>`;
}
function modalHtml() {
  const g = G(), u = st.ui;
  if (g.winner && !u.hideEnd) return endModal();
  if (u.modal === 'help') return helpModal();
  if (u.modal === 'info' && u.info) return infoModal();
  if (u.modal === 'emote') return emoteModal();
  if (u.zone) return zoneModal();
  if (mine()) return pickModal();
  const pe = g.pending;
  if (pe && pe.type === 'pick' && pe.cards && !pe.flip) return `<div class="peek"><small>${esc(pe.text)}</small><div class="pick-row">${pe.cards.map((c) => cardHtml(c, { cls: 'mini-card' })).join('')}</div></div>`;
  return '';
}

function topbarHtml() {
  const g = G(), L = st.S.lobby, host = L.hostId === meId();
  return `<span class="mini-mark">BANG<b>!</b></span><span class="tchip"><span class="wide-only">Phòng </span><b>${esc(L.code)}</b></span><span class="tchip"><span class="wide-only">Vòng </span><b>${g.round || 1}</b></span>
    ${g.event ? `<button class="tchip ev" data-a="info-event">${esc(g.event.icon || '🎴')} ${esc(g.event.name)}</button>` : ''}
    <span class="spacer"></span>
    <button class="icon-btn" data-a="emote-open" aria-label="Gửi biểu cảm">😀</button>
    <button class="icon-btn" data-a="help" aria-label="Luật nhanh">❓</button>
    <button class="icon-btn" data-a="sound" aria-label="${st.ui.sound ? 'Tắt' : 'Bật'} âm thanh">${st.ui.sound ? '🔔' : '🔕'}</button>
    <button class="icon-btn only-narrow" data-a="log-toggle" aria-label="Nhật ký và chat">📜${unread() ? '<i class="dot"></i>' : ''}</button>
    ${host && !g.winner ? '<button class="btn btn-ghost btn-sm" data-a="cancel" aria-label="Huỷ ván">⏹<span class="wide-only"> Huỷ ván</span></button>' : ''}
    <button class="icon-btn" data-a="quit" aria-label="Rời ván">🚪</button>`;
}

export const gameSkeleton = () => `<div class="game" id="game">
  <header class="topbar" id="g-top"></header>
  <main class="g-main">
    <section class="table-area"><div class="felt" aria-hidden="true"></div><div class="seats" id="g-seats"></div><div class="pile-center" id="g-center"></div></section>
    <div class="me-zone"><div id="g-me"></div><div id="g-banner" aria-live="polite"></div><div class="hand" id="g-hand"></div></div>
  </main>
  <aside class="log" id="g-log"></aside>
  <div id="g-modal"></div></div>`;

export function gameRegions() {
  if (st.ui.logTab === 'chat' && logOpen()) st.ui.chatSeen = lastChatId(); // đang mở tab Chat = đã đọc (trước khi vẽ chấm báo)
  const others = seatOrder();
  return {
    'g-top': topbarHtml(),
    'g-seats': others.map((p, i) => seatHtml(p, i, others.length)).join(''),
    'g-center': centerHtml(),
    'g-me': mebarHtml(),
    'g-banner': dockHtml() || bannerHtml(), // đang chọn lá thì banner thành ô mô tả lá — không đẩy bàn chơi lên
    'g-hand': handHtml(),
    'g-log': logHtml(),
    'g-modal': modalHtml(),
  };
}

// ---------- thao tác ----------
function onCard(el) {
  const id = +el.dataset.id, u = st.ui;
  const c = handCard(id); if (!c) return;
  if (!mine()) { u.info = { kind: 'card', key: c.key }; u.modal = 'info'; return rerender(); }
  const pe = G().pending;
  if (u.multi) {
    const a = multiAb(); if (!a) { u.multi = null; return rerender(); }
    if (u.multi.ids.includes(id)) u.multi.ids = u.multi.ids.filter((x) => x !== id);
    else if (!a.pick.includes(id)) return toast('Lá này không dùng cho kỹ năng được');
    else if (u.multi.ids.length < a.cards) u.multi.ids = [...u.multi.ids, id];
    if (u.multi.ids.length === a.cards && !a.targets) return act({ type: 'ability', name: a.name, cards: u.multi.ids });
    return rerender(); // kỹ năng cần mục tiêu: chờ chạm ghế
  }
  if (pe.type === 'play') {
    const pl = playInfo(id);
    u.use = null;
    if (u.sel && u.sel.id !== id && playInfo(u.sel.id) && playInfo(u.sel.id).cost) { // lá "+1": chạm lá khác = chọn/bỏ chọn lá bỏ kèm
      u.sel.extra = u.sel.extra === id ? null : id;
      return rerender();
    }
    if (u.sel && u.sel.id === id && pl && pl.self && !pl.targets.length && !u.sel.asBang && !needExtra(u.sel)) return act({ type: 'play', card: id, ...withExtra(u.sel) }); // chạm lần 2 = chơi
    u.sel = u.sel && u.sel.id === id ? null : { id, asBang: false };
    return rerender();
  }
  if (!G().me.usable.includes(id)) return toast(pe.type === 'dying' ? 'Cần lá Beer để cứu' : 'Lá này không dùng được lúc này');
  if (pe.type === 'respond') return act({ type: 'respond', card: id });
  if (pe.type === 'dying') return act({ type: 'beer', card: id });
  if (pe.type === 'discard') return act({ type: 'discard', card: id });
}
function onPlayer(el) {
  if (multiReady()) return act({ type: 'ability', name: st.ui.multi.name, cards: st.ui.multi.ids, target: el.dataset.id });
  if (st.ui.use) { // dùng lá xanh lá trên bàn
    const c = myTable().find((x) => x.id === st.ui.use); if (!c) return;
    if (cardDef(c).steal) { st.ui.zone = { card: c.id, target: el.dataset.id, use: true }; return rerender(); }
    return act({ type: 'use', card: c.id, target: el.dataset.id });
  }
  const s = st.ui.sel; if (!s) return;
  const id = el.dataset.id, c = handCard(s.id);
  if (!c) return;
  const d = cardDef(c);
  if (!s.asBang && d.steal) { st.ui.zone = { card: s.id, target: id, ...withExtra(s) }; return rerender(); }
  act({ type: 'play', card: s.id, target: id, ...(s.asBang ? { as: 'bang' } : {}), ...withExtra(s) });
}
const openInfo = (info) => { st.ui.info = info; st.ui.modal = 'info'; rerender(); };

export const tableActions = {
  card: onCard, player: onPlayer,
  'seat-info': (el) => openInfo({ kind: 'player', id: el.dataset.id }),
  'info-card': (el) => openInfo({ kind: 'card', key: el.dataset.key }),
  'info-char': (el) => el.dataset.key && openInfo({ kind: 'char', key: el.dataset.key }),
  'info-event': () => openInfo({ kind: 'event' }),
  'play-self': () => act({ type: 'play', card: st.ui.sel.id, ...withExtra(st.ui.sel) }),
  use: (el) => {
    const gr = greenOf(+el.dataset.k); if (!gr) return;
    st.ui.sel = null; st.ui.multi = null;
    if (gr.self && !gr.targets.length) return act({ type: 'use', card: gr.id });
    st.ui.use = st.ui.use === gr.id ? null : gr.id;
    rerender();
  },
  'respond-table': (el) => act({ type: 'respond', card: +el.dataset.k }),
  'as-bang': () => { st.ui.sel.asBang = !st.ui.sel.asBang; rerender(); },
  unsel: () => { clearSel(); rerender(); },
  end: () => act({ type: 'end' }), pass: () => act({ type: 'pass' }),
  ability: (el) => {
    const a = abilityOf(el.dataset.k); if (!a) return;
    st.ui.sel = null;
    if (!a.cards && !a.targets) return act({ type: 'ability', name: a.name });
    st.ui.multi = st.ui.multi && st.ui.multi.name === a.name ? null : { name: a.name, ids: [] };
    rerender();
  },
  choice: (el) => act({ type: 'choice', id: el.dataset.k }),
  suit: (el) => act({ type: 'suit', suit: el.dataset.k }),
  pick: (el) => act({ type: 'pick', card: +el.dataset.id }),
  back: (el) => act({ type: 'back', card: +el.dataset.id }),
  char: (el) => act({ type: 'char', key: el.dataset.k }),
  zone: (el) => { const z = st.ui.zone, base = { type: z.use ? 'use' : 'play', card: z.card, target: z.target, ...(z.extra ? { extra: z.extra } : {}) }; act(el.dataset.k === 'hand' ? { ...base, zone: 'hand' } : { ...base, zone: 'table', cardId: +el.dataset.k }); },
  // nền mờ và nút ✕ có data-a="close-modal"; bấm bên trong sheet chạm data-a="noop" trước nên không đóng
  'close-modal': () => { st.ui.modal = null; st.ui.zone = null; rerender(); },
  noop: () => {},
  help: () => { st.ui.modal = 'help'; rerender(); },
  'emote-open': () => { st.ui.modal = 'emote'; rerender(); },
  emote: (el) => { st.ui.modal = null; rerender(); post('emote', { emoji: el.dataset.k }).catch((e) => toast(e.message)); },
  sound: () => { st.ui.sound = !st.ui.sound; try { localStorage.setItem('bang-sound', st.ui.sound ? 'on' : 'off'); } catch (e) { /* trình duyệt chặn lưu thì thôi */ } rerender(); },
  'log-toggle': () => { document.getElementById('game').classList.toggle('log-open'); rerender(); },
  'log-tab': (el) => { st.ui.logTab = el.dataset.k; rerender(); },
  'show-end': () => { st.ui.hideEnd = false; rerender(); },
  'hide-end': () => { st.ui.hideEnd = true; rerender(); },
  tolobby: () => post('lobby').catch((e) => toast(e.message, 'err')),
  cancel: () => { if (confirm('Huỷ ván đang chơi và đưa mọi người về sảnh?')) post('lobby').catch((e) => toast(e.message, 'err')); },
  takeover: (el) => { st.ui.modal = null; post('kick', { id: el.dataset.id }).then(() => toast('Máy sẽ chơi thay người này')).catch((e) => toast(e.message, 'err')); },
  quit: () => { if (confirm('Rời ván? Máy sẽ chơi thay bạn tới hết ván. Muốn quay lại thì vào phòng bằng đúng tên cũ.')) post('leave').catch(() => {}).finally(() => hooks.leaveLocal()); },
};
