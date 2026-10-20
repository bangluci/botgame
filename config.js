'use strict';
// Nạp cấu hình: config/*.json (mặc định) <- custom/*.json (của bạn) <- settings.override (theo từng phòng).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'config');
const CUSTOM = path.join(__dirname, 'custom');
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const EFFECTS = new Set(['bang', 'heal', 'draw', 'steal', 'aoe', 'duel', 'store', 'brawl']);
const ABILITIES = new Set(['bart', 'blackjack', 'janet', 'gringo', 'jesse', 'jourdonnais', 'kit', 'lucky', 'paul', 'pedro', 'rose', 'sid', 'slab', 'suzy', 'vulture', 'willy',
  'pixie', 'bill', 'sean', 'tequila', 'greg', 'herb', 'elena', 'chuck', 'doc', 'jose', 'pat', 'vera', 'belle', 'apache', 'molly']); // dòng 2: Dodge City
// Bộ mở rộng -> luật bật nó. Lá/nhân vật có "set" chỉ vào ván khi luật đó bật; "extra": { set: [printings] } thêm bản in của bộ đó.
const SETS = { dodgecity: 'dodgeCity' };
const MODS = new Set(['drawSuit', 'reverse', 'noBang', 'drawDelta', 'bangBonus', 'noAbilities', 'beerHeal', 'rangeBonus', 'turnStartDamage', 'turnStartHeal', 'turnStartDraw', 'handcuffs', 'vendetta', 'handLimitDelta', 'missedExtra']);

function readJson(file) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  try { return JSON.parse(txt.replace(/^﻿/, '')); } catch (e) { throw new Error(`File ${path.relative(__dirname, file)} sai JSON: ${e.message}`); }
}

// Gộp theo từng key; giá trị null = xoá mục đó.
function mergeKeyed(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (v === null) delete out[k];
    else if (typeof v === 'object') out[k] = { ...(out[k] || {}), ...v };
  }
  return out;
}

// Cache theo mtime: sửa file config/ hay custom/ vẫn có hiệu lực ngay, nhưng không đọc lại 11 file mỗi request.
const FILES = ['cards', 'characters', 'events', 'roles', 'rules', 'presets'];
let cache = null, cacheSig = '';
function loadBase() {
  const sig = FILES.map((n) => [DIR, CUSTOM].map((d) => { try { return fs.statSync(path.join(d, n + '.json')).mtimeMs; } catch (e) { return 0; } }).join(':')).join('|');
  if (cache && sig === cacheSig) return cache;
  cache = readBase(); cacheSig = sig;
  return cache;
}
function readBase() {
  const get = (n) => readJson(path.join(DIR, n + '.json'));
  const cus = (n) => readJson(path.join(CUSTOM, n + '.json')) || {};
  const ruleDefs = get('rules').map((r) => ({ ...r }));
  const ruleOv = cus('rules');
  for (const r of ruleDefs) if (ruleOv[r.key] !== undefined) r.value = ruleOv[r.key];
  const presets = [...get('presets'), ...(Array.isArray(cus('presets')) ? cus('presets') : [])];
  return {
    cards: mergeKeyed(get('cards'), cus('cards')),
    characters: mergeKeyed(get('characters'), cus('characters')),
    events: mergeKeyed(get('events'), cus('events')),
    roles: { ...get('roles'), ...cus('roles') },
    ruleDefs, presets,
  };
}

function expand(list, key) {
  const out = [];
  for (const s of list || []) {
    const m = /^([SHDC]):(\d+|[JQKA])(?:-(\d+|[JQKA]))?(?:\*(\d+))?$/.exec(String(s));
    if (!m) throw new Error(`Lá "${key}": printing "${s}" sai định dạng (ví dụ "H:5", "D:2-A", "S:9*2")`);
    const i = RANKS.indexOf(m[2]), j = m[3] ? RANKS.indexOf(m[3]) : i;
    if (i < 0 || j < i) throw new Error(`Lá "${key}": hạng bài sai trong "${s}"`);
    const times = +m[4] || 1;
    if (times > 10) throw new Error(`Lá "${key}": "*${times}" quá lớn (tối đa *10)`);
    for (let r = i; r <= j; r++) for (let t = 0; t < times; t++) out.push({ suit: m[1], rank: RANKS[r] });
  }
  return out;
}

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// Kiểm 1 trường số nguyên tuỳ chọn; sai thì báo rõ để người viết JSON tự sửa.
function intField(where, obj, key, lo, hi) {
  if (obj[key] !== undefined && !isInt(obj[key], lo, hi)) throw new Error(`${where}: "${key}" phải là số nguyên ${lo}…${hi}`);
}
const NUM_MODS = { drawDelta: [-3, 3], bangBonus: [0, 5], beerHeal: [0, 3], rangeBonus: [-3, 3], turnStartDamage: [0, 3], turnStartHeal: [0, 3], turnStartDraw: [0, 3], handLimitDelta: [-3, 5], missedExtra: [0, 2] };

function validate(cfg) {
  const eff = (where, e) => {
    if (!e || !EFFECTS.has(e.type)) throw new Error(`${where}: hiệu ứng "${e && e.type}" không có. Các hiệu ứng: ${[...EFFECTS].join(', ')}`);
    for (const f of ['amount', 'n', 'damage']) intField(where, e, f, 1, 5);
    if (e.type === 'aoe' && !['bang', 'missed'].includes(e.respond)) throw new Error(`${where}: aoe cần "respond": "bang" hoặc "missed"`);
    if (e.type === 'steal' && !['take', 'discard'].includes(e.mode)) throw new Error(`${where}: steal cần "mode": "take" hoặc "discard"`);
    if (e.type === 'heal' && e.who !== undefined && e.who !== 'all' && e.who !== 'target') throw new Error(`${where}: heal.who phải là "all" hoặc "target"`);
  };
  for (const [k, c] of Object.entries(cfg.cards)) {
    const w = `Lá "${k}"`;
    if (!c.name) throw new Error(`${w} thiếu "name"`);
    if (!['action', 'equip', 'green'].includes(c.kind)) throw new Error(`${w}: kind phải là "action", "equip" hoặc "green"`);
    if (c.target !== undefined && !['other', 'self', 'any'].includes(c.target)) throw new Error(`${w}: target phải là "other", "self" hoặc "any"`);
    if (c.target === 'any' && c.kind !== 'action') throw new Error(`${w}: target "any" chỉ dùng cho lá hành động`);
    intField(w, c, 'cost', 0, 1); intField(w, c, 'reactDraw', 1, 3);
    if (c.free !== undefined && typeof c.free !== 'boolean') throw new Error(`${w}: free phải là true/false`);
    if (c.range !== undefined && c.range !== 'weapon' && c.range !== 'any' && !isInt(c.range, 1, 10)) throw new Error(`${w}: range phải là "weapon", "any" hoặc số 1…10`);
    if (c.react !== undefined && c.react !== 'bang' && c.react !== 'missed') throw new Error(`${w}: react phải là "bang" hoặc "missed"`);
    if (!Array.isArray(c.printings)) throw new Error(`${w}: cần "printings" (mảng)`);
    if (c.set !== undefined && !SETS[c.set]) throw new Error(`${w}: set "${c.set}" không có. Các bộ: ${Object.keys(SETS).join(', ')}`);
    for (const [set, list] of Object.entries(c.extra || {})) {
      if (!SETS[set] || !Array.isArray(list)) throw new Error(`${w}: extra.${set} phải là mảng printings của một bộ có thật`);
      expand(list, k);
    }
    if (c.effect !== undefined) {
      if (!Array.isArray(c.effect)) throw new Error(`${w}: effect phải là mảng`);
      c.effect.forEach((e) => eff(w, e));
      if (c.effect.some((e) => ['bang', 'duel', 'steal'].includes(e.type)) && c.target !== 'other') throw new Error(`${w}: hiệu ứng bang/duel/steal cần "target": "other"`);
      if (c.effect.filter((e) => e.type === 'steal').length > 1) throw new Error(`${w}: mỗi lá chỉ được 1 hiệu ứng steal`);
    }
    // lá xanh lá: đặt trước mặt, từ lượt sau mới dùng "use" (lượt mình) hoặc react "missed" (đỡ đòn ngoài lượt)
    if (c.kind === 'green') {
      if (c.effect !== undefined || c.equip !== undefined || c.cost !== undefined) throw new Error(`${w}: lá xanh lá dùng "use"/"react", không có effect/equip/cost`);
      if (c.react !== undefined && c.react !== 'missed') throw new Error(`${w}: lá xanh lá chỉ react "missed"`);
      if (c.use !== undefined) {
        if (!Array.isArray(c.use) || !c.use.length) throw new Error(`${w}: use phải là mảng hiệu ứng`);
        c.use.forEach((e) => eff(w, e));
        if (c.use.some((e) => ['bang', 'duel', 'steal'].includes(e.type)) && c.target !== 'other') throw new Error(`${w}: hiệu ứng bang/duel/steal cần "target": "other"`);
        if (c.use.filter((e) => e.type === 'steal').length > 1) throw new Error(`${w}: mỗi lá chỉ được 1 hiệu ứng steal`);
      }
      if (!c.use && c.react !== 'missed') throw new Error(`${w}: lá xanh lá cần "use" hoặc "react": "missed"`);
      if ((c.use || []).some((e) => e.type === 'heal' && e.who === 'target')) throw new Error(`${w}: lá xanh lá không hồi máu cho người khác`);
    } else if (c.use !== undefined) throw new Error(`${w}: "use" chỉ dành cho lá xanh lá`);
    if ((c.effect || []).some((e) => e.type === 'heal' && e.who === 'target') && c.target !== 'any' && c.target !== 'other') throw new Error(`${w}: heal who "target" cần "target": "any" hoặc "other"`);
    if (c.kind === 'equip' && (!c.equip || typeof c.equip !== 'object')) throw new Error(`${w}: thiếu "equip"`);
    if (c.equip) { intField(w, c.equip, 'weapon', 1, 10); intField(w, c.equip, 'distIn', -3, 3); intField(w, c.equip, 'distOut', -3, 3); }
    if (c.kind === 'action' && c.playable !== 'never' && !(c.effect && c.effect.length)) throw new Error(`Lá "${k}": cần "effect" hoặc "playable":"never"`);
  }
  for (const [k, c] of Object.entries(cfg.characters)) {
    if (!c.name || !isInt(c.life, 1, 10)) throw new Error(`Nhân vật "${k}" cần "name" và "life" là số nguyên 1…10`);
    if (c.set !== undefined && !SETS[c.set]) throw new Error(`Nhân vật "${k}": set "${c.set}" không có`);
    for (const a of c.abilities || []) if (!ABILITIES.has(a)) throw new Error(`Nhân vật "${k}": kỹ năng "${a}" không có. Các kỹ năng: ${[...ABILITIES].join(', ')}`);
  }
  for (const [k, e] of Object.entries(cfg.events)) {
    if (!e.name) throw new Error(`Sự kiện "${k}" thiếu "name"`);
    for (const [m, v] of Object.entries(e.mods || {})) {
      if (!MODS.has(m)) throw new Error(`Sự kiện "${k}": mod "${m}" không có. Các mod: ${[...MODS].join(', ')}`);
      if (NUM_MODS[m]) intField(`Sự kiện "${k}"`, e.mods, m, ...NUM_MODS[m]);
      else if (m === 'drawSuit') { if (!'SHDC'.includes(v) || v.length !== 1) throw new Error(`Sự kiện "${k}": drawSuit phải là S/H/D/C`); }
      else if (typeof v !== 'boolean') throw new Error(`Sự kiện "${k}": mod "${m}" phải là true/false`);
    }
  }
  for (const [n, list] of Object.entries(cfg.roles)) {
    if (!Array.isArray(list) || list.length !== +n) throw new Error(`roles["${n}"] phải là mảng đúng ${n} vai`);
    for (const r of list) if (!['sheriff', 'deputy', 'outlaw', 'renegade'].includes(r)) throw new Error(`Vai "${r}" không hợp lệ`);
    if (list.filter((r) => r === 'sheriff').length > 1) throw new Error(`roles["${n}"] chỉ được tối đa 1 sheriff`);
  }
}

const num = (v, d, lo, hi) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };

// Làm sạch settings từ client (chủ phòng gửi lên).
function sanitize(raw, base = loadBase()) {
  raw = raw && typeof raw === 'object' ? raw : {};
  const out = { rules: {}, cardCopies: {}, charactersOff: [], eventsOff: [], override: {} };
  for (const d of base.ruleDefs) {
    const v = raw.rules && raw.rules[d.key];
    if (v === undefined) continue;
    if (d.type === 'boolean') out.rules[d.key] = !!v;
    else if (d.type === 'number') out.rules[d.key] = num(v, d.value, d.min, d.max);
    else if (d.type === 'select' && d.options.some((o) => o[0] === v)) out.rules[d.key] = v;
  }
  for (const [k, v] of Object.entries(raw.cardCopies || {})) if (k in base.cards || raw.override?.cards?.[k]) out.cardCopies[k] = num(v, 1, 0, 6);
  out.charactersOff = [...new Set((raw.charactersOff || []).map(String))];
  out.eventsOff = [...new Set((raw.eventsOff || []).map(String))];
  const ov = raw.override;
  if (ov && typeof ov === 'object') {
    for (const f of ['cards', 'characters', 'events', 'roles']) if (ov[f] && typeof ov[f] === 'object') out.override[f] = ov[f];
    if (JSON.stringify(out.override).length > 60000) throw new Error('JSON ghi đè quá lớn');
  }
  return out;
}

// Trả về cấu hình đầy đủ để chạy 1 ván.
function resolve(settings = {}) {
  const base = loadBase();
  const s = sanitize(settings, base);
  const cfg = {
    cards: mergeKeyed(base.cards, s.override.cards),
    characters: mergeKeyed(base.characters, s.override.characters),
    events: mergeKeyed(base.events, s.override.events),
    roles: { ...base.roles, ...(s.override.roles || {}) },
    rules: {},
  };
  validate(cfg);
  for (const d of base.ruleDefs) cfg.rules[d.key] = s.rules[d.key] !== undefined ? s.rules[d.key] : d.value;
  const sets = Object.keys(SETS).filter((set) => cfg.rules[SETS[set]]);
  for (const f of ['cards', 'characters']) for (const [k, x] of Object.entries(cfg[f])) if (x.set && !sets.includes(x.set)) delete cfg[f][k];
  for (const k of s.charactersOff) delete cfg.characters[k];
  const eventKeys = Object.keys(cfg.events).filter((k) => !s.eventsOff.includes(k));
  cfg.eventKeys = eventKeys;
  cfg.eventsOn = !!cfg.rules.eventsOn && eventKeys.length > 0;
  cfg.bangKey = Object.keys(cfg.cards).find((k) => cfg.cards[k].react === 'bang' && (cfg.cards[k].effect || []).some((e) => e.type === 'bang'));
  if (!cfg.bangKey) throw new Error('Không có lá nào là BANG! (react:"bang" + effect bang)');
  cfg.deck = [];
  for (const [key, c] of Object.entries(cfg.cards)) {
    const copies = s.cardCopies[key] !== undefined ? s.cardCopies[key] : 1;
    const pr = [c.printings, ...sets.map((set) => (c.extra || {})[set] || [])].flatMap((list) => expand(list, key));
    for (let i = 0; i < copies; i++) for (const p of pr) cfg.deck.push({ key, suit: p.suit, rank: p.rank });
    if (cfg.deck.length > 500) throw new Error('Bộ bài quá lớn (tối đa 500 lá)');
  }
  if (cfg.deck.length < 20) throw new Error(`Bộ bài chỉ còn ${cfg.deck.length} lá, cần ít nhất 20`);
  return cfg;
}

// Dữ liệu để dựng giao diện tuỳ chỉnh trong sảnh.
function describe() {
  const base = loadBase();
  validate({ ...base, roles: base.roles });
  return {
    rules: base.ruleDefs,
    cards: Object.entries(base.cards).map(([key, c]) => ({ key, name: c.name, icon: c.icon || '🂠', kind: c.kind, desc: c.desc || '', set: c.set || null, count: expand(c.printings, key).length,
      extra: Object.fromEntries(Object.entries(c.extra || {}).map(([set, list]) => [set, expand(list, key).length])) })),
    characters: Object.entries(base.characters).map(([key, c]) => ({ key, name: c.name, icon: c.icon || '🙂', life: c.life, desc: c.desc || '', set: c.set || null })),
    sets: SETS,
    events: Object.entries(base.events).map(([key, e]) => ({ key, name: e.name, icon: e.icon || '🎴', desc: e.desc || '' })),
    presets: base.presets,
    abilities: [...ABILITIES], effects: [...EFFECTS], mods: [...MODS],
    maxPlayers: Math.max(...Object.keys(base.roles).map(Number)),
    minPlayers: Math.min(...Object.keys(base.roles).map(Number)),
  };
}

module.exports = { resolve, describe, sanitize, RANKS };
