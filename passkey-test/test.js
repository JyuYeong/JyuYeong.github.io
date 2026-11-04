// 지문(패스키 PRF) 잠금 해제 가능 여부 확인용 페이지. 저장하는 것은 이 페이지 전용 localStorage 키(pkt-*)뿐이다.
'use strict';
const $ = s => document.querySelector(s);
const enc = new TextEncoder(), dec = new TextDecoder();
const SALT_LABEL = 'jyuyeong-prf-test-v1';
const SAMPLE = '지문으로 풀린 테스트 문장입니다 ✅';
const K = { cred: 'pkt-cred', fp: 'pkt-fp', box: 'pkt-box', log: 'pkt-log' };
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const rand = n => crypto.getRandomValues(new Uint8Array(n));
const salt = async () => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(SALT_LABEL)));

function log(msg, cls = '') {
  const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  const li = document.createElement('li'); li.className = cls; li.textContent = `[${t}] ${msg}`;
  $('#log').append(li);
  const all = JSON.parse(ls(K.log) || '[]'); all.push([t, msg, cls]); ls(K.log, JSON.stringify(all.slice(-40)));
}
function verdict(text, cls) { $('#verdictText').textContent = text; $('#verdict').className = 'card ' + (cls || ''); }
function errText(e) { return `${e?.name || 'Error'}: ${e?.message || e}`; }

async function showEnv() {
  const rows = [];
  const add = (k, v) => rows.push(`<dt>${k}</dt><dd>${v}</dd>`);
  const ua = navigator.userAgentData;
  add('브라우저', ua ? ua.brands.filter(b => !/Not/.test(b.brand)).map(b => `${b.brand} ${b.version}`).join(', ') + (ua.mobile ? ' (모바일)' : '') : navigator.userAgent);
  add('설치 앱으로 실행', matchMedia('(display-mode: standalone)').matches ? '예' : '아니오(브라우저)');
  add('보안 연결', isSecureContext ? '예' : '<span class="bad">아니오</span>');
  const hasPk = 'PublicKeyCredential' in window;
  add('패스키(WebAuthn)', hasPk ? '지원' : '<span class="bad">미지원</span>');
  if (hasPk) {
    try { add('기기 생체·화면잠금 인증', await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() ? '사용 가능' : '<span class="bad">사용 불가</span>'); } catch { add('기기 생체·화면잠금 인증', '확인 실패'); }
    if (PublicKeyCredential.getClientCapabilities) {
      try { const c = await PublicKeyCredential.getClientCapabilities(); const p = c['extension:prf']; add('PRF(브라우저 신고)', p === true ? '<span class="ok">지원</span>' : p === false ? '<span class="bad">미지원</span>' : '알 수 없음'); }
      catch { add('PRF(브라우저 신고)', '확인 실패'); }
    } else add('PRF(브라우저 신고)', '알 수 없음 (실제 테스트로 확인)');
  }
  add('만든 테스트 패스키', ls(K.cred) ? '있음' : '없음');
  $('#env').innerHTML = rows.join('');
}

async function create() {
  $('#btnCreate').disabled = true;
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: 'PRF 테스트', id: location.hostname },
      user: { id: rand(16), name: 'prf-test', displayName: 'PRF 테스트' },
      challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
      hints: ['client-device'],
      timeout: 120000,
      extensions: { prf: { eval: { first: await salt() } } },
    } });
    const ext = cred.getClientExtensionResults();
    ls(K.cred, b64u(cred.rawId)); ls(K.fp, null); ls(K.box, null);
    const att = cred.authenticatorAttachment || '?';
    if (ext.prf?.enabled) {
      log(`패스키 생성 완료 (${att}). PRF 사용 가능`, 'ok');
      verdict('패스키 생성 OK, PRF 사용 가능 — 이제 2번을 두 번 이상 눌러 주세요', 'ok');
    } else {
      log(`패스키는 만들어졌지만 PRF 미지원 (prf=${JSON.stringify(ext.prf ?? null)}, ${att})`, 'bad');
      verdict('이 기기·패스키 저장소는 PRF를 지원하지 않습니다 (지문으로 키 꺼내기 불가)', 'bad');
    }
  } catch (e) { log('패스키 생성 실패: ' + errText(e), 'bad'); verdict('패스키를 만들지 못했습니다 (기록 참고)', 'bad'); }
  $('#btnCreate').disabled = false; showEnv();
}

async function boxKey(prfOut) {
  const base = await crypto.subtle.importKey('raw', prfOut, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: enc.encode('prf-test-box') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

async function get() {
  const id = ls(K.cred);
  if (!id) return log('먼저 1번에서 패스키를 만들어 주세요', 'bad');
  $('#btnGet').disabled = true;
  try {
    const t0 = performance.now();
    const a = await navigator.credentials.get({ publicKey: {
      challenge: rand(32), rpId: location.hostname, timeout: 120000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: unb64u(id) }],
      extensions: { prf: { eval: { first: await salt() } } },
    } });
    const ms = Math.round(performance.now() - t0);
    const first = a.getClientExtensionResults().prf?.results?.first;
    const uv = (new Uint8Array(a.response.authenticatorData)[32] & 0x04) !== 0;
    if (!first) { log(`인증은 됐지만 PRF 값이 없습니다 (사용자 확인=${uv ? '예' : '아니오'})`, 'bad'); verdict('PRF 값을 받지 못했습니다 — 지문으로 키 꺼내기 불가', 'bad'); return; }
    const fp = hex(await crypto.subtle.digest('SHA-256', first)).slice(0, 12);
    const key = await boxKey(first);
    const prevFp = ls(K.fp), box = ls(K.box);
    if (!prevFp) {
      const iv = rand(12);
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(SAMPLE));
      ls(K.fp, fp); ls(K.box, JSON.stringify({ iv: b64u(iv), ct: b64u(ct) }));
      log(`비밀값 받음 (지문 ${fp}…, ${ms}ms, 사용자 확인=${uv ? '예' : '아니오'}). 테스트 문장을 암호화해 둠`, 'ok');
      verdict('1회차 OK — 한 번 더 눌러서 같은 값이 나오는지 확인해 주세요', 'ok');
    } else {
      const same = prevFp === fp;
      let opened = '';
      try { const b = JSON.parse(box); opened = dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(b.iv) }, key, unb64u(b.ct))); } catch { opened = ''; }
      if (same && opened === SAMPLE) {
        log(`같은 비밀값 (지문 ${fp}…, ${ms}ms). 문장 복호화 성공: "${opened}"`, 'ok');
        verdict('성공 ✅ 이 기기에서 지문으로 암호화 키를 꺼낼 수 있습니다', 'ok');
      } else {
        log(`비밀값이 달라짐 (이전 ${prevFp}… / 지금 ${fp}…), 복호화 ${opened ? '성공' : '실패'}`, 'bad');
        verdict('비밀값이 매번 달라 키로 쓸 수 없습니다', 'bad');
      }
    }
  } catch (e) { log('지문 확인 실패: ' + errText(e), 'bad'); }
  finally { $('#btnGet').disabled = false; }
}

function reset() {
  for (const k of Object.values(K)) ls(k, null);
  $('#log').innerHTML = ''; verdict('기록을 지웠습니다. 1번부터 다시 할 수 있습니다'); showEnv();
}

for (const [t, m, c] of JSON.parse(ls(K.log) || '[]')) { const li = document.createElement('li'); li.className = c; li.textContent = `[${t}] ${m}`; $('#log').append(li); }
$('#btnCreate').addEventListener('click', create);
$('#btnGet').addEventListener('click', get);
$('#btnReset').addEventListener('click', reset);
showEnv();
