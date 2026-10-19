'use strict';
// Nạp cấu hình: config/*.json (mặc định) <- custom/*.json (của bạn) <- settings.override (theo từng phòng).
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'config');
const CUSTOM = path.join(__dirname, 'custom');
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const EFFECTS = new Set(['bang', 'heal', 'draw', 'steal', 'aoe', 'duel', 'store']);
const ABILITIES = new Set(['bart', 'blackjack', 'janet', 'gringo', 'jesse', 'jourdonnais', 'kit', 'lucky', 'paul', 'pedro', 'rose', 'sid', 'slab', 'suzy', 'vulture', 'willy']);
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
    if (v === null) delete out[k];
    else if (typeof v === 'object') out[k] = { ...(out[k] || {}), ...v };
  }
  return out;
}

function loadBase() {
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
    for (let r = i; r <= j; r++) for (let t = 0; t < (+m[4] || 1); t++) out.push({ suit: m[1], rank: RANKS[r] });
  }
  return out;
}

function validate(cfg) {
  const eff = (where, e) => {
    if (!e || !EFFECTS.has(e.type)) throw new Error(`${where}: hiệu ứng "${e && e.type}" không có. Các hiệu ứng: ${[...EFFECTS].join(', ')}`);
  };
  for (const [k, c] of Object.entries(cfg.cards)) {
    if (!c.name) throw new Error(`Lá "${k}" thiếu "name"`);
    if (c.kind !== 'action' && c.kind !== 'equip') throw new Error(`Lá "${k}": kind phải là "action" hoặc "equip"`);
    if (c.effect !== undefined) {
      if (!Array.isArray(c.effect)) throw new Error(`Lá "${k}": effect phải là mảng`);
      c.effect.forEach((e) => eff(`Lá "${k}"`, e));
    }
    if (c.kind === 'equip' && !c.equip) throw new Error(`Lá "${k}": thiếu "equip"`);
    if (c.kind === 'action' && c.playable !== 'never' && !(c.effect && c.effect.length)) throw new Error(`Lá "${k}": cần "effect" hoặc "playable":"never"`);
  }
  for (const [k, c] of Object.entries(cfg.characters)) {
    if (!c.name || !(c.life > 0)) throw new Error(`Nhân vật "${k}" cần "name" và "life" > 0`);
    for (const a of c.abilities || []) if (!ABILITIES.has(a)) throw new Error(`Nhân vật "${k}": kỹ năng "${a}" không có. Các kỹ năng: ${[...ABILITIES].join(', ')}`);
  }
  for (const [k, e] of Object.entries(cfg.events)) {
    if (!e.name) throw new Error(`Sự kiện "${k}" thiếu "name"`);
    for (const m of Object.keys(e.mods || {})) if (!MODS.has(m)) throw new Error(`Sự kiện "${k}": mod "${m}" không có. Các mod: ${[...MODS].join(', ')}`);
  }
  for (const [n, list] of Object.entries(cfg.roles)) {
    if (!Array.isArray(list) || list.length !== +n) throw new Error(`roles["${n}"] phải là mảng đúng ${n} vai`);
    for (const r of list) if (!['sheriff', 'deputy', 'outlaw', 'renegade'].includes(r)) throw new Error(`Vai "${r}" không hợp lệ`);
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
  for (const k of s.charactersOff) delete cfg.characters[k];
  const eventKeys = Object.keys(cfg.events).filter((k) => !s.eventsOff.includes(k));
  cfg.eventKeys = eventKeys;
  cfg.eventsOn = !!cfg.rules.eventsOn && eventKeys.length > 0;
  cfg.bangKey = Object.keys(cfg.cards).find((k) => cfg.cards[k].react === 'bang' && (cfg.cards[k].effect || []).some((e) => e.type === 'bang'));
  if (!cfg.bangKey) throw new Error('Không có lá nào là BANG! (react:"bang" + effect bang)');
  cfg.deck = [];
  for (const [key, c] of Object.entries(cfg.cards)) {
    const copies = s.cardCopies[key] !== undefined ? s.cardCopies[key] : 1;
    const pr = expand(c.printings, key);
    for (let i = 0; i < copies; i++) for (const p of pr) cfg.deck.push({ key, suit: p.suit, rank: p.rank });
  }
  return cfg;
}

// Dữ liệu để dựng giao diện tuỳ chỉnh trong sảnh.
function describe() {
  const base = loadBase();
  validate({ ...base, roles: base.roles });
  return {
    rules: base.ruleDefs,
    cards: Object.entries(base.cards).map(([key, c]) => ({ key, name: c.name, icon: c.icon || '🂠', kind: c.kind, desc: c.desc || '', count: expand(c.printings, key).length })),
    characters: Object.entries(base.characters).map(([key, c]) => ({ key, name: c.name, icon: c.icon || '🙂', life: c.life, desc: c.desc || '' })),
    events: Object.entries(base.events).map(([key, e]) => ({ key, name: e.name, icon: e.icon || '🎴', desc: e.desc || '' })),
    presets: base.presets,
    abilities: [...ABILITIES], effects: [...EFFECTS], mods: [...MODS],
    maxPlayers: Math.max(...Object.keys(base.roles).map(Number)),
    minPlayers: Math.min(...Object.keys(base.roles).map(Number)),
  };
}

module.exports = { resolve, describe, sanitize, RANKS };
