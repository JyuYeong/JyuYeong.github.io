// Info Manager M1: 처음 설정(PIN·복구 키), 잠금·해제·자동 잠금, 개인용 계정·보안 메모, 소셜 관리 (이 기기에만 저장)
import * as C from './crypto.js';
import * as S from './store.js';

export const VERSION = 'M1';
const IDLE_MS = 5 * 60 * 1000;
const MAX_FAILS = 5;
const FAIL_WAIT_MS = 30 * 1000;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wide = () => matchMedia('(min-width:700px)').matches;
const fmtDate = iso => { try { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch { return ''; } };

// ---------- 아이콘 ----------
const P = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20a8 8 0 0116 0"/>',
  note: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  tree: '<path d="M4 6a2 2 0 012-2h3l2 2h7a2 2 0 012 2v1H4z"/><path d="M4 9h16v9a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>',
  link: '<path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/>',
  gear: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.1A9.6 9.6 0 0112 6c6 0 9.5 6 9.5 6a17 17 0 01-3.2 3.9M6.6 7.6C4 9.3 2.5 12 2.5 12S6 18 12 18c1.6 0 3-.4 4.2-1"/><path d="M9.9 10a3 3 0 004.1 4.1"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  chevR: '<path d="M10 7l5 5-5 5"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  img: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M20 16l-5-5-7 8"/>',
  del: '<path d="M9 6h11v12H9l-6-6z"/><path d="M12 10l4 4M16 10l-4 4"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>`;
const rkeyHtml = k => k.split('-').map((g, i, arr) => `<span>${esc(g)}${i < arr.length - 1 ? '-' : ''}</span>`).join('');
const LOGO = `<svg class="glogo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0F766E"/><path d="M32 13l15 6v11c0 9.5-6.3 16.3-15 20-8.7-3.7-15-10.5-15-20V19z" fill="#E1F3F0"/><rect x="24.5" y="29" width="15" height="11" rx="2.5" fill="#0F766E"/><path d="M27.5 29v-3a4.5 4.5 0 019 0v3" fill="none" stroke="#0F766E" stroke-width="3"/></svg>`;

// ---------- 세션 상태 (잠그면 전부 버림) ----------
let meta = null;    // 평문 메타 (비밀 없음)
let dek = null;     // 데이터 키 (메모리에만)
let pdoc = null;    // 개인용 문서 (복호화본)
let wdoc = null;    // 업무용 문서 (M2에서 사용)
let unlocked = false;
const ui = { view: 'accounts', sel: null, draft: null, revealed: new Set() };
const VIEWS = { accounts: '계정', notes: '보안 메모', work: '업무', social: '소셜 관리' };

// ---------- 다른 탭 ----------
// 같은 기기에서 두 탭이 동시에 열려 서로 덮어쓰지 않도록, 한 탭이 열리면 나머지 탭은 잠근다
const bc = 'BroadcastChannel' in globalThis ? new BroadcastChannel('im-session') : null;
const TAB_ID = Math.random().toString(36).slice(2);
bc?.addEventListener('message', e => {
  if (e.data?.type === 'unlocked' && e.data.tab !== TAB_ID && unlocked) lock('다른 탭에서 Info Manager를 열어 이 탭은 잠겼습니다');
  if (e.data?.type === 'meta' && e.data.tab !== TAB_ID) S.get('meta').then(m => { if (m) meta = m; });
});

// ---------- 저장 ----------
let saveTimer = null, saving = Promise.resolve(), saveOk = true;
function persist(now = false) {
  clearTimeout(saveTimer);
  if (!unlocked) return saving;
  const run = () => {
    const key = dek, doc = pdoc;
    if (!key || !doc) return saving;
    doc.updated_at = S.nowIso();
    saving = saving.then(async () => {
      const blob = await C.encryptDoc(key, doc, 'personal');
      saveOk = await S.put('personal', blob);
      renderSaveLabel();
    });
    return saving;
  };
  if (now) return run();
  saveTimer = setTimeout(run, 250);
  return saving;
}
function renderSaveLabel() {
  const el = $('#saveLabel');
  el.textContent = saveOk ? '이 기기에 저장됨' : '저장 실패';
  el.classList.toggle('warn', !saveOk);
}

// ---------- 토스트 / 다이얼로그 ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}
const dlg = () => $('#dlg');
function closeDialog() { if (dlg().open) dlg().close(); dlg().innerHTML = ''; }
function openDialog(title, body, foot = '') {
  const d = dlg();
  d.innerHTML = `<div class="dlg-h"><h2>${esc(title)}</h2><button class="icbtn" data-dlg="close" aria-label="닫기">${ic('x')}</button></div>
    <div class="dlg-b">${body}</div>${foot ? `<div class="dlg-f">${foot}</div>` : ''}`;
  if (!d.open) d.showModal();
  return d;
}
dlg().addEventListener('click', e => {
  if (e.target === dlg() || e.target.closest('[data-dlg="close"]')) closeDialog();
});
dlg().addEventListener('close', () => { dlg().innerHTML = ''; });
function confirmDialog(title, msg, okLabel = '확인', danger = false) {
  return new Promise(resolve => {
    const d = openDialog(title, `<p>${msg}</p>`,
      `<button class="btn" data-r="0">취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okLabel)}</button>`);
    const done = v => { d.removeEventListener('click', on); d.removeEventListener('close', onClose); closeDialog(); resolve(v); };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
    const onClose = () => resolve(false);
    d.addEventListener('click', on);
    d.addEventListener('close', onClose, { once: true });
  });
}

// =====================================================================
// 잠금 화면 / 처음 설정
// =====================================================================
const gate = $('#gate');
let pad = null; // { len, buf, onDone, busy }
let fails = 0, waitUntil = 0, waitTimer = null;

function showGate(html) {
  gate.innerHTML = `<div class="gbox">${html}</div>`;
  gate.hidden = false;
  $('#app').hidden = true;
}
function padHtml({ title, sub = '', msg = '', msgInfo = false, leftFn = '' }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => `<button data-k="${k}">${k}</button>`).join('');
  return `${LOGO}<h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}
    <div class="dots" id="dots" role="status" aria-label="입력한 자릿수 0">${'<i></i>'.repeat(4)}</div>
    <p class="gmsg ${msgInfo ? 'info' : ''}" id="gmsg">${esc(msg)}</p>
    <div class="pad" id="pad">${keys}${leftFn || '<span class="blank"></span>'}<button data-k="0">0</button><button class="fn" data-k="bs" aria-label="지우기">${ic('del')}</button></div>`;
}
function startPad(onDone) {
  pad = { buf: '', onDone, busy: false };
  drawDots();
  applyWait();
}
function drawDots() {
  const d = $('#dots');
  if (!d || !pad) return;
  [...d.children].forEach((el, i) => el.classList.toggle('on', i < pad.buf.length));
  d.setAttribute('aria-label', `입력한 자릿수 ${pad.buf.length}`);
}
function padMsg(text, info = false) {
  const m = $('#gmsg');
  if (m) { m.textContent = text; m.classList.toggle('info', info); }
}
function padKey(k) {
  if (!pad || pad.busy || Date.now() < waitUntil) return;
  if (k === 'bs') pad.buf = pad.buf.slice(0, -1);
  else if (/^\d$/.test(k) && pad.buf.length < 4) pad.buf += k;
  drawDots();
  if (pad.buf.length === 4) {
    const pin = pad.buf;
    pad.busy = true;
    setTimeout(() => pad?.onDone(pin), 60); // 네 번째 점이 그려진 뒤 처리
  }
}
function padReset(msg = '', shake = true) {
  if (!pad) return;
  pad.buf = ''; pad.busy = false;
  drawDots();
  padMsg(msg);
  if (shake) { const d = $('#dots'); d?.classList.remove('shake'); void d?.offsetWidth; d?.classList.add('shake'); }
}
function applyWait() {
  clearInterval(waitTimer);
  const btns = gate.querySelectorAll('#pad button[data-k]');
  const tick = () => {
    const left = Math.ceil((waitUntil - Date.now()) / 1000);
    if (left > 0) { btns.forEach(b => { b.disabled = true; }); padMsg(`PIN을 ${MAX_FAILS}번 틀렸습니다. ${left}초 뒤 다시 시도하세요`); }
    else { clearInterval(waitTimer); btns.forEach(b => { b.disabled = false; }); if (waitUntil) { waitUntil = 0; padMsg(''); } }
  };
  if (waitUntil > Date.now()) { tick(); waitTimer = setInterval(tick, 500); }
}
gate.addEventListener('click', e => {
  const k = e.target.closest('#pad button[data-k]');
  if (k) { padKey(k.dataset.k); return; }
  const a = e.target.closest('[data-g]');
  if (a) gateAction(a.dataset.g, a);
});
document.addEventListener('keydown', e => {
  if (gate.hidden || !pad || dlg().open) return;
  if (e.target.matches('input, textarea')) return;
  if (/^\d$/.test(e.key)) { padKey(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { padKey('bs'); e.preventDefault(); }
});

// ---------- 처음 설정 ----------
const setup = { pin: null, vault: null };
function setupIntro() {
  pad = null;
  showGate(`${LOGO}<h1>Info Manager</h1>
    <p>개인 계정과 업무 정보를 이 기기에 암호화해 보관합니다.<br>먼저 PIN 4자리와 복구 키를 만듭니다.</p>
    ${testWarning()}
    ${S.storageOk ? '' : `<div class="warn">${ic('warn')}<div><b>이 브라우저는 저장소를 쓸 수 없습니다</b>시크릿 창이거나 저장소가 막혀 있으면 닫을 때 데이터가 사라집니다.</div></div>`}
    <button class="btn primary" data-g="setup-start">시작하기</button>`);
}
function testWarning() {
  return `<div class="warn">${ic('warn')}<div><b>1차 테스트 단계입니다</b>PIN 4자리만으로 보호되므로 실제 비밀번호나 고객사 정보는 넣지 말고 테스트용 데이터만 넣어 주세요.</div></div>`;
}
function setupPin1(msg = '') {
  showGate(padHtml({ title: '새 PIN 4자리', sub: '잠금을 풀 때 쓸 숫자 4자리를 입력하세요', msg }));
  startPad(pin => { setup.pin = pin; setupPin2(); });
}
function setupPin2() {
  showGate(padHtml({ title: 'PIN 확인', sub: '같은 PIN을 한 번 더 입력하세요', leftFn: `<button class="fn" data-g="setup-pin-again">다시 정하기</button>` }));
  startPad(async pin => {
    if (pin !== setup.pin) { setup.pin = null; setupPin1('PIN이 서로 다릅니다. 처음부터 다시 입력하세요'); return; }
    showGate(`<div class="spin" aria-hidden="true"></div><p>금고를 만드는 중입니다…</p>`);
    try { setup.vault = await C.createVault(pin); }
    catch { setupPin1('금고를 만들지 못했습니다. 다시 시도하세요'); return; }
    setupKey();
  });
}
function setupKey() {
  pad = null;
  showGate(`<h2>복구 키를 적어 두세요</h2>
    <p>PIN을 잊었을 때 데이터를 여는 유일한 방법입니다. 이 화면을 닫으면 다시 볼 수 없습니다.</p>
    <div class="rkey" id="rkey">${rkeyHtml(setup.vault.recovery)}</div>
    <div class="warn">${ic('warn')}<div><b>PIN과 복구 키를 모두 잃으면 복구할 방법이 없습니다</b>종이 등 이 기기가 아닌 곳에 보관하세요. 복구 키를 아는 사람은 데이터를 열 수 있습니다.</div></div>
    <label class="ck"><input type="checkbox" id="rkOk"> 복구 키를 안전한 곳에 적어 두었습니다</label>
    <button class="btn primary" data-g="setup-key-next" id="rkNext" disabled>다음</button>`);
  $('#rkOk').addEventListener('change', e => { $('#rkNext').disabled = !e.target.checked; });
}
function setupConfirm(msg = '') {
  pad = null;
  showGate(`<h2>복구 키 확인</h2>
    <p>적어 둔 복구 키의 <b>앞 4자리</b>를 입력하세요.</p>
    <form id="rkForm" class="left" autocomplete="off">
      <input class="in ${msg ? 'err' : ''}" id="rkHead" maxlength="4" autocapitalize="characters" spellcheck="false" aria-label="복구 키 앞 4자리" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.2em;text-align:center">
      <p class="note" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
    </form>
    <button class="btn primary" data-g="setup-finish">완료</button>
    <button class="link" data-g="setup-key-back">복구 키 다시 보기</button>`);
  const f = $('#rkForm');
  f.addEventListener('submit', e => { e.preventDefault(); gateAction('setup-finish'); });
  $('#rkHead').focus();
}
async function setupFinish() {
  const head = ($('#rkHead')?.value || '').toUpperCase().trim();
  if (head !== setup.vault.recovery.slice(0, 4)) { setupConfirm('복구 키 앞 4자리가 맞지 않습니다'); return; }
  const v = setup.vault;
  const p = S.emptyPersonal(); S.seedPresets(p);
  const w = S.emptyWork();
  const ok = await S.putMany({ meta: v.meta, personal: await C.encryptDoc(v.dek, p, 'personal'), work: await C.encryptDoc(v.dek, w, 'work') });
  setup.pin = null; setup.vault = null;
  meta = v.meta; dek = v.dek; pdoc = p; wdoc = w;
  enterApp(ok ? '설정을 마쳤습니다' : '저장소를 쓸 수 없어 이 창을 닫으면 사라집니다');
}

// ---------- 잠금 해제 ----------
function lockScreen(msg = '', info = true) {
  showGate(padHtml({ title: 'PIN 입력', sub: 'Info Manager가 잠겨 있습니다', msg, msgInfo: info, leftFn: `<button class="fn" data-g="forgot">PIN을<br>잊었어요</button>` }));
  startPad(async pin => {
    padMsg('여는 중…', true);
    try {
      const key = await C.unlockWithPin(meta, pin);
      fails = 0;
      await openWith(key);
    } catch (e) {
      if (e.message !== 'bad-pin') { padReset('데이터를 열 수 없습니다. 저장된 데이터가 손상되었을 수 있습니다'); return; }
      fails++;
      if (fails >= MAX_FAILS) { fails = 0; waitUntil = Date.now() + FAIL_WAIT_MS; padReset(''); applyWait(); return; }
      padReset(`PIN이 맞지 않습니다 (${fails}/${MAX_FAILS})`);
    }
  });
}
async function openWith(key) {
  const [pb, wb] = await Promise.all([S.get('personal'), S.get('work')]);
  const p = pb ? await C.decryptDoc(key, pb, 'personal') : (() => { const d = S.emptyPersonal(); S.seedPresets(d); return d; })();
  const w = wb ? await C.decryptDoc(key, wb, 'work') : S.emptyWork();
  for (const k of ['accounts', 'notes', 'providers', 'social_accounts']) p[k] ||= [];
  w.nodes ||= [];
  dek = key; pdoc = p; wdoc = w;
  enterApp();
}

// ---------- 복구 키로 열기 → 새 PIN ----------
const rec = { dek: null, pin: null };
function recoveryScreen(msg = '') {
  pad = null;
  showGate(`<h2>복구 키로 열기</h2>
    <p>처음 설정할 때 적어 둔 복구 키를 입력하세요. 연 뒤에 새 PIN을 정합니다.</p>
    <form id="recForm" class="left" autocomplete="off">
      <input class="in ${msg ? 'err' : ''}" id="recIn" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" autocapitalize="characters" spellcheck="false" aria-label="복구 키" style="font-family:var(--mono);text-transform:uppercase">
      <p class="note" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
    </form>
    <button class="btn primary" data-g="rec-open">열기</button>
    <button class="link" data-g="rec-cancel">PIN 입력으로 돌아가기</button>`);
  $('#recForm').addEventListener('submit', e => { e.preventDefault(); gateAction('rec-open'); });
  $('#recIn').focus();
}
async function recoveryOpen() {
  const v = $('#recIn').value;
  if (!C.parseRecovery(v)) { recoveryScreen('복구 키 형식이 맞지 않습니다 (영문·숫자 26자)'); return; }
  try { rec.dek = await C.unlockWithRecovery(meta, v); }
  catch { recoveryScreen('복구 키가 맞지 않습니다'); return; }
  recoveryPin1();
}
function recoveryPin1(msg = '') {
  showGate(padHtml({ title: '새 PIN 4자리', sub: '앞으로 쓸 새 PIN을 입력하세요', msg }));
  startPad(pin => { rec.pin = pin; recoveryPin2(); });
}
function recoveryPin2() {
  showGate(padHtml({ title: '새 PIN 확인', sub: '같은 PIN을 한 번 더 입력하세요' }));
  startPad(async pin => {
    if (pin !== rec.pin) { rec.pin = null; recoveryPin1('PIN이 서로 다릅니다. 처음부터 다시 입력하세요'); return; }
    padMsg('저장하는 중…', true);
    const next = await C.rewrapPin(meta, rec.dek, pin);
    await S.put('meta', next);
    meta = next; bc?.postMessage({ type: 'meta', tab: TAB_ID });
    const key = rec.dek; rec.dek = null; rec.pin = null; fails = 0;
    try { await openWith(key); toast('새 PIN으로 바꿨습니다'); }
    catch { lockScreen('데이터를 열 수 없습니다', false); }
  });
}

function gateAction(act) {
  switch (act) {
    case 'setup-start': return setupPin1();
    case 'setup-pin-again': setup.pin = null; return setupPin1();
    case 'setup-key-next': return setupConfirm();
    case 'setup-key-back': return setupKey();
    case 'setup-finish': return setupFinish();
    case 'forgot': return recoveryScreen();
    case 'rec-open': return recoveryOpen();
    case 'rec-cancel': rec.dek = null; return lockScreen();
  }
}

// =====================================================================
// 잠금 / 자동 잠금
// =====================================================================
let lastAct = Date.now(), idleTimer = null;
function enterApp(msg) {
  unlocked = true;
  pad = null;
  gate.hidden = true; gate.innerHTML = '';
  $('#app').hidden = false;
  ui.sel = null; ui.draft = null; ui.revealed.clear();
  lastAct = Date.now();
  clearInterval(idleTimer);
  idleTimer = setInterval(checkIdle, 10000);
  bc?.postMessage({ type: 'unlocked', tab: TAB_ID });
  saveOk = S.storageOk; renderSaveLabel();
  renderAll();
  if (msg) toast(msg);
}
async function lock(msg = '') {
  if (!unlocked) return;
  await persist(true);
  await saving;
  unlocked = false;
  clearInterval(idleTimer);
  closeDialog();
  dek = null; pdoc = null; wdoc = null;
  ui.sel = null; ui.draft = null; ui.revealed.clear();
  for (const id of ['#side', '#chips', '#bar', '#list', '#panel']) $(id).innerHTML = '';
  document.body.classList.remove('sheet-open');
  document.body.classList.add('no-sel');
  lockScreen(msg);
}
function checkIdle() {
  if (unlocked && Date.now() - lastAct >= IDLE_MS) lock('5분 동안 조작이 없어 잠겼습니다');
}
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'input']) {
  addEventListener(ev, () => { lastAct = Date.now(); }, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist(true);
  else checkIdle();
});
addEventListener('pagehide', () => persist(true));

// =====================================================================
// 화면
// =====================================================================
const L = arr => S.live(arr);
const providerById = id => (id ? L(pdoc.providers).find(p => p.id === id) || null : null);
const socialById = id => (id ? L(pdoc.social_accounts).find(s => s.id === id) || null : null);

function badge(p, cls = '') {
  if (!p) return `<span class="bdg svc ${cls}">?</span>`;
  if (p.icon) return `<span class="bdg img ${cls}"><img src="${esc(p.icon)}" alt=""></span>`;
  return `<span class="bdg ${cls}" style="background:${esc(p.color)};color:${S.inkOn(p.color)}">${esc(S.initialOf(p.name))}</span>`;
}
const svcBadge = (name, cls = '') => `<span class="bdg svc ${cls}">${esc(S.initialOf(name))}</span>`;
function loginLabel(a) {
  if (a.login_type === 'social') {
    const p = providerById(a.provider_id), s = socialById(a.social_account_id);
    return `${p ? p.name : '(삭제된 소셜)'}${s ? ' · ' + s.label : ' 로그인'}`;
  }
  return a.login_id || '(ID 없음)';
}

function renderAll() { renderNav(); renderBar(); renderList(); renderPanel(); }

function counts() {
  return { accounts: L(pdoc.accounts).length, notes: L(pdoc.notes).length, social: L(pdoc.providers).length };
}
function renderNav() {
  const c = counts();
  const nav = (v, icon, label, n, disabled = false) => `<button class="nav" data-act="view" data-v="${v}" aria-current="${ui.view === v}" title="${esc(label)}"${disabled ? ' disabled' : ''}>${ic(icon)}<span class="lbl">${esc(label)}</span>${n == null ? '' : `<span class="n">${n}</span>`}</button>`;
  $('#side').innerHTML = `<h3>개인</h3>${nav('accounts', 'user', '계정', c.accounts)}${nav('notes', 'note', '보안 메모', c.notes)}
    <div class="sep"></div><h3>업무</h3>${nav('work', 'tree', '업무 (M2 예정)', null, true)}
    <div class="sep"></div><h3>관리</h3>${nav('social', 'link', '소셜 관리', c.social)}
    <span class="sp"></span>
    <button class="nav" data-act="settings" title="설정">${ic('gear')}<span class="lbl">설정</span></button>`;
  const chip = (v, label, n, disabled = false) => `<button class="chip" role="tab" data-act="view" data-v="${v}" aria-selected="${ui.view === v}"${disabled ? ' disabled' : ''}>${esc(label)}${n == null ? '' : `<span class="n">${n}</span>`}</button>`;
  $('#chips').innerHTML = chip('accounts', '계정', c.accounts) + chip('notes', '보안 메모', c.notes) + chip('social', '소셜', c.social) + chip('work', '업무 (M2)', null, true);
}
function renderBar() {
  const c = counts();
  const add = { accounts: '계정 추가', notes: '메모 추가', social: '소셜 추가' }[ui.view];
  $('#bar').innerHTML = `<h2>${esc(VIEWS[ui.view])}</h2><span class="n">${c[ui.view] ?? ''}</span>
    ${add ? `<button class="btn primary" data-act="add">${ic('plus')}${esc(add)}</button>` : ''}`;
}

function renderList() {
  const el = $('#list');
  const cur = id => `aria-current="${ui.sel === id}"`;
  if (ui.view === 'accounts') {
    const groups = S.groupAccounts(pdoc, a => loginLabel(a));
    if (!groups.length) { el.innerHTML = emptyHtml('user', '등록한 계정이 없습니다', '계정 추가'); return; }
    el.innerHTML = groups.map(g => `<div class="grp"><div class="gh">${svcBadge(g.name, 'sm')}<span>${esc(g.name)}</span>${g.items.length > 1 ? `<span class="n">${g.items.length}개</span>` : ''}</div>
      ${g.items.map(a => {
        const p = a.login_type === 'social' ? providerById(a.provider_id) : null;
        const host = (() => { try { return a.url ? new URL(S.safeHref(a.url)).host : ''; } catch { return ''; } })();
        return `<button class="row" data-act="sel" data-id="${a.id}" ${cur(a.id)}>
          ${p ? badge(p) : `<span class="bdg svc">${ic('user')}</span>`}
          <span class="tx"><span class="t1">${esc(loginLabel(a))}</span><span class="t2">${esc(host || (a.aliases.length ? a.aliases.join(', ') : ''))}</span></span>${ic('chevR', 'chev')}</button>`;
      }).join('')}</div>`).join('');
    return;
  }
  if (ui.view === 'notes') {
    const notes = S.sortedNotes(pdoc);
    if (!notes.length) { el.innerHTML = emptyHtml('note', '보안 메모가 없습니다', '메모 추가'); return; }
    el.innerHTML = notes.map(n => `<button class="card" data-act="sel" data-id="${n.id}" ${cur(n.id)}>
      <span class="bdg svc">${ic('lock')}</span><span class="tx"><span class="t1">${esc(n.title || '(제목 없음)')}</span></span>${ic('chevR', 'lk')}</button>`).join('');
    return;
  }
  if (ui.view === 'social') {
    const ps = S.sortedProviders(pdoc);
    if (!ps.length) { el.innerHTML = emptyHtml('link', '등록한 소셜 로그인이 없습니다', '소셜 추가'); return; }
    el.innerHTML = ps.map(p => {
      const n = S.socialOf(pdoc, p.id).length, u = S.providerUsage(pdoc, p.id);
      return `<button class="card" data-act="sel" data-id="${p.id}" ${cur(p.id)}>${badge(p)}
        <span class="tx"><span class="t1">${esc(p.name)}</span><span class="t2">등록 계정 ${n}개 · 사용 ${u}곳</span></span>${ic('chevR', 'lk')}</button>`;
    }).join('');
  }
}
const emptyHtml = (icon, msg, add) => `<div class="empty">${ic(icon)}<span>${esc(msg)}</span><button class="btn" data-act="add">${ic('plus')}${esc(add)}</button></div>`;

// ---------- 상세 패널 ----------
function setPanelOpen(open) {
  document.body.classList.toggle('no-sel', !open);
  document.body.classList.toggle('sheet-open', open && !wide());
}
function panelHead(title, extra = '') {
  return `<div class="ph">${title}${extra}<button class="icbtn" data-act="close" aria-label="닫기">${ic('x')}</button></div>`;
}
function secretHtml(key, value, { mono = false, multi = false } = {}) {
  if (!value) return `<div class="fv none">없음</div>`;
  const shown = ui.revealed.has(key);
  return `<button class="secret ${shown ? '' : 'masked'} ${mono ? 'mono' : ''}" data-act="reveal" data-key="${esc(key)}" aria-pressed="${shown}" aria-label="${shown ? '가리기' : '눌러서 보기'}">
    <span class="v">${shown ? esc(value) : `••••••••<small>눌러서 보기</small>`}</span>${ic(shown ? 'eyeOff' : 'eye')}</button>`;
}

function renderPanel() {
  const el = $('#panel');
  const d = ui.draft;
  if (d) { el.innerHTML = d.kind === 'account' ? accountForm(d) : noteForm(d); setPanelOpen(true); bindForm(); return; }
  const id = ui.sel;
  const a = id && ui.view === 'accounts' ? L(pdoc.accounts).find(x => x.id === id) : null;
  const n = id && ui.view === 'notes' ? L(pdoc.notes).find(x => x.id === id) : null;
  const p = id && ui.view === 'social' ? L(pdoc.providers).find(x => x.id === id) : null;
  if (!a && !n && !p) { ui.sel = null; el.innerHTML = ''; setPanelOpen(false); return; }
  el.innerHTML = a ? accountView(a) : n ? noteView(n) : providerPanel(p);
  setPanelOpen(true);
}

function accountView(a) {
  const p = a.login_type === 'social' ? providerById(a.provider_id) : null;
  const s = socialById(a.social_account_id);
  const href = S.safeHref(a.url);
  const login = a.login_type === 'social'
    ? `<div><span class="fl">로그인 방식</span><div class="fv login">${badge(p, 'sm')}<span>${esc(p ? p.name : '(삭제된 소셜)')} 계정으로 로그인</span></div></div>
       <div><span class="fl">연동 계정</span><div class="fv ${s ? '' : 'none'}">${esc(s ? s.label : '선택 안 함')}</div></div>`
    : `<div><span class="fl">ID</span><div class="fv ${a.login_id ? '' : 'none'}">${esc(a.login_id || '없음')}</div></div>
       <div><span class="fl">비밀번호</span>${secretHtml(a.id + ':pw', a.password, { mono: true })}</div>`;
  return `${panelHead(`${svcBadge(a.service, 'lg')}<h2>${esc(a.service || '(이름 없음)')}</h2>`, `<button class="icbtn" data-act="edit" aria-label="편집" title="편집">${ic('edit')}</button>`)}
    <div class="pb">
      ${a.aliases.length ? `<div><span class="fl">검색 별칭</span><div class="tags">${a.aliases.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>` : ''}
      ${login}
      <div><span class="fl">URL</span><div class="fv ${a.url ? '' : 'none'}">${a.url ? (href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(a.url)}</a>` : esc(a.url)) : '없음'}</div></div>
      <div><span class="fl">메모</span>${secretHtml(a.id + ':memo', a.memo, { multi: true })}</div>
      <div class="meta"><span>만든 날 ${esc(fmtDate(a.created_at))}</span><span>고친 날 ${esc(fmtDate(a.updated_at))}</span></div>
    </div>
    <div class="pf"><span class="lbl">${esc(a.id)}</span><span class="sp"></span><button class="btn danger" data-act="delete">${ic('trash')}삭제</button></div>`;
}
function noteView(n) {
  return `${panelHead(`<span class="bdg svc lg">${ic('lock')}</span><h2>${esc(n.title || '(제목 없음)')}</h2>`, `<button class="icbtn" data-act="edit" aria-label="편집" title="편집">${ic('edit')}</button>`)}
    <div class="pb">
      <div><span class="fl">내용</span>${secretHtml(n.id + ':body', n.body, { mono: true, multi: true })}</div>
      <div class="meta"><span>만든 날 ${esc(fmtDate(n.created_at))}</span><span>고친 날 ${esc(fmtDate(n.updated_at))}</span></div>
    </div>
    <div class="pf"><span class="lbl">${esc(n.id)}</span><span class="sp"></span><button class="btn danger" data-act="delete">${ic('trash')}삭제</button></div>`;
}

// ---------- 계정 편집 ----------
function accountForm(d) {
  const ps = S.sortedProviders(pdoc);
  const social = d.login_type === 'social';
  const sas = social ? S.socialOf(pdoc, d.provider_id) : [];
  const hadCred = d.orig && d.orig.login_type !== 'social' && (d.orig.login_id || d.orig.password);
  return `${panelHead(`<h2>${d.isNew ? '계정 추가' : '계정 편집'}</h2>`)}
    <form class="pb" id="form" autocomplete="off">
      <div><label class="fl" for="fService">서비스명 *</label><input class="in" id="fService" maxlength="80" value="${esc(d.service)}" placeholder="예: Anthropic"></div>
      <div><label class="fl" for="fAlias">검색 별칭</label>
        <div class="chipin" id="aliasBox">${d.aliases.map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-alias-del="${i}" aria-label="${esc(t)} 지우기">${ic('x')}</button></span>`).join('')}
        <input id="fAlias" maxlength="40" placeholder="${d.aliases.length ? '' : '예: 앤트로픽, 엔트로픽'}" enterkeyhint="done"></div>
        <p class="hint">Enter나 쉼표로 추가합니다. 다르게 부를 만한 이름을 넣어 두면 검색에 걸립니다.</p></div>
      <div><label class="fl" for="fLogin">로그인 방식</label>
        <select class="in" id="fLogin"><option value="">직접 입력 (ID·비밀번호)</option>${ps.map(p => `<option value="${p.id}" ${social && d.provider_id === p.id ? 'selected' : ''}>${esc(p.name)} 계정으로 로그인</option>`).join('')}</select></div>
      ${social ? `<div><label class="fl" for="fSa">연동 계정</label>
          <select class="in" id="fSa"><option value="">선택 안 함</option>${sas.map(s => `<option value="${s.id}" ${d.social_account_id === s.id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}<option value="__new">+ 새 계정 추가…</option></select>
          ${hadCred ? `<p class="hint">저장하면 이 계정에 있던 ID와 비밀번호는 지워집니다.</p>` : ''}</div>`
        : `<div><label class="fl" for="fId">ID</label><input class="in" id="fId" maxlength="200" value="${esc(d.login_id)}" autocapitalize="off" spellcheck="false" autocomplete="off"></div>
          <div><label class="fl" for="fPw">비밀번호</label><div class="inwrap"><input class="in" id="fPw" type="${d.showPw ? 'text' : 'password'}" maxlength="500" value="${esc(d.password)}" autocomplete="new-password" spellcheck="false" style="font-family:var(--mono)">
            <button type="button" class="icbtn" data-act="pw-eye" aria-label="${d.showPw ? '비밀번호 가리기' : '비밀번호 보기'}">${ic(d.showPw ? 'eyeOff' : 'eye')}</button></div></div>`}
      <div><label class="fl" for="fUrl">URL</label><input class="in" id="fUrl" maxlength="500" value="${esc(d.url)}" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="예: https://claude.ai"></div>
      <div><label class="fl" for="fMemo">메모</label><textarea class="in" id="fMemo" maxlength="5000" spellcheck="false">${esc(d.memo)}</textarea></div>
      <p class="note" id="formErr" hidden></p>
    </form>
    <div class="pf"><span class="sp"></span><button class="btn" data-act="cancel">취소</button><button class="btn primary" data-act="save">저장</button></div>`;
}
function noteForm(d) {
  return `${panelHead(`<h2>${d.isNew ? '보안 메모 추가' : '보안 메모 편집'}</h2>`)}
    <form class="pb" id="form" autocomplete="off">
      <div><label class="fl" for="fTitle">제목 *</label><input class="in" id="fTitle" maxlength="120" value="${esc(d.title)}" placeholder="예: GitHub 토큰"></div>
      <div><label class="fl" for="fBody">내용</label><textarea class="in" id="fBody" maxlength="20000" spellcheck="false" style="min-height:200px;font-family:var(--mono);font-size:14px">${esc(d.body)}</textarea></div>
      <p class="hint">목록에는 제목만 보이고, 내용은 눌러야 보입니다.</p>
      <p class="note" id="formErr" hidden></p>
    </form>
    <div class="pf"><span class="sp"></span><button class="btn" data-act="cancel">취소</button><button class="btn primary" data-act="save">저장</button></div>`;
}
// 입력 중인 값을 draft에 반영 (다시 그리기 전에 호출)
function readForm() {
  const d = ui.draft;
  if (!d) return;
  const v = id => $(id)?.value;
  if (d.kind === 'account') {
    d.service = v('#fService') ?? d.service;
    if ($('#fId')) d.login_id = v('#fId');
    if ($('#fPw')) d.password = v('#fPw');
    d.url = v('#fUrl') ?? d.url;
    d.memo = v('#fMemo') ?? d.memo;
    const pending = (v('#fAlias') || '').trim();
    if (pending) { addAliases(pending); $('#fAlias').value = ''; }
  } else {
    d.title = v('#fTitle') ?? d.title;
    d.body = v('#fBody') ?? d.body;
  }
}
function addAliases(text) {
  const d = ui.draft;
  for (const t of text.split(',').map(s => s.trim()).filter(Boolean)) {
    if (!d.aliases.some(x => x.toLowerCase() === t.toLowerCase())) d.aliases.push(t.slice(0, 40));
  }
}
function rerenderForm(focusId) {
  const scroll = $('#form')?.scrollTop || 0;
  renderPanel();
  const f = $('#form'); if (f) f.scrollTop = scroll;
  if (focusId) $(focusId)?.focus();
}
function bindForm() {
  const f = $('#form');
  if (!f) return;
  f.addEventListener('submit', e => { e.preventDefault(); saveDraft(); });
  const ai = $('#fAlias');
  if (ai) {
    ai.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); readForm(); rerenderForm('#fAlias'); }
      else if (e.key === 'Backspace' && !ai.value && ui.draft.aliases.length) { readForm(); ui.draft.aliases.pop(); rerenderForm('#fAlias'); }
    });
    ai.addEventListener('input', () => { if (ai.value.includes(',')) { readForm(); rerenderForm('#fAlias'); } });
    $('#aliasBox').addEventListener('click', e => {
      const b = e.target.closest('[data-alias-del]');
      if (b) { readForm(); ui.draft.aliases.splice(Number(b.dataset.aliasDel), 1); rerenderForm('#fAlias'); }
      else if (e.target.id === 'aliasBox') ai.focus();
    });
  }
  $('#fLogin')?.addEventListener('change', e => {
    readForm();
    const d = ui.draft;
    if (e.target.value) { d.login_type = 'social'; if (d.provider_id !== e.target.value) d.social_account_id = null; d.provider_id = e.target.value; }
    else { d.login_type = 'direct'; d.provider_id = null; d.social_account_id = null; }
    rerenderForm('#fLogin');
  });
  $('#fSa')?.addEventListener('change', async e => {
    readForm();
    const d = ui.draft;
    if (e.target.value === '__new') {
      const p = providerById(d.provider_id);
      const label = await promptDialog(`${p?.name || ''} 계정 추가`, 'ID 또는 메일 주소', '');
      if (label) {
        const s = S.createSocialAccount(pdoc, d.provider_id, label);
        if (s) { d.social_account_id = s.id; persist(); }
      }
      rerenderForm('#fSa');
      return;
    }
    d.social_account_id = e.target.value || null;
  });
}
function promptDialog(title, label, value) {
  return new Promise(resolve => {
    const d = openDialog(title, `<form id="pf" autocomplete="off"><label class="fl" for="pIn">${esc(label)}</label><input class="in" id="pIn" maxlength="120" value="${esc(value)}" autocapitalize="off" spellcheck="false"></form>`,
      `<button class="btn" data-r="0">취소</button><button class="btn primary" data-r="1">추가</button>`);
    let doneV = false;
    const done = v => { if (doneV) return; doneV = true; d.removeEventListener('click', on); closeDialog(); resolve(v); };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1' ? $('#pIn').value.trim() : null); };
    d.addEventListener('click', on);
    $('#pf').addEventListener('submit', e => { e.preventDefault(); done($('#pIn').value.trim()); });
    d.addEventListener('close', () => done(null), { once: true });
    $('#pIn').focus();
  });
}

function startDraft(kind, item) {
  if (kind === 'account') {
    const base = item || { service: '', aliases: [], login_type: 'direct', provider_id: null, social_account_id: null, login_id: '', password: '', url: '', memo: '' };
    ui.draft = { kind, isNew: !item, id: item?.id || null, orig: item ? structuredClone(item) : null, showPw: false,
      service: base.service, aliases: [...base.aliases], login_type: base.login_type, provider_id: base.provider_id, social_account_id: base.social_account_id,
      login_id: base.login_id, password: base.password, url: base.url, memo: base.memo };
  } else {
    ui.draft = { kind, isNew: !item, id: item?.id || null, orig: item ? structuredClone(item) : null, title: item?.title || '', body: item?.body || '' };
  }
  renderPanel();
  $(kind === 'account' ? '#fService' : '#fTitle')?.focus();
}
function draftDirty() {
  const d = ui.draft;
  if (!d) return false;
  readForm();
  const o = d.orig || (d.kind === 'account' ? { service: '', aliases: [], login_type: 'direct', provider_id: null, social_account_id: null, login_id: '', password: '', url: '', memo: '' } : { title: '', body: '' });
  const keys = d.kind === 'account' ? ['service', 'login_type', 'provider_id', 'social_account_id', 'login_id', 'password', 'url', 'memo'] : ['title', 'body'];
  return keys.some(k => (d[k] ?? '') !== (o[k] ?? '')) || (d.kind === 'account' && JSON.stringify(d.aliases) !== JSON.stringify(o.aliases));
}
// 편집 중이면 버릴지 묻는다. 계속 진행해도 되면 true
async function leaveDraft() {
  if (!ui.draft) return true;
  if (draftDirty() && !(await confirmDialog('편집 취소', '저장하지 않은 내용이 있습니다. 버릴까요?', '버리기', true))) return false;
  ui.draft = null;
  return true;
}
function formError(msg, focus) {
  const e = $('#formErr');
  if (e) { e.textContent = msg; e.hidden = false; }
  if (focus) { $(focus)?.classList.add('err'); $(focus)?.focus(); }
}
function saveDraft() {
  readForm();
  const d = ui.draft;
  if (d.kind === 'account') {
    if (!d.service.trim()) return formError('서비스명을 입력하세요', '#fService');
    const fields = { service: d.service, aliases: d.aliases, login_type: d.login_type, provider_id: d.provider_id, social_account_id: d.social_account_id, login_id: d.login_id, password: d.password, url: d.url, memo: d.memo };
    let a = d.id ? pdoc.accounts.find(x => x.id === d.id) : null;
    if (a) Object.assign(a, fields, { updated_at: S.nowIso() });
    else a = S.createAccount(pdoc, fields);
    S.normalizeAccount(a);
    ui.sel = a.id;
  } else {
    if (!d.title.trim()) return formError('제목을 입력하세요', '#fTitle');
    const fields = { title: d.title.trim().slice(0, 120), body: d.body };
    let n = d.id ? pdoc.notes.find(x => x.id === d.id) : null;
    if (n) Object.assign(n, fields, { updated_at: S.nowIso() });
    else n = S.createNote(pdoc, fields);
    ui.sel = n.id;
  }
  ui.draft = null;
  ui.revealed.clear();
  persist();
  renderAll();
  toast('저장했습니다');
}

// ---------- 소셜 관리 패널 (바로 저장) ----------
function providerPanel(p) {
  const sas = S.socialOf(pdoc, p.id);
  const used = S.providerUsage(pdoc, p.id);
  return `${panelHead(`${badge(p, 'lg')}<h2>${esc(p.name)}</h2>`)}
    <div class="pb">
      <div><label class="fl" for="pName">이름</label><input class="in" id="pName" maxlength="40" value="${esc(p.name)}" data-pid="${p.id}"></div>
      <div><span class="fl">아이콘</span>
        <div class="iconrow">${badge(p, 'lg')}<button class="btn" data-act="icon-up">${ic('img')}이미지 올리기</button>${p.icon ? `<button class="btn" data-act="icon-clear">이미지 지우기</button>` : ''}</div>
        <p class="hint">PNG·JPG·WebP·SVG (1MB 이하). 올리지 않으면 첫 글자 배지로 표시합니다.</p></div>
      ${p.icon ? '' : `<div><span class="fl">배지 색</span><div class="swatches">${S.PROVIDER_COLORS.map(c => `<button data-act="color" data-c="${c}" style="background:${c}" aria-label="색 ${c}" aria-pressed="${p.color === c}"></button>`).join('')}</div></div>`}
      <div><span class="fl">등록 계정 (ID 또는 메일 주소)</span>
        <div class="salist">${sas.map(s => {
          const u = S.socialUsage(pdoc, s.id);
          return `<div class="sarow"><input class="in" value="${esc(s.label)}" data-said="${s.id}" maxlength="120" autocapitalize="off" spellcheck="false" aria-label="계정">
            ${u ? `<span class="use">${u}곳 사용</span>` : ''}<button class="icbtn sm" data-act="sa-del" data-id="${s.id}" aria-label="삭제" ${u ? 'disabled title="사용 중인 계정은 지울 수 없습니다"' : ''}>${ic('trash')}</button></div>`;
        }).join('') || '<p class="hint" style="margin:0">등록한 계정이 없습니다.</p>'}
        <form class="sarow" id="saAdd" autocomplete="off"><input class="in" id="saNew" maxlength="120" placeholder="예: me@gmail.com" autocapitalize="off" spellcheck="false" aria-label="새 계정"><button class="btn" type="submit">${ic('plus')}추가</button></form></div></div>
    </div>
    <div class="pf"><span class="lbl">${used ? `계정 ${used}곳에서 사용 중이라 지울 수 없습니다` : esc(p.id)}</span><span class="sp"></span><button class="btn danger" data-act="delete" ${used ? 'disabled' : ''}>${ic('trash')}삭제</button></div>`;
}
function bindProviderPanel() {
  const panel = $('#panel');
  panel.addEventListener('change', e => {
    if (!unlocked || ui.view !== 'social') return;
    const p = L(pdoc.providers).find(x => x.id === ui.sel);
    if (!p) return;
    if (e.target.id === 'pName') {
      const name = e.target.value.trim().slice(0, 40);
      if (!name) { e.target.value = p.name; return; }
      if (name !== p.name) { p.name = name; p.updated_at = S.nowIso(); persist(); renderAll(); }
    } else if (e.target.dataset.said) {
      const s = L(pdoc.social_accounts).find(x => x.id === e.target.dataset.said);
      const label = e.target.value.trim().slice(0, 120);
      if (!s) return;
      if (!label) { e.target.value = s.label; return; }
      if (label !== s.label) { s.label = label; s.updated_at = S.nowIso(); persist(); }
    }
  });
  panel.addEventListener('submit', e => {
    if (e.target.id !== 'saAdd') return;
    e.preventDefault();
    const v = $('#saNew').value.trim();
    if (!v) return;
    if (S.createSocialAccount(pdoc, ui.sel, v)) { persist(); renderAll(); $('#saNew')?.focus(); }
  });
}

// ---------- 아이콘 이미지 (64px PNG로 줄여 암호화 문서에 저장) ----------
$('#iconFile').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !unlocked) return;
  if (file.size > 1024 * 1024) { toast('1MB 이하 이미지만 올릴 수 있습니다'); return; }
  try {
    const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const N = 64, cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const w = img.naturalWidth || N, h = img.naturalHeight || N, k = Math.min(N / w, N / h);
    cv.getContext('2d').drawImage(img, (N - w * k) / 2, (N - h * k) / 2, w * k, h * k);
    const p = L(pdoc.providers).find(x => x.id === ui.sel);
    if (!p) return;
    p.icon = cv.toDataURL('image/png');
    p.updated_at = S.nowIso();
    persist(); renderAll();
  } catch { toast('이미지를 읽지 못했습니다'); }
});

// ---------- 설정 ----------
function openSettings() {
  openDialog('설정', `<div class="menu">
      <button class="mi" data-s="pin">${ic('key')}PIN 변경</button>
      <button class="mi" data-s="recovery">${ic('shield')}복구 키 다시 만들기</button>
      <button class="mi" data-s="lock">${ic('lock')}지금 잠그기<span class="sub">5분 무조작 시 자동</span></button>
      <button class="mi danger" data-s="wipe">${ic('trash')}이 기기의 데이터 삭제</button>
    </div>
    <div><div class="kv"><span>버전</span><span>${VERSION} (1차 테스트)</span></div>
      <div class="kv"><span>저장 위치</span><span>이 기기만 (동기화는 M3)</span></div>
      <div class="kv"><span>금고 만든 날</span><span>${esc(fmtDate(meta.created_at))}</span></div></div>`);
}
dlg().addEventListener('click', e => {
  const b = e.target.closest('[data-s]');
  if (!b) return;
  ({ pin: dlgPin, recovery: dlgRecovery, lock: () => { closeDialog(); lock(); }, wipe: dlgWipe })[b.dataset.s]();
});
const pinInput = (id, label) => `<div><label class="fl" for="${id}">${label}</label><input class="in" id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" style="letter-spacing:.4em;font-family:var(--mono)"></div>`;
function dlgPin() {
  const d = openDialog('PIN 변경', `<form id="pinForm" autocomplete="off" style="display:flex;flex-direction:column;gap:14px">${pinInput('pCur', '현재 PIN')}${pinInput('pNew', '새 PIN 4자리')}${pinInput('pNew2', '새 PIN 확인')}<p class="note" id="pErr" hidden></p></form>`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn primary" id="pGo">변경</button>`);
  const err = m => { const e = $('#pErr'); e.textContent = m; e.hidden = false; };
  const go = async () => {
    const cur = $('#pCur').value, n1 = $('#pNew').value, n2 = $('#pNew2').value;
    if (!C.isPin(n1)) return err('새 PIN은 숫자 4자리입니다');
    if (n1 !== n2) return err('새 PIN이 서로 다릅니다');
    $('#pGo').disabled = true;
    try { await C.unlockWithPin(meta, cur); } catch { $('#pGo').disabled = false; return err('현재 PIN이 맞지 않습니다'); }
    const next = await C.rewrapPin(meta, dek, n1);
    if (!(await S.put('meta', next))) { $('#pGo').disabled = false; return err('저장하지 못했습니다'); }
    meta = next; bc?.postMessage({ type: 'meta', tab: TAB_ID });
    closeDialog(); toast('PIN을 바꿨습니다');
  };
  $('#pGo').addEventListener('click', go);
  $('#pinForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#pCur').focus();
  return d;
}
function dlgRecovery() {
  openDialog('복구 키 다시 만들기', `<p>새 복구 키를 만들면 <b>이전 복구 키는 더 이상 쓸 수 없습니다.</b></p>
    <form id="rcForm" autocomplete="off">${pinInput('rcPin', '현재 PIN')}<p class="note" id="rcErr" hidden></p></form>`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn primary" id="rcGo">다음</button>`);
  const err = m => { const e = $('#rcErr'); e.textContent = m; e.hidden = false; };
  const go = async () => {
    try { await C.unlockWithPin(meta, $('#rcPin').value); } catch { return err('PIN이 맞지 않습니다'); }
    const { meta: next, recovery } = await C.newRecovery(meta, dek);
    openDialog('새 복구 키', `<p>아래 키를 적어 두세요. 이 창을 닫으면 다시 볼 수 없습니다.</p>
      <div class="rkey">${rkeyHtml(recovery)}</div>
      <label class="ck"><input type="checkbox" id="rcOk"> 안전한 곳에 적어 두었습니다</label>
      <div><label class="fl" for="rcHead">확인: 앞 4자리</label><input class="in" id="rcHead" maxlength="4" autocapitalize="characters" spellcheck="false" style="text-transform:uppercase;font-family:var(--mono);letter-spacing:.2em"></div>
      <p class="note" id="rcErr2" hidden></p>`,
      `<button class="btn" data-dlg="close">취소 (기존 키 유지)</button><button class="btn primary" id="rcSave" disabled>저장</button>`);
    $('#rcOk').addEventListener('change', e => { $('#rcSave').disabled = !e.target.checked; });
    $('#rcSave').addEventListener('click', async () => {
      if ($('#rcHead').value.toUpperCase().trim() !== recovery.slice(0, 4)) { const e = $('#rcErr2'); e.textContent = '앞 4자리가 맞지 않습니다'; e.hidden = false; return; }
      if (!(await S.put('meta', next))) { toast('저장하지 못했습니다'); return; }
      meta = next; bc?.postMessage({ type: 'meta', tab: TAB_ID });
      closeDialog(); toast('새 복구 키로 바꿨습니다');
    });
  };
  $('#rcGo').addEventListener('click', go);
  $('#rcForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#rcPin').focus();
}
function dlgWipe() {
  openDialog('이 기기의 데이터 삭제', `<p>이 기기에 저장된 Info Manager의 계정·메모·소셜 정보와 PIN 설정을 <b>모두 지웁니다.</b> 되돌릴 수 없습니다.</p>
    <p>계속하려면 아래에 <b>삭제</b>라고 입력하세요.</p><input class="in" id="wipeIn" autocomplete="off">`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn danger" id="wipeGo" disabled>모두 삭제</button>`);
  $('#wipeIn').addEventListener('input', e => { $('#wipeGo').disabled = e.target.value.trim() !== '삭제'; });
  $('#wipeGo').addEventListener('click', async () => {
    unlocked = false; clearTimeout(saveTimer);
    await saving;
    await S.clearAll();
    try { for (const k of Object.keys(localStorage)) if (k.startsWith('im-')) localStorage.removeItem(k); } catch { /* 무시 */ }
    bc?.postMessage({ type: 'unlocked', tab: TAB_ID });
    location.reload();
  });
  $('#wipeIn').focus();
}

// ---------- 이벤트 ----------
document.addEventListener('click', async e => {
  if (!unlocked || e.target.closest('dialog')) return;
  const b = e.target.closest('[data-act]');
  if (!b) {
    if (e.target.id === 'backdrop') closePanel();
    return;
  }
  const act = b.dataset.act;
  switch (act) {
    case 'view': {
      if (ui.view === b.dataset.v || !(await leaveDraft())) return;
      ui.view = b.dataset.v; ui.sel = null; ui.revealed.clear();
      renderAll(); $('#list').scrollTop = 0;
      return;
    }
    case 'sel': {
      if (ui.sel === b.dataset.id && !ui.draft) { if (!wide()) setPanelOpen(true); return; }
      if (!(await leaveDraft())) return;
      ui.sel = b.dataset.id; ui.revealed.clear();
      renderList(); renderPanel();
      $('#panel .pb')?.scrollTo(0, 0);
      return;
    }
    case 'add': {
      if (!(await leaveDraft())) return;
      if (ui.view === 'social') {
        const name = await promptDialog('소셜 로그인 추가', '이름 (예: Microsoft)', '');
        const p = name && S.createProvider(pdoc, name);
        if (p) { ui.sel = p.id; persist(); renderAll(); }
        return;
      }
      ui.sel = null; ui.revealed.clear(); renderList();
      startDraft(ui.view === 'accounts' ? 'account' : 'note', null);
      return;
    }
    case 'edit': {
      const item = ui.view === 'accounts' ? L(pdoc.accounts).find(x => x.id === ui.sel) : L(pdoc.notes).find(x => x.id === ui.sel);
      if (item) startDraft(ui.view === 'accounts' ? 'account' : 'note', item);
      return;
    }
    case 'cancel': if (await leaveDraft()) { renderPanel(); } return;
    case 'save': saveDraft(); return;
    case 'close': if (await leaveDraft()) closePanel(); return;
    case 'reveal': {
      const k = b.dataset.key;
      ui.revealed.has(k) ? ui.revealed.delete(k) : ui.revealed.add(k);
      const scroll = $('#panel .pb')?.scrollTop || 0;
      renderPanel();
      const pb = $('#panel .pb'); if (pb) pb.scrollTop = scroll;
      $(`[data-act="reveal"][data-key="${CSS.escape(k)}"]`)?.focus();
      return;
    }
    case 'pw-eye': readForm(); ui.draft.showPw = !ui.draft.showPw; rerenderForm('#fPw'); return;
    case 'delete': return deleteSelected();
    case 'lock': return lock();
    case 'settings': return openSettings();
    case 'icon-up': $('#iconFile').click(); return;
    case 'icon-clear': {
      const p = L(pdoc.providers).find(x => x.id === ui.sel);
      if (p) { p.icon = null; p.updated_at = S.nowIso(); persist(); renderAll(); }
      return;
    }
    case 'color': {
      const p = L(pdoc.providers).find(x => x.id === ui.sel);
      if (p && p.color !== b.dataset.c) { p.color = b.dataset.c; p.updated_at = S.nowIso(); persist(); renderAll(); }
      return;
    }
    case 'sa-del': {
      const s = L(pdoc.social_accounts).find(x => x.id === b.dataset.id);
      if (!s || S.socialUsage(pdoc, s.id)) return;
      if (!(await confirmDialog('계정 삭제', `<b>${esc(s.label)}</b> 계정을 지울까요?`, '삭제', true))) return;
      S.softDelete(s); persist(); renderAll();
      return;
    }
  }
});
function closePanel() {
  ui.sel = null; ui.draft = null; ui.revealed.clear();
  renderList(); renderPanel();
}
async function deleteSelected() {
  const id = ui.sel;
  if (ui.view === 'accounts') {
    const a = L(pdoc.accounts).find(x => x.id === id);
    if (!a || !(await confirmDialog('계정 삭제', `<b>${esc(a.service)}</b> · ${esc(loginLabel(a))} 계정을 지울까요?`, '삭제', true))) return;
    S.softDelete(a);
  } else if (ui.view === 'notes') {
    const n = L(pdoc.notes).find(x => x.id === id);
    if (!n || !(await confirmDialog('보안 메모 삭제', `<b>${esc(n.title)}</b> 메모를 지울까요?`, '삭제', true))) return;
    S.softDelete(n);
  } else if (ui.view === 'social') {
    const p = L(pdoc.providers).find(x => x.id === id);
    if (!p || S.providerUsage(pdoc, p.id)) return;
    if (!(await confirmDialog('소셜 로그인 삭제', `<b>${esc(p.name)}</b>와 등록 계정 ${S.socialOf(pdoc, p.id).length}개를 지울까요?`, '삭제', true))) return;
    S.softDelete(p);
    for (const s of S.socialOf(pdoc, p.id)) S.softDelete(s);
  }
  ui.sel = null; ui.revealed.clear();
  persist(); renderAll(); toast('삭제했습니다');
}
document.addEventListener('keydown', async e => {
  if (!unlocked || e.key !== 'Escape' || dlg().open) return;
  if (ui.draft) { if (await leaveDraft()) renderPanel(); return; }
  if (ui.sel) closePanel();
});
matchMedia('(min-width:700px)').addEventListener('change', () => { if (unlocked) renderPanel(); });
bindProviderPanel();

// ---------- 시작 ----------
async function boot() {
  if (top !== self) { document.body.textContent = ''; return; } // 다른 페이지 안에 끼워 넣어 쓰지 못하게
  meta = await S.get('meta');
  if (meta) lockScreen();
  else setupIntro();
}
boot();
