// Google Drive 동기화 (M3): em-data.json 한 파일, 항목별 최신 수정 우선 병합, 모르는 키 보존, 일일 백업
// Task Manager의 sync.js(M3.1 이후)와 같은 방식. 파일 이름·localStorage 키만 Expense Manager용(em-)으로 바꿨다
import { CLIENT_ID, FOLDER_ID, SCOPE } from './config.js';
import { todayKst, PURGE_DAYS } from './store.js';

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
export const FILE_NAME = 'em-data.json';
const BACKUP_PREFIX = 'em-backup-';
const KEEP_BACKUPS = 14;
const KEYS = ['expenses', 'methods', 'categories', 'templates', 'themes', 'fixed', 'ticker', 'settings'];

const ls = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch { /* 무시 */ }
  return null;
};
const nowText = () => { const k = new Date(Date.now() + 9 * 3600e3).toISOString(); return `${k.slice(0, 10)} ${k.slice(11, 16)}`; };

// ---------- 병합 (순수 함수) ----------
// id를 가진 배열은 항목별로 updated_at이 최신인 쪽을 고르고, 그 밖의 최상위 값은 더 최근 문서의 것을 쓴다 (모르는 키도 보존)
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
export const serialize = d => JSON.stringify(d, null, 1);

// ---------- 상태 ----------
let hooks = { getDoc: () => null, applyMerged: () => {}, onStatus: () => {} };
let token = null, tokenExp = 0, client = null, gisPromise = null;
let status = 'off', detail = '', lastSync = ls('em-last');
let syncing = false, pending = false, timer;
let cur = null;

export const signedIn = () => ls('em-signed') === '1';
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
    s.onerror = () => { gisPromise = null; reject(Object.assign(new Error('Google 로그인 스크립트를 불러오지 못했습니다'), { offline: true })); };
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
async function ensureToken(prompt) {
  if (token && Date.now() < tokenExp - 60000) return;
  await loadGis();
  await requestToken(prompt ?? (signedIn() ? '' : 'consent'));
}

// ---------- Drive API ----------
async function api(url, { method = 'GET', headers = {}, body, raw = false } = {}) {
  if (navigator.onLine === false) throw Object.assign(new Error('오프라인'), { offline: true });
  let r;
  try { r = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + token, ...headers } }); }
  catch { throw Object.assign(new Error('네트워크 오류'), { offline: true }); }
  if (r.status === 401) { token = null; tokenExp = 0; throw Object.assign(new Error('로그인이 만료되었습니다'), { auth: true }); }
  if (!r.ok) throw Object.assign(new Error('Drive 오류 ' + r.status), { status: r.status });
  if (raw) return r;
  return r.status === 204 ? null : r.json();
}
function multipart(meta, content) {
  const b = 'em' + Math.random().toString(36).slice(2);
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`,
  };
}
const q = s => encodeURIComponent(s);

async function resolveFile() {
  const cached = ls('em-fileid');
  if (cached) {
    try { const f = await api(`${API}/files/${cached}?fields=id,trashed`); if (!f.trashed) return cached; }
    catch (e) { if (e.status !== 404) throw e; }
    ls('em-fileid', null);
  }
  const r = await api(`${API}/files?q=${q(`name='${FILE_NAME}' and trashed=false`)}&orderBy=createdTime&pageSize=10&fields=files(id,createdTime)`);
  const id = r.files?.[0]?.id || null; // 여러 개면 가장 오래된 것
  if (id) ls('em-fileid', id);
  return id;
}
const getMeta = id => api(`${API}/files/${id}?fields=headRevisionId,modifiedTime`);
async function readJson(id) {
  const txt = await (await api(`${API}/files/${id}?alt=media`, { raw: true })).text();
  if (!txt.trim()) return null;
  try { return JSON.parse(txt); } catch { throw new Error('Drive 파일을 읽을 수 없습니다 (내용 손상)'); }
}
const writeJson = (id, text) => api(`${UP}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text });

async function dailyBackup(text) {
  const today = todayKst();
  if (ls('em-backup') === today) return;
  const name = `${BACKUP_PREFIX}${today.replaceAll('-', '')}.json`;
  const ex = await api(`${API}/files?q=${q(`name='${name}' and trashed=false`)}&fields=files(id)`);
  if (!ex.files?.length) {
    const { body, headers } = multipart({ name, parents: [FOLDER_ID], mimeType: 'application/json' }, text);
    await api(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', body, headers });
  }
  ls('em-backup', today);
  const all = await api(`${API}/files?q=${q(`name contains '${BACKUP_PREFIX}' and trashed=false`)}&orderBy=name desc&pageSize=100&fields=files(id,name)`);
  for (const f of (all.files || []).slice(KEEP_BACKUPS)) {
    await api(`${API}/files/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}

// ---------- 동기화 ----------
export async function syncNow() {
  if (!signedIn()) return;
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
        ls('em-fileid', f.id);
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
      if (m2.headRevisionId !== m1.headRevisionId) continue; // 그 사이 다른 기기가 저장했으면 다시 읽는다
      const text = serialize(merged);
      await writeJson(id, text);
      await dailyBackup(text).catch(() => {});
      done = true;
    }
    if (!done) throw new Error('충돌이 계속되어 중단했습니다 (잠시 후 다시 시도)');
    lastSync = nowText();
    ls('em-last', lastSync);
    setStatus('ok');
  } catch (e) {
    if (e.auth) setStatus('needs-auth', e.message);
    else if (e.offline) setStatus('offline', e.message);
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
    ls('em-signed', '1');
    await syncNow();
  } catch (e) { setStatus(e.offline ? 'offline' : 'needs-auth', e.message); }
}
export function signOut() {
  try { if (token) google.accounts.oauth2.revoke(token, () => {}); } catch { /* 무시 */ }
  token = null; tokenExp = 0;
  ls('em-signed', null); ls('em-fileid', null);
  setStatus('off');
}
// 동기화를 켜지 않은 상태에서 Google 로그인으로 Drive 파일을 읽는다 (새 기기에서 불러오기, PIN 재설정 확인용)
// 돌려주는 값: { doc } 또는 { doc: null } (Drive에 파일 없음). 로그인 실패는 예외
export async function fetchRemote() {
  await loadGis();
  await requestToken(signedIn() ? '' : 'consent');
  const id = await resolveFile();
  if (!id) return { doc: null };
  return { doc: await readJson(id) };
}
export const markSignedIn = () => ls('em-signed', '1');
// 이 기기 데이터 지우기용: 동기화 기록만 지운다 (Google 권한은 그대로)
export function forgetDevice() { token = null; tokenExp = 0; ['em-signed', 'em-fileid', 'em-last', 'em-backup'].forEach(k => ls(k, null)); }

export function init(h) {
  hooks = { ...hooks, ...h };
  if (signedIn()) {
    setStatus('needs-auth');
    loadGis().then(() => syncNow()).catch(() => setStatus('offline'));
    // 자동 로그인이 팝업 차단으로 실패하면, 첫 터치에서 다시 시도
    addEventListener('pointerdown', () => { if (status === 'needs-auth' && !syncing && signedIn()) syncNow(); }, { capture: true });
  } else setStatus('off');
  addEventListener('online', () => schedule(500));
  addEventListener('offline', () => { if (signedIn()) setStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(500); });
  setInterval(() => { if (document.visibilityState === 'visible') schedule(0); }, 60000);
}
