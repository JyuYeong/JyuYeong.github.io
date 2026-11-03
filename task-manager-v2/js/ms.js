// V5.6 마일스톤: Task마다 선택해서 쓰는 단계 목록. 아는 단계까지만 적어 두고 순서·추가·삭제는 자유
// 지금 단계 = 완료되지 않은 첫 단계. 단계를 완료하면 작업 이력("작업")이 자동으로 남는다
import * as S from './store.js';
import { st, persistLogs, selTask, liveTasks, taskById } from './state.js';
import { $, esc, ic, toast, dlg, openDlg, armed } from './util.js';
import { touch, renderPanel } from './render.js';

const md = d => { const [y, m, dd] = d.split('-'); return `${y === S.todayKST().slice(0, 4) ? '' : y.slice(2) + '/'}${+m}/${+dd}`; };
const newId = () => 'M' + Math.random().toString(36).slice(2, 8);
const NAME_MAX = 60;

// ---------- 데이터 ----------
export const msOf = t => (Array.isArray(t.milestones) ? t.milestones : []);
export const msCurIndex = t => msOf(t).findIndex(m => !m.done);
// 지금 단계에 머문 날: 바로 앞 단계 완료일(없으면 단계를 적은 날)부터
function curSince(t, i) {
  const ms = msOf(t);
  for (let k = i - 1; k >= 0; k--) if (ms[k].done) return ms[k].done;
  return ms[i].added || S.kstDateOf(t.created_at);
}
function stayText(t, i, today) {
  const n = S.dayDiff(curSince(t, i), today);
  return n <= 0 ? '오늘부터' : `${n + 1}일째`;
}
function addMs(t, names) {
  const today = S.todayKST();
  const have = new Set(msOf(t).map(m => m.name.toLowerCase()));
  let n = 0;
  for (const raw of names) {
    const name = String(raw || '').trim().slice(0, NAME_MAX);
    if (!name || have.has(name.toLowerCase())) continue;
    have.add(name.toLowerCase());
    t.milestones = [...msOf(t), { id: newId(), name, done: null, added: today, log_id: null }];
    n++;
  }
  return n;
}
const find = (t, mid) => msOf(t).find(m => m.id === mid);

// ---------- 목록 카드 ----------
export function msCardHtml(t, now) {
  const ms = msOf(t);
  if (!ms.length) return '';
  const i = msCurIndex(t), done = ms.filter(m => m.done).length;
  const fin = S.isFin(t);
  const dots = ms.length <= 12 ? `<span class="msdots" aria-hidden="true">${ms.map((m, k) => `<i class="${m.done ? 'd' : k === i ? 'c' : ''}"></i>`).join('')}</span>` : `<span class="msfrac">${done}/${ms.length}</span>`;
  let text;
  if (i >= 0) text = `<span class="msn">${esc(ms[i].name)}</span>${fin ? '' : `<span class="msd">${stayText(t, i, now.date)}</span>`}`;
  else text = fin ? '<span class="msd">모든 단계 완료</span>' : '<span class="msn nx">다음 단계 미정</span>';
  return `<div class="msline${fin ? ' fin' : ''}" title="마일스톤 ${done}/${ms.length}${i >= 0 ? ` · 지금: ${esc(ms[i].name)}` : ''}">${dots}${text}</div>`;
}

// ---------- 상세 ----------
let editFor = null; // 편집 모드인 Task ID
export function msPanelHtml(t) {
  const ms = msOf(t);
  const editing = editFor === t.id && ms.length > 0;
  const i = msCurIndex(t), done = ms.filter(m => m.done).length;
  const today = S.todayKST();
  const head = `<div class="shrow"><span class="sh0">마일스톤${ms.length ? ` <span class="n">${done}/${ms.length}</span>` : ''}</span>
    ${ms.length ? `<button type="button" class="btn xs" data-act="ms-edit" aria-pressed="${editing}">${editing ? '편집 끝' : '편집'}</button>` : ''}</div>`;
  let rows = '';
  if (editing) {
    rows = ms.map((m, k) => `<li class="ms ed${m.done ? ' done' : ''}" draggable="true" data-mid="${m.id}">
      <span class="msgrip" title="끌어서 순서 바꾸기" aria-hidden="true">${ic('dots')}</span>
      <input class="in xs" data-ms-name="${m.id}" value="${esc(m.name)}" maxlength="${NAME_MAX}" aria-label="${k + 1}단계 이름" enterkeyhint="done">
      <button type="button" class="icbtn xs" data-act="ms-up" data-mid="${m.id}" aria-label="위로"${k === 0 ? ' disabled' : ''}>${ic('up')}</button>
      <button type="button" class="icbtn xs" data-act="ms-down" data-mid="${m.id}" aria-label="아래로"${k === ms.length - 1 ? ' disabled' : ''}>${ic('down')}</button>
      <button type="button" class="icbtn xs" data-act="ms-del" data-mid="${m.id}" aria-label="${esc(m.name)} 삭제">${ic('trash')}</button></li>`).join('');
  } else {
    rows = ms.map((m, k) => {
      const cls = m.done ? 'done' : k === i ? 'cur' : 'todo';
      const sub = m.done ? `${md(m.done)} 완료` : k === i && !S.isFin(t) ? stayText(t, k, today) : '';
      const lbl = m.done ? `${m.name}: ${md(m.done)} 완료됨. 완료를 취소하려면 선택` : `${m.name}: 완료로 표시하려면 선택`;
      return `<li class="ms ${cls}"><button type="button" class="msb" data-act="ms-tap" data-mid="${m.id}" aria-label="${esc(lbl)}"><i>${m.done ? ic('check') : ''}</i><span class="msn">${esc(m.name)}</span>${sub ? `<span class="msm">${sub}</span>` : ''}</button></li>`;
    }).join('');
  }
  const next = ms.length && i < 0 && !S.isFin(t) ? '<p class="hint msnext">알고 있는 단계를 모두 마쳤습니다. 다음 단계가 정해지면 추가하세요.</p>' : '';
  const empty = !ms.length ? '<p class="hint">아는 단계까지만 적어 두고, 끝날 때마다 눌러 완료하세요. 순서·추가·삭제는 언제든 바꿀 수 있습니다.</p>' : '';
  const others = liveTasks().some(x => x.id !== t.id && msOf(x).length);
  return `${head}${empty}${ms.length ? `<ol class="mslist${editing ? ' editing' : ''}">${rows}</ol>` : ''}${next}
    <div class="msadd"><input class="in xs" id="msAdd" maxlength="${NAME_MAX}" placeholder="+ 단계 추가 (Enter)" aria-label="마일스톤 단계 추가" enterkeyhint="done">
    ${others && (!ms.length || editing) ? `<button type="button" class="btn xs" data-act="ms-import">다른 Task에서 가져오기</button>` : ''}</div>`;
}
const refreshSec = focusSel => {
  const t = selTask(), sec = $('#msSec');
  if (!t || !sec) return renderPanel();
  sec.innerHTML = msPanelHtml(t);
  if (focusSel) $(`#msSec ${focusSel}`)?.focus();
};
const save = (t, focusSel) => { touch(t); refreshSec(focusSel); };

// ---------- 완료·취소 ----------
function doneDialog(t, m) {
  const today = S.todayKST();
  openDlg('msdone', '단계 완료', `<form id="msDoneForm" data-tid="${t.id}" data-mid="${m.id}" class="vform" autocomplete="off">
    <p class="msdn">${ic('check')}<b>${esc(m.name)}</b></p>
    <label class="fl" for="msDate">완료일</label><input class="in xs" type="date" id="msDate" max="${today}" value="${today}" required>
    <label class="fl" for="msNote">한 줄 메모 (선택)</label><input class="in" id="msNote" maxlength="300" placeholder="예: 벤더에서 조치 버전 전달 받음" enterkeyhint="done">
    <p class="hint">작업 이력에 “작업”으로 남고, 그날 날짜별 체크에 반영됩니다.</p>
    <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">완료</button></div></form>`);
  $('#msNote').focus();
}
function completeMs(t, m, date, note) {
  const body = `**단계 완료** · ${m.name}${note ? `\n\n${note}` : ''}`;
  const l = S.createLog(st.logs, { task_ids: [t.id], work_date: date, body, kind: 'work' });
  m.done = date; m.log_id = l.id;
  t.milestones = [...msOf(t)];
  // 작업 이력과 같은 규칙: 대기 중이면 진행 중으로
  const moved = t.status === 'todo';
  if (moved) { t.status = 'in_progress'; t.completed_at = null; }
  persistLogs(); touch(t); renderPanel();
  const i = msCurIndex(t);
  if (i < 0 && !S.isFin(t)) toast('마지막 단계까지 완료했습니다', { act: 'ms-finish', id: t.id, label: 'Task도 완료' });
  else toast(`‘${m.name}’ 완료${i >= 0 ? ` · 다음: ${msOf(t)[i].name}` : ''}${moved ? ' · “진행 중”으로 바꿈' : ''}`);
}
function undoMs(t, m) {
  // 자동으로 남긴 이력은 이 Task에만 연결되어 있으면 함께 지운다
  const l = m.log_id ? S.logById(st.logs, m.log_id) : null;
  const drop = l && S.logLinkCount(l) === 1 && l.task_ids[0] === t.id;
  if (drop) { S.deleteLog(st.logs, l); persistLogs(); }
  m.done = null; m.log_id = null;
  t.milestones = [...msOf(t)];
  touch(t); renderPanel();
  toast(`‘${m.name}’ 완료를 취소했습니다${drop ? ' (자동 이력도 삭제)' : ''}`);
}

// ---------- 다른 Task에서 가져오기 ----------
function importDialog(t) {
  const list = liveTasks().filter(x => x.id !== t.id && msOf(x).length).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 40);
  openDlg('msimport', '마일스톤 가져오기', `<p class="hint">고른 Task의 단계 이름만 복사해 이 Task 뒤에 붙입니다 (완료 표시는 가져오지 않음, 같은 이름은 건너뜀).</p>
    <div class="msimp">${list.map(x => `<button type="button" class="sug" data-act="ms-import-from" data-id="${x.id}"><span class="t">${esc(x.title)}<small>${msOf(x).map(m => esc(m.name)).join(' → ')}</small></span><span class="sub">${msOf(x).length}단계</span></button>`).join('')}</div>`);
}

// ---------- 이벤트 ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act^="ms-"]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  if (act === 'ms-finish') {
    const t = taskById(el.dataset.id);
    if (t && !S.isFin(t)) { t.status = 'done'; t.completed_at = new Date().toISOString(); touch(t); renderPanel(); toast('Task를 완료했습니다'); }
    $('#toast').hidden = true;
    return;
  }
  if (act === 'ms-import-from') {
    const t = selTask(), src = taskById(el.dataset.id);
    if (!t || !src) return;
    const n = addMs(t, msOf(src).map(m => m.name));
    dlg.close(); save(t);
    toast(n ? `${n}단계를 가져왔습니다` : '새로 가져올 단계가 없습니다 (같은 이름은 건너뜀)');
    return;
  }
  const t = selTask();
  if (!t) return;
  const m = el.dataset.mid ? find(t, el.dataset.mid) : null;
  const ms = msOf(t);
  switch (act) {
    case 'ms-tap':
      if (!m) break;
      if (!m.done) doneDialog(t, m);
      else if (armed(el, '한 번 더 누르면 완료 취소')) undoMs(t, m);
      break;
    case 'ms-edit': editFor = editFor === t.id ? null : t.id; refreshSec(); break;
    case 'ms-up': case 'ms-down': {
      const k = ms.indexOf(m), j = k + (act === 'ms-up' ? -1 : 1);
      if (k < 0 || j < 0 || j >= ms.length) break;
      const a = [...ms]; [a[k], a[j]] = [a[j], a[k]];
      t.milestones = a; save(t, `[data-act="${act}"][data-mid="${m.id}"]`);
      break;
    }
    case 'ms-del':
      if (!m) break;
      if (!armed(el, '한 번 더 누르면 삭제')) break;
      t.milestones = ms.filter(x => x !== m);
      if (!t.milestones.length) editFor = null;
      save(t); toast(`‘${m.name}’ 단계를 삭제했습니다${m.log_id ? ' (작업 이력은 그대로)' : ''}`);
      break;
    case 'ms-import': importDialog(t); break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  if (e.target.id === 'msAdd') {
    e.preventDefault();
    const t = selTask();
    if (!t || !e.target.value.trim()) return;
    if (!addMs(t, [e.target.value])) { toast('이미 있는 단계입니다'); return; }
    save(t, '#msAdd');
  } else if (e.target.dataset?.msName) { e.preventDefault(); e.target.blur(); }
});
document.addEventListener('change', e => {
  const mid = e.target.dataset?.msName;
  if (!mid) return;
  const t = selTask(), m = t && find(t, mid);
  if (!m) return;
  const v = e.target.value.trim().slice(0, NAME_MAX);
  if (!v) { e.target.value = m.name; return; }
  if (v === m.name) return;
  m.name = v; t.milestones = [...msOf(t)]; touch(t);
});
// 완료 창
document.addEventListener('submit', e => {
  if (e.target.id !== 'msDoneForm') return;
  e.preventDefault();
  const t = taskById(e.target.dataset.tid), m = t && find(t, e.target.dataset.mid);
  const date = $('#msDate').value;
  if (!m) { dlg.close(); return; }
  if (!date || date > S.todayKST()) { toast('완료일은 오늘 이전이어야 합니다'); return; }
  const note = $('#msNote').value.trim();
  dlg.close();
  completeMs(t, m, date, note);
});
// 편집 모드: 끌어서 순서 바꾸기 (마우스). 휴대폰은 ↑↓ 버튼
let dragId = null;
document.addEventListener('dragstart', e => {
  const li = e.target.closest?.('.mslist.editing .ms');
  if (!li) return;
  dragId = li.dataset.mid; li.classList.add('drag');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragId); } catch { /* 무시 */ }
});
document.addEventListener('dragover', e => {
  if (!dragId) return;
  const li = e.target.closest?.('.mslist.editing .ms');
  if (!li) return;
  e.preventDefault();
  document.querySelectorAll('.mslist .ms.over').forEach(x => x.classList.remove('over'));
  if (li.dataset.mid !== dragId) li.classList.add('over');
});
document.addEventListener('drop', e => {
  if (!dragId) return;
  const li = e.target.closest?.('.mslist.editing .ms');
  e.preventDefault();
  const t = selTask();
  if (li && t && li.dataset.mid !== dragId) {
    const a = [...msOf(t)];
    const from = a.findIndex(m => m.id === dragId), to = a.findIndex(m => m.id === li.dataset.mid);
    const [x] = a.splice(from, 1); a.splice(to, 0, x);
    t.milestones = a; save(t);
  }
  dragId = null;
});
document.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.mslist .ms.drag, .mslist .ms.over').forEach(x => x.classList.remove('drag', 'over')); });
