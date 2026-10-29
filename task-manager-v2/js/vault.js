// 보안 영역 상태·데이터 (V5)
// 이 기기 저장: vault-meta(평문 메타), vault(암호문), vault-device(PIN으로 감싼 키)
// 잠금 해제 중에만 키(dek)와 평문 문서(doc)를 메모리에 둔다. 잠그면 모두 버린다
import * as C from './vcrypto.js';
import * as S from './store.js';

export const V = { meta: null, blob: null, device: null, dek: null, doc: null, unlocked: false, conflict: null };
const listeners = [];
export const onVaultChange = fn => listeners.push(fn);
const notify = (what = 'data') => listeners.forEach(f => f(what));
const live = arr => (arr || []).filter(x => !x.deleted_at);
const nowIso = () => new Date().toISOString();
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export const cmpText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
function uniqueId(prefix, arr) {
  const used = new Set(arr.map(x => x.id));
  let id;
  do { id = prefix + Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ID_CHARS[b % ID_CHARS.length]).join(''); } while (used.has(id));
  return id;
}
export const emptyVaultDoc = () => ({ schema: 'tm2-vault-doc', nodes: [], memos: [] });
export function normalizeVaultDoc(d) {
  const out = { ...emptyVaultDoc(), ...(d || {}) };
  for (const k of ['nodes', 'memos']) if (!Array.isArray(out[k])) out[k] = [];
  for (const x of [...out.nodes, ...out.memos]) if (!Array.isArray(x.label_ids)) x.label_ids = [];
  const cut = new Date(Date.now() - 30 * 86400000).toISOString();
  out.nodes = out.nodes.filter(x => !x.deleted_at || x.deleted_at > cut);
  out.memos = out.memos.filter(x => !x.deleted_at || x.deleted_at > cut);
  return out;
}

// ---------- 불러오기·저장 ----------
export async function loadVault() {
  V.meta = await S.kvGet('vault-meta');
  V.blob = await S.kvGet('vault');
  V.device = await S.kvGet('vault-device');
  if (V.device && (!V.meta || V.device.vault_id !== V.meta.vault_id)) { V.device = null; await S.kvDel('vault-device'); }
}
let saveTimer, saving = Promise.resolve(), pending = false;
// 평문 문서를 암호화해 이 기기에 저장 (잠금 해제 중에만). 바뀐 것이 없으면 다시 암호화하지 않는다
// (암호문은 할 때마다 달라지므로, 불필요하게 다시 만들면 동기화가 "이 기기에서 고침"으로 오해한다)
export function saveDoc(now = false) {
  pending = true;
  clearTimeout(saveTimer);
  const run = () => (saving = saving.then(async () => {
    if (!pending || !V.unlocked || !V.dek || !V.doc || !V.meta) return;
    pending = false;
    V.blob = await C.encryptDoc(V.dek, V.doc, V.meta.vault_id);
    await S.kvPut('vault', V.blob);
    notify('saved');
  }));
  if (now) return run();
  saveTimer = setTimeout(run, 300);
  return saving;
}
export function flush() {
  if (!pending) return saving;
  clearTimeout(saveTimer);
  return saveDoc(true);
}
async function openDoc(dek) {
  V.dek = dek;
  if (V.blob && V.blob.vault_id !== V.meta.vault_id) { V.conflict = 'blob'; V.doc = emptyVaultDoc(); }
  else V.doc = V.blob ? normalizeVaultDoc(await C.decryptDoc(dek, V.blob)) : emptyVaultDoc();
  V.unlocked = true;
  notify('unlock');
}

// ---------- 처음 만들기 / 기기 등록 / 잠금 해제 ----------
export async function createVault(password, pin) {
  const { meta, dek, recovery } = await C.createVault(password);
  V.meta = meta; V.blob = null;
  V.device = await C.wrapForDevice(dek, meta.vault_id, pin);
  await S.kvPut('vault-meta', meta); await S.kvPut('vault-device', V.device);
  await openDoc(dek);
  await saveDoc(true);
  notify('meta');
  return recovery;
}
export async function registerDevice(password, pin) {
  const dek = await C.unlockWithPassword(V.meta, password);
  V.device = await C.wrapForDevice(dek, V.meta.vault_id, pin);
  await S.kvPut('vault-device', V.device);
  await openDoc(dek);
}
export const MAX_PIN_FAILS = 5;
// 틀리면 { error, left }. 5번 틀리면 이 기기의 PIN 키를 지우고 마스터 비밀번호를 요구한다
export async function unlockPin(pin) {
  try {
    const dek = await C.unlockWithPin(V.device, pin);
    if (V.device.fails) { V.device.fails = 0; await S.kvPut('vault-device', V.device); }
    await openDoc(dek);
    return { ok: true };
  } catch {
    V.device.fails = (V.device.fails || 0) + 1;
    if (V.device.fails >= MAX_PIN_FAILS) { V.device = null; await S.kvDel('vault-device'); return { error: 'locked-out' }; }
    await S.kvPut('vault-device', V.device);
    return { error: 'bad-pin', left: MAX_PIN_FAILS - V.device.fails };
  }
}
// 복구 키로 열고 새 마스터 비밀번호·기기 PIN을 정한다
export async function recover(recoveryInput, newPassword, pin) {
  const dek = await C.unlockWithRecovery(V.meta, recoveryInput);
  V.meta = await C.rewrapPassword(V.meta, dek, newPassword);
  V.device = await C.wrapForDevice(dek, V.meta.vault_id, pin);
  await S.kvPut('vault-meta', V.meta); await S.kvPut('vault-device', V.device);
  await openDoc(dek);
  notify('meta');
}
export async function changePassword(oldPw, newPw) {
  await C.unlockWithPassword(V.meta, oldPw);
  V.meta = await C.rewrapPassword(V.meta, V.dek, newPw);
  await S.kvPut('vault-meta', V.meta);
  notify('meta');
}
export async function changePin(pin) {
  V.device = await C.wrapForDevice(V.dek, V.meta.vault_id, pin);
  await S.kvPut('vault-device', V.device);
}
export async function reissueRecovery() {
  const r = await C.newRecovery(V.meta, V.dek);
  V.meta = r.meta;
  await S.kvPut('vault-meta', V.meta);
  notify('meta');
  return r.recovery;
}
export async function lock() {
  if (!V.unlocked) return;
  await flush();
  V.unlocked = false; V.dek = null; V.doc = null;
  notify('lock');
}
// Drive 금고로 바꾸기: 이 기기 금고를 버리고 받은 메타·암호문으로 교체 (잠긴 상태가 된다)
export async function replaceWith(meta, blob) {
  V.unlocked = false; V.dek = null; V.doc = null; V.conflict = null;
  V.meta = meta; V.blob = blob || null; V.device = null;
  await S.kvPut('vault-meta', meta);
  if (blob) await S.kvPut('vault', blob); else await S.kvDel('vault');
  await S.kvDel('vault-device');
  notify('meta');
}

// ---------- 동기화가 쓰는 함수 ----------
export async function adoptMeta(meta) { V.meta = meta; await S.kvPut('vault-meta', meta); notify('meta'); }
export async function adoptBlob(blob) { V.blob = blob; await S.kvPut('vault', blob); }
// 잠금 해제 중 병합된 평문 문서를 반영
export async function adoptDoc(doc) { V.doc = normalizeVaultDoc(doc); await saveDoc(true); notify('data'); }
export const decrypt = blob => C.decryptDoc(V.dek, blob);
export const encrypt = doc => C.encryptDoc(V.dek, doc, V.meta.vault_id);

// ---------- 업무 트리 ----------
// 노드: { id: 'W-…', parent_id, type: 'folder' | 'field', name, value, masked, label_ids, … }
export const QUICK_KEYS = [{ key: 'ID', masked: false }, { key: 'PW', masked: true }, { key: 'IP', masked: false }, { key: 'URL', masked: false }, { key: 'PK', masked: true }];
const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const nodes = () => live(V.doc?.nodes);
export const nodeById = id => (id ? nodes().find(n => n.id === id) || null : null);
export function childrenOf(parentId) {
  const kids = nodes().filter(n => (n.parent_id || null) === (parentId || null));
  const by = (a, b) => cmpText(a.name, b.name) || cmpText(a.created_at, b.created_at);
  return { folders: kids.filter(n => n.type === 'folder').sort(by), fields: kids.filter(n => n.type === 'field').sort(by) };
}
export function pathOf(id) {
  const out = [], seen = new Set();
  let cur = nodeById(id);
  while (cur && !seen.has(cur.id)) { out.unshift(cur); seen.add(cur.id); cur = nodeById(cur.parent_id); }
  return out;
}
export function descendantsOf(id) {
  const out = [], stack = [id], seen = new Set([id]);
  while (stack.length) {
    const pid = stack.pop();
    for (const n of nodes()) if (n.parent_id === pid && !seen.has(n.id)) { seen.add(n.id); out.push(n); stack.push(n.id); }
  }
  return out;
}
export const countUnder = id => { const d = descendantsOf(id); return { folders: d.filter(n => n.type === 'folder').length, fields: d.filter(n => n.type === 'field').length }; };
const nameTaken = (parentId, type, name, exceptId = null) => nodes().some(n => n.id !== exceptId && (n.parent_id || null) === (parentId || null) && n.type === type && sameName(n.name, name));
export function createNode(parentId, type, fields = {}) {
  const name = String(fields.name || '').trim().slice(0, 100);
  if (!name) return { error: type === 'folder' ? '폴더 이름을 입력하세요' : 'key를 입력하세요' };
  if (type === 'folder' && name.includes('/')) return { error: '폴더 이름에는 /를 쓸 수 없습니다' };
  if (parentId && !nodeById(parentId)) return { error: '상위 폴더가 없습니다' };
  if (nameTaken(parentId, type, name)) return { error: type === 'folder' ? '같은 이름의 폴더가 이미 있습니다' : '같은 key가 이미 있습니다' };
  const ts = nowIso();
  const node = { id: uniqueId('W-', V.doc.nodes), parent_id: parentId || null, type, name, label_ids: [], created_at: ts, updated_at: ts, deleted_at: null };
  if (type === 'field') { node.value = String(fields.value ?? ''); node.masked = fields.masked !== false; }
  V.doc.nodes.push(node);
  return { node };
}
export function updateNode(node, patch) {
  const next = { ...patch };
  if ('name' in next) {
    next.name = String(next.name || '').trim().slice(0, 100);
    if (!next.name) return { error: node.type === 'folder' ? '폴더 이름을 입력하세요' : 'key를 입력하세요' };
    if (node.type === 'folder' && next.name.includes('/')) return { error: '폴더 이름에는 /를 쓸 수 없습니다' };
    if (nameTaken(node.parent_id, node.type, next.name, node.id)) return { error: node.type === 'folder' ? '같은 이름의 폴더가 이미 있습니다' : '같은 key가 이미 있습니다' };
  }
  if ('value' in next) next.value = String(next.value ?? '');
  if ('masked' in next) next.masked = !!next.masked;
  Object.assign(node, next, { updated_at: nowIso() });
  return { node };
}
export function moveError(node, targetId) {
  targetId = targetId || null;
  if ((node.parent_id || null) === targetId) return '지금 있는 폴더입니다';
  if (targetId && !nodeById(targetId)) return '대상 폴더가 없습니다';
  if (node.type === 'folder' && (targetId === node.id || descendantsOf(node.id).some(n => n.id === targetId))) return '자기 자신이나 하위 폴더로는 옮길 수 없습니다';
  if (nameTaken(targetId, node.type, node.name, node.id)) return node.type === 'folder' ? '대상 폴더에 같은 이름의 폴더가 있습니다' : '대상 폴더에 같은 key가 있습니다';
  return null;
}
export function moveNode(node, targetId) {
  const err = moveError(node, targetId);
  if (err) return { error: err };
  node.parent_id = targetId || null; node.updated_at = nowIso();
  return { node };
}
export function deleteNode(node) {
  const all = [node, ...(node.type === 'folder' ? descendantsOf(node.id) : [])];
  const ts = nowIso();
  for (const n of all) { n.deleted_at = ts; n.updated_at = ts; }
  return all.length;
}
export const splitPath = text => String(text || '').split('/').map(p => p.trim()).filter(Boolean);
export function planPath(parentId, text) {
  const segments = splitPath(text);
  if (!segments.length) return { segments, existing: [], toCreate: [], error: '폴더 이름을 입력하세요' };
  if (segments.some(s => s.length > 100)) return { segments, existing: [], toCreate: [], error: '폴더 이름은 100자까지입니다' };
  const existing = [];
  let pid = parentId || null, i = 0;
  for (; i < segments.length; i++) {
    const f = nodes().find(n => n.type === 'folder' && (n.parent_id || null) === pid && sameName(n.name, segments[i]));
    if (!f) break;
    existing.push(f); pid = f.id;
  }
  return { segments, existing, toCreate: segments.slice(i), error: null };
}
export function createPath(parentId, text) {
  const plan = planPath(parentId, text);
  if (plan.error) return { error: plan.error };
  let pid = plan.existing.length ? plan.existing[plan.existing.length - 1].id : parentId || null;
  const created = [];
  for (const name of plan.toCreate) {
    const r = createNode(pid, 'folder', { name });
    if (r.error) return { error: r.error };
    created.push(r.node); pid = r.node.id;
  }
  return { node: nodeById(pid), created };
}
// 라벨: 폴더에만 붙인다. 상위 폴더의 라벨은 하위 전체에 상속
export function inheritedLabels(node) { return [...new Set(pathOf(node.id).slice(0, -1).flatMap(n => n.label_ids || []))]; }
export function effectiveLabels(node) { return [...new Set([...inheritedLabels(node), ...(node.label_ids || [])])]; }
export function toggleNodeLabel(node, labelId) {
  const on = !node.label_ids.includes(labelId);
  node.label_ids = on ? [...node.label_ids, labelId] : node.label_ids.filter(x => x !== labelId);
  node.updated_at = nowIso();
  return on;
}
// 라벨 보기용: 라벨이 직접 붙은 폴더 중 가장 위의 것들 (상위가 이미 같은 라벨이면 빼서 중복을 없앤다)
export function foldersWithLabel(labelId) {
  return nodes().filter(n => n.type === 'folder' && n.label_ids.includes(labelId) && !inheritedLabels(n).includes(labelId))
    .sort((a, b) => cmpText(pathOf(a.id).map(x => x.name).join('/'), pathOf(b.id).map(x => x.name).join('/')));
}

// ---------- 보안메모 ----------
export const memos = () => live(V.doc?.memos).sort((a, b) => cmpText(a.title, b.title) || cmpText(a.created_at, b.created_at));
export const memoById = id => live(V.doc?.memos).find(m => m.id === id) || null;
export function saveMemo(id, { title, body, label_ids }) {
  title = String(title || '').trim().slice(0, 120);
  if (!title) return { error: '제목을 입력하세요' };
  const ts = nowIso();
  let m = id ? memoById(id) : null;
  if (m) Object.assign(m, { title, body: String(body || ''), label_ids: [...new Set(label_ids || [])], updated_at: ts });
  else { m = { id: uniqueId('S-', V.doc.memos), title, body: String(body || ''), label_ids: [...new Set(label_ids || [])], created_at: ts, updated_at: ts, deleted_at: null }; V.doc.memos.push(m); }
  return { memo: m };
}
export function deleteMemo(m) { m.deleted_at = nowIso(); m.updated_at = m.deleted_at; }
export const memosWithLabel = labelId => memos().filter(m => m.label_ids.includes(labelId));

// ---------- 검색 (보안 영역 안에서만) ----------
// 대소문자·공백·-_. 무시, 한글 초성, 여러 단어는 모두 맞아야 함. 가린 값과 메모 본문은 찾지 않는다
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CHO_SET = new Set([...CHO]);
const norm = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s\-_.]+/g, '');
const chosung = s => [...norm(s)].map(ch => { const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch; }).join('');
const hit = (t, text) => !!text && (norm(text).includes(t) || ([...t].every(ch => CHO_SET.has(ch)) && chosung(text).includes(t)));
export function searchVault(q) {
  const ts = String(q || '').normalize('NFC').trim().split(/\s+/).map(norm).filter(Boolean);
  if (!ts.length || !V.doc) return { nodes: [], memos: [] };
  const ok = (own, ctx) => ts.every(t => own.some(o => hit(t, o)) || ctx.some(c => hit(t, c))) && ts.some(t => own.some(o => hit(t, o)));
  const outN = [];
  for (const n of nodes()) {
    const path = pathOf(n.id);
    const own = [n.name, ...(n.type === 'field' && !n.masked && n.value ? [n.value] : [])];
    if (ok(own, path.slice(0, -1).map(p => p.name))) outN.push({ node: n, path });
  }
  outN.sort((a, b) => cmpText(a.path.map(p => p.name).join('/'), b.path.map(p => p.name).join('/')));
  return { nodes: outN.slice(0, 100), memos: memos().filter(m => ts.every(t => hit(t, m.title))) };
}
