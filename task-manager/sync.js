// Google Drive 동기화 (M3, M3.1): tasks.json 한 파일, 항목별 최신 수정 우선 병합, 모르는 키 보존
import { CLIENT_ID, FOLDER_ID, SCOPE } from './config.js';
import { nowKST, todayKST } from './store.js';

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'tasks.json';
const KEEP_BACKUPS = 14;
const PURGE_DAYS = 180;
const KEYS = ['projects', 'tasks', 'views'];

const ls = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch { /* 무시 */ }
  return null;
};

// ---------- 병합 (순수 함수) ----------
// 알려진 키(KEYS) 외에도, 최상위의 id 배열(이후 추가될 ticker, settings 등)은 항목별로 병합하고
// 그 밖의 값은 더 최근에 수정된 문서의 것을 보존한다 (모르는 키를 지우지 않기 위함).
const META = new Set(['schema_version', 'updated_at']);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isEntityArray = a => Array.isArray(a) && a.every(e => e && typeof e.id === 'string');
const keysOf = (...docs) => [...new Set([...KEYS, ...docs.flatMap(d => Object.keys(d || {}))])].filter(k => !META.has(k));

export function mergeDocs(local, remote, now = Date.now()) {
  const out = { schema_version: Math.max(local.schema_version || 1, remote?.schema_version || 1), updated_at: '' };
  const remoteNewer = (remote?.updated_at || '') > (local.updated_at || '');
  for (const k of keysOf(local, remote)) {
    const l = local[k], r = remote?.[k];
    if ((l === undefined || isEntityArray(l)) && (r === undefined || isEntityArray(r))) {
      const map = new Map();
      for (const e of l || []) map.set(e.id, e);
      for (const e of r || []) {
        const cur = map.get(e.id);
        if (!cur || (e.updated_at || '') > (cur.updated_at || '')) map.set(e.id, e);
      }
      out[k] = [...map.values()]
        .filter(e => !(e.deleted_at && now - Date.parse(e.deleted_at) > PURGE_DAYS * 86400000))
        .sort(byId);
    } else {
      out[k] = l === undefined ? r : r === undefined ? l : remoteNewer ? r : l;
    }
  }
  out.updated_at = [local.updated_at, remote?.updated_at].filter(Boolean).sort().pop() || new Date().toISOString();
  return out;
}
export function sameEntities(a, b) {
  const norm = d => JSON.stringify(keysOf(a, b).sort().map(k => { const v = d?.[k]; return [k, isEntityArray(v) ? [...v].sort(byId) : (v ?? [])]; }));
  return norm(a) === norm(b);
}
export function serialize(d) {
  const { schema_version, updated_at, projects, tasks, views, ...rest } = d;
  return JSON.stringify({ schema_version, updated_at, projects, tasks, views: views || [], ...rest }, null, 1);
}

// ---------- 상태 ----------
let hooks = { getDoc: () => null, applyMerged: () => {}, onStatus: () => {} };
let token = null, tokenExp = 0, client = null, gisPromise = null;
let status = 'off', detail = '', lastSync = ls('tm-last');
let syncing = false, pending = false, timer;
let cur = null; // 진행 중인 토큰 요청

export const getState = () => ({ status, detail, lastSync, signedIn: ls('tm-signed') === '1' });
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
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: r => cur?.ok(r),
      error_callback: e => cur?.fail(e),
    });
    cur = {
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
  await requestToken(ls('tm-signed') === '1' ? '' : 'consent');
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
function multipart(meta, content) {
  const b = 'tm' + Math.random().toString(36).slice(2);
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`,
  };
}
const q = s => encodeURIComponent(s);

async function resolveFile() {
  const cached = ls('tm-fileid');
  if (cached) {
    try { await api(`${API}/files/${cached}?fields=id,trashed`).then(f => { if (f.trashed) throw Object.assign(new Error('trashed'), { status: 404 }); }); return cached; }
    catch (e) { if (e.status !== 404) throw e; ls('tm-fileid', null); }
  }
  const r = await api(`${API}/files?q=${q(`name='${FILE_NAME}' and trashed=false`)}&orderBy=createdTime&pageSize=10&fields=files(id,createdTime)`);
  const id = r.files?.[0]?.id || null; // 여러 개면 가장 오래된 것
  if (id) ls('tm-fileid', id);
  return id;
}
const getMeta = id => api(`${API}/files/${id}?fields=headRevisionId,modifiedTime`);
async function readJson(id) {
  const txt = await (await api(`${API}/files/${id}?alt=media`, { raw: true })).text();
  if (!txt.trim()) return null;
  try { return JSON.parse(txt); } catch { throw new Error('remote-corrupt'); }
}
const writeJson = (id, text) => api(`${UP}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text });

async function dailyBackup(text) {
  const today = todayKST();
  if (ls('tm-backup') === today) return;
  const name = `tasks-backup-${today.replaceAll('-', '')}.json`;
  const ex = await api(`${API}/files?q=${q(`name='${name}' and trashed=false`)}&fields=files(id)`);
  if (!ex.files?.length) {
    const { body, headers } = multipart({ name, parents: [FOLDER_ID], mimeType: 'application/json' }, text);
    await api(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', body, headers });
  }
  ls('tm-backup', today);
  const all = await api(`${API}/files?q=${q(`name contains 'tasks-backup-' and trashed=false`)}&orderBy=name desc&pageSize=100&fields=files(id,name)`);
  for (const f of (all.files || []).slice(KEEP_BACKUPS)) {
    await api(`${API}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}

// ---------- 동기화 ----------
export async function syncNow() {
  if (ls('tm-signed') !== '1') return;
  if (syncing) { pending = true; return; }
  syncing = true;
  setStatus('syncing');
  try {
    await ensureToken();
    let done = false;
    for (let attempt = 0; attempt < 3 && !done; attempt++) {
      const id = await resolveFile();
      if (!id) {
        const text = serialize(hooks.getDoc());
        const { body, headers } = multipart({ name: FILE_NAME, parents: [FOLDER_ID], mimeType: 'application/json' }, text);
        const f = await api(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', body, headers });
        ls('tm-fileid', f.id);
        await dailyBackup(text).catch(() => {});
        done = true;
        break;
      }
      const m1 = await getMeta(id);
      const remote = await readJson(id);
      const local = hooks.getDoc();
      const merged = mergeDocs(local, remote);
      if (!sameEntities(merged, local)) await hooks.applyMerged(merged);
      if (remote && sameEntities(merged, remote)) { done = true; break; }
      const m2 = await getMeta(id);
      if (m2.headRevisionId !== m1.headRevisionId) continue; // 그 사이 다른 기기가 저장 → 다시 읽기
      const text = serialize(merged);
      await writeJson(id, text);
      await dailyBackup(text).catch(() => {});
      done = true;
    }
    if (!done) throw new Error('충돌이 계속되어 중단했습니다 (잠시 후 다시 시도)');
    lastSync = nowKST().date + ' ' + nowKST().time;
    ls('tm-last', lastSync);
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
  if (ls('tm-signed') !== '1') return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function signIn() {
  try {
    await loadGis();
    await requestToken(ls('tm-signed') === '1' ? '' : 'consent');
    ls('tm-signed', '1');
    await syncNow();
  } catch (e) { setStatus(e.offline ? 'offline' : 'needs-auth', e.message); }
}
export function signOut() {
  try { if (token) google.accounts.oauth2.revoke(token, () => {}); } catch { /* 무시 */ }
  token = null; tokenExp = 0;
  ls('tm-signed', null); ls('tm-fileid', null);
  setStatus('off');
}

export function init(h) {
  hooks = { ...hooks, ...h };
  if (ls('tm-signed') === '1') {
    setStatus('needs-auth');
    loadGis().then(() => syncNow()).catch(() => setStatus('offline'));
    // 자동 로그인이 팝업 차단으로 실패하면, 첫 터치에서 다시 시도
    addEventListener('pointerdown', () => { if (status === 'needs-auth' && !syncing) syncNow(); }, { once: false, capture: true });
  } else setStatus('off');
  addEventListener('online', () => schedule(500));
  addEventListener('offline', () => { if (ls('tm-signed') === '1') setStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(500); });
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);
}
