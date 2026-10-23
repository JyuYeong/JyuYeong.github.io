// 데이터 모델 + IndexedDB 저장 + 날짜 유틸 (M1: 이 기기에만 저장)
const DB_NAME = 'task-manager';
const STORE = 'kv';
const KEY = 'doc';
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
const PALETTE = ['#4F7CAC', '#B5651D', '#5E8C61', '#8A5FB0', '#C2547A', '#3E8E8E', '#A38B2D', '#7A7F8C'];
const URGENCY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

export const SCHEMA_VERSION = 1;
export let storageOk = true; // IndexedDB를 쓸 수 없으면 false (메모리에만 보관)

// ---------- 날짜 (KST 문자열) ----------
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function nowKST() {
  const d = new Date();
  return { date: dateFmt.format(d), time: timeFmt.format(d) };
}
export const todayKST = () => nowKST().date;

export function dayDiff(from, to) { // to - from (일)
  const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(to) - p(from)) / 86400000);
}

// ---------- 파생 상태 ----------
export function isDelayed(t, now = nowKST()) {
  if (t.status !== 'todo' && t.status !== 'in_progress') return false;
  if (!t.due_date) return false;
  if (t.due_date < now.date) return true;
  return t.due_date === now.date && !!t.due_time && t.due_time < now.time;
}
export const displayStatus = (t, now) => (isDelayed(t, now) ? 'delayed' : t.status);

export function compareDefault(a, b) {
  const aDone = a.status === 'done' || a.status === 'canceled';
  const bDone = b.status === 'done' || b.status === 'canceled';
  if (aDone !== bDone) return aDone ? 1 : -1;
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  if (a.due_time !== b.due_time) {
    if (!a.due_time) return -1; // 종일이 먼저
    if (!b.due_time) return 1;
    return a.due_time < b.due_time ? -1 : 1;
  }
  const u = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (u) return u;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

// ---------- ID / 엔티티 ----------
function randId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return prefix + Array.from(bytes, b => ID_CHARS[b % ID_CHARS.length]).join('');
}
function uniqueId(prefix, used) {
  let id;
  do { id = randId(prefix); } while (used.has(id));
  return id;
}
const nowIso = () => new Date().toISOString();

export function emptyDoc() {
  return { schema_version: SCHEMA_VERSION, updated_at: nowIso(), projects: [], tasks: [], views: [] };
}

export function createTask(doc, fields = {}) {
  const ts = nowIso();
  const t = {
    id: uniqueId('T-', new Set(doc.tasks.map(x => x.id))),
    title: '',
    memo: '',
    project_id: null,
    status: 'todo',
    urgency: 'medium',
    start_date: todayKST(),
    due_date: null,
    due_time: null,
    created_at: ts,
    updated_at: ts,
    completed_at: null,
    deleted_at: null,
    ...fields,
  };
  doc.tasks.push(t);
  return t;
}

export function addProject(doc, name) {
  name = name.trim().slice(0, 40);
  if (!name) return null;
  const dup = doc.projects.find(p => !p.deleted_at && p.name === name);
  if (dup) return dup;
  const ts = nowIso();
  const p = {
    id: uniqueId('P-', new Set(doc.projects.map(x => x.id))),
    name,
    color: PALETTE[doc.projects.length % PALETTE.length],
    archived: false,
    updated_at: ts,
    deleted_at: null,
  };
  doc.projects.push(p);
  return p;
}

// ---------- IndexedDB ----------
let mem = null;
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
    if (d && Array.isArray(d.tasks)) return d;
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
export async function clearAll() {
  mem = null;
  try { await tx('readwrite', s => s.delete(KEY)); } catch { /* 무시 */ }
}
