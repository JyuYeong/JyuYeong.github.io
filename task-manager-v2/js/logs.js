// 작업 이력: 상세 패널 타임라인 + 입력·수정 시트
import * as S from './store.js';
import { st, liveTasks, taskById } from './state.js';
import { $, esc, ic, stIcon, openDlg, dlg } from './util.js';
import { renderMd } from './md.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kstTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const hm = iso => { const d = new Date(iso); return isNaN(d) ? '' : kstTime.format(d); };
export const dayLabel = d => {
  const [y, m, dd] = d.split('-');
  return `${y === S.todayKST().slice(0, 4) ? '' : y + '. '}${+m}/${+dd} (${WD[S.weekdayOf(d)]})`;
};

// ---------- 타임라인 ----------
export function timelineHtml(t) {
  const logs = S.logsOfTask(st.logs, t.id);
  const head = `<div class="shrow"><span class="sh0">작업 이력${logs.length ? ` <span class="n">${logs.length}</span>` : ''}</span><button type="button" class="btn xs" data-act="log-new">${ic('plus')}이력 추가</button></div>`;
  if (!logs.length) return `${head}<p class="hint">아직 이력이 없습니다. 오늘 한 일을 짧게 남기면 날짜별 체크에도 표시됩니다.</p>`;
  let html = '', cur = '';
  for (const l of logs) {
    if (l.work_date !== cur) {
      cur = l.work_date;
      const over = t.due_date && cur > t.due_date ? `<em class="ov">마감 +${S.dayDiff(t.due_date, cur)}일</em>` : '';
      html += `<div class="tld" data-date="${cur}"><span>${dayLabel(cur)}</span>${over}</div>`;
    }
    const others = l.task_ids.filter(id => id !== t.id).map(taskById).filter(Boolean);
    const link = others.length ? `<span class="lk">${ic('link')}${others.slice(0, 2).map(o => `<button type="button" data-act="open" data-id="${o.id}" title="${esc(o.title)} (${o.id})">${esc(o.title)}</button>`).join('')}${others.length > 2 ? `<span class="more">+${others.length - 2}</span>` : ''}</span>` : '';
    const edited = l.updated_at && l.created_at && (new Date(l.updated_at) - new Date(l.created_at) > 60000) ? ' · 수정됨' : '';
    html += `<article class="tle" id="log-${l.id}">
      <div class="tlm"><time title="작성 ${esc(l.created_at)}">${hm(l.created_at)}${edited}</time>${link}<button type="button" class="icbtn xs" data-act="log-menu" data-id="${l.id}" aria-label="이력 메뉴" aria-haspopup="menu">${ic('dots')}</button></div>
      <div class="md">${renderMd(l.body)}</div></article>`;
  }
  return `${head}<div class="tl">${html}</div>`;
}

// 이력이 있는 날짜(또는 특정 이력)로 이동해 잠깐 강조
export function scrollToLog({ date, id }) {
  const el = id ? $(`#log-${id}`) : $(`#panel .tld[data-date="${date}"]`);
  if (!el) return false;
  el.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const target = id ? el : el.nextElementSibling;
  target?.classList.add('flash');
  setTimeout(() => target?.classList.remove('flash'), 1600);
  return true;
}

// ---------- 입력·수정 시트 ----------
export const composer = { editId: null, taskIds: [], preview: false, query: '' };

function linkedChipsHtml() {
  return composer.taskIds.map(taskById).filter(Boolean).map(t => `<span class="lkc">${stIcon(S.displayStatus(t))}<span class="t">${esc(t.title)}</span>${composer.taskIds.length > 1 ? `<button type="button" data-act="lg-unlink" data-id="${t.id}" aria-label="${esc(t.title)} 연결 해제">${ic('x')}</button>` : ''}</span>`).join('');
}
function suggestHtml() {
  const q = composer.query.trim().toLowerCase();
  if (!q) return '';
  const list = liveTasks().filter(t => !composer.taskIds.includes(t.id) && `${t.title} ${t.id}`.toLowerCase().includes(q))
    .sort((a, b) => (S.isFin(a) !== S.isFin(b) ? (S.isFin(a) ? 1 : -1) : S.compareDefault(a, b))).slice(0, 8);
  if (!list.length) return '<p class="hint">맞는 Task가 없습니다.</p>';
  return list.map(t => `<button type="button" class="sug" data-act="lg-link" data-id="${t.id}">${stIcon(S.displayStatus(t))}<span class="t">${esc(t.title)}</span><span class="sub">${t.id}</span></button>`).join('');
}
export const refreshLinked = () => { const a = $('#lgLinked'); if (a) a.innerHTML = linkedChipsHtml(); const b = $('#lgSug'); if (b) b.innerHTML = suggestHtml(); refreshDateNote(); };
export const refreshSuggest = () => { const b = $('#lgSug'); if (b) b.innerHTML = suggestHtml(); };

// 작업일이 연결된 Task 중 어느 것의 마감보다 늦으면 안내
export function refreshDateNote() {
  const inp = $('#lgDate'), note = $('#lgDateNote');
  if (!inp || !note) return;
  const d = inp.value;
  const late = composer.taskIds.map(taskById).filter(t => t && t.due_date && d > t.due_date);
  note.textContent = late.length ? `마감 이후 작업입니다 (${late.map(t => `${t.title} +${S.dayDiff(t.due_date, d)}일`).join(', ')})` : '';
}
export function refreshCount() {
  const ta = $('#lgBody'), c = $('#lgCount');
  if (!ta || !c) return;
  const n = ta.value.length;
  c.textContent = `${n.toLocaleString()}자`;
  c.classList.toggle('warn', n > S.LOG_SOFT_LIMIT);
  c.title = n > S.LOG_SOFT_LIMIT ? '길어졌습니다. 자세한 내용은 Obsidian에 두고 요점만 남기는 것을 권합니다' : '';
}

export function openComposer(taskId, editId = null) {
  const l = editId ? S.logById(st.logs, editId) : null;
  composer.editId = l ? l.id : null;
  composer.taskIds = l ? l.task_ids.filter(id => taskById(id)) : [taskId];
  composer.preview = false;
  composer.query = '';
  const today = S.todayKST();
  openDlg('log', l ? '이력 수정' : '이력 추가', `<form id="logForm" autocomplete="off">
    <div class="lgrow"><label class="fl" for="lgDate">작업일</label><input class="in xs" type="date" id="lgDate" name="work_date" max="${today}" value="${l ? l.work_date : today}" required><span class="lgnote" id="lgDateNote"></span></div>
    <div class="fsec"><span class="fl">연결 Task</span><div class="lktasks" id="lgLinked">${linkedChipsHtml()}</div>
      <input class="in xs" type="search" id="lgSearch" placeholder="다른 Task도 연결 (제목·ID 검색)" aria-label="연결할 Task 검색"><div class="lgsug" id="lgSug"></div></div>
    <div class="mdbar" role="toolbar" aria-label="서식">
      <button type="button" data-act="md-h" title="제목">H</button><button type="button" data-act="md-b" title="굵게"><b>B</b></button><button type="button" data-act="md-li" title="글머리">•</button><button type="button" data-act="md-cb" title="체크 항목">☐</button><button type="button" data-act="md-code" title="코드">&lt;/&gt;</button>
      <button type="button" class="pvbtn" data-act="md-preview" aria-pressed="false">미리보기</button></div>
    <textarea class="in mdin" id="lgBody" name="body" rows="7" placeholder="요점만 짧게. 마크다운 사용 가능 (## 제목, **굵게**, - 글머리, - [ ] 체크)">${l ? esc(l.body) : ''}</textarea>
    <div class="md mdprev" id="lgPrev" hidden></div>
    <p class="hint">이력은 암호화되지 않습니다. 계정·고객사 네트워크 상세 같은 민감 정보는 넣지 마세요. <span class="cnt2" id="lgCount">0자</span></p>
    <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">${l ? '저장' : '추가'}</button></div>
  </form>`);
  refreshDateNote(); refreshCount();
  const ta = $('#lgBody');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

// 서식 버튼: 선택 영역을 감싸거나 줄 앞에 기호를 붙인다
export function mdFormat(kind) {
  const ta = $('#lgBody');
  if (!ta) return;
  const { selectionStart: a, selectionEnd: b, value: v } = ta;
  const sel = v.slice(a, b);
  let out, ca, cb;
  if (kind === 'b' || kind === 'code') {
    const multi = kind === 'code' && sel.includes('\n');
    const w = kind === 'b' ? '**' : multi ? '```\n' : '`';
    const w2 = multi ? '\n```' : w;
    out = v.slice(0, a) + w + sel + w2 + v.slice(b);
    ca = a + w.length; cb = ca + sel.length;
  } else {
    const prefix = { h: '## ', li: '- ', cb: '- [ ] ' }[kind];
    const ls = v.lastIndexOf('\n', a - 1) + 1;
    const block = v.slice(ls, b);
    const lines = block.split('\n').map(x => (x.startsWith(prefix) ? x.slice(prefix.length) : prefix + x));
    const nb = lines.join('\n');
    out = v.slice(0, ls) + nb + v.slice(b);
    ca = ls; cb = ls + nb.length;
    if (a === b) ca = cb;
  }
  ta.value = out;
  ta.focus();
  ta.setSelectionRange(ca, cb);
  refreshCount();
}
export function togglePreview(btn) {
  composer.preview = !composer.preview;
  const ta = $('#lgBody'), pv = $('#lgPrev');
  pv.innerHTML = renderMd(ta.value) || '<p class="hint">내용이 없습니다.</p>';
  pv.hidden = !composer.preview; ta.hidden = composer.preview;
  btn.setAttribute('aria-pressed', String(composer.preview));
  dlg.querySelectorAll('.mdbar [data-act^="md-"]:not(.pvbtn)').forEach(b => { b.disabled = composer.preview; });
}
