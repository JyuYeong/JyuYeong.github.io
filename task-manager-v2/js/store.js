// v2 데이터 모델 · 규칙 · IndexedDB 저장 (V1: 이 기기에만 저장)
// 문서 구조: { schema, version, updated_at, labels, topics, tasks, views, ticker, settings }
// 모든 항목은 id, created_at, updated_at, deleted_at을 가진다 (삭제는 표시만, 30일 뒤 정리)

const DB_NAME = 'task-manager-v2'; // v1('task-manager')과 같은 출처라 이름을 반드시 다르게 둔다
const STORE = 'kv';
const KEY = 'core';
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
export const PALETTE = ['#4F7CAC', '#B5651D', '#5E8C61', '#8A5FB0', '#C2547A', '#3E8E8E', '#A38B2D', '#7A7F8C', '#D0743C', '#2F6FD6'];
const URGENCY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
const PURGE_DAYS = 30;

export const SCHEMA = 'tm2-core';
export const VERSION = 1;
export let storageOk = true;

export const nowIso = () => new Date().toISOString();

// ---------- 날짜 (KST 문자열) ----------
const dateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function nowKST() {
  const d = new Date();
  return { date: dateFmt.format(d), time: timeFmt.format(d) };
}
export const todayKST = () => nowKST().date;
export const kstDateOf = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? dateFmt.format(d) : null; };
const utc = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dayDiff = (from, to) => Math.round((utc(to) - utc(from)) / 86400000); // to - from (일)
export const addDays = (date, n) => new Date(utc(date) + n * 86400000).toISOString().slice(0, 10);
export const weekdayOf = date => new Date(utc(date)).getUTCDay();
export function rangeDays(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 10000; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- 상태 ----------
export const isFin = t => t.status === 'done' || t.status === 'canceled';
export function isDelayed(t, now = nowKST()) {
  if (isFin(t) || !t.due_date) return false;
  if (t.due_date < now.date) return true;
  return t.due_date === now.date && !!t.due_time && t.due_time < now.time;
}
export const displayStatus = (t, now) => (isDelayed(t, now) ? 'delayed' : t.status);

export function compareDefault(a, b) {
  if (isFin(a) !== isFin(b)) return isFin(a) ? 1 : -1;
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

// ---------- ID ----------
function uniqueId(prefix, list) {
  const used = new Set(list.map(x => x.id));
  let id;
  do { id = prefix + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => ID_CHARS[b % ID_CHARS.length]).join(''); } while (used.has(id));
  return id;
}
const stamp = (o, ts = nowIso()) => { o.updated_at = ts; return o; };
const live = arr => (arr || []).filter(x => !x.deleted_at);

export function emptyDoc() {
  return { schema: SCHEMA, version: VERSION, updated_at: nowIso(), labels: [], topics: [], tasks: [], views: [], ticker: [], settings: [] };
}

// ---------- 라벨 ----------
const ordOf = x => (Number.isFinite(x.order) ? x.order : 1e9);
export const compareLabels = (a, b) => ordOf(a) - ordOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const liveLabels = doc => live(doc.labels).sort(compareLabels);
export const labelById = (doc, id) => doc.labels.find(l => l.id === id && !l.deleted_at) || null;

export function addLabel(doc, name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { error: '라벨 이름을 입력하세요' };
  const dup = live(doc.labels).find(l => l.name.toLowerCase() === name.toLowerCase());
  if (dup) return { label: dup, existed: true };
  const ts = nowIso();
  const order = doc.labels.reduce((m, l) => (Number.isFinite(l.order) ? Math.max(m, l.order) : m), -1) + 1;
  const l = { id: uniqueId('B-', doc.labels), name, color: PALETTE[live(doc.labels).length % PALETTE.length], order, archived: false, memo: '', created_at: ts, updated_at: ts, deleted_at: null };
  doc.labels.push(l);
  return { label: l };
}
export function moveLabel(doc, id, dir) {
  const list = liveLabels(doc);
  const i = list.findIndex(l => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  const ts = nowIso();
  list.forEach((l, n) => { if (l.order !== n) { l.order = n; l.updated_at = ts; } });
  return true;
}
// 라벨 삭제: 라벨과 그 주제를 지우고 Task에서 떼어 낸다. { topics, tasks } 개수를 돌려준다
export function labelUsage(doc, id) {
  const topics = live(doc.topics).filter(g => g.label_id === id);
  const tasks = live(doc.tasks).filter(t => t.label_ids.includes(id));
  return { topics, tasks };
}
export function deleteLabel(doc, l) {
  const ts = nowIso();
  const { topics, tasks } = labelUsage(doc, l.id);
  const gids = new Set(topics.map(g => g.id));
  for (const g of topics) { g.deleted_at = ts; g.updated_at = ts; }
  for (const t of tasks) {
    t.label_ids = t.label_ids.filter(x => x !== l.id);
    t.topic_ids = t.topic_ids.filter(x => !gids.has(x));
    t.updated_at = ts;
  }
  l.deleted_at = ts; l.updated_at = ts;
  return { topics: topics.length, tasks: tasks.length };
}

// ---------- 주제 (라벨 하위) ----------
export const compareTopics = (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true, sensitivity: 'base' });
export const topicById = (doc, id) => doc.topics.find(g => g.id === id && !g.deleted_at) || null;
export function topicsOfLabel(doc, labelId, { archived = false } = {}) {
  return live(doc.topics).filter(g => g.label_id === labelId && (archived || !g.archived)).sort(compareTopics);
}
export function addTopic(doc, labelId, name, memo = '') {
  name = String(name || '').trim().slice(0, 60);
  if (!name) return { error: '주제 이름을 입력하세요' };
  if (!labelById(doc, labelId)) return { error: '라벨을 먼저 고르세요' };
  const dup = topicsOfLabel(doc, labelId, { archived: true }).find(g => g.name.toLowerCase() === name.toLowerCase());
  if (dup) return { topic: dup, existed: true };
  const ts = nowIso();
  const g = { id: uniqueId('G-', doc.topics), label_id: labelId, name, memo: String(memo || '').trim().slice(0, 200), archived: false, created_at: ts, updated_at: ts, deleted_at: null };
  doc.topics.push(g);
  return { topic: g };
}
export function deleteTopic(doc, g) {
  const ts = nowIso();
  g.deleted_at = ts; g.updated_at = ts;
  let n = 0;
  for (const t of live(doc.tasks)) if (t.topic_ids.includes(g.id)) { t.topic_ids = t.topic_ids.filter(x => x !== g.id); t.updated_at = ts; n++; }
  return n;
}

// ---------- Task ----------
export function createTask(doc, fields = {}) {
  const ts = nowIso();
  const t = {
    id: uniqueId('T-', doc.tasks),
    title: '', memo: '',
    label_ids: [], topic_ids: [],
    status: 'todo', urgency: 'medium',
    start_date: todayKST(), due_date: null, due_time: null,
    blocked_by: null,
    day_check: false, marked_days: [],
    created_at: ts, updated_at: ts, completed_at: null, deleted_at: null,
    ...fields,
  };
  doc.tasks.push(t);
  return t;
}
export const taskById = (doc, id) => doc.tasks.find(t => t.id === id && !t.deleted_at) || null;
// Task에 붙은 라벨 (라벨 순서대로, 지워진 것 제외)
export function taskLabels(doc, t) {
  return liveLabels(doc).filter(l => t.label_ids.includes(l.id));
}
// Task에 붙은 주제: 지워졌거나 Task에 없는 라벨의 주제면 없는 것으로 본다. 라벨 순 → 이름 순
export function taskTopics(doc, t) {
  const labels = taskLabels(doc, t);
  const rank = new Map(labels.map((l, i) => [l.id, i]));
  return live(doc.topics).filter(g => t.topic_ids.includes(g.id) && rank.has(g.label_id))
    .sort((a, b) => rank.get(a.label_id) - rank.get(b.label_id) || compareTopics(a, b));
}
// 라벨을 떼면 그 라벨의 주제도 함께 뗀다. 함께 빠지는 주제 목록을 돌려준다
export function topicsLostByRemoving(doc, t, labelId) {
  return taskTopics(doc, t).filter(g => g.label_id === labelId);
}
export function toggleTaskLabel(doc, t, labelId) {
  if (t.label_ids.includes(labelId)) {
    const lost = new Set(topicsLostByRemoving(doc, t, labelId).map(g => g.id));
    t.label_ids = t.label_ids.filter(x => x !== labelId);
    t.topic_ids = t.topic_ids.filter(x => !lost.has(x));
    return false;
  }
  t.label_ids = [...t.label_ids, labelId];
  return true;
}
export function toggleTaskTopic(t, topicId) {
  const on = !t.topic_ids.includes(topicId);
  t.topic_ids = on ? [...t.topic_ids, topicId] : t.topic_ids.filter(x => x !== topicId);
  return on;
}

// 선행 Task: task를 predId에 걸면 순환이 생기는지
export function wouldCycle(doc, taskId, predId) {
  const seen = new Set();
  let cur = predId;
  while (cur && !seen.has(cur)) {
    if (cur === taskId) return true;
    seen.add(cur);
    cur = taskById(doc, cur)?.blocked_by || null;
  }
  return false;
}

// ---------- 날짜별 체크 ----------
// 손댄 날 = marked_days(직접 찍은 날). V2에서 작업 이력의 작업일이 더해진다
export const DC_MAX_DAYS = 120;
export const dayCheckOn = t => !!t.day_check && !!t.start_date && !!t.due_date && t.start_date <= t.due_date;
export const isWorked = (t, date) => t.marked_days.includes(date);
export function toggleMarked(t, date) {
  const set = new Set(t.marked_days);
  const on = !set.has(date);
  if (on) set.add(date); else set.delete(date);
  t.marked_days = [...set].sort();
  return on;
}
// 표시 범위: 시작~마감. 지연 중이면 오늘까지, 마감 뒤에 완료했으면 완료일까지 늘린다
export function dcRange(t, today = todayKST()) {
  if (!dayCheckOn(t)) return null;
  let end = t.due_date;
  if (!isFin(t) && today > end) end = today;
  if (t.status === 'done') { const c = kstDateOf(t.completed_at); if (c && c > end) end = c; }
  return { start: t.start_date, due: t.due_date, end };
}
export const isOver = (t, date) => !!t.due_date && date > t.due_date;
export function workedIn(t, from, to) { return t.marked_days.filter(d => d >= from && d <= to); }
// 요약: { text, warn }
export function dayCheckSummary(t, today = todayKST()) {
  const r = dcRange(t, today);
  if (!r) return { text: '', warn: false };
  if (isFin(t)) {
    const n = workedIn(t, r.start, r.end).length;
    const over = r.end > r.due ? ` · 마감 +${dayDiff(r.due, r.end)}일` : '';
    return { text: `${n}일 손댐${over}`, warn: false };
  }
  if (today < t.start_date) return { text: `D-${dayDiff(today, t.start_date)} 시작`, warn: false };
  const over = today > r.due ? `마감 +${dayDiff(r.due, today)}일 · ` : '';
  const last = workedIn(t, r.start, today).pop();
  let text, warn;
  if (!last) { text = '아직 안 함'; warn = dayDiff(t.start_date, today) >= 1; }
  else if (last === today) { text = '오늘 함'; warn = false; }
  else { const n = dayDiff(last, today); text = `${n}일째 안 함`; warn = n >= 2; }
  return { text: over + text, warn: warn || !!over };
}
export const lastWorked = (t, today = todayKST()) => (dcRange(t, today) ? workedIn(t, t.start_date, today).pop() || '' : '');

// ---------- 저장된 뷰 ----------
export function saveView(doc, name, filter, q) {
  name = String(name || '').trim().slice(0, 30);
  if (!name) return null;
  const ts = nowIso();
  const exist = live(doc.views).find(v => v.name === name);
  if (exist) { Object.assign(exist, { filter, q: { ...q }, updated_at: ts }); return exist; }
  const v = { id: uniqueId('V-', doc.views), name, filter, q: { ...q }, created_at: ts, updated_at: ts, deleted_at: null };
  doc.views.push(v);
  return v;
}

// ---------- 티커 ----------
export const TICKER_COLORS = { normal: '일반', caution: '주의', must: '필독' };
export const TICKER_LEVELS = { normal: '보통', strong: '강조', urgent: '긴급' };
export const tickerLevel = k => (TICKER_LEVELS[k?.level] ? k.level : 'normal');
const TK_ID = 'S-ticker';
const TK_DEFAULT = { id: TK_ID, color: 'normal', position: 'bottom', created_at: '', updated_at: '', deleted_at: null };
export function tickerSettings(doc) {
  return { ...TK_DEFAULT, ...doc.settings.find(x => x.id === TK_ID && !x.deleted_at) };
}
export function setTickerSettings(doc, patch) {
  let s = doc.settings.find(x => x.id === TK_ID);
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
export function inDailyWindow(time, from, to) {
  if (!from || !to || from === to) return true;
  return from < to ? time >= from && time < to : time >= from || time < to;
}
export function tickerState(k, now = nowKST()) {
  if (k.expire_date && now.date > k.expire_date) return 'expired';
  if (!k.enabled) return 'off';
  if (!inDailyWindow(now.time, k.daily_from, k.daily_to)) return 'outside';
  return 'on';
}

// ---------- 문서 정리 ----------
// 빠진 필드를 채우고, 30일 지난 삭제 항목을 실제로 지운다
export function normalize(doc) {
  const d = { ...emptyDoc(), ...doc };
  for (const k of ['labels', 'topics', 'tasks', 'views', 'ticker', 'settings']) if (!Array.isArray(d[k])) d[k] = [];
  for (const t of d.tasks) {
    for (const k of ['label_ids', 'topic_ids', 'marked_days']) if (!Array.isArray(t[k])) t[k] = [];
  }
  const cut = new Date(Date.now() - PURGE_DAYS * 86400000).toISOString();
  for (const k of ['labels', 'topics', 'tasks', 'views', 'ticker', 'settings']) d[k] = d[k].filter(x => !x.deleted_at || x.deleted_at > cut);
  return d;
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
    if (d && d.schema === SCHEMA) return normalize(d);
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
export { stamp, live };
