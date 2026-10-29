// Google Drive 동기화 (V3)
// 파일: tm2-core.json (라벨·주제·Task·뷰·티커·설정), tm2-logs-YYYY-MM.json (작업일 기준 월별 이력)
// 원칙: 각 기기는 전체 사본을 IndexedDB에 두고, 동기화 때 바뀐 파일만 주고받는다.
//  - 원격 변경 감지: 파일의 headRevisionId가 마지막으로 본 값과 다르면 내려받아 병합
//  - 로컬 변경 감지: 파일 내용(updated_at 제외)의 해시가 마지막 동기화 때와 다르면 올림
//  - 병합: 항목(id)별로 updated_at이 더 최근인 쪽. 모르는 최상위 키는 더 최근 문서의 것을 보존
//  - 올리기 직전에 revision을 다시 확인해 그 사이 다른 기기가 저장했으면 처음부터 다시 (최대 3회)
import { CLIENT_ID, FOLDER_ID, BACKUP_FOLDER_ID, SCOPE } from './config.js';
import * as S from './store.js';
import * as Vault from './vault.js';
import { V } from './vault.js';

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const CORE = 'tm2-core.json';
const LOG_RE = /^tm2-logs-(\d{4}-\d{2})\.json$/;
const logName = month => `tm2-logs-${month}.json`;
const VMETA = 'tm2-vault-meta.json';
const VDATA = 'tm2-vault.json';
const KEEP_BACKUPS = 14;
const PURGE_MS = 30 * 86400000;
const P = 'tm2-sync-';

const ls = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(P + k);
    if (v === null) localStorage.removeItem(P + k); else localStorage.setItem(P + k, v);
  } catch { /* 무시 */ }
  return null;
};
const signedIn = () => ls('signed') === '1';

// ---------- 직렬화·해시 ----------
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isEntityArray = a => Array.isArray(a) && a.every(e => e && typeof e.id === 'string');
const CORE_KEYS = ['labels', 'topics', 'tasks', 'views', 'ticker', 'settings'];
const META = new Set(['schema', 'version', 'updated_at', 'month']);
function canonCore(d) {
  const out = { schema: S.SCHEMA, version: Math.max(d.version || 1, S.VERSION) };
  const keys = [...new Set([...CORE_KEYS, ...Object.keys(d)])].filter(k => !META.has(k)).sort();
  for (const k of keys) out[k] = isEntityArray(d[k]) ? [...d[k]].sort(byId) : (d[k] ?? []);
  return out;
}
function canonMonth(month, logs) {
  return { schema: S.LOG_SCHEMA, version: S.VERSION, month, logs: logs.filter(l => l.work_date.slice(0, 7) === month).sort(byId) };
}
// cyrb53 (빠른 비암호 해시: 변경 감지용)
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const hashOf = canon => hash(JSON.stringify(canon));
const textOf = canon => JSON.stringify({ ...canon, updated_at: new Date().toISOString() }, null, 1);

// ---------- 병합 (순수 함수) ----------
function mergeEntities(a = [], b = [], now = Date.now()) {
  const map = new Map();
  for (const e of a) map.set(e.id, e);
  for (const e of b) { const cur = map.get(e.id); if (!cur || (e.updated_at || '') > (cur.updated_at || '')) map.set(e.id, e); }
  return [...map.values()].filter(e => !(e.deleted_at && now - Date.parse(e.deleted_at) > PURGE_MS)).sort(byId);
}
export function mergeCore(local, remote) {
  if (!remote) return local;
  const out = { ...local };
  const remoteNewer = (remote.updated_at || '') > (local.updated_at || '');
  for (const k of new Set([...CORE_KEYS, ...Object.keys(local), ...Object.keys(remote)])) {
    if (META.has(k)) continue;
    const l = local[k], r = remote[k];
    if ((l === undefined || isEntityArray(l)) && (r === undefined || isEntityArray(r))) out[k] = mergeEntities(l, r);
    else out[k] = l === undefined ? r : r === undefined ? l : remoteNewer ? r : l;
  }
  out.schema = S.SCHEMA;
  out.updated_at = [local.updated_at, remote.updated_at].filter(Boolean).sort().pop();
  return S.normalize(out);
}
export function mergeLogs(local, remoteArrays) {
  let logs = local.logs;
  for (const arr of remoteArrays) logs = mergeEntities(logs, arr);
  return S.normalizeLogs({ ...local, logs });
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 상태 ----------
let hooks = { getCore: () => null, getLogs: () => null, apply: async () => {}, onStatus: () => {} };
let token = null, tokenExp = 0, client = null, gisPromise = null, curReq = null;
let status = 'off', detail = '', lastSync = ls('last');
let syncing = false, pending = false, timer;
let seen = (() => { try { return JSON.parse(ls('seen') || '{}'); } catch { return {}; } })(); // 파일명 → { id, rev, hash }
const saveSeen = () => ls('seen', JSON.stringify(seen));

export const getState = () => ({ status, detail, lastSync, signedIn: signedIn() });
function setStatus(s, d = '') { status = s; detail = d; hooks.onStatus(getState()); }

// ---------- 로그인 (GIS 토큰 클라이언트, 토큰은 메모리에만) ----------
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (globalThis.google?.accounts?.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(Object.assign(new Error('gis-load'), { offline: true })); };
    document.head.append(s);
  });
  return gisPromise;
}
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    client ||= google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: r => curReq?.ok(r),
      error_callback: e => curReq?.fail(e),
    });
    curReq = {
      ok: r => {
        if (r.error) return reject(Object.assign(new Error(r.error), { auth: true }));
        token = r.access_token;
        tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        resolve(token);
      },
      fail: e => reject(Object.assign(new Error(e?.type || 'popup'), { auth: true })),
    };
    client.requestAccessToken({ prompt });
  });
}
async function ensureToken() {
  if (token && Date.now() < tokenExp - 60000) return;
  await loadGis();
  await requestToken(signedIn() ? '' : 'consent');
}

// ---------- Drive API ----------
async function api(url, { method = 'GET', headers = {}, body, raw = false } = {}) {
  if (navigator.onLine === false) throw Object.assign(new Error('offline'), { offline: true });
  let r;
  try { r = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + token, ...headers } }); }
  catch { throw Object.assign(new Error('network'), { offline: true }); }
  if (r.status === 401) { token = null; tokenExp = 0; throw Object.assign(new Error('auth'), { auth: true }); }
  if (!r.ok) throw Object.assign(new Error('drive ' + r.status), { status: r.status });
  if (raw) return r;
  return r.status === 204 ? null : r.json();
}
const qs = s => encodeURIComponent(s);
function multipart(meta, content) {
  const b = 'tm2' + Math.random().toString(36).slice(2);
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`,
  };
}
// 폴더 안의 tm2- 파일 목록: 이름 → { id, rev }. 같은 이름이 여럿이면 가장 오래된 것
async function listFiles() {
  const out = {};
  let page = '';
  do {
    const r = await api(`${API}/files?q=${qs(`'${FOLDER_ID}' in parents and name contains 'tm2-' and trashed=false`)}&orderBy=createdTime&pageSize=200&fields=nextPageToken,files(id,name,headRevisionId)${page ? '&pageToken=' + page : ''}`);
    for (const f of r.files || []) if (!out[f.name]) out[f.name] = { id: f.id, rev: f.headRevisionId };
    page = r.nextPageToken || '';
  } while (page);
  return out;
}
const getRev = async id => (await api(`${API}/files/${id}?fields=headRevisionId`)).headRevisionId;
async function readJson(id) {
  const txt = await (await api(`${API}/files/${id}?alt=media`, { raw: true })).text();
  if (!txt.trim()) return null;
  try { return JSON.parse(txt); } catch { throw new Error('Drive 파일이 손상되었습니다'); }
}
const update = (id, text) => api(`${UP}/files/${id}?uploadType=media&fields=id,headRevisionId`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text });
function create(name, text, parent = FOLDER_ID) {
  const { body, headers } = multipart({ name, parents: [parent], mimeType: 'application/json' }, text);
  return api(`${UP}/files?uploadType=multipart&fields=id,headRevisionId`, { method: 'POST', body, headers });
}

// 하루 한 번(기기별), 전체 사본을 backup 폴더에 남기고 최근 14개만 유지
async function dailyBackup(core, logs, vault) {
  const today = S.todayKST();
  if (ls('backup') === today) return;
  const name = `tm2-backup-${today.replaceAll('-', '')}.json`;
  const ex = await api(`${API}/files?q=${qs(`'${BACKUP_FOLDER_ID}' in parents and name='${name}' and trashed=false`)}&fields=files(id)`);
  if (!ex.files?.length) await create(name, JSON.stringify({ core, logs, vault }), BACKUP_FOLDER_ID);
  ls('backup', today);
  const all = await api(`${API}/files?q=${qs(`'${BACKUP_FOLDER_ID}' in parents and name contains 'tm2-backup-' and trashed=false`)}&orderBy=name desc&pageSize=100&fields=files(id,name)`);
  for (const f of (all.files || []).slice(KEEP_BACKUPS)) {
    await api(`${API}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}

// ---------- 동기화 ----------
// 이 기기 저장소가 비었는데(데이터 삭제·브라우저 정리) 동기화 기록만 남아 있으면, 빈 상태를 올려 Drive를 덮지 않도록 기록을 버리고 전부 다시 받는다
export function resetSeen() { seen = {}; ls('seen', null); }
async function syncOnce() {
  const c0 = hooks.getCore(), l0 = hooks.getLogs();
  if (Object.keys(seen).length && !c0.tasks.length && !c0.labels.length && !l0.logs.length && !V.meta) resetSeen();
  const list = await listFiles();
  // 1. 원격에서 바뀐 파일 내려받기
  const remote = {};
  for (const [name, f] of Object.entries(list)) {
    if (name !== CORE && !LOG_RE.test(name)) continue;
    if (seen[name]?.rev !== f.rev || seen[name]?.id !== f.id) remote[name] = await readJson(f.id);
  }
  // 2. 병합 (내려받는 동안 사용자가 고친 내용도 잃지 않도록, 반영 직전에 현재 로컬과 한 번 더 병합)
  const logArrays = Object.entries(remote).filter(([n, d]) => LOG_RE.test(n) && d && Array.isArray(d.logs)).map(([, d]) => d.logs);
  if (remote[CORE] || logArrays.length) {
    const core = remote[CORE] ? mergeCore(hooks.getCore(), remote[CORE]) : null;
    const logs = logArrays.length ? mergeLogs(hooks.getLogs(), logArrays) : null;
    const curCore = hooks.getCore(), curLogs = hooks.getLogs();
    const nc = core ? mergeCore(curCore, core) : null;
    const nl = logs ? mergeLogs(curLogs, [logs.logs]) : null;
    const coreChanged = nc && !sameJson(canonCore(nc), canonCore(curCore));
    const logsChanged = nl && !sameJson(nl.logs.slice().sort(byId), curLogs.logs.slice().sort(byId));
    if (coreChanged || logsChanged) await hooks.apply({ core: coreChanged ? nc : null, logs: logsChanged ? nl : null });
  }
  // 3. 올릴 파일 정하기: 원격과 다르거나 마지막 동기화 이후 로컬이 바뀐 파일
  const core = hooks.getCore(), logs = hooks.getLogs();
  const months = new Set(logs.logs.map(l => l.work_date.slice(0, 7)));
  for (const n of Object.keys(list)) { const m = n.match(LOG_RE); if (m) months.add(m[1]); }
  const targets = [[CORE, canonCore(core)], ...[...months].sort().map(m => [logName(m), canonMonth(m, logs.logs)])];
  const updates = {};
  for (const [name, canon] of targets) {
    const h = hashOf(canon);
    const f = list[name];
    if (f && remote[name] !== undefined) {
      const rc = name === CORE ? canonCore(remote[name] || {}) : canonMonth(name.match(LOG_RE)[1], remote[name]?.logs || []);
      if (hashOf(rc) === h) { updates[name] = { id: f.id, rev: f.rev, hash: h }; continue; }
    } else if (f && seen[name]?.hash === h) continue;
    if (!f && name !== CORE && !canon.logs.length) continue; // 빈 달은 새로 만들지 않는다
    // 올리기 직전 revision 확인: 그 사이 다른 기기가 저장했으면 처음부터 다시
    if (f && (await getRev(f.id)) !== f.rev) return false;
    const res = f ? await update(f.id, textOf(canon)) : await create(name, textOf(canon));
    updates[name] = { id: res.id, rev: res.headRevisionId, hash: h };
  }
  Object.assign(seen, updates);
  saveSeen();
  return syncVault(list);
}

// ---------- 보안 영역 ----------
// 메타(평문, 비밀 값 없음)와 암호문 문서를 주고받는다. 서버(Drive)는 평문을 보지 못한다
//  - 잠금 해제 중: 원격 문서를 복호화해 항목별로 병합하고, 달라졌으면 다시 암호화해 올린다
//  - 잠긴 상태: 이 기기에 고친 것이 없으면 원격 암호문을 그대로 받아 두고, 원격이 그대로면 이 기기 암호문을 그대로 올린다
const canonVault = d => JSON.stringify({ nodes: [...(d?.nodes || [])].sort(byId), memos: [...(d?.memos || [])].sort(byId) });
const mergeVault = (a, b) => ({ ...a, nodes: mergeEntities(a.nodes, b.nodes), memos: mergeEntities(a.memos, b.memos) });
const ctHash = blob => (blob ? hash(blob.ct) : '');
async function syncVault(list) {
  const fm = list[VMETA], fd = list[VDATA];
  // 1. 메타
  let rmeta = null;
  if (fm && (!V.meta || seen[VMETA]?.rev !== fm.rev || seen[VMETA]?.id !== fm.id)) rmeta = await readJson(fm.id);
  if (rmeta && V.meta && rmeta.vault_id !== V.meta.vault_id) { V.conflict = 'remote'; return true; }
  if (rmeta && (!V.meta || (rmeta.updated_at || '') > (V.meta.updated_at || ''))) await Vault.adoptMeta(rmeta);
  if (!V.meta) return true;
  const mt = JSON.stringify(V.meta), mh = hash(mt);
  if (!fm) { const r = await create(VMETA, mt); seen[VMETA] = { id: r.id, rev: r.headRevisionId, hash: mh }; }
  else if (rmeta ? hash(JSON.stringify(rmeta)) !== mh : seen[VMETA]?.hash !== mh) {
    if ((await getRev(fm.id)) !== fm.rev) return false;
    const r = await update(fm.id, mt); seen[VMETA] = { id: r.id, rev: r.headRevisionId, hash: mh };
  } else seen[VMETA] = { id: fm.id, rev: fm.rev, hash: mh };
  saveSeen();
  // 2. 문서
  const sd = seen[VDATA] || {};
  let rblob = null;
  if (fd && (sd.rev !== fd.rev || sd.id !== fd.id)) rblob = await readJson(fd.id);
  if (rblob && rblob.vault_id !== V.meta.vault_id) { V.conflict = 'remote'; return true; }
  const put = async blob => {
    const text = JSON.stringify(blob);
    if (fd && (await getRev(fd.id)) !== fd.rev) return null;
    return fd ? update(fd.id, text) : create(VDATA, text);
  };
  if (V.unlocked) {
    await Vault.flush();
    if (rblob) {
      const rd = await Vault.decrypt(rblob);
      const merged = mergeVault(V.doc, rd);
      if (canonVault(merged) !== canonVault(V.doc)) await Vault.adoptDoc(merged);
      if (canonVault(V.doc) === canonVault(rd)) { seen[VDATA] = { id: fd.id, rev: fd.rev, phash: hash(canonVault(V.doc)), bhash: ctHash(V.blob) }; saveSeen(); return true; }
    } else {
      const ph = hash(canonVault(V.doc));
      const clean = fd && (sd.phash ? sd.phash === ph : sd.bhash === ctHash(V.blob));
      if (clean) { seen[VDATA] = { ...sd, phash: ph, bhash: ctHash(V.blob) }; saveSeen(); return true; }
      if (!fd && !V.doc.nodes.length && !V.doc.memos.length) return true;
    }
    await Vault.flush();
    const r = await put(V.blob);
    if (!r) return false;
    seen[VDATA] = { id: r.id, rev: r.headRevisionId, phash: hash(canonVault(V.doc)), bhash: ctHash(V.blob) };
  } else {
    const dirty = !!V.blob && ctHash(V.blob) !== sd.bhash;
    if (rblob) {
      if (dirty) return true; // 이 기기에도 고친 것이 있으면 잠금을 풀었을 때 병합한다
      await Vault.adoptBlob(rblob);
      seen[VDATA] = { id: fd.id, rev: fd.rev, bhash: ctHash(rblob) };
    } else if (dirty) {
      const r = await put(V.blob);
      if (!r) return false;
      seen[VDATA] = { id: r.id, rev: r.headRevisionId, bhash: ctHash(V.blob) };
    } else return true;
  }
  saveSeen();
  return true;
}
// Drive 금고로 바꾸기: 이 기기 금고를 버리고 Drive의 메타·암호문을 받는다
export async function resolveVaultConflict() {
  await ensureToken();
  const list = await listFiles();
  const meta = list[VMETA] ? await readJson(list[VMETA].id) : null;
  if (!meta) { V.conflict = null; return; }
  const blob = list[VDATA] ? await readJson(list[VDATA].id) : null;
  await Vault.replaceWith(meta, blob && blob.vault_id === meta.vault_id ? blob : null);
  delete seen[VMETA]; delete seen[VDATA]; saveSeen();
  schedule(500);
}

export async function syncNow() {
  if (!signedIn()) return;
  if (syncing) { pending = true; return; }
  syncing = true;
  setStatus('syncing');
  try {
    await ensureToken();
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) ok = await syncOnce();
    if (!ok) throw new Error('다른 기기와 저장이 겹쳐 중단했습니다 (잠시 후 다시 시도)');
    await dailyBackup(hooks.getCore(), hooks.getLogs(), V.meta ? { meta: V.meta, blob: V.blob } : null).catch(() => {});
    const n = S.nowKST();
    lastSync = `${n.date} ${n.time}`;
    ls('last', lastSync);
    setStatus('ok');
  } catch (e) {
    if (e.auth) setStatus('needs-auth', e.message);
    else if (e.offline) setStatus('offline');
    else setStatus('error', e.message);
  } finally {
    syncing = false;
    if (pending) { pending = false; schedule(1500); }
  }
}
export function schedule(delay = 3000) {
  if (!signedIn()) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}
export async function signIn() {
  try {
    await loadGis();
    await requestToken(signedIn() ? '' : 'consent');
    ls('signed', '1');
    await syncNow();
  } catch (e) { setStatus(e.offline ? 'offline' : 'needs-auth', e.message); }
}
// 로그아웃: 이 기기의 데이터는 그대로 두고 동기화만 멈춘다
export function signOut() {
  try { if (token) google.accounts.oauth2.revoke(token, () => {}); } catch { /* 무시 */ }
  token = null; tokenExp = 0;
  ls('signed', null); ls('seen', null); seen = {};
  setStatus('off');
}
export function init(h) {
  hooks = { ...hooks, ...h };
  if (signedIn()) {
    setStatus('needs-auth');
    loadGis().then(() => syncNow()).catch(() => setStatus('offline'));
    // 자동 로그인이 팝업 차단으로 실패하면 첫 터치에서 다시 시도
    addEventListener('pointerdown', () => { if (status === 'needs-auth' && !syncing) syncNow(); }, { capture: true });
  } else setStatus('off');
  addEventListener('online', () => schedule(500));
  addEventListener('offline', () => { if (signedIn()) setStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(500); });
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);
}
