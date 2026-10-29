// 화면 그리기: 사이드바·칩, 목록(카드·진행 기간 중 묶음), 상세 패널, 티커
import * as S from './store.js';
import { st, liveTasks, taskById, selTask, persist, STATUS_LABEL, URG_LABEL, URG_RANK, SORT_LABEL, GROUP_LABEL } from './state.js';
import { $, esc, ic, stIcon, wide } from './util.js';
import { timelineHtml } from './logs.js';
import { plainMd } from './md.js';
import { renderPage, labelHeadHtml } from './views.js';

const doc = () => st.doc;
const labels = () => S.liveLabels(doc());
const labelOf = id => S.labelById(doc(), id);

// ---------- 날짜 표시 ----------
export const md = d => {
  const [y, m, dd] = d.split('-');
  return `${y === S.todayKST().slice(0, 4) ? '' : y.slice(2) + '/'}${+m}/${+dd}`;
};
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const kstFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function fmtTs(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) return '';
  const p = Object.fromEntries(kstFmt.formatToParts(d).map(x => [x.type, x.value]));
  return `${md(`${p.year}-${p.month}-${p.day}`)} ${p.hour}:${p.minute}`;
}

// ---------- 조회·필터 ----------
function matches(t, now) {
  const q = st.q;
  const ds = S.displayStatus(t, now);
  if (q.statuses.length) { if (!q.statuses.includes(ds) && !q.statuses.includes(t.status)) return false; }
  else if (q.hideDone && S.isFin(t)) return false;
  if (q.urgencies.length && !q.urgencies.includes(t.urgency)) return false;
  if (q.labels.length) {
    const has = id => (id === 'none' ? !S.taskLabels(doc(), t).length : t.label_ids.includes(id));
    if (q.labelMode === 'all' ? !q.labels.every(has) : !q.labels.some(has)) return false;
  }
  if (q.topics.length) {
    const tps = S.taskTopics(doc(), t).map(g => g.id);
    if (!q.topics.some(id => (id === 'none' ? !tps.length : tps.includes(id)))) return false;
  }
  if (q.text) {
    const hay = [t.title, t.memo, t.id, ...S.taskTopics(doc(), t).map(g => g.name), ...S.taskLabels(doc(), t).map(l => l.name), ...S.logsOfTask(st.logs, t.id).map(l => plainMd(l.body))].join(' ').toLowerCase();
    if (!hay.includes(q.text.toLowerCase())) return false;
  }
  if (q.due !== 'any') {
    if (q.due === 'none') return !t.due_date;
    if (!t.due_date) return false;
    const diff = S.dayDiff(now.date, t.due_date);
    if (q.due === 'overdue') return S.isDelayed(t, now);
    if (q.due === 'today') return diff === 0;
    if (q.due === 'week') return diff >= 0 && diff <= 6;
  }
  return true;
}
function cmpBy(a, b) {
  const q = st.q;
  const str = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const dir = q.dir === 'desc' ? -1 : 1;
  let r = 0;
  if (q.sort === 'due') return dir === 1 ? S.compareDefault(a, b) : (S.isFin(a) !== S.isFin(b) ? (S.isFin(a) ? 1 : -1) : -S.compareDefault(a, b));
  if (q.sort === 'start') r = (!a.start_date || !b.start_date) ? (a.start_date ? -1 : b.start_date ? 1 : 0) : str(a.start_date, b.start_date) * dir;
  else if (q.sort === 'urgency') r = (URG_RANK[a.urgency] - URG_RANK[b.urgency]) * dir;
  else if (q.sort === 'created') r = str(a.created_at, b.created_at) * dir;
  else if (q.sort === 'title') r = a.title.localeCompare(b.title, 'ko') * dir;
  return r || S.compareDefault(a, b);
}
export const inSideFilter = t => {
  const f = st.ui.filter;
  return f === 'all' ? true : f === 'none' ? !S.taskLabels(doc(), t).length : t.label_ids.includes(f);
};
export function visibleTasks() {
  const now = S.nowKST();
  return liveTasks().filter(inSideFilter).filter(t => matches(t, now)).sort(cmpBy);
}
// 그룹: 라벨·주제는 여러 개면 각 그룹에 한 번씩 나온다
function groupsOf(t, now) {
  const L = labels();
  switch (st.q.group) {
    case 'label': {
      const ls = S.taskLabels(doc(), t);
      return ls.length ? ls.map(l => [L.indexOf(l), l.name]) : [[9999, '미분류']];
    }
    case 'topic': {
      const gs = S.taskTopics(doc(), t);
      if (!gs.length) return [[1e9, '주제 없음']];
      return gs.map(g => { const l = labelOf(g.label_id); return [L.indexOf(l) * 100000 + S.topicsOfLabel(doc(), l.id, { archived: true }).indexOf(g), `${l.name} · ${g.name}`]; });
    }
    case 'urgency': return [[URG_RANK[t.urgency], URG_LABEL[t.urgency]]];
    case 'status': { const ds = S.displayStatus(t, now); return [[['delayed', 'in_progress', 'todo', 'done', 'canceled'].indexOf(ds), STATUS_LABEL[ds]]]; }
    case 'due': {
      if (S.isFin(t)) return [[9, '완료/취소']];
      if (!t.due_date) return [[4, '마감일 없음']];
      if (S.isDelayed(t, now)) return [[0, '지연']];
      const d = S.dayDiff(now.date, t.due_date);
      return [d === 0 ? [1, '오늘'] : d <= 6 ? [2, '7일 이내'] : [3, '이후']];
    }
  }
  return [[0, '']];
}
export function filterActiveCount() {
  const q = st.q;
  return (q.text ? 1 : 0) + (q.statuses.length ? 1 : 0) + (q.urgencies.length ? 1 : 0) + (q.labels.length ? 1 : 0) + (q.topics.length ? 1 : 0)
    + (q.due !== 'any' ? 1 : 0) + (q.group !== 'none' ? 1 : 0) + (q.sort !== 'due' || q.dir !== 'asc' ? 1 : 0) + (!q.hideDone && !q.statuses.length ? 1 : 0);
}

// ---------- 저장 + 다시 그리기 ----------
export function touch(t) {
  t.updated_at = new Date().toISOString();
  persist();
  renderList();
  renderSide();
  const ft = $('#tsFoot');
  if (ft && st.ui.selectedId === t.id) ft.innerHTML = tsFootHtml(t);
}

// ---------- 작은 조각 ----------
const dot = l => `<span class="dot" style="background:${l ? esc(l.color) : 'var(--dot)'}"></span>`;
function labelTags(t, max = 2) {
  const ls = S.taskLabels(doc(), t);
  if (!ls.length) return `<span class="lb none">${dot(null)}미분류</span>`;
  const more = ls.length - max;
  return ls.slice(0, max).map(l => `<button type="button" class="lb" data-act="label-view" data-id="${l.id}" title="${esc(l.name)} 라벨 보기">${dot(l)}<span class="t">${esc(l.name)}</span></button>`).join('')
    + (more > 0 ? `<span class="more" title="${esc(ls.slice(max).map(l => l.name).join(', '))}">+${more}</span>` : '');
}
function topicTags(t, max = 2) {
  const gs = S.taskTopics(doc(), t);
  const more = gs.length - max;
  return gs.slice(0, max).map(g => `<button type="button" class="topic" data-act="topic-view" data-id="${g.id}" title="주제 보기: ${esc(g.name)}${g.memo ? ' — ' + esc(g.memo) : ''}">${ic('tag')}<span class="t">${esc(g.name)}</span></button>`).join('')
    + (more > 0 ? `<span class="more" title="${esc(gs.slice(max).map(g => g.name).join(', '))}">+${more}</span>` : '');
}
function datesHtml(t, now) {
  const parts = [];
  if (t.due_date) {
    const late = S.isDelayed(t, now);
    let suffix = '';
    if (!S.isFin(t)) {
      const diff = S.dayDiff(now.date, t.due_date);
      suffix = diff > 0 ? ` · D-${diff}` : diff === 0 ? (late ? ' · 시간 지남' : ' · D-Day') : ` · ${-diff}일 지연`;
    }
    parts.push(`<span class="d${late ? ' late' : !S.isFin(t) ? ' due' : ''}">${t.due_time ? ic('clock') : ''}마감 ${md(t.due_date)}${t.due_time ? ' ' + t.due_time : ''}${suffix}</span>`);
  }
  if (t.start_date) parts.push(`<span class="d">시작 ${md(t.start_date)}</span>`);
  const n = S.logCount(t.id);
  if (n) parts.push(`<span class="d lg" title="작업 이력 ${n}건">${ic('note')}이력 ${n} · 최근 ${md(S.lastLogDate(t.id))}</span>`);
  return parts.length ? `<div class="dates">${parts.join('')}</div>` : '';
}
const successorsOf = t => liveTasks().filter(s => s.blocked_by === t.id);
function depBadges(t) {
  if (S.isFin(t)) return '';
  let h = '';
  const pred = t.blocked_by ? taskById(t.blocked_by) : null;
  if (pred && !S.isFin(pred)) h += `<span class="badge dep" title="먼저 완료되어야 함: ${esc(pred.title)} (${pred.id})">선행 필요 · ${esc(pred.title)}</span>`;
  const n = successorsOf(t).filter(s => !S.isFin(s)).length;
  if (n) h += `<span class="badge dep" title="이 Task가 끝나야 진행할 수 있는 후속 Task ${n}건">후속 작업 ${n > 1 ? n + '건' : '있음'}</span>`;
  return h;
}

// ---------- 날짜별 체크 ----------
// 카드: 범위가 7일 이하면 전부, 길면 오늘을 가운데 둔 7칸. 마감 이후 칸은 빨강
function dayWindow(r, today) {
  const all = S.rangeDays(r.start, r.end);
  if (all.length <= 7) return { days: all, cutL: false, cutR: false };
  let i = all.indexOf(today);
  if (i < 0) i = today < r.start ? 0 : all.length - 1;
  const s = Math.max(0, Math.min(i - 3, all.length - 7));
  return { days: all.slice(s, s + 7), cutL: s > 0, cutR: s + 7 < all.length };
}
export function dayStripHtml(t, now) {
  const r = S.dcRange(t, now.date);
  if (!r) return '';
  const today = now.date;
  const { days, cutL, cutR } = dayWindow(r, today);
  const can = !S.isFin(t);
  const cell = d => {
    const w = S.isWorked(t, d);
    const cls = `dc${w ? ' on' : ''}${S.isOver(t, d) ? ' over' : ''}${d === today ? ' today' : d > today ? ' fut' : ''}`;
    const inner = `<i></i><b>${+d.slice(8)}</b>`;
    if (d === today && can) return `<button type="button" class="${cls}" data-act="dc-today" data-id="${t.id}" aria-pressed="${w}" aria-label="오늘(${md(d)}) 손댄 날로 ${w ? '표시됨, 해제하려면 선택' : '표시'}" title="오늘 손댄 날로 표시/해제">${inner}</button>`;
    return `<span class="${cls}" title="${md(d)} ${w ? '손댐' : d > today ? '' : '안 함'}${S.isOver(t, d) ? ' (마감 초과)' : ''}">${inner}</span>`;
  };
  const sm = S.dayCheckSummary(t, today);
  return `<div class="dstrip" aria-label="날짜별 체크: ${esc(sm.text)}">${cutL ? '<span class="dcut" aria-hidden="true">…</span>' : ''}${days.map(cell).join('')}${cutR ? '<span class="dcut" aria-hidden="true">…</span>' : ''}<span class="dsum${sm.warn ? ' warn' : ''}">${esc(sm.text)}</span></div>`;
}
function dayCalHtml(t, now) {
  if (!t.start_date || !t.due_date) return '<p class="hint">시작일과 마감일을 모두 넣으면 표시됩니다.</p>';
  if (t.start_date > t.due_date) return '<p class="hint">시작일이 마감일보다 늦어 표시할 수 없습니다.</p>';
  const r = S.dcRange(t, now.date);
  let days = S.rangeDays(r.start, r.end);
  const cut = days.length > S.DC_MAX_DAYS;
  if (cut) days = days.slice(-S.DC_MAX_DAYS);
  const today = now.date;
  const cells = days.map((d, i) => {
    const w = S.isWorked(t, d);
    const label = (i === 0 || d.endsWith('-01')) ? `${+d.slice(5, 7)}/${+d.slice(8)}` : `${+d.slice(8)}`;
    const lg = S.hasLogOn(t, d);
    return `<button type="button" class="cd${w ? ' on' : ''}${lg ? ' lg' : ''}${S.isOver(t, d) ? ' over' : ''}${d === today ? ' today' : ''}" data-act="dc-day" data-d="${d}" aria-pressed="${w}" aria-label="${md(d)}${d === today ? ' 오늘' : ''} ${lg ? '이력 있음, 눌러서 이력 보기' : w ? '손댐' : '안 함'}${S.isOver(t, d) ? ' 마감 초과' : ''}"${d > today ? ' disabled' : ''}><i></i><b>${label}</b></button>`;
  }).join('');
  return `<div class="dcal">${WD.map(x => `<span class="wd">${x}</span>`).join('')}${'<span></span>'.repeat(S.weekdayOf(days[0]))}${cells}</div>
    <p class="hint">${days.length}일 중 ${S.workedIn(t, days[0], days[days.length - 1]).length}일 손댐${cut ? ` · 마지막 ${S.DC_MAX_DAYS}일만 표시` : ''}. 빨간 칸은 마감 이후, 밑줄 칸은 이력이 있는 날(눌러서 이동)입니다.</p>`;
}
function activeSectionHtml(items, now) {
  if (!st.ui.showActive) return '';
  const list = items.filter(t => { const r = S.dcRange(t, now.date); return r && !S.isFin(t) && r.start <= now.date && now.date <= r.end; });
  if (!list.length) return '';
  list.sort((a, b) => { const x = S.lastWorked(a, now.date), y = S.lastWorked(b, now.date); return x < y ? -1 : x > y ? 1 : S.compareDefault(a, b); });
  const rows = st.ui.activeOpen ? list.map(t => {
    const l = S.taskLabels(doc(), t)[0];
    return `<article class="arow" data-act="open" data-id="${t.id}"${st.ui.selectedId === t.id ? ' aria-current="true"' : ''}>
      <div class="at">${dot(l)}<span class="title">${esc(t.title)}</span></div>${dayStripHtml(t, now)}</article>`;
  }).join('') : '';
  return `<section class="asec"><button type="button" class="gh ah" data-act="toggle-active" aria-expanded="${st.ui.activeOpen}">${ic('chev')}진행 기간 중<span class="n">${list.length}</span></button>${rows}</section>`;
}

// ---------- 카드·목록 ----------
function cardHtml(t, now) {
  const ds = S.displayStatus(t, now);
  return `<article class="card${S.isFin(t) ? ' fin' : ''}" data-act="open" data-id="${t.id}"${st.ui.selectedId === t.id ? ' aria-current="true"' : ''}>
    <button class="chk" data-act="menu-status" data-id="${t.id}" aria-label="상태: ${STATUS_LABEL[ds]}, 변경하려면 선택" aria-haspopup="menu">${stIcon(ds)}</button>
    <div class="body">
      <div class="row1"><div class="title">${esc(t.title)}</div><button class="idbtn" data-act="copy-id" data-id="${t.id}" aria-label="Task ID ${t.id} 복사">${t.id}</button></div>
      <div class="meta">${labelTags(t)}${topicTags(t)}<span class="badge u-${t.urgency}">${URG_LABEL[t.urgency]}</span>${depBadges(t)}</div>
      ${datesHtml(t, now)}
      ${dayStripHtml(t, now)}
      ${t.memo ? `<div class="memo" title="${esc(t.memo)}"><span class="mt">${esc(t.memo)}</span></div>` : ''}
    </div>
  </article>`;
}
export function renderList() {
  renderPage();
  if (st.ui.page.kind !== 'list') return;
  const now = S.nowKST();
  const items = visibleTasks();
  const q = st.q;
  let html;
  if (q.group === 'none') html = items.map(t => cardHtml(t, now)).join('');
  else {
    const groups = new Map();
    items.forEach(t => groupsOf(t, now).forEach(([o, l]) => { const k = o + '|' + l; if (!groups.has(k)) groups.set(k, { o, l, arr: [] }); groups.get(k).arr.push(t); }));
    html = [...groups.values()].sort((a, b) => a.o - b.o).map(g => `<div class="gh">${esc(g.l)}<span class="n">${g.arr.length}</span></div>${g.arr.map(t => cardHtml(t, now)).join('')}`).join('');
  }
  if (items.length) html = activeSectionHtml(items, now) + html;
  const fc = filterActiveCount();
  $('#fcnt').hidden = !fc; $('#fcnt').textContent = fc;
  $('#sortLbl').textContent = `${SORT_LABEL[q.sort]} ${q.dir === 'asc' ? '↑' : '↓'}${q.group !== 'none' ? ' · ' + GROUP_LABEL[q.group] + '별' : ''}`;
  const hidden = q.hideDone && !q.statuses.length ? liveTasks().filter(inSideFilter).filter(S.isFin).length : 0;
  $('#list').innerHTML = labelHeadHtml() + (items.length ? html
    : `<p class="empty">${liveTasks().length ? '조건에 맞는 Task가 없습니다.' : '아직 Task가 없습니다. 아래에서 추가해 보세요.'}${hidden ? `<br>(완료/취소 ${hidden}건 숨김)` : ''}</p>`);
  $('#swHide').setAttribute('aria-checked', String(q.hideDone));
  fitMemos();
}

// 카드 메모: 카드 폭을 넘는 메모만 티커처럼 흐른다
const MEMO_SPEED = 32;
export function fitMemos() {
  document.querySelectorAll('#list .memo').forEach(el => {
    const first = el.querySelector('.mt');
    if (!first) return;
    if (el.classList.contains('flow')) { el.classList.remove('flow'); el.querySelectorAll('.mt.dup').forEach(d => d.remove()); el.querySelector('.mtrack')?.replaceWith(first); }
    if (!el.clientWidth || first.scrollWidth <= el.clientWidth + 1) return;
    const w = first.scrollWidth;
    const track = document.createElement('span');
    track.className = 'mtrack';
    first.replaceWith(track);
    const dup = first.cloneNode(true); dup.classList.add('dup'); dup.setAttribute('aria-hidden', 'true');
    track.append(first, dup);
    el.style.setProperty('--m-dur', `${Math.max(6, Math.round((w + 40) / MEMO_SPEED / 0.85))}s`);
    el.classList.add('flow');
  });
}

// ---------- 사이드바·칩 ----------
export function renderSide() {
  const active = liveTasks().filter(t => !S.isFin(t));
  const count = f => active.filter(t => (f === 'all' ? true : f === 'none' ? !S.taskLabels(doc(), t).length : t.label_ids.includes(f))).length;
  const items = [{ v: 'all', name: '전체', icon: ic('list') }];
  labels().filter(l => !l.archived || st.ui.filter === l.id).forEach(l => items.push({ v: l.id, name: l.name, color: l.color }));
  if (count('none') || st.ui.filter === 'none') items.push({ v: 'none', name: '미분류' });
  const lead = it => it.icon || `<span class="dot" style="background:${it.color ? esc(it.color) : 'var(--dot)'}"></span>`;
  const onList = st.ui.page.kind === 'list';
  $('#chips').innerHTML = items.map(it => `<button class="chip" data-act="filter" data-v="${it.v}" aria-pressed="${onList && st.ui.filter === it.v}">${it.icon ? '' : lead(it)}${esc(it.name)} <span class="n">${count(it.v)}</span></button>`).join('');
  const views = st.doc.views.filter(v => !v.deleted_at);
  $('#side').innerHTML = `<button class="nav rail-toggle" data-act="rail-toggle" aria-expanded="${st.ui.railOpen}" title="메뉴 펼치기/접기">${ic(st.ui.railOpen ? 'chevL' : 'chevR')}<span class="lbl">접기</span></button>`
    + `<button class="nav" data-act="page-dash" aria-pressed="${st.ui.page.kind === 'dash'}" title="대시보드">${ic('dash')}<span class="lbl">대시보드</span></button><h3>라벨</h3>`
    + items.map(it => `<button class="nav" data-act="filter" data-v="${it.v}" aria-pressed="${onList && st.ui.filter === it.v}" title="${esc(it.name)}">${lead(it)}<span class="lbl">${esc(it.name)}</span><span class="n">${count(it.v)}</span></button>`).join('')
    + `<button class="vh" data-act="toggle-views" aria-expanded="${st.ui.viewsOpen}">${ic('chev')}저장된 뷰</button>`
    + (st.ui.viewsOpen ? (views.map(v => `<button class="nav vh-item" data-act="apply-view" data-id="${v.id}" title="${esc(v.name)}"><span class="lbl">${esc(v.name)}</span></button>`).join('') || '<span class="hint" style="margin:0 10px">저장된 뷰 없음</span>') : '')
    + `<span class="sp"></span>`
    + `<button class="nav" data-act="v-open" aria-pressed="${st.ui.page.kind === 'vault'}" title="보안 영역">${ic('lock')}<span class="lbl">보안 영역</span></button>`
    + `<button class="nav" data-act="ticker" title="티커">${ic('bell')}<span class="lbl">티커</span></button>`
    + `<button class="nav" data-act="labels" title="라벨·주제 관리">${ic('label')}<span class="lbl">라벨·주제 관리</span></button>`
    + `<button class="nav" data-act="settings" title="설정">${ic('gear')}<span class="lbl">설정</span></button>`;
}

// ---------- 상세 패널 ----------
export function tsFootHtml(t) {
  return [['생성', t.created_at], ['수정', t.updated_at], ['완료', t.status === 'done' ? t.completed_at : null]]
    .filter(([, v]) => fmtTs(v)).map(([l, v]) => `<span>${l} ${fmtTs(v)}</span>`).join('');
}
function seg(field, options, cur, cls = '') {
  return `<div class="seg ${cls}" role="group">${options.map(([v, l]) => `<button type="button" data-act="set-${field}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
}
function labelValue(t) {
  const ls = S.taskLabels(doc(), t);
  return ls.length ? ls.map(l => `<span class="lb">${dot(l)}<span class="t">${esc(l.name)}</span></span>`).join('') : '<span class="ph0">미분류 · 라벨 선택</span>';
}
function topicValue(t) {
  const gs = S.taskTopics(doc(), t);
  if (gs.length) return gs.map(g => `<span class="topic">${ic('tag')}<span class="t">${esc(g.name)}</span></span>`).join('');
  return `<span class="ph0">${S.taskLabels(doc(), t).length ? '없음 · 주제 선택' : '라벨을 먼저 고르세요'}</span>`;
}
function depValue(t) {
  const pred = t.blocked_by ? taskById(t.blocked_by) : null;
  return pred ? `${ic('link')}<span class="t">${esc(pred.title)}</span>` : '<span class="ph0">없음 · 먼저 끝나야 할 Task</span>';
}
const gmHtml = t => S.taskTopics(doc(), t).filter(g => g.memo).map(g => `<b>${esc(g.name)}</b> ${esc(g.memo)}`).join('<br>');
function panelHtml(t) {
  if (!t) return '<div class="empty-panel">Task를 선택하면 여기서 편집합니다.</div>';
  const now = S.nowKST();
  const ds = S.displayStatus(t, now);
  const pred = t.blocked_by ? taskById(t.blocked_by) : null;
  const succ = successorsOf(t);
  const allDay = !t.due_time;
  const topicsOn = S.taskLabels(doc(), t).length > 0;
  const date = (f, label, val) => `<div class="pc"><label class="pl" for="f-${f}">${label}</label><div class="inwrap"><input class="in xs" type="date" id="f-${f}" data-f="${f}" value="${val || ''}"><button type="button" class="clr" data-act="clear-${f}" aria-label="${label} 지우기">${ic('x')}</button></div></div>`;
  const gm = S.taskTopics(doc(), t).filter(g => g.memo);
  const sm = S.dayCheckSummary(t, now.date);
  return `<div class="ph">
      <button class="chk" data-act="menu-status" data-id="${t.id}" aria-label="상태: ${STATUS_LABEL[ds]}, 변경하려면 선택" aria-haspopup="menu">${stIcon(ds)}</button>
      <button class="idbtn" data-act="copy-id" data-id="${t.id}" aria-label="Task ID ${t.id} 복사">${ic('copy', 'width:13px;height:13px')}${t.id}</button>
      <span class="saved">${ic('check')}자동 저장</span>
      <button class="icbtn" data-act="close-panel" aria-label="편집 닫기">${ic('x')}</button></div>
  <div class="pb">
    <textarea class="in ttl" id="f-title" data-f="title" maxlength="200" rows="1" aria-label="제목" enterkeyhint="done">${esc(t.title)}</textarea>
    ${seg('status', [['todo', '대기'], ['in_progress', '진행 중'], ['done', '완료'], ['canceled', '취소']], t.status, 'xs')}
    ${ds === 'delayed' ? '<p class="note">마감이 지나 “지연 중”으로 표시됩니다. 완료/취소하면 해제됩니다.</p>' : ''}
    ${seg('urgency', [['urgent', 'Urgent'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], t.urgency, 'xs')}

    <section class="psec">
      <button type="button" class="sh" data-act="toggle-props" aria-expanded="${st.ui.propsOpen}">${ic('chev')}속성</button>
      ${st.ui.propsOpen ? `<div class="pg">
        <div class="pc w"><span class="pl" id="lbl-lb">라벨</span><button type="button" class="pv" data-act="menu-labels" aria-haspopup="menu" aria-labelledby="lbl-lb">${labelValue(t)}</button></div>
        <div class="pc w"><span class="pl" id="lbl-tp">주제</span><button type="button" class="pv" data-act="menu-topics" aria-haspopup="menu" aria-labelledby="lbl-tp"${topicsOn ? '' : ' disabled'}>${topicValue(t)}</button>
          <p class="hint gm"${gm.length ? '' : ' hidden'}>${gmHtml(t)}</p></div>
        ${date('start_date', '시작일', t.start_date)}${date('due_date', '마감일', t.due_date)}
        <div class="pc w timerow"><button type="button" class="sw sm" role="switch" data-act="toggle-allday" aria-checked="${allDay}"${t.due_date ? '' : ' disabled'}><i></i>종일</button>
          <input class="in xs" type="time" data-f="due_time" aria-label="마감 시각" value="${t.due_time || ''}"${allDay || !t.due_date ? ' disabled' : ''}></div>
        <div class="pc w"><span class="pl" id="lbl-dep">선행 Task</span><div class="selrow"><button type="button" class="pv" data-act="menu-blocker" aria-haspopup="menu" aria-labelledby="lbl-dep">${depValue(t)}</button>${pred ? `<button type="button" class="icbtn sm" data-act="clear-blocker" aria-label="선행 Task 해제">${ic('x')}</button>` : ''}</div>
          ${pred || succ.length ? `<div class="deps">${pred ? `선행<button type="button" data-act="open" data-id="${pred.id}" title="${esc(pred.title)} 열기">${esc(pred.title)}</button>` : ''}${succ.length ? `후속${succ.map(s => `<button type="button" data-act="open" data-id="${s.id}" title="${esc(s.title)} 열기">${esc(s.title)}</button>`).join('')}` : ''}</div>` : ''}</div>
        <div class="pc w"><label class="pl" for="f-memo">메모</label><textarea class="in xs memoin" id="f-memo" data-f="memo" maxlength="200" rows="1" enterkeyhint="done">${esc(t.memo)}</textarea></div>
      </div>` : `<p class="psum">${[S.taskLabels(doc(), t).map(l => l.name).join(', ') || '미분류', t.start_date ? '시작 ' + md(t.start_date) : '', t.due_date ? '마감 ' + md(t.due_date) + (t.due_time ? ' ' + t.due_time : '') : ''].filter(Boolean).map(esc).join(' · ')}</p>`}
    </section>

    <section class="psec">
      <div class="shrow"><button type="button" class="sh" data-act="toggle-cal" aria-expanded="${st.ui.calOpen && !!t.day_check}"${t.day_check ? '' : ' disabled'}>${ic('chev')}날짜별 체크</button>
        ${t.day_check && sm.text ? `<span class="dsum${sm.warn ? ' warn' : ''}">${esc(sm.text)}</span>` : ''}
        <button type="button" class="sw sm" role="switch" data-act="toggle-daycheck" aria-checked="${!!t.day_check}" aria-label="날짜별 체크 사용"><i></i></button></div>
      ${t.day_check && st.ui.calOpen ? dayCalHtml(t, now) : ''}
      ${t.day_check && !S.dayCheckOn(t) && !st.ui.calOpen ? '<p class="hint">시작일과 마감일을 모두 넣으면 표시됩니다.</p>' : ''}
    </section>

    <section class="psec" id="logSec">${timelineHtml(t)}</section>
  </div>
  <div class="pf"><p class="tsfoot" id="tsFoot">${tsFootHtml(t)}</p><button class="del" data-act="delete" data-id="${t.id}">${ic('trash')}삭제</button><button class="btn sm primary addlog" data-act="log-new">${ic('plus')}이력</button></div>`;
}
export function growArea(el) { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 2 + 'px'; }
export function renderPanel(focusSel) {
  const t = selTask();
  if (!t) st.ui.selectedId = null;
  const pb = $('#panel .pb');
  const scroll = pb && t && pb.dataset.id === t.id ? pb.scrollTop : 0;
  $('#panel').innerHTML = panelHtml(t);
  const nb = $('#panel .pb');
  if (nb && t) { nb.dataset.id = t.id; nb.scrollTop = scroll; }
  requestAnimationFrame(() => { growArea($('#f-memo')); growArea($('#f-title')); });
  document.body.classList.toggle('sheet-open', !!t && !wide());
  document.body.classList.toggle('no-sel', !t);
  if (focusSel) $(`#panel ${focusSel}`)?.focus();
}
// 패널 일부만 갱신 (입력 중 포커스를 잃지 않도록)
export function refreshPanelValues(t) {
  const set = (sel, html) => { const el = $(`#panel ${sel}`); if (el) el.innerHTML = html; };
  set('[data-act="menu-labels"]', labelValue(t));
  set('[data-act="menu-topics"]', topicValue(t));
  const gm = $('#panel .gm');
  if (gm) { gm.innerHTML = gmHtml(t); gm.hidden = !gm.innerHTML; }
  const tp = $('#panel [data-act="menu-topics"]');
  if (tp) tp.disabled = !S.taskLabels(doc(), t).length;
}
export const renderAll = () => { renderSide(); renderList(); renderPanel(); renderTicker(); };

// ---------- 티커 ----------
const byCreated = (a, b) => ((a.created_at || '') < (b.created_at || '') ? -1 : (a.created_at || '') > (b.created_at || '') ? 1 : 0);
const TK_SPEED = 55;
let tkKey = '';
export function renderTicker(force = false) {
  const el = $('#ticker');
  if (!el || !st.doc) return;
  const set = S.tickerSettings(st.doc);
  const now = S.nowKST();
  const items = st.doc.ticker.filter(k => !k.deleted_at && S.tickerState(k, now) === 'on').sort(byCreated);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const key = JSON.stringify([set.color, set.position, items.map(k => [k.id, k.text, S.tickerLevel(k)]), innerWidth, reduce]);
  if (!force && key === tkKey) return;
  tkKey = key;
  const anchor = set.position === 'top' ? $('.bar') : $('#quick');
  if (el.nextElementSibling !== anchor) anchor.before(el);
  el.className = `ticker c-${set.color} pos-${set.position}${el.classList.contains('paused') ? ' paused' : ''}`;
  if (!items.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const itemHtml = k => {
    const lv = S.tickerLevel(k);
    return `<span class="tk-item lv-${lv}">${lv === 'urgent' ? `<span class="tk-badge"><b class="tk-bang">!</b>${esc(k.text)}</span>` : esc(k.text)}</span>`;
  };
  const unit = `<span class="tk-unit" style="display:inline-flex">${items.map(k => `${itemHtml(k)}<span class="tk-sep">•</span>`).join('')}</span>`;
  el.title = '누르면 일시정지 / 다시 재생';
  el.innerHTML = `<div class="tk-track" aria-hidden="true">${unit}</div><span class="sr">알림: ${items.map(k => (S.tickerLevel(k) === 'normal' ? '' : S.TICKER_LEVELS[S.tickerLevel(k)] + ' ') + esc(k.text)).join(' / ')}</span><span class="tk-pause" aria-hidden="true">${ic('pause')}일시정지</span>`;
  if (reduce) return;
  const track = el.firstElementChild;
  const w = track.firstElementChild.getBoundingClientRect().width || 1;
  const reps = Math.max(1, Math.ceil(el.clientWidth / w));
  const half = unit.repeat(reps);
  track.innerHTML = half + half;
  track.style.setProperty('--tk-dur', ((w * reps) / TK_SPEED).toFixed(1) + 's');
}
export { byCreated };
