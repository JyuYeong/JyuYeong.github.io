// 데이터 모델 + IndexedDB 저장 (M1: 이 기기에만 저장, 평문)
const DB_NAME = 'expense-manager';
const STORE = 'kv';
const KEY = 'doc';
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
export const SCHEMA_VERSION = 1;
export const PURGE_DAYS = 180;

// ---------- 공통 ----------
export const nowIso = () => new Date().toISOString();
function randId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return prefix + Array.from(bytes, b => ID_CHARS[b % ID_CHARS.length]).join('');
}
export function uniqueId(prefix, arr) {
  const used = new Set((arr || []).map(x => x.id));
  let id;
  do { id = randId(prefix); } while (used.has(id));
  return id;
}
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export const cmpText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
export const live = arr => (arr || []).filter(x => !x.deleted_at);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || cmpText(a.name, b.name);

export function emptyDoc() {
  return { schema_version: SCHEMA_VERSION, updated_at: nowIso(), expenses: [], methods: [], categories: [], templates: [], themes: [], fixed: [], ticker: [], settings: [] };
}
// 빠진 배열을 채운다 (모르는 키는 그대로 둔다)
export function normalizeDoc(d) {
  const base = emptyDoc();
  for (const k of Object.keys(base)) if (Array.isArray(base[k]) && !Array.isArray(d[k])) d[k] = [];
  d.schema_version = Math.max(d.schema_version || 1, SCHEMA_VERSION);
  return d;
}

// ---------- 날짜 (KST) ----------
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function todayKst(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}
export const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
export function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dowOf = s => DOW[new Date(s + 'T00:00:00Z').getUTCDay()];
// 2026-10-26 → 2026.10.26.월
export const fmtDate = s => (isDate(s) ? `${s.replace(/-/g, '.')}.${dowOf(s)}` : '');
// 10.26.월 (같은 해일 때 짧게)
export const fmtDateShort = s => (isDate(s) ? `${s.slice(5).replace('-', '.')}.${dowOf(s)}` : '');

// ---------- 금액 ----------
export const fmtWon = n => (Number.isFinite(n) ? Math.round(n).toLocaleString('ko-KR') : '');
// 숫자 외 문자를 빼고 정수로 (빈 값은 null)
export function parseWon(s) {
  const digits = String(s ?? '').replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return null;
  return Math.min(Number(digits), 9_999_999_999);
}
// 입력 칸 자동 콤마: 문자열과 커서 위치(숫자 기준)를 받아 새 문자열과 커서 위치를 돌려준다
export function formatAmountInput(value, caret) {
  const digitsBefore = String(value).slice(0, caret).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').length;
  const n = parseWon(value);
  const out = n === null ? '' : fmtWon(n);
  let pos = 0, seen = 0;
  while (pos < out.length && seen < digitsBefore) { if (/\d/.test(out[pos])) seen++; pos++; }
  return { text: out, caret: pos };
}

// ---------- 지불방식 ----------
export const methodsOf = (doc, { archived = false } = {}) => live(doc.methods).filter(m => archived || !m.archived).sort(byOrder);
export function addMethod(doc, name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return { error: '이름을 입력하세요' };
  if (live(doc.methods).some(m => m.name.toLowerCase() === name.toLowerCase())) return { error: '같은 이름의 지불방식이 있습니다' };
  const ts = nowIso();
  const order = Math.max(-1, ...live(doc.methods).map(m => m.order ?? 0)) + 1;
  const m = { id: uniqueId('M-', doc.methods), name, order, archived: false, perf_target: null, created_at: ts, updated_at: ts, deleted_at: null };
  doc.methods.push(m);
  return { item: m };
}

// ---------- 카테고리 (2단계) ----------
export const cat1sOf = (doc, { archived = false } = {}) => live(doc.categories).filter(c => !c.parent_id && (archived || !c.archived)).sort(byOrder);
export const cat2sOf = (doc, parentId, { archived = false } = {}) => live(doc.categories).filter(c => c.parent_id === parentId && (archived || !c.archived)).sort(byOrder);
export function addCategory(doc, name, parentId = null) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return { error: '이름을 입력하세요' };
  if (parentId && !live(doc.categories).some(c => c.id === parentId && !c.parent_id)) return { error: '상위 카테고리가 없습니다' };
  const sib = live(doc.categories).filter(c => (c.parent_id || null) === parentId);
  if (sib.some(c => c.name.toLowerCase() === name.toLowerCase())) return { error: '같은 이름의 카테고리가 있습니다' };
  const ts = nowIso();
  const order = Math.max(-1, ...sib.map(c => c.order ?? 0)) + 1;
  const c = { id: uniqueId('C-', doc.categories), name, parent_id: parentId, order, archived: false, created_at: ts, updated_at: ts, deleted_at: null };
  doc.categories.push(c);
  return { item: c };
}
export function renameItem(doc, kind, item, name) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return { error: '이름을 입력하세요' };
  const pool = kind === 'method' ? live(doc.methods) : live(doc.categories).filter(c => (c.parent_id || null) === (item.parent_id || null));
  if (pool.some(x => x.id !== item.id && x.name.toLowerCase() === name.toLowerCase())) return { error: '같은 이름이 있습니다' };
  item.name = name; item.updated_at = nowIso();
  return { item };
}
// 같은 단계 안에서 순서를 한 칸 옮긴다 (dir: -1 위, +1 아래)
export function moveItem(list, item, dir) {
  const i = list.indexOf(item), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const ts = nowIso();
  list.forEach((x, k) => { if (x.order !== k) { x.order = k; x.updated_at = ts; } });
  [list[i].order, list[j].order] = [j, i];
  list[i].updated_at = ts; list[j].updated_at = ts;
  return true;
}
// 지출에서 쓰는 개수
export function usageCount(doc, kind, id) {
  const ex = live(doc.expenses);
  if (kind === 'method') return ex.filter(e => e.method_id === id).length;
  return ex.filter(e => e.cat1_id === id || e.cat2_id === id).length;
}
// 삭제: 쓰고 있으면 거부 (보관을 쓰게 함). 1단계는 2단계까지 함께 지운다
export function deleteItem(doc, kind, item) {
  if (usageCount(doc, kind, item.id)) return { error: '지출에서 쓰고 있어 지울 수 없습니다. 대신 보관하세요' };
  const ts = nowIso();
  item.deleted_at = ts; item.updated_at = ts;
  if (kind === 'category' && !item.parent_id) for (const c of live(doc.categories)) if (c.parent_id === item.id) { c.deleted_at = ts; c.updated_at = ts; }
  return { ok: true };
}

// ---------- 지출 ----------
export const normPayee = s => String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, '');
export function validateExpense(doc, f) {
  if (!isDate(f.date)) return { error: '날짜를 확인하세요', field: 'date' };
  if (!Number.isInteger(f.amount) || f.amount <= 0) return { error: '금액을 입력하세요', field: 'amount' };
  if (!String(f.payee || '').trim()) return { error: '지불처를 입력하세요', field: 'payee' };
  if (!f.method_id || !live(doc.methods).some(m => m.id === f.method_id)) return { error: '지불방식을 고르세요', field: 'method' };
  const c1 = live(doc.categories).find(c => c.id === f.cat1_id && !c.parent_id);
  if (!c1) return { error: '카테고리를 고르세요', field: 'cat1' };
  const subs = cat2sOf(doc, c1.id, { archived: true });
  if (f.cat2_id) {
    if (!subs.some(c => c.id === f.cat2_id)) return { error: '하위 카테고리를 다시 고르세요', field: 'cat2' };
  } else if (cat2sOf(doc, c1.id).length) return { error: '하위 카테고리를 고르세요', field: 'cat2' };
  if (f.theme_id && !live(doc.themes).some(t => t.id === f.theme_id)) return { error: '테마를 다시 고르세요', field: 'theme' };
  return null;
}
const EXP_FIELDS = ['date', 'amount', 'payee', 'method_id', 'cat1_id', 'cat2_id', 'memo', 'perf_excluded', 'theme_id', 'fixed_id'];
function cleanFields(f) {
  return {
    date: f.date, amount: f.amount, payee: String(f.payee).trim().slice(0, 60),
    method_id: f.method_id, cat1_id: f.cat1_id, cat2_id: f.cat2_id || null,
    memo: String(f.memo || '').trim().slice(0, 200), perf_excluded: !!f.perf_excluded,
    theme_id: f.theme_id || null, fixed_id: f.fixed_id || null,
  };
}
export function saveExpense(doc, f, id = null) {
  const err = validateExpense(doc, f);
  if (err) return err;
  const ts = nowIso();
  const fields = cleanFields(f);
  let e = id ? live(doc.expenses).find(x => x.id === id) : null;
  if (e) {
    if (EXP_FIELDS.some(k => (e[k] ?? null) !== (fields[k] ?? null))) Object.assign(e, fields, { updated_at: ts });
  } else {
    e = { id: uniqueId('E-', doc.expenses), ...fields, created_at: ts, updated_at: ts, deleted_at: null };
    doc.expenses.push(e);
  }
  return { item: e };
}
export function deleteExpense(doc, e) {
  const ts = nowIso();
  e.deleted_at = ts; e.updated_at = ts;
}
// 최근 입력 순 (입력 시각 기준)
export const recentExpenses = (doc, n = 30) => live(doc.expenses).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, n);

// 지불처 목록: 같은 지불처(공백·대소문자 무시)를 묶어 횟수·마지막 사용·가장 최근 지출을 모은다
export function payeeIndex(doc) {
  const map = new Map();
  for (const e of live(doc.expenses)) {
    const k = normPayee(e.payee);
    if (!k) continue;
    const key = (e.date || '') + (e.created_at || '');
    const cur = map.get(k);
    if (!cur) map.set(k, { name: e.payee, count: 1, lastKey: key, last: e });
    else {
      cur.count++;
      if (key > cur.lastKey) { cur.lastKey = key; cur.last = e; cur.name = e.payee; }
    }
  }
  return [...map.values()];
}
export function lastForPayee(doc, payee) {
  const k = normPayee(payee);
  if (!k) return null;
  return payeeIndex(doc).find(p => normPayee(p.name) === k)?.last || null;
}

// ---------- 지불처 추천 (포함 일치 + 한글 초성) ----------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CHO_SET = new Set([...CHO]);
const norm = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s\-_.]+/g, '');
export function chosung(s) {
  let out = '';
  for (const ch of norm(s)) {
    const c = ch.charCodeAt(0);
    out += c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch;
  }
  return out;
}
const isCho = t => t.length > 0 && [...t].every(ch => CHO_SET.has(ch));
export function suggestPayees(doc, q, limit = 8) {
  const t = norm(q);
  if (!t) return [];
  const cho = isCho(t);
  const out = [];
  for (const p of payeeIndex(doc)) {
    const n = norm(p.name);
    let s = -1;
    if (n === t) s = 0;
    else if (n.startsWith(t)) s = 1;
    else if (n.includes(t)) s = 2;
    else if (cho && chosung(p.name).startsWith(t)) s = 1;
    else if (cho && chosung(p.name).includes(t)) s = 2;
    if (s >= 0) out.push({ ...p, s });
  }
  out.sort((a, b) => a.s - b.s || b.count - a.count || b.lastKey.localeCompare(a.lastKey));
  return out.slice(0, limit);
}

// ---------- 내역 필터 (M2) ----------
// q: { ym: 'YYYY-MM' | null, themeId: null | 'none' | 'TH-..', method: '' | id, cat: '' | 카테고리 id(1·2단계), text: '' }
export function filterExpenses(doc, q = {}) {
  const t = String(q.text || '').trim().toLowerCase();
  const tc = t && /^[ㄱ-ㅎ]+$/.test(t);
  return live(doc.expenses).filter(e => {
    if (q.ym && !e.date.startsWith(q.ym)) return false;
    if (q.themeId === 'none' ? e.theme_id : q.themeId && e.theme_id !== q.themeId) return false;
    if (q.method && e.method_id !== q.method) return false;
    if (q.cat && e.cat1_id !== q.cat && e.cat2_id !== q.cat) return false;
    if (t) {
      const hay = `${e.payee} ${e.memo || ''}`.toLowerCase();
      if (!hay.includes(t) && !(tc && chosung(e.payee).includes(t))) return false;
    }
    return true;
  });
}
// 날짜 → 입력 순 (dir: 'desc' 최근 먼저)
export function sortExpenses(list, dir = 'desc') {
  const k = e => `${e.date}|${e.created_at || ''}`;
  return list.sort((a, b) => (dir === 'asc' ? k(a).localeCompare(k(b)) : k(b).localeCompare(k(a))));
}
export const sumOf = list => list.reduce((s, e) => s + e.amount, 0);
export const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

// ---------- 테마 (M2) ----------
// 기간이 있는 지출 묶음. 지출당 0~1개
export const themesOf = doc => live(doc.themes).sort((a, b) => b.start.localeCompare(a.start) || (b.created_at || '').localeCompare(a.created_at || ''));
// 그 날짜를 포함하는 테마들 (최근에 시작한 것 먼저)
export const themesForDate = (doc, date) => themesOf(doc).filter(t => t.start <= date && date <= t.end);
export const themeForDate = (doc, date) => themesForDate(doc, date)[0] || null;
// 날짜와 테마 기간 사이의 일수 (기간 안이면 0)
export function themeDistance(t, date) {
  const day = s => Date.parse(s + 'T00:00:00Z') / 86400000;
  return date < t.start ? day(t.start) - day(date) : date > t.end ? day(date) - day(t.end) : 0;
}
// 입력할 때 칩으로 보여 줄 테마: 기간 안 → 가까운 순. 기간 밖은 days일 안의 것만 (여행 준비물처럼 기간 앞뒤 지출용)
export function themesNear(doc, date, days = 45, max = 6) {
  return themesOf(doc).map(t => ({ t, d: themeDistance(t, date) })).filter(x => x.d <= days)
    .sort((a, b) => a.d - b.d || b.t.start.localeCompare(a.t.start)).slice(0, max).map(x => x.t);
}
export function themeError(doc, f, id = null) {
  const name = String(f.name || '').trim();
  if (!name) return '테마 이름을 입력하세요';
  if (!isDate(f.start) || !isDate(f.end)) return '시작일과 종료일을 고르세요';
  if (f.start > f.end) return '종료일이 시작일보다 빠릅니다';
  if (live(doc.themes).some(t => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) return '같은 이름의 테마가 있습니다';
  return null;
}
export function saveTheme(doc, f, id = null) {
  const err = themeError(doc, f, id);
  if (err) return { error: err };
  const ts = nowIso();
  const fields = { name: String(f.name).trim().slice(0, 40), start: f.start, end: f.end, memo: String(f.memo || '').trim().slice(0, 200) };
  let t = id ? live(doc.themes).find(x => x.id === id) : null;
  if (t) Object.assign(t, fields, { updated_at: ts });
  else { t = { id: uniqueId('TH-', doc.themes), ...fields, created_at: ts, updated_at: ts, deleted_at: null }; doc.themes.push(t); }
  return { item: t };
}
// 테마 기간 안에서 아직 테마가 없는 지출
export const unthemedInRange = (doc, t) => live(doc.expenses).filter(e => !e.theme_id && e.date >= t.start && e.date <= t.end);
export function attachTheme(doc, t, list) {
  const ts = nowIso();
  for (const e of list) { e.theme_id = t.id; e.updated_at = ts; }
  return list.length;
}
// 삭제: 붙어 있던 지출에서 떼어 낸다. 떼어 낸 수를 돌려준다
export function deleteTheme(doc, t) {
  const ts = nowIso();
  t.deleted_at = ts; t.updated_at = ts;
  let n = 0;
  for (const e of doc.expenses) if (e.theme_id === t.id) { e.theme_id = null; e.updated_at = ts; n++; }
  return n;
}
// 카테고리별 합계: [{ c1, total, subs: [{ c2, total }] }] (금액 큰 순)
export function catTotals(doc, list) {
  const m = new Map();
  for (const e of list) {
    const g = m.get(e.cat1_id) || { id: e.cat1_id, total: 0, subs: new Map() };
    g.total += e.amount;
    const k = e.cat2_id || '';
    g.subs.set(k, (g.subs.get(k) || 0) + e.amount);
    m.set(e.cat1_id, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).map(g => ({ id: g.id, total: g.total, subs: [...g.subs].map(([id, total]) => ({ id: id || null, total })).sort((a, b) => b.total - a.total) }));
}

// ---------- 템플릿 (M2) ----------
// 자주 쓰는 지출. 날짜는 쓰는 날 정하므로 담지 않는다. 금액은 비워 둘 수 있다
export const templatesOf = doc => live(doc.templates).sort(byOrder);
export function templateError(doc, f, id = null) {
  const name = String(f.name || '').trim();
  if (!name) return '템플릿 이름을 입력하세요';
  if (live(doc.templates).some(t => t.id !== id && t.name.toLowerCase() === name.toLowerCase())) return '같은 이름의 템플릿이 있습니다';
  if (!f.payee?.trim() && !f.amount && !f.method_id && !f.cat1_id) return '금액·지불처·지불방식·카테고리 중 하나는 있어야 합니다';
  return null;
}
export function saveTemplate(doc, f, id = null) {
  const err = templateError(doc, f, id);
  if (err) return { error: err };
  const ts = nowIso();
  const fields = { name: String(f.name).trim().slice(0, 30), amount: Number.isInteger(f.amount) && f.amount > 0 ? f.amount : null, payee: String(f.payee || '').trim().slice(0, 60),
    method_id: f.method_id || null, cat1_id: f.cat1_id || null, cat2_id: f.cat1_id ? f.cat2_id || null : null, memo: String(f.memo || '').trim().slice(0, 200) };
  let t = id ? live(doc.templates).find(x => x.id === id) : null;
  if (t) Object.assign(t, fields, { updated_at: ts });
  else {
    const order = Math.max(-1, ...live(doc.templates).map(x => x.order ?? 0)) + 1;
    t = { id: uniqueId('TP-', doc.templates), ...fields, order, created_at: ts, updated_at: ts, deleted_at: null };
    doc.templates.push(t);
  }
  return { item: t };
}
export function deleteSoft(item) { const ts = nowIso(); item.deleted_at = ts; item.updated_at = ts; }

// ---------- 통계 (M4) ----------
// 기간: 'r6' 최근 6개월, 'r12' 최근 12개월, 'YYYY' 그 해 1~12월 (올해는 이번 달까지)
export function monthsOf(period, today = todayKst()) {
  const cur = today.slice(0, 7);
  if (/^\d{4}$/.test(period)) {
    const last = period === cur.slice(0, 4) ? Number(cur.slice(5)) : 12;
    return Array.from({ length: last }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
  }
  const n = period === 'r12' ? 12 : 6;
  return Array.from({ length: n }, (_, i) => ymAdd(cur, i - n + 1));
}
export const yearsWithData = doc => [...new Set(live(doc.expenses).map(e => e.date.slice(0, 4)))].sort().reverse();
// 월별 합계 표. dim: 'method' | 'cat'. 행: { id, name, archived, by: {ym: 금액}, total, children? }
export function pivot(doc, months, dim) {
  const set = new Set(months);
  const ex = live(doc.expenses).filter(e => set.has(e.date.slice(0, 7)));
  const add = (row, e) => { const ym = e.date.slice(0, 7); row.by[ym] = (row.by[ym] || 0) + e.amount; row.total += e.amount; row.count++; };
  const mk = (id, name, archived = false) => ({ id, name, archived, by: {}, total: 0, count: 0 });
  let rows;
  if (dim === 'method') {
    const map = new Map(methodsOf(doc, { archived: true }).map(m => [m.id, mk(m.id, m.name, m.archived)]));
    for (const e of ex) { if (!map.has(e.method_id)) map.set(e.method_id, mk(e.method_id, '(삭제된 지불방식)')); add(map.get(e.method_id), e); }
    rows = [...map.values()];
  } else {
    const map = new Map(cat1sOf(doc, { archived: true }).map(c => {
      const r = mk(c.id, c.name, c.archived);
      r.children = new Map(cat2sOf(doc, c.id, { archived: true }).map(c2 => [c2.id, mk(c2.id, c2.name, c2.archived)]));
      return [c.id, r];
    }));
    for (const e of ex) {
      if (!map.has(e.cat1_id)) map.set(e.cat1_id, Object.assign(mk(e.cat1_id, '(삭제된 카테고리)'), { children: new Map() }));
      const r = map.get(e.cat1_id);
      add(r, e);
      const k = e.cat2_id || '';
      if (!r.children.has(k)) r.children.set(k, mk(k || `${e.cat1_id}:none`, k ? '(삭제된 카테고리)' : '(하위 없음)'));
      add(r.children.get(k), e);
    }
    rows = [...map.values()].map(r => ({ ...r, children: [...r.children.values()].filter(c => c.total || !c.archived) }));
  }
  // 보관했고 이 기간에 쓰지 않은 행은 뺀다
  rows = rows.filter(r => r.total || !r.archived);
  const totals = mk('total', '합계');
  for (const e of ex) add(totals, e);
  return { rows, totals, months };
}

// ---------- 카드 실적 ----------
// 그 달(YYYY-MM)의 지불방식별 실적 금액 (실적 제외 지출은 뺀다)
export function perfOf(doc, ym) {
  const sum = {};
  for (const e of live(doc.expenses)) if (e.date?.startsWith(ym) && !e.perf_excluded) sum[e.method_id] = (sum[e.method_id] || 0) + e.amount;
  return sum;
}

// 실적 현황: 목표가 있는 지불방식마다 { m, actual, target, pct, remain }
export function perfStatus(doc, ym) {
  const sum = perfOf(doc, ym);
  return methodsOf(doc, { archived: true }).filter(m => m.perf_target > 0 && (!m.archived || sum[m.id]))
    .map(m => { const actual = sum[m.id] || 0; return { m, actual, target: m.perf_target, pct: Math.min(999, Math.round(actual / m.perf_target * 100)), remain: Math.max(0, m.perf_target - actual) }; });
}

// ---------- 고정 지출 (M4) ----------
// 매달 나가는 지출. 입력 여부는 그 달에 fixed_id가 같은 지출이 있는지로 판단한다. skips: 건너뛴 달 ['YYYY-MM']
export const fixedOf = (doc, { all = true } = {}) => live(doc.fixed).filter(f => all || f.active !== false).sort((a, b) => (a.day - b.day) || (a.order ?? 0) - (b.order ?? 0) || cmpText(a.name, b.name));
const daysIn = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5), 0)).getUTCDate();
export const fixedDate = (f, ym) => `${ym}-${String(Math.min(f.day, daysIn(ym))).padStart(2, '0')}`;
export function fixedError(doc, f, id = null) {
  const name = String(f.name || '').trim();
  if (!name) return '이름을 입력하세요';
  if (!(Number.isInteger(f.day) && f.day >= 1 && f.day <= 31)) return '결제일(1~31)을 고르세요';
  if (live(doc.fixed).some(x => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return '같은 이름의 고정 지출이 있습니다';
  return null;
}
export function saveFixed(doc, f, id = null) {
  const err = fixedError(doc, f, id);
  if (err) return { error: err };
  const ts = nowIso();
  const fields = { name: String(f.name).trim().slice(0, 30), day: f.day, amount: Number.isInteger(f.amount) && f.amount > 0 ? f.amount : null, payee: String(f.payee || '').trim().slice(0, 60),
    method_id: f.method_id || null, cat1_id: f.cat1_id || null, cat2_id: f.cat1_id ? f.cat2_id || null : null, memo: String(f.memo || '').trim().slice(0, 200), active: f.active !== false };
  let x = id ? live(doc.fixed).find(y => y.id === id) : null;
  if (x) Object.assign(x, fields, { updated_at: ts });
  else { x = { id: uniqueId('F-', doc.fixed), ...fields, skips: [], order: 0, created_at: ts, updated_at: ts, deleted_at: null }; doc.fixed.push(x); }
  return { item: x };
}
// 그 달의 고정 지출 현황: [{ f, date, entry(지출|null), skipped, state: 'done'|'skip'|'overdue'|'due'|'later' }]
export function fixedStatus(doc, ym, today = todayKst()) {
  const ex = live(doc.expenses).filter(e => e.fixed_id && e.date.startsWith(ym));
  return fixedOf(doc, { all: false }).map(f => {
    const date = fixedDate(f, ym);
    const entry = ex.find(e => e.fixed_id === f.id) || null;
    const skipped = (f.skips || []).includes(ym);
    const state = entry ? 'done' : skipped ? 'skip' : date < today ? 'overdue' : date === today ? 'due' : 'later';
    return { f, date, entry, skipped, state };
  });
}
export function toggleSkip(f, ym) {
  const s = new Set(f.skips || []);
  if (s.has(ym)) s.delete(ym); else s.add(ym);
  f.skips = [...s].sort(); f.updated_at = nowIso();
}
// 고정 지출을 지울 때 지출의 fixed_id는 남겨도 되지만, 내역에서 헷갈리지 않게 떼어 낸다
export function deleteFixed(doc, f) {
  const ts = nowIso();
  f.deleted_at = ts; f.updated_at = ts;
  let n = 0;
  for (const e of doc.expenses) if (e.fixed_id === f.id) { e.fixed_id = null; e.updated_at = ts; n++; }
  return n;
}

// ---------- 티커 (M4, Task Manager와 같은 방식) ----------
export const TICKER_COLORS = { normal: '일반', caution: '주의', must: '필독' };
export const TICKER_LEVELS = { normal: '보통', strong: '강조', urgent: '긴급' };
export const tickerLevel = k => (TICKER_LEVELS[k?.level] ? k.level : 'normal');
const TK_ID = 'S-ticker';
const TK_DEFAULT = { id: TK_ID, color: 'normal', position: 'top', auto_fixed: true, auto_perf: true, perf_day: 20, updated_at: '', deleted_at: null };
export function nowKst(now = new Date()) { const k = new Date(now.getTime() + 9 * 3600e3).toISOString(); return { date: k.slice(0, 10), time: k.slice(11, 16) }; }
export function tickerSettings(doc) { return { ...TK_DEFAULT, ...live(doc.settings).find(x => x.id === TK_ID) }; }
export function setTickerSettings(doc, patch) {
  let s = (doc.settings || []).find(x => x.id === TK_ID);
  if (!s) { s = { ...TK_DEFAULT, created_at: nowIso() }; doc.settings.push(s); }
  Object.assign(s, patch, { updated_at: nowIso(), deleted_at: null });
  return s;
}
export function createTicker(doc, text) {
  text = String(text || '').trim().slice(0, 120);
  if (!text) return null;
  const ts = nowIso();
  const k = { id: uniqueId('K-', doc.ticker), text, enabled: true, level: 'normal', expire_date: null, daily_from: null, daily_to: null, created_at: ts, updated_at: ts, deleted_at: null };
  doc.ticker.push(k);
  return k;
}
// 매일 시간대: from<to 이면 그 사이, from>to 이면 자정을 넘김, 같거나 비면 종일
export function inDailyWindow(time, from, to) {
  if (!from || !to || from === to) return true;
  return from < to ? time >= from && time < to : time >= from || time < to;
}
// 'expired' | 'off' | 'outside' | 'on'
export function tickerState(k, now = nowKst()) {
  if (k.expire_date && now.date > k.expire_date) return 'expired';
  if (!k.enabled) return 'off';
  if (!inDailyWindow(now.time, k.daily_from, k.daily_to)) return 'outside';
  return 'on';
}
// 자동 문구: 결제일이 지났는데 입력하지 않은 고정 지출, 실적 알림 시작일부터 목표에 못 미친 카드
export function autoTicker(doc, now = nowKst()) {
  const set = tickerSettings(doc), out = [];
  const ym = now.date.slice(0, 7), mm = Number(ym.slice(5));
  if (set.auto_fixed) for (const x of fixedStatus(doc, ym, now.date)) {
    if (x.state === 'overdue' || x.state === 'due') out.push({ id: `auto-f-${x.f.id}`, auto: true, level: x.state === 'overdue' ? 'strong' : 'normal', text: `고정 지출 미입력: ${x.f.name}${x.f.amount ? ` ${fmtWon(x.f.amount)}원` : ''} (${Number(x.date.slice(8))}일${x.state === 'due' ? ', 오늘' : ''})` });
  }
  if (set.auto_perf && Number(now.date.slice(8)) >= (set.perf_day || 20)) for (const p of perfStatus(doc, ym)) {
    if (p.remain > 0 && !p.m.archived) out.push({ id: `auto-p-${p.m.id}`, auto: true, level: 'strong', text: `${p.m.name} ${mm}월 실적 ${fmtWon(p.remain)}원 남음 (${p.pct}%)` });
  }
  return out;
}

// ---------- 설정 ----------
export const setting = (doc, id) => live(doc.settings).find(s => s.id === id) || null;
export function putSetting(doc, id, value) {
  const ts = nowIso();
  let s = (doc.settings || []).find(x => x.id === id);
  if (s) Object.assign(s, value, { updated_at: ts, deleted_at: null });
  else { s = { id, ...value, created_at: ts, updated_at: ts, deleted_at: null }; doc.settings.push(s); }
  return s;
}

// ---------- PIN (해시만 저장) ----------
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const PIN_ITER = 200000;
async function pinHash(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64(new Uint8Array(bits));
}
export async function makePin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { alg: 'PBKDF2-SHA256', iterations: PIN_ITER, salt: b64(salt), hash: await pinHash(pin, salt, PIN_ITER) };
}
export async function checkPin(rec, pin) {
  if (!rec?.hash) return false;
  const h = await pinHash(pin, unb64(rec.salt), rec.iterations || PIN_ITER);
  return h === rec.hash;
}

// ---------- 정리 ----------
export function purgeOld(doc, now = Date.now()) {
  const limit = now - PURGE_DAYS * 86400000;
  for (const k of Object.keys(doc)) if (Array.isArray(doc[k])) doc[k] = doc[k].filter(x => !x?.deleted_at || Date.parse(x.deleted_at) > limit);
}

// ---------- 가져오기 검사 ----------
export function checkImport(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.expenses) || !Array.isArray(obj.methods) || !Array.isArray(obj.categories)) return 'Expense Manager 내보내기 파일이 아닙니다';
  return null;
}

// ---------- IndexedDB ----------
let mem = null;
export let storageOk = true;
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  }));
}
export async function load() {
  try {
    const d = await tx('readonly', s => s.get(KEY));
    if (d && Array.isArray(d.expenses)) return normalizeDoc(d);
  } catch { storageOk = false; }
  return mem || emptyDoc();
}
export async function save(doc) {
  doc.updated_at = nowIso();
  mem = doc;
  try { await tx('readwrite', s => s.put(JSON.parse(JSON.stringify(doc)), KEY)); storageOk = true; }
  catch { storageOk = false; }
  return storageOk;
}
// 이 기기 데이터 지우기 (설정의 "이 기기 데이터 지우기"에서만 쓴다)
export async function clearAll() {
  mem = null;
  try { await tx('readwrite', s => s.delete(KEY)); } catch { /* 무시 */ }
}
