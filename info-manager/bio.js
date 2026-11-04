// 지문 잠금 해제 (패스키 PRF) — 모바일 전용
// - 지문을 확인했을 때만 패스키가 돌려주는 비밀값(PRF)으로 앱의 비밀(데이터 키 등)을 감싸 이 기기 localStorage에만 둔다
// - Drive로 동기화하지 않는다. 기기마다 따로 켜고, PIN 등 원래 여는 방법은 그대로 남는다
// - Info Manager·Expense Manager·Task Manager v2가 같은 파일을 쓴다 (앱마다 key·label·info만 다르게)
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const fail = code => Object.assign(new Error(code), { code });

export function isMobile() {
  const m = navigator.userAgentData?.mobile;
  return typeof m === 'boolean' ? m : /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}

// 이 기기에서 지문 잠금 해제를 쓸 수 있는지 (모바일 + 화면 잠금 인증 + PRF)
let availP = null;
export function available() {
  return (availP ||= (async () => {
    if (!isMobile() || !globalThis.isSecureContext || !globalThis.PublicKeyCredential) return false;
    try { if (!(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())) return false; } catch { return false; }
    if (PublicKeyCredential.getClientCapabilities) {
      try { if ((await PublicKeyCredential.getClientCapabilities())['extension:prf'] === false) return false; } catch { /* 모르면 시도해 본다 */ }
    }
    return true;
  })());
}

// 사용자에게 보여 줄 오류 문구
export function message(e) {
  const code = e?.code || e?.name;
  return ({
    NotAllowedError: '지문 확인이 취소되었거나 시간이 지났습니다',
    AbortError: '지문 확인이 취소되었습니다',
    InvalidStateError: '이미 등록된 패스키가 있습니다',
    SecurityError: '이 주소에서는 지문 잠금을 쓸 수 없습니다',
    'no-prf': '이 기기의 패스키 저장소가 지문 잠금(PRF)을 지원하지 않습니다. Google 비밀번호 관리자로 저장해 주세요',
    bad: '지문 잠금 정보가 맞지 않아 껐습니다. PIN으로 연 뒤 설정에서 다시 켜 주세요',
    off: '이 기기에서 지문으로 열기가 꺼져 있습니다',
    storage: '이 기기에 저장하지 못했습니다',
  })[code] || '지문으로 열지 못했습니다';
}

export function makeBio({ key, label, info }) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = v => { try { if (v) localStorage.setItem(key, JSON.stringify(v)); else localStorage.removeItem(key); return true; } catch { return false; } };
  const aad = bind => enc.encode(`${info}|${bind}`);
  async function kek(prf) {
    const base = await subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode(info) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function prfOf(cid, salt) {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: rand(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: cid }],
      extensions: { prf: { eval: { first: salt } } },
    } });
    const r = a.getClientExtensionResults().prf?.results?.first;
    if (!r) throw fail('no-prf');
    return new Uint8Array(r);
  }
  return {
    // bind(금고 ID 등)가 같을 때만 켜진 것으로 본다 — 금고가 바뀌면 자동으로 무효
    enabled: bind => { const r = read(); return !!r && r.bind === bind; },
    disable: () => { write(null); },
    // secret(Uint8Array)을 지문으로 감싸 저장한다. 패스키를 새로 만들고, 필요하면 지문을 한 번 더 확인한다
    async enroll(secret, bind) {
      const salt = rand(32);
      const cred = await navigator.credentials.create({ publicKey: {
        rp: { name: label, id: location.hostname },
        user: { id: rand(16), name: `${label} 지문 잠금`, displayName: `${label} 지문 잠금` },
        challenge: rand(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
        hints: ['client-device'], timeout: 60000,
        extensions: { prf: { eval: { first: salt } } },
      } });
      const ext = cred.getClientExtensionResults().prf;
      if (ext && ext.enabled === false) throw fail('no-prf');
      const cid = new Uint8Array(cred.rawId);
      const out = ext?.results?.first ? new Uint8Array(ext.results.first) : await prfOf(cid, salt);
      const iv = rand(12);
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(bind) }, await kek(out), secret);
      if (!write({ v: 1, bind, cid: b64u(cid), salt: b64u(salt), iv: b64u(iv), ct: b64u(ct), at: new Date().toISOString() })) throw fail('storage');
    },
    // 지문으로 비밀을 꺼낸다. 값이 맞지 않으면(패스키가 바뀜 등) 끄고 'bad'
    async unlock(bind) {
      const r = read();
      if (!r || r.bind !== bind) throw fail('off');
      const out = await prfOf(unb64u(r.cid), unb64u(r.salt));
      try { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64u(r.iv), additionalData: aad(bind) }, await kek(out), unb64u(r.ct))); }
      catch { write(null); throw fail('bad'); }
    },
  };
}
