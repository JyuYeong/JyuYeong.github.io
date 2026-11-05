// 작업 이력: 상세 패널 타임라인 + 입력·수정 시트
import * as S from './store.js';
import { st, liveTasks, taskById } from './state.js';
import { $, esc, ic, stIcon, openDlg, dlg } from './util.js';
import { renderMd } from './md.js';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kstTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
// 작성·수정 시각: 타임라인에는 보이지 않고(본문에 적은 시각과 헷갈리지 않도록) 툴팁과 수정 화면에서만 보인다
const stampText = l => {
  const f = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${S.kstDateOf(iso).slice(5).replace('-', '/')} ${kstTime.format(d)}`; };
  const edited = l.updated_at && l.created_at && (new Date(l.updated_at) - new Date(l.created_at) > 60000);
  return `작성 ${f(l.created_at)}${edited ? ` · 수정 ${f(l.updated_at)}` : ''}`;
};
export const dayLabel = d => {
  const [y, m, dd] = d.split('-');
  return `${y === S.todayKST().slice(0, 4) ? '' : y + '. '}${+m}/${+dd} (${WD[S.weekdayOf(d)]})`;
};

// 이력에 연결된 라벨·주제 버튼 (누르면 라벨 보기·주제 보기)
const dotOf = l => `<span class="dot" style="background:${l ? esc(l.color) : 'var(--dot)'}"></span>`;
export function scopeBtns(l) {
  const labs = (l.label_ids || []).map(id => S.labelById(st.doc, id)).filter(Boolean);
  const tops = (l.topic_ids || []).map(id => S.topicById(st.doc, id)).filter(Boolean);
  return labs.map(x => `<button type="button" class="sc" data-act="label-view" data-id="${x.id}" title="라벨: ${esc(x.name)}">${dotOf(x)}${esc(x.name)}</button>`).join('')
    + tops.map(g => `<button type="button" class="sc" data-act="topic-view" data-id="${g.id}" title="주제: ${esc(S.labelById(st.doc, g.label_id)?.name || '')} › ${esc(g.name)}">${ic('tag')}${esc(g.name)}</button>`).join('');
}

// ---------- 타임라인 ----------
// 타임라인 걸러 보기 (이 기기, 이번 세션만): 'all' | 'work' | 'event'
export const tl = { filter: 'all' };
export function timelineHtml(t) {
  const all = S.logsOfTask(st.logs, t.id);
  const nEv = all.filter(l => S.logKind(l) === 'event').length;
  const logs = tl.filter === 'all' ? all : all.filter(l => S.logKind(l) === tl.filter);
  const seg = nEv ? `<div class="seg xs tlf" role="group" aria-label="이력 걸러 보기">${[['all', '전체'], ['work', `작업 ${all.length - nEv}`], ['event', `발생 ${nEv}`]].map(([v, l]) => `<button type="button" data-act="tl-filter" data-v="${v}" aria-pressed="${tl.filter === v}">${l}</button>`).join('')}</div>` : '';
  const head = `<div class="shrow"><span class="sh0">작업 이력${all.length ? ` <span class="n">${all.length}</span>` : ''}</span><button type="button" class="btn xs" data-act="log-new">${ic('plus')}이력 추가</button></div>${seg}`;
  if (!all.length) return `${head}<p class="hint">아직 이력이 없습니다. 내가 한 일은 "작업", 이 Task와 관련해 일어난 일(장애 발생, 고객 요청 등)은 "발생"으로 남기세요. 작업만 날짜별 체크에 표시됩니다.</p>`;
  if (!logs.length) return `${head}<p class="hint">해당하는 이력이 없습니다.</p>`;
  let html = '', cur = '';
  for (const l of logs) {
    if (l.work_date !== cur) {
      cur = l.work_date;
      const over = t.due_date && cur > t.due_date ? `<em class="ov">마감 +${S.dayDiff(t.due_date, cur)}일</em>` : '';
      html += `<div class="tld" data-date="${cur}"><span>${dayLabel(cur)}</span>${over}</div>`;
    }
    const others = l.task_ids.filter(id => id !== t.id).map(taskById).filter(Boolean);
    const scopes = scopeBtns(l);
    const link = (scopes ? `<span class="lk">${scopes}</span>` : '') + (others.length ? `<span class="lk">${ic('link')}${others.slice(0, 2).map(o => `<button type="button" data-act="open" data-id="${o.id}" title="${esc(o.title)} (${o.id})">${esc(o.title)}</button>`).join('')}${others.length > 2 ? `<span class="more">+${others.length - 2}</span>` : ''}</span>` : '');
    const ev = S.logKind(l) === 'event';
    html += `<article class="tle${ev ? ' ev' : ''}" id="log-${l.id}" title="${esc(stampText(l))}">
      <div class="tlm">${ev ? '<span class="kb ev">발생</span>' : ''}${link}<button type="button" class="icbtn xs" data-act="log-menu" data-id="${l.id}" aria-label="이력 메뉴" aria-haspopup="menu">${ic('dots')}</button></div>
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
export const composer = { editId: null, taskIds: [], labelIds: [], topicIds: [], preview: false, query: '', kind: 'work' };
export const linkTotal = () => composer.taskIds.length + composer.labelIds.length + composer.topicIds.length;
const topicName = g => `${S.labelById(st.doc, g.label_id)?.name || ''} › ${g.name}`;

function linkedChipsHtml() {
  const x = linkTotal() > 1;
  const un = (type, id, name) => (x ? `<button type="button" data-act="lg-unlink" data-type="${type}" data-id="${id}" aria-label="${esc(name)} 연결 해제">${ic('x')}</button>` : '');
  return composer.labelIds.map(id => S.labelById(st.doc, id)).filter(Boolean).map(l => `<span class="lkc sc">${dotOf(l)}<span class="t"><small>라벨</small>${esc(l.name)}</span>${un('label', l.id, l.name)}</span>`).join('')
    + composer.topicIds.map(id => S.topicById(st.doc, id)).filter(Boolean).map(g => `<span class="lkc sc">${ic('tag')}<span class="t"><small>주제</small>${esc(topicName(g))}</span>${un('topic', g.id, g.name)}</span>`).join('')
    + composer.taskIds.map(taskById).filter(Boolean).map(t => `<span class="lkc">${stIcon(S.displayStatus(t))}<span class="t">${esc(t.title)}</span>${un('task', t.id, t.title)}</span>`).join('');
}
// 연결할 Task 찾기: 검색어를 띄어 쓴 단어마다 나눠, 모든 단어가 어딘가에 들어 있으면 찾는다 (순서·위치 무관, 공백·대소문자 무시, 한글 초성 가능)
// 찾는 곳: 제목, Task ID, 메모, 라벨, 주제, 이력 본문. 제목에서 찾은 것을 먼저 보여 준다
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CHO_SET = new Set([...CHO]);
const norm = x => String(x ?? '').normalize('NFC').toLowerCase().replace(/[\s\-_.]+/g, '');
const cho = x => [...norm(x)].map(ch => { const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch; }).join('');
const hit = (t, text) => !!text && (norm(text).includes(t) || ([...t].every(ch => CHO_SET.has(ch)) && cho(text).includes(t)));
export function findTasks(query, exclude = composer.taskIds) {
  const terms = String(query || '').normalize('NFC').trim().split(/\s+/).map(norm).filter(Boolean);
  if (!terms.length) return [];
  const out = [];
  for (const t of liveTasks()) {
    if (exclude.includes(t.id)) continue;
    const title = [t.title, t.id];
    const other = [t.memo, ...S.taskLabels(st.doc, t).map(l => l.name), ...S.taskTopics(st.doc, t).map(g => g.name), ...S.logsOfTask(st.logs, t.id).map(l => l.body)];
    let score = 0, ok = true;
    for (const term of terms) {
      if (title.some(x => hit(term, x))) continue;
      if (other.some(x => hit(term, x))) { score += 1; continue; }
      ok = false; break;
    }
    if (ok) out.push({ t, score, where: score ? '메모·라벨·주제·이력에서 찾음' : '' });
  }
  return out.sort((a, b) => a.score - b.score || (S.isFin(a.t) !== S.isFin(b.t) ? (S.isFin(a.t) ? 1 : -1) : S.compareDefault(a.t, b.t)));
}
// 라벨·주제 찾기: 이름(주제는 "라벨 주제"로)·메모에 모든 단어가 들어 있으면. 보관된 것도 찾는다
function findScopes(query) {
  const terms = String(query || '').normalize('NFC').trim().split(/\s+/).map(norm).filter(Boolean);
  if (!terms.length) return [];
  const ok = texts => terms.every(term => texts.some(x => hit(term, x)));
  const out = [];
  for (const l of S.liveLabels(st.doc)) if (!composer.labelIds.includes(l.id) && ok([l.name, l.memo])) out.push({ type: 'label', x: l });
  for (const l of S.liveLabels(st.doc)) for (const g of S.topicsOfLabel(st.doc, l.id, { archived: true })) if (!composer.topicIds.includes(g.id) && ok([g.name, g.memo, `${l.name} ${g.name}`])) out.push({ type: 'topic', x: g });
  return out;
}
function suggestHtml() {
  if (!composer.query.trim()) return '';
  const all = findTasks(composer.query);
  const sc = findScopes(composer.query).slice(0, 5);
  if (!all.length && !sc.length) return '<p class="hint">맞는 라벨·주제·Task가 없습니다. 단어를 줄이거나 다른 단어로 찾아보세요.</p>';
  const list = all.slice(0, 10);
  return sc.map(({ type, x }) => type === 'label'
    ? `<button type="button" class="sug" data-act="lg-link" data-type="label" data-id="${x.id}">${dotOf(x)}<span class="t">${esc(x.name)}${x.archived ? '<small>보관됨</small>' : ''}</span><span class="sub">라벨</span></button>`
    : `<button type="button" class="sug" data-act="lg-link" data-type="topic" data-id="${x.id}">${ic('tag')}<span class="t">${esc(topicName(x))}${x.archived ? '<small>보관됨</small>' : ''}</span><span class="sub">주제</span></button>`).join('')
    + list.map(({ t, where }) => `<button type="button" class="sug" data-act="lg-link" data-id="${t.id}">${stIcon(S.displayStatus(t))}<span class="t">${esc(t.title)}${where ? `<small>${where}</small>` : ''}</span><span class="sub">${t.id}</span></button>`).join('')
    + (all.length > list.length ? `<p class="hint">${all.length}건 중 10건만 표시. 단어를 더 넣어 좁혀 보세요.</p>` : '');
}
export const refreshLinked = () => { const a = $('#lgLinked'); if (a) a.innerHTML = linkedChipsHtml(); const b = $('#lgSug'); if (b) b.innerHTML = suggestHtml(); refreshDateNote(); };
export const refreshSuggest = () => { const b = $('#lgSug'); if (b) b.innerHTML = suggestHtml(); };

// 작업일이 연결된 Task 중 어느 것의 마감보다 늦으면 안내
export function refreshDateNote() {
  const inp = $('#lgDate'), note = $('#lgDateNote');
  if (!inp || !note) return;
  const d = inp.value;
  const late = composer.taskIds.map(taskById).filter(t => t && t.due_date && d > t.due_date);
  note.textContent = late.length ? `마감 이후 ${composer.kind === 'event' ? '발생' : '작업'}입니다 (${late.map(t => `${t.title} +${S.dayDiff(t.due_date, d)}일`).join(', ')})` : '';
}
export function refreshCount() {
  const ta = $('#lgBody'), c = $('#lgCount');
  if (!ta || !c) return;
  const n = ta.value.length;
  c.textContent = `${n.toLocaleString()}자`;
  c.classList.toggle('warn', n > S.LOG_SOFT_LIMIT);
  c.title = n > S.LOG_SOFT_LIMIT ? '길어졌습니다. 자세한 내용은 Obsidian에 두고 요점만 남기는 것을 권합니다' : '';
}

// target: Task ID 하나, 또는 { taskIds, labelIds, topicIds } (라벨 보기·주제 보기에서 남길 때). 수정이면 이력의 연결을 그대로 쓴다
export function openComposer(target, editId = null) {
  const l = editId ? S.logById(st.logs, editId) : null;
  const tg = typeof target === 'string' ? { taskIds: [target] } : (target || {});
  composer.editId = l ? l.id : null;
  composer.taskIds = l ? l.task_ids.filter(id => taskById(id)) : [...(tg.taskIds || [])];
  composer.labelIds = l ? (l.label_ids || []).filter(id => S.labelById(st.doc, id)) : [...(tg.labelIds || [])];
  composer.topicIds = l ? (l.topic_ids || []).filter(id => S.topicById(st.doc, id)) : [...(tg.topicIds || [])];
  composer.preview = false;
  composer.query = '';
  composer.kind = l ? S.logKind(l) : 'work';
  const today = S.todayKST();
  openDlg('log', l ? '이력 수정' : '이력 추가', `<form id="logForm" autocomplete="off">
    <div class="seg xs lgkind" role="group" aria-label="이력 종류">${Object.entries(S.LOG_KINDS).map(([v, lb]) => `<button type="button" data-act="lg-kind" data-v="${v}" aria-pressed="${composer.kind === v}">${v === 'work' ? '작업 · 내가 한 일' : '발생 · 일어난 일'}</button>`).join('')}</div>
    <div class="lgrow"><label class="fl" for="lgDate" id="lgDateLbl">${composer.kind === 'event' ? '발생일' : '작업일'}</label><input class="in xs" type="date" id="lgDate" name="work_date" max="${today}" value="${l ? l.work_date : today}" required><span class="lgnote" id="lgDateNote"></span></div>
    <div class="fsec"><span class="fl">연결 대상</span><div class="lktasks" id="lgLinked">${linkedChipsHtml()}</div>
      <input class="in xs" type="search" id="lgSearch" placeholder="라벨·주제·Task 더 연결 (기억나는 단어 아무거나)" aria-label="연결할 라벨·주제·Task 검색"><div class="lgsug" id="lgSug"></div></div>
    ${mdBarHtml()}
    <textarea class="in mdin" id="lgBody" name="body" rows="7" placeholder="요점만 짧게. 마크다운 사용 가능 (## 제목, **굵게**, - 글머리, - [ ] 체크)">${l ? esc(l.body) : ''}</textarea>
    <div class="md mdprev" id="lgPrev" hidden></div>
    ${l ? `<p class="hint">${esc(stampText(l))}</p>` : ''}
    <p class="hint">이력은 암호화되지 않습니다. 계정·고객사 네트워크 상세 같은 민감 정보는 넣지 마세요. <span class="cnt2" id="lgCount">0자</span></p>
    <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">${l ? '저장' : '추가'}</button></div>
  </form>`);
  setKind(composer.kind); refreshCount();
  const ta = $('#lgBody');
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

// 서식 도구 막대 (작업 이력 창·보안메모 창 공용). 지금 열린 창의 textarea.mdin / .mdprev에 적용한다
export const mdBarHtml = () => `<div class="mdbar" role="toolbar" aria-label="서식">
      <button type="button" data-act="md-h" title="제목">H</button><button type="button" data-act="md-b" title="굵게"><b>B</b></button><button type="button" data-act="md-li" title="글머리">•</button><button type="button" data-act="md-ol" title="번호 목록">1.</button><button type="button" data-act="md-q" title="인용">❝</button><button type="button" data-act="md-cb" title="체크 항목">☐</button><button type="button" data-act="md-code" title="코드 (여러 줄을 고르면 코드 블록)">&lt;/&gt;</button>
      <button type="button" class="pvbtn" data-act="md-preview" aria-pressed="false">미리보기</button></div>`;
// 서식 버튼: 선택 영역을 감싸거나 줄 앞에 기호를 붙인다
export function mdFormat(kind) {
  const ta = dlg.querySelector('textarea.mdin');
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
    const prefix = { h: '## ', li: '- ', ol: '1. ', q: '> ', cb: '- [ ] ' }[kind];
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
export function setKind(v) {
  composer.kind = v === 'event' ? 'event' : 'work';
  document.querySelectorAll('[data-act="lg-kind"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === composer.kind)));
  const lbl = $('#lgDateLbl'); if (lbl) lbl.textContent = composer.kind === 'event' ? '발생일' : '작업일';
  $('#logForm')?.classList.toggle('ev', composer.kind === 'event');
  refreshDateNote();
}
export function togglePreview(btn) {
  const on = btn.getAttribute('aria-pressed') !== 'true';
  if (dlg.querySelector('#logForm')) composer.preview = on;
  const ta = dlg.querySelector('textarea.mdin'), pv = dlg.querySelector('.mdprev');
  if (!ta || !pv) return;
  pv.innerHTML = renderMd(ta.value) || '<p class="hint">내용이 없습니다.</p>';
  pv.hidden = !on; ta.hidden = on;
  btn.setAttribute('aria-pressed', String(on));
  dlg.querySelectorAll('.mdbar [data-act^="md-"]:not(.pvbtn)').forEach(b => { b.disabled = on; });
}
