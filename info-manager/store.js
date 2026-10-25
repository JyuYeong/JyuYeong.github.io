// 데이터 모델 + IndexedDB 저장 (M1: 이 기기에만 저장, 저장되는 것은 메타와 암호문뿐)
const DB_NAME = 'info-manager';
const STORE = 'kv';
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
const PURGE_DAYS = 180;

export const SCHEMA_VERSION = 1;
export const PROVIDER_COLORS = ['#4285F4', '#03C75A', '#FEE500', '#1F1F1F', '#6E5494', '#E4405F', '#0A66C2', '#FF6F00', '#00897B', '#7A7F8C'];

// 소셜 프리셋: 실제 로고 대신 첫 글자 배지 + 색으로 표시한다 (아이콘 이미지는 사용자가 올릴 수 있음)
export const PRESETS = [
  { preset: 'google', name: 'Google', color: '#4285F4' },
  { preset: 'naver', name: 'Naver', color: '#03C75A' },
  { preset: 'kakao', name: 'Kakao', color: '#FEE500' },
  { preset: 'apple', name: 'Apple', color: '#1F1F1F' },
  { preset: 'github', name: 'GitHub', color: '#6E5494' },
];

// ---------- 공통 ----------
export const nowIso = () => new Date().toISOString();
function randId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return prefix + Array.from(bytes, b => ID_CHARS[b % ID_CHARS.length]).join('');
}
function uniqueId(prefix, arr) {
  const used = new Set(arr.map(x => x.id));
  let id;
  do { id = randId(prefix); } while (used.has(id));
  return id;
}
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export const cmpText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
export const live = arr => (arr || []).filter(x => !x.deleted_at);

// 배지 글자색: 배경이 밝으면 검정, 어두우면 흰색
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.4 ? '#1B1F2A' : '#fff';
}
// 배지 글자: 첫 글자(영문은 대문자)
export const initialOf = s => (String(s || '').trim()[0] || '?').toUpperCase();

// ---------- 개인용 문서 ----------
export function emptyPersonal() {
  return { schema_version: SCHEMA_VERSION, updated_at: nowIso(), accounts: [], notes: [], providers: [], social_accounts: [] };
}
export function emptyWork() {
  return { schema_version: SCHEMA_VERSION, updated_at: nowIso(), nodes: [] };
}
export function seedPresets(doc) {
  const ts = nowIso();
  PRESETS.forEach((p, i) => {
    if (doc.providers.some(x => x.preset === p.preset)) return;
    doc.providers.push({ id: uniqueId('SP-', doc.providers), name: p.name, preset: p.preset, color: p.color, icon: null, order: i, created_at: ts, updated_at: ts, deleted_at: null });
  });
}

export function createAccount(doc, fields = {}) {
  const ts = nowIso();
  const a = {
    id: uniqueId('A-', doc.accounts),
    service: '', aliases: [], login_type: 'direct', provider_id: null, social_account_id: null,
    login_id: '', password: '', url: '', memo: '', extra: [],
    created_at: ts, updated_at: ts, deleted_at: null,
    ...fields,
  };
  doc.accounts.push(a);
  return a;
}
export function createNote(doc, fields = {}) {
  const ts = nowIso();
  const n = { id: uniqueId('N-', doc.notes), title: '', body: '', created_at: ts, updated_at: ts, deleted_at: null, ...fields };
  doc.notes.push(n);
  return n;
}
export function createProvider(doc, name, color) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return null;
  const ts = nowIso();
  const order = live(doc.providers).reduce((m, p) => Math.max(m, p.order ?? 0), -1) + 1;
  const p = { id: uniqueId('SP-', doc.providers), name, preset: null, color: color || PROVIDER_COLORS[order % PROVIDER_COLORS.length], icon: null, order, created_at: ts, updated_at: ts, deleted_at: null };
  doc.providers.push(p);
  return p;
}
export function createSocialAccount(doc, providerId, label) {
  label = String(label || '').trim().slice(0, 120);
  if (!label || !providerId) return null;
  const dup = live(doc.social_accounts).find(s => s.provider_id === providerId && s.label.toLowerCase() === label.toLowerCase());
  if (dup) return dup;
  const ts = nowIso();
  const s = { id: uniqueId('SA-', doc.social_accounts), provider_id: providerId, label, created_at: ts, updated_at: ts, deleted_at: null };
  doc.social_accounts.push(s);
  return s;
}
export function softDelete(item) {
  const ts = nowIso();
  item.deleted_at = ts;
  item.updated_at = ts;
}

// 계정 저장 규칙: 소셜 로그인이면 ID·PW를 비운다, 별칭은 공백 제거·중복 제거
// 추가 항목 확인: KEY 없이 값만 있거나 같은 KEY가 두 번이면 오류 문구, 아니면 null
export function extraError(extra) {
  const seen = new Set();
  for (const x of extra || []) {
    const k = String(x.key || '').trim(), v = String(x.value ?? '');
    if (!k && !v) continue;
    if (!k) return '추가 항목의 KEY를 입력하세요';
    if (seen.has(k.toLowerCase())) return `추가 항목에 같은 KEY(${k})가 두 번 있습니다`;
    seen.add(k.toLowerCase());
  }
  return null;
}
export function normalizeAccount(a) {
  a.extra = (a.extra || []).map(x => ({ key: String(x.key || '').trim().slice(0, 60), value: String(x.value ?? '').slice(0, 2000) })).filter(x => x.key);
  a.service = String(a.service || '').trim().slice(0, 80);
  a.aliases = [...new Map((a.aliases || []).map(s => String(s).trim().slice(0, 40)).filter(Boolean).map(s => [s.toLowerCase(), s])).values()];
  a.url = String(a.url || '').trim();
  if (a.login_type === 'social') {
    a.login_id = '';
    a.password = '';
    if (!a.provider_id) a.login_type = 'direct';
  } else {
    a.login_type = 'direct';
    a.provider_id = null;
    a.social_account_id = null;
  }
  return a;
}

// 사용 중인 개수 (삭제 막기용)
export const providerUsage = (doc, pid) => live(doc.accounts).filter(a => a.login_type === 'social' && a.provider_id === pid).length;
export const socialUsage = (doc, sid) => live(doc.accounts).filter(a => a.login_type === 'social' && a.social_account_id === sid).length;

// 계정 목록: 서비스명(대소문자 무시)으로 묶고, 묶음은 서비스명 순, 묶음 안은 ID(또는 연동 계정) 순
export function groupAccounts(doc, labelOf) {
  const map = new Map();
  for (const a of live(doc.accounts)) {
    const key = a.service.trim().toLowerCase() || '(이름 없음)';
    if (!map.has(key)) map.set(key, { name: a.service.trim() || '(이름 없음)', items: [] });
    map.get(key).items.push(a);
  }
  const groups = [...map.values()].sort((x, y) => cmpText(x.name, y.name));
  for (const g of groups) g.items.sort((x, y) => cmpText(labelOf(x), labelOf(y)) || cmpText(x.created_at, y.created_at));
  return groups;
}
export const sortedNotes = doc => live(doc.notes).sort((a, b) => cmpText(a.title, b.title) || cmpText(a.created_at, b.created_at));
export const sortedProviders = doc => live(doc.providers).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || cmpText(a.name, b.name));
export const socialOf = (doc, pid) => live(doc.social_accounts).filter(s => s.provider_id === pid).sort((a, b) => cmpText(a.label, b.label));

// URL 열기용: 스킴이 없으면 https:// 를 붙이고, http(s)만 허용
export function safeHref(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s;
  try {
    const u = new URL(withScheme);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch { return null; }
}

// ---------- 병합 (M3 동기화용, Task Manager M3.1 규칙과 동일) ----------
const META = new Set(['schema_version', 'updated_at']);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const isEntityArray = a => Array.isArray(a) && a.every(e => e && typeof e.id === 'string');
// 문서 두 개의 항목 내용이 같은지 (updated_at 등 문서 메타는 무시)
export function sameEntities(a, b) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => !META.has(k)).sort();
  const norm = d => JSON.stringify(keys.map(k => { const v = d?.[k]; return [k, isEntityArray(v) ? [...v].sort(byId) : (v ?? [])]; }));
  return norm(a) === norm(b);
}
export function mergeDocs(local, remote, now = Date.now()) {
  const out = { schema_version: Math.max(local.schema_version || 1, remote?.schema_version || 1), updated_at: '' };
  const remoteNewer = (remote?.updated_at || '') > (local.updated_at || '');
  const keys = [...new Set([...Object.keys(local || {}), ...Object.keys(remote || {})])].filter(k => !META.has(k));
  for (const k of keys) {
    const l = local[k], r = remote?.[k];
    if ((l === undefined || isEntityArray(l)) && (r === undefined || isEntityArray(r))) {
      const map = new Map();
      for (const e of l || []) map.set(e.id, e);
      for (const e of r || []) {
        const cur = map.get(e.id);
        if (!cur || (e.updated_at || '') > (cur.updated_at || '')) map.set(e.id, e);
      }
      out[k] = [...map.values()].filter(e => !(e.deleted_at && now - Date.parse(e.deleted_at) > PURGE_DAYS * 86400000)).sort(byId);
    } else {
      out[k] = l === undefined ? r : r === undefined ? l : remoteNewer ? r : l;
    }
  }
  out.updated_at = [local.updated_at, remote?.updated_at].filter(Boolean).sort().pop() || nowIso();
  return out;
}

// ---------- IndexedDB (키: meta, personal, work) ----------
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
export async function get(key) {
  try { const v = await tx('readonly', s => s.get(key)); storageOk = true; return v ?? null; }
  catch { storageOk = false; return null; }
}
// 여러 키를 한 트랜잭션으로 저장 (메타와 문서를 함께 바꿀 때 어긋나지 않게)
export async function putMany(entries) {
  try {
    await tx('readwrite', s => { let last; for (const [k, v] of Object.entries(entries)) last = s.put(v, k); return last; });
    storageOk = true;
  } catch { storageOk = false; }
  return storageOk;
}
export const put = (key, value) => putMany({ [key]: value });
// 이 기기의 Info Manager 데이터 전체 삭제 (설정 > 이 기기 데이터 삭제에서만 호출)
export async function clearAll() {
  try { await tx('readwrite', s => s.clear()); } catch { /* 무시 */ }
}

// ---------- 업무용 트리 (M2) ----------
// 노드: { id: 'W-…', parent_id, type: 'folder'|'field', name, value, masked, created_at, updated_at, deleted_at }
export const QUICK_KEYS = [
  { key: 'ID', masked: false }, { key: 'PW', masked: true }, { key: 'IP', masked: false },
  { key: 'URL', masked: false }, { key: 'PK', masked: true },
];
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
export const nodeById = (doc, id) => (id ? live(doc.nodes).find(n => n.id === id) || null : null);
export function childrenOf(doc, parentId) {
  const kids = live(doc.nodes).filter(n => (n.parent_id || null) === (parentId || null));
  const by = (a, b) => cmpText(a.name, b.name) || cmpText(a.created_at, b.created_at);
  return { folders: kids.filter(n => n.type === 'folder').sort(by), fields: kids.filter(n => n.type === 'field').sort(by) };
}
// 최상위부터 해당 노드까지 (자기 자신 포함). 부모가 사라졌으면 거기서 끊는다
export function pathOf(doc, id) {
  const out = [], seen = new Set();
  let cur = nodeById(doc, id);
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = nodeById(doc, cur.parent_id); }
  return out;
}
export function descendantsOf(doc, id) {
  const out = [], stack = [id], seen = new Set([id]);
  while (stack.length) {
    const pid = stack.pop();
    for (const n of live(doc.nodes)) if (n.parent_id === pid && !seen.has(n.id)) { seen.add(n.id); out.push(n); stack.push(n.id); }
  }
  return out;
}
export function nameTaken(doc, parentId, type, name, exceptId = null) {
  return live(doc.nodes).some(n => n.id !== exceptId && (n.parent_id || null) === (parentId || null) && n.type === type && sameName(n.name, name));
}
// 성공하면 { node }, 실패하면 { error }
export function createNode(doc, parentId, type, fields = {}) {
  const name = String(fields.name || '').trim().slice(0, 100);
  if (!name) return { error: type === 'folder' ? '폴더 이름을 입력하세요' : 'key를 입력하세요' };
  if (type === 'folder' && name.includes('/')) return { error: '폴더 이름에는 /를 쓸 수 없습니다' };
  if (parentId && !nodeById(doc, parentId)) return { error: '상위 폴더가 없습니다' };
  if (nameTaken(doc, parentId, type, name)) return { error: type === 'folder' ? '같은 이름의 폴더가 이미 있습니다' : '같은 key가 이미 있습니다' };
  const ts = nowIso();
  const node = { id: uniqueId('W-', doc.nodes), parent_id: parentId || null, type, name, created_at: ts, updated_at: ts, deleted_at: null };
  if (type === 'field') { node.value = String(fields.value ?? ''); node.masked = fields.masked !== false; }
  doc.nodes.push(node);
  return { node };
}
export function updateNode(doc, node, patch) {
  const next = { ...patch };
  if ('name' in next) {
    next.name = String(next.name || '').trim().slice(0, 100);
    if (!next.name) return { error: node.type === 'folder' ? '폴더 이름을 입력하세요' : 'key를 입력하세요' };
    if (node.type === 'folder' && next.name.includes('/')) return { error: '폴더 이름에는 /를 쓸 수 없습니다' };
    if (nameTaken(doc, node.parent_id, node.type, next.name, node.id)) return { error: node.type === 'folder' ? '같은 이름의 폴더가 이미 있습니다' : '같은 key가 이미 있습니다' };
  }
  if ('value' in next) next.value = String(next.value ?? '');
  if ('masked' in next) next.masked = !!next.masked;
  Object.assign(node, next, { updated_at: nowIso() });
  return { node };
}
// 이동할 수 있는 대상인지: 자기 자신·하위 폴더 금지, 대상 폴더의 같은 이름 금지
export function moveError(doc, node, targetId) {
  targetId = targetId || null;
  if ((node.parent_id || null) === targetId) return '지금 있는 폴더입니다';
  if (targetId && !nodeById(doc, targetId)) return '대상 폴더가 없습니다';
  if (node.type === 'folder' && (targetId === node.id || descendantsOf(doc, node.id).some(n => n.id === targetId))) return '자기 자신이나 하위 폴더로는 옮길 수 없습니다';
  if (nameTaken(doc, targetId, node.type, node.name, node.id)) return node.type === 'folder' ? '대상 폴더에 같은 이름의 폴더가 있습니다' : '대상 폴더에 같은 key가 있습니다';
  return null;
}
export function moveNode(doc, node, targetId) {
  const err = moveError(doc, node, targetId);
  if (err) return { error: err };
  node.parent_id = targetId || null;
  node.updated_at = nowIso();
  return { node };
}
// 폴더면 하위 전체를 같은 시각으로 소프트 삭제. 지운 개수를 돌려준다
export function deleteNode(doc, node) {
  const all = [node, ...(node.type === 'folder' ? descendantsOf(doc, node.id) : [])];
  const ts = nowIso();
  for (const n of all) { n.deleted_at = ts; n.updated_at = ts; }
  return all.length;
}
export function countUnder(doc, id) {
  const d = descendantsOf(doc, id);
  return { folders: d.filter(n => n.type === 'folder').length, fields: d.filter(n => n.type === 'field').length };
}

// 'a/b/c' 경로를 parentId 아래에 만든다. 이미 있는 폴더(대소문자 무시)는 그대로 쓰고 없는 단계만 만든다
export function splitPath(text) {
  return String(text || '').split('/').map(p => p.trim()).filter(Boolean);
}
// 실제로 만들지 않고 계획만: { segments, existing: [노드], toCreate: [이름], error }
export function planPath(doc, parentId, text) {
  const segments = splitPath(text);
  if (!segments.length) return { segments, existing: [], toCreate: [], error: '폴더 이름을 입력하세요' };
  if (segments.some(s => s.length > 100)) return { segments, existing: [], toCreate: [], error: '폴더 이름은 100자까지입니다' };
  const existing = [];
  let pid = parentId || null, i = 0;
  for (; i < segments.length; i++) {
    const f = live(doc.nodes).find(n => n.type === 'folder' && (n.parent_id || null) === pid && sameName(n.name, segments[i]));
    if (!f) break;
    existing.push(f);
    pid = f.id;
  }
  return { segments, existing, toCreate: segments.slice(i), error: null };
}
// 성공하면 { node: 마지막 폴더, created: [새로 만든 노드] }
export function createPath(doc, parentId, text) {
  const plan = planPath(doc, parentId, text);
  if (plan.error) return { error: plan.error };
  let pid = plan.existing.length ? plan.existing[plan.existing.length - 1].id : parentId || null;
  const created = [];
  for (const name of plan.toCreate) {
    const r = createNode(doc, pid, 'folder', { name });
    if (r.error) return { error: r.error };
    created.push(r.node);
    pid = r.node.id;
  }
  return { node: nodeById(doc, pid), created };
}
