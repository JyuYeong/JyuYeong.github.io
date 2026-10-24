// Google Drive 동기화 (M3): im-meta.json(평문, 비밀 없음) + im-personal.json·im-work.json(암호문)
// 항목별 최신 수정 우선 병합(Task Manager M3.1과 같은 규칙), 금고 ID가 다르면 멈추고 사용자에게 묻는다
import { CLIENT_ID, FOLDER_ID, SCOPE } from './config.js';
import * as C from './crypto.js';
import { mergeDocs, sameEntities } from './store.js';

const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
export const FILES = { meta: 'im-meta.json', personal: 'im-personal.json', work: 'im-work.json' };
const KINDS = ['personal', 'work'];
const KEEP_BACKUPS = 14;

const ls = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch { /* 무시 */ }
  return null;
};
const todayKST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nowLabel = () => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

// ---------- 상태 ----------
// hooks.get() → { unlocked, meta, dek, personal, work }
let hooks = { get: () => ({}), applyMeta: async () => {}, applyDoc: async () => {}, onConflict: () => {}, onStatus: () => {} };
let token = null, tokenExp = 0, client = null, gisPromise = null, cur = null;
let status = 'off', detail = '', lastSync = ls('im-last');
let syncing = false, pending = false, timer = null;
export const isSignedIn = () => ls('im-signed') === '1';
export const getState = () => ({ status, detail, lastSync, signedIn: isSignedIn() });
function setStatus(s, d = '') { status = s; detail = d; hooks.onStatus(getState()); }

// ---------- 로그인 (GIS 토큰 클라이언트, 토큰은 메모리에만) ----------
export function loadGis() {
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
  await requestToken(isSignedIn() ? '' : 'consent');
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
  const b = 'im' + Math.random().toString(36).slice(2);
  return {
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${b}--`,
  };
}
const qs = s => encodeURIComponent(s);
const inFolder = `'${FOLDER_ID}' in parents and trashed=false`;

// 파일 ID: 캐시(localStorage) → 없거나 지워졌으면 폴더에서 이름으로 찾는다 (여러 개면 가장 오래된 것)
async function fileId(kind) {
  const key = 'im-fid-' + kind;
  const cached = ls(key);
  if (cached) {
    try {
      const f = await api(`${API}/files/${cached}?fields=id,trashed`);
      if (!f.trashed) return cached;
    } catch (e) { if (e.status !== 404) throw e; }
    ls(key, null);
  }
  const r = await api(`${API}/files?q=${qs(`name='${FILES[kind]}' and ${inFolder}`)}&orderBy=createdTime&pageSize=10&fields=files(id)`);
  const id = r.files?.[0]?.id || null;
  if (id) ls(key, id);
  return id;
}
const revision = id => api(`${API}/files/${id}?fields=headRevisionId`).then(m => m.headRevisionId);
async function readJson(id) {
  const txt = await (await api(`${API}/files/${id}?alt=media`, { raw: true })).text();
  if (!txt.trim()) return null;
  try { return JSON.parse(txt); } catch { throw new Error('Drive 파일이 손상되었습니다'); }
}
async function writeFile(kind, obj) {
  const text = JSON.stringify(obj);
  const id = await fileId(kind);
  if (id) await api(`${UP}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: text });
  else {
    const { body, headers } = multipart({ name: FILES[kind], parents: [FOLDER_ID], mimeType: 'application/json' }, text);
    const f = await api(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', body, headers });
    ls('im-fid-' + kind, f.id);
  }
  return text;
}
async function createFile(name, text) {
  const { body, headers } = multipart({ name, parents: [FOLDER_ID], mimeType: 'application/json' }, text);
  return api(`${UP}/files?uploadType=multipart&fields=id`, { method: 'POST', body, headers });
}
async function trash(id) {
  return api(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
}

// 일일 백업: 종류별 하루 한 번, 암호문 그대로. 최근 14개 유지
async function dailyBackup(kind, text) {
  const today = todayKST();
  const flag = 'im-backup-' + kind;
  if (ls(flag) === today) return;
  const name = `im-backup-${today.replaceAll('-', '')}-${kind}.json`;
  const ex = await api(`${API}/files?q=${qs(`name='${name}' and ${inFolder}`)}&fields=files(id)`);
  if (!ex.files?.length) await createFile(name, text);
  ls(flag, today);
  const all = await api(`${API}/files?q=${qs(`name contains 'im-backup-' and name contains '-${kind}.json' and ${inFolder}`)}&orderBy=name desc&pageSize=100&fields=files(id,name)`);
  for (const f of (all.files || []).slice(KEEP_BACKUPS)) await trash(f.id);
}

// ---------- 동기화 ----------
// 잠금을 푼 상태에서만 동작한다 (병합하려면 데이터 키가 필요)
export async function syncNow() {
  if (!isSignedIn()) return;
  if (status === 'conflict') return; // 사용자가 정할 때까지 멈춤
  if (syncing) { pending = true; return; }
  const st = hooks.get();
  if (!st.unlocked || !st.dek) return;
  syncing = true;
  setStatus('syncing');
  const dek = st.dek;
  const stillOpen = () => { const s = hooks.get(); return s.unlocked && s.dek === dek; };
  try {
    await ensureToken();
    const metaId = await fileId('meta');
    const remoteMeta = metaId ? await readJson(metaId) : null;
    if (!stillOpen()) return;
    let meta = hooks.get().meta;
    if (!remoteMeta) {
      // Drive가 비어 있음: 이 기기의 금고를 처음으로 올린다
      await writeFile('meta', meta);
    } else if (remoteMeta.vault_id !== meta.vault_id) {
      setStatus('conflict', 'Drive에 다른 금고가 있습니다');
      hooks.onConflict(remoteMeta);
      return;
    } else if ((remoteMeta.updated_at || '') > (meta.updated_at || '')) {
      await hooks.applyMeta(remoteMeta); // 다른 기기에서 PIN을 바꾸었거나 복구 키를 다시 만듦
    } else if ((meta.updated_at || '') > (remoteMeta.updated_at || '')) {
      await writeFile('meta', meta);
    }
    for (const kind of KINDS) {
      let done = false;
      for (let attempt = 0; attempt < 3 && !done; attempt++) {
        if (!stillOpen()) return;
        const id = await fileId(kind);
        const rev1 = id ? await revision(id) : null;
        const blob = id ? await readJson(id) : null;
        let remote = null;
        if (blob) {
          try { remote = await C.decryptDoc(dek, blob, kind); }
          catch { throw new Error('Drive 데이터를 열 수 없습니다 (금고 키 불일치)'); }
        }
        if (!stillOpen()) return;
        const local = hooks.get()[kind];
        const merged = mergeDocs(local, remote);
        if (!sameEntities(merged, local)) await hooks.applyDoc(kind, merged);
        if (remote && sameEntities(merged, remote)) { done = true; break; }
        if (id && (await revision(id)) !== rev1) continue; // 그 사이 다른 기기가 저장 → 다시 읽기
        const text = await writeFile(kind, await C.encryptDoc(dek, merged, kind));
        await dailyBackup(kind, text).catch(() => {});
        done = true;
      }
      if (!done) throw new Error('다른 기기와 저장이 겹쳐 중단했습니다. 잠시 후 다시 시도합니다');
    }
    lastSync = nowLabel();
    ls('im-last', lastSync);
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
export function schedule(delay = 2000) {
  if (!isSignedIn() || status === 'conflict') return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

// Drive에 있는 금고(메타·암호문)를 그대로 받아 온다. 복호화하지 않는다. 없으면 null
export async function fetchVault() {
  await ensureToken();
  const metaId = await fileId('meta');
  if (!metaId) return null;
  const meta = await readJson(metaId);
  if (!meta?.wrapped_keys) return null;
  const out = { meta };
  for (const kind of KINDS) { const id = await fileId(kind); out[kind] = id ? await readJson(id) : null; }
  return out;
}
// 이 기기 금고로 Drive를 덮어쓴다. 덮어쓰기 전 Drive 파일은 im-replaced-…로 남긴다
export async function overwriteRemote({ meta, personal, work }) {
  await ensureToken();
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  for (const kind of ['meta', ...KINDS]) {
    const id = await fileId(kind);
    if (id) { const txt = JSON.stringify(await readJson(id)); await createFile(`im-replaced-${stamp}-${kind}.json`, txt); }
  }
  await writeFile('meta', meta);
  if (personal) await writeFile('personal', personal);
  if (work) await writeFile('work', work);
  setStatus('idle');
}
export function clearConflict() { if (status === 'conflict') setStatus('idle'); }

// 버튼을 눌러 로그인 (팝업). 처음이면 동의 화면
export async function signIn() {
  try {
    await loadGis();
    await requestToken(isSignedIn() ? '' : 'consent');
    ls('im-signed', '1');
    setStatus('idle');
    return true;
  } catch (e) { setStatus(e.offline ? 'offline' : 'needs-auth', e.message); return false; }
}
// 이 기기에서만 연결을 끊는다. 클라이언트 ID를 Task Manager와 같이 쓰므로 Google 권한(revoke)은 건드리지 않는다
export function signOut() {
  token = null; tokenExp = 0; clearTimeout(timer);
  for (const k of ['im-signed', 'im-fid-meta', 'im-fid-personal', 'im-fid-work', 'im-last']) ls(k, null);
  lastSync = null;
  setStatus('off');
}

export function init(h) {
  hooks = { ...hooks, ...h };
  setStatus(isSignedIn() ? 'idle' : 'off');
  if (isSignedIn()) loadGis().catch(() => {});
  // 자동 로그인이 팝업 차단 등으로 실패하면 첫 터치에서 다시 시도
  addEventListener('pointerdown', () => { if (status === 'needs-auth' && !syncing && hooks.get().unlocked) syncNow(); }, { capture: true });
  addEventListener('online', () => schedule(500));
  addEventListener('offline', () => { if (isSignedIn()) setStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(500); });
  setInterval(() => { if (document.visibilityState === 'visible' && hooks.get().unlocked) schedule(0); }, 60000);
}
