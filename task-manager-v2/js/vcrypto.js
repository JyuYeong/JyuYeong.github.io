// 보안 영역 암호화 (V5)
// 데이터 키(DEK, AES-GCM-256) 하나로 금고 문서 전체를 암호화한다.
//  - Drive에 올라가는 메타: 마스터 비밀번호로 감싼 DEK + 복구 키로 감싼 DEK (비밀 값 없음)
//  - 이 기기에만 저장: 기기 PIN(4자리)으로 감싼 DEK. Drive 파일이 새어 나가도 PIN 대입으로는 풀 수 없다
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const PW_ITERATIONS = 600000;
export const PIN_ITERATIONS = 310000;
export const PW_MIN = 10;
export const META_VERSION = 1;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// ---------- 인코딩 ----------
export function b64(bytes) {
  let s = '';
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
function base32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function unbase32(str) {
  let bits = 0, val = 0;
  const out = [];
  for (const ch of str) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('bad-char');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
// 복구 키: 16바이트 → Base32 26자 → XXXX-XXXX-…-XX
export const formatRecovery = raw => base32(raw).match(/.{1,4}/g).join('-');
export function parseRecovery(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
  if (s.length !== 26) return null;
  try { const raw = unbase32(s); return raw.length === 16 ? raw : null; } catch { return null; }
}
export const isPin = p => /^\d{4}$/.test(String(p));
export const pwError = p => (String(p || '').length < PW_MIN ? `마스터 비밀번호는 ${PW_MIN}자 이상이어야 합니다` : null);

// ---------- 키 ----------
async function pbkdf2Key(secret, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(String(secret)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
async function recoveryKek(raw, salt) {
  const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('tm2-recovery-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
const generateDek = () => subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
async function wrap(dek, kek, aad) {
  const iv = rand(12);
  const ct = await subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: enc.encode(aad) });
  return { iv: b64(iv), ct: b64(ct) };
}
const unwrap = (w, kek, aad) => subtle.unwrapKey('raw', unb64(w.ct), kek, { name: 'AES-GCM', iv: unb64(w.iv), additionalData: enc.encode(aad) },
  { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

async function wrapForPassword(dek, pw, iterations = PW_ITERATIONS) {
  const salt = rand(16);
  return { alg: 'PBKDF2-SHA256', iterations, salt: b64(salt), ...(await wrap(dek, await pbkdf2Key(pw, salt, iterations), 'tm2-dek-password')) };
}
async function wrapForRecovery(dek, raw) {
  const salt = rand(16);
  return { alg: 'HKDF-SHA256', salt: b64(salt), ...(await wrap(dek, await recoveryKek(raw, salt), 'tm2-dek-recovery')) };
}
export const newVaultId = () => 'VLT-' + b64(rand(12)).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));

// ---------- 금고 메타 (Drive에 올라감) ----------
export async function createVault(password, { iterations = PW_ITERATIONS } = {}) {
  const err = pwError(password);
  if (err) throw new Error(err);
  const dek = await generateDek();
  const raw = rand(16);
  const ts = new Date().toISOString();
  const meta = {
    schema: 'tm2-vault-meta', meta_version: META_VERSION, vault_id: newVaultId(), created_at: ts, updated_at: ts,
    wrapped_keys: { password: await wrapForPassword(dek, password, iterations), recovery: await wrapForRecovery(dek, raw) },
  };
  return { meta, dek, recovery: formatRecovery(raw) };
}
export async function unlockWithPassword(meta, pw) {
  const w = meta.wrapped_keys.password;
  try { return await unwrap(w, await pbkdf2Key(pw, unb64(w.salt), w.iterations), 'tm2-dek-password'); }
  catch { throw new Error('bad-password'); }
}
export async function unlockWithRecovery(meta, input) {
  const raw = parseRecovery(input);
  if (!raw) throw new Error('bad-recovery-format');
  const w = meta.wrapped_keys.recovery;
  try { return await unwrap(w, await recoveryKek(raw, unb64(w.salt)), 'tm2-dek-recovery'); }
  catch { throw new Error('bad-recovery'); }
}
export async function rewrapPassword(meta, dek, pw) {
  const err = pwError(pw);
  if (err) throw new Error(err);
  return { ...meta, updated_at: new Date().toISOString(), wrapped_keys: { ...meta.wrapped_keys, password: await wrapForPassword(dek, pw, meta.wrapped_keys.password?.iterations || PW_ITERATIONS) } };
}
export async function newRecovery(meta, dek) {
  const raw = rand(16);
  return { meta: { ...meta, updated_at: new Date().toISOString(), wrapped_keys: { ...meta.wrapped_keys, recovery: await wrapForRecovery(dek, raw) } }, recovery: formatRecovery(raw) };
}

// ---------- 기기 PIN (이 기기에만 저장) ----------
export async function wrapForDevice(dek, vaultId, pin, iterations = PIN_ITERATIONS) {
  if (!isPin(pin)) throw new Error('bad-pin');
  const salt = rand(16);
  return { vault_id: vaultId, iterations, salt: b64(salt), fails: 0, ...(await wrap(dek, await pbkdf2Key(pin, salt, iterations), 'tm2-dek-pin:' + vaultId)) };
}
export async function unlockWithPin(dev, pin) {
  try { return await unwrap(dev, await pbkdf2Key(pin, unb64(dev.salt), dev.iterations), 'tm2-dek-pin:' + dev.vault_id); }
  catch { throw new Error('bad-pin'); }
}

// ---------- 문서 ----------
export async function encryptDoc(dek, obj, vaultId) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('tm2-vault-v1:' + vaultId) }, dek, enc.encode(JSON.stringify(obj)));
  return { schema: 'tm2-vault', v: 1, vault_id: vaultId, iv: b64(iv), ct: b64(ct) };
}
export async function decryptDoc(dek, blob) {
  if (!blob || blob.v !== 1 || !blob.vault_id) throw new Error('bad-blob');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv), additionalData: enc.encode('tm2-vault-v1:' + blob.vault_id) }, dek, unb64(blob.ct));
  return JSON.parse(dec.decode(pt));
}
