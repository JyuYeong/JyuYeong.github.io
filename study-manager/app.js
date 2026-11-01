// Study Manager: 문장 등록·여러 줄 붙여넣기·목록·과목/단원/태그 분류·설정 (M1)
import * as S from './store.js';

export const VERSION = 'M1';

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
  saving = saving.then(() => S.save(doc)).then(renderSaveLabel);
  return saving;
}
function renderSaveLabel() {
  const el = $('#syncLabel');
  if (!el) return;
  el.textContent = S.storageOk ? '이 기기에 저장됨' : '저장 실패 (브라우저 저장소 확인)';
  el.className = 'sync' + (S.storageOk ? '' : ' warn');
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
  else { setTitle(VIEWS[ui.view].label); v.innerHTML = soonHtml(ui.view); }
  renderSelBar();
}
function go(view) {
  if (view === ui.view && view === 'register' && ui.regSub === 'paste') ui.regSub = 'form';
  if (view === ui.view && view === 'list' && ui.listSub === 'manage') ui.listSub = 'list';
  if (view !== 'list') { ui.list.selecting = false; ui.list.sel.clear(); }
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
// 조회·문제 (M2에서 제공)
// =====================================================================
function soonHtml(v) {
  const all = S.live(doc.sentences);
  const withBlank = all.filter(s => S.blanksOf(s.text).length).length;
  const txt = v === 'review'
    ? '등록한 문장이 노래방처럼 한 글자씩 채워지며 랜덤으로 나타나는 모드입니다.'
    : '빈칸을 [   ] 또는 초성 [ㅌㅅㅌ]으로 가리고, 눌러서 답과 보충설명을 확인하는 모드입니다.';
  return `<div class="wrap"><div class="card emptycard">${ic(VIEWS[v].icon, 'lg')}<h2>${VIEWS[v].label} 모드는 다음 단계(M2)에서 열립니다</h2><p>${txt}</p>
    <p class="stat">지금 문장 <b>${all.length}</b>개${v === 'quiz' ? ` · 빈칸 있는 문장 <b>${withBlank}</b>개` : ''}</p>
    <button class="btn primary" data-act="nav" data-v="register">${ic('edit')}문장 등록하기</button></div></div>`;
}

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
      <div class="kv"><span>Google Drive 동기화</span><span>M3에서 제공</span></div>
      <div class="setrow"><button class="btn" data-act="export">JSON 내보내기</button><button class="btn" data-act="import">JSON 가져오기</button></div>
      <p class="hint">동기화를 켜기 전까지 데이터는 이 기기 브라우저에만 저장됩니다. 가끔 내보내기로 백업해 두세요</p>
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
      const sc = $('#view').scrollTop; renderView(); $('#view').scrollTop = sc;
      break;
    }
    case 'export': exportJson(); break;
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
// 입력 중에는 (모바일) 하단 탭을 숨겨 키보드 위 공간을 넓힌다
document.addEventListener('focusin', e => { if (e.target.matches('textarea, input.in')) document.body.classList.add('typing'); });
document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement?.matches?.('textarea, input.in')) document.body.classList.remove('typing'); }, 50));

// =====================================================================
// 시작
// =====================================================================
async function boot() {
  doc = await S.load();
  S.purgeOld(doc);
  const p = S.prefs(doc);
  const last = ls('sm-tab');
  ui.view = p.start === 'last' && VIEWS[last] ? last : 'register';
  $('#app').hidden = false;
  renderAll();
  if (!S.storageOk) toast('브라우저 저장소를 쓸 수 없어 이 탭을 닫으면 내용이 사라집니다');
}
boot();
