// V4: 대시보드 · 라벨 보기 · 주제 보기 (목록 자리에 그리는 페이지)
// st.ui.page = { kind: 'list' | 'dash' | 'label' | 'topic', id }
import * as S from './store.js';
import { st, liveTasks, taskById, STATUS_LABEL } from './state.js';
import { $, esc, ic, stIcon } from './util.js';
import { renderMd } from './md.js';
import { dayLabel } from './logs.js';
import { vaultPageHtml, vaultLabelSection } from './vaultui.js';

const doc = () => st.doc;
const BUCKETS = [['all', '전체'], ['todo', '대기'], ['in_progress', '진행 중'], ['delayed', '지연 중'], ['done', '완료'], ['canceled', '취소']];
const STALE_DAYS = 7;
const dot = l => `<span class="dot" style="background:${l ? esc(l.color) : 'var(--dot)'}"></span>`;
const md = d => { const [y, m, dd] = d.split('-'); return `${y === S.todayKST().slice(0, 4) ? '' : y.slice(2) + '/'}${+m}/${+dd}`; };
const tasksOfLabel = id => liveTasks().filter(t => (id === 'none' ? !S.taskLabels(doc(), t).length : t.label_ids.includes(id)));
const tasksOfTopic = g => liveTasks().filter(t => S.taskTopics(doc(), t).some(x => x.id === g.id));
const ORDER = ['delayed', 'in_progress', 'todo', 'done', 'canceled'];
const byState = now => (a, b) => ORDER.indexOf(S.displayStatus(a, now)) - ORDER.indexOf(S.displayStatus(b, now)) || S.compareDefault(a, b);

// 숫자 칸: 누르면 그 조건으로 걸러진 목록으로 이동 (0이면 누를 수 없음)
function countCells(c, scope) {
  return BUCKETS.map(([k]) => `<td class="n ${k}">${c[k] ? `<button type="button" data-act="go-list" data-scope="${esc(scope)}" data-st="${k}" aria-label="${STATUS_LABEL[k] || '전체'} ${c[k]}건 목록 보기">${c[k]}</button>` : '<span>0</span>'}</td>`).join('');
}
function statChips(c, scope) {
  return `<div class="stchips">${BUCKETS.map(([k, l]) => `<button type="button" class="stc ${k}" data-act="go-list" data-scope="${esc(scope)}" data-st="${k}"${c[k] ? '' : ' disabled'}><b>${c[k]}</b>${l}</button>`).join('')}</div>`;
}
// 작은 Task 줄: 상태 아이콘, 제목, 라벨 점, 마감, 날짜별 체크 요약
function taskRow(t, now, { showLabels = true } = {}) {
  const ds = S.displayStatus(t, now);
  const ls = S.taskLabels(doc(), t);
  const sm = S.dayCheckOn(t) && !S.isFin(t) ? S.dayCheckSummary(t, now.date) : null;
  const last = S.lastActivity(t);
  return `<article class="trow${S.isFin(t) ? ' fin' : ''}" data-act="open" data-id="${t.id}"${st.ui.selectedId === t.id ? ' aria-current="true"' : ''}>
    ${stIcon(ds)}<span class="tt">${esc(t.title)}</span>
    ${showLabels ? `<span class="tl3">${ls.map(dot).join('')}</span>` : ''}
    <span class="tm">${t.due_date ? `<span class="${ds === 'delayed' ? 'late' : ''}">마감 ${md(t.due_date)}</span>` : ''}${sm ? `<span class="${sm.warn ? 'warn' : ''}">${esc(sm.text)}</span>` : last && !S.isFin(t) ? `<span>최근 ${md(last)}</span>` : ''}</span>
  </article>`;
}
function logsFeed(tasks, limit) {
  const ids = new Set(tasks.map(t => t.id));
  const logs = st.logs.logs.filter(l => !l.deleted_at && l.task_ids.some(id => ids.has(id))).sort(S.compareLogs);
  if (!logs.length) return '<p class="hint">아직 이력이 없습니다.</p>';
  let html = '', cur = '';
  for (const l of logs.slice(0, limit)) {
    if (l.work_date !== cur) { cur = l.work_date; html += `<div class="tld"><span>${dayLabel(cur)}</span></div>`; }
    const ts = l.task_ids.map(taskById).filter(Boolean);
    html += `<article class="tle"><div class="tlm lk2">${ts.map(t => `<button type="button" data-act="open" data-id="${t.id}" title="${esc(t.title)}">${esc(t.title)}</button>`).join('')}</div><div class="md">${renderMd(l.body)}</div></article>`;
  }
  return `<div class="tl">${html}</div>${logs.length > limit ? `<p class="hint">최근 ${limit}건만 표시 (전체 ${logs.length}건)</p>` : ''}`;
}
const head = (title, back, extra = '') => `<div class="pgh">${back ? `<button type="button" class="icbtn" data-act="${back.act}"${back.id ? ` data-id="${back.id}"` : ''} aria-label="${esc(back.label)}">${ic('chevL')}</button>` : ''}<h2>${title}</h2>${extra}</div>`;

// ---------- 대시보드 ----------
export const dashOpen = new Set(); // 주제 줄을 펼친 라벨
function dashHtml() {
  const now = S.nowKST();
  const all = liveTasks();
  const total = S.statusCounts(all, now);
  const week = S.addDays(now.date, -6);
  const logs7 = st.logs.logs.filter(l => !l.deleted_at && l.work_date >= week).length;
  const stale = all.filter(t => !S.isFin(t) && t.status === 'in_progress')
    .map(t => ({ t, last: S.lastActivity(t) || S.kstDateOf(t.created_at) }))
    .filter(x => S.dayDiff(x.last, now.date) >= STALE_DAYS)
    .sort((a, b) => (a.last < b.last ? -1 : 1));
  const labels = S.liveLabels(doc()).filter(l => !l.archived || tasksOfLabel(l.id).length);
  const rows = labels.map(l => {
    const c = S.statusCounts(tasksOfLabel(l.id), now);
    const topics = S.topicsOfLabel(doc(), l.id, { archived: true }).filter(g => !g.archived || tasksOfTopic(g).length);
    const open = dashOpen.has(l.id);
    return `<tr class="lr"><th scope="row"><div class="lc">${topics.length ? `<button type="button" class="tg" data-act="dash-toggle" data-id="${l.id}" aria-expanded="${open}" aria-label="${esc(l.name)} 주제 펼치기">${ic('chev')}</button>` : '<span class="tgs"></span>'}<button type="button" class="ln" data-act="label-view" data-id="${l.id}">${dot(l)}<span>${esc(l.name)}</span></button></div></th>${countCells(c, 'label:' + l.id)}</tr>`
      + (open ? topics.map(g => `<tr class="gr"><th scope="row"><button type="button" class="ln" data-act="topic-view" data-id="${g.id}">${ic('tag')}<span>${esc(g.name)}</span></button></th>${countCells(S.statusCounts(tasksOfTopic(g), now), 'topic:' + g.id)}</tr>`).join('') : '');
  }).join('');
  const none = tasksOfLabel('none');
  const noneRow = none.length ? `<tr class="lr"><th scope="row"><div class="lc"><span class="tgs"></span><button type="button" class="ln" data-act="label-view" data-id="none">${dot(null)}<span>미분류</span></button></div></th>${countCells(S.statusCounts(none, now), 'label:none')}</tr>` : '';
  return `${head('대시보드')}
  <div class="kpis">
    <button type="button" class="kpi" data-act="go-list" data-scope="all" data-st="in_progress"><b>${total.in_progress}</b>진행 중</button>
    <button type="button" class="kpi warn" data-act="go-list" data-scope="all" data-st="delayed"${total.delayed ? '' : ' disabled'}><b>${total.delayed}</b>지연 중</button>
    <a class="kpi${stale.length ? ' warn' : ''}" href="#stale"><b>${stale.length}</b>${STALE_DAYS}일+ 손 안 댐</a>
    <div class="kpi"><b>${logs7}</b>최근 7일 이력</div>
  </div>
  <section class="pgs"><h3>라벨별 현황</h3>
    ${labels.length || none.length ? `<div class="tblw"><table class="dtbl"><thead><tr><th scope="col">라벨</th>${BUCKETS.map(([, l]) => `<th scope="col">${l}</th>`).join('')}</tr></thead>
      <tbody>${rows}${noneRow}</tbody>
      <tfoot><tr><th scope="row">전체 Task</th>${countCells(total, 'all')}</tr></tfoot></table></div>
      <p class="hint">Task 하나에 라벨이 여러 개면 각 라벨에 모두 집계되므로, 라벨별 합계는 맨 아래 "전체 Task"보다 클 수 있습니다. 숫자를 누르면 해당 목록으로 이동합니다.</p>`
      : '<p class="hint">아직 라벨이 없습니다.</p>'}
  </section>
  <section class="pgs" id="stale"><h3>${STALE_DAYS}일 이상 손대지 않은 진행 중 Task</h3>
    ${stale.length ? `<div class="trows">${stale.map(x => taskRow(x.t, now)).join('')}</div>` : '<p class="hint">없습니다.</p>'}
  </section>`;
}

// ---------- 라벨 보기 ----------
function labelHtml(id) {
  const now = S.nowKST();
  const l = id === 'none' ? null : S.labelById(doc(), id);
  if (id !== 'none' && !l) return head('라벨을 찾을 수 없습니다', { act: 'page-dash', label: '대시보드로' });
  const tasks = tasksOfLabel(id).sort(byState(now));
  const c = S.statusCounts(tasks, now);
  const topics = l ? S.topicsOfLabel(doc(), l.id, { archived: true }) : [];
  const topicRows = topics.map(g => {
    const ts = tasksOfTopic(g);
    if (g.archived && !ts.length) return '';
    const gc = S.statusCounts(ts, now);
    return `<button type="button" class="grow${g.archived ? ' arch' : ''}" data-act="topic-view" data-id="${g.id}">
      <span class="gn">${ic('tag')}<b>${esc(g.name)}</b>${g.archived ? '<em>보관</em>' : ''}</span>
      ${g.memo ? `<span class="gm2">${esc(g.memo)}</span>` : ''}
      <span class="gcs">${[['delayed', '지연'], ['in_progress', '진행'], ['todo', '대기'], ['done', '완료']].filter(([k]) => gc[k]).map(([k, lb]) => `<span class="${k}">${lb} ${gc[k]}</span>`).join('') || '<span>Task 없음</span>'}</span>
      ${ic('chevR', '', 'go')}</button>`;
  }).join('');
  const loose = l ? tasks.filter(t => !S.taskTopics(doc(), t).some(g => g.label_id === l.id)) : tasks;
  const name = l ? `${dot(l)}${esc(l.name)}` : `${dot(null)}미분류`;
  return `${head(name, { act: 'page-dash', label: '대시보드로' }, `<button type="button" class="btn xs" data-act="go-list" data-scope="label:${id}" data-st="all">목록으로</button>`)}
    ${l?.memo ? `<p class="pgmemo">${esc(l.memo)}</p>` : ''}
    ${statChips(c, 'label:' + id)}
    ${l ? `<section class="pgs"><h3>주제 <span class="n">${topics.filter(g => !g.archived).length}</span></h3>${topicRows || '<p class="hint">주제가 없습니다. 라벨·주제 관리에서 추가할 수 있습니다.</p>'}</section>` : ''}
    <section class="pgs"><h3>${l ? '주제 없는 Task' : 'Task'} <span class="n">${loose.length}</span></h3>${loose.length ? `<div class="trows">${loose.map(t => taskRow(t, now, { showLabels: false })).join('')}</div>` : '<p class="hint">없습니다.</p>'}</section>
    ${l ? vaultLabelSection(l.id) : ''}
    <section class="pgs"><h3>최근 이력</h3>${logsFeed(tasks, 15)}</section>`;
}

// ---------- 주제 보기 ----------
function topicHtml(id) {
  const now = S.nowKST();
  const g = S.topicById(doc(), id);
  if (!g) return head('주제를 찾을 수 없습니다', { act: 'page-dash', label: '대시보드로' });
  const l = S.labelById(doc(), g.label_id);
  const tasks = tasksOfTopic(g).sort(byState(now));
  const c = S.statusCounts(tasks, now);
  return `${head(`${ic('tag')}${esc(g.name)}`, { act: 'label-view', id: g.label_id, label: `${l?.name || ''} 라벨 보기로` }, `<button type="button" class="btn xs" data-act="go-list" data-scope="topic:${g.id}" data-st="all">목록으로</button>`)}
    <p class="pgsub"><button type="button" class="lnk" data-act="label-view" data-id="${g.label_id}">${dot(l)}${esc(l?.name || '')}</button>${g.archived ? ' · 보관됨' : ''}</p>
    ${g.memo ? `<p class="pgmemo">${esc(g.memo)}</p>` : ''}
    ${statChips(c, 'topic:' + g.id)}
    <section class="pgs"><h3>Task <span class="n">${tasks.length}</span></h3>${tasks.length ? `<div class="trows">${tasks.map(t => taskRow(t, now)).join('')}</div>` : '<p class="hint">이 주제에 연결된 Task가 없습니다.</p>'}</section>
    <section class="pgs"><h3>이력 모아 보기</h3>${logsFeed(tasks, 50)}</section>`;
}

export function renderPage() {
  const p = st.ui.page;
  const isList = p.kind === 'list';
  $('#list').hidden = !isList;
  $('.bar').hidden = !isList;
  $('#page').hidden = isList;
  document.querySelector('.app').dataset.page = p.kind;
  if (isList) return;
  const html = p.kind === 'dash' ? dashHtml() : p.kind === 'label' ? labelHtml(p.id) : p.kind === 'vault' ? vaultPageHtml() : topicHtml(p.id);
  const el = $('#page');
  const keep = el.dataset.key === p.kind + (p.id || '') ? el.scrollTop : 0;
  el.innerHTML = html;
  el.dataset.key = p.kind + (p.id || '');
  el.scrollTop = keep;
}

// 목록 위 라벨 머리말: 사이드바에서 라벨을 골랐을 때 메모와 "라벨 보기"
export function labelHeadHtml() {
  const f = st.ui.filter;
  if (f === 'all') return '';
  const l = f === 'none' ? null : S.labelById(doc(), f);
  if (f !== 'none' && !l) return '';
  return `<div class="lhead">${dot(l)}<b>${l ? esc(l.name) : '미분류'}</b>${l?.memo ? `<span class="lm">${esc(l.memo)}</span>` : ''}<button type="button" class="btn xs" data-act="label-view" data-id="${f}">라벨 보기${ic('chevR')}</button></div>`;
}
