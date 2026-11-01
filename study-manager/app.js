// Study Manager: 문장 등록·여러 줄 붙여넣기·목록·과목/단원/태그 분류·설정 (M1) / 학습 범위·조회 모드·문제 모드·학습 기록 (M2) / Google Drive 동기화 (M3)
import * as S from './store.js';
import * as Sync from './sync.js';

export const VERSION = 'M3';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = (k, v) => {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch { /* 무시 */ }
  return null;
};

// ---------- 아이콘 ----------
const P = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M4 6h10M4 12h7M4 18h12"/><path d="M17 10l4 2.5-4 2.5z"/>',
  quiz: '<rect x="3.5" y="7" width="17" height="10" rx="2.5"/><path d="M8 12h8" stroke-dasharray="2 2"/>',
  edit: '<path d="M12 20h8M4 20l1-4L15.5 5.5a2.1 2.1 0 013 3L8 19z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="3"/>',
  gear: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  up: '<path d="M6 14l6-6 6 6"/>',
  down: '<path d="M6 10l6 6 6-6"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
  box: '<path d="M4 7h16v3H4zM6 10v9h12v-9M10 14h4"/>',
  unbox: '<path d="M4 7h16v3H4zM6 10v9h12v-9M12 18v-5M9.5 15.5L12 13l2.5 2.5"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
  note: '<path d="M6 4h9l4 4v12H6z"/><path d="M14 4v5h5M9 13h7M9 16.5h5"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.6"/>',
  folder: '<path d="M3.5 7a2 2 0 012-2h4l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2h-13a2 2 0 01-2-2z"/>',
  paste: '<rect x="6" y="5" width="12" height="16" rx="2"/><path d="M9 5V3.5h6V5M9 11h6M9 15h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chev: '<path d="M8 10l4 4 4-4"/>',
  brace: '<path d="M9 4c-2 0-2.5 1-2.5 3v2c0 1.5-.8 2.5-2 3 1.2.5 2 1.5 2 3v2c0 2 .5 3 2.5 3M15 4c2 0 2.5 1 2.5 3v2c0 1.5.8 2.5 2 3-1.2.5-2 1.5-2 3v2c0 2-.5 3-2.5 3"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  play1: '<path d="M8 5.5v13l10.5-6.5z"/>',
  left: '<path d="M14 6l-6 6 6 6"/>',
  right: '<path d="M10 6l6 6-6 6"/>',
  sel: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name]}</svg>`;

// ---------- 상태 ----------
let doc = null;
const VIEWS = {
  review: { label: '조회', icon: 'play' },
  quiz: { label: '문제', icon: 'quiz' },
  register: { label: '등록', icon: 'edit' },
  list: { label: '목록', icon: 'list' },
  settings: { label: '설정', icon: 'gear' },
};
const newForm = (keep = null) => ({ text: '', note: '', unit_id: keep?.unit_id ?? null, tag_ids: keep ? [...keep.tag_ids] : [], starred: false, noteOpen: false, classOpen: !!keep?.classOpen, editId: null, err: '', openSubj: keep?.openSubj ?? null });
const ui = {
  view: 'register', regSub: 'form', listSub: 'list',
  forms: { page: newForm(), dlg: null, paste: { ...newForm(), classOpen: true } },
  recent: [],
  paste: { raw: '', over: new Map() },
  list: { q: '', scope: { kind: 'all' }, openSubj: null, selecting: false, sel: new Set(), limit: 100 },
  delArmed: null,
};
const armed = new Set(); // 분류 관리의 삭제 버튼: 한 번 누르면 무장, 한 번 더 누르면 삭제

// ---------- 저장 ----------
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
  el.title = st.detail || (st.status === 'off' ? '설정에서 Google Drive 동기화를 켤 수 있습니다' : '누르면 지금 동기화');
  const s2 = $('#syncState'); if (s2) s2.innerHTML = syncStateHtml();
  const b2 = $('#syncBtns'); if (b2) b2.innerHTML = syncBtnsHtml();
}
const syncStateHtml = () => { const st = Sync.getState(); return `${SYNC_TEXT[st.status]}${st.lastSync ? ` · 마지막 ${esc(st.lastSync)}` : ''}${st.detail && st.status !== 'ok' ? `<br><span class="note">${esc(st.detail)}</span>` : ''}`; };
const syncBtnsHtml = () => (Sync.signedIn()
  ? `<button class="btn" data-act="sync-now">지금 동기화</button>${Sync.getState().status === 'needs-auth' ? '<button class="btn primary" data-act="sync-login">Google 로그인</button>' : ''}<button class="btn" data-act="sync-out">동기화 끄기</button>`
  : '<button class="btn primary" data-act="sync-login">Google 로그인하고 동기화 켜기</button>');
// 다른 기기에서 바뀐 내용이 합쳐졌을 때: 저장하고, 보고 있는 화면만 다시 그린다
// (조회·문제 진행 중이면 화면을 건드리지 않고, 입력 중인 문장·커서는 유지)
async function applyMerged(m) {
  doc = S.normalizeDoc(m);
  await S.save(doc);
  if ($('#app').hidden) return;
  if (dlg().open) return;
  if ((ui.view === 'review' && RV.on) || (ui.view === 'quiz' && QZ.on)) return;
  const a = document.activeElement, id = a?.id, sel = id && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null;
  if (ui.view === 'register' && ui.regSub === 'form') readTextAreas('page');
  if (ui.view === 'list' && ui.listSub === 'list' && $('#lres')) { refreshList(); return; }
  const sc = $('#view').scrollTop;
  renderView();
  $('#view').scrollTop = sc;
  if (id) { const el = document.getElementById(id); if (el && el !== document.activeElement) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch { /* 무시 */ } } }
}

// ---------- 토스트 / 다이얼로그 ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}
const dlg = () => $('#dlg');
let onDlgClose = null;
let closeWaiters = [];
// 닫기는 비동기(close 이벤트)라서, 닫힌 뒤 할 일은 돌려준 Promise로 기다린다
function closeDialog() { return new Promise(res => { if (!dlg().open) return res(); closeWaiters.push(res); dlg().close(); }); }
function openDialog(title, body, foot = '', cls = '') {
  const d = dlg();
  d.className = cls;
  d.innerHTML = `<div class="dlg-h"><h2>${esc(title)}</h2><button class="icbtn" data-dlg="close" aria-label="닫기">${ic('x')}</button></div>
    <div class="dlg-b">${body}</div>${foot ? `<div class="dlg-f">${foot}</div>` : ''}`;
  if (!d.open) d.showModal();
  return d;
}
dlg().addEventListener('click', e => { if (e.target === dlg() || e.target.closest('[data-dlg="close"]')) closeDialog(); });
dlg().addEventListener('close', () => {
  dlg().innerHTML = '';
  ui.forms.dlg = null;
  const f = onDlgClose; onDlgClose = null;
  if (f) f();
  const w = closeWaiters; closeWaiters = [];
  w.forEach(r => r());
});
function confirmDialog(title, msg, okLabel = '확인', danger = false) {
  return new Promise(resolve => {
    const d = openDialog(title, `<p>${msg}</p>`, `<button class="btn" data-r="0">취소</button><button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${esc(okLabel)}</button>`);
    let v = false;
    const on = e => { const b = e.target.closest('[data-r]'); if (b) { v = b.dataset.r === '1'; closeDialog(); } };
    d.addEventListener('click', on);
    onDlgClose = () => { d.removeEventListener('click', on); resolve(v); };
  });
}
function promptDialog(title, label, { value = '', okLabel = '추가', validate = null, placeholder = '' } = {}) {
  return new Promise(resolve => {
    const d = openDialog(title, `<form id="pf" autocomplete="off"><label class="fl" for="pIn">${esc(label)}</label><input class="in" id="pIn" maxlength="40" value="${esc(value)}" placeholder="${esc(placeholder)}"><p class="note" id="pErr" hidden style="margin-top:6px"></p></form>`,
      `<button class="btn" data-r="0">취소</button><button class="btn primary" data-r="1">${esc(okLabel)}</button>`);
    let v = null;
    const submit = () => {
      const val = $('#pIn').value.trim();
      if (!val) { $('#pIn').focus(); return; }
      const err = validate ? validate(val) : null;
      if (err) { const e = $('#pErr'); e.textContent = err; e.hidden = false; $('#pIn').classList.add('err'); $('#pIn').focus(); return; }
      v = val; closeDialog();
    };
    const on = e => { const b = e.target.closest('[data-r]'); if (b) (b.dataset.r === '1' ? submit() : closeDialog()); };
    d.addEventListener('click', on);
    $('#pf').addEventListener('submit', e => { e.preventDefault(); submit(); });
    onDlgClose = () => { d.removeEventListener('click', on); resolve(v); };
    $('#pIn').focus();
  });
}

// =====================================================================
// 공통 그리기
// =====================================================================
// 문장: 빈칸 부분을 굵게
function sentHtml(text) {
  return S.parse(text).map(g => (g.t === 'text' ? esc(g.s) : `<b class="bk">${esc(g.ans)}</b>${g.hint ? `<small class="hn">${esc(g.hint)}</small>` : ''}`)).join('');
}
function unitLabel(id) {
  const p = S.unitPath(doc, id);
  return p.map(u => esc(u.name)).join(' › ');
}
function metaHtml(s) {
  const parts = [];
  if (s.unit_id) parts.push(`<span class="mu">${ic('folder')}${unitLabel(s.unit_id)}</span>`);
  else parts.push('<span class="mu none">미분류</span>');
  for (const id of s.tag_ids) { const t = S.tagById(doc, id); if (t) parts.push(`<span class="mt">#${esc(t.name)}</span>`); }
  return parts.join('');
}

function renderAll() { renderNav(); renderView(); renderSaveLabel(); }
function renderNav() {
  $('#tabs').innerHTML = Object.entries(VIEWS).map(([k, v]) => `<button class="tab" data-act="nav" data-v="${k}"${ui.view === k ? ' aria-current="page"' : ''}>${ic(v.icon)}<span>${v.label}</span></button>`).join('');
}
function setTitle(t) { $('#title').textContent = t; }
function renderView() {
  const v = $('#view');
  v.dataset.view = ui.view;
  if (ui.view === 'register') { if (ui.regSub === 'paste') { setTitle('여러 줄 붙여넣기'); v.innerHTML = pasteHtml(); } else { setTitle('등록'); v.innerHTML = registerHtml(); autosizeAll(); } }
  else if (ui.view === 'list') { if (ui.listSub === 'manage') { setTitle('분류 관리'); v.innerHTML = manageHtml(); } else { setTitle('목록'); v.innerHTML = listHtml(); } }
  else if (ui.view === 'settings') { setTitle('설정'); v.innerHTML = settingsHtml(); }
  else if (ui.view === 'review') { v.innerHTML = reviewView(); if (RV.on && RV.cur) rvShow(RV.cur); }
  else if (ui.view === 'quiz') v.innerHTML = quizView();
  renderSelBar();
}
function go(view) {
  if (view === ui.view && view === 'register' && ui.regSub === 'paste') ui.regSub = 'form';
  if (view === ui.view && view === 'list' && ui.listSub === 'manage') ui.listSub = 'list';
  if (view !== 'list') { ui.list.selecting = false; ui.list.sel.clear(); }
  if (view !== 'review' && RV.on && !RV.paused) { RV.paused = true; cancelAnimationFrame(RV.raf); keepAwake(false); }
  if (view === ui.view && view === 'review' && RV.on) { rvStop(); return; }
  if (view === ui.view && view === 'quiz' && QZ.on) { QZ.on = false; }
  ui.view = view;
  ls('sm-tab', view);
  renderAll();
  $('#view').scrollTop = 0;
}

// =====================================================================
// 문장 입력 폼 (등록 화면 'page', 수정 창 'dlg')
// =====================================================================
function wordChipsHtml(fk) {
  const st = ui.forms[fk];
  const words = S.wordsOf(st.text);
  if (!words.length) return '<p class="wempty">문장을 입력하면 여기에 단어가 나옵니다</p>';
  return words.map((w, i) => {
    let inner = '';
    let run = null, buf = '';
    const flush = () => { if (buf) inner += run ? `<b>${esc(buf)}</b>` : esc(buf); buf = ''; };
    [...w.text].forEach((ch, k) => { const on = w.m[k]; if (on !== run) { flush(); run = on; } buf += ch; });
    flush();
    return `<button type="button" class="wc ${w.state}" data-act="word" data-f="${fk}" data-i="${i}" aria-pressed="${w.state !== 'none'}">${inner}</button>`;
  }).join('');
}
function blankCountHtml(fk) {
  const n = S.blanksOf(ui.forms[fk].text).length;
  return n ? `빈칸 ${n}개` : '빈칸 없음';
}
function classSummary(st) {
  const parts = [];
  parts.push(st.unit_id ? unitLabel(st.unit_id) : '미분류');
  const tags = st.tag_ids.map(id => S.tagById(doc, id)).filter(Boolean);
  if (tags.length) parts.push(tags.map(t => '#' + esc(t.name)).join(' '));
  return parts.join(' · ');
}
// 과목·단원·태그 고르기 (fk: page / dlg / paste)
function classHtml(fk) {
  const st = ui.forms[fk];
  const path = S.unitPath(doc, st.unit_id);
  const subj = path[0] || (st.openSubj ? S.unitById(doc, st.openSubj) : null);
  const subjects = S.subjectsOf(doc);
  if (subj && subj.archived && !subjects.includes(subj)) subjects.push(subj);
  let h = `<div class="crow"><span class="cl">과목</span><div class="chips">
    <button type="button" class="chip" data-act="pick-subj" data-f="${fk}" data-id="" aria-pressed="${!st.unit_id && !st.openSubj}">미분류</button>
    ${subjects.map(u => `<button type="button" class="chip" data-act="pick-subj" data-f="${fk}" data-id="${u.id}" aria-pressed="${subj?.id === u.id}">${esc(u.name)}</button>`).join('')}
    <button type="button" class="chip add" data-act="add-subj" data-f="${fk}" aria-label="과목 추가">${ic('plus')}과목</button></div></div>`;
  if (subj) {
    const chs = S.chaptersOf(doc, subj.id);
    const cur = path[1];
    if (cur && !chs.includes(cur)) chs.push(cur);
    h += `<div class="crow"><span class="cl">단원</span><div class="chips sub">
      <button type="button" class="chip" data-act="pick-chap" data-f="${fk}" data-id="" aria-pressed="${st.unit_id === subj.id}">단원 없음</button>
      ${chs.map(u => `<button type="button" class="chip" data-act="pick-chap" data-f="${fk}" data-id="${u.id}" aria-pressed="${st.unit_id === u.id}">${esc(u.name)}</button>`).join('')}
      <button type="button" class="chip add" data-act="add-chap" data-f="${fk}" aria-label="단원 추가">${ic('plus')}단원</button></div></div>`;
  }
  h += `<div class="crow"><span class="cl">태그</span><div class="chips">
    ${S.tagsOf(doc).map(t => `<button type="button" class="chip tg" data-act="tog-tag" data-f="${fk}" data-id="${t.id}" aria-pressed="${st.tag_ids.includes(t.id)}">#${esc(t.name)}</button>`).join('')}
    <button type="button" class="chip add" data-act="add-tag" data-f="${fk}" aria-label="태그 추가">${ic('plus')}태그</button></div></div>`;
  return h;
}
function formHtml(fk) {
  const st = ui.forms[fk];
  const id = s => `${s}-${fk}`;
  return `<div class="sform" data-form="${fk}">
    <div class="fhead"><label class="fl" for="${id('text')}">문장</label><span class="bc" id="${id('bc')}">${blankCountHtml(fk)}</span></div>
    <textarea class="in ta big" id="${id('text')}" data-fin="text" data-f="${fk}" rows="3" maxlength="${S.MAX_TEXT}" placeholder="외울 문장을 입력하세요" enterkeyhint="done">${esc(st.text)}</textarea>
    <div class="tbar">
      <button type="button" class="mini" data-act="wrap" data-f="${fk}" title="고른 글자를 빈칸으로">${ic('brace')}고른 글자 빈칸</button>
      <span class="sp"></span>
      <button type="button" class="mini ghost" data-act="help-blank">빈칸 표기법</button>
    </div>
    <div class="wchips" id="${id('w')}">${wordChipsHtml(fk)}</div>
    <p class="hint">단어를 누르면 빈칸 · 한 번: 조사 빼고 · 두 번: 조사 포함 · 세 번: 해제</p>
    ${st.err ? `<p class="note" role="alert">${esc(st.err)}</p>` : ''}
    <div class="fold${st.noteOpen ? ' open' : ''}">
      <button type="button" class="foldh" data-act="fold" data-k="noteOpen" data-f="${fk}" aria-expanded="${st.noteOpen}">${ic('note')}<span>보충설명</span><em>${st.note.trim() ? esc(st.note.trim().split('\n')[0]) : '선택'}</em>${ic('chev', 'cv')}</button>
      ${st.noteOpen ? `<div class="foldb"><textarea class="in ta" id="${id('note')}" data-fin="note" data-f="${fk}" rows="3" maxlength="${S.MAX_NOTE}" placeholder="답을 확인한 뒤 볼 설명">${esc(st.note)}</textarea></div>` : ''}
    </div>
    <div class="fold${st.classOpen ? ' open' : ''}">
      <button type="button" class="foldh" data-act="fold" data-k="classOpen" data-f="${fk}" aria-expanded="${st.classOpen}">${ic('folder')}<span>분류</span><em>${classSummary(st)}</em>${ic('chev', 'cv')}</button>
      ${st.classOpen ? `<div class="foldb" id="${id('class')}">${classHtml(fk)}</div>` : ''}
    </div>
    ${fk === 'dlg' ? `<label class="ck"><input type="checkbox" data-fin="starred" data-f="${fk}"${st.starred ? ' checked' : ''}>${ic('star')} 즐겨찾기</label>` : ''}
  </div>`;
}
// 문장 칸을 고치면 단어 칩과 빈칸 수만 다시 그린다 (입력 중인 커서 유지)
function refreshChips(fk) {
  const w = document.getElementById(`w-${fk}`); if (w) w.innerHTML = wordChipsHtml(fk);
  const b = document.getElementById(`bc-${fk}`); if (b) b.textContent = blankCountHtml(fk);
}
function refreshForm(fk, focusSel) {
  const host = fk === 'page' ? $('#pageForm') : fk === 'dlg' ? $('#dlgForm') : null;
  if (fk === 'paste') { const c = $('#class-paste'); if (c) c.innerHTML = classHtml('paste'); return; }
  if (!host) return;
  const sc = $('#view').scrollTop;
  host.innerHTML = formHtml(fk);
  autosizeAll();
  $('#view').scrollTop = sc;
  if (focusSel) { const el = host.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
}
function autosize(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight + 2, 320) + 'px'; }
function autosizeAll() { document.querySelectorAll('textarea.ta').forEach(autosize); }

// ---------- 등록 화면 ----------
function registerHtml() {
  const recent = ui.recent.map(id => S.sentenceById(doc, id)).filter(Boolean).slice(0, 5);
  const total = S.live(doc.sentences).length;
  return `<div class="wrap">
    <div class="card" id="pageForm">${formHtml('page')}</div>
    <div class="factions">
      <button class="btn" data-act="to-paste">${ic('paste')}여러 줄 붙여넣기</button>
      <button class="btn primary" data-act="save-page" id="savePage">${ic('check')}저장</button>
    </div>
    <p class="ftip">저장하면 문장과 보충설명이 비워지고 바로 다음 문장을 입력할 수 있습니다</p>
    ${recent.length ? `<div class="card"><h2>방금 등록한 문장 <span class="sub">전체 ${total}개</span></h2><div class="slist">${recent.map(rowHtml).join('')}</div></div>` : ''}
  </div>`;
}
function readTextAreas(fk) {
  const st = ui.forms[fk];
  const t = document.getElementById(`text-${fk}`); if (t) st.text = t.value;
  const n = document.getElementById(`note-${fk}`); if (n) st.note = n.value;
}
async function saveForm(fk) {
  readTextAreas(fk);
  const st = ui.forms[fk];
  if (!S.plainOf(st.text).trim()) { st.err = '문장을 입력하세요'; refreshForm(fk, `#text-${fk}`); return false; }
  const dup = S.findDuplicate(doc, st.text, st.editId);
  if (dup) {
    const keep = { ...st };
    const ok = await confirmDialog('같은 문장이 있습니다', `<span class="qt">${sentHtml(dup.text)}</span><br><br>그래도 저장할까요?`, '저장');
    if (fk === 'dlg') { if (!ok) { reopenEdit(keep); return false; } ui.forms.dlg = keep; }
    else if (!ok) return false;
  }
  const r = S.saveSentence(doc, st, st.editId);
  if (r.error) { st.err = r.error; refreshForm(fk); return false; }
  st.err = '';
  await persist();
  if (fk === 'page') {
    ui.recent = [r.item.id, ...ui.recent.filter(x => x !== r.item.id)].slice(0, 20);
    const keep = S.prefs(doc).keepClass ? st : null;
    ui.forms.page = newForm(keep ? { ...keep } : { classOpen: st.classOpen, unit_id: null, tag_ids: [], openSubj: null });
    renderView();
    const t = $('#text-page');
    if (t) t.focus({ preventScroll: true });
    toast('등록했습니다');
  }
  return true;
}

// ---------- 수정 창 ----------
function openEdit(id) {
  const s = S.sentenceById(doc, id);
  if (!s) return;
  reopenEdit({ ...newForm(), text: s.text, note: s.note || '', unit_id: s.unit_id, tag_ids: [...s.tag_ids], starred: !!s.starred, noteOpen: !!s.note, classOpen: true, editId: s.id });
}
function reopenEdit(st) {
  const fromPage = ui.view === 'register' && ui.regSub === 'form';
  if (fromPage) readTextAreas('page');
  ui.forms.dlg = st;
  openDialog('문장 수정', `<div id="dlgForm">${formHtml('dlg')}</div>`,
    `<button class="btn danger" data-act="del-edit" id="delEdit">${ic('trash')}삭제</button><span class="sp"></span><button class="btn" data-dlg="close">취소</button><button class="btn primary" data-act="save-dlg">저장</button>`, 'wide');
  autosizeAll();
  ui.delArmed = null;
  onDlgClose = () => { renderView(); };
}

// ---------- 여러 줄 붙여넣기 ----------
const PASTE_EX = '{테스트}는 품질을 {검증}하는 과정이다. >> 테스트는 영어로 test\n{TCP}는 연결 지향 프로토콜이다.';
function pasteRows() {
  return S.parsePaste(doc, ui.paste.raw).map((r, i) => {
    const def = !r.bad && !r.dup;
    const on = ui.paste.over.has(i) ? ui.paste.over.get(i) : def;
    return { ...r, i, on: on && !r.bad };
  });
}
function pastePreviewHtml() {
  const rows = pasteRows();
  if (!rows.length) return '<p class="rempty">붙여넣은 문장이 여기에 미리 보입니다</p>';
  return rows.map(r => `<label class="prow${r.on ? '' : ' off'}">
    <input type="checkbox" data-act="paste-tog" data-i="${r.i}"${r.on ? ' checked' : ''}${r.bad ? ' disabled' : ''}>
    <span class="pb"><span class="st">${sentHtml(r.text) || '<i>(빈 문장)</i>'}</span>
    ${r.note ? `<span class="pn">${ic('note')}${esc(r.note)}</span>` : ''}
    <span class="badges">${r.bad ? '<i class="bd warn">문장 없음</i>' : r.blanks ? `<i class="bd">빈칸 ${r.blanks}</i>` : '<i class="bd mute">빈칸 없음</i>'}${r.dup === 'saved' ? '<i class="bd warn">이미 등록됨</i>' : r.dup === 'paste' ? '<i class="bd warn">위와 중복</i>' : ''}</span></span></label>`).join('');
}
function pasteCount() { return pasteRows().filter(r => r.on).length; }
function pasteHtml() {
  const n = pasteCount();
  return `<div class="wrap">
    <div class="subhead"><button class="icbtn" data-act="paste-back" aria-label="등록으로 돌아가기">${ic('back')}</button><span>한 줄에 한 문장 · <code>&gt;&gt;</code> 뒤는 보충설명</span></div>
    <div class="card">
      <label class="fl" for="pasteRaw">문장 붙여넣기</label>
      <textarea class="in ta big" id="pasteRaw" rows="6" placeholder="${esc(PASTE_EX)}">${esc(ui.paste.raw)}</textarea>
      <p class="hint">빈칸은 <code>{ }</code>로 감싸 두면 그대로 들어갑니다. 빈 줄은 건너뜁니다</p>
    </div>
    <div class="card"><h2>${ic('folder')}분류 <span class="sub">선택</span></h2><div id="class-paste">${classHtml('paste')}</div></div>
    <div class="card"><h2>미리보기 <span class="sub" id="pasteSum">${pasteSumText()}</span></h2><div class="plist" id="pastePrev">${pastePreviewHtml()}</div></div>
    <div class="factions sticky">
      <button class="btn" data-act="paste-back">취소</button>
      <button class="btn primary" data-act="paste-save" id="pasteSave"${n ? '' : ' disabled'}>${n}개 등록</button>
    </div>
  </div>`;
}
function pasteSumText() { const rows = pasteRows(); return rows.length ? `${rows.length}줄 중 ${rows.filter(r => r.on).length}개 등록` : ''; }
function refreshPaste() {
  const p = $('#pastePrev'); if (p) p.innerHTML = pastePreviewHtml();
  const s = $('#pasteSum'); if (s) s.textContent = pasteSumText();
  const n = pasteCount(), b = $('#pasteSave');
  if (b) { b.textContent = `${n}개 등록`; b.disabled = !n; }
}
async function pasteSave() {
  const rows = pasteRows().filter(r => r.on);
  if (!rows.length) return;
  const st = ui.forms.paste;
  const ids = [];
  for (const r of rows) { const x = S.saveSentence(doc, { text: r.text, note: r.note, unit_id: st.unit_id, tag_ids: st.tag_ids }); if (x.item) ids.push(x.item.id); }
  await persist();
  ui.recent = [...ids.reverse(), ...ui.recent].slice(0, 20);
  ui.paste = { raw: '', over: new Map() };
  ui.regSub = 'form';
  renderView();
  toast(`${ids.length}개 등록했습니다`);
}

// =====================================================================
// 목록
// =====================================================================
function scopeChip(kind, id, label, n) {
  const sc = ui.list.scope;
  const on = sc.kind === kind && (sc.id || '') === (id || '');
  return `<button class="chip${kind === 'tag' ? ' tg' : ''}" data-act="scope" data-kind="${kind}" data-id="${id || ''}" aria-pressed="${on}">${label}${n != null ? ` <small>${n}</small>` : ''}</button>`;
}
function listResults() {
  const L = ui.list;
  return S.sentencesSorted(doc).filter(s => S.inScope(doc, s, L.scope) && S.matchText(s, L.q));
}
function rowHtml(s) {
  const L = ui.list;
  const sel = L.selecting && ui.view === 'list';
  return `<div class="srow${sel && L.sel.has(s.id) ? ' picked' : ''}" data-act="${sel ? 'pick' : 'edit'}" data-id="${s.id}" role="button" tabindex="0">
    ${sel ? `<span class="cb${L.sel.has(s.id) ? ' on' : ''}" aria-hidden="true">${ic('check')}</span>` : ''}
    <div class="sb"><div class="st">${sentHtml(s.text)}</div>
    <div class="sm">${s.starred ? `<span class="stx">${ic('star')}</span>` : ''}${s.note ? `<span class="nt" title="보충설명 있음">${ic('note')}</span>` : ''}${metaHtml(s)}</div></div></div>`;
}
function listBodyHtml() {
  const L = ui.list;
  const all = S.live(doc.sentences);
  if (!all.length) return `<div class="wrap"><div class="card emptycard"><p>아직 등록한 문장이 없습니다</p><button class="btn primary" data-act="nav" data-v="register">${ic('edit')}문장 등록하기</button></div>
    <div class="ltools"><span class="sp"></span><button class="mini" data-act="to-manage">${ic('folder')}분류 관리</button></div></div>`;
  const subjects = S.subjectsOf(doc);
  const curUnit = L.scope.kind === 'unit' ? S.unitById(doc, L.scope.id) : null;
  const openSubj = curUnit ? (curUnit.parent_id ? S.unitById(doc, curUnit.parent_id) : curUnit) : null;
  const res = listResults();
  const shown = res.slice(0, L.limit);
  const tags = S.tagsOf(doc);
  return `<div class="scopes">
      <div class="hs">${scopeChip('all', '', '전체', all.length)}${scopeChip('none', '', '미분류', all.filter(s => !s.unit_id).length)}${scopeChip('star', '', `${ic('star')}즐겨찾기`, null)}${subjects.map(u => scopeChip('unit', u.id, esc(u.name), S.unitCount(doc, u))).join('')}</div>
      ${openSubj ? `<div class="hs sub">${scopeChip('unit', openSubj.id, '과목 전체', null)}${S.chaptersOf(doc, openSubj.id).map(u => scopeChip('unit', u.id, esc(u.name), S.unitCount(doc, u))).join('')}</div>` : ''}
      ${tags.length ? `<div class="hs">${tags.map(t => scopeChip('tag', t.id, '#' + esc(t.name), S.tagCount(doc, t))).join('')}</div>` : ''}
    </div>
    <div class="ltools"><span class="cnt">${res.length === all.length ? `문장 ${res.length}개` : `${res.length}개 / 전체 ${all.length}개`}</span><span class="sp"></span>
      <button class="mini" data-act="sel-mode" aria-pressed="${L.selecting}">${ic('sel')}${L.selecting ? '선택 끝' : '선택'}</button>
      <button class="mini" data-act="to-manage">${ic('folder')}분류 관리</button></div>
    <div class="card flat"><div class="slist" id="slist">${shown.length ? shown.map(rowHtml).join('') : '<p class="rempty">조건에 맞는 문장이 없습니다</p>'}</div>
    ${res.length > shown.length ? `<button class="btn wide" data-act="more" style="margin-top:10px">더 보기 (${res.length - shown.length}개 남음)</button>` : ''}</div>`;
}
function listHtml() {
  if (!S.live(doc.sentences).length) return listBodyHtml();
  return `<div class="wrap">
    <div class="searchbox">${ic('search')}<input class="in" id="q" type="search" placeholder="문장·보충설명 검색 (초성 가능)" value="${esc(ui.list.q)}" autocomplete="off" enterkeyhint="search"></div>
    <div id="lres">${listBodyHtml()}</div></div>`;
}
// 검색 칸은 그대로 두고 결과만 다시 그린다 (한글 입력 조합이 끊기지 않게)
function refreshList() {
  const sc = $('#view').scrollTop;
  const host = $('#lres');
  if (host && S.live(doc.sentences).length) host.innerHTML = listBodyHtml(); else $('#view').innerHTML = listHtml();
  $('#view').scrollTop = sc;
  renderSelBar();
}
// 선택 막대 (목록에서 여러 개 골랐을 때)
function renderSelBar() {
  const bar = $('#selbar');
  const L = ui.list;
  if (!(ui.view === 'list' && ui.listSub === 'list' && L.selecting)) { bar.hidden = true; document.body.classList.remove('selecting'); return; }
  document.body.classList.add('selecting');
  bar.hidden = false;
  const n = L.sel.size;
  bar.innerHTML = `<div class="sbtop"><b>${n}개 선택</b><span class="sp"></span><button class="link" data-act="sel-all">${n && listResults().every(s => L.sel.has(s.id)) ? '모두 해제' : '보이는 것 모두'}</button><button class="icbtn sm" data-act="sel-mode" aria-label="선택 끝">${ic('x')}</button></div>
    <div class="sbbtns">
      <button data-act="bulk-unit"${n ? '' : ' disabled'}>${ic('folder')}<span>과목·단원</span></button>
      <button data-act="bulk-tag-add"${n ? '' : ' disabled'}>${ic('tag')}<span>태그 추가</span></button>
      <button data-act="bulk-tag-rm"${n ? '' : ' disabled'}>${ic('tag')}<span>태그 빼기</span></button>
      <button data-act="bulk-del" class="dg"${n ? '' : ' disabled'}>${ic('trash')}<span>삭제</span></button>
    </div>`;
}
function bulkUnit() {
  const ids = [...ui.list.sel];
  const opt = (id, label, cls = '') => `<button class="opt ${cls}" data-pick="${id}">${label}</button>`;
  let body = opt('', '미분류', 'mute');
  for (const s of S.subjectsOf(doc)) {
    body += opt(s.id, `${ic('folder')}${esc(s.name)}`);
    for (const c of S.chaptersOf(doc, s.id)) body += opt(c.id, esc(c.name), 'in');
  }
  body += `<button class="opt add" data-pick="+">${ic('plus')}새 과목 만들기</button>`;
  const d = openDialog(`${ids.length}개 문장의 과목·단원`, `<div class="opts">${body}</div>`);
  const on = async e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    let id = b.dataset.pick;
    if (id === '+') {
      d.removeEventListener('click', on);
      onDlgClose = async () => {
        const name = await promptDialog('새 과목', '과목 이름', { validate: v => (S.subjectsOf(doc, { archived: true }).some(u => u.name.toLowerCase() === v.toLowerCase()) ? '같은 이름의 과목이 있습니다' : null) });
        if (!name) return;
        const r = S.addUnit(doc, name);
        if (r.item) { const n = S.setUnitMany(doc, ids, r.item.id); await persist(); finishBulk(`${n}개를 '${name}'(으)로 옮겼습니다`); }
      };
      closeDialog();
      return;
    }
    const n = S.setUnitMany(doc, ids, id || null);
    closeDialog();
    await persist();
    finishBulk(id ? `${n}개를 '${S.unitPath(doc, id).map(u => u.name).join(' › ')}'(으)로 옮겼습니다` : `${n}개를 미분류로 옮겼습니다`);
  };
  d.addEventListener('click', on);
  onDlgClose = () => d.removeEventListener('click', on);
}
function bulkTag(add) {
  const ids = [...ui.list.sel];
  const sel = new Set(ids);
  const used = new Set(S.live(doc.sentences).filter(s => sel.has(s.id)).flatMap(s => s.tag_ids));
  const list = S.tagsOf(doc).filter(t => add || used.has(t.id));
  let body = list.map(t => `<button class="opt" data-pick="${t.id}">#${esc(t.name)}</button>`).join('');
  if (!list.length && !add) body = '<p>고른 문장에 붙은 태그가 없습니다</p>';
  if (add) body += `<button class="opt add" data-pick="+">${ic('plus')}새 태그 만들기</button>`;
  const d = openDialog(add ? `${ids.length}개 문장에 태그 추가` : `${ids.length}개 문장에서 태그 빼기`, `<div class="opts">${body}</div>`);
  const on = async e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const id = b.dataset.pick;
    d.removeEventListener('click', on);
    if (id === '+') {
      onDlgClose = async () => {
        const name = await promptDialog('새 태그', '태그 이름', { validate: v => (S.tagsOf(doc).some(t => t.name.toLowerCase() === S.normTag(v).toLowerCase()) ? '같은 이름의 태그가 있습니다' : null) });
        if (!name) return;
        const r = S.addTag(doc, name);
        if (r.item) { const n = S.tagMany(doc, ids, r.item.id, true); await persist(); finishBulk(`${n}개에 #${r.item.name}을(를) 붙였습니다`); }
      };
      closeDialog();
      return;
    }
    const t = S.tagById(doc, id);
    const n = S.tagMany(doc, ids, id, add);
    onDlgClose = null;
    closeDialog();
    await persist();
    finishBulk(add ? `${n}개에 #${t.name}을(를) 붙였습니다` : `${n}개에서 #${t.name}을(를) 뺐습니다`);
  };
  d.addEventListener('click', on);
  onDlgClose = () => d.removeEventListener('click', on);
}
function finishBulk(msg) { ui.list.sel.clear(); refreshList(); toast(msg); }

// =====================================================================
// 분류 관리
// =====================================================================
function ctlHtml(kind, item, i, n) {
  return `<button class="icbtn" data-act="mv" data-kind="${kind}" data-id="${item.id}" data-dir="-1" aria-label="위로"${i === 0 ? ' disabled' : ''}>${ic('up')}</button>
    <button class="icbtn" data-act="mv" data-kind="${kind}" data-id="${item.id}" data-dir="1" aria-label="아래로"${i === n - 1 ? ' disabled' : ''}>${ic('down')}</button>`;
}
const rmBtn = (kind, item) => { const k = `${kind}:${item.id}`; const a = armed.has(k); return `<button class="icbtn${a ? ' armed' : ''}" data-act="rm" data-kind="${kind}" data-id="${item.id}" aria-label="${a ? '한 번 더 누르면 삭제' : '삭제'}" title="${a ? '한 번 더 누르면 삭제' : '삭제'}">${ic('trash')}</button>`; };
const arcBtn = item => `<button class="icbtn" data-act="arc" data-id="${item.id}" aria-label="${item.archived ? '보관 해제' : '보관'}" title="${item.archived ? '보관 해제' : '보관 (고르는 목록에서 숨김)'}">${ic(item.archived ? 'unbox' : 'box')}</button>`;
function unitRow(u, i, n) {
  return `<div class="mrow${u.archived ? ' arch' : ''}"><input class="in nm" data-ren="unit" data-id="${u.id}" value="${esc(u.name)}" maxlength="40" aria-label="이름">
    <span class="cnt">${S.unitCount(doc, u)}</span>${ctlHtml('unit', u, i, n)}${arcBtn(u)}${rmBtn('unit', u)}</div>`;
}
function manageHtml() {
  const subjects = S.subjectsOf(doc, { archived: true });
  const tags = S.tagsOf(doc);
  return `<div class="wrap">
    <div class="subhead"><button class="icbtn" data-act="manage-back" aria-label="목록으로 돌아가기">${ic('back')}</button><span>이름은 고친 뒤 칸을 벗어나면 저장됩니다</span></div>
    <div class="card"><h2>${ic('folder')}과목 · 단원</h2>
      ${subjects.length ? '' : '<p class="hint" style="margin:0 0 6px">아직 과목이 없습니다</p>'}
      ${subjects.map((u, i) => { const chs = S.chaptersOf(doc, u.id, { archived: true }); return `<div class="cgroup">${unitRow(u, i, subjects.length)}
        <div class="c2">${chs.map((c, j) => unitRow(c, j, chs.length)).join('')}
        <form class="addrow" data-add="chap" data-id="${u.id}"><input class="in" placeholder="단원 추가" maxlength="40" aria-label="${esc(u.name)}에 단원 추가"><button class="btn sm">추가</button></form></div></div>`; }).join('')}
      <form class="addrow" data-add="subj"><input class="in" placeholder="새 과목 이름" maxlength="40" aria-label="새 과목 이름"><button class="btn">과목 추가</button></form>
      <p class="hint">단원을 지우면 그 문장은 과목으로 올라갑니다. 문장이 있는 과목은 지울 수 없고, 대신 보관하면 고르는 목록에서 숨겨집니다</p>
    </div>
    <div class="card"><h2>${ic('tag')}태그</h2>
      ${tags.map((t, i) => `<div class="mrow"><span class="hash">#</span><input class="in nm" data-ren="tag" data-id="${t.id}" value="${esc(t.name)}" maxlength="30" aria-label="이름"><span class="cnt">${S.tagCount(doc, t)}</span>${ctlHtml('tag', t, i, tags.length)}${rmBtn('tag', t)}</div>`).join('')}
      <form class="addrow" data-add="tag"><input class="in" placeholder="새 태그 이름" maxlength="30" aria-label="새 태그 이름"><button class="btn">태그 추가</button></form>
      <p class="hint">태그를 지우면 문장에서 떼어 냅니다</p>
    </div>
  </div>`;
}
function refreshManage(focusSel) {
  const sc = $('#view').scrollTop;
  $('#view').innerHTML = manageHtml();
  $('#view').scrollTop = sc;
  if (focusSel) $(focusSel)?.focus();
}

// =====================================================================
// 학습 범위 (조회·문제 공통)
// =====================================================================
function loadScope() { try { return S.cleanScope(doc, JSON.parse(ls('sm-scope') || 'null')); } catch { return S.emptyScope(); } }
function saveScope(sc) { ls('sm-scope', JSON.stringify(sc)); }
function scopeIds(mode, sc = loadScope()) {
  const list = S.scoped(doc, sc);
  return mode === 'quiz' ? list.filter(s => S.blanksOf(s.text).length).map(s => s.id) : list.map(s => s.id);
}
const togChip = (act, id, label, on, extra = '') => `<button type="button" class="chip${extra}" data-act="${act}" data-id="${id}" aria-pressed="${on}">${label}</button>`;
function scopeHtml(mode) {
  const all = S.live(doc.sentences);
  if (!all.length) return `<div class="wrap"><div class="card emptycard">${ic(VIEWS[mode].icon, 'lg')}<h2>아직 등록한 문장이 없습니다</h2><p>문장을 등록하면 ${mode === 'quiz' ? '빈칸 문제를 풀' : '조회 모드를 쓸'} 수 있습니다</p>
    <button class="btn primary" data-act="nav" data-v="register">${ic('edit')}문장 등록하기</button></div></div>`;
  const sc = loadScope();
  const subjects = S.subjectsOf(doc);
  const tags = S.tagsOf(doc);
  const list = S.scoped(doc, sc);
  const ids = scopeIds(mode, sc);
  const noBlank = list.length - ids.length;
  let rows = `<div class="crow"><span class="cl">과목</span><div class="chips">${subjects.map(u => togChip('sc-unit', u.id, esc(u.name), sc.units.includes(u.id))).join('')}${togChip('sc-none', '', '미분류', sc.none)}</div></div>`;
  for (const u of subjects.filter(x => sc.units.includes(x.id))) {
    const chs = S.chaptersOf(doc, u.id);
    if (chs.length) rows += `<div class="crow"><span class="cl"></span><div class="chips sub"><span class="sublbl">${esc(u.name)}</span>${chs.map(c => togChip('sc-unit', c.id, esc(c.name), sc.units.includes(c.id))).join('')}</div></div>`;
  }
  if (tags.length) rows += `<div class="crow"><span class="cl">태그</span><div class="chips">${tags.map(t => togChip('sc-tag', t.id, '#' + esc(t.name), sc.tags.includes(t.id), ' tg')).join('')}</div></div>`;
  rows += `<div class="crow"><span class="cl"></span><div class="chips">${togChip('sc-star', '', `${ic('star')}즐겨찾기만`, sc.star)}</div></div>`;
  let stat = '';
  if (mode === 'quiz') {
    const c = { new: 0, unknown: 0, known: 0 };
    ids.forEach(id => c[S.levelInfo(doc, id).key]++);
    stat = `<div class="lvl"><span><i class="d new"></i>처음 ${c.new}</span><span><i class="d unknown"></i>몰랐음 ${c.unknown}</span><span><i class="d known"></i>알았음 ${c.known}</span></div>`;
  }
  const p = S.prefs(doc);
  const how = mode === 'review'
    ? `초당 ${p.speed}글자 · 멈춤 ${p.hold}초${p.reviewNote === 'after' ? ' · 보충설명 표시' : ''}`
    : `유형: ${{ fixed: '빈칸', len: '길이 빈칸', cho: '초성', mix: '섞기' }[p.quizType]}`;
  return `<div class="wrap">
    <div class="card"><h2>${ic('folder')}학습 범위 <span class="sub">${S.scopeEmpty(sc) ? '고르지 않으면 전체' : `<button class="link sm" data-act="sc-clear">모두 해제</button>`}</span></h2>
      ${rows}
    </div>
    <div class="card startcard">
      <div class="big"><b>${ids.length}</b>개 문장</div>
      ${mode === 'quiz' && noBlank ? `<p class="hint" style="margin:2px 0 0">빈칸 없는 문장 ${noBlank}개는 문제에서 빠집니다</p>` : ''}
      ${stat}
      <button class="btn primary wide startbtn" data-act="${mode === 'quiz' ? 'qz-start' : 'rv-start'}"${ids.length ? '' : ' disabled'}>${ic(mode === 'quiz' ? 'quiz' : 'play')}${mode === 'quiz' ? '문제 시작' : '조회 시작'}</button>
      <div class="howrow"><span>${how}</span><button class="link sm" data-act="sess-opt" data-mode="${mode}">바꾸기</button></div>
      ${mode === 'quiz' && ids.some(id => S.progressOf(doc, id)) ? `<button class="link sm danger" data-act="qz-reset">이 범위 학습 기록 초기화</button>` : ''}
    </div>
  </div>`;
}
function onScopeAct(act, id) {
  const sc = loadScope();
  if (act === 'sc-unit') {
    const u = S.unitById(doc, id);
    if (sc.units.includes(id)) {
      sc.units = sc.units.filter(x => x !== id);
      if (u && !u.parent_id) { const chs = new Set(S.chaptersOf(doc, u.id, { archived: true }).map(c => c.id)); sc.units = sc.units.filter(x => !chs.has(x)); }
    } else sc.units.push(id);
  } else if (act === 'sc-tag') sc.tags = sc.tags.includes(id) ? sc.tags.filter(x => x !== id) : [...sc.tags, id];
  else if (act === 'sc-none') sc.none = !sc.none;
  else if (act === 'sc-star') sc.star = !sc.star;
  else if (act === 'sc-clear') Object.assign(sc, S.emptyScope());
  saveScope(sc);
  const st = $('#view').scrollTop; renderView(); $('#view').scrollTop = st;
}
// 조회·문제 화면 옵션 (속도·유형)
function sessOptions(mode) {
  const p = S.prefs(doc);
  const body = mode === 'review'
    ? `<div class="srow2"><label class="fl" for="pSpeed">속도 <b id="vSpeed">초당 ${p.speed}글자</b></label><input type="range" id="pSpeed" data-range="speed" min="2" max="30" step="1" value="${p.speed}"></div>
       <div class="srow2"><label class="fl" for="pHold">다 채운 뒤 멈춤 <b id="vHold">${p.hold}초</b></label><input type="range" id="pHold" data-range="hold" min="0" max="10" step="0.5" value="${p.hold}"></div>
       <div class="srow2"><span class="fl">보충설명</span><span id="optSeg">${segHtml('reviewNote', [['off', '보이지 않음'], ['after', '다 채운 뒤 표시']], p.reviewNote)}</span></div>`
    : `<div class="srow2"><span class="fl">문제 유형</span><span id="optSeg">${segHtml('quizType', [['fixed', '빈칸'], ['len', '길이 빈칸'], ['cho', '초성'], ['mix', '섞기']], p.quizType)}</span></div><p class="hint" id="qtHint">${quizTypeHint(p.quizType)}</p>`;
  openDialog(mode === 'review' ? '조회 설정' : '문제 설정', body, '<button class="btn primary" data-dlg="close">닫기</button>');
  onDlgClose = () => { if (ui.view === mode && !(mode === 'review' ? RV.on : QZ.on)) renderView(); };
}

// 화면이 꺼지지 않게 (조회 중)
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
  } catch { wakeLock = null; }
}

// =====================================================================
// 조회 모드: 회색 글자를 한 글자씩 채우고, 다 채우면 멈췄다가 다음 문장
// =====================================================================
const RV = { on: false, ids: [], deck: [], hist: [], hi: -1, cur: null, spans: [], order: [], k: 0, acc: 0, phase: 'type', holdLeft: 0, paused: false, raf: 0, last: 0, count: 0 };
function rvStart() {
  const ids = scopeIds('review');
  if (!ids.length) return;
  Object.assign(RV, { on: true, ids, deck: S.shuffle(ids), hist: [], hi: -1, paused: false, count: 0 });
  renderView();
  rvNext();
}
function rvStop() { cancelAnimationFrame(RV.raf); RV.on = false; keepAwake(false); renderView(); }
function rvPull() {
  if (!RV.deck.length) {
    RV.ids = RV.ids.filter(id => S.sentenceById(doc, id));
    if (!RV.ids.length) return null;
    RV.deck = S.shuffleAvoid(RV.ids, RV.cur);
  }
  return RV.deck.shift();
}
function rvNext() {
  let id;
  if (RV.hi < RV.hist.length - 1) id = RV.hist[++RV.hi];
  else {
    id = rvPull();
    if (!id) { rvStop(); return; }
    RV.hist.push(id);
    if (RV.hist.length > 300) RV.hist.shift();
    RV.hi = RV.hist.length - 1;
  }
  RV.count++;
  rvShow(id);
}
function rvPrev() { if (RV.hi > 0) { RV.hi--; rvShow(RV.hist[RV.hi]); } else toast('처음 문장입니다'); }
function rvSessionHtml() {
  return `<div class="sess">
    <div class="sbar"><button class="mini" data-act="rv-end">${ic('back')}범위</button><span class="sp"></span><span class="scount" id="rvCount"></span><button class="icbtn sm" data-act="sess-opt" data-mode="review" aria-label="조회 설정">${ic('gear')}</button></div>
    <div class="rvstage" id="rvStage">
      <div class="rvmeta" id="rvMeta"></div>
      <div class="rvtext" id="rvText"></div>
      <div class="rvnote" id="rvNote" hidden></div>
      <div class="rvpause" id="rvPause" hidden>${ic('pause')}<span>일시정지 · 눌러서 계속</span></div>
    </div>
    <div class="sctl">
      <button class="icbtn" data-act="rv-prev" aria-label="이전 문장">${ic('left')}</button>
      <button class="icbtn big" data-act="rv-toggle" id="rvToggle" aria-label="일시정지">${ic('pause')}</button>
      <button class="icbtn" data-act="rv-next" aria-label="다음 문장">${ic('right')}</button>
    </div>
    <p class="ftip">화면을 누르면 일시정지 · 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전</p>
  </div>`;
}
function rvShow(id) {
  cancelAnimationFrame(RV.raf);
  const s = S.sentenceById(doc, id);
  if (!s) { rvNext(); return; }
  RV.cur = id;
  const chars = [];
  for (const g of S.parse(s.text)) for (const ch of S.graphemes(g.t === 'text' ? g.s : g.ans)) chars.push({ ch, blank: g.t === 'blank' });
  const text = $('#rvText');
  if (!text) return;
  text.innerHTML = chars.map(c => (c.ch === '\n' ? '<br>' : `<span class="c${c.blank ? ' b' : ''}">${esc(c.ch)}</span>`)).join('');
  RV.spans = [...text.querySelectorAll('span.c')];
  const vis = chars.filter(c => c.ch !== '\n');
  RV.order = vis.map((c, i) => (/\s/.test(c.ch) ? -1 : i)).filter(i => i >= 0);
  RV.k = 0; RV.acc = 0; RV.phase = 'type';
  $('#rvMeta').innerHTML = metaHtml(s);
  const note = $('#rvNote');
  note.hidden = true; note.innerHTML = s.note ? `${ic('note')}<span>${esc(s.note)}</span>` : '';
  $('#rvStage').classList.remove('fade');
  $('#rvCount').textContent = `${RV.count}번째 · 범위 ${RV.ids.length}개`;
  rvSetPaused(RV.paused);
}
function rvSetPaused(p) {
  RV.paused = p;
  const pz = $('#rvPause'); if (pz) pz.hidden = !p;
  const t = $('#rvToggle'); if (t) { t.innerHTML = ic(p ? 'play1' : 'pause'); t.setAttribute('aria-label', p ? '계속' : '일시정지'); }
  cancelAnimationFrame(RV.raf);
  keepAwake(!p);
  if (!p) { RV.last = 0; RV.raf = requestAnimationFrame(rvTick); }
}
function rvTick(ts) {
  if (!RV.on || RV.paused || !$('#rvText')) return;
  const dt = RV.last ? Math.min(ts - RV.last, 100) : 0;
  RV.last = ts;
  const p = S.prefs(doc);
  if (RV.phase === 'type') {
    RV.acc += dt;
    const target = Math.min(RV.order.length, Math.floor(RV.acc / 1000 * p.speed) + 1);
    while (RV.k < target) {
      const upto = RV.order[RV.k];
      for (let i = RV.k ? RV.order[RV.k - 1] + 1 : 0; i <= upto; i++) RV.spans[i]?.classList.add('on');
      RV.k++;
    }
    if (RV.k >= RV.order.length) {
      RV.spans.forEach(s => s.classList.add('on'));
      RV.phase = 'hold'; RV.holdLeft = p.hold * 1000;
      const note = $('#rvNote');
      if (p.reviewNote === 'after' && note.innerHTML) note.hidden = false;
    }
  } else if (RV.phase === 'hold') {
    RV.holdLeft -= dt;
    if (RV.holdLeft <= 0) {
      RV.phase = 'fade';
      $('#rvStage').classList.add('fade');
      setTimeout(() => { if (RV.on && RV.phase === 'fade' && !RV.paused) rvNext(); }, 380);
      return;
    }
  }
  RV.raf = requestAnimationFrame(rvTick);
}
function rvToggle() {
  if (RV.phase === 'fade') return;
  rvSetPaused(!RV.paused);
}

// =====================================================================
// 문제 모드
// =====================================================================
const QZ = { on: false, ids: [], round: 0, queue: [], again: new Set(), cur: null, type: 'fixed', open: new Set(), noteOpen: false, known: 0, unknown: 0, done: 0 };
function qzStart() {
  const ids = scopeIds('quiz');
  if (!ids.length) return;
  Object.assign(QZ, { on: true, ids, round: 0, queue: [], cur: null, known: 0, unknown: 0, done: 0 });
  QZ.again = new Set();
  qzRound();
  qzNext();
}
function qzRound() {
  QZ.ids = QZ.ids.filter(id => S.sentenceById(doc, id) && S.blanksOf(S.sentenceById(doc, id).text).length);
  QZ.round++;
  QZ.queue = S.quizRound(doc, QZ.ids, QZ.round, QZ.cur);
  QZ.again.clear();
}
function qzNext() {
  if (!QZ.queue.length) {
    if (QZ.round >= 1 && QZ.cur) toast(`한 바퀴를 마쳤습니다 · 알았음 ${QZ.known} · 몰랐음 ${QZ.unknown}`);
    qzRound();
    if (!QZ.queue.length) { QZ.on = false; renderView(); return; }
  }
  QZ.cur = QZ.queue.shift();
  const p = S.prefs(doc);
  QZ.type = p.quizType === 'mix' ? S.QUIZ_TYPES[Math.floor(Math.random() * 3)] : p.quizType;
  QZ.open = new Set(); QZ.noteOpen = false;
  renderView();
}
function blankHtml(g, i, type, open) {
  if (open) return `<span class="qb open">${esc(g.ans)}</span>`;
  let inner;
  if (type === 'cho') inner = `<span class="qin cho">${esc(S.choHint(g.ans))}</span>`;
  else if (type === 'len') inner = `<span class="qin ghost">${esc(g.ans)}</span>`;
  else inner = '<span class="qin fixed"></span>';
  return `<button type="button" class="qb" data-act="qz-open" data-i="${i}" aria-label="빈칸 ${i + 1} 정답 보기">${inner}</button>${g.hint ? `<small class="qhint">${esc(g.hint)}</small>` : ''}`;
}
function qzSessionHtml() {
  const s = S.sentenceById(doc, QZ.cur);
  if (!s) { setTimeout(qzNext); return ''; }
  const segs = S.parse(s.text);
  const nBlank = segs.filter(g => g.t === 'blank').length;
  let bi = -1;
  const body = segs.map(g => { if (g.t === 'text') return esc(g.s); bi++; return blankHtml(g, bi, QZ.type, QZ.open.has(bi)); }).join('');
  const allOpen = QZ.open.size >= nBlank;
  const lv = S.levelInfo(doc, s.id);
  const left = QZ.queue.length;
  return `<div class="sess">
    <div class="sbar"><button class="mini" data-act="qz-end">${ic('back')}범위</button><span class="sp"></span><span class="scount">${QZ.round}바퀴 · 남은 ${left}개 · <b class="okc">${QZ.known}</b> / <b class="ngc">${QZ.unknown}</b></span><button class="icbtn sm" data-act="sess-opt" data-mode="quiz" aria-label="문제 설정">${ic('gear')}</button></div>
    <div class="qzcard">
      <div class="qzmeta"><span class="lvtag ${lv.key}">${lv.label}</span>${metaHtml(s)}<span class="sp"></span><button class="icbtn sm star${s.starred ? ' on' : ''}" data-act="qz-star" aria-label="${s.starred ? '즐겨찾기 해제' : '즐겨찾기'}" aria-pressed="${!!s.starred}">${ic('star')}</button></div>
      <div class="qtext">${body}</div>
      ${allOpen && s.note ? (QZ.noteOpen ? `<div class="qnote">${ic('note')}<span>${esc(s.note)}</span></div>` : `<button class="mini notebtn" data-act="qz-note">${ic('note')}보충설명 보기</button>`) : ''}
    </div>
    <div class="qctl">${allOpen
      ? `<button class="btn ng" data-act="qz-ans" data-v="0">몰랐음</button><button class="btn ok" data-act="qz-ans" data-v="1">알았음</button>`
      : `<button class="btn" data-act="qz-skip">건너뛰기</button><button class="btn primary" data-act="qz-all">${nBlank > 1 ? '모두 보기' : '정답 보기'}</button>`}</div>
    <p class="ftip">${allOpen ? '알았음이면 점점 덜 나오고, 몰랐음이면 이번 바퀴 뒤쪽에 한 번 더 나옵니다' : '빈칸을 누르면 그 빈칸의 정답이 나옵니다'}</p>
  </div>`;
}
async function qzAnswer(known) {
  const id = QZ.cur;
  S.record(doc, id, known);
  if (known) QZ.known++; else {
    QZ.unknown++;
    if (!QZ.again.has(id) && QZ.queue.length) {
      QZ.again.add(id);
      const min = Math.min(QZ.queue.length, 2);
      const pos = min + Math.floor(Math.random() * (QZ.queue.length - min + 1));
      QZ.queue.splice(pos, 0, id);
    }
  }
  QZ.done++;
  persist();
  qzNext();
}
function quizView() { setTitle('문제'); return QZ.on ? qzSessionHtml() : scopeHtml('quiz'); }
function reviewView() { setTitle('조회'); return RV.on ? rvSessionHtml() : scopeHtml('review'); }

// =====================================================================
// 설정
// =====================================================================
const segHtml = (key, opts, cur) => `<span class="seg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="pref" data-k="${key}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</span>`;
function settingsHtml() {
  const p = S.prefs(doc);
  const all = S.live(doc.sentences);
  return `<div class="wrap">
    <div class="card"><h2>${ic('play')}조회 모드</h2>
      <div class="srow2"><label class="fl" for="pSpeed">속도 <b id="vSpeed">초당 ${p.speed}글자</b></label><input type="range" id="pSpeed" data-range="speed" min="2" max="30" step="1" value="${p.speed}"></div>
      <div class="srow2"><label class="fl" for="pHold">다 채운 뒤 멈춤 <b id="vHold">${p.hold}초</b></label><input type="range" id="pHold" data-range="hold" min="0" max="10" step="0.5" value="${p.hold}"></div>
      <div class="srow2"><span class="fl">보충설명</span>${segHtml('reviewNote', [['off', '보이지 않음'], ['after', '다 채운 뒤 표시']], p.reviewNote)}</div>
    </div>
    <div class="card"><h2>${ic('quiz')}문제 모드</h2>
      <div class="srow2"><span class="fl">문제 유형</span>${segHtml('quizType', [['fixed', '빈칸'], ['len', '길이 빈칸'], ['cho', '초성'], ['mix', '섞기']], p.quizType)}</div>
      <p class="hint" id="qtHint">${quizTypeHint(p.quizType)}</p>
    </div>
    <div class="card"><h2>${ic('edit')}등록</h2>
      <div class="srow2"><span class="fl">저장 후 분류</span>${segHtml('keepClass', [['false', '비우기'], ['true', '그대로 두기']], p.keepClass)}</div>
      <p class="hint">'그대로 두기'는 같은 과목 문장을 이어서 등록할 때 편합니다</p>
      <div class="srow2" style="margin-top:12px"><span class="fl">앱을 열면</span>${segHtml('start', [['register', '등록 화면'], ['last', '마지막으로 연 화면']], p.start)}</div>
    </div>
    <div class="card"><h2>데이터</h2>
      <div class="kv"><span>문장</span><span>${all.length}개</span></div>
      <div class="kv"><span>과목 · 단원 · 태그</span><span>${S.subjectsOf(doc, { archived: true }).length} · ${S.live(doc.units).filter(u => u.parent_id).length} · ${S.tagsOf(doc).length}</span></div>
      <div class="setrow"><button class="btn" data-act="export">JSON 내보내기</button><button class="btn" data-act="import">JSON 가져오기</button></div>
    </div>
    <div class="card"><h2>Google Drive 동기화</h2>
      <div class="kv"><span>상태</span><span id="syncState">${syncStateHtml()}</span></div>
      <div class="setrow" id="syncBtns">${syncBtnsHtml()}</div>
      <p class="hint">Drive의 '11 Study Manager\\db' 폴더에 저장하고, 하루에 한 번 백업을 남깁니다(최근 14개). 다른 기기에서는 이 기기 데이터를 지운 뒤 처음 화면의 'Drive에 있는 데이터 불러오기'로 시작하세요</p>
      <div class="setrow" style="margin-top:12px"><button class="btn danger" data-act="wipe">이 기기 데이터 지우기</button></div>
    </div>
    <p class="ver">Study Manager ${VERSION}</p>
  </div>`;
}
const quizTypeHint = t => ({ fixed: '빈칸을 항상 같은 폭 [      ]으로 가립니다', len: '정답 글자 수에 맞춘 폭으로 가립니다', cho: '정답의 초성으로 가립니다 (예: [ㅌㅅㅌ])', mix: '문장마다 세 가지 중 하나를 무작위로 씁니다' }[t] || '');
function exportJson() {
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `study-manager-${S.todayKst().replace(/-/g, '')}.json`;
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
  const n = S.live(obj.sentences).length;
  if (!(await confirmDialog('가져오기', `이 기기의 데이터를 파일 내용(문장 ${n}개)으로 <b>바꿉니다</b>. 계속할까요?`, '바꾸기', true))) return;
  doc = S.normalizeDoc(obj);
  await persist();
  ui.forms.page = newForm(); ui.recent = []; ui.list.scope = { kind: 'all' };
  renderAll();
  toast(`가져왔습니다 (문장 ${n}개)`);
});

function blankHelp() {
  openDialog('빈칸 표기법', `<p>문장 안에서 빈칸은 중괄호로 감쌉니다. 단어 칩을 누르면 자동으로 들어갑니다.</p>
    <table class="help"><tr><td><code>{답}</code></td><td>빈칸</td></tr><tr><td><code>{답|힌트}</code></td><td>빈칸 + 힌트 (문제 모드에서 빈칸 아래에 작게)</td></tr><tr><td><code>\\{</code> <code>\\}</code></td><td>중괄호 글자 그대로</td></tr></table>
    <p>예: <code>{TCP|프로토콜 이름}는 연결 지향이다.</code></p>
    <p>단어 일부만 빈칸으로 하려면 문장 칸에서 글자를 길게 눌러 고른 뒤 <b>고른 글자 빈칸</b>을 누르세요.</p>
    <p>붙어 있는 단어를 이어서 빈칸으로 만들면 하나의 빈칸으로 합쳐집니다. 따로 두려면 <code>{ }</code>를 직접 입력하세요.</p>`);
}

// =====================================================================
// 이벤트
// =====================================================================
async function addUnitFlow(fk, parentId) {
  const name = await promptDialog(parentId ? '새 단원' : '새 과목', parentId ? `${S.unitById(doc, parentId)?.name || ''} 단원 이름` : '과목 이름', {
    validate: v => { const sib = S.live(doc.units).filter(u => (u.parent_id || null) === (parentId || null)); return sib.some(u => u.name.toLowerCase() === v.toLowerCase()) ? '같은 이름이 있습니다' : null; },
  });
  return name ? S.addUnit(doc, name, parentId || null).item : null;
}
// 대화창(수정 창) 안에서 과목·태그를 새로 만들 때: 수정 창을 잠시 닫았다가 다시 연다
async function withDialogSuspended(fk, fn) {
  if (fk !== 'dlg') return fn();
  readTextAreas('dlg');
  const keep = ui.forms.dlg;
  onDlgClose = null;
  await closeDialog();
  const r = await fn();
  reopenEdit(keep);
  return r;
}
async function onClassAct(act, fk, id) {
  const st = ui.forms[fk];
  if (!st) return;
  if (fk !== 'paste') readTextAreas(fk);
  if (act === 'pick-subj') {
    if (!id) { st.unit_id = null; st.openSubj = null; }
    else { const path = S.unitPath(doc, st.unit_id); if (path[0]?.id !== id) st.unit_id = id; st.openSubj = id; }
  } else if (act === 'pick-chap') {
    const subj = S.unitPath(doc, st.unit_id)[0] || S.unitById(doc, st.openSubj);
    st.unit_id = id || subj?.id || null;
  } else if (act === 'tog-tag') {
    st.tag_ids = st.tag_ids.includes(id) ? st.tag_ids.filter(x => x !== id) : [...st.tag_ids, id];
  } else if (act === 'add-subj' || act === 'add-chap') {
    const parent = act === 'add-chap' ? (S.unitPath(doc, st.unit_id)[0] || S.unitById(doc, st.openSubj))?.id : null;
    const u = await withDialogSuspended(fk, () => addUnitFlow(fk, parent));
    if (!u) { if (fk !== 'dlg') refreshForm(fk); return; }
    const s2 = ui.forms[fk];
    s2.unit_id = u.id; s2.openSubj = u.parent_id || u.id;
    await persist();
  } else if (act === 'add-tag') {
    const t = await withDialogSuspended(fk, async () => {
      const name = await promptDialog('새 태그', '태그 이름', { validate: v => (S.tagsOf(doc).some(x => x.name.toLowerCase() === S.normTag(v).toLowerCase()) ? '같은 이름의 태그가 있습니다' : null) });
      return name ? S.addTag(doc, name).item : null;
    });
    if (!t) { if (fk !== 'dlg') refreshForm(fk); return; }
    ui.forms[fk].tag_ids.push(t.id);
    await persist();
  }
  refreshForm(fk);
}

document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act, fk = b.dataset.f, id = b.dataset.id;
  if (act !== 'rm' && armed.size) { armed.clear(); }
  switch (act) {
    case 'nav': go(b.dataset.v); break;
    // ----- 입력 폼 -----
    case 'word': {
      readTextAreas(fk);
      const st = ui.forms[fk];
      st.text = S.toggleWord(st.text, Number(b.dataset.i));
      const t = document.getElementById(`text-${fk}`);
      if (t) { t.value = st.text; autosize(t); }
      refreshChips(fk);
      break;
    }
    case 'wrap': {
      const t = document.getElementById(`text-${fk}`);
      if (!t) break;
      const r = S.wrapRange(t.value, t.selectionStart, t.selectionEnd);
      if (!r) { toast(t.selectionStart === t.selectionEnd ? '문장 칸에서 빈칸으로 만들 글자를 먼저 고르세요' : '이미 빈칸이 들어 있는 범위입니다'); break; }
      t.value = r.text; ui.forms[fk].text = r.text;
      t.focus(); try { t.setSelectionRange(r.caret, r.caret); } catch { /* 무시 */ }
      autosize(t); refreshChips(fk);
      break;
    }
    case 'help-blank': {
      if (ui.forms.dlg) break; // 수정 창 위에는 겹쳐 열지 않는다
      readTextAreas('page'); blankHelp(); break;
    }
    case 'fold': {
      readTextAreas(fk);
      const st = ui.forms[fk]; const k = b.dataset.k;
      st[k] = !st[k];
      refreshForm(fk, st[k] && k === 'noteOpen' ? `#note-${fk}` : null);
      break;
    }
    case 'pick-subj': case 'pick-chap': case 'tog-tag': case 'add-subj': case 'add-chap': case 'add-tag':
      await onClassAct(act, fk, id); break;
    case 'save-page': await saveForm('page'); break;
    case 'save-dlg': if (await saveForm('dlg')) { if (dlg().open) closeDialog(); else renderView(); toast('저장했습니다'); } break;
    case 'del-edit': {
      const st = ui.forms.dlg;
      if (!st) break;
      if (ui.delArmed !== st.editId) { ui.delArmed = st.editId; b.textContent = '한 번 더 누르면 삭제'; b.classList.add('armed'); break; }
      S.deleteSentences(doc, [st.editId]);
      ui.recent = ui.recent.filter(x => x !== st.editId);
      closeDialog();
      await persist();
      toast('삭제했습니다');
      break;
    }
    case 'edit': openEdit(id); break;
    // ----- 붙여넣기 -----
    case 'to-paste': readTextAreas('page'); ui.regSub = 'paste'; renderView(); $('#view').scrollTop = 0; $('#pasteRaw')?.focus(); break;
    case 'paste-back': ui.regSub = 'form'; renderView(); break;
    case 'paste-save': await pasteSave(); break;
    // ----- 목록 -----
    case 'scope': {
      const kind = b.dataset.kind;
      ui.list.scope = kind === 'unit' || kind === 'tag' ? { kind, id } : { kind };
      ui.list.limit = 100;
      refreshList();
      break;
    }
    case 'more': ui.list.limit += 200; refreshList(); break;
    case 'sel-mode': ui.list.selecting = !ui.list.selecting; ui.list.sel.clear(); refreshList(); break;
    case 'pick': {
      const L = ui.list;
      if (L.sel.has(id)) L.sel.delete(id); else L.sel.add(id);
      b.classList.toggle('picked', L.sel.has(id));
      b.querySelector('.cb')?.classList.toggle('on', L.sel.has(id));
      renderSelBar();
      break;
    }
    case 'sel-all': {
      const L = ui.list, res = listResults();
      if (L.sel.size && res.every(s => L.sel.has(s.id))) L.sel.clear(); else res.forEach(s => L.sel.add(s.id));
      refreshList();
      break;
    }
    case 'bulk-unit': bulkUnit(); break;
    case 'bulk-tag-add': bulkTag(true); break;
    case 'bulk-tag-rm': bulkTag(false); break;
    case 'bulk-del': {
      const ids = [...ui.list.sel];
      if (!(await confirmDialog('문장 삭제', `고른 문장 ${ids.length}개를 지울까요?`, '삭제', true))) break;
      S.deleteSentences(doc, ids);
      ui.list.sel.clear();
      await persist();
      finishBulk(`${ids.length}개를 지웠습니다`);
      break;
    }
    case 'to-manage': ui.list.selecting = false; ui.list.sel.clear(); ui.listSub = 'manage'; renderView(); $('#view').scrollTop = 0; break;
    case 'manage-back': ui.listSub = 'list'; renderView(); break;
    // ----- 분류 관리 -----
    case 'mv': {
      const kind = b.dataset.kind;
      if (kind === 'unit') { const u = S.unitById(doc, id); const list = u.parent_id ? S.chaptersOf(doc, u.parent_id, { archived: true }) : S.subjectsOf(doc, { archived: true }); S.moveItem(list, u, Number(b.dataset.dir)); }
      else { const t = S.tagById(doc, id); S.moveItem(S.tagsOf(doc), t, Number(b.dataset.dir)); }
      await persist(); refreshManage(); break;
    }
    case 'arc': { const u = S.unitById(doc, id); S.setArchived(u, !u.archived); await persist(); refreshManage(); toast(u.archived ? `'${u.name}'을(를) 보관했습니다` : `'${u.name}' 보관을 풀었습니다`); break; }
    case 'rm': {
      const kind = b.dataset.kind, k = `${kind}:${id}`;
      if (!armed.has(k)) { armed.clear(); armed.add(k); refreshManage(); toast('한 번 더 누르면 삭제합니다'); break; }
      armed.clear();
      if (kind === 'unit') {
        const u = S.unitById(doc, id);
        const r = S.deleteUnit(doc, u);
        if (r.error) { toast(r.error); refreshManage(); break; }
        if (ui.list.scope.id === id) ui.list.scope = { kind: 'all' };
      } else { S.deleteTag(doc, S.tagById(doc, id)); if (ui.list.scope.id === id) ui.list.scope = { kind: 'all' }; }
      for (const f of Object.values(ui.forms)) if (f) { if (f.unit_id && !S.unitById(doc, f.unit_id)) f.unit_id = null; if (f.openSubj && !S.unitById(doc, f.openSubj)) f.openSubj = null; f.tag_ids = f.tag_ids.filter(x => S.tagById(doc, x)); }
      await persist(); refreshManage(); toast('삭제했습니다'); break;
    }
    // ----- 설정 -----
    case 'pref': {
      const k = b.dataset.k; let v = b.dataset.v;
      if (v === 'true' || v === 'false') v = v === 'true';
      S.setPref(doc, k, v);
      await persist();
      if (b.closest('dialog')) {
        b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
        const h = $('#qtHint'); if (h && k === 'quizType') h.textContent = quizTypeHint(v);
        if (k === 'quizType' && QZ.on && !QZ.open.size) { QZ.type = v === 'mix' ? S.QUIZ_TYPES[Math.floor(Math.random() * 3)] : v; renderView(); }
        break;
      }
      const sc = $('#view').scrollTop; renderView(); $('#view').scrollTop = sc;
      break;
    }
    case 'export': exportJson(); break;
    case 'sync-login': await Sync.signIn(); renderSaveLabel(); break;
    case 'sync-now': Sync.syncNow(); break;
    case 'sync-out': if (await confirmDialog('동기화 끄기', '이 기기에서 Google 로그인을 끊고 동기화를 멈춥니다. 데이터는 이 기기와 Drive에 그대로 남습니다.', '끄기')) { Sync.signOut(); renderSaveLabel(); } break;
    case 'wipe': await wipeDevice(); break;
    case 'sync-click': if (Sync.signedIn()) Sync.syncNow(); else go('settings'); break;
    // ----- 학습 범위 -----
    case 'sc-unit': case 'sc-tag': case 'sc-none': case 'sc-star': case 'sc-clear': onScopeAct(act, id); break;
    case 'sess-opt': sessOptions(b.dataset.mode); break;
    // ----- 조회 -----
    case 'rv-start': rvStart(); break;
    case 'rv-end': rvStop(); break;
    case 'rv-toggle': rvToggle(); break;
    case 'rv-next': rvNext(); break;
    case 'rv-prev': rvPrev(); break;
    // ----- 문제 -----
    case 'qz-start': qzStart(); break;
    case 'qz-end': QZ.on = false; renderView(); break;
    case 'qz-open': QZ.open.add(Number(b.dataset.i)); renderView(); break;
    case 'qz-all': { const s = S.sentenceById(doc, QZ.cur); S.blanksOf(s.text).forEach((_, i) => QZ.open.add(i)); renderView(); break; }
    case 'qz-note': QZ.noteOpen = true; renderView(); break;
    case 'qz-skip': qzNext(); break;
    case 'qz-ans': await qzAnswer(b.dataset.v === '1'); break;
    case 'qz-star': { const s = S.sentenceById(doc, QZ.cur); S.saveSentence(doc, { ...s, starred: !s.starred }, s.id); await persist(); renderView(); break; }
    case 'qz-reset': {
      const ids = scopeIds('quiz');
      if (!(await confirmDialog('학습 기록 초기화', `지금 범위의 문장 ${ids.length}개를 모두 '처음' 상태로 되돌릴까요?`, '초기화', true))) break;
      S.resetProgress(doc, ids); await persist(); renderView(); toast('학습 기록을 초기화했습니다');
      break;
    }
    case 'import': $('#importFile').click(); break;
  }
});
// 고른 글자 빈칸 버튼: 눌러도 문장 칸의 선택이 풀리지 않게
document.addEventListener('pointerdown', e => { if (e.target.closest('[data-act="wrap"]')) e.preventDefault(); });
document.addEventListener('mousedown', e => { if (e.target.closest('[data-act="wrap"]')) e.preventDefault(); });
// 저장 버튼: 누르는 순간 키보드가 내려가지 않게
document.addEventListener('pointerdown', e => { if (e.target.closest('#savePage') && document.activeElement?.id === 'text-page') e.preventDefault(); });

document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.fin && t.dataset.f) {
    const st = ui.forms[t.dataset.f];
    if (!st) return;
    if (t.dataset.fin === 'starred') { st.starred = t.checked; return; }
    st[t.dataset.fin] = t.value;
    if (t.tagName === 'TEXTAREA') autosize(t);
    if (t.dataset.fin === 'text') { if (st.err) { st.err = ''; t.closest('.sform')?.querySelector('.note[role=alert]')?.remove(); } refreshChips(t.dataset.f); }
    return;
  }
  if (t.id === 'pasteRaw') { ui.paste.raw = t.value; ui.paste.over.clear(); autosize(t); clearTimeout(pasteTimer); pasteTimer = setTimeout(refreshPaste, 200); return; }
  if (t.id === 'q') { ui.list.q = t.value; ui.list.limit = 100; clearTimeout(qTimer); qTimer = setTimeout(refreshList, 150); return; }
  if (t.dataset.range) {
    const k = t.dataset.range, v = Number(t.value);
    if (k === 'speed') $('#vSpeed').textContent = `초당 ${v}글자`;
    if (k === 'hold') $('#vHold').textContent = `${v}초`;
    S.setPref(doc, k, v);
  }
});
let pasteTimer, qTimer;
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.act === 'paste-tog') { ui.paste.over.set(Number(t.dataset.i), t.checked); t.closest('.prow')?.classList.toggle('off', !t.checked); refreshPaste(); return; }
  if (t.dataset.range) { S.setPref(doc, t.dataset.range, Number(t.value)); await persist(); return; }
  if (t.dataset.ren) {
    const kind = t.dataset.ren, item = kind === 'unit' ? S.unitById(doc, t.dataset.id) : S.tagById(doc, t.dataset.id);
    if (!item) return;
    const r = kind === 'unit' ? S.renameUnit(doc, item, t.value) : S.renameTag(doc, item, t.value);
    if (r.error) { toast(r.error); t.value = item.name; return; }
    await persist();
  }
});
document.addEventListener('submit', async e => {
  const f = e.target.closest('form[data-add]');
  if (!f) return;
  e.preventDefault();
  const inp = f.querySelector('input');
  const v = inp.value.trim();
  if (!v) { inp.focus(); return; }
  const kind = f.dataset.add;
  const r = kind === 'tag' ? S.addTag(doc, v) : S.addUnit(doc, v, kind === 'chap' ? f.dataset.id : null);
  if (r.error) { toast(r.error); inp.focus(); return; }
  await persist();
  refreshManage(kind === 'chap' ? `form[data-add="chap"][data-id="${f.dataset.id}"] input` : `form[data-add="${kind}"] input`);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  // PC 키보드: Ctrl+Enter로 저장
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && t.dataset?.f) { e.preventDefault(); if (t.dataset.f === 'dlg') $('[data-act="save-dlg"]')?.click(); else if (t.dataset.f === 'page') saveForm('page'); return; }
  const r = t.closest?.('.srow');
  if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); }
});
// 조회 화면: 누르면 일시정지, 밀면 다음/이전
let swipe = null;
document.addEventListener('pointerdown', e => { if (RV.on && e.target.closest('#rvStage')) swipe = { x: e.clientX, y: e.clientY, t: Date.now() }; });
document.addEventListener('pointerup', e => {
  if (!swipe || !RV.on) { swipe = null; return; }
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) { if (dx < 0) rvNext(); else rvPrev(); return; }
  if (Math.abs(dx) < 12 && Math.abs(dy) < 12 && e.target.closest('#rvStage')) rvToggle();
});
document.addEventListener('pointercancel', () => { swipe = null; });
document.addEventListener('keydown', e => {
  if (dlg().open || e.target.matches?.('input, textarea')) return;
  if (ui.view === 'review' && RV.on) {
    if (e.key === ' ') { e.preventDefault(); rvToggle(); } else if (e.key === 'ArrowRight') rvNext(); else if (e.key === 'ArrowLeft') rvPrev();
  } else if (ui.view === 'quiz' && QZ.on) {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); ($('[data-act="qz-all"]') || $('[data-act="qz-ans"][data-v="1"]'))?.click(); }
    else if (e.key === '1') $('[data-act="qz-ans"][data-v="0"]')?.click();
    else if (e.key === '2') $('[data-act="qz-ans"][data-v="1"]')?.click();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && RV.on && !RV.paused) rvSetPaused(true);
  else if (document.visibilityState === 'visible' && RV.on && !RV.paused) keepAwake(true);
});
// 입력 중에는 (모바일) 하단 탭을 숨겨 키보드 위 공간을 넓힌다
document.addEventListener('focusin', e => { if (e.target.matches('textarea, input.in')) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.('textarea, input.in')) document.body.classList.remove('typing'); }, 50));

// =====================================================================
// 시작
// =====================================================================
// =====================================================================
// 처음 화면 (이 기기에 데이터가 없고 동기화도 꺼져 있을 때)
// =====================================================================
const LOGO = `<svg class="glogo" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#6D28D9"/><rect x="11" y="14" width="42" height="36" rx="6" fill="#F3EEFF"/><path d="M18 24.5h28M18 32h7M18 39.5h20" stroke="#B9A3F0" stroke-width="3" stroke-linecap="round"/><rect x="28" y="28.2" width="18" height="7.6" rx="2.2" fill="#6D28D9"/></svg>`;
function showIntro(msg = '') {
  const g = $('#gate');
  g.innerHTML = `<div class="gbox">${LOGO}<h1>Study Manager</h1><p>외울 문장을 모아 두고, 노래방처럼 훑어보고, 빈칸 문제로 익힙니다</p>
    <button class="btn primary wide" data-gate="new">처음 시작하기</button>
    <button class="btn wide" data-gate="load">Drive에 있는 데이터 불러오기</button>
    <p class="gmsg" id="gmsg">${esc(msg)}</p>
    <p class="hint">다른 기기에서 쓰던 데이터가 있으면 불러오기를 고르세요. Google 로그인 창이 열립니다</p></div>`;
  g.hidden = false;
}
$('#gate').addEventListener('click', async e => {
  const b = e.target.closest('[data-gate]');
  if (!b || b.disabled) return;
  if (b.dataset.gate === 'new') { ls('sm-started', '1'); enterApp(); return; }
  const btns = [...document.querySelectorAll('[data-gate]')];
  btns.forEach(x => { x.disabled = true; });
  $('#gmsg').textContent = 'Google 로그인 후 Drive에서 불러오는 중…'; $('#gmsg').classList.add('info');
  try {
    const r = await Sync.fetchRemote();
    if (!r.doc) { showIntro('Drive에 Study Manager 데이터가 없습니다. 먼저 쓰던 기기에서 동기화를 켜세요'); return; }
    doc = S.normalizeDoc(r.doc);
    await S.save(doc);
    Sync.markSignedIn();
    ls('sm-started', '1');
    enterApp(`문장 ${S.live(doc.sentences).length}개를 불러왔습니다`);
    Sync.syncNow();
  } catch (err) {
    showIntro(err.offline ? '네트워크에 연결할 수 없습니다' : 'Google 로그인에 실패했습니다. 팝업 차단을 확인하고 다시 시도하세요');
  }
});
function enterApp(msg) {
  $('#gate').hidden = true; $('#gate').innerHTML = '';
  const p = S.prefs(doc);
  const last = ls('sm-tab');
  ui.view = p.start === 'last' && VIEWS[last] ? last : 'register';
  $('#app').hidden = false;
  renderAll();
  if (msg) toast(msg);
  if (!S.storageOk) toast('브라우저 저장소를 쓸 수 없어 이 탭을 닫으면 내용이 사라집니다');
}
async function wipeDevice() {
  const on = Sync.signedIn();
  const msg = on
    ? '이 기기의 문장·분류·학습 기록을 모두 지웁니다. Drive에 동기화된 데이터는 그대로 남아 다시 불러올 수 있습니다. 계속할까요?'
    : '<b>동기화가 꺼져 있어 지운 데이터는 되살릴 수 없습니다.</b> 필요하면 먼저 JSON 내보내기로 백업하세요. 계속할까요?';
  if (!(await confirmDialog('이 기기 데이터 지우기', msg, '지우기', true))) return;
  await saving;
  await S.clearAll();
  Sync.forgetDevice();
  ['sm-scope', 'sm-tab', 'sm-started'].forEach(k => ls(k, null));
  location.reload();
}

async function boot() {
  doc = await S.load();
  S.purgeOld(doc);
  Sync.init({ getDoc: () => doc, applyMerged, onStatus: renderSaveLabel });
  const fresh = !S.live(doc.sentences).length && !S.live(doc.units).length && !S.live(doc.tags).length;
  if (fresh && !Sync.signedIn() && !ls('sm-started')) showIntro();
  else enterApp();
}
boot();
