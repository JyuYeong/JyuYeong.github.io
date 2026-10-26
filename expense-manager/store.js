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

// ---------- 카드 실적 ----------
// 그 달(YYYY-MM)의 지불방식별 실적 금액 (실적 제외 지출은 뺀다)
export function perfOf(doc, ym) {
  const sum = {};
  for (const e of live(doc.expenses)) if (e.date?.startsWith(ym) && !e.perf_excluded) sum[e.method_id] = (sum[e.method_id] || 0) + e.amount;
  return sum;
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
