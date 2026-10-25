// Info Manager M1: 처음 설정(PIN·복구 키), 잠금·해제·자동 잠금, 개인용 계정·보안 메모, 소셜 관리 (이 기기에만 저장)
import * as C from './crypto.js';
import * as S from './store.js';
import * as Q from './search.js';
import * as Sync from './sync.js';

export const VERSION = 'M3.1';
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
  folder: '<path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>',
  folderPlus: '<path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M12 10.5v5M9.5 13h5"/>',
  field: '<path d="M5 7h14M5 12h9M5 17h6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  move: '<path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><path d="M10 13h5M13 10.5l2.5 2.5-2.5 2.5"/>',
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 01-1 1h-4v-5h-6v5H5a1 1 0 01-1-1z"/>',
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
const ui = { view: 'accounts', sel: null, draft: null, revealed: new Set(), path: null, hl: null, q: '', searchOpen: false };
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
const dirty = new Set(); // 'personal' | 'work'
// 바뀐 문서를 표시하고 잠시 뒤 저장한다
function save(kind = 'personal') {
  dirty.add(kind);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}
// 표시된 문서를 지금 암호화해 저장한다 (잠그기 전, 화면을 벗어날 때)
function flush(noSync = false) {
  clearTimeout(saveTimer);
  const key = dek;
  if (!unlocked || !key || !dirty.size) return saving;
  const jobs = [...dirty]; dirty.clear();
  const docs = { personal: pdoc, work: wdoc };
  saving = saving.then(async () => {
    const entries = {};
    for (const k of jobs) {
      const d = docs[k];
      if (!d) continue;
      d.updated_at = S.nowIso();
      entries[k] = await C.encryptDoc(key, d, k);
    }
    if (Object.keys(entries).length) saveOk = await S.putMany(entries);
    renderSaveLabel();
    if (!noSync) Sync.schedule(2000);
  });
  return saving;
}
function renderSaveLabel() {
  const el = $('#saveLabel');
  if (!el) return;
  const st = Sync.getState();
  const map = {
    off: ['이 기기에만 저장', '', 'Google Drive 연결하기'],
    idle: ['Drive 연결됨', '', '지금 동기화'],
    syncing: ['동기화 중…', '', ''],
    ok: [`동기화됨 ${st.lastSync || ''}`, 'ok', '지금 동기화'],
    'needs-auth': ['Drive 로그인 필요', 'warn', '눌러서 로그인'],
    offline: ['오프라인 · 이 기기에 저장됨', '', ''],
    error: ['동기화 오류', 'warn', '자세히 보기'],
    conflict: ['다른 금고 발견', 'warn', '눌러서 정하기'],
  };
  let [text, cls, title] = map[st.status] || map.off;
  if (!saveOk) { text = '저장 실패'; cls = 'warn'; title = '이 기기 저장소에 쓰지 못했습니다'; }
  el.textContent = text;
  el.className = 'sync ' + cls;
  el.title = title;
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
// 닫은 직후 다른 내용을 바로 열 수 있으므로, close 이벤트가 늦게 와도 다시 열린 상태면 건드리지 않는다
dlg().addEventListener('close', () => { if (!dlg().open) dlg().innerHTML = ''; });
function confirmDialog(title, msg, okLabel = '확인', danger = false) {
  return new Promise(resolve => {
    const d = openDialog(title, `<p>${msg}</p>`,
      `<button class="btn" data-r="0">취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okLabel)}</button>`);
    let fin = false;
    const done = v => { if (fin) return; fin = true; d.removeEventListener('click', on); d.removeEventListener('close', onClose); closeDialog(); resolve(v); };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
    const onClose = () => { if (!d.open) done(false); };
    d.addEventListener('click', on);
    d.addEventListener('close', onClose);
  });
}

// =====================================================================
// 잠금 화면 / 처음 설정
// =====================================================================
const gate = $('#gate');
let pad = null; // { len, buf, onDone, busy }
let fails = 0, waitUntil = 0, waitTimer = null;

function showGate(html) {
  $('#toast').hidden = true;
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
function setupIntro(msg = '') {
  pad = null;
  showGate(`${LOGO}<h1>Info Manager</h1>
    <p>개인 계정과 업무 정보를 암호화해 보관하고, Google Drive로 기기 간에 동기화합니다.</p>
    ${testWarning()}
    ${S.storageOk ? '' : `<div class="warn">${ic('warn')}<div><b>이 브라우저는 저장소를 쓸 수 없습니다</b>시크릿 창이거나 저장소가 막혀 있으면 닫을 때 데이터가 사라집니다.</div></div>`}
    ${msg ? `<p class="gmsg box">${esc(msg)}</p>` : ''}
    <div class="choice">
      <button class="btn primary" data-g="setup-start">새 금고 만들기</button>
      <span class="or">이미 다른 기기에서 만들었다면</span>
      <button class="btn" data-g="import">Drive에 있는 금고 불러오기</button>
    </div>`);
}
// 다른 기기에서 만든 금고를 Drive에서 받아 이 기기에 저장한다 (복호화는 PIN 입력 때)
async function importVault() {
  pad = null;
  showGate(`<div class="spin" aria-hidden="true"></div><p>Google 로그인 후 Drive에서 금고를 찾습니다…</p>`);
  if (!(await Sync.signIn())) { setupIntro('Google 로그인을 하지 못했습니다. 팝업 차단을 확인하고 다시 시도하세요'); return; }
  let v;
  try { v = await Sync.fetchVault(); }
  catch (e) { setupIntro(e.offline ? '인터넷에 연결되어 있지 않습니다' : 'Drive에서 금고를 읽지 못했습니다: ' + e.message); return; }
  if (!v) { setupIntro('Drive에 금고가 없습니다. 먼저 다른 기기에서 금고를 만들고 Drive에 연결하세요'); return; }
  await storeVault(v);
  lockScreen('Drive 금고를 받았습니다. 그 금고의 PIN을 입력하세요');
}
async function storeVault(v) {
  const entries = { meta: v.meta };
  if (v.personal) entries.personal = v.personal;
  if (v.work) entries.work = v.work;
  await S.clearAll();
  await S.putMany(entries);
  meta = v.meta;
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
  if (!meta.vault_id) { meta = { ...meta, vault_id: C.newVaultId() }; await S.put('meta', meta); } // M1·M2에서 만든 금고
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
    meta = next; bc?.postMessage({ type: 'meta', tab: TAB_ID }); Sync.schedule(500);
    const key = rec.dek; rec.dek = null; rec.pin = null; fails = 0;
    try { await openWith(key); toast('새 PIN으로 바꿨습니다'); }
    catch { lockScreen('데이터를 열 수 없습니다', false); }
  });
}

function gateAction(act) {
  switch (act) {
    case 'setup-start': return setupPin1();
    case 'import': return importVault();
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
  ui.sel = null; ui.draft = null; ui.revealed.clear(); ui.path = null; clearSearch(false);
  lastAct = Date.now();
  clearInterval(idleTimer);
  idleTimer = setInterval(checkIdle, 10000);
  bc?.postMessage({ type: 'unlocked', tab: TAB_ID });
  saveOk = S.storageOk; renderSaveLabel();
  renderAll();
  if (msg) toast(msg);
  if (Sync.isSignedIn()) Sync.syncNow();
}
async function lock(msg = '') {
  if (!unlocked) return;
  await flush();
  await saving;
  unlocked = false;
  clearInterval(idleTimer);
  closeDialog();
  dek = null; pdoc = null; wdoc = null;
  ui.sel = null; ui.draft = null; ui.revealed.clear(); ui.path = null; clearSearch(false);
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
  if (document.visibilityState === 'hidden') flush();
  else checkIdle();
});
addEventListener('pagehide', () => flush());

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
const searching = () => !!ui.q.trim();

function counts() {
  return { accounts: L(pdoc.accounts).length, notes: L(pdoc.notes).length, social: L(pdoc.providers).length, work: L(wdoc.nodes).filter(n => n.type === 'field').length };
}
function renderNav() {
  const c = counts();
  const nav = (v, icon, label, n, disabled = false) => `<button class="nav" data-act="view" data-v="${v}" aria-current="${ui.view === v}" title="${esc(label)}"${disabled ? ' disabled' : ''}>${ic(icon)}<span class="lbl">${esc(label)}</span>${n == null ? '' : `<span class="n">${n}</span>`}</button>`;
  $('#side').innerHTML = `<h3>개인</h3>${nav('accounts', 'user', '계정', c.accounts)}${nav('notes', 'note', '보안 메모', c.notes)}
    <div class="sep"></div><h3>업무</h3>${nav('work', 'tree', '업무 트리', c.work)}
    <div class="sep"></div><h3>관리</h3>${nav('social', 'link', '소셜 관리', c.social)}
    <span class="sp"></span>
    <button class="nav" data-act="settings" title="설정">${ic('gear')}<span class="lbl">설정</span></button>`;
  const chip = (v, label, n, disabled = false) => `<button class="chip" role="tab" data-act="view" data-v="${v}" aria-selected="${ui.view === v}"${disabled ? ' disabled' : ''}>${esc(label)}${n == null ? '' : `<span class="n">${n}</span>`}</button>`;
  $('#chips').innerHTML = chip('accounts', '계정', c.accounts) + chip('notes', '보안 메모', c.notes) + chip('work', '업무', c.work) + chip('social', '소셜', c.social);
}
function renderBar() {
  if (searching()) { $('#bar').innerHTML = `<h2>검색 결과</h2><span class="n" id="qCount"></span><button class="btn" data-act="search-clear">${ic('x')}검색 닫기</button>`; return; }
  if (ui.view === 'work') { $('#bar').innerHTML = workBar(); const cr = $('#bar .crumbs'); if (cr) cr.scrollLeft = cr.scrollWidth; return; }
  const c = counts();
  const add = { accounts: '계정 추가', notes: '메모 추가', social: '소셜 추가' }[ui.view];
  $('#bar').innerHTML = `<h2>${esc(VIEWS[ui.view])}</h2><span class="n">${c[ui.view] ?? ''}</span>
    ${add ? `<button class="btn primary" data-act="add">${ic('plus')}${esc(add)}</button>` : ''}`;
}

function renderList() {
  const el = $('#list');
  if (searching()) { el.innerHTML = searchResults(); return; }
  if (ui.view === 'work') { el.innerHTML = workList(); return; }
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
  if (d) { el.innerHTML = d.kind === 'account' ? accountForm(d) : d.kind === 'field' ? fieldForm(d) : noteForm(d); setPanelOpen(true); bindForm(); return; }
  const id = ui.sel;
  if (ui.view === 'work') {
    const node = S.nodeById(wdoc, id);
    if (node?.type === 'folder') { el.innerHTML = folderPanel(node); setPanelOpen(true); return; }
    ui.sel = null; el.innerHTML = ''; setPanelOpen(false); return;
  }
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
      ${(a.extra || []).map((x, i) => `<div><span class="fl">${esc(x.key)}</span>${secretHtml(a.id + ':x' + i, x.value, { mono: true })}</div>`).join('')}
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
      <div><span class="fl">추가 항목</span>
        <div class="xlist">${d.extra.map((x, i) => `<div class="xrow">
          <input class="in xk" data-xi="${i}" maxlength="60" value="${esc(x.key)}" placeholder="KEY (예: 카드번호)" spellcheck="false" aria-label="추가 항목 ${i + 1} KEY">
          <div class="inwrap xvw"><input class="in xv" data-xi="${i}" type="${x.shown ? 'text' : 'password'}" maxlength="2000" value="${esc(x.value)}" placeholder="값" autocomplete="new-password" spellcheck="false" aria-label="추가 항목 ${i + 1} 값">
            <button type="button" class="icbtn" data-act="x-eye" data-xi="${i}" aria-label="${x.shown ? '값 가리기' : '값 보기'}">${ic(x.shown ? 'eyeOff' : 'eye')}</button></div>
          <button type="button" class="icbtn sm" data-act="x-del" data-xi="${i}" aria-label="추가 항목 ${i + 1} 삭제">${ic('trash')}</button></div>`).join('')}</div>
        <button type="button" class="btn" data-act="x-add">${ic('plus')}항목 추가</button>
        <p class="hint">카드번호·인증서 비밀번호처럼 이 계정에 딸린 값을 자유롭게 넣습니다. 값은 모두 가려 두고 눌러야 보입니다.</p></div>
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
    document.querySelectorAll('#form .xk').forEach(el => { const x = d.extra[+el.dataset.xi]; if (x) x.key = el.value; });
    document.querySelectorAll('#form .xv').forEach(el => { const x = d.extra[+el.dataset.xi]; if (x) x.value = el.value; });
    const pending = (v('#fAlias') || '').trim();
    if (pending) { addAliases(pending); $('#fAlias').value = ''; }
  } else if (d.kind === 'field') {
    d.name = v('#fKey') ?? d.name;
    d.value = v('#fVal') ?? d.value;
    if ($('#fMask')) d.masked = $('#fMask').checked;
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
        if (s) { d.social_account_id = s.id; save('personal'); }
      }
      rerenderForm('#fSa');
      return;
    }
    d.social_account_id = e.target.value || null;
  });
}
// validate(값)이 오류 문구를 돌려주면 창을 닫지 않고 보여 준다
function promptDialog(title, label, value, { okLabel = '추가', validate = null, hint = null, placeholder = '', maxlength = 120 } = {}) {
  return new Promise(resolve => {
    const d = openDialog(title, `<form id="pf" autocomplete="off"><label class="fl" for="pIn">${esc(label)}</label><input class="in" id="pIn" maxlength="${maxlength}" value="${esc(value)}" placeholder="${esc(placeholder)}" autocapitalize="off" spellcheck="false"><p class="note" id="pErr" hidden></p>${hint ? `<p class="hint" id="pHint">${esc(hint(value))}</p>` : ''}</form>`,
      `<button class="btn" data-r="0">취소</button><button class="btn primary" data-r="1">${esc(okLabel)}</button>`);
    let doneV = false;
    const done = v => { if (doneV) return; doneV = true; d.removeEventListener('click', on); closeDialog(); resolve(v); };
    const submit = () => {
      const v = $('#pIn').value.trim();
      const err = validate && v ? validate(v) : null;
      if (err) { const e = $('#pErr'); e.textContent = err; e.hidden = false; $('#pIn').classList.add('err'); $('#pIn').focus(); return; }
      done(v);
    };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) (b.dataset.r === '1' ? submit() : done(null)); };
    d.addEventListener('click', on);
    $('#pf').addEventListener('submit', e => { e.preventDefault(); submit(); });
    if (hint) $('#pIn').addEventListener('input', () => { $('#pHint').textContent = hint($('#pIn').value); $('#pErr').hidden = true; $('#pIn').classList.remove('err'); });
    const onClose = () => { if (!d.open) { d.removeEventListener('close', onClose); done(null); } };
    d.addEventListener('close', onClose);
    $('#pIn').focus();
  });
}

function startDraft(kind, item) {
  if (kind === 'account') {
    const base = item || { service: '', aliases: [], login_type: 'direct', provider_id: null, social_account_id: null, login_id: '', password: '', url: '', memo: '' };
    ui.draft = { kind, isNew: !item, id: item?.id || null, orig: item ? structuredClone(item) : null, showPw: false,
      service: base.service, aliases: [...base.aliases], login_type: base.login_type, provider_id: base.provider_id, social_account_id: base.social_account_id,
      login_id: base.login_id, password: base.password, url: base.url, memo: base.memo,
      extra: (base.extra || []).map(x => ({ key: x.key, value: x.value, shown: false })) };
  } else if (kind === 'field') {
    ui.draft = { kind, isNew: !item, id: item?.id || null, parent: item ? item.parent_id : ui.path, orig: item ? structuredClone(item) : null,
      name: item?.name || '', value: item?.value || '', masked: item ? item.masked : true, showVal: !item || !item.masked };
  } else {
    ui.draft = { kind, isNew: !item, id: item?.id || null, orig: item ? structuredClone(item) : null, title: item?.title || '', body: item?.body || '' };
  }
  renderPanel();
  $({ account: '#fService', field: '#fKey', note: '#fTitle' }[kind])?.focus();
}
function draftDirty() {
  const d = ui.draft;
  if (!d) return false;
  readForm();
  const o = d.orig || (d.kind === 'account' ? { service: '', aliases: [], login_type: 'direct', provider_id: null, social_account_id: null, login_id: '', password: '', url: '', memo: '' } : d.kind === 'field' ? { name: '', value: '', masked: true } : { title: '', body: '' });
  const keys = d.kind === 'account' ? ['service', 'login_type', 'provider_id', 'social_account_id', 'login_id', 'password', 'url', 'memo'] : d.kind === 'field' ? ['name', 'value', 'masked'] : ['title', 'body'];
  return keys.some(k => (d[k] ?? '') !== (o[k] ?? '')) || (d.kind === 'account' && (JSON.stringify(d.aliases) !== JSON.stringify(o.aliases)
    || JSON.stringify(d.extra.filter(x => x.key.trim() || x.value).map(x => [x.key.trim(), x.value])) !== JSON.stringify((o.extra || []).map(x => [x.key, x.value]))));
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
    const xErr = S.extraError(d.extra);
    if (xErr) return formError(xErr);
    const fields = { service: d.service, aliases: d.aliases, login_type: d.login_type, provider_id: d.provider_id, social_account_id: d.social_account_id, login_id: d.login_id, password: d.password, url: d.url, memo: d.memo,
      extra: d.extra.map(x => ({ key: x.key, value: x.value })) };
    let a = d.id ? pdoc.accounts.find(x => x.id === d.id) : null;
    if (a) Object.assign(a, fields, { updated_at: S.nowIso() });
    else a = S.createAccount(pdoc, fields);
    S.normalizeAccount(a);
    ui.sel = a.id;
  } else if (d.kind === 'field') {
    let r;
    const node = d.id ? S.nodeById(wdoc, d.id) : null;
    if (node) r = S.updateNode(wdoc, node, { name: d.name, value: d.value, masked: d.masked });
    else r = S.createNode(wdoc, d.parent, 'field', { name: d.name, value: d.value, masked: d.masked });
    if (r.error) return formError(r.error, '#fKey');
    ui.hl = r.node.id;
    ui.path = r.node.parent_id;
    ui.draft = null;
    ui.revealed.clear();
    save('work');
    renderAll();
    toast('저장했습니다');
    return;
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
  save('personal');
  renderAll();
  toast('저장했습니다');
}


// =====================================================================
// 업무 트리 (M2)
// =====================================================================
const pathNames = id => S.pathOf(wdoc, id).map(n => n.name);
function crumbsHtml() {
  const path = S.pathOf(wdoc, ui.path);
  const parts = [`<button class="crumb" data-act="go-folder" data-id="" ${path.length ? '' : 'aria-current="page"'}>${ic('home')}<span>업무</span></button>`];
  path.forEach((n, i) => parts.push(`<span class="csep" aria-hidden="true">›</span><button class="crumb" data-act="go-folder" data-id="${n.id}" ${i === path.length - 1 ? 'aria-current="page"' : ''}>${esc(n.name)}</button>`));
  return `<nav class="crumbs" aria-label="현재 위치">${parts.join('')}</nav>`;
}
function workBar() {
  if (ui.path && !S.nodeById(wdoc, ui.path)) ui.path = null;
  const cur = S.nodeById(wdoc, ui.path);
  return `<h2>${esc(cur ? cur.name : '업무')}</h2>
    <span class="acts">${cur ? `<button class="icbtn" data-act="folder-manage" aria-label="이 폴더 관리" title="이 폴더 관리 (이름 변경·이동·삭제)">${ic('edit')}</button>` : ''}
    <button class="btn" data-act="add-folder">${ic('folderPlus')}폴더</button><button class="btn primary" data-act="add-field">${ic('plus')}항목</button></span>
    ${crumbsHtml()}`;
}
function workList() {
  const { folders, fields } = S.childrenOf(wdoc, ui.path);
  if (!folders.length && !fields.length) {
    return `<div class="empty">${ic('tree')}<span>${ui.path ? '비어 있는 폴더입니다' : '업무 정보를 폴더로 정리해 보세요'}</span>
      ${ui.path ? '' : '<span class="hint">예: 고객사 › 시스템 › 대상 순서로 폴더를 만들고, 그 안에 ID·PW 같은 항목을 넣습니다</span>'}
      <span class="btns"><button class="btn" data-act="add-folder">${ic('folderPlus')}폴더</button><button class="btn" data-act="add-field">${ic('plus')}항목</button></span></div>`;
  }
  const fold = folders.map(f => {
    const kids = S.childrenOf(wdoc, f.id);
    const parts = [];
    if (kids.folders.length) parts.push(`폴더 ${kids.folders.length}`);
    if (kids.fields.length) parts.push(`항목 ${kids.fields.length}`);
    return `<button class="card fold" data-act="open-folder" data-id="${f.id}">${ic('folder', 'fic')}<span class="tx"><span class="t1">${esc(f.name)}</span><span class="t2">${parts.join(' · ') || '비어 있음'}</span></span>${ic('chevR', 'lk')}</button>`;
  }).join('');
  return fold + (fields.length ? `<div class="grp fields">${fields.map(fieldRow).join('')}</div>` : '');
}
function fieldRow(n) {
  const key = n.id + ':v';
  const shown = !n.masked || ui.revealed.has(key);
  const multi = n.value.includes('\n') ? 'multi' : '';
  let val, extra = '';
  if (!n.value) val = `<span class="fv none">값 없음</span>`;
  else if (shown) {
    val = `<span class="fv fval ${multi}">${esc(n.value)}</span>`;
    if (n.masked) extra = `<button class="icbtn sm" data-act="reveal" data-key="${key}" aria-pressed="true" aria-label="${esc(n.name)} 가리기">${ic('eyeOff')}</button>`;
  } else val = `<button class="maskbtn" data-act="reveal" data-key="${key}" aria-pressed="false" aria-label="${esc(n.name)} 눌러서 보기"><span>••••••••</span><small>눌러서 보기</small>${ic('eye')}</button>`;
  const cur = ui.hl === n.id || ui.draft?.id === n.id;
  return `<div class="frow" data-id="${n.id}" aria-current="${cur}"><div class="fk">${n.masked ? ic('lock', 'kl') : ''}<span>${esc(n.name)}</span></div>
    <div class="fvw">${val}</div><div class="fa">${extra}<button class="icbtn sm" data-act="edit-field" data-id="${n.id}" aria-label="${esc(n.name)} 편집">${ic('edit')}</button></div></div>`;
}
function folderPanel(f) {
  const c = S.countUnder(wdoc, f.id);
  const where = ['업무', ...pathNames(f.parent_id)].join(' › ');
  return `${panelHead(`<span class="bdg svc lg">${ic('folder')}</span><h2>${esc(f.name)}</h2>`)}
    <div class="pb">
      <form id="folderForm" autocomplete="off"><label class="fl" for="fFolder">폴더 이름</label>
        <div class="selrow"><input class="in" id="fFolder" maxlength="100" value="${esc(f.name)}" spellcheck="false"><button class="btn" type="submit">바꾸기</button></div>
        <p class="note" id="folderErr" hidden></p></form>
      <div><span class="fl">위치</span><div class="fv">${esc(where)}</div></div>
      <div><span class="fl">안에 든 것 (하위 전체)</span><div class="fv">폴더 ${c.folders}개 · 항목 ${c.fields}개</div></div>
      <div><button class="btn" data-act="move" data-id="${f.id}">${ic('move')}다른 폴더로 이동</button></div>
      <div class="meta"><span>만든 날 ${esc(fmtDate(f.created_at))}</span><span>고친 날 ${esc(fmtDate(f.updated_at))}</span></div>
    </div>
    <div class="pf"><span class="lbl">${esc(f.id)}</span><span class="sp"></span><button class="btn danger" data-act="delete">${ic('trash')}삭제</button></div>`;
}
function fieldForm(d) {
  const parent = d.id ? (S.nodeById(wdoc, d.id)?.parent_id ?? null) : d.parent;
  const where = ['업무', ...pathNames(parent)].join(' › ');
  const rows = Math.min(10, Math.max(2, (d.value.match(/\n/g) || []).length + 1));
  return `${panelHead(`<h2>${d.isNew ? '항목 추가' : '항목 편집'}</h2>`)}
    <form class="pb" id="form" autocomplete="off">
      <div><span class="fl">위치</span><div class="fv">${esc(where)}</div></div>
      <div><label class="fl" for="fKey">key *</label><input class="in" id="fKey" maxlength="100" value="${esc(d.name)}" autocapitalize="off" spellcheck="false" placeholder="예: ID, PW, IP, privateKey">
        ${d.isNew ? `<div class="qk" aria-label="빠른 입력">${S.QUICK_KEYS.map(q => `<button type="button" class="chip" data-act="quick-key" data-k="${q.key}" data-m="${q.masked ? 1 : 0}" aria-pressed="${d.name === q.key}">${q.key}</button>`).join('')}</div>` : ''}</div>
      <div><label class="fl" for="fVal">값</label><div class="inwrap"><textarea class="in mono ${d.showVal ? '' : 'hidev'}" id="fVal" rows="${rows}" maxlength="20000" spellcheck="false" autocapitalize="off" autocomplete="off">${esc(d.value)}</textarea>
        <button type="button" class="icbtn" data-act="val-eye" aria-label="${d.showVal ? '값 가리기' : '값 보기'}">${ic(d.showVal ? 'eyeOff' : 'eye')}</button></div>
        <p class="hint">여러 줄(개인키 등)도 그대로 넣을 수 있습니다.</p></div>
      <label class="ck"><input type="checkbox" id="fMask" ${d.masked ? 'checked' : ''}> 값 가리기 (눌러야 보이고, 검색에서 빠짐)</label>
      <p class="note" id="formErr" hidden></p>
    </form>
    <div class="pf">${d.isNew ? '' : `<button class="icbtn" data-act="move" data-id="${d.id}" aria-label="다른 폴더로 이동" title="다른 폴더로 이동">${ic('move')}</button><button class="icbtn" data-act="delete" aria-label="삭제" title="삭제" style="color:var(--danger)">${ic('trash')}</button>`}
      <span class="sp"></span><button class="btn" data-act="cancel">취소</button><button class="btn primary" data-act="save">저장</button></div>`;
}
// 새 폴더: 'a/b/c'처럼 쓰면 없는 단계만 만든다. 여러 단계를 쓰면 마지막 폴더로 들어간다
function newFolder() {
  const base = S.nodeById(wdoc, ui.path);
  const hint = v => {
    const p = S.planPath(wdoc, ui.path, v);
    if (!p.segments.length) return '/로 이어 쓰면 여러 단계를 한 번에 만듭니다. 이미 있는 폴더는 그대로 씁니다';
    if (p.error) return p.error;
    if (!p.toCreate.length) return '이미 있는 폴더입니다. 그 폴더로 이동합니다';
    return `새로 만들 폴더 ${p.toCreate.length}개: ${p.toCreate.join(' › ')}${p.existing.length ? ` (기존 ${p.existing.map(n => n.name).join(' › ')} 아래)` : ''}`;
  };
  return promptDialog(base ? `'${base.name}' 안에 새 폴더` : '새 폴더', '폴더 이름', '', {
    okLabel: '만들기', maxlength: 600, placeholder: '예: 삼성증권/HIWARE/ServerEDR', hint,
    validate: v => S.planPath(wdoc, ui.path, v).error,
  }).then(text => {
    if (!text) return;
    const multi = S.splitPath(text).length > 1;
    const r = S.createPath(wdoc, ui.path, text);
    if (r.error) { toast(r.error); return; }
    if (multi || !r.created.length) { ui.path = r.node.id; ui.hl = null; ui.revealed.clear(); }
    if (r.created.length) save('work');
    renderAll();
    toast(r.created.length ? `폴더 ${r.created.length}개를 만들었습니다` : '이미 있는 폴더로 이동했습니다');
  });
}
function moveDialog(node) {
  const rows = [];
  const walk = (pid, depth) => { for (const f of S.childrenOf(wdoc, pid).folders) { rows.push({ f, depth }); walk(f.id, depth + 1); } };
  walk(null, 1);
  const here = node.parent_id || '';
  const opt = (id, name, depth) => {
    const err = S.moveError(wdoc, node, id || null);
    return `<button class="mi tree" data-move="${id}" style="padding-left:${8 + depth * 18}px" ${err ? `disabled title="${esc(err)}"` : ''}>${ic(id ? 'folder' : 'home')}<span class="t">${esc(name)}</span>${id === here ? '<span class="sub">현재 위치</span>' : ''}</button>`;
  };
  const d = openDialog(`'${node.name}' 이동`, `<p>옮길 폴더를 고르세요. ${node.type === 'folder' ? '하위 폴더·항목도 함께 옮겨집니다.' : ''}</p>
    <div class="menu treebox">${opt('', '업무 (최상위)', 0)}${rows.map(r => opt(r.f.id, r.f.name, r.depth)).join('')}</div>`);
  const on = e => {
    const b = e.target.closest('[data-move]');
    if (!b || b.disabled) return;
    const target = b.dataset.move || null;
    const r = S.moveNode(wdoc, node, target);
    if (r.error) { toast(r.error); return; }
    d.removeEventListener('click', on);
    closeDialog();
    if (node.type === 'field') { ui.path = target; ui.hl = node.id; if (ui.draft?.id === node.id) ui.draft.parent = target; }
    save('work'); readForm(); renderAll();
    toast(`${['업무', ...pathNames(target)].join(' › ')}(으)로 옮겼습니다`);
  };
  d.addEventListener('click', on);
  const offClose = () => { if (!d.open) { d.removeEventListener('click', on); d.removeEventListener('close', offClose); } };
  d.addEventListener('close', offClose);
}

// =====================================================================
// 통합 검색 (M2)
// =====================================================================
const qIn = $('#q');
function clearSearch(render = true) {
  ui.q = '';
  if (qIn) qIn.value = '';
  $('#qClear').hidden = true;
  ui.searchOpen = false;
  document.body.classList.remove('search-open');
  if (render && unlocked) { renderBar(); renderList(); }
}
qIn.addEventListener('input', () => {
  if (!unlocked) return;
  ui.q = qIn.value;
  $('#qClear').hidden = !qIn.value;
  renderBar(); renderList();
  $('#list').scrollTop = 0;
});
qIn.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearSearch(); qIn.blur(); } });
function openSearch() {
  ui.searchOpen = true;
  document.body.classList.add('search-open');
  qIn.focus();
}
function searchResults() {
  const r = Q.search(ui.q, { pdoc, wdoc, providerName: id => providerById(id)?.name || '', socialLabel: id => socialById(id)?.label || '' });
  const cnt = $('#qCount'); if (cnt) cnt.textContent = `${r.total}건`;
  if (!r.total) return `<div class="empty">${ic('search')}<span>‘${esc(ui.q.trim())}’에 맞는 항목이 없습니다</span><span class="hint">비밀번호·메모·보안 메모 내용·가린 값은 검색하지 않습니다</span></div>`;
  const sec = (title, list, row) => (list.length ? `<div class="grp"><div class="gh">${esc(title)}<span class="n">${list.length}</span></div>${list.map(row).join('')}</div>` : '');
  return sec('개인 · 계정', r.accounts, ({ item: a }) => `<button class="row" data-act="res" data-kind="account" data-id="${a.id}">${svcBadge(a.service)}
      <span class="tx"><span class="t1">${esc(a.service)}</span><span class="t2">${esc(loginLabel(a))}${a.aliases.length ? ' · ' + esc(a.aliases.join(', ')) : ''}</span></span>${ic('chevR', 'chev')}</button>`)
    + sec('개인 · 보안 메모', r.notes, ({ item: n }) => `<button class="row" data-act="res" data-kind="note" data-id="${n.id}"><span class="bdg svc">${ic('lock')}</span>
      <span class="tx"><span class="t1">${esc(n.title || '(제목 없음)')}</span></span>${ic('chevR', 'chev')}</button>`)
    + sec('업무', r.work, ({ item: n, path }) => {
      const where = ['업무', ...path.slice(0, -1).map(p => p.name)].join(' › ');
      const val = n.type === 'field' ? (n.masked ? ' = ••••' : n.value ? ' = ' + n.value.split('\n')[0] : '') : '';
      return `<button class="row" data-act="res" data-kind="work" data-id="${n.id}"><span class="bdg svc">${ic(n.type === 'folder' ? 'folder' : 'field')}</span>
        <span class="tx"><span class="t1">${esc(n.name)}<span class="vv">${esc(val)}</span></span><span class="t2">${esc(where)}</span></span>${ic('chevR', 'chev')}</button>`;
    });
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
      if (name !== p.name) { p.name = name; p.updated_at = S.nowIso(); save('personal'); renderAll(); }
    } else if (e.target.dataset.said) {
      const s = L(pdoc.social_accounts).find(x => x.id === e.target.dataset.said);
      const label = e.target.value.trim().slice(0, 120);
      if (!s) return;
      if (!label) { e.target.value = s.label; return; }
      if (label !== s.label) { s.label = label; s.updated_at = S.nowIso(); save('personal'); }
    }
  });
  panel.addEventListener('submit', e => {
    if (e.target.id === 'folderForm') {
      e.preventDefault();
      const node = S.nodeById(wdoc, ui.sel);
      if (!node) return;
      const r = S.updateNode(wdoc, node, { name: $('#fFolder').value });
      if (r.error) { const er = $('#folderErr'); er.textContent = r.error; er.hidden = false; $('#fFolder').classList.add('err'); return; }
      save('work'); renderAll(); toast('폴더 이름을 바꿨습니다');
      return;
    }
    if (e.target.id !== 'saAdd') return;
    e.preventDefault();
    const v = $('#saNew').value.trim();
    if (!v) return;
    if (S.createSocialAccount(pdoc, ui.sel, v)) { save('personal'); renderAll(); $('#saNew')?.focus(); }
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
    save('personal'); renderAll();
  } catch { toast('이미지를 읽지 못했습니다'); }
});

// ---------- 설정 ----------
function driveSection() {
  const st = Sync.getState();
  if (!st.signedIn) return `<div class="menu"><button class="mi" data-s="drive-connect">${ic('link')}Google Drive 연결<span class="sub">PC·모바일 동기화</span></button></div>`;
  return `<div class="menu">
      <button class="mi" data-s="drive-sync">${ic('link')}지금 동기화<span class="sub">${esc(st.lastSync ? '마지막 ' + st.lastSync : '')}</span></button>
      <button class="mi" data-s="drive-off">${ic('x')}이 기기에서 Drive 연결 끊기</button>
    </div>`;
}
function openSettings() {
  openDialog('설정', `${driveSection()}<div class="menu">
      <button class="mi" data-s="pin">${ic('key')}PIN 변경</button>
      <button class="mi" data-s="recovery">${ic('shield')}복구 키 다시 만들기</button>
      <button class="mi" data-s="lock">${ic('lock')}지금 잠그기<span class="sub">5분 무조작 시 자동</span></button>
      <button class="mi danger" data-s="wipe">${ic('trash')}이 기기의 데이터 삭제</button>
    </div>
    <div><div class="kv"><span>버전</span><span>${VERSION} (1차 테스트)</span></div>
      <div class="kv"><span>저장 위치</span><span>${Sync.isSignedIn() ? '이 기기 + Google Drive (암호문)' : '이 기기만'}</span></div>
      <div class="kv"><span>검색 바로가기</span><span>/ 또는 Ctrl+K</span></div>
      <div class="kv"><span>금고 만든 날</span><span>${esc(fmtDate(meta.created_at))}</span></div></div>`);
}
dlg().addEventListener('click', e => {
  const b = e.target.closest('[data-s]');
  if (!b) return;
  ({
    pin: dlgPin, recovery: dlgRecovery, lock: () => { closeDialog(); lock(); }, wipe: dlgWipe,
    'drive-connect': () => { closeDialog(); connectDrive(); },
    'drive-sync': () => { closeDialog(); Sync.syncNow(); },
    'drive-off': async () => {
      closeDialog();
      if (!(await confirmDialog('Drive 연결 끊기', '이 기기에서만 동기화를 멈춥니다. 이 기기와 Drive의 데이터는 그대로 남습니다.', '연결 끊기'))) return;
      Sync.signOut(); toast('이 기기에서 Drive 연결을 끊었습니다');
    },
  })[b.dataset.s]();
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
    meta = next; bc?.postMessage({ type: 'meta', tab: TAB_ID }); Sync.schedule(500);
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
      meta = next; bc?.postMessage({ type: 'meta', tab: TAB_ID }); Sync.schedule(500);
      closeDialog(); toast('새 복구 키로 바꿨습니다');
    });
  };
  $('#rcGo').addEventListener('click', go);
  $('#rcForm').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#rcPin').focus();
}
function dlgWipe() {
  openDialog('이 기기의 데이터 삭제', `<p>이 기기에 저장된 Info Manager의 계정·메모·소셜·업무 정보와 PIN 설정을 <b>모두 지웁니다.</b> 되돌릴 수 없습니다.</p>
    <p>계속하려면 아래에 <b>삭제</b>라고 입력하세요.</p><input class="in" id="wipeIn" autocomplete="off">`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn danger" id="wipeGo" disabled>모두 삭제</button>`);
  $('#wipeIn').addEventListener('input', e => { $('#wipeGo').disabled = e.target.value.trim() !== '삭제'; });
  $('#wipeGo').addEventListener('click', async () => {
    unlocked = false; clearTimeout(saveTimer); dirty.clear();
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
      if ((ui.view === b.dataset.v && !searching()) || !(await leaveDraft())) return;
      if (searching()) clearSearch(false);
      ui.view = b.dataset.v; ui.sel = null; ui.hl = null; ui.revealed.clear();
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
        if (p) { ui.sel = p.id; save('personal'); renderAll(); }
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
    case 'cancel': if (await leaveDraft()) { renderList(); renderPanel(); } return;
    case 'save': saveDraft(); return;
    case 'close': if (await leaveDraft()) closePanel(); return;
    case 'reveal': {
      const k = b.dataset.key;
      ui.revealed.has(k) ? ui.revealed.delete(k) : ui.revealed.add(k);
      if (ui.view === 'work' && !searching()) {
        const ls = $('#list').scrollTop; readForm(); renderList(); $('#list').scrollTop = ls;
        ($(`[data-act="reveal"][data-key="${CSS.escape(k)}"]`) || $(`.frow[data-id="${CSS.escape(k.split(':')[0])}"] .fa [data-act="edit-field"]`))?.focus();
        return;
      }
      const scroll = $('#panel .pb')?.scrollTop || 0;
      renderPanel();
      const pb = $('#panel .pb'); if (pb) pb.scrollTop = scroll;
      $(`[data-act="reveal"][data-key="${CSS.escape(k)}"]`)?.focus();
      return;
    }
    case 'x-add': readForm(); ui.draft.extra.push({ key: '', value: '', shown: true }); rerenderForm(`#form .xk[data-xi="${ui.draft.extra.length - 1}"]`); return;
    case 'x-del': readForm(); ui.draft.extra.splice(+b.dataset.xi, 1); rerenderForm(); return;
    case 'x-eye': { readForm(); const x = ui.draft.extra[+b.dataset.xi]; if (x) x.shown = !x.shown; rerenderForm(`#form .xv[data-xi="${b.dataset.xi}"]`); return; }
    case 'pw-eye': readForm(); ui.draft.showPw = !ui.draft.showPw; rerenderForm('#fPw'); return;
    case 'delete': return deleteSelected();
    case 'open-folder':
    case 'go-folder': {
      if (!(await leaveDraft())) return;
      ui.path = b.dataset.id || null; ui.hl = null; ui.sel = null; ui.revealed.clear();
      renderAll(); $('#list').scrollTop = 0;
      return;
    }
    case 'add-folder': if (await leaveDraft()) { renderPanel(); newFolder(); } return;
    case 'add-field': if (await leaveDraft()) { ui.sel = null; startDraft('field', null); renderList(); } return;
    case 'edit-field': {
      const node = S.nodeById(wdoc, b.dataset.id);
      if (!node || ui.draft?.id === node.id || !(await leaveDraft())) return;
      ui.sel = null; ui.hl = node.id; startDraft('field', node); renderList();
      return;
    }
    case 'folder-manage': if (await leaveDraft()) { ui.sel = ui.path; renderPanel(); } return;
    case 'move': { const node = S.nodeById(wdoc, b.dataset.id); if (node) moveDialog(node); return; }
    case 'quick-key': readForm(); Object.assign(ui.draft, { name: b.dataset.k, masked: b.dataset.m === '1', showVal: b.dataset.m !== '1' }); rerenderForm('#fVal'); return;
    case 'val-eye': readForm(); ui.draft.showVal = !ui.draft.showVal; rerenderForm('#fVal'); return;
    case 'search-toggle': ui.searchOpen ? clearSearch() : openSearch(); return;
    case 'search-clear': clearSearch(); return;
    case 'res': {
      if (!(await leaveDraft())) return;
      const k = b.dataset.kind, id = b.dataset.id;
      clearSearch(false);
      ui.revealed.clear(); ui.hl = null; ui.sel = null;
      if (k === 'account' || k === 'note') { ui.view = k === 'account' ? 'accounts' : 'notes'; ui.sel = id; }
      else {
        const n = S.nodeById(wdoc, id);
        if (!n) return;
        ui.view = 'work';
        if (n.type === 'folder') ui.path = n.id; else { ui.path = n.parent_id; ui.hl = n.id; }
      }
      renderAll();
      const t = $(`#list [aria-current="true"]`);
      t ? t.scrollIntoView({ block: 'center' }) : ($('#list').scrollTop = 0);
      return;
    }
    case 'lock': return lock();
    case 'sync-label': {
      const st = Sync.getState().status;
      if (st === 'off') return connectDrive();
      if (st === 'needs-auth') return connectDrive();
      if (st === 'error') return syncErrorDialog();
      if (st === 'conflict') return conflictDialog();
      if (st !== 'syncing' && st !== 'offline') Sync.syncNow();
      return;
    }
    case 'settings': return openSettings();
    case 'icon-up': $('#iconFile').click(); return;
    case 'icon-clear': {
      const p = L(pdoc.providers).find(x => x.id === ui.sel);
      if (p) { p.icon = null; p.updated_at = S.nowIso(); save('personal'); renderAll(); }
      return;
    }
    case 'color': {
      const p = L(pdoc.providers).find(x => x.id === ui.sel);
      if (p && p.color !== b.dataset.c) { p.color = b.dataset.c; p.updated_at = S.nowIso(); save('personal'); renderAll(); }
      return;
    }
    case 'sa-del': {
      const s = L(pdoc.social_accounts).find(x => x.id === b.dataset.id);
      if (!s || S.socialUsage(pdoc, s.id)) return;
      if (!(await confirmDialog('계정 삭제', `<b>${esc(s.label)}</b> 계정을 지울까요?`, '삭제', true))) return;
      S.softDelete(s); save('personal'); renderAll();
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
  if (ui.view === 'work') {
    const node = ui.draft?.kind === 'field' ? S.nodeById(wdoc, ui.draft.id) : S.nodeById(wdoc, id);
    if (!node) return;
    let msg = `<b>${esc(node.name)}</b> 항목을 지울까요?`;
    if (node.type === 'folder') { const c = S.countUnder(wdoc, node.id); msg = `<b>${esc(node.name)}</b> 폴더${c.folders || c.fields ? `와 그 안의 폴더 ${c.folders}개·항목 ${c.fields}개` : ''}를 지울까요?`; }
    if (!(await confirmDialog(node.type === 'folder' ? '폴더 삭제' : '항목 삭제', msg, '삭제', true))) return;
    const inside = ui.path && (ui.path === node.id || S.pathOf(wdoc, ui.path).some(n => n.id === node.id));
    S.deleteNode(wdoc, node);
    if (inside) ui.path = node.parent_id;
    ui.draft = null; ui.sel = null; ui.hl = null; ui.revealed.clear();
    save('work'); renderAll(); toast('삭제했습니다');
    return;
  }
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
  save('personal'); renderAll(); toast('삭제했습니다');
}
document.addEventListener('keydown', async e => {
  if (!unlocked || dlg().open) return;
  const typing = e.target.matches('input, textarea, select');
  if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); openSearch(); return; }
  if (e.key !== 'Escape') return;
  if (searching() || ui.searchOpen) { clearSearch(); return; }
  if (ui.draft) { if (await leaveDraft()) renderPanel(); return; }
  if (ui.sel) closePanel();
});
matchMedia('(min-width:700px)').addEventListener('change', () => { if (unlocked) renderPanel(); });
bindProviderPanel();

// ---------- Drive 연결 / 다른 금고 ----------
async function connectDrive() {
  if (await Sync.signIn()) { toast('Google Drive에 연결했습니다'); Sync.syncNow(); }
  else toast('Google 로그인을 하지 못했습니다. 팝업 차단을 확인하세요');
}
function syncErrorDialog() {
  const st = Sync.getState();
  openDialog('동기화 오류', `<p>${esc(st.detail || '알 수 없는 오류')}</p><p>이 기기의 데이터는 그대로 저장되어 있습니다.</p>`,
    `<button class="btn" data-dlg="close">닫기</button><button class="btn primary" id="retry">다시 시도</button>`);
  $('#retry').addEventListener('click', () => { closeDialog(); Sync.syncNow(); });
}
let conflictMeta = null;
function conflictDialog() {
  if (!unlocked) return;
  openDialog('Drive에 다른 금고가 있습니다', `<p>Drive의 금고는 다른 기기에서 따로 만든 금고입니다. 이 기기의 금고와 열쇠가 달라 합칠 수 없어서 동기화를 멈췄습니다.</p>
    <div class="menu">
      <button class="mi" data-c="use-remote">${ic('link')}<span><b>Drive 금고로 바꾸기</b><br><small class="hint">이 기기의 데이터를 지우고 Drive 금고를 받습니다. 다른 기기의 PIN으로 엽니다.</small></span></button>
      <button class="mi danger" data-c="use-local">${ic('warn')}<span><b>이 기기 금고로 Drive 덮어쓰기</b><br><small class="hint">다른 기기는 Drive 금고로 다시 등록해야 합니다. 기존 Drive 파일은 im-replaced-… 이름으로 남깁니다.</small></span></button>
    </div>`, `<button class="btn" data-dlg="close">나중에</button>`);
}
dlg().addEventListener('click', async e => {
  const b = e.target.closest('[data-c]');
  if (!b) return;
  closeDialog();
  if (b.dataset.c === 'use-remote') {
    if (!(await confirmDialog('Drive 금고로 바꾸기', '이 기기의 계정·메모·업무 데이터가 지워지고 Drive 금고로 바뀝니다. 되돌릴 수 없습니다.', '바꾸기', true))) return;
    let v;
    try { v = await Sync.fetchVault(); } catch (err) { toast('Drive 금고를 받지 못했습니다'); return; }
    if (!v) { toast('Drive 금고가 없어졌습니다. 다시 동기화합니다'); Sync.clearConflict(); Sync.syncNow(); return; }
    unlocked = false; clearTimeout(saveTimer); dirty.clear();
    await saving;
    clearInterval(idleTimer); dek = null; pdoc = null; wdoc = null;
    ui.sel = null; ui.draft = null; ui.revealed.clear(); ui.path = null; clearSearch(false);
    for (const id of ['#side', '#chips', '#bar', '#list', '#panel']) $(id).innerHTML = '';
    document.body.classList.remove('sheet-open'); document.body.classList.add('no-sel');
    await storeVault(v);
    for (const k of ['im-fid-meta', 'im-fid-personal', 'im-fid-work']) { try { localStorage.removeItem(k); } catch { /* 무시 */ } }
    Sync.clearConflict();
    bc?.postMessage({ type: 'unlocked', tab: TAB_ID });
    lockScreen('Drive 금고로 바꿨습니다. 그 금고의 PIN을 입력하세요');
  } else if (b.dataset.c === 'use-local') {
    if (!(await confirmDialog('Drive 덮어쓰기', 'Drive의 금고를 이 기기의 금고로 바꿉니다. Drive 금고를 쓰던 다른 기기는 나중에 Drive 금고로 다시 등록해야 합니다.', '덮어쓰기', true))) return;
    await flush(true); await saving;
    try {
      await Sync.overwriteRemote({ meta, personal: await S.get('personal'), work: await S.get('work') });
      toast('Drive를 이 기기 금고로 덮어썼습니다');
      Sync.syncNow();
    } catch (err) { toast('덮어쓰지 못했습니다: ' + err.message); }
  }
});

Sync.init({
  get: () => ({ unlocked, meta, dek, personal: pdoc, work: wdoc }),
  applyMeta: async m => { meta = m; await S.put('meta', m); bc?.postMessage({ type: 'meta', tab: TAB_ID }); },
  applyDoc: async (kind, doc) => {
    if (!unlocked) return;
    if (kind === 'personal') { for (const k of ['accounts', 'notes', 'providers', 'social_accounts']) doc[k] ||= []; pdoc = doc; }
    else { doc.nodes ||= []; wdoc = doc; }
    dirty.add(kind);
    await flush(true);
    if (ui.draft) { readForm(); renderNav(); renderBar(); renderList(); }
    else if (!dlg().open) renderAll();
    else { renderNav(); renderList(); }
  },
  onConflict: m => { conflictMeta = m; conflictDialog(); },
  onStatus: () => renderSaveLabel(),
});

// ---------- 시작 ----------
async function boot() {
  if (top !== self) { document.body.textContent = ''; return; } // 다른 페이지 안에 끼워 넣어 쓰지 못하게
  meta = await S.get('meta');
  if (meta) lockScreen();
  else setupIntro();
}
boot();
