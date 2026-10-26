// Expense Manager: PIN 잠금, 빠른 입력, 지불방식·카테고리 관리(M1) / 내역 표, 템플릿, 테마(M2) / Google Drive 동기화, PIN 재설정(M3) / 통계, 카드 실적, 고정 지출, 티커(M4)
import * as S from './store.js';
import * as Sync from './sync.js';

export const VERSION = 'M4';
const MAX_FAILS = 5;
const FAIL_WAIT_MS = 30 * 1000;

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => `${S.fmtWon(n)}원`;

// ---------- 아이콘 ----------
const P = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  del: '<path d="M9 6h11v12H9l-6-6z"/><path d="M12 10l4 4M16 10l-4 4"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  left: '<path d="M14 6l-6 6 6 6"/>',
  right: '<path d="M10 6l6 6-6 6"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
  box: '<path d="M4 7h16v3H4zM6 10v9h12v-9M10 14h4"/>',
  unbox: '<path d="M4 7h16v3H4zM6 10v9h12v-9M12 18v-5M9.5 15.5L12 13l2.5 2.5"/>',
  gear: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  wallet: '<path d="M4 7a2 2 0 012-2h11v4"/><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M15 13h2"/>',
  edit: '<path d="M12 20h8M4 20l1-4L15.5 5.5a2.1 2.1 0 013 3L8 19z"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  list: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-5M12 16V7M17 16v-8"/>',
  repeat: '<path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 01-3 3H4"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 004 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>`;
const LOGO_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#C2410C"/><path d="M18 12h28v38l-4.7-3.4-4.6 3.4-4.7-3.4-4.7 3.4-4.6-3.4L18 50z" fill="#FDEBDD"/><path d="M23.5 21l4.2 17 4.3-12.5 4.3 12.5 4.2-17" fill="none" stroke="#C2410C" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 27.5h20M22 31.5h20" stroke="#C2410C" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const LOGO = LOGO_SVG.replace('<svg ', '<svg class="glogo" ');

// ---------- 상태 ----------
let doc = null;
let unlocked = false;
const VIEWS = { input: { label: '입력', icon: 'edit' }, history: { label: '내역', icon: 'list' }, stats: { label: '통계', icon: 'chart' }, fixed: { label: '고정', icon: 'repeat' }, manage: { label: '관리', icon: 'gear' } };
// formIn: 입력 폼이 어디 있는지 ('page' 입력 화면 / 'dialog' 내역에서 연 수정 창). stash: 수정 창을 여는 동안 보관한 입력 화면 상태
const ui = { view: 'input', draft: null, touched: new Set(), auto: new Set(), editId: null, ac: [], acIdx: -1, acOpen: false, err: null, formIn: 'page', stash: null, delArmed: false,
  h: { ym: null, themeId: '', method: '', cat: '', text: '', sort: 'desc' },
  st: { dim: 'method', period: 'r6', open: new Set(), series: null, perfYm: null }, fx: { ym: null } };
const wideMq = matchMedia('(min-width:700px)');

// ---------- 저장 ----------
// 바뀔 때마다 바로 저장한다 (문서가 작아서 부담이 적고, 탭을 바로 닫아도 잃지 않게). 저장은 순서대로 한 번에 하나씩
let saving = Promise.resolve();
function persist() {
  saving = saving.then(() => S.save(doc)).then(() => { renderSaveLabel(); Sync.schedule(); });
  return saving;
}
// 상단 상태 버튼: 저장·동기화 상태
const SYNC_TEXT = { off: '사용 안 함', 'needs-auth': 'Google 로그인 필요', syncing: '동기화 중…', ok: '정상', offline: '오프라인', error: '오류' };
function renderSaveLabel() {
  const el = $('#syncLabel');
  if (!el) return;
  const st = Sync.getState();
  let [text, cls] = {
    off: ['이 기기에 저장됨', ''],
    'needs-auth': ['Google 로그인 필요', 'warn'],
    syncing: ['동기화 중…', ''],
    ok: [`동기화됨 ${st.lastSync ? st.lastSync.slice(-5) : ''}`, 'ok'],
    offline: ['오프라인 · 이 기기에 저장됨', ''],
    error: ['동기화 오류', 'warn'],
  }[st.status] || ['', ''];
  if (!S.storageOk) [text, cls] = ['저장 실패 (브라우저 저장소 확인)', 'warn'];
  el.textContent = text;
  el.className = 'sync ' + cls;
  el.title = st.detail || (st.status === 'off' ? '관리 > 설정에서 Google Drive 동기화를 켤 수 있습니다' : '누르면 지금 동기화');
  if (unlocked && ui.view === 'manage') { const s2 = $('#syncState'); if (s2) s2.innerHTML = syncStateHtml(); }
}
const syncStateHtml = () => { const st = Sync.getState(); return `${SYNC_TEXT[st.status]}${st.lastSync ? ` · 마지막 ${esc(st.lastSync)}` : ''}${st.detail && st.status !== 'ok' ? `<br><span class="note">${esc(st.detail)}</span>` : ''}`; };
// 다른 기기에서 바뀐 내용이 합쳐졌을 때: 저장하고, 보고 있는 화면을 다시 그린다 (입력 중인 칸과 커서는 유지)
async function applyMerged(m) {
  doc = S.normalizeDoc(m);
  await S.save(doc);
  if (!unlocked) return;
  const a = document.activeElement, id = a?.id, sel = id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  if (ui.view === 'input' && ui.formIn === 'page') readForm();
  renderNav(); renderView(); renderTicker();
  if (ui.formIn === 'dialog') { const host = $('#dlgForm'); if (host) { readForm(); renderForm(); } }
  if (id) { const el = document.getElementById(id); if (el && el !== document.activeElement) { el.focus(); if (sel) try { el.setSelectionRange(...sel); } catch { /* 무시 */ } } }
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
dlg().addEventListener('click', e => { if (e.target === dlg() || e.target.closest('[data-dlg="close"]')) closeDialog(); });
dlg().addEventListener('close', () => { if (!dlg().open) dlg().innerHTML = ''; });
function confirmDialog(title, msg, okLabel = '확인', danger = false) {
  return new Promise(resolve => {
    const d = openDialog(title, `<p>${msg}</p>`, `<button class="btn" data-r="0">취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okLabel)}</button>`);
    let fin = false;
    const done = v => { if (fin) return; fin = true; d.removeEventListener('click', on); d.removeEventListener('close', onClose); closeDialog(); resolve(v); };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); };
    const onClose = () => { if (!d.open) done(false); };
    d.addEventListener('click', on);
    d.addEventListener('close', onClose);
  });
}
// validate(값)이 오류 문구를 돌려주면 창을 닫지 않고 보여 준다
function promptDialog(title, label, { value = '', okLabel = '추가', validate = null, placeholder = '' } = {}) {
  return new Promise(resolve => {
    const d = openDialog(title, `<form id="pf" autocomplete="off"><label class="fl" for="pIn">${esc(label)}</label><input class="in" id="pIn" maxlength="30" value="${esc(value)}" placeholder="${esc(placeholder)}"><p class="note" id="pErr" hidden style="margin-top:6px"></p></form>`,
      `<button class="btn" data-r="0">취소</button><button class="btn primary" data-r="1">${esc(okLabel)}</button>`);
    let fin = false;
    const done = v => { if (fin) return; fin = true; d.removeEventListener('click', on); closeDialog(); resolve(v); };
    const submit = () => {
      const v = $('#pIn').value.trim();
      if (!v) { $('#pIn').focus(); return; }
      const err = validate ? validate(v) : null;
      if (err) { const e = $('#pErr'); e.textContent = err; e.hidden = false; $('#pIn').classList.add('err'); $('#pIn').focus(); return; }
      done(v);
    };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) (b.dataset.r === '1' ? submit() : done(null)); };
    d.addEventListener('click', on);
    $('#pf').addEventListener('submit', e => { e.preventDefault(); submit(); });
    const onClose = () => { if (!d.open) { d.removeEventListener('close', onClose); done(null); } };
    d.addEventListener('close', onClose);
    $('#pIn').focus();
  });
}

// =====================================================================
// 잠금 화면
// =====================================================================
const gate = $('#gate');
let pad = null;
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
function startPad(onDone) { pad = { buf: '', onDone, busy: false }; drawDots(); applyWait(); }
function drawDots() {
  const d = $('#dots');
  if (!d || !pad) return;
  [...d.children].forEach((el, i) => el.classList.toggle('on', i < pad.buf.length));
  d.setAttribute('aria-label', `입력한 자릿수 ${pad.buf.length}`);
}
function padMsg(text, info = false) { const m = $('#gmsg'); if (m) { m.textContent = text; m.classList.toggle('info', info); } }
function padKey(k) {
  if (!pad || pad.busy || Date.now() < waitUntil) return;
  if (k === 'bs') pad.buf = pad.buf.slice(0, -1);
  else if (/^\d$/.test(k) && pad.buf.length < 4) pad.buf += k;
  drawDots();
  if (pad.buf.length === 4) { const pin = pad.buf; pad.busy = true; setTimeout(() => pad?.onDone(pin), 60); }
}
function padReset(msg = '', shake = true) {
  if (!pad) return;
  pad.buf = ''; pad.busy = false;
  drawDots(); padMsg(msg);
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
  const g = e.target.closest('[data-g]');
  if (g && !g.disabled) gateAction(g.dataset.g);
});
document.addEventListener('keydown', e => {
  if (gate.hidden || !pad || dlg().open) return;
  if (/^\d$/.test(e.key)) { padKey(e.key); e.preventDefault(); }
  else if (e.key === 'Backspace') { padKey('bs'); e.preventDefault(); }
});

// 처음 화면: 새로 시작하거나, 다른 기기에서 쓰던 Drive 데이터를 불러온다
function setupIntro(msg = '', isErr = true) {
  pad = null;
  showGate(`${LOGO}<h1>Expense Manager</h1><p>지출을 빠르게 기록하고 PC·모바일에서 함께 봅니다</p>
    <button class="btn primary wide" data-g="setup-new">처음 시작하기</button>
    <button class="btn wide" data-g="setup-import">Drive에 있는 데이터 불러오기</button>
    <p class="gmsg ${isErr ? '' : 'info'}" id="gmsg">${esc(msg)}</p>
    <p class="hint">다른 기기에서 이미 Drive 동기화를 켜고 쓰고 있다면 “불러오기”를 누르세요. 그 기기의 PIN으로 열립니다.</p>`);
}
async function gateBusy(btn, fn) {
  const b = gate.querySelector(`[data-g="${btn}"]`);
  gate.querySelectorAll('[data-g]').forEach(x => { x.disabled = true; });
  if (b) b.textContent = 'Google 확인 중…';
  try { return await fn(); }
  finally { gate.querySelectorAll('[data-g]').forEach(x => { x.disabled = false; }); }
}
const gErr = e => (e?.auth ? 'Google 로그인을 마치지 못했습니다. 다시 시도하세요' : e?.offline ? '인터넷 연결을 확인하세요' : e?.message || '알 수 없는 오류');
async function gateAction(act) {
  if (act === 'setup-new') { setupPin1(); return; }
  if (act === 'setup-import') {
    let r;
    try { r = await gateBusy(act, () => Sync.fetchRemote()); } catch (e) { setupIntro(gErr(e)); return; }
    if (!r.doc || !S.setting(r.doc, 'pin')) { setupIntro('Drive에 Expense Manager 데이터가 없습니다. “처음 시작하기”를 누르세요'); return; }
    doc = S.normalizeDoc(Sync.mergeDocs(doc, r.doc));
    await S.save(doc);
    Sync.markSignedIn();
    Sync.schedule(500);
    lockScreen(`Drive 데이터를 불러왔습니다 (지출 ${S.live(doc.expenses).length}건). 다른 기기에서 쓰던 PIN을 입력하세요`);
    return;
  }
  if (act === 'forgot') { forgotScreen(); return; }
  if (act === 'forgot-back') { lockScreen(); return; }
  if (act === 'forgot-google') {
    let r;
    try { r = await gateBusy(act, () => Sync.fetchRemote()); } catch (e) { forgotScreen(gErr(e)); return; }
    if (!r.doc) { forgotScreen('Drive에 이 앱의 데이터가 없어 Google로 확인할 수 없습니다. Drive 동기화를 켠 Google 계정으로 로그인했는지 확인하세요'); return; }
    doc = S.normalizeDoc(Sync.mergeDocs(doc, r.doc));
    await S.save(doc);
    Sync.markSignedIn();
    resetPin1();
  }
}
function forgotScreen(msg = '') {
  pad = null;
  showGate(`${LOGO}<h2>PIN 재설정</h2>
    <p>Drive 동기화에 쓰는 Google 계정으로 로그인하면 본인으로 확인하고 새 PIN을 정할 수 있습니다. 데이터는 그대로 남습니다.</p>
    <button class="btn primary wide" data-g="forgot-google">Google로 확인</button>
    <button class="link" data-g="forgot-back">PIN 입력으로 돌아가기</button>
    <p class="gmsg" id="gmsg">${esc(msg)}</p>`);
}
function resetPin1(msg = '') {
  showGate(padHtml({ title: '새 PIN 정하기', sub: 'Google 확인을 마쳤습니다. 새 PIN 4자리를 입력하세요', msg }));
  startPad(pin => {
    showGate(padHtml({ title: '새 PIN 확인', sub: '같은 4자리를 한 번 더 입력하세요' }));
    startPad(async pin2 => {
      if (pin !== pin2) { resetPin1('두 번 입력한 PIN이 달라요. 다시 정하세요'); return; }
      S.putSetting(doc, 'pin', await S.makePin(pin));
      fails = 0; waitUntil = 0;
      await persist();
      enterApp('새 PIN을 정했습니다. 다른 기기도 동기화되면 새 PIN으로 열립니다');
    });
  });
}
function setupPin1(msg = '') {
  showGate(padHtml({ title: '처음 설정: PIN 정하기', sub: '앱을 열 때 입력할 숫자 4자리를 정하세요', msg }));
  startPad(pin => setupPin2(pin));
}
function setupPin2(first) {
  showGate(padHtml({ title: 'PIN 확인', sub: '같은 4자리를 한 번 더 입력하세요' }));
  startPad(async pin => {
    if (pin !== first) { setupPin1('두 번 입력한 PIN이 달라요. 처음부터 다시 정하세요'); return; }
    S.putSetting(doc, 'pin', await S.makePin(pin));
    await persist();
    ui.view = 'manage';
    enterApp('PIN을 정했습니다. 지불방식과 카테고리부터 등록하세요');
  });
}
function lockScreen(msg = '', info = true) {
  showGate(padHtml({ title: 'Expense Manager', sub: 'PIN을 입력하세요', msg, msgInfo: info, leftFn: '<button class="fn" data-g="forgot">PIN을<br>잊었어요</button>' }));
  startPad(async pin => {
    if (await S.checkPin(S.setting(doc, 'pin'), pin)) { fails = 0; enterApp(); return; }
    fails++;
    if (fails >= MAX_FAILS) { fails = 0; waitUntil = Date.now() + FAIL_WAIT_MS; padReset(''); applyWait(); return; }
    padReset(`PIN이 맞지 않습니다 (${fails}/${MAX_FAILS})`);
  });
}
function enterApp(msg) {
  pad = null;
  unlocked = true;
  gate.hidden = true; gate.innerHTML = '';
  $('#app').hidden = false;
  if (!ui.draft) newDraft();
  renderAll();
  if (msg) toast(msg);
  if (ui.view === 'input' && matchMedia('(min-width:700px)').matches) $('#fAmt')?.focus();
  Sync.schedule(300);
}
async function lock() {
  await saving;
  unlocked = false;
  closeDialog();
  lockScreen('잠갔습니다');
}

// =====================================================================
// 화면 틀
// =====================================================================
function renderAll() { renderNav(); renderView(); renderSaveLabel(); renderTicker(); }
function renderNav() {
  const items = Object.entries(VIEWS);
  $('#side').innerHTML = `<div class="brand">${LOGO_SVG}<span>Expense Manager</span></div>` +
    items.map(([k, v]) => `<button class="nav" data-act="view" data-v="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${ic(v.icon)}<span>${v.label}</span></button>`).join('');
  $('#tabs').innerHTML = items.map(([k, v]) => `<button class="tab" data-act="view" data-v="${k}" ${ui.view === k ? 'aria-current="page"' : ''}>${ic(v.icon)}<span>${v.label}</span></button>`).join('');
  $('#title').textContent = ui.view === 'input' && ui.editId && ui.formIn === 'page' ? '지출 수정' : VIEWS[ui.view].label;
}
function renderView() {
  const v = $('#view');
  const top = v.scrollTop;
  v.innerHTML = { input: inputHtml, history: historyHtml, stats: statsHtml, fixed: fixedHtml, manage: manageHtml }[ui.view]();
  v.scrollTop = top;
  if (ui.view === 'input' && ui.formIn === 'page') bindInput();
  if (ui.view === 'stats') drawChart();
}
// 입력 폼만 다시 그린다 (입력 화면 또는 수정 창)
function renderForm() {
  if (ui.formIn === 'dialog') {
    const host = $('#dlgForm');
    if (!host) return;
    host.innerHTML = formHtml();
    bindInput();
    return;
  }
  renderNav();
  renderView();
}

// =====================================================================
// 빠른 입력
// =====================================================================
const methodById = id => S.live(doc.methods).find(m => m.id === id) || null;
const catById = id => S.live(doc.categories).find(c => c.id === id) || null;
const themeById = id => S.live(doc.themes).find(t => t.id === id) || null;
const tplById = id => S.live(doc.templates).find(t => t.id === id) || null;
const usable = x => x && !x.archived;
// 10.17~10.21 (올해가 아니면 연도 앞 두 자리 붙임)
const md = s => s.slice(5).replace('-', '.');
function periodTxt(t) {
  const y = S.todayKst().slice(0, 4);
  const f = s => (s.slice(0, 4) === y ? md(s) : `${s.slice(2, 4)}.${md(s)}`);
  return t.start === t.end ? f(t.start) : `${f(t.start)}~${f(t.end)}`;
}
// 날짜에 맞는 테마를 자동으로 고른다 (사용자가 직접 고르거나 해제했으면 그대로 둔다)
function autoTheme(d = ui.draft) {
  if (ui.touched.has('theme')) return;
  d.theme_id = S.themeForDate(doc, d.date)?.id || null;
}
function newDraft(keep = null) {
  const keepTheme = keep && ui.touched.has('theme');
  ui.draft = { date: keep?.date || S.todayKst(), amountText: '', payee: '', method_id: keep?.method_id || null, cat1_id: null, cat2_id: null, memo: '', perf_excluded: false, theme_id: keepTheme ? keep.theme_id : null, fixed_id: null, makeFixed: false };
  ui.touched = new Set(keepTheme ? ['theme'] : []);
  ui.auto = new Set();
  ui.editId = null;
  ui.err = null;
  ui.acOpen = false;
  ui.delArmed = false;
  autoTheme();
}
const draftDirty = () => !!(ui.draft && (ui.draft.amountText || ui.draft.payee.trim() || ui.draft.memo.trim()));
const hasTarget = id => (methodById(id)?.perf_target || 0) > 0;
const catLabel = e => { const a = catById(e.cat1_id), b = catById(e.cat2_id); return [a?.name, b?.name].filter(Boolean).join('›'); };

function chipsMethod(d) {
  const list = S.methodsOf(doc);
  const cur = d.method_id && !list.some(m => m.id === d.method_id) ? [methodById(d.method_id)].filter(Boolean) : []; // 보관된 값으로 수정 중
  return `<div class="chips${ui.err?.field === 'method' ? ' err' : ''}" role="group" aria-labelledby="lblM">${[...list, ...cur].map(m => `<button type="button" class="chip${ui.auto.has('method') ? ' auto' : ''}" data-act="pick-method" data-id="${m.id}" aria-pressed="${d.method_id === m.id}">${esc(m.name)}</button>`).join('')}${ui.formIn === 'page' ? `<button type="button" class="chip add" data-act="add-method" aria-label="지불방식 추가">${ic('plus')}${list.length ? '' : '지불방식 추가'}</button>` : ''}</div>`;
}
function chipsCat(d) {
  const list = S.cat1sOf(doc);
  const c1 = catById(d.cat1_id);
  const l1 = c1 && !list.includes(c1) ? [...list, c1] : list;
  let html = `<div class="chips${ui.err?.field === 'cat1' ? ' err' : ''}" role="group" aria-labelledby="lblC">${l1.map(c => `<button type="button" class="chip${ui.auto.has('cat') ? ' auto' : ''}" data-act="pick-cat1" data-id="${c.id}" aria-pressed="${d.cat1_id === c.id}">${esc(c.name)}</button>`).join('')}${ui.formIn === 'page' ? `<button type="button" class="chip add" data-act="add-cat1" aria-label="카테고리 추가">${ic('plus')}${list.length ? '' : '카테고리 추가'}</button>` : ''}</div>`;
  if (c1) {
    const subs = S.cat2sOf(doc, c1.id);
    const c2 = catById(d.cat2_id);
    const l2 = c2 && !subs.includes(c2) ? [...subs, c2] : subs;
    html += `<div class="chips sub${ui.err?.field === 'cat2' ? ' err' : ''}" role="group" aria-label="${esc(c1.name)} 하위 카테고리">${l2.map(c => `<button type="button" class="chip${ui.auto.has('cat') ? ' auto' : ''}" data-act="pick-cat2" data-id="${c.id}" aria-pressed="${d.cat2_id === c.id}">${esc(c.name)}</button>`).join('')}${l2.length ? '' : '<span class="empty-m">하위 카테고리 없음</span>'}${ui.formIn === 'page' ? `<button type="button" class="chip add" data-act="add-cat2" aria-label="${esc(c1.name)} 하위 카테고리 추가">${ic('plus')}</button>` : ''}</div>`;
  }
  return html;
}
function lastHint(d) {
  if (ui.editId) return '';
  const e = S.lastForPayee(doc, d.payee);
  if (!e) return '';
  const m = methodById(e.method_id);
  const amt = S.parseWon(d.amountText);
  return `<div class="lastrow"><span>최근 ${esc(S.fmtDateShort(e.date))} · ${esc([m?.name, catLabel(e)].filter(Boolean).join(' · '))}</span>${amt !== e.amount ? `<button type="button" class="mini" data-act="use-amount" data-v="${e.amount}">${esc(won(e.amount))} 넣기</button>` : ''}</div>`;
}
// 테마: 기간 안이면 자동 선택. 기간 밖이어도 가까운 테마는 칩으로 보여 주고(기본 해제), 그 밖의 테마는 "다른 테마"에서 고른다
function chipsTheme(d) {
  const all = S.themesOf(doc);
  if (!all.length) return '';
  const near = S.themesNear(doc, d.date);
  const cur = themeById(d.theme_id);
  const chips = cur && !near.includes(cur) ? [...near, cur] : near;
  const rest = all.filter(t => !chips.includes(t));
  const inRange = cur && S.themeDistance(cur, d.date) === 0;
  return `<div><span class="fl" id="lblT">테마</span><div class="chips" role="group" aria-labelledby="lblT">${chips.map(t => `<button type="button" class="chip theme${S.themeDistance(t, d.date) ? ' out' : ''}" data-act="pick-theme" data-id="${t.id}" aria-pressed="${d.theme_id === t.id}">${ic('tag')}<span>${esc(t.name)}</span><small>${esc(periodTxt(t))}</small></button>`).join('')}
    ${rest.length ? `<select class="in sm thsel" id="fThemeMore" aria-label="다른 테마 고르기"><option value="">${chips.length ? '다른 테마…' : '테마 고르기…'}</option>${rest.map(t => `<option value="${t.id}">${esc(t.name)} (${esc(periodTxt(t))})</option>`).join('')}</select>` : ''}</div>
    ${!ui.touched.has('theme') && d.theme_id && inRange ? '<p class="hint">날짜가 테마 기간 안이라 자동으로 골랐습니다. 다시 누르면 해제됩니다.</p>' : ''}</div>`;
}
function tplRow() {
  const list = S.templatesOf(doc);
  if (!list.length) return '';
  return `<div class="tplrow" role="group" aria-label="템플릿">${list.map(t => `<button type="button" class="tpl" data-act="use-tpl" data-id="${t.id}" title="${esc(tplSummary(t))}">${ic('copy')}<span>${esc(t.name)}</span>${t.amount ? `<small>${esc(S.fmtWon(t.amount))}</small>` : ''}</button>`).join('')}</div>`;
}
function tplSummary(t) {
  const m = methodById(t.method_id), c = [catById(t.cat1_id)?.name, catById(t.cat2_id)?.name].filter(Boolean).join('›');
  return [t.amount ? won(t.amount) : '', t.payee, m?.name, c, t.memo].filter(Boolean).join(' · ') || '내용 없음';
}
function formHtml() {
  const d = ui.draft;
  const today = S.todayKst();
  const editing = ui.editId ? S.live(doc.expenses).find(e => e.id === ui.editId) : null;
  const inDlg = ui.formIn === 'dialog';
  const showPerf = hasTarget(d.method_id);
  const actions = editing
    ? `<button type="button" class="btn danger${ui.delArmed ? ' armed' : ''}" data-act="del-exp" aria-label="${ui.delArmed ? '한 번 더 누르면 삭제' : '삭제'}">${ic('trash')}${ui.delArmed ? '한 번 더' : '삭제'}</button><button type="button" class="btn" data-act="cancel-edit">취소</button><button type="submit" class="btn primary">수정 저장</button>`
    : `<button type="button" class="btn" data-act="save-more" title="저장하고 날짜·지불방식은 그대로 둔 채 계속 입력">계속 입력</button><button type="submit" class="btn primary">저장</button>`;
  return `<form class="${inDlg ? 'qform indlg' : `card qform${editing ? ' editing' : ''}`}" id="qform" autocomplete="off" novalidate>
    ${editing && !inDlg ? `<div class="editbar">${ic('pen')}<span>입력 내역 수정 중</span><span class="sp"></span><span class="num">${esc(S.fmtDate(editing.date))}</span></div>` : ''}
    ${editing ? '' : tplRow()}
    <div><span class="fl">날짜</span>
      <div class="daterow"><button type="button" class="icbtn" data-act="day" data-v="-1" aria-label="하루 전">${ic('left')}</button>
        <label class="datebox${d.date !== today ? ' past' : ''}">${ic('cal')}<span class="num" id="dateTxt">${esc(S.fmtDate(d.date))}</span><input type="date" id="fDate" value="${d.date}" aria-label="날짜 선택" required></label>
        <button type="button" class="icbtn" data-act="day" data-v="1" aria-label="하루 뒤">${ic('right')}</button>
        ${d.date !== today ? '<button type="button" class="btn sm" data-act="today">오늘</button>' : ''}</div></div>
    <div><label class="fl" for="fAmt">금액 <span class="req">*</span></label>
      <div class="amtbox"><input class="in amt${ui.err?.field === 'amount' ? ' err' : ''}" id="fAmt" type="text" inputmode="numeric" pattern="[0-9,]*" enterkeyhint="next" placeholder="0" value="${esc(d.amountText)}" maxlength="16"><span class="won">원</span></div></div>
    <div class="acwrap"><label class="fl" for="fPayee">지불처 <span class="req">*</span></label>
      <input class="in${ui.err?.field === 'payee' ? ' err' : ''}" id="fPayee" value="${esc(d.payee)}" maxlength="60" placeholder="예: 메가커피" enterkeyhint="next" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acList" autocapitalize="off" spellcheck="false">
      <ul class="ac" id="acList" role="listbox" hidden></ul>
      <div id="lastHint">${lastHint(d)}</div></div>
    <div><span class="fl" id="lblM">지불방식 <span class="req">*</span></span>${chipsMethod(d)}</div>
    <div><span class="fl" id="lblC">카테고리 <span class="req">*</span></span>${chipsCat(d)}</div>
    ${chipsTheme(d)}
    <div><label class="fl" for="fMemo">메모</label><input class="in" id="fMemo" value="${esc(d.memo)}" maxlength="200" placeholder="선택" enterkeyhint="done"></div>
    ${showPerf ? `<label class="ck"><input type="checkbox" id="fPerf" ${d.perf_excluded ? 'checked' : ''}> 카드 실적에서 제외</label>` : ''}
    ${fixedLine(d, editing)}
    ${ui.err ? `<p class="note" id="formErr">${esc(ui.err.msg)}</p>` : ''}
    <div class="factions">${actions}</div>
    ${!editing ? `<div class="fsub"><button type="button" class="link" data-act="save-tpl">${ic('copy')}지금 내용으로 템플릿 만들기</button>${wideMq.matches ? '<span class="ftip">Ctrl+Enter 저장 · 지불처 추천은 ↑↓, Enter</span>' : ''}</div>` : ''}
  </form>`;
}
// 고정 지출 표시: 고정 지출에서 연 입력이면 연결 표시(해제 가능), 새 입력이면 "매달 고정 지출로 등록" 체크
function fixedLine(d, editing) {
  const f = d.fixed_id ? S.live(doc.fixed).find(x => x.id === d.fixed_id) : null;
  if (f) return `<div class="fxlink">${ic('repeat')}<span>고정 지출 <b>${esc(f.name)}</b> (매달 ${f.day}일)${editing ? '' : ' 입력'}</span><button type="button" class="icbtn sm" data-act="fx-unlink" aria-label="고정 지출 연결 해제" title="연결 해제">${ic('x')}</button></div>`;
  if (editing) return '';
  return `<label class="ck"><input type="checkbox" id="fFixed" ${d.makeFixed ? 'checked' : ''}> 매달 고정 지출로 등록 (결제일은 이 날짜의 일, 템플릿도 함께 만듦)</label>`;
}
function inputHtml() {
  if (ui.editId && !S.live(doc.expenses).some(e => e.id === ui.editId)) newDraft();
  return `<div class="inwrap">${ui.formIn === 'page' ? formHtml() : ''}${recentHtml()}</div>`;
}
function recentHtml() {
  const today = S.todayKst(), ym = today.slice(0, 7);
  const ex = S.live(doc.expenses);
  const mon = ex.filter(e => e.date.startsWith(ym)), td = ex.filter(e => e.date === today);
  const sum = a => a.reduce((s, e) => s + e.amount, 0);
  const rows = S.recentExpenses(doc, 30).map(e => {
    const m = methodById(e.method_id);
    return `<button class="rrow${ui.editId === e.id && ui.formIn === 'page' ? ' sel' : ''}" data-act="edit-exp" data-id="${e.id}"><span class="d">${esc(S.fmtDateShort(e.date))}</span><span class="p">${esc(e.payee)}</span><span class="a">${esc(S.fmtWon(e.amount))}</span>
      <span class="m">${esc([m?.name, catLabel(e), e.memo].filter(Boolean).join(' · '))}${e.theme_id && themeById(e.theme_id) ? `<span class="x">${esc(themeById(e.theme_id).name)}</span>` : ''}${e.perf_excluded ? '<span class="x">실적 제외</span>' : ''}</span></button>`;
  }).join('');
  return `<section class="card recent" aria-label="최근 입력"><h2>최근 입력<span class="sub">입력한 순서 · 누르면 수정</span></h2>
    <div class="sum"><div><b>${esc(won(sum(td)))}</b><span>오늘 ${td.length}건</span></div><div><b>${esc(won(sum(mon)))}</b><span>${Number(ym.slice(5))}월 ${mon.length}건</span></div></div>
    <div class="rlist">${rows || '<div class="rempty">아직 입력한 지출이 없습니다</div>'}</div></section>`;
}
// 입력 칸 값을 draft에 반영
function readForm() {
  const d = ui.draft;
  if (!d || !$('#qform')) return;
  d.amountText = $('#fAmt').value;
  d.payee = $('#fPayee').value;
  d.memo = $('#fMemo').value;
  if ($('#fPerf')) d.perf_excluded = $('#fPerf').checked;
  if ($('#fFixed')) d.makeFixed = $('#fFixed').checked;
}
// 호출하는 쪽에서 readForm()으로 입력값을 먼저 반영한 뒤 부른다
function rerenderInput(focusSel) {
  renderForm();
  if (focusSel) $(focusSel)?.focus();
}
// 같은 지불처의 가장 최근 지출에서, 이번 입력에서 직접 고르지 않은 지불방식·카테고리를 채운다
function applyLast() {
  if (ui.editId) return false;
  const d = ui.draft;
  const e = S.lastForPayee(doc, d.payee);
  if (!e) return false;
  let changed = false;
  const m = methodById(e.method_id);
  if (!ui.touched.has('method') && m && !m.archived && d.method_id !== m.id) { d.method_id = m.id; ui.auto.add('method'); changed = true; }
  const c1 = catById(e.cat1_id), c2 = catById(e.cat2_id);
  if (!ui.touched.has('cat') && c1 && !c1.archived && (!e.cat2_id || (c2 && !c2.archived)) && (d.cat1_id !== c1.id || d.cat2_id !== (e.cat2_id || null))) {
    d.cat1_id = c1.id; d.cat2_id = e.cat2_id || null; ui.auto.add('cat'); changed = true;
  }
  return changed;
}
function setAc(list) {
  ui.ac = list; ui.acIdx = list.length ? 0 : -1;
  const el = $('#acList'), inp = $('#fPayee');
  if (!el) return;
  ui.acOpen = list.length > 0 && !(list.length === 1 && S.normPayee(list[0].name) === S.normPayee(inp.value));
  el.hidden = !ui.acOpen;
  inp.setAttribute('aria-expanded', String(ui.acOpen));
  if (!ui.acOpen) return;
  const q = inp.value.trim();
  const mark = name => {
    const i = q ? name.toLowerCase().indexOf(q.toLowerCase()) : -1;
    return i < 0 ? esc(name) : `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
  };
  el.innerHTML = list.map((p, i) => {
    const m = methodById(p.last.method_id);
    return `<li role="option" id="ac${i}" data-i="${i}" aria-selected="${i === ui.acIdx}"><span class="nm">${mark(p.name)}</span><span class="mt">${esc([m?.name, catLabel(p.last)].filter(Boolean).join(' · '))} · ${p.count}회</span></li>`;
  }).join('');
}
function moveAc(dir) {
  if (!ui.acOpen) return;
  ui.acIdx = (ui.acIdx + dir + ui.ac.length) % ui.ac.length;
  $('#acList').querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', String(i === ui.acIdx)));
  $(`#ac${ui.acIdx}`)?.scrollIntoView({ block: 'nearest' });
}
function pickPayee(p) {
  readForm();
  ui.draft.payee = p.name;
  ui.acOpen = false;
  applyLast();
  rerenderInput();
  if (!ui.draft.amountText) $('#fAmt')?.focus();
  else if (wideMq.matches) $('#fMemo')?.focus();
}
function bindInput() {
  const amt = $('#fAmt'), payee = $('#fPayee'), date = $('#fDate');
  amt.addEventListener('input', () => {
    const r = S.formatAmountInput(amt.value, amt.selectionStart ?? amt.value.length);
    if (r.text !== amt.value) { amt.value = r.text; try { amt.setSelectionRange(r.caret, r.caret); } catch { /* 무시 */ } }
    ui.draft.amountText = amt.value;
    if (ui.err?.field === 'amount') amt.classList.remove('err');
    const h = $('#lastHint'); if (h) h.innerHTML = lastHint(ui.draft);
  });
  amt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.isComposing) { e.preventDefault(); payee.focus(); } });
  payee.addEventListener('input', () => {
    ui.draft.payee = payee.value;
    setAc(S.suggestPayees(doc, payee.value));
    const h = $('#lastHint'); if (h) h.innerHTML = lastHint(ui.draft);
  });
  payee.addEventListener('keydown', e => {
    if (e.isComposing) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveAc(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveAc(-1); }
    else if (e.key === 'Escape' && ui.acOpen) { e.preventDefault(); setAc([]); }
    else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (ui.acOpen && ui.ac[ui.acIdx]) pickPayee(ui.ac[ui.acIdx]);
      else { readForm(); if (applyLast()) rerenderInput(); $('#fMemo')?.focus(); }
    }
  });
  payee.addEventListener('focus', () => { if (payee.value.trim()) setAc(S.suggestPayees(doc, payee.value)); });
  payee.addEventListener('blur', () => {
    setTimeout(() => {
      if (!document.contains(payee) || document.activeElement === payee) return;
      setAc([]);
      readForm();
      if (applyLast()) rerenderInput();
    }, 150);
  });
  $('#acList').addEventListener('pointerdown', e => {
    const li = e.target.closest('li[data-i]');
    if (li) { e.preventDefault(); pickPayee(ui.ac[+li.dataset.i]); }
  });
  date.addEventListener('click', e => { try { date.showPicker(); e.preventDefault(); } catch { /* 기본 동작 */ } });
  date.addEventListener('change', () => {
    if (!S.isDate(date.value)) return;
    readForm();
    ui.draft.date = date.value;
    autoTheme();
    rerenderInput();
  });
  $('#qform').addEventListener('submit', e => { e.preventDefault(); saveDraft(false); });
  $('#qform').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveDraft(false); } });
  $('#fMemo').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); $('#fMemo').blur(); } });
  $('#fThemeMore')?.addEventListener('change', e => {
    if (!e.target.value) return;
    readForm(); ui.draft.theme_id = e.target.value; ui.touched.add('theme'); rerenderInput();
  });
}
function saveDraft(more) {
  readForm();
  const d = ui.draft;
  const f = { date: d.date, amount: S.parseWon(d.amountText), payee: d.payee, method_id: d.method_id, cat1_id: d.cat1_id, cat2_id: d.cat2_id, memo: d.memo, perf_excluded: hasTarget(d.method_id) ? d.perf_excluded : false, theme_id: themeById(d.theme_id) ? d.theme_id : null };
  const editing = ui.editId ? S.live(doc.expenses).find(e => e.id === ui.editId) : null;
  f.fixed_id = d.fixed_id && S.live(doc.fixed).some(x => x.id === d.fixed_id) ? d.fixed_id : null;
  const r = S.saveExpense(doc, f, ui.editId);
  if (r.error) {
    ui.err = { msg: r.error, field: r.field };
    rerenderInput({ amount: '#fAmt', payee: '#fPayee' }[r.field]);
    if (r.field === 'date') $('#fDate')?.focus();
    return;
  }
  const e = r.item;
  let msg = `${editing ? '수정' : '저장'} · ${e.payee} ${won(e.amount)}`;
  // 입력하면서 "매달 고정 지출로 등록": 고정 지출과 같은 이름의 템플릿을 함께 만든다
  if (!editing && d.makeFixed && !e.fixed_id) {
    const base = { day: Number(e.date.slice(8)), amount: e.amount, payee: e.payee, method_id: e.method_id, cat1_id: e.cat1_id, cat2_id: e.cat2_id, memo: e.memo };
    let name = e.payee.slice(0, 30), i = 2;
    while (S.fixedError(doc, { ...base, name }) === '같은 이름의 고정 지출이 있습니다') name = `${e.payee.slice(0, 26)} ${i++}`;
    const fr = S.saveFixed(doc, { ...base, name });
    if (fr.item) {
      e.fixed_id = fr.item.id; e.updated_at = S.nowIso();
      if (!S.templatesOf(doc).some(t => t.name.toLowerCase() === name.toLowerCase())) S.saveTemplate(doc, { ...base, name });
      msg += ` · 고정 지출(매달 ${base.day}일)·템플릿 등록`;
    }
  }
  persist();
  if (ui.formIn === 'dialog') { endDialogEdit(); toast(msg); return; }
  if (more) newDraft({ date: d.date, method_id: d.method_id, theme_id: d.theme_id });
  else newDraft();
  renderAll();
  toast(msg);
  if (more || wideMq.matches) $('#fAmt')?.focus();
}
async function editExpense(id) {
  const e = S.live(doc.expenses).find(x => x.id === id);
  if (!e) return;
  readForm();
  if (!ui.editId && draftDirty() && !(await confirmDialog('입력 중인 내용', '입력 중인 내용을 버리고 이 지출을 수정할까요?', '수정하기'))) return;
  ui.editId = id;
  loadEditDraft(e);
  renderNav(); renderView();
  $('#view').scrollTo({ top: 0, behavior: 'smooth' });
}
function loadEditDraft(e) {
  ui.editId = e.id;
  ui.draft = { date: e.date, amountText: S.fmtWon(e.amount), payee: e.payee, method_id: e.method_id, cat1_id: e.cat1_id, cat2_id: e.cat2_id, memo: e.memo || '', perf_excluded: !!e.perf_excluded, theme_id: e.theme_id || null, fixed_id: e.fixed_id || null, makeFixed: false };
  ui.touched = new Set(['method', 'cat', 'theme']);
  ui.auto = new Set();
  ui.err = null;
  ui.delArmed = false;
}
async function deleteEditing() {
  const e = S.live(doc.expenses).find(x => x.id === ui.editId);
  if (!e) return;
  if (ui.formIn === 'dialog') {
    // 수정 창 안에서는 확인 창 대신 두 번 눌러 삭제
    if (!ui.delArmed) { readForm(); ui.delArmed = true; renderForm(); setTimeout(() => { if (ui.delArmed && ui.formIn === 'dialog') { readForm(); ui.delArmed = false; renderForm(); } }, 3000); return; }
    S.deleteExpense(doc, e);
    persist();
    endDialogEdit();
    toast('삭제했습니다');
    return;
  }
  if (!(await confirmDialog('지출 삭제', `${esc(S.fmtDate(e.date))} · ${esc(e.payee)} ${esc(won(e.amount))}<br>이 지출을 삭제할까요?`, '삭제', true))) return;
  S.deleteExpense(doc, e);
  persist();
  newDraft();
  renderAll();
  toast('삭제했습니다');
}
// 내역에서 행을 누르면 수정 창을 연다. 입력 화면에서 쓰던 내용은 보관했다가 창을 닫으면 되돌린다
function editInDialog(id) {
  const e = S.live(doc.expenses).find(x => x.id === id);
  if (!e) return;
  if (ui.formIn !== 'dialog') ui.stash = { draft: ui.draft, touched: ui.touched, auto: ui.auto, editId: ui.editId, err: ui.err };
  ui.formIn = 'dialog';
  loadEditDraft(e);
  openDialog('지출 수정', '<div id="dlgForm"></div>');
  dlg().classList.add('wide');
  renderForm();
}
function endDialogEdit() {
  if (ui.formIn !== 'dialog') return;
  ui.formIn = 'page';
  Object.assign(ui, ui.stash || {}); ui.stash = null;
  if (!ui.draft) newDraft();
  ui.delArmed = false;
  dlg().classList.remove('wide');
  if (dlg().open) closeDialog();
  renderAll();
}
dlg().addEventListener('close', () => { if (ui.formIn === 'dialog') endDialogEdit(); });

// ---------- 템플릿 적용·저장 ----------
function applyTemplate(t) {
  readForm();
  const d = ui.draft;
  if (t.amount) d.amountText = S.fmtWon(t.amount);
  if (t.payee) d.payee = t.payee;
  const m = methodById(t.method_id);
  if (usable(m)) { d.method_id = m.id; ui.touched.add('method'); ui.auto.delete('method'); }
  const c1 = catById(t.cat1_id), c2 = catById(t.cat2_id);
  if (usable(c1) && (!t.cat2_id || usable(c2))) { d.cat1_id = c1.id; d.cat2_id = t.cat2_id || null; ui.touched.add('cat'); ui.auto.delete('cat'); }
  if (t.memo) d.memo = t.memo;
  ui.err = null;
  renderForm();
  toast(`템플릿 “${t.name}” 적용 · 확인 후 저장하세요`);
  if (!d.amountText) $('#fAmt')?.focus();
}
async function saveAsTemplate() {
  readForm();
  const d = ui.draft;
  const f = { amount: S.parseWon(d.amountText), payee: d.payee, method_id: d.method_id, cat1_id: d.cat1_id, cat2_id: d.cat2_id, memo: d.memo };
  let made = null;
  const name = await promptDialog('템플릿 만들기', `이름 (${esc(tplSummary(f))})`, {
    value: d.payee.trim(), okLabel: '만들기', placeholder: '예: 메가커피',
    validate: v => { const r = S.saveTemplate(doc, { ...f, name: v }); if (r.error) return r.error; made = r.item; return null; },
  });
  renderForm();
  if (!name || !made) return;
  persist();
  renderForm();
  toast(`템플릿 “${made.name}”을 만들었습니다`);
}
async function quickAdd(kind) {
  readForm();
  const d = ui.draft;
  const c1 = kind === 'cat2' ? catById(d.cat1_id) : null;
  const title = kind === 'method' ? '지불방식 추가' : kind === 'cat1' ? '카테고리 추가' : `${c1?.name} 하위 카테고리 추가`;
  const ph = kind === 'method' ? '예: BC카드' : kind === 'cat1' ? '예: 주영' : '예: 커피';
  let made = null;
  const v = await promptDialog(title, '이름', {
    placeholder: ph,
    validate: name => {
      const r = kind === 'method' ? S.addMethod(doc, name) : S.addCategory(doc, name, kind === 'cat2' ? c1?.id : null);
      if (r.error) return r.error;
      made = r.item; return null;
    },
  });
  if (!v || !made) { renderView(); return; }
  if (kind === 'method') { d.method_id = made.id; ui.touched.add('method'); ui.auto.delete('method'); }
  else if (kind === 'cat1') { d.cat1_id = made.id; d.cat2_id = null; ui.touched.add('cat'); ui.auto.delete('cat'); }
  else { d.cat2_id = made.id; ui.touched.add('cat'); ui.auto.delete('cat'); }
  persist();
  renderView();
}

// =====================================================================
// 내역 (M2)
// =====================================================================
const hq = () => {
  const h = ui.h;
  if (!h.ym) h.ym = S.todayKst().slice(0, 7);
  if (h.themeId && h.themeId !== 'none' && !themeById(h.themeId)) h.themeId = '';
  const themeMode = h.themeId && h.themeId !== 'none';
  return { ym: themeMode ? null : h.ym, themeId: h.themeId, method: h.method, cat: h.cat, text: h.text };
};
function historyHtml() {
  const h = ui.h;
  const q = hq();
  const th = q.themeId && q.themeId !== 'none' ? themeById(q.themeId) : null;
  const [y, m] = h.ym.split('-');
  const bar = th
    ? `<div class="hbar"><span class="thead">${ic('tag')}<b>${esc(th.name)}</b><span class="per">${esc(periodTxt(th))}</span></span><span class="sp"></span><button class="btn sm" data-act="theme-edit" data-id="${th.id}">${ic('pen')}테마 편집</button><button class="btn sm" data-act="h-theme-clear">${ic('x')}월별 보기</button></div>
       ${th.memo ? `<p class="hint" style="margin:-4px 0 8px">${esc(th.memo)}</p>` : ''}`
    : `<div class="hbar"><button class="icbtn" data-act="h-month" data-v="-1" aria-label="이전 달">${ic('left')}</button><b class="ym num">${y}년 ${Number(m)}월</b><button class="icbtn" data-act="h-month" data-v="1" aria-label="다음 달">${ic('right')}</button>
       ${h.ym !== S.todayKst().slice(0, 7) ? '<button class="btn sm" data-act="h-this-month">이번 달</button>' : ''}<span class="sp"></span></div>`;
  const opt = (v, label, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`;
  const mOpts = opt('', '지불방식 전체', h.method) + S.methodsOf(doc, { archived: true }).map(x => opt(x.id, x.name, h.method)).join('');
  const cOpts = opt('', '카테고리 전체', h.cat) + S.cat1sOf(doc, { archived: true }).map(c => opt(c.id, c.name, h.cat) + S.cat2sOf(doc, c.id, { archived: true }).map(c2 => opt(c2.id, `　└ ${c2.name}`, h.cat)).join('')).join('');
  const tOpts = opt('', '테마 전체', h.themeId) + opt('none', '테마 없음', h.themeId) + S.themesOf(doc).map(t => opt(t.id, `${t.name} (${periodTxt(t)})`, h.themeId)).join('');
  return `<div class="hwrap"><div class="hhead card">${bar}
      <div class="hfilters">
        <select class="in sm" data-h="method" aria-label="지불방식">${mOpts}</select>
        <select class="in sm" data-h="cat" aria-label="카테고리">${cOpts}</select>
        <select class="in sm" data-h="themeId" aria-label="테마">${tOpts}</select>
        <label class="hsearch">${ic('search')}<input class="in sm" id="hText" type="search" value="${esc(h.text)}" placeholder="지불처·메모" aria-label="지불처·메모 검색" autocomplete="off"></label>
      </div></div>
    <div id="hres">${historyResults()}</div></div>`;
}
function historyResults() {
  const h = ui.h;
  const q = hq();
  const list = S.sortExpenses(S.filterExpenses(doc, q), h.sort);
  const th = q.themeId && q.themeId !== 'none' ? themeById(q.themeId) : null;
  const total = S.sumOf(list);
  const filtered = !!(h.method || h.cat || h.text || h.themeId === 'none');
  let html = `<div class="hsum"><span><b class="num">${esc(won(total))}</b> · ${list.length}건</span>${filtered ? '<button class="btn sm" data-act="h-reset">필터 해제</button>' : ''}<span class="sp"></span><span class="hint" style="margin:0">행을 누르면 수정</span></div>`;
  if (th && list.length) html += catSumHtml(list, total);
  if (!list.length) return html + `<div class="card rempty">${th ? '이 테마에 묶인 지출이 없습니다' : '조건에 맞는 지출이 없습니다'}</div>`;
  const wide = wideMq.matches;
  let prev = '';
  const rows = list.map(e => {
    const m = methodById(e.method_id), t = themeById(e.theme_id);
    const dup = e.date === prev; prev = e.date;
    const perf = hasTarget(e.method_id) ? `<label class="pl" title="카드 실적에서 제외"><input type="checkbox" class="pchk" data-pid="${e.id}" ${e.perf_excluded ? 'checked' : ''} aria-label="${esc(e.payee)} 실적 제외"></label>` : '';
    if (wide) return `<tr data-act="h-edit" data-id="${e.id}" class="${dup ? 'dup' : 'nd'}"><td class="c-d num">${esc(S.fmtDateShort(e.date))}</td><td class="c-p">${esc(e.payee)}</td><td class="c-a num">${esc(S.fmtWon(e.amount))}</td><td class="c-m">${esc(m?.name || '')}</td><td class="c-c">${esc(catLabel(e))}</td><td class="c-memo">${esc(e.memo || '')}</td><td class="c-t">${t ? esc(t.name) : ''}</td><td class="c-x">${perf}</td></tr>`;
    return `<div class="hrow${dup ? ' dup' : ''}" data-act="h-edit" data-id="${e.id}" role="button" tabindex="0"><span class="d num">${esc(S.fmtDateShort(e.date))}</span><span class="p">${esc(e.payee)}</span><span class="a num">${esc(S.fmtWon(e.amount))}</span>
      <span class="m">${esc([m?.name, catLabel(e), e.memo].filter(Boolean).join(' · '))}${t ? `<span class="x">${esc(t.name)}</span>` : ''}</span>${perf ? `<span class="pw">${perf}<small>실적 제외</small></span>` : ''}</div>`;
  }).join('');
  if (!wide) return html + `<div class="card hlist">${rows}</div>`;
  return html + `<div class="card gridwrap"><table class="grid"><thead><tr><th class="c-d"><button class="sortb" data-act="h-sort" aria-label="날짜 순서 바꾸기">날짜 ${h.sort === 'desc' ? '▼' : '▲'}</button></th><th class="c-p">지불처</th><th class="c-a">금액</th><th class="c-m">지불방식</th><th class="c-c">카테고리</th><th class="c-memo">메모</th><th class="c-t">테마</th><th class="c-x">실적<br>제외</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function catSumHtml(list, total) {
  const rows = S.catTotals(doc, list).map(g => {
    const c1 = catById(g.id);
    const subs = g.subs.map(x => `<span class="cs2">${esc(catById(x.id)?.name || '(하위 없음)')} <b class="num">${esc(S.fmtWon(x.total))}</b></span>`).join('');
    const pct = total ? Math.round(g.total / total * 100) : 0;
    return `<div class="cs"><div class="cs1"><b>${esc(c1?.name || '?')}</b><span class="num">${esc(won(g.total))}</span><span class="pct num">${pct}%</span></div><div class="csbar"><i style="width:${pct}%"></i></div><div class="cssub">${subs}</div></div>`;
  }).join('');
  return `<section class="card catsum" aria-label="카테고리별 합계"><h2>카테고리별 합계</h2>${rows}</section>`;
}
function refreshHistory(all = false) {
  if (ui.view !== 'history') return;
  if (all) { renderView(); return; }
  const r = $('#hres');
  if (r) r.innerHTML = historyResults();
}
function togglePerf(id, on) {
  const e = S.live(doc.expenses).find(x => x.id === id);
  if (!e) return;
  e.perf_excluded = on; e.updated_at = S.nowIso();
  persist();
  toast(`${e.payee} ${won(e.amount)} · 실적 ${on ? '제외' : '포함'}`);
}
function openThemeInHistory(id) {
  ui.h.themeId = id; ui.h.text = '';
  if (ui.view === 'input') readForm();
  ui.view = 'history';
  $('#view').scrollTop = 0;
  renderAll();
}

// =====================================================================
// 템플릿·테마 편집 창 (M2)
// =====================================================================
function dlgTemplate(t = null) {
  const v = t || { name: '', amount: null, payee: '', method_id: null, cat1_id: null, cat2_id: null, memo: '' };
  const opt = (val, label, cur) => `<option value="${esc(val)}"${val === (cur || '') ? ' selected' : ''}>${esc(label)}</option>`;
  const c2opts = c1 => opt('', '(하위 없음/선택 안 함)', v.cat2_id) + (c1 ? S.cat2sOf(doc, c1, { archived: true }).map(c => opt(c.id, c.name, v.cat2_id)).join('') : '');
  openDialog(t ? '템플릿 편집' : '새 템플릿', `<form id="tplf" autocomplete="off" class="dform">
    <div><label class="fl" for="tN">이름 *</label><input class="in" id="tN" maxlength="30" value="${esc(v.name)}" placeholder="예: 메가커피"></div>
    <div><label class="fl" for="tA">금액 (비우면 입력할 때 채움)</label><input class="in" id="tA" inputmode="numeric" maxlength="14" value="${v.amount ? esc(S.fmtWon(v.amount)) : ''}" placeholder="0"></div>
    <div><label class="fl" for="tP">지불처</label><input class="in" id="tP" maxlength="60" value="${esc(v.payee)}"></div>
    <div><label class="fl" for="tM">지불방식</label><select class="in" id="tM">${opt('', '(선택 안 함)', v.method_id)}${S.methodsOf(doc, { archived: true }).map(m => opt(m.id, m.name + (m.archived ? ' (보관)' : ''), v.method_id)).join('')}</select></div>
    <div class="two"><div><label class="fl" for="tC1">카테고리</label><select class="in" id="tC1">${opt('', '(선택 안 함)', v.cat1_id)}${S.cat1sOf(doc, { archived: true }).map(c => opt(c.id, c.name, v.cat1_id)).join('')}</select></div>
      <div><label class="fl" for="tC2">하위</label><select class="in" id="tC2">${c2opts(v.cat1_id)}</select></div></div>
    <div><label class="fl" for="tMemo">메모</label><input class="in" id="tMemo" maxlength="200" value="${esc(v.memo)}"></div>
    <p class="note" id="tErr" hidden></p></form>`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn primary" id="tOk">${t ? '저장' : '만들기'}</button>`);
  const amt = $('#tA');
  amt.addEventListener('input', () => { const r = S.formatAmountInput(amt.value, amt.selectionStart ?? amt.value.length); amt.value = r.text; try { amt.setSelectionRange(r.caret, r.caret); } catch { /* 무시 */ } });
  $('#tC1').addEventListener('change', () => { v.cat2_id = null; $('#tC2').innerHTML = c2opts($('#tC1').value); });
  const go = () => {
    const f = { name: $('#tN').value, amount: S.parseWon(amt.value), payee: $('#tP').value, method_id: $('#tM').value || null, cat1_id: $('#tC1').value || null, cat2_id: $('#tC2').value || null, memo: $('#tMemo').value };
    const r = S.saveTemplate(doc, f, t?.id || null);
    if (r.error) { const e = $('#tErr'); e.textContent = r.error; e.hidden = false; return; }
    persist(); closeDialog(); refreshManage();
    toast(`템플릿 “${r.item.name}” ${t ? '저장' : '만들기'} 완료`);
  };
  $('#tOk').addEventListener('click', go);
  $('#tplf').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#tN').focus();
}
function dlgTheme(t = null) {
  const today = S.todayKst();
  const v = t || { name: '', start: today, end: today, memo: '' };
  openDialog(t ? '테마 편집' : '새 테마', `<form id="thf" autocomplete="off" class="dform">
    <div><label class="fl" for="hN">이름 *</label><input class="in" id="hN" maxlength="40" value="${esc(v.name)}" placeholder="예: 포천 여행"></div>
    <div class="two"><div><label class="fl" for="hS">시작일 *</label><input class="in" id="hS" type="date" value="${v.start}"></div>
      <div><label class="fl" for="hE">종료일 *</label><input class="in" id="hE" type="date" value="${v.end}"></div></div>
    <div><label class="fl" for="hM">메모</label><input class="in" id="hM" maxlength="200" value="${esc(v.memo)}" placeholder="선택"></div>
    <p class="hint" style="margin:0">기간 안의 날짜로 지출을 입력하면 이 테마가 자동으로 골라집니다.</p>
    <p class="note" id="hErr" hidden></p></form>`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn primary" id="hOk">${t ? '저장' : '만들기'}</button>`);
  $('#hS').addEventListener('change', () => { if ($('#hE').value < $('#hS').value) $('#hE').value = $('#hS').value; });
  const go = async () => {
    const r = S.saveTheme(doc, { name: $('#hN').value, start: $('#hS').value, end: $('#hE').value, memo: $('#hM').value }, t?.id || null);
    if (r.error) { const e = $('#hErr'); e.textContent = r.error; e.hidden = false; return; }
    persist(); closeDialog();
    const th = r.item;
    const loose = S.unthemedInRange(doc, th);
    if (loose.length && await confirmDialog('기간 안의 지출', `${esc(periodTxt(th))} 사이에 테마가 없는 지출이 <b>${loose.length}건</b> (${esc(won(S.sumOf(loose)))}) 있습니다. 이 지출들을 “${esc(th.name)}” 테마로 묶을까요?`, '묶기')) {
      S.attachTheme(doc, th, loose); persist();
      toast(`${loose.length}건을 “${th.name}” 테마로 묶었습니다`);
    } else toast(`테마 “${th.name}” ${t ? '저장' : '만들기'} 완료`);
    if (!ui.touched.has('theme') && ui.draft) autoTheme();
    if (ui.view === 'history') renderAll(); else refreshManage();
  };
  $('#hOk').addEventListener('click', go);
  $('#thf').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#hN').focus();
}

// =====================================================================
// 통계 (M4)
// =====================================================================
const manwon = n => { if (n >= 100000000) return `${+(n / 100000000).toFixed(1)}억`; if (n >= 100000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만`; if (n >= 10000) return `${+(n / 10000).toFixed(1)}만`; return n ? n.toLocaleString('ko-KR') : '0'; };
const ymLabel = (ym, withYear) => (withYear ? `${ym.slice(2, 4)}.${Number(ym.slice(5))}월` : `${Number(ym.slice(5))}월`);
function perfHtml() {
  const st = ui.st;
  if (!st.perfYm) st.perfYm = S.todayKst().slice(0, 7);
  const list = S.perfStatus(doc, st.perfYm);
  const cur = st.perfYm === S.todayKst().slice(0, 7);
  const head = `<h2>${ic('wallet')}카드 실적<span class="sub mnav"><button class="icbtn sm" data-act="perf-month" data-v="-1" aria-label="이전 달">${ic('left')}</button><b class="num">${st.perfYm.slice(0, 4)}.${st.perfYm.slice(5)}</b><button class="icbtn sm" data-act="perf-month" data-v="1" aria-label="다음 달" ${cur ? 'disabled' : ''}>${ic('right')}</button></span></h2>`;
  if (!list.length) return `<section class="card">${head}<p class="hint" style="margin:0">관리 › 지불방식에서 월 실적 목표를 넣으면 여기서 달성률을 보여 줍니다.</p></section>`;
  const rows = list.map(p => {
    const done = p.remain === 0;
    return `<div class="pf-row"><div class="pf-top"><b>${esc(p.m.name)}</b><span class="num">${esc(won(p.actual))} <span class="muted">/ ${esc(won(p.target))}</span></span></div>
      <div class="meter${done ? ' done' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, p.pct)}" aria-label="${esc(p.m.name)} 실적 ${p.pct}%"><i style="width:${Math.min(100, p.pct)}%"></i></div>
      <div class="pf-bot"><span class="num">${p.pct}%</span><span class="${done ? 'ok' : ''}">${done ? `${ic('check')}달성` : `${esc(won(p.remain))} 남음`}</span></div></div>`;
  }).join('');
  return `<section class="card">${head}${rows}<p class="hint">실적 금액에서 “실적 제외”로 표시한 지출은 뺍니다. 기간은 매달 1일~말일입니다.</p></section>`;
}
function statsHtml() {
  const st = ui.st;
  const months = S.monthsOf(st.period);
  const pv = S.pivot(doc, months, st.dim);
  const years = S.yearsWithData(doc);
  const thisYear = S.todayKst().slice(0, 4);
  const opts = [['r6', '최근 6개월'], ['r12', '최근 12개월'], ...[...new Set([thisYear, ...years])].sort().reverse().map(y => [y, `${y}년`])];
  const multiYear = new Set(months.map(m => m.slice(0, 4))).size > 1;
  const series = st.series ? findRow(pv, st.series) : null;
  if (st.series && !series) st.series = null;
  const cell = (row, ym, cls = '') => { const v = row.by[ym] || 0; return `<td class="num ${cls}${v ? '' : ' zero'}">${v ? `<button class="cellb" data-act="st-cell" data-row="${esc(row.id)}" data-ym="${ym}" title="내역 보기">${esc(S.fmtWon(v))}</button>` : '–'}</td>`; };
  const tr = (row, lvl = 1, hasKids = false) => {
    const open = st.open.has(row.id);
    const avg = Math.round(row.total / months.length);
    return `<tr class="lv${lvl}${st.series === row.id ? ' sel' : ''}${row.archived ? ' arch' : ''}">
      <th scope="row">${lvl === 1 && hasKids ? `<button class="tgl" data-act="st-open" data-id="${esc(row.id)}" aria-expanded="${open}" aria-label="${esc(row.name)} 하위 ${open ? '접기' : '펼치기'}">${ic(open ? 'down' : 'right')}</button>` : '<span class="tgl-sp"></span>'}<button class="rowb" data-act="st-series" data-id="${esc(row.id)}" title="차트에 표시">${esc(row.name)}</button></th>
      ${months.map(m => cell(row, m)).join('')}<td class="num tot">${esc(S.fmtWon(row.total))}</td><td class="num avg">${esc(S.fmtWon(avg))}</td></tr>`;
  };
  const body = pv.rows.map(r => tr(r, 1, !!r.children?.length) + (r.children && st.open.has(r.id) ? r.children.map(c => tr(c, 2)).join('') : '')).join('');
  const table = pv.rows.length ? `<div class="stwrap"><table class="stbl"><thead><tr><th scope="col">${st.dim === 'method' ? '지불방식' : '카테고리'}</th>${months.map(m => `<th scope="col" class="num">${ymLabel(m, multiYear)}</th>`).join('')}<th scope="col" class="num">합계</th><th scope="col" class="num">월평균</th></tr></thead>
    <tbody>${body}</tbody><tfoot><tr class="total${st.series ? '' : ' sel'}"><th scope="row"><span class="tgl-sp"></span><button class="rowb" data-act="st-series" data-id="" title="차트에 표시">합계</button></th>${months.map(m => cell(pv.totals, m)).join('')}<td class="num tot">${esc(S.fmtWon(pv.totals.total))}</td><td class="num avg">${esc(S.fmtWon(Math.round(pv.totals.total / months.length)))}</td></tr></tfoot></table></div>`
    : '<p class="hint">이 기간에 지출이 없습니다.</p>';
  return `<div class="stwrap-all">${perfHtml()}
    <section class="card"><div class="stctl"><span class="seg" role="group" aria-label="기준">${[['method', '지불방식'], ['cat', '카테고리']].map(([v, l]) => `<button data-act="st-dim" data-v="${v}" aria-pressed="${st.dim === v}">${l}</button>`).join('')}</span>
      <select class="in sm" id="stPeriod" aria-label="기간">${opts.map(([v, l]) => `<option value="${v}"${v === st.period ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <h2 class="chh">월별 추이 · ${esc(series ? series.name : '전체')}${series ? '<button class="btn sm" data-act="st-series" data-id="">전체 보기</button>' : ''}</h2>
      <div class="chart" id="chart" data-months="${months.join(',')}"></div>
      <p class="hint">표에서 항목 이름을 누르면 그 항목의 추이를, 금액을 누르면 그 달 내역을 봅니다.${st.dim === 'cat' ? ' 1단계 왼쪽 화살표로 2단계를 펼칩니다.' : ''}</p></section>
    <section class="card">${table}</section></div>`;
}
function findRow(pv, id) {
  for (const r of pv.rows) { if (r.id === id) return r; for (const c of r.children || []) if (c.id === id) return c; }
  return null;
}
// 막대 차트 (SVG): 단일 계열이라 범례 없이 제목이 계열을 말한다. 최댓값과 마지막 달만 값 표시, 나머지는 툴팁
function drawChart() {
  const host = $('#chart');
  if (!host) return;
  const months = host.dataset.months.split(',');
  const pv = S.pivot(doc, months, ui.st.dim);
  const row = (ui.st.series && findRow(pv, ui.st.series)) || pv.totals;
  const vals = months.map(m => row.by[m] || 0);
  const W = Math.max(280, host.clientWidth), H = 220, L = 46, R = 8, T = 22, B = 26;
  const max = Math.max(...vals, 0);
  const steps = [1, 2, 2.5, 5, 10];
  let step = 10000;
  if (max > 0) { const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)); step = p * steps.find(s => s * p >= raw); }
  const top = Math.max(step, Math.ceil(max / step) * step);
  const y = v => T + (H - T - B) * (1 - v / top);
  const band = (W - L - R) / months.length, bw = Math.min(24, band * 0.56);
  const multiYear = new Set(months.map(m => m.slice(0, 4))).size > 1;
  const maxI = vals.indexOf(max), lastI = vals.length - 1;
  let g = '';
  for (let v = 0; v <= top + 1; v += step) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid${v ? '' : ' base'}"/><text x="${L - 6}" y="${y(v) + 4}" class="tick" text-anchor="end">${manwon(v)}</text>`;
  const bars = vals.map((v, i) => {
    const cx = L + band * i + band / 2, x = cx - bw / 2, h = Math.max(0, y(0) - y(v)), r = Math.min(4, h);
    const path = h > 0 ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${y(0)} Z` : '';
    const lab = v && (i === maxI || i === lastI) ? `<text x="${cx}" y="${y(v) - 6}" class="vlab" text-anchor="middle">${manwon(v)}</text>` : '';
    return `<g class="bar" data-i="${i}" tabindex="0" role="img" aria-label="${ymLabel(months[i], true)} ${S.fmtWon(v)}원"><rect class="hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}"/>${path ? `<path d="${path}" class="mark"/>` : ''}${lab}<text x="${cx}" y="${H - 8}" class="tick" text-anchor="middle">${ymLabel(months[i], multiYear && (i === 0 || months[i].endsWith('-01')))}</text></g>`;
  }).join('');
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="group" aria-label="월별 지출 막대 차트">${g}${bars}</svg><div class="tip" id="chartTip" hidden></div>`;
  const tip = $('#chartTip');
  const show = el => {
    const i = +el.dataset.i, v = vals[i];
    host.querySelectorAll('.bar').forEach(b => b.classList.toggle('on', b === el));
    tip.innerHTML = `<b>${months[i].slice(0, 4)}년 ${Number(months[i].slice(5))}월</b><span class="num">${esc(won(v))}</span><small>${row.count ? `${S.filterExpenses(doc, { ym: months[i], ...(row === pv.totals ? {} : ui.st.dim === 'method' ? { method: row.id } : { cat: row.id.includes(':none') ? row.id.split(':')[0] : row.id }) }).length}건` : ''}</small>`;
    tip.hidden = false;
    const cx = L + band * i + band / 2;
    tip.style.left = `${Math.min(W - tip.offsetWidth / 2 - 4, Math.max(tip.offsetWidth / 2 + 4, cx))}px`;
    tip.style.top = `${Math.max(0, y(v) - 8)}px`;
  };
  host.querySelectorAll('.bar').forEach(b => { b.addEventListener('pointerenter', () => show(b)); b.addEventListener('focus', () => show(b)); b.addEventListener('click', () => show(b)); });
  host.addEventListener('pointerleave', () => { tip.hidden = true; host.querySelectorAll('.bar.on').forEach(b => b.classList.remove('on')); });
}
let chartTimer;
addEventListener('resize', () => { clearTimeout(chartTimer); chartTimer = setTimeout(() => { if (unlocked && ui.view === 'stats') drawChart(); }, 150); });
// 표의 금액을 누르면 그 달·그 항목의 내역으로
function statCellToHistory(rowId, ym) {
  const h = ui.h;
  Object.assign(h, { ym, themeId: '', method: '', cat: '', text: '' });
  if (rowId && rowId !== 'total') {
    if (ui.st.dim === 'method') h.method = rowId;
    else h.cat = rowId.includes(':none') ? rowId.split(':')[0] : rowId;
  }
  ui.view = 'history';
  $('#view').scrollTop = 0;
  renderAll();
}

// =====================================================================
// 고정 지출 (M4)
// =====================================================================
const FX_STATE = { done: ['입력됨', 'ok'], skip: ['건너뜀', ''], overdue: ['미입력 · 지남', 'warn'], due: ['오늘 결제', 'warn'], later: ['예정', ''] };
function fixedHtml() {
  const fx = ui.fx;
  if (!fx.ym) fx.ym = S.todayKst().slice(0, 7);
  const cur = S.todayKst().slice(0, 7);
  const list = S.fixedStatus(doc, fx.ym);
  const planned = list.filter(x => !x.skipped).reduce((s, x) => s + (x.entry ? x.entry.amount : x.f.amount || 0), 0);
  const doneN = list.filter(x => x.entry).length, left = list.filter(x => x.state === 'overdue' || x.state === 'due' || x.state === 'later').length;
  const rows = list.map(x => {
    const [lbl, cls] = FX_STATE[x.state];
    const m = methodById(x.f.method_id), c = [catById(x.f.cat1_id)?.name, catById(x.f.cat2_id)?.name].filter(Boolean).join('›');
    const amt = x.entry ? x.entry.amount : x.f.amount;
    const act = x.entry
      ? `<button class="btn sm" data-act="h-edit" data-id="${x.entry.id}">보기</button>`
      : x.skipped ? `<button class="btn sm" data-act="fx-skip" data-id="${x.f.id}">되돌리기</button>`
      : `<button class="btn sm" data-act="fx-skip" data-id="${x.f.id}" title="이번 달은 나가지 않음">건너뛰기</button><button class="btn sm primary" data-act="fx-enter" data-id="${x.f.id}">입력</button>`;
    return `<div class="fxrow ${x.state}"><span class="fxd num">${Number(x.date.slice(8))}일</span>
      <div class="fxm"><b>${esc(x.f.name)}</b><span>${esc([x.f.payee, m?.name, c].filter(Boolean).join(' · ') || '내용 없음')}${x.entry ? ` · ${esc(S.fmtDateShort(x.entry.date))} 입력` : ''}</span></div>
      <span class="fxa num">${amt ? esc(S.fmtWon(amt)) : '–'}</span><span class="fxs ${cls}">${lbl}</span><span class="fxb">${act}</span></div>`;
  }).join('');
  const all = S.fixedOf(doc);
  const defs = all.map(f => `<div class="mrow${f.active === false ? ' arch' : ''}"><div class="nm tinfo"><b>${esc(f.name)} <span class="muted">· 매달 ${f.day}일</span></b><span>${esc(tplSummary(f))}</span></div>
      <button type="button" class="sw" role="switch" data-act="fx-active" data-id="${f.id}" aria-checked="${f.active !== false}" aria-label="${esc(f.name)} 사용" title="사용 / 쉬기"><i></i></button>
      <button class="icbtn" data-act="fx-edit" data-id="${f.id}" aria-label="${esc(f.name)} 편집">${ic('pen')}</button>${rmBtn('fixed', f)}</div>`).join('');
  return `<div class="mgwrap">
    <section class="card"><div class="hbar"><button class="icbtn" data-act="fx-month" data-v="-1" aria-label="이전 달">${ic('left')}</button><b class="ym num">${fx.ym.slice(0, 4)}년 ${Number(fx.ym.slice(5))}월</b><button class="icbtn" data-act="fx-month" data-v="1" aria-label="다음 달">${ic('right')}</button>${fx.ym !== cur ? '<button class="btn sm" data-act="fx-this">이번 달</button>' : ''}<span class="sp"></span></div>
      ${list.length ? `<div class="hsum" style="padding:0 0 8px"><span><b class="num">${esc(won(planned))}</b> · ${list.length}건 중 ${doneN}건 입력${left ? ` · <span class="warn-t">${left}건 남음</span>` : ''}</span></div><div class="fxlist">${rows}</div>`
        : `<p class="hint" style="margin:0">${all.length ? '이 달에 사용 중인 고정 지출이 없습니다.' : '아래에서 고정 지출을 등록하거나, 빠른 입력에서 “매달 고정 지출로 등록”을 체크하고 저장하세요.'}</p>`}</section>
    <section class="card"><h2>${ic('repeat')}고정 지출 목록<span class="sub">결제일 순</span></h2>${defs || '<p class="hint" style="margin:0 0 4px">아직 없습니다.</p>'}
      <div class="addrow"><button class="btn" data-act="fx-new">${ic('plus')}새 고정 지출</button></div>
      <p class="hint">결제일이 그 달에 없으면(예: 31일) 말일로 봅니다. 결제일이 지나도 입력하지 않으면 티커에 알립니다. 쉬게 한 항목은 목록과 알림에서 빠집니다.</p></section></div>`;
}
// 고정 지출로 입력: 입력 화면에 그 내용을 채운다 (날짜는 그 달의 결제일)
async function enterFixed(f) {
  if (ui.view === 'input' && ui.formIn === 'page') readForm();
  if (draftDirty() && !(await confirmDialog('입력 중인 내용', '입력 화면에 쓰던 내용을 버리고 이 고정 지출을 입력할까요?', '입력하기'))) return;
  newDraft();
  const d = ui.draft;
  Object.assign(d, { date: S.fixedDate(f, ui.fx.ym || S.todayKst().slice(0, 7)), amountText: f.amount ? S.fmtWon(f.amount) : '', payee: f.payee || f.name, memo: f.memo || '', fixed_id: f.id });
  const m = methodById(f.method_id); if (usable(m)) d.method_id = m.id;
  const c1 = catById(f.cat1_id), c2 = catById(f.cat2_id);
  if (usable(c1) && (!f.cat2_id || usable(c2))) { d.cat1_id = c1.id; d.cat2_id = f.cat2_id || null; }
  ui.touched = new Set(['method', 'cat']);
  autoTheme();
  ui.view = 'input';
  $('#view').scrollTop = 0;
  renderAll();
  toast(`고정 지출 “${f.name}” 내용을 채웠습니다. 금액을 확인하고 저장하세요`);
  if (wideMq.matches || !d.amountText) $('#fAmt')?.focus();
}
function dlgFixed(f = null) {
  const v = f || { name: '', day: Number(S.todayKst().slice(8)), amount: null, payee: '', method_id: null, cat1_id: null, cat2_id: null, memo: '' };
  const opt = (val, label, cur) => `<option value="${esc(val)}"${String(val) === String(cur ?? '') ? ' selected' : ''}>${esc(label)}</option>`;
  const c2opts = c1 => opt('', '(하위 없음/선택 안 함)', v.cat2_id) + (c1 ? S.cat2sOf(doc, c1, { archived: true }).map(c => opt(c.id, c.name, v.cat2_id)).join('') : '');
  openDialog(f ? '고정 지출 편집' : '새 고정 지출', `<form id="fxf" autocomplete="off" class="dform">
    <div class="two"><div><label class="fl" for="xN">이름 *</label><input class="in" id="xN" maxlength="30" value="${esc(v.name)}" placeholder="예: 통신비"></div>
      <div><label class="fl" for="xD">매달 결제일 *</label><select class="in" id="xD">${Array.from({ length: 31 }, (_, i) => opt(i + 1, `${i + 1}일`, v.day)).join('')}</select></div></div>
    <div class="two"><div><label class="fl" for="xA">금액 (달마다 다르면 비움)</label><input class="in" id="xA" inputmode="numeric" maxlength="14" value="${v.amount ? esc(S.fmtWon(v.amount)) : ''}" placeholder="0"></div>
      <div><label class="fl" for="xP">지불처</label><input class="in" id="xP" maxlength="60" value="${esc(v.payee)}" placeholder="예: SKT"></div></div>
    <div><label class="fl" for="xM">지불방식</label><select class="in" id="xM">${opt('', '(선택 안 함)', v.method_id)}${S.methodsOf(doc, { archived: true }).map(m => opt(m.id, m.name + (m.archived ? ' (보관)' : ''), v.method_id)).join('')}</select></div>
    <div class="two"><div><label class="fl" for="xC1">카테고리</label><select class="in" id="xC1">${opt('', '(선택 안 함)', v.cat1_id)}${S.cat1sOf(doc, { archived: true }).map(c => opt(c.id, c.name, v.cat1_id)).join('')}</select></div>
      <div><label class="fl" for="xC2">하위</label><select class="in" id="xC2">${c2opts(v.cat1_id)}</select></div></div>
    <div><label class="fl" for="xMemo">메모</label><input class="in" id="xMemo" maxlength="200" value="${esc(v.memo)}"></div>
    <p class="note" id="xErr" hidden></p></form>`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn primary" id="xOk">${f ? '저장' : '만들기'}</button>`);
  const amt = $('#xA');
  amt.addEventListener('input', () => { const r = S.formatAmountInput(amt.value, amt.selectionStart ?? amt.value.length); amt.value = r.text; try { amt.setSelectionRange(r.caret, r.caret); } catch { /* 무시 */ } });
  $('#xC1').addEventListener('change', () => { v.cat2_id = null; $('#xC2').innerHTML = c2opts($('#xC1').value); });
  const go = () => {
    const r = S.saveFixed(doc, { name: $('#xN').value, day: Number($('#xD').value), amount: S.parseWon(amt.value), payee: $('#xP').value, method_id: $('#xM').value || null, cat1_id: $('#xC1').value || null, cat2_id: $('#xC2').value || null, memo: $('#xMemo').value, active: f ? f.active !== false : true }, f?.id || null);
    if (r.error) { const e = $('#xErr'); e.textContent = r.error; e.hidden = false; return; }
    persist(); closeDialog(); renderAll();
    toast(`고정 지출 “${r.item.name}” ${f ? '저장' : '등록'} (매달 ${r.item.day}일)`);
  };
  $('#xOk').addEventListener('click', go);
  $('#fxf').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#xN').focus();
}

// =====================================================================
// 티커 (M4)
// =====================================================================
const TK_SPEED = 55; // px/초
let tkKey = '';
function renderTicker(force = false) {
  const el = $('#ticker');
  if (!el || !doc) return;
  const set = S.tickerSettings(doc);
  const now = S.nowKst();
  const own = S.live(doc.ticker).filter(k => S.tickerState(k, now) === 'on').sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const items = [...S.autoTicker(doc, now), ...own];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = JSON.stringify([set.color, set.position, items.map(k => [k.id, k.text, S.tickerLevel(k)]), innerWidth, reduce]);
  if (!force && key === tkKey) return;
  tkKey = key;
  const anchor = set.position === 'top' ? $('#view') : $('#tabs');
  if (el.nextElementSibling !== anchor) anchor.before(el);
  el.className = `ticker c-${set.color} pos-${set.position}${el.classList.contains('paused') ? ' paused' : ''}`;
  if (!items.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const itemHtml = k => { const lv = S.tickerLevel(k); return `<span class="tk-item lv-${lv}${k.auto ? ' auto' : ''}">${k.auto ? ic('bell') : ''}${lv === 'urgent' ? `<span class="tk-badge"><b class="tk-bang">!</b>${esc(k.text)}</span>` : esc(k.text)}</span>`; };
  const unit = `<span class="tk-unit" style="display:inline-flex">${items.map(k => `${itemHtml(k)}<span class="tk-sep">•</span>`).join('')}</span>`;
  el.title = '누르면 일시정지 / 다시 재생';
  el.innerHTML = `<div class="tk-track" aria-hidden="true">${unit}</div><span class="sr">알림: ${items.map(k => esc(k.text)).join(' / ')}</span><span class="tk-pause" aria-hidden="true">${ic('pause')}일시정지</span>`;
  if (reduce) return;
  const track = el.firstElementChild;
  const w = track.firstElementChild.getBoundingClientRect().width || 1;
  const reps = Math.max(1, Math.ceil(el.clientWidth / w));
  const half = unit.repeat(reps);
  track.innerHTML = half + half;
  track.style.setProperty('--tk-dur', ((w * reps) / TK_SPEED).toFixed(1) + 's');
}
$('#ticker').addEventListener('click', e => { e.currentTarget.classList.toggle('paused'); });
setInterval(() => { if (unlocked) renderTicker(); }, 30000);
const TK_STATE = { on: ['표시 중', 'on'], off: ['꺼짐', ''], outside: ['시간대 외', ''], expired: ['만료', 'exp'] };
const segHtml = (act, opts, cur) => `<span class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</span>`;
function tickerCardHtml() {
  const set = S.tickerSettings(doc);
  const now = S.nowKst();
  const list = S.live(doc.ticker).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const sw = c => `<span class="swatch" style="background:var(--tk-${c}-bg)"></span>`;
  const rows = list.map(k => {
    const [lbl, cls] = TK_STATE[S.tickerState(k, now)];
    const fld = (f, type, label, extra = '') => `<input class="in" type="${type}" data-kid="${k.id}" data-kf="${f}" value="${esc(k[f] || '')}" aria-label="${label}"${extra}>`;
    return `<div class="tkrow${k.enabled ? '' : ' off'}" data-row="${k.id}">
      <div class="r1"><button type="button" class="sw" role="switch" data-act="tk-toggle" data-id="${k.id}" aria-checked="${k.enabled}" aria-label="띠에 표시"><i></i></button>${fld('text', 'text', '문장', ' maxlength="120"')}${rmBtn('ticker', k)}</div>
      <div class="r2"><span class="tw">강조${segHtml('tk-level" data-id="' + k.id, Object.entries(S.TICKER_LEVELS), S.tickerLevel(k))}</span><span class="tw">종료일${fld('expire_date', 'date', '표시 종료일')}</span><span class="tw">매일${fld('daily_from', 'time', '표시 시작 시각')}~${fld('daily_to', 'time', '표시 종료 시각')}</span><span class="tkst ${cls}">${lbl}</span></div></div>`;
  }).join('');
  return `<section class="card" id="tkCard"><h2>${ic('bell')}티커<span class="sub">화면 위·아래에 흐르는 한 줄 알림</span></h2>
    <div class="tkset2"><div><span class="fl">띠 색상</span>${segHtml('tk-color', Object.entries(S.TICKER_COLORS).map(([v, l]) => [v, sw(v) + l]), set.color)}</div>
      <div><span class="fl">띠 위치</span>${segHtml('tk-pos', [['top', '위'], ['bottom', '아래']], set.position)}</div></div>
    <span class="fl" style="margin-top:12px">자동 알림</span>
    <div class="autorow"><button type="button" class="sw" role="switch" data-act="tk-auto" data-v="auto_fixed" aria-checked="${!!set.auto_fixed}"><i></i>고정 지출 결제일이 지났는데 입력하지 않으면 알림</button></div>
    <div class="autorow"><button type="button" class="sw" role="switch" data-act="tk-auto" data-v="auto_perf" aria-checked="${!!set.auto_perf}"><i></i>카드 실적이 목표에 못 미치면 알림</button>
      <label class="tw">매달 <select class="in sm" id="tkPerfDay" aria-label="실적 알림 시작일">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}"${set.perf_day === i + 1 ? ' selected' : ''}>${i + 1}일</option>`).join('')}</select>부터</label></div>
    <span class="fl" style="margin-top:12px">내 문장</span>
    <div class="tkset">${rows || '<p class="hint" style="margin:0">아직 문장이 없습니다.</p>'}</div>
    <form class="addrow" data-add="ticker"><input class="in" name="n" maxlength="120" placeholder="새 문장 (예: 이번 달 외식 줄이기)" aria-label="새 티커 문장"><button class="btn primary" type="submit">추가</button></form>
    <p class="hint">켜 둔 문장만 흐릅니다. 강조는 보통·강조(굵게)·긴급(굵게 + 테두리 + !) 중에서 고릅니다. 종료일이 지나면 띠에서 사라집니다. 매일 시간대는 시작과 끝을 모두 넣어야 적용되고, 시작이 끝보다 늦으면 자정을 넘깁니다. 띠를 누르면 일시정지합니다. 자동 알림은 종 아이콘과 함께 맨 앞에 흐릅니다.</p></section>`;
}

// =====================================================================
// 관리
// =====================================================================
const armed = new Set();
function ctlHtml(kind, item, i, n) {
  const k = `${kind}:${item.id}`;
  return `<button class="icbtn" data-act="mv" data-kind="${kind}" data-id="${item.id}" data-v="-1" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button>
    <button class="icbtn" data-act="mv" data-kind="${kind}" data-id="${item.id}" data-v="1" aria-label="아래로" ${i === n - 1 ? 'disabled' : ''}>${ic('down')}</button>
    <button class="icbtn" data-act="arch" data-kind="${kind}" data-id="${item.id}" aria-label="${item.archived ? '복원' : '보관'}" title="${item.archived ? '복원' : '보관 (입력 선택지에서 숨김)'}">${ic(item.archived ? 'unbox' : 'box')}</button>
    <button class="icbtn${armed.has(k) ? ' armed' : ''}" data-act="rm" data-kind="${kind}" data-id="${item.id}" aria-label="${armed.has(k) ? '한 번 더 누르면 삭제' : '삭제'}" title="${armed.has(k) ? '한 번 더 누르면 삭제' : '삭제'}">${ic('trash')}</button>`;
}
const rmBtn = (kind, item) => { const k = `${kind}:${item.id}`; return `<button class="icbtn${armed.has(k) ? ' armed' : ''}" data-act="rm" data-kind="${kind}" data-id="${item.id}" aria-label="${armed.has(k) ? '한 번 더 누르면 삭제' : '삭제'}" title="${armed.has(k) ? '한 번 더 누르면 삭제' : '삭제'}">${ic('trash')}</button>`; };
function manageHtml() {
  const tpls = S.templatesOf(doc), themes = S.themesOf(doc);
  const ms = S.methodsOf(doc, { archived: true });
  const mrows = ms.map((m, i) => `<div class="mrow mt${m.archived ? ' arch' : ''}">
      <input class="in nm" data-edit="name" data-kind="method" data-id="${m.id}" value="${esc(m.name)}" maxlength="30" aria-label="지불방식 이름">
      <input class="in tg" data-edit="target" data-id="${m.id}" value="${m.perf_target ? esc(S.fmtWon(m.perf_target)) : ''}" inputmode="numeric" placeholder="실적 목표 없음" aria-label="${esc(m.name)} 월 실적 목표" maxlength="14">
      <span class="cnt">${S.usageCount(doc, 'method', m.id)}건</span>${ctlHtml('method', m, i, ms.length)}</div>`).join('');
  const c1s = S.cat1sOf(doc, { archived: true });
  const groups = c1s.map((c, i) => {
    const subs = S.cat2sOf(doc, c.id, { archived: true });
    return `<div class="cgroup"><div class="mrow${c.archived ? ' arch' : ''}">
        <input class="in nm" data-edit="name" data-kind="category" data-id="${c.id}" value="${esc(c.name)}" maxlength="30" aria-label="카테고리 이름" style="font-weight:700">
        <span class="cnt">${S.usageCount(doc, 'category', c.id)}건</span>${ctlHtml('category', c, i, c1s.length)}</div>
      <div class="c2">${subs.map((s, j) => `<div class="mrow${s.archived ? ' arch' : ''}"><input class="in nm" data-edit="name" data-kind="category" data-id="${s.id}" value="${esc(s.name)}" maxlength="30" aria-label="${esc(c.name)} 하위 카테고리 이름"><span class="cnt">${S.usageCount(doc, 'category', s.id)}건</span>${ctlHtml('category', s, j, subs.length)}</div>`).join('')}
        <form class="addrow" data-add="cat2" data-parent="${c.id}"><input class="in" name="n" maxlength="30" placeholder="${esc(c.name)} 하위 추가 (예: 커피)" aria-label="${esc(c.name)} 하위 카테고리 추가"><button class="btn" type="submit">추가</button></form></div></div>`;
  }).join('');
  return `<div class="mgwrap">
    <section class="card"><h2>${ic('wallet')}지불방식</h2>
      ${ms.length ? `<div class="mhead mt"><span class="nm">이름</span><span class="tg">월 실적 목표(원)</span><span class="ctl"></span></div>${mrows}` : '<p class="hint" style="margin:0 0 4px">카드, 계좌이체 등 지불방식을 추가하세요</p>'}
      <form class="addrow" data-add="method"><input class="in" name="n" maxlength="30" placeholder="새 지불방식 (예: BC카드)" aria-label="새 지불방식"><button class="btn primary" type="submit">추가</button></form>
      <p class="hint">월 실적 목표를 넣은 지불방식은 입력할 때 "카드 실적에서 제외"를 고를 수 있습니다. 실적 달성률은 통계(M4)에서 보여 줍니다. 쓰고 있는 항목은 지우는 대신 보관하세요 (입력 선택지에서만 숨겨지고 기존 지출은 그대로).</p></section>
    <section class="card"><h2>${ic('box')}카테고리<span class="sub">2단계</span></h2>
      ${groups || '<p class="hint" style="margin:0 0 4px">1단계 카테고리(예: 주영, 가족, 그외)를 먼저 추가하고, 그 아래 2단계를 추가하세요</p>'}
      <form class="addrow" data-add="cat1"><input class="in" name="n" maxlength="30" placeholder="새 1단계 카테고리 (예: 주영)" aria-label="새 1단계 카테고리"><button class="btn primary" type="submit">추가</button></form>
      <p class="hint">1단계 아래에 2단계가 있으면 입력할 때 2단계까지 골라야 합니다.</p></section>
    <section class="card"><h2>${ic('copy')}템플릿<span class="sub">빠른 입력 위에 칩으로 표시</span></h2>
      ${tpls.length ? tpls.map((t, i) => `<div class="mrow"><div class="nm tinfo"><b>${esc(t.name)}</b><span>${esc(tplSummary(t))}</span></div>
        <button class="icbtn" data-act="mv" data-kind="template" data-id="${t.id}" data-v="-1" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${ic('up')}</button><button class="icbtn" data-act="mv" data-kind="template" data-id="${t.id}" data-v="1" aria-label="아래로" ${i === tpls.length - 1 ? 'disabled' : ''}>${ic('down')}</button>
        <button class="icbtn" data-act="tpl-edit" data-id="${t.id}" aria-label="${esc(t.name)} 편집">${ic('pen')}</button>${rmBtn('template', t)}</div>`).join('') : '<p class="hint" style="margin:0 0 4px">빠른 입력에서 “지금 내용으로 템플릿 만들기”를 누르거나 여기서 새로 만드세요</p>'}
      <div class="addrow"><button class="btn" data-act="tpl-new">${ic('plus')}새 템플릿</button></div></section>
    <section class="card"><h2>${ic('tag')}테마<span class="sub">여행 등 기간별 지출 묶음</span></h2>
      ${themes.length ? themes.map(t => { const l = S.filterExpenses(doc, { themeId: t.id }); return `<div class="mrow"><div class="nm tinfo"><b>${esc(t.name)}</b><span>${esc(periodTxt(t))} · ${l.length}건 · ${esc(won(S.sumOf(l)))}${t.memo ? ' · ' + esc(t.memo) : ''}</span></div>
        <button class="btn sm" data-act="theme-view" data-id="${t.id}">보기</button><button class="icbtn" data-act="theme-edit" data-id="${t.id}" aria-label="${esc(t.name)} 편집">${ic('pen')}</button>${rmBtn('theme', t)}</div>`; }).join('') : '<p class="hint" style="margin:0 0 4px">예: “포천 여행”을 10.31~11.01로 만들면 그 기간 지출을 입력할 때 자동으로 골라집니다</p>'}
      <div class="addrow"><button class="btn" data-act="theme-new">${ic('plus')}새 테마</button></div></section>
    ${tickerCardHtml()}
    <section class="card"><h2>${ic('gear')}설정</h2>
      <div class="kv"><span>Google Drive 동기화</span><span id="syncState">${syncStateHtml()}</span></div>
      <div class="setrow">${Sync.signedIn() ? '<button class="btn" data-act="sync-now">지금 동기화</button><button class="btn" data-act="sign-out">Google 로그아웃 (동기화 중지)</button>' : '<button class="btn primary" data-act="sign-in">Google 로그인 · Drive 동기화 켜기</button>'}</div>
      <p class="hint">데이터는 Drive의 <b>내 드라이브 › 10 Expense Manager › db</b>에 <code>em-data.json</code>으로 저장되고, 하루 한 번 백업(최근 14개)을 남깁니다. 바뀐 내용은 몇 초 안에, 그 밖에는 1분마다 맞춥니다.</p>
      <div class="setrow"><button class="btn" data-act="pin-change">PIN 변경</button><button class="btn" data-act="export">내보내기 (JSON)</button><button class="btn" data-act="import">가져오기 (JSON)</button><button class="btn danger" data-act="wipe">이 기기 데이터 지우기</button></div>
      <p class="ver">Expense Manager ${VERSION} · 지출 ${S.live(doc.expenses).length}건</p></section>
  </div>`;
}
function itemOf(kind, id) { return { method: methodById, category: catById, template: tplById, theme: themeById, fixed: x => S.live(doc.fixed).find(f => f.id === x) || null, ticker: x => S.live(doc.ticker).find(k => k.id === x) || null }[kind](id); }
function listOf(kind, item) {
  if (kind === 'method') return S.methodsOf(doc, { archived: true });
  if (kind === 'template') return S.templatesOf(doc);
  return item.parent_id ? S.cat2sOf(doc, item.parent_id, { archived: true }) : S.cat1sOf(doc, { archived: true });
}
function refreshManage(focusSel) {
  renderView();
  if (focusSel) $(focusSel)?.focus();
}
function bindManageEvents() {
  const v = $('#view');
  v.addEventListener('submit', e => {
    const f = e.target.closest('form[data-add]');
    if (!f) return;
    e.preventDefault();
    const name = f.n.value.trim();
    if (!name) { f.n.focus(); return; }
    const kind = f.dataset.add;
    if (kind === 'ticker') { if (S.createTicker(doc, name)) { persist(); refreshManage('form[data-add="ticker"] input'); renderTicker(); } return; }
    const r = kind === 'method' ? S.addMethod(doc, name) : S.addCategory(doc, name, kind === 'cat2' ? f.dataset.parent : null);
    if (r.error) { toast(r.error); f.n.focus(); return; }
    persist();
    refreshManage(kind === 'cat2' ? `form[data-add="cat2"][data-parent="${f.dataset.parent}"] input` : kind === 'cat1' ? `form[data-add="cat2"][data-parent="${r.item.id}"] input` : 'form[data-add="method"] input');
  });
  v.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'hText') { ui.h.text = t.value; refreshHistory(); return; }
    if (t.dataset?.edit !== 'target') return;
    const r = S.formatAmountInput(t.value, t.selectionStart ?? t.value.length);
    if (r.text !== t.value) { t.value = r.text; try { t.setSelectionRange(r.caret, r.caret); } catch { /* 무시 */ } }
  });
  v.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset?.h) { ui.h[t.dataset.h] = t.value; refreshHistory(t.dataset.h === 'themeId'); return; }
    if (t.id === 'stPeriod') { ui.st.period = t.value; renderView(); return; }
    if (t.id === 'tkPerfDay') { S.setTickerSettings(doc, { perf_day: Number(t.value) }); persist(); renderTicker(); return; }
    if (t.dataset?.kid) {
      const k = itemOf('ticker', t.dataset.kid); if (!k) return;
      const f = t.dataset.kf, v = t.value.trim();
      if (f === 'text') { if (!v) { t.value = k.text; return; } k.text = v.slice(0, 120); } else k[f] = v || null;
      k.updated_at = S.nowIso(); persist(); renderTicker();
      const st = t.closest('.tkrow')?.querySelector('.tkst'); if (st) { const [lbl, cls] = TK_STATE[S.tickerState(k)]; st.textContent = lbl; st.className = `tkst ${cls}`; }
      return;
    }
    if (!t.dataset?.edit) return;
    if (t.dataset.edit === 'target') {
      const m = methodById(t.dataset.id);
      if (!m) return;
      const n = S.parseWon(t.value);
      if ((m.perf_target || null) !== (n || null)) { m.perf_target = n || null; m.updated_at = S.nowIso(); persist(); toast(n ? `${m.name} 월 실적 목표 ${won(n)}` : `${m.name} 실적 목표 없음`); }
      return;
    }
    const kind = t.dataset.kind, item = itemOf(kind, t.dataset.id);
    if (!item) return;
    if (t.value.trim() === item.name) return;
    const r = S.renameItem(doc, kind, item, t.value);
    if (r.error) { toast(r.error); t.value = item.name; return; }
    persist();
  });
}

// =====================================================================
// PIN 변경 / 내보내기 / 가져오기
// =====================================================================
const pinInput = (id, label) => `<div><label class="fl" for="${id}">${label}</label><input class="in" id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" style="letter-spacing:.4em"></div>`;
function dlgPin() {
  const d = openDialog('PIN 변경', `<form id="pinf" autocomplete="off" style="display:flex;flex-direction:column;gap:12px">${pinInput('p0', '지금 PIN')}${pinInput('p1', '새 PIN (숫자 4자리)')}${pinInput('p2', '새 PIN 확인')}<p class="note" id="pinErr" hidden></p></form>`,
    `<button class="btn" data-dlg="close">취소</button><button class="btn primary" id="pinOk">변경</button>`);
  const err = m => { const e = $('#pinErr'); e.textContent = m; e.hidden = false; };
  const go = async () => {
    const [a, b, c] = ['#p0', '#p1', '#p2'].map(s => $(s).value);
    if (!(await S.checkPin(S.setting(doc, 'pin'), a))) return err('지금 PIN이 맞지 않습니다');
    if (!/^\d{4}$/.test(b)) return err('새 PIN은 숫자 4자리로 입력하세요');
    if (b !== c) return err('새 PIN 두 칸이 다릅니다');
    S.putSetting(doc, 'pin', await S.makePin(b));
    await persist();
    closeDialog();
    toast('PIN을 바꿨습니다');
  };
  $('#pinOk').addEventListener('click', go);
  $('#pinf').addEventListener('submit', e => { e.preventDefault(); go(); });
  $('#p0').focus();
  return d;
}
function exportJson() {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `expense-manager-${S.todayKst().replace(/-/g, '')}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('내보내기 파일을 저장했습니다');
}
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast('JSON 파일을 읽지 못했습니다'); return; }
  const bad = S.checkImport(obj);
  if (bad) { toast(bad); return; }
  const n = S.live(obj.expenses).length;
  if (!(await confirmDialog('가져오기', `이 기기의 데이터를 파일 내용(지출 ${n}건)으로 <b>바꿉니다</b>. PIN도 파일에 든 PIN으로 바뀝니다. 계속할까요?`, '바꾸기', true))) return;
  if (!S.setting(obj, 'pin')) obj.settings = [...(obj.settings || []), S.setting(doc, 'pin')].filter(Boolean);
  doc = S.normalizeDoc(obj);
  await persist();
  newDraft();
  renderAll();
  toast(`가져왔습니다 (지출 ${n}건)`);
});

// =====================================================================
// 이벤트
// =====================================================================
document.addEventListener('click', async e => {
  if (!unlocked) return;
  // 내역의 실적 제외 체크: 행 수정 창이 열리지 않게 먼저 처리
  const pc = e.target.closest('.pchk');
  if (pc) { togglePerf(pc.dataset.pid, pc.checked); return; }
  if (e.target.closest('.pl')) return;
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act, id = b.dataset.id;
  const d = ui.draft;
  switch (act) {
    case 'view':
      if (ui.view === b.dataset.v) return;
      if (ui.view === 'input') readForm();
      ui.view = b.dataset.v;
      $('#view').scrollTop = 0;
      renderAll();
      if (ui.view === 'input' && wideMq.matches) $('#fAmt')?.focus();
      return;
    case 'lock': lock(); return;
    case 'day': readForm(); d.date = S.addDays(d.date, +b.dataset.v); autoTheme(); rerenderInput(); return;
    case 'today': readForm(); d.date = S.todayKst(); autoTheme(); rerenderInput(); return;
    case 'pick-theme': readForm(); d.theme_id = d.theme_id === id ? null : id; ui.touched.add('theme'); rerenderInput(); return;
    case 'use-tpl': { const t = tplById(id); if (t) applyTemplate(t); return; }
    case 'save-tpl': saveAsTemplate(); return;
    case 'pick-method': readForm(); d.method_id = d.method_id === id && !ui.auto.has('method') ? null : id; ui.touched.add('method'); ui.auto.delete('method'); if (ui.err?.field === 'method') ui.err = null; rerenderInput(); return;
    case 'pick-cat1': readForm(); if (d.cat1_id !== id) { d.cat1_id = id; d.cat2_id = null; } ui.touched.add('cat'); ui.auto.delete('cat'); if (ui.err?.field === 'cat1') ui.err = null; rerenderInput(); return;
    case 'pick-cat2': readForm(); d.cat2_id = d.cat2_id === id && !ui.auto.has('cat') ? null : id; ui.touched.add('cat'); ui.auto.delete('cat'); if (ui.err?.field === 'cat2') ui.err = null; rerenderInput(); return;
    case 'use-amount': readForm(); d.amountText = S.fmtWon(+b.dataset.v); rerenderInput(); return;
    case 'add-method': quickAdd('method'); return;
    case 'add-cat1': quickAdd('cat1'); return;
    case 'add-cat2': quickAdd('cat2'); return;
    case 'save-more': saveDraft(true); return;
    case 'edit-exp': editExpense(id); return;
    case 'cancel-edit': if (ui.formIn === 'dialog') endDialogEdit(); else { newDraft(); renderAll(); } return;
    case 'del-exp': deleteEditing(); return;
    case 'mv': {
      const kind = b.dataset.kind, item = itemOf(kind, id);
      if (item && S.moveItem(listOf(kind, item), item, +b.dataset.v)) { persist(); refreshManage(`[data-act="mv"][data-id="${id}"][data-v="${b.dataset.v}"]`); }
      return;
    }
    case 'arch': {
      const kind = b.dataset.kind, item = itemOf(kind, id);
      if (!item) return;
      item.archived = !item.archived; item.updated_at = S.nowIso();
      persist(); refreshManage();
      toast(`${item.name} ${item.archived ? '보관 (입력 선택지에서 숨김)' : '복원'}`);
      return;
    }
    case 'rm': {
      const kind = b.dataset.kind, item = itemOf(kind, id), k = `${kind}:${id}`;
      if (!item) return;
      const soft = kind === 'template' || kind === 'theme' || kind === 'fixed' || kind === 'ticker';
      if (!soft && S.usageCount(doc, kind, id)) { toast('지출에서 쓰고 있어 지울 수 없습니다. 대신 보관하세요'); return; }
      if (!armed.has(k)) { armed.add(k); refreshManage(); setTimeout(() => { if (armed.delete(k) && (ui.view === 'manage' || ui.view === 'fixed')) refreshManage(); }, 3000); return; }
      armed.delete(k);
      if (kind === 'template') { S.deleteSoft(item); persist(); refreshManage(); toast(`템플릿 “${item.name}” 삭제`); return; }
      if (kind === 'ticker') { S.deleteSoft(item); persist(); refreshManage(); renderTicker(); toast('티커 문장을 지웠습니다'); return; }
      if (kind === 'fixed') { const n = S.deleteFixed(doc, item); if (d.fixed_id === id) d.fixed_id = null; persist(); renderAll(); toast(`고정 지출 “${item.name}” 삭제${n ? ` (지출 ${n}건과 연결 해제)` : ''}`); return; }
      if (kind === 'theme') {
        const n = S.deleteTheme(doc, item);
        if (d.theme_id === id) d.theme_id = null;
        if (ui.h.themeId === id) ui.h.themeId = '';
        persist(); refreshManage(); toast(`테마 “${item.name}” 삭제${n ? ` (지출 ${n}건에서 해제)` : ''}`); return;
      }
      const r = S.deleteItem(doc, kind, item);
      if (r.error) { toast(r.error); return; }
      if (d.method_id === id) d.method_id = null;
      if (d.cat1_id === id || catById(d.cat1_id) === null) { d.cat1_id = null; d.cat2_id = null; }
      if (d.cat2_id === id) d.cat2_id = null;
      persist(); refreshManage();
      toast(`${item.name} 삭제`);
      return;
    }
    case 'h-month': ui.h.ym = S.ymAdd(ui.h.ym, +b.dataset.v); refreshHistory(true); return;
    case 'h-this-month': ui.h.ym = S.todayKst().slice(0, 7); refreshHistory(true); return;
    case 'h-sort': ui.h.sort = ui.h.sort === 'desc' ? 'asc' : 'desc'; refreshHistory(); return;
    case 'h-theme-clear': { const th = themeById(ui.h.themeId); if (th) ui.h.ym = th.start.slice(0, 7); ui.h.themeId = ''; refreshHistory(true); return; }
    case 'h-reset': Object.assign(ui.h, { method: '', cat: '', text: '', themeId: ui.h.themeId === 'none' ? '' : ui.h.themeId }); refreshHistory(true); return;
    case 'h-edit': editInDialog(id); return;
    case 'tpl-new': dlgTemplate(); return;
    case 'tpl-edit': { const t = tplById(id); if (t) dlgTemplate(t); return; }
    case 'theme-new': dlgTheme(); return;
    case 'theme-edit': { const t = themeById(id); if (t) dlgTheme(t); return; }
    case 'theme-view': openThemeInHistory(id); return;
    // 통계
    case 'st-dim': ui.st.dim = b.dataset.v; ui.st.series = null; ui.st.open.clear(); renderView(); return;
    case 'st-open': { const o = ui.st.open; if (o.has(id)) o.delete(id); else o.add(id); renderView(); return; }
    case 'st-series': ui.st.series = id || null; renderView(); return;
    case 'st-cell': statCellToHistory(b.dataset.row, b.dataset.ym); return;
    case 'perf-month': ui.st.perfYm = S.ymAdd(ui.st.perfYm, +b.dataset.v); renderView(); return;
    // 고정 지출
    case 'fx-month': ui.fx.ym = S.ymAdd(ui.fx.ym, +b.dataset.v); renderView(); return;
    case 'fx-this': ui.fx.ym = S.todayKst().slice(0, 7); renderView(); return;
    case 'fx-new': dlgFixed(); return;
    case 'fx-edit': { const f = S.live(doc.fixed).find(x => x.id === id); if (f) dlgFixed(f); return; }
    case 'fx-enter': { const f = S.live(doc.fixed).find(x => x.id === id); if (f) enterFixed(f); return; }
    case 'fx-skip': { const f = S.live(doc.fixed).find(x => x.id === id); if (!f) return; S.toggleSkip(f, ui.fx.ym); persist(); renderView(); renderTicker(); toast((f.skips || []).includes(ui.fx.ym) ? `${f.name}: ${Number(ui.fx.ym.slice(5))}월은 건너뜀` : `${f.name}: 건너뛰기 취소`); return; }
    case 'fx-active': { const f = S.live(doc.fixed).find(x => x.id === id); if (!f) return; f.active = f.active === false; f.updated_at = S.nowIso(); persist(); renderView(); renderTicker(); return; }
    case 'fx-unlink': readForm(); d.fixed_id = null; rerenderInput(); return;
    // 티커
    case 'tk-color': S.setTickerSettings(doc, { color: b.dataset.v }); persist(); refreshManage(); renderTicker(); return;
    case 'tk-pos': S.setTickerSettings(doc, { position: b.dataset.v }); persist(); refreshManage(); renderTicker(); return;
    case 'tk-auto': { const k = b.dataset.v; S.setTickerSettings(doc, { [k]: !S.tickerSettings(doc)[k] }); persist(); refreshManage(); renderTicker(); return; }
    case 'tk-toggle': { const k = itemOf('ticker', id); if (!k) return; k.enabled = !k.enabled; k.updated_at = S.nowIso(); persist(); refreshManage(); renderTicker(); return; }
    case 'tk-level': { const k = itemOf('ticker', id); if (!k) return; k.level = b.dataset.v; k.updated_at = S.nowIso(); persist(); refreshManage(); renderTicker(); return; }
    case 'sync-click': {
      const st = Sync.getState();
      if (st.status === 'off') { if (ui.view !== 'manage') { if (ui.view === 'input' && ui.formIn === 'page') readForm(); ui.view = 'manage'; renderAll(); } $('#syncState')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); toast('여기서 Google 로그인 후 Drive 동기화를 켤 수 있습니다'); return; }
      if (st.status === 'needs-auth') { Sync.signIn(); return; }
      if (st.status === 'error' && st.detail) toast(st.detail);
      Sync.syncNow(); return;
    }
    case 'sign-in': await Sync.signIn(); renderView(); return;
    case 'sign-out': Sync.signOut(); renderView(); toast('동기화를 껐습니다. 이 기기의 데이터는 그대로 남습니다'); return;
    case 'sync-now': Sync.syncNow(); return;
    case 'wipe': {
      if (!(await confirmDialog('이 기기 데이터 지우기', `이 브라우저에 저장된 Expense Manager 데이터(지출 ${S.live(doc.expenses).length}건, 설정, PIN)를 지우고 처음 화면으로 돌아갑니다.${Sync.signedIn() ? ' Drive의 데이터는 지우지 않으므로 “Drive에 있는 데이터 불러오기”로 다시 받을 수 있습니다.' : ' <b>Drive 동기화를 켜지 않아 되살릴 수 없습니다.</b>'}`, '지우기', true))) return;
      await saving;
      await S.clearAll();
      Sync.forgetDevice();
      location.reload();
      return;
    }
    case 'pin-change': dlgPin(); return;
    case 'export': exportJson(); return;
    case 'import': $('#importFile').click(); return;
  }
});
bindManageEvents();
// 내역 행 키보드 (좁은 화면 목록)
$('#view').addEventListener('keydown', e => {
  const r = e.target.closest?.('.hrow');
  if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); editInDialog(r.dataset.id); }
});
// 화면 폭이 바뀌면 (폴드 접기·펼치기) 표/목록 모양을 다시 고른다
wideMq.addEventListener('change', () => { if (!unlocked) return; if (ui.view === 'input' && ui.formIn === 'page') readForm(); renderView(); });

// =====================================================================
// 시작
// =====================================================================
async function boot() {
  doc = await S.load();
  S.purgeOld(doc);
  if (!S.storageOk) toast('브라우저 저장소를 쓸 수 없어 이 탭을 닫으면 내용이 사라집니다');
  Sync.init({ getDoc: () => doc, applyMerged, onStatus: renderSaveLabel });
  if (!S.setting(doc, 'pin')) setupIntro('', false);
  else lockScreen();
}
boot();
