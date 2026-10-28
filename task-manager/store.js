// 데이터 모델 + IndexedDB 저장 + 날짜 유틸 (M1: 이 기기에만 저장)
const DB_NAME = 'task-manager';
const STORE = 'kv';
const KEY = 'doc';
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
const PALETTE = ['#4F7CAC', '#B5651D', '#5E8C61', '#8A5FB0', '#C2547A', '#3E8E8E', '#A38B2D', '#7A7F8C'];
const URGENCY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

export const SCHEMA_VERSION = 2; // 2: Project에 order 필드 추가, 동기화가 알 수 없는 키를 보존
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
  return { schema_version: SCHEMA_VERSION, updated_at: nowIso(), projects: [], tasks: [], views: [], ticker: [], settings: [], topics: [] };
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
    blocked_by: null, // 선행 Task ID (M3.2, 1개)
    topic_id: null, // 주제 ID (M3.4, 선택)
    day_check: false, // 날짜별 체크 사용 (M3.6)
    worked_days: [], // 손댄 날 'YYYY-MM-DD' (M3.6)
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
    order: nextProjectOrder(doc),
    updated_at: ts,
    deleted_at: null,
  };
  doc.projects.push(p);
  return p;
}

// ---------- Project 표시 순서 ----------
const ordOf = p => (Number.isFinite(p.order) ? p.order : 1e9); // order가 없으면 맨 뒤, 동률이면 ID순
export const compareProjects = (a, b) => ordOf(a) - ordOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function nextProjectOrder(doc) {
  return doc.projects.reduce((m, p) => (Number.isFinite(p.order) ? Math.max(m, p.order) : m), -1) + 1;
}
// order가 없는 Project(구버전에서 만든 것 포함)에 맨 뒤 번호를 채운다. 바뀌었으면 true.
export function ensureProjectOrder(doc) {
  let changed = false;
  for (const p of doc.projects) {
    if (Number.isFinite(p.order)) continue;
    p.order = nextProjectOrder(doc);
    p.updated_at = nowIso();
    changed = true;
  }
  return changed;
}

// ---------- 선행 Task (M3.2) ----------
// task를 predId에 걸면 순환이 생기는지: predId에서 선행을 따라가다 task 자신이 나오면 순환
export function wouldCycle(doc, taskId, predId) {
  const seen = new Set();
  let cur = predId;
  while (cur && !seen.has(cur)) {
    if (cur === taskId) return true;
    seen.add(cur);
    cur = doc.tasks.find(x => x.id === cur && !x.deleted_at)?.blocked_by || null;
  }
  return false;
}

// ---------- 티커 (M3.2) ----------
export const TICKER_COLORS = { normal: '일반', caution: '주의', must: '필독' };
export const TICKER_LEVELS = { normal: '보통', strong: '강조', urgent: '긴급' }; // 문장별 강조 (M3.3)
export const tickerLevel = k => (TICKER_LEVELS[k?.level] ? k.level : 'normal');
const TK_ID = 'S-ticker';
const TK_DEFAULT = { id: TK_ID, color: 'normal', position: 'bottom', updated_at: '', deleted_at: null };

export function tickerSettings(doc) {
  const s = (doc.settings || []).find(x => x.id === TK_ID && !x.deleted_at);
  return { ...TK_DEFAULT, ...s };
}
export function setTickerSettings(doc, patch) {
  doc.settings ||= [];
  let s = doc.settings.find(x => x.id === TK_ID);
  if (!s) { s = { ...TK_DEFAULT }; doc.settings.push(s); }
  Object.assign(s, patch, { updated_at: nowIso(), deleted_at: null });
  return s;
}
export function createTicker(doc, text) {
  text = String(text || '').trim().slice(0, 120);
  if (!text) return null;
  doc.ticker ||= [];
  const ts = nowIso();
  const k = {
    id: uniqueId('K-', new Set(doc.ticker.map(x => x.id))),
    text, enabled: true, level: 'normal', expire_date: null, daily_from: null, daily_to: null,
    created_at: ts, updated_at: ts, deleted_at: null,
  };
  doc.ticker.push(k);
  return k;
}
// 매일 시간대: from<to 이면 그 사이, from>to 이면 자정을 넘김, 같으면 종일
export function inDailyWindow(time, from, to) {
  if (!from || !to || from === to) return true;
  return from < to ? time >= from && time < to : time >= from || time < to;
}
// 'expired' | 'off' | 'outside' | 'on' — 'on'일 때만 띠에 표시
export function tickerState(k, now = nowKST()) {
  if (k.expire_date && now.date > k.expire_date) return 'expired';
  if (!k.enabled) return 'off';
  if (!inDailyWindow(now.time, k.daily_from, k.daily_to)) return 'outside';
  return 'on';
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
    if (d && Array.isArray(d.tasks)) { d.schema_version = Math.max(d.schema_version || 1, SCHEMA_VERSION); return d; }
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

// ---------- 주제 (M3.4) ----------
// 주제는 Project에 속하는 꼬리표다. Task는 주제를 0~1개 가진다. 상태·마감은 없다
export function addTopic(doc, projectId, name, memo = '') {
  name = String(name || '').trim().slice(0, 60);
  if (!name) return { error: '주제 이름을 입력하세요' };
  if (!projectId || !doc.projects.some(p => p.id === projectId && !p.deleted_at)) return { error: 'Project를 먼저 고르세요' };
  doc.topics ||= [];
  const dup = doc.topics.find(g => !g.deleted_at && g.project_id === projectId && g.name.toLowerCase() === name.toLowerCase());
  if (dup) return { topic: dup, existed: true };
  const ts = nowIso();
  const g = { id: uniqueId('G-', new Set(doc.topics.map(x => x.id))), project_id: projectId, name, memo: String(memo || '').trim().slice(0, 200), archived: false, created_at: ts, updated_at: ts, deleted_at: null };
  doc.topics.push(g);
  return { topic: g };
}
export const compareTopics = (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' });
export function topicsOf(doc, projectId, { archived = false } = {}) {
  return (doc.topics || []).filter(g => !g.deleted_at && g.project_id === projectId && (archived || !g.archived)).sort(compareTopics);
}
// Task의 주제: 지워졌거나 다른 Project의 주제면 없는 것으로 본다
export function topicOfTask(doc, t) {
  if (!t.topic_id) return null;
  const g = (doc.topics || []).find(x => x.id === t.topic_id && !x.deleted_at);
  return g && g.project_id === t.project_id ? g : null;
}
// 주제 삭제: 소프트 삭제하고, 붙어 있던 Task에서 떼어 낸다. 떼어 낸 Task 수를 돌려준다
export function deleteTopic(doc, g) {
  const ts = nowIso();
  g.deleted_at = ts; g.updated_at = ts;
  let n = 0;
  for (const t of doc.tasks) if (t.topic_id === g.id) { t.topic_id = null; t.updated_at = ts; n++; }
  return n;
}

// ---------- 날짜별 체크 (M3.6) ----------
// Task마다 켜고(day_check) 손댄 날만 worked_days에 'YYYY-MM-DD'로 저장한다.
// 기간(시작일~마감일)을 바꿔도 기록은 지우지 않고, 기간 밖의 날은 표시만 하지 않는다.
export const DC_MAX_DAYS = 120; // 기간이 이보다 길면 상세 달력은 마지막 120일만 보여 준다
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
export const weekdayOf = date => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
// 날짜별 체크를 보여 줄 수 있는 Task인지 (스위치가 켜져 있고 시작일 ≤ 마감일)
export const dayCheckOn = t => !!t.day_check && !!t.start_date && !!t.due_date && t.start_date <= t.due_date;
export function rangeDays(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 10000; d = addDays(d, 1)) out.push(d);
  return out;
}
export const isWorked = (t, date) => Array.isArray(t.worked_days) && t.worked_days.includes(date);
// 켜면 true, 끄면 false를 돌려준다
export function toggleWorked(t, date) {
  const set = new Set(Array.isArray(t.worked_days) ? t.worked_days : []);
  const on = !set.has(date);
  if (on) set.add(date); else set.delete(date);
  t.worked_days = [...set].sort();
  return on;
}
// 카드 요약: { text, warn }
export function dayCheckSummary(t, today = todayKST()) {
  if (today < t.start_date) return { text: `D-${dayDiff(today, t.start_date)} 시작`, warn: false };
  const last = (t.worked_days || []).filter(d => d >= t.start_date && d <= today).pop();
  if (!last) return { text: '아직 안 함', warn: dayDiff(t.start_date, today) >= 1 };
  if (last === today) return { text: '오늘 함', warn: false };
  const n = dayDiff(last, today);
  return { text: `${n}일째 안 함`, warn: n >= 2 };
}
