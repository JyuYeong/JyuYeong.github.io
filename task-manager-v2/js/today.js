// V5.7: 오늘 할 일 — 오늘 지금 할 일과 처리 순서. 빠른 입력(# 으로 Task 연결), 끌어서 순서 변경, Keep(나중으로 미루기)
// 데이터는 core 문서의 checks (store.js). 화면은 #page에 그리되, 입력칸은 다시 그려도 지워지지 않도록 뼈대를 유지한다
import * as S from './store.js';
import { st, taskById, persist } from './state.js';
import { $, esc, ic, stIcon, toast, openDlg, dlg, openMenu } from './util.js';
import { findTasks, dayLabel } from './logs.js';
import { renderList, renderSide, renderPanel, touch } from './render.js';

const doc = () => st.doc;
const now = () => new Date().toISOString();
const md = d => { const [, m, dd] = d.split('-'); return `${+m}/${+dd}`; };
// 이번 세션만 기억하는 접힘 상태
const ui = { doneOpen: true, keepOpen: true, histOpen: false, sug: [], sugIdx: 0, taskId: null };
let dragging = false;

export const remainingCount = () => (st.doc ? S.activeChecks(st.doc).length : 0);

// ---------- 그리기 ----------
function taskChip(c) {
  if (!c.task_id) return '';
  const t = taskById(c.task_id);
  if (!t) return '<span class="tdtask gone">삭제된 Task</span>';
  return `<button type="button" class="tdtask" data-act="open" data-id="${t.id}" title="${esc(t.title)} (${t.id})">${stIcon(S.displayStatus(t))}<span>${esc(t.title)}</span></button>`;
}
function activeRow(c, i, today) {
  const n = S.carryDays(c, today);
  return `<li class="td" data-cid="${c.id}">
    <span class="tdgrip" data-grip title="끌어서 순서 변경 (Alt+↑/↓)">${ic('grip')}</span>
    <button type="button" class="tdck" data-act="td-done" data-cid="${c.id}" aria-label="“${esc(c.title)}” 완료"></button>
    <div class="tdb"><span class="tdt">${esc(c.title)}</span>${n || c.task_id ? `<span class="tdm">${n ? `<span class="tdcarry" title="${md(c.day)}부터 미뤄짐">+${n}일</span>` : ''}${taskChip(c)}</span>` : ''}</div>
    <button type="button" class="icbtn xs tdtop" data-act="td-top" data-cid="${c.id}" aria-label="맨 위로"${i === 0 ? ' disabled' : ''}>${ic('top')}</button>
    <button type="button" class="icbtn xs" data-act="td-menu" data-cid="${c.id}" aria-label="메뉴" aria-haspopup="menu">${ic('dots')}</button>
  </li>`;
}
function doneRow(c, past = false) {
  return `<li class="td fin" data-cid="${c.id}">
    ${past ? `<span class="tdck on" aria-hidden="true">${ic('check')}</span>` : `<button type="button" class="tdck on" data-act="td-undone" data-cid="${c.id}" aria-label="“${esc(c.title)}” 완료 취소">${ic('check')}</button>`}
    <div class="tdb"><span class="tdt">${esc(c.title)}</span>${c.task_id ? `<span class="tdm">${taskChip(c)}</span>` : ''}</div>
    ${past ? '' : `<button type="button" class="icbtn xs" data-act="td-menu" data-cid="${c.id}" aria-label="메뉴" aria-haspopup="menu">${ic('dots')}</button>`}
  </li>`;
}
function keepRow(c) {
  return `<li class="td kept" data-cid="${c.id}">
    <span class="tdkd">${c.day ? `${md(c.day)}에 다시` : '날짜 없음'}</span>
    <div class="tdb"><span class="tdt">${esc(c.title)}</span>${c.task_id ? `<span class="tdm">${taskChip(c)}</span>` : ''}</div>
    <button type="button" class="btn xs" data-act="td-unkeep" data-cid="${c.id}">오늘로</button>
    <button type="button" class="icbtn xs" data-act="td-menu" data-cid="${c.id}" aria-label="메뉴" aria-haspopup="menu">${ic('dots')}</button>
  </li>`;
}
function histHtml(today) {
  const from = S.addDays(today, -13);
  const done = S.liveChecks(doc()).filter(c => c.done_at && c.done_day && c.done_day < today && c.done_day >= from)
    .sort((a, b) => (a.done_day !== b.done_day ? (a.done_day < b.done_day ? 1 : -1) : a.done_at < b.done_at ? -1 : 1));
  if (!done.length) return '<p class="hint">최근 2주 동안 끝낸 항목이 없습니다.</p>';
  let html = '', cur = '';
  for (const c of done) {
    if (c.done_day !== cur) { if (cur) html += '</ul>'; cur = c.done_day; html += `<div class="tld"><span>${dayLabel(cur)}</span></div><ul class="tdlist">`; }
    html += doneRow(c, true);
  }
  return html + '</ul>';
}
function bodyHtml() {
  const today = S.todayKST();
  const act = S.activeChecks(doc()), done = S.doneChecksOn(doc(), today), kept = S.keptChecks(doc());
  const sec = (key, open, title, n, inner) => `<section class="tdsec"><button type="button" class="gh tdh" data-act="td-sec" data-k="${key}" aria-expanded="${open}">${ic('chev')}${title}<span class="n">${n}</span></button>${open ? inner : ''}</section>`;
  return (act.length ? `<ol class="tdlist" id="tdList">${act.map((c, i) => activeRow(c, i, today)).join('')}</ol>`
    : `<p class="empty tdempty">${done.length ? '오늘 할 일을 모두 끝냈습니다.' : '오늘 할 일을 위에 적어 보세요.<br>순서는 끌어서 바꾸고, 미룰 일은 메뉴에서 Keep 하세요.'}</p>`)
    + (done.length ? sec('done', ui.doneOpen, '완료', done.length, `<ul class="tdlist">${done.map(doneRow).join('')}</ul>`) : '')
    + (kept.length ? sec('keep', ui.keepOpen, 'Keep', kept.length, `<ul class="tdlist">${kept.map(keepRow).join('')}</ul>`) : '')
    + sec('hist', ui.histOpen, '지난 기록', '', ui.histOpen ? histHtml(today) : '');
}
function headCount() {
  const today = S.todayKST();
  const a = S.activeChecks(doc()).length, d = S.doneChecksOn(doc(), today).length;
  return `${dayLabel(today)}${a || d ? ` · 남은 ${a} · 완료 ${d}` : ''}`;
}
function linkHtml() {
  const t = ui.taskId && taskById(ui.taskId);
  if (!t) return '';
  return `<span class="lkc">${ic('link')}<span class="t">${esc(t.title)}</span><button type="button" data-act="td-unlink-new" aria-label="Task 연결 해제">${ic('x')}</button></span>`;
}
function sugHtml() {
  if (!ui.sug.length) return '';
  return ui.sug.map(({ t }, i) => `<button type="button" class="sug${i === ui.sugIdx ? ' on' : ''}" data-act="td-pick" data-id="${t.id}" role="option" aria-selected="${i === ui.sugIdx}">${stIcon(S.displayStatus(t))}<span class="t">${esc(t.title)}</span><span class="sub">${t.id}</span></button>`).join('');
}

// views.js의 renderPage에서 부른다
export function renderToday(el) {
  if (dragging) return;
  if (S.rollChecks(doc())) persist();
  if (el.dataset.key !== 'today') {
    el.innerHTML = `<div class="pgh"><h2>${ic('today')}오늘 할 일</h2></div>
      <p class="pgsub tdsub" id="tdSub"></p>
      <form class="tdform" id="tdForm" autocomplete="off">
        <div class="tdin"><input class="in" id="tdInput" maxlength="200" placeholder="할 일 입력 후 Enter · #으로 Task 연결" aria-label="오늘 할 일 추가" enterkeyhint="done">
        <button type="submit" class="icbtn" aria-label="추가">${ic('plus')}</button></div>
        <div class="tdlink" id="tdLink"></div>
        <div class="tdsug" id="tdSug" role="listbox" aria-label="연결할 Task"></div>
      </form>
      <div id="tdBody"></div>`;
    el.dataset.key = 'today';
    el.scrollTop = 0;
    $('#tdLink').innerHTML = linkHtml();
  }
  $('#tdSub').textContent = headCount();
  $('#tdBody').innerHTML = bodyHtml();
}
const refresh = () => { renderList(); renderSide(); };

// ---------- 입력: # 으로 Task 찾기 ----------
// 검색어가 비어 있으면 끝나지 않은 Task를 기본 순서(마감 순)로
const openTasks = n => st.doc.tasks.filter(t => !t.deleted_at && !S.isFin(t)).sort(S.compareDefault).slice(0, n).map(t => ({ t }));
// 커서 앞의 마지막 '#' 뒤 글자를 검색어로 쓴다 (띄어쓰기 포함, 단어마다 AND)
function hashQuery(input) {
  const before = input.value.slice(0, input.selectionStart ?? input.value.length);
  const i = before.lastIndexOf('#');
  if (i < 0 || (i > 0 && !/\s/.test(before[i - 1]))) return null;
  return { start: i, end: before.length, q: before.slice(i + 1) };
}
function refreshSug() {
  const input = $('#tdInput');
  const h = input && hashQuery(input);
  ui.sug = !h ? [] : h.q.trim() ? findTasks(h.q, []).slice(0, 8) : openTasks(8);
  ui.sugIdx = 0;
  const box = $('#tdSug');
  if (box) box.innerHTML = sugHtml() || (h && h.q.trim() ? '<p class="hint">맞는 Task가 없습니다</p>' : '');
}
function pickTask(id) {
  const input = $('#tdInput');
  const h = hashQuery(input);
  if (h) {
    const v = input.value;
    input.value = (v.slice(0, h.start) + v.slice(h.end)).replace(/\s{2,}/g, ' ');
    input.setSelectionRange(h.start, h.start);
  }
  ui.taskId = id; ui.sug = [];
  $('#tdSug').innerHTML = '';
  $('#tdLink').innerHTML = linkHtml();
  input.focus();
}
function addItems(lines) {
  const items = lines.map(x => x.replace(/(^|\s)#\S*$/, '').trim()).filter(Boolean);
  if (!items.length) return 0;
  for (const title of items) S.createCheck(doc(), { title, task_id: ui.taskId && taskById(ui.taskId) ? ui.taskId : null });
  ui.taskId = null;
  $('#tdLink').innerHTML = '';
  persist(); refresh();
  const list = $('#tdList');
  list?.lastElementChild?.scrollIntoView({ block: 'nearest' });
  return items.length;
}

document.addEventListener('input', e => { if (e.target.id === 'tdInput') refreshSug(); });
document.addEventListener('keydown', e => {
  if (e.target.id === 'tdInput') {
    if (ui.sug.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      ui.sugIdx = (ui.sugIdx + (e.key === 'ArrowDown' ? 1 : -1) + ui.sug.length) % ui.sug.length;
      $('#tdSug').innerHTML = sugHtml();
      return;
    }
    if (ui.sug.length && (e.key === 'Enter' || e.key === 'Tab') && !e.isComposing) { e.preventDefault(); pickTask(ui.sug[ui.sugIdx].t.id); return; }
    if (e.key === 'Escape' && ui.sug.length) { e.preventDefault(); ui.sug = []; $('#tdSug').innerHTML = ''; return; }
    return;
  }
  // 오늘 목록 안에서 Alt+↑/↓ 로 순서 변경
  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const li = e.target.closest?.('#tdList .td');
    if (!li) return;
    e.preventDefault();
    const ids = [...$('#tdList').children].map(x => x.dataset.cid);
    const i = ids.indexOf(li.dataset.cid), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    S.reorderChecks(doc(), ids); persist(); refresh();
    $(`#tdList .td[data-cid="${li.dataset.cid}"] .tdck`)?.focus();
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'tdForm') return;
  e.preventDefault();
  const input = $('#tdInput');
  if (ui.sug.length) { pickTask(ui.sug[ui.sugIdx].t.id); return; }
  if (addItems([input.value])) input.value = '';
  input.focus();
});
// 여러 줄을 붙여 넣으면 줄마다 하나씩
document.addEventListener('paste', e => {
  if (e.target.id !== 'tdInput') return;
  const text = e.clipboardData?.getData('text') || '';
  if (!/[\r\n]/.test(text.trim())) return;
  e.preventDefault();
  const n = addItems(text.split(/\r?\n/).map(x => x.replace(/^\s*([-*•]|\d+[.)]|\[[ xX]?\])\s+/, '')));
  if (n) toast(`${n}개를 추가했습니다`);
});

// ---------- 완료 · 날짜별 체크 연동 ----------
// 연결 Task가 있으면 완료할 때 그 Task의 오늘 날짜별 체크를 찍는다 (대기 → 진행 중). 작업 이력은 남기지 않는다
function setDone(c, on) {
  const today = S.todayKST();
  const t = c.task_id ? taskById(c.task_id) : null;
  let msg = '';
  if (on) {
    Object.assign(c, { done_at: now(), done_day: today, marked: false });
    if (t && !S.isWorked(t, today)) {
      S.toggleMarked(t, today); c.marked = true;
      if (t.status === 'todo') { t.status = 'in_progress'; t.completed_at = null; msg = `“${t.title}” 상태를 “진행 중”으로 바꿨습니다`; }
      touch(t);
    }
  } else {
    // 이 항목이 찍은 점은, 같은 날 같은 Task로 끝낸 다른 항목이 없을 때만 지운다
    if (t && c.marked && c.done_day && t.marked_days.includes(c.done_day)) {
      const other = S.liveChecks(doc()).some(x => x.id !== c.id && x.task_id === t.id && x.done_day === c.done_day && x.done_at);
      if (!other) { S.toggleMarked(t, c.done_day); touch(t); }
    }
    Object.assign(c, { done_at: null, done_day: null, marked: false });
  }
  c.updated_at = now();
  persist(); refresh();
  if (t && st.ui.selectedId === t.id) renderPanel();
  if (msg) toast(msg);
}

// ---------- 메뉴 · 대화상자 ----------
function keepDialog(c) {
  const tmr = S.addDays(S.todayKST(), 1);
  openDlg('tdkeep', 'Keep — 다시 꺼낼 날', `<form id="tdKeepForm" data-cid="${c.id}" class="dlg-b" style="padding:0" autocomplete="off">
    <p class="hint">“${esc(c.title)}”</p>
    <input class="in" type="date" name="day" min="${tmr}" value="${c.keep && c.day ? c.day : tmr}" aria-label="다시 꺼낼 날" required>
    <p class="hint">그날 아침 오늘 할 일 맨 아래로 돌아옵니다.</p>
    <button class="btn primary" type="submit">Keep</button></form>`);
  dlg.querySelector('input[type=date]').focus();
}
function editDialog(c) {
  openDlg('tdedit', '이름 고치기', `<form id="tdEditForm" data-cid="${c.id}" class="dlg-b" style="padding:0" autocomplete="off">
    <input class="in" name="title" maxlength="200" value="${esc(c.title)}" aria-label="할 일" required>
    <button class="btn primary" type="submit">저장</button></form>`);
  const i = dlg.querySelector('input'); i.focus(); i.select();
}
function linkDialog(c) {
  openDlg('tdlinkdlg', 'Task 연결', `<div data-cid="${c.id}" id="tdLinkDlg">
    <input class="in" id="tdLinkQ" placeholder="기억나는 단어로 찾기 (제목·ID·메모·라벨·주제·이력)" aria-label="Task 찾기" autocomplete="off">
    <div class="sugs" id="tdLinkSug">${linkSugHtml('')}</div></div>`);
  $('#tdLinkQ').focus();
}
function linkSugHtml(q) {
  const list = q.trim() ? findTasks(q, []).slice(0, 10) : openTasks(10);
  if (!list.length) return '<p class="hint">맞는 Task가 없습니다</p>';
  return list.map(({ t }) => `<button type="button" class="sug" data-act="td-link-pick" data-id="${t.id}">${stIcon(S.displayStatus(t))}<span class="t">${esc(t.title)}</span><span class="sub">${t.id}</span></button>`).join('');
}
dlg.addEventListener('input', e => { if (e.target.id === 'tdLinkQ') $('#tdLinkSug').innerHTML = linkSugHtml(e.target.value); });
dlg.addEventListener('keydown', e => { if (e.target.id === 'tdLinkQ' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('#tdLinkSug .sug')?.click(); } });
dlg.addEventListener('submit', e => {
  const f = e.target;
  if (f.id !== 'tdKeepForm' && f.id !== 'tdEditForm') return;
  e.preventDefault();
  const c = S.checkById(doc(), f.dataset.cid);
  if (!c) { dlg.close(); return; }
  const fd = new FormData(f);
  if (f.id === 'tdKeepForm') {
    const day = String(fd.get('day') || '');
    if (!day || day <= S.todayKST()) { toast('내일 이후 날짜를 고르세요'); return; }
    S.keepCheck(c, day); toast(`${md(day)}에 다시 꺼냅니다`);
  } else {
    const title = String(fd.get('title') || '').trim().slice(0, 200);
    if (!title) return;
    c.title = title; c.updated_at = now();
  }
  persist(); dlg.close(); refresh();
});

function itemMenu(anchor, c) {
  const t = c.task_id ? taskById(c.task_id) : null;
  const items = [];
  const tmr = S.addDays(S.todayKST(), 1);
  const keepTo = day => () => { S.keepCheck(c, day); persist(); refresh(); toast(day ? `${md(day)}에 다시 꺼냅니다` : 'Keep에 보관했습니다'); };
  if (!c.done_at) {
    items.push({ head: true, label: 'Keep (나중으로)' });
    items.push({ label: '내일', sub: md(tmr), onPick: keepTo(tmr) });
    items.push({ label: '날짜 지정…', onPick: () => keepDialog(c) });
    items.push({ label: '날짜 없이 보관', onPick: keepTo(null) });
    if (c.keep) items.push({ label: '오늘로 꺼내기', onPick: () => { S.unkeepCheck(doc(), c); persist(); refresh(); } });
    items.push({ head: true, label: '항목' });
  }
  items.push({ label: '이름 고치기', icon: ic('edit'), onPick: () => editDialog(c) });
  items.push({ label: t ? 'Task 바꾸기…' : 'Task 연결…', icon: ic('link'), onPick: () => linkDialog(c) });
  if (c.task_id) items.push({ label: 'Task 연결 해제', onPick: () => { c.task_id = null; c.updated_at = now(); persist(); refresh(); } });
  items.push({ label: '삭제', icon: ic('trash'), onPick: () => {
    c.deleted_at = now(); c.updated_at = c.deleted_at; persist(); refresh();
    toast('삭제했습니다', { act: 'td-restore', id: c.id, label: '실행 취소' });
  } });
  openMenu(anchor, items);
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="td-"]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const c = el.dataset.cid ? S.checkById(doc(), el.dataset.cid) : null;
  switch (act) {
    case 'td-done': if (c) setDone(c, true); break;
    case 'td-undone': if (c) setDone(c, false); break;
    case 'td-top': if (c) { S.checkToTop(doc(), c); persist(); refresh(); $('#tdList .td .tdck')?.focus(); } break;
    case 'td-menu': if (c) itemMenu(el, c); break;
    case 'td-unkeep': if (c) { S.unkeepCheck(doc(), c); persist(); refresh(); } break;
    case 'td-sec': { const k = el.dataset.k + 'Open'; ui[k] = !ui[k]; refresh(); $(`[data-act="td-sec"][data-k="${el.dataset.k}"]`)?.focus(); break; }
    case 'td-pick': e.preventDefault(); pickTask(el.dataset.id); break;
    case 'td-unlink-new': ui.taskId = null; $('#tdLink').innerHTML = ''; $('#tdInput').focus(); break;
    case 'td-link-pick': {
      const x = S.checkById(doc(), $('#tdLinkDlg')?.dataset.cid);
      if (x) { x.task_id = el.dataset.id; x.updated_at = now(); persist(); refresh(); }
      dlg.close();
      break;
    }
    case 'td-restore': {
      const x = doc().checks.find(k => k.id === el.dataset.id);
      if (x) { x.deleted_at = null; x.updated_at = now(); persist(); refresh(); }
      $('#toast').hidden = true;
      break;
    }
  }
});

// ---------- 끌어서 순서 변경 (마우스·터치 공통, 손잡이로) ----------
document.addEventListener('pointerdown', e => {
  const grip = e.target.closest('#tdList [data-grip]');
  if (!grip || e.button > 0) return;
  e.preventDefault();
  const li = grip.closest('.td'), list = li.parentElement, scroller = $('#page');
  dragging = true;
  li.classList.add('drag');
  // 행을 옮기면 포인터 캡처가 풀리므로 document에서 받는다
  let lastY = e.clientY, raf = 0;
  const startIds = [...list.children].map(x => x.dataset.cid).join();
  const place = y => {
    for (const sib of list.children) {
      if (sib === li) continue;
      const r = sib.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (y < mid && sib.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING) { list.insertBefore(li, sib); return; }
      if (y > mid && sib.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_PRECEDING) { list.insertBefore(li, sib.nextSibling); }
    }
  };
  // 화면 가장자리에 가까우면 스크롤
  const edge = () => {
    const r = scroller.getBoundingClientRect();
    const d = lastY < r.top + 48 ? -8 : lastY > r.bottom - 48 ? 8 : 0;
    if (d) { scroller.scrollTop += d; place(lastY); }
    raf = dragging ? requestAnimationFrame(edge) : 0;
  };
  raf = requestAnimationFrame(edge);
  const pid = e.pointerId;
  const move = ev => { if (ev.pointerId !== pid) return; ev.preventDefault(); lastY = ev.clientY; place(lastY); };
  const up = ev => {
    if (ev.pointerId !== pid) return;
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    cancelAnimationFrame(raf);
    dragging = false;
    li.classList.remove('drag');
    const ids = [...list.children].map(x => x.dataset.cid);
    if (ids.join() !== startIds) { S.reorderChecks(doc(), ids); persist(); }
    refresh();
  };
  document.addEventListener('pointermove', move, { passive: false });
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
});
