// 암호화 (M1: 1차 테스트 단계 — PIN 4자리 + 복구 키)
// 데이터 키(DEK)를 PIN 키와 복구 키로 각각 감싸 메타에 두고, 문서 전체를 DEK로 AES-GCM 암호화한다.
// M4에서 마스터 비밀번호를 추가할 때도 DEK는 그대로 두고 감싸는 방식만 바꾼다.
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const PIN_ITERATIONS = 600000;
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

export function base32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function unbase32(str) {
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

// 복구 키: 16바이트 → Base32 26자 → XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX
export const formatRecovery = raw => base32(raw).match(/.{1,4}/g).join('-');
// 사용자가 입력한 복구 키를 정규화한다. 헷갈리는 글자(0→O, 1→I, 8→B)도 바로잡는다. 실패하면 null.
export function parseRecovery(input) {
  const s = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/0/g, 'O').replace(/1/g, 'I').replace(/8/g, 'B');
  if (s.length !== 26) return null;
  try {
    const raw = unbase32(s);
    return raw.length === 16 ? raw : null;
  } catch { return null; }
}
export const isPin = p => /^\d{4}$/.test(String(p));

// ---------- 키 ----------
async function pinKey(pin, salt, iterations) {
  const base = await subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
async function recoveryKey(raw, salt) {
  const base = await subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('im-recovery-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
const generateDek = () => subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

async function wrap(dek, kek, aad) {
  const iv = rand(12);
  const ct = await subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv, additionalData: enc.encode(aad) });
  return { iv: b64(iv), ct: b64(ct) };
}
async function unwrap(w, kek, aad) {
  return subtle.unwrapKey('raw', unb64(w.ct), kek, { name: 'AES-GCM', iv: unb64(w.iv), additionalData: enc.encode(aad) },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function wrapForPin(dek, pin, iterations = PIN_ITERATIONS) {
  const salt = rand(16);
  const kek = await pinKey(pin, salt, iterations);
  return { alg: 'PBKDF2-SHA256', iterations, salt: b64(salt), ...(await wrap(dek, kek, 'im-dek-pin')) };
}
async function wrapForRecovery(dek, raw) {
  const salt = rand(16);
  const kek = await recoveryKey(raw, salt);
  return { alg: 'HKDF-SHA256', salt: b64(salt), ...(await wrap(dek, kek, 'im-dek-recovery')) };
}

// ---------- 금고 (메타) ----------
// 메타는 평문으로 저장되며 비밀 값이 없다: { meta_version, created_at, updated_at, wrapped_keys: { pin, recovery } }
export async function createVault(pin, { iterations = PIN_ITERATIONS } = {}) {
  if (!isPin(pin)) throw new Error('bad-pin');
  const dek = await generateDek();
  const raw = rand(16);
  const ts = new Date().toISOString();
  const meta = {
    meta_version: META_VERSION, created_at: ts, updated_at: ts,
    wrapped_keys: { pin: await wrapForPin(dek, pin, iterations), recovery: await wrapForRecovery(dek, raw) },
  };
  return { meta, dek, recovery: formatRecovery(raw) };
}

// 틀린 PIN이면 'bad-pin' 오류
export async function unlockWithPin(meta, pin) {
  const w = meta.wrapped_keys.pin;
  const kek = await pinKey(pin, unb64(w.salt), w.iterations);
  try { return await unwrap(w, kek, 'im-dek-pin'); }
  catch { throw new Error('bad-pin'); }
}
export async function unlockWithRecovery(meta, input) {
  const raw = parseRecovery(input);
  if (!raw) throw new Error('bad-recovery-format');
  const w = meta.wrapped_keys.recovery;
  const kek = await recoveryKey(raw, unb64(w.salt));
  try { return await unwrap(w, kek, 'im-dek-recovery'); }
  catch { throw new Error('bad-recovery'); }
}

// PIN 변경: DEK를 새 PIN으로 다시 감싼다 (데이터 재암호화 없음)
export async function rewrapPin(meta, dek, newPin) {
  if (!isPin(newPin)) throw new Error('bad-pin');
  const iterations = meta.wrapped_keys.pin?.iterations || PIN_ITERATIONS;
  return { ...meta, updated_at: new Date().toISOString(), wrapped_keys: { ...meta.wrapped_keys, pin: await wrapForPin(dek, newPin, iterations) } };
}
// 복구 키 재발급: 이전 복구 키는 더 이상 쓸 수 없다
export async function newRecovery(meta, dek) {
  const raw = rand(16);
  const next = { ...meta, updated_at: new Date().toISOString(), wrapped_keys: { ...meta.wrapped_keys, recovery: await wrapForRecovery(dek, raw) } };
  return { meta: next, recovery: formatRecovery(raw) };
}

// ---------- 문서 ----------
// kind('personal' | 'work')를 AAD로 묶어, 파일을 서로 바꿔 넣어도 복호화되지 않게 한다
export async function encryptDoc(dek, obj, kind) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('im-' + kind + '-v1') }, dek, enc.encode(JSON.stringify(obj)));
  return { v: 1, kind, iv: b64(iv), ct: b64(ct) };
}
export async function decryptDoc(dek, blob, kind) {
  if (!blob || blob.v !== 1 || blob.kind !== kind) throw new Error('bad-blob');
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv), additionalData: enc.encode('im-' + kind + '-v1') }, dek, unb64(blob.ct));
  return JSON.parse(dec.decode(pt));
}
