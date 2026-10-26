import * as S from './store.js';
import * as Sync from './sync.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wide = () => matchMedia('(min-width:700px)').matches;

let doc;
const DEFAULT_Q = { text: '', statuses: [], urgencies: [], topics: [], due: 'any', sort: 'due', dir: 'asc', group: 'none', hideDone: true };
const ui = { filter: 'all', selectedId: null, viewsOpen: true, railOpen: false };
function setRail(v) { ui.railOpen = v; document.querySelector('.app').classList.toggle('rail-open', v); renderSide(); }
let q = { ...DEFAULT_Q };
const SORT_LABEL = { due: '마감일', start: '시작일', urgency: '긴급도', created: '생성일', title: '제목' };
const GROUP_LABEL = { none: '없음', project: 'Project', topic: '주제', urgency: '긴급도', status: '상태', due: '마감' };
const DUE_LABEL = { any: '전체', overdue: '지연', today: '오늘', week: '7일 이내', none: '마감일 없음' };
const URG_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('tm-ui') || 'null');
    if (p) { q = { ...DEFAULT_Q, ...p.q }; ui.filter = p.filter || 'all'; ui.viewsOpen = p.viewsOpen !== false; }
  } catch { /* 무시 */ }
}
function savePrefs() {
  try { localStorage.setItem('tm-ui', JSON.stringify({ q, filter: ui.filter, viewsOpen: ui.viewsOpen })); } catch { /* 무시 */ }
}

const STATUS_LABEL = { todo: '할 일', in_progress: '진행 중', done: '완료', canceled: '취소됨', delayed: '지연 중' };
const URG_LABEL = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
const DEFAULT_TIME = '09:00';

// ---------- 아이콘 ----------
const P = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
  copy: '<rect x="8.5" y="8.5" width="10" height="10" rx="2"/><path d="M5.5 14.5V7a2 2 0 012-2h7"/>',
  chevR: '<path d="M10 7l5 5-5 5"/>',
  chevL: '<path d="M14 7l-5 5 5 5"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  gear: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  folder: '<path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>',
  bell: '<path d="M4 10v4h3l6 4V6l-6 4z"/><path d="M16.5 9.5a3.5 3.5 0 010 5M19 7a7 7 0 010 10"/>',
  link: '<path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.6"/>',
};
const ic = (name, style = '', cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}>${P[name]}</svg>`;

function stIcon(s) {
  // 색은 CSS 변수(--st-*)로 지정해 다크 모드에서도 바뀌게 한다
  const c = v => `var(--st-${v})`;
  const base = (stroke, fill = 'var(--surface)') => `<circle cx="12" cy="12" r="9" style="fill:${fill};stroke:${stroke}" stroke-width="2"/>`;
  const body = {
    todo: base(c('todo')),
    in_progress: base(c('prog')) + `<path d="M12 3a9 9 0 010 18z" style="fill:${c('prog')}"/>`,
    done: base(c('done'), c('done')) + `<path d="M7.8 12.4l3 3 5.4-5.8" fill="none" style="stroke:${c('on')}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
    canceled: base(c('cancel'), c('cancel')) + `<path d="M9 9l6 6M15 9l-6 6" style="stroke:${c('on')}" stroke-width="2.2" stroke-linecap="round"/>`,
    delayed: base(c('late')) + `<path d="M12 7.5v5" style="stroke:${c('late')}" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.4" style="fill:${c('late')}"/>`,
  }[s];
  return `<svg class="st" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// ---------- 데이터 조회 ----------
const liveTasks = () => doc.tasks.filter(t => !t.deleted_at);
const liveProjects = () => doc.projects.filter(p => !p.deleted_at).sort(S.compareProjects);
const projOf = t => (t.project_id ? liveProjects().find(p => p.id === t.project_id) || null : null);
const topicOf = t => S.topicOfTask(doc, t);
const topicById = id => (doc.topics || []).find(g => g.id === id && !g.deleted_at);
const taskById = id => doc.tasks.find(t => t.id === id && !t.deleted_at);
const isFin = t => t.status === 'done' || t.status === 'canceled';

function matches(t, now) {
  const ds = S.displayStatus(t, now);
  if (q.statuses.length) { if (!q.statuses.includes(ds) && !q.statuses.includes(t.status)) return false; }
  else if (q.hideDone && isFin(t)) return false;
  if (q.urgencies.length && !q.urgencies.includes(t.urgency)) return false;
  if (q.topics?.length && !q.topics.includes(topicOf(t)?.id || 'none')) return false;
  if (q.text) {
    const hay = `${t.title} ${t.memo} ${t.id} ${topicOf(t)?.name || ''}`.toLowerCase();
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
  const nullLast = (x, y, f) => (x == null && y == null ? 0 : x == null ? 1 : y == null ? -1 : f(x, y));
  const str = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  const dir = q.dir === 'desc' ? -1 : 1;
  let r = 0;
  if (q.sort === 'due') return dir === 1 ? S.compareDefault(a, b) : (isFin(a) !== isFin(b) ? (isFin(a) ? 1 : -1) : -S.compareDefault(a, b));
  if (q.sort === 'start') r = nullLast(a.start_date, b.start_date, str) * (a.start_date && b.start_date ? dir : 1);
  else if (q.sort === 'urgency') r = (URG_RANK[a.urgency] - URG_RANK[b.urgency]) * dir;
  else if (q.sort === 'created') r = str(a.created_at, b.created_at) * dir;
  else if (q.sort === 'title') r = a.title.localeCompare(b.title, 'ko') * dir;
  return r || S.compareDefault(a, b);
}

function visibleTasks() {
  const now = S.nowKST();
  return liveTasks()
    .filter(t => (ui.filter === 'all' ? true : ui.filter === 'none' ? !projOf(t) : t.project_id === ui.filter))
    .filter(t => matches(t, now))
    .sort(cmpBy);
}

function groupOf(t, now) {
  switch (q.group) {
    case 'project': { const p = projOf(t); const i = p ? liveProjects().indexOf(p) : 999; return [i, p ? p.name : '미분류']; }
    case 'topic': {
      const p = projOf(t), g = topicOf(t);
      const pi = p ? liveProjects().indexOf(p) : 999;
      const gi = g ? S.topicsOf(doc, g.project_id, { archived: true }).indexOf(g) : 9999;
      return [pi * 100000 + gi, `${p ? p.name : '미분류'} · ${g ? g.name : '주제 없음'}`];
    }
    case 'urgency': return [URG_RANK[t.urgency], URG_LABEL[t.urgency]];
    case 'status': { const ds = S.displayStatus(t, now); return [['delayed', 'in_progress', 'todo', 'done', 'canceled'].indexOf(ds), STATUS_LABEL[ds]]; }
    case 'due': {
      if (isFin(t)) return [9, '완료/취소'];
      if (!t.due_date) return [4, '마감일 없음'];
      const d = S.dayDiff(now.date, t.due_date);
      if (S.isDelayed(t, now)) return [0, '지연'];
      return d === 0 ? [1, '오늘'] : d <= 6 ? [2, '7일 이내'] : [3, '이후'];
    }
  }
  return [0, ''];
}

function filterActiveCount() {
  return (q.text ? 1 : 0) + (q.statuses.length ? 1 : 0) + (q.urgencies.length ? 1 : 0) + (q.topics?.length ? 1 : 0) + (q.due !== 'any' ? 1 : 0) + (q.group !== 'none' ? 1 : 0)
    + (q.sort !== 'due' || q.dir !== 'asc' ? 1 : 0) + (!q.hideDone && !q.statuses.length ? 1 : 0);
}

// ---------- 저장 ----------
let saveTimer;
function persist(now = false) {
  clearTimeout(saveTimer);
  const run = async () => {
    await S.save(doc);
    renderSyncLabel();
    Sync.schedule();
  };
  if (now) return run();
  saveTimer = setTimeout(run, 250);
}
function touch(t) {
  t.updated_at = new Date().toISOString();
  persist();
  renderList();
  renderSide();
}

// ---------- 동기화 상태 표시 ----------
function renderSyncLabel() {
  const st = Sync.getState();
  const el = $('#syncLabel');
  const map = {
    off: [S.storageOk ? '이 기기에 저장됨' : '저장 불가 (임시)', S.storageOk ? '' : 'warn'],
    'needs-auth': ['로그인 필요', 'warn'],
    syncing: ['동기화 중…', ''],
    ok: [`동기화됨 ${st.lastSync ? st.lastSync.slice(-5) : ''}`, 'ok'],
    offline: ['오프라인 (대기 중)', ''],
    error: ['동기화 오류', 'warn'],
  };
  const [text, cls] = map[st.status] || map.off;
  el.textContent = text;
  el.className = 'sync ' + cls;
  if (dlg.open && dlg.dataset.kind === 'settings') dlg.querySelector('.dlg-b').innerHTML = settingsHtml();
}
const SYNC_TEXT = { off: '사용 안 함', 'needs-auth': '로그인 필요', syncing: '동기화 중…', ok: '정상', offline: '오프라인', error: '오류' };

async function applyMerged(m) {
  for (const k of Object.keys(m)) if (k !== 'updated_at') doc[k] = m[k]; // 모르는 키도 그대로 보존
  S.ensureProjectOrder(doc); // 구버전에서 만든 Project에 order를 채움 (같은 객체라 이번 동기화에 함께 올라감)
  await S.save(doc);
  if (!['all', 'none'].includes(ui.filter) && !liveProjects().some(p => p.id === ui.filter)) ui.filter = 'all';
  renderSide(); renderList(); renderTicker();
  const typing = document.activeElement && $('#panel').contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (!typing || (ui.selectedId && !taskById(ui.selectedId))) renderPanel();
  if (dlg.open && dlg.dataset.kind === 'filter') dlg.querySelector('.dlg-b').innerHTML = filterHtml();
  if (dlg.open && dlg.dataset.kind === 'ticker' && !dlg.contains(document.activeElement?.closest('input') || null)) refreshTickerDlg();
}

// ---------- 날짜 표시 ----------
const md = d => {
  const [y, m, dd] = d.split('-');
  return `${y === S.todayKST().slice(0, 4) ? '' : y.slice(2) + '/'}${+m}/${+dd}`;
};

function datesHtml(t, now) {
  const parts = [];
  if (t.due_date) {
    const late = S.isDelayed(t, now);
    let suffix = '';
    if (!isFin(t)) {
      const diff = S.dayDiff(now.date, t.due_date);
      suffix = diff > 0 ? ` · D-${diff}` : diff === 0 ? (late ? ' · 시간 지남' : ' · D-Day') : ` · ${-diff}일 지연`;
    }
    const clock = t.due_time ? ic('clock') : '';
    parts.push(`<span class="d${late ? ' late' : !isFin(t) ? ' due' : ''}">${clock}마감 ${md(t.due_date)}${t.due_time ? ' ' + t.due_time : ''}${suffix}</span>`);
  }
  if (t.start_date) parts.push(`<span class="d">시작 ${md(t.start_date)}</span>`);
  return parts.length ? `<div class="dates">${parts.join('')}</div>` : '';
}

// ---------- 선행 Task 안내 (M3.2) ----------
const successorsOf = t => liveTasks().filter(s => s.blocked_by === t.id);
function depBadges(t) {
  if (isFin(t)) return '';
  let h = '';
  const pred = t.blocked_by ? taskById(t.blocked_by) : null;
  if (pred && !isFin(pred)) h += `<span class="badge dep" title="먼저 완료되어야 함: ${esc(pred.title)} (${pred.id})">선행 필요 · ${esc(pred.title)}</span>`;
  const n = successorsOf(t).filter(s => !isFin(s)).length;
  if (n) h += `<span class="badge dep" title="이 Task가 끝나야 진행할 수 있는 후속 Task ${n}건">후속 작업 ${n > 1 ? n + '건' : '있음'}</span>`;
  return h;
}
function setBlocker(t, predId) {
  t.blocked_by = predId;
  touch(t);
  renderPanel();
}

// ---------- 주제 (M3.4) ----------
function topicChip(t) {
  const g = topicOf(t);
  return g ? `<span class="topic" title="주제: ${esc(g.name)}${g.memo ? ' — ' + esc(g.memo) : ''}">${ic('tag')}<span class="t">${esc(g.name)}</span></span>` : '';
}
function topicFieldHtml(t) {
  const p = projOf(t), g = topicOf(t);
  const label = g ? `${ic('tag')}<span class="t">${esc(g.name)}</span>` : `<span class="t">${p ? '없음 · 이 일을 하는 이유(주제) 선택' : 'Project를 먼저 고르세요'}</span>`;
  return `<div><span class="fl" id="lbl-topic">주제</span>
    <div class="selrow"><button type="button" class="sel${g ? '' : ' empty-val'}" data-act="menu-topic" aria-haspopup="listbox" aria-labelledby="lbl-topic"${p ? '' : ' disabled'}><span class="l">${label}</span>${ic('chev', 'color:var(--muted)')}</button>${g ? `<button type="button" class="icbtn" data-act="clear-topic" aria-label="주제 해제">${ic('x')}</button>` : ''}</div>
    ${g?.memo ? `<p class="hint" style="margin-top:6px">${esc(g.memo)}</p>` : ''}</div>`;
}
// Project를 바꾸면 다른 Project의 주제는 떼어 낸다
function setProject(t, pid) {
  const g = t.topic_id ? topicById(t.topic_id) : null;
  t.project_id = pid;
  if (t.topic_id && (!g || g.project_id !== pid)) { t.topic_id = null; if (g) toast(`주제 “${g.name}”를 해제했습니다 (다른 Project)`); }
  touch(t); renderPanel();
}
function newTopicDialog(forTaskId, projectId) {
  const p = liveProjects().find(x => x.id === projectId);
  openDlg('newtopic', `새 주제${p ? ' · ' + p.name : ''}`, `<form id="newTopicForm" data-task="${forTaskId || ''}" data-pid="${esc(projectId || '')}" class="dlg-b" style="padding:0" autocomplete="off">
    <input class="in" name="name" maxlength="60" placeholder="주제 이름 (예: sensor asyncWorker kernel traps 이슈)" aria-label="주제 이름" required>
    <input class="in" name="memo" maxlength="200" placeholder="한 줄 메모 (선택: 케이스 번호, Obsidian 문서 이름 등)" aria-label="주제 메모">
    <button class="btn primary" type="submit">추가</button></form>`);
  dlg.querySelector('input[name=name]').focus();
}
function topicsHtml() {
  const projects = liveProjects();
  const count = gid => liveTasks().filter(t => t.topic_id === gid && topicOf(t)).length;
  const secs = projects.map(p => {
    const list = S.topicsOf(doc, p.id, { archived: true });
    if (!list.length) return '';
    return `<div class="fsec"><span class="fl"><span class="dot" style="background:${esc(p.color)};display:inline-block;margin-right:6px;vertical-align:-1px"></span>${esc(p.name)}</span>
      ${list.map(g => `<div class="tprow${g.archived ? ' arch' : ''}">
        <div class="r1"><input class="in" data-gid="${g.id}" data-gf="name" value="${esc(g.name)}" maxlength="60" aria-label="주제 이름"><span class="tpn">Task ${count(g.id)}</span>
          <button class="btn sm" data-act="topic-archive" data-id="${g.id}">${g.archived ? '복원' : '보관'}</button>
          <button class="icbtn sm" data-act="topic-del" data-id="${g.id}" aria-label="${esc(g.name)} 삭제">${ic('trash')}</button></div>
        <input class="in sm" data-gid="${g.id}" data-gf="memo" value="${esc(g.memo || '')}" maxlength="200" placeholder="한 줄 메모 (선택)" aria-label="주제 메모">
        <span class="gid">${g.id}</span></div>`).join('')}</div>`;
  }).join('');
  const opts = projects.filter(p => !p.archived).map(p => `<option value="${p.id}"${ui.filter === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  return `${secs || '<p class="hint">아직 주제가 없습니다. Task 편집의 “주제”에서 바로 만들 수도 있습니다.</p>'}
    ${opts ? `<form class="prow" id="newTopicMgr" autocomplete="off"><select class="in" name="pid" aria-label="Project" style="flex:0 0 38%">${opts}</select><input class="in" name="name" maxlength="60" placeholder="새 주제" aria-label="새 주제 이름" required><button class="btn primary" type="submit">추가</button></form>` : '<p class="hint">주제를 만들려면 Project가 먼저 있어야 합니다.</p>'}
    <p class="hint">주제는 Project에 속하는 꼬리표입니다. 보관한 주제는 선택 목록에서 숨겨지고, 이미 붙은 Task에는 그대로 남습니다. 삭제하면 붙어 있던 Task에서 떼어 냅니다.</p>`;
}
const refreshTopicsDlg = () => { if (dlg.open && dlg.dataset.kind === 'topics') dlg.querySelector('.dlg-b').innerHTML = topicsHtml(); };

// ---------- 렌더 ----------
function cardHtml(t, now) {
  const ds = S.displayStatus(t, now);
  const p = projOf(t);
  return `<article class="card${isFin(t) ? ' fin' : ''}" data-act="open" data-id="${t.id}"${ui.selectedId === t.id ? ' aria-current="true"' : ''}>
    <button class="chk" data-act="menu-status" data-id="${t.id}" aria-label="상태: ${STATUS_LABEL[ds]}, 변경하려면 선택" aria-haspopup="menu">${stIcon(ds)}</button>
    <div class="body">
      <div class="row1"><div class="title">${esc(t.title)}</div><button class="idbtn" data-act="copy-id" data-id="${t.id}" aria-label="Task ID ${t.id} 복사">${t.id}</button></div>
      <div class="meta"><span class="proj"><span class="dot" style="background:${p ? esc(p.color) : 'var(--dot)'}"></span>${p ? esc(p.name) : '미분류'}</span>${topicChip(t)}<span class="badge u-${t.urgency}">${URG_LABEL[t.urgency]}</span>${depBadges(t)}</div>
      ${datesHtml(t, now)}
      ${t.memo ? `<div class="memo">${esc(t.memo)}</div>` : ''}
    </div>
  </article>`;
}

function renderList() {
  const now = S.nowKST();
  const items = visibleTasks();
  const hidden = q.hideDone && !q.statuses.length ? liveTasks().filter(isFin).length : 0;
  let html;
  if (q.group === 'none') html = items.map(t => cardHtml(t, now)).join('');
  else {
    const groups = new Map();
    items.forEach(t => { const [o, l] = groupOf(t, now); const k = o + '|' + l; if (!groups.has(k)) groups.set(k, { o, l, arr: [] }); groups.get(k).arr.push(t); });
    html = [...groups.values()].sort((a, b) => a.o - b.o).map(g => `<div class="gh">${esc(g.l)}<span class="n">${g.arr.length}</span></div>${g.arr.map(t => cardHtml(t, now)).join('')}`).join('');
  }
  const fc = filterActiveCount();
  $('#fcnt').hidden = !fc; $('#fcnt').textContent = fc;
  $('#sortLbl').textContent = `${SORT_LABEL[q.sort]} ${q.dir === 'asc' ? '↑' : '↓'}${q.group !== 'none' ? ' · ' + GROUP_LABEL[q.group] + '별' : ''}`;
  $('#list').innerHTML = items.length
    ? html
    : `<p class="empty">${liveTasks().length ? '조건에 맞는 Task가 없습니다.' : '아직 Task가 없습니다. 아래에서 추가해 보세요.'}${hidden ? `<br>(완료/취소 ${hidden}건 숨김)` : ''}</p>`;
  $('#swHide').setAttribute('aria-checked', String(q.hideDone));
}

function renderSide() {
  const active = liveTasks().filter(t => !isFin(t));
  const count = f => active.filter(t => (f === 'all' ? true : f === 'none' ? !projOf(t) : t.project_id === f)).length;
  const items = [{ v: 'all', name: '전체', icon: ic('list') }];
  liveProjects().filter(p => !p.archived || ui.filter === p.id).forEach(p => items.push({ v: p.id, name: p.name, color: p.color }));
  if (count('none') || ui.filter === 'none') items.push({ v: 'none', name: '미분류' });
  const lead = it => it.icon || `<span class="dot" style="background:${it.color ? esc(it.color) : 'var(--dot)'}"></span>`;
  $('#chips').innerHTML = items.map(it => `<button class="chip" data-act="filter" data-v="${it.v}" aria-pressed="${ui.filter === it.v}">${it.icon ? '' : lead(it)}${esc(it.name)} <span class="n">${count(it.v)}</span></button>`).join('');
  $('#side').innerHTML = `<button class="nav rail-toggle" data-act="rail-toggle" aria-expanded="${ui.railOpen}" title="메뉴 펼치기/접기">${ic(ui.railOpen ? 'chevL' : 'chevR')}<span class="lbl">접기</span></button><h3>Project</h3>` +
    items.map(it => `<button class="nav" data-act="filter" data-v="${it.v}" aria-pressed="${ui.filter === it.v}" title="${esc(it.name)}">${lead(it)}<span class="lbl">${esc(it.name)}</span><span class="n">${count(it.v)}</span></button>`).join('') +
    `<button class="vh" data-act="toggle-views" aria-expanded="${ui.viewsOpen}">${ic('chev')}저장된 뷰</button>` +
    (ui.viewsOpen ? ((doc.views || []).filter(v => !v.deleted_at).map(v => `<button class="nav vh-item" data-act="apply-view" data-id="${v.id}" title="${esc(v.name)}"><span class="lbl">${esc(v.name)}</span></button>`).join('') || '<span class="hint" style="margin:0 10px">저장된 뷰 없음</span>') : '') +
    `<span class="sp"></span>` +
    `<button class="nav" data-act="ticker" title="티커">${ic('bell')}<span class="lbl">티커</span></button>` +
    `<button class="nav" data-act="projects" title="Project 관리">${ic('folder')}<span class="lbl">Project 관리</span></button>` +
    `<button class="nav" data-act="settings" title="설정">${ic('gear')}<span class="lbl">설정</span></button>`;
}

function seg(field, options, cur) {
  return `<div class="seg" role="group">${options.map(([v, l]) => `<button type="button" data-act="set-${field}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
}

function panelHtml(t) {
  if (!t) return '<div class="empty-panel">Task를 선택하면 여기서 편집합니다.</div>';
  const p = projOf(t);
  const ds = S.displayStatus(t);
  const dateField = (f, label, val) => `<div><label class="fl" for="f-${f}">${label}</label><div class="inwrap"><input class="in" type="date" id="f-${f}" data-f="${f}" value="${val || ''}"><button type="button" class="clr" data-act="clear-${f}" aria-label="${label} 지우기">${ic('x')}</button></div></div>`;
  const allDay = !t.due_time;
  return `<div class="ph"><h2>Task 편집</h2><span class="saved">${ic('check')}자동 저장됨</span><button class="icbtn" data-act="close-panel" aria-label="편집 닫기">${ic('x')}</button></div>
  <div class="pb">
    <div><label class="fl" for="f-title">제목</label><input class="in" id="f-title" data-f="title" maxlength="200" value="${esc(t.title)}"></div>
    <div><span class="fl" id="lbl-proj">Project</span><button type="button" class="sel" data-act="menu-project" aria-haspopup="listbox" aria-labelledby="lbl-proj"><span class="l"><span class="dot" style="background:${p ? esc(p.color) : 'var(--dot)'}"></span>${p ? esc(p.name) : '미분류'}</span>${ic('chev', 'color:var(--muted)')}</button></div>
    ${topicFieldHtml(t)}
    ${depFieldHtml(t)}
    <div><span class="fl">상태</span>${seg('status', [['todo', '할 일'], ['in_progress', '진행 중'], ['done', '완료'], ['canceled', '취소됨']], t.status)}</div>
    ${ds === 'delayed' ? '<p class="note">마감이 지나 “지연 중”으로 표시됩니다 (자동). 완료/취소하면 해제됩니다.</p>' : ''}
    <div><span class="fl">긴급도</span>${seg('urgency', [['urgent', 'Urgent'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], t.urgency)}</div>
    <div class="two">${dateField('start_date', '시작일', t.start_date)}${dateField('due_date', '마감일', t.due_date)}</div>
    <div class="timerow">
      <button type="button" class="sw" role="switch" data-act="toggle-allday" aria-checked="${allDay}"${t.due_date ? '' : ' disabled'}><i></i>종일</button>
      <input class="in" type="time" data-f="due_time" aria-label="마감 시각" value="${t.due_time || ''}"${allDay || !t.due_date ? ' disabled' : ''}>
    </div>
    <div><label class="fl" for="f-memo">메모 (한 줄)</label><input class="in" id="f-memo" data-f="memo" maxlength="200" value="${esc(t.memo)}"></div>
  </div>
  <div class="pf"><span class="lbl">Task ID</span><button class="idbtn" data-act="copy-id" data-id="${t.id}" aria-label="Task ID ${t.id} 복사">${ic('copy', 'width:14px;height:14px')}${t.id}</button><button class="del" data-act="delete" data-id="${t.id}">${ic('trash')}삭제</button></div>`;
}

function depFieldHtml(t) {
  const pred = t.blocked_by ? taskById(t.blocked_by) : null;
  const succ = successorsOf(t);
  const label = pred ? `${ic('link')}<span class="t">${esc(pred.title)}</span>` : '<span class="t">없음 · 먼저 끝나야 할 Task 선택</span>';
  return `<div><span class="fl" id="lbl-dep">선행 Task</span>
    <div class="selrow"><button type="button" class="sel${pred ? '' : ' empty-val'}" data-act="menu-blocker" aria-haspopup="listbox" aria-labelledby="lbl-dep"><span class="l">${label}</span>${ic('chev', 'color:var(--muted)')}</button>${pred ? `<button type="button" class="icbtn" data-act="clear-blocker" aria-label="선행 Task 해제">${ic('x')}</button>` : ''}</div>
    ${pred && isFin(pred) ? '<p class="hint" style="margin-top:6px">선행 Task가 끝나서 카드 안내는 표시하지 않습니다.</p>' : ''}
    ${pred || succ.length ? `<div class="deps">${pred ? `선행:<button type="button" data-act="open" data-id="${pred.id}" title="${esc(pred.title)} 열기">${esc(pred.title)}</button>` : ''}${succ.length ? `후속:${succ.map(s => `<button type="button" data-act="open" data-id="${s.id}" title="${esc(s.title)} 열기">${esc(s.title)}</button>`).join('')}` : ''}</div>` : ''}
  </div>`;
}

function renderPanel() {
  const t = ui.selectedId ? taskById(ui.selectedId) : null;
  if (!t) ui.selectedId = null;
  $('#panel').innerHTML = panelHtml(t);
  document.body.classList.toggle('sheet-open', !!t && !wide());
  document.body.classList.toggle('no-sel', !t); // 넓은 화면: 선택이 없으면 패널을 접음
}
const renderAll = () => { renderSide(); renderList(); renderPanel(); renderTicker(); };

// ---------- 티커 (M3.2) ----------
const byCreated = (a, b) => ((a.created_at || '') < (b.created_at || '') ? -1 : (a.created_at || '') > (b.created_at || '') ? 1 : 0);
const TK_SPEED = 55; // px/초
let tkKey = '';
function renderTicker(force = false) {
  const el = $('#ticker');
  if (!el || !doc) return;
  const set = S.tickerSettings(doc);
  const now = S.nowKST();
  const items = (doc.ticker || []).filter(k => !k.deleted_at && S.tickerState(k, now) === 'on').sort(byCreated);
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
  if (reduce) return; // 동작 줄이기: 흐르지 않고 한 번만 표시
  const track = el.firstElementChild;
  const w = track.firstElementChild.getBoundingClientRect().width || 1;
  const reps = Math.max(1, Math.ceil(el.clientWidth / w)); // 화면보다 짧으면 반복해서 빈틈이 없게
  const half = unit.repeat(reps);
  track.innerHTML = half + half; // 절반만큼 이동하면 처음과 같은 모양 → 끊김 없는 반복
  track.style.setProperty('--tk-dur', ((w * reps) / TK_SPEED).toFixed(1) + 's');
}
$('#ticker').addEventListener('click', e => { e.currentTarget.classList.toggle('paused'); });

const TK_STATE = { on: ['표시 중', 'on'], off: ['꺼짐', ''], outside: ['시간대 외', ''], expired: ['만료', 'exp'] };
function tickerHtml() {
  const set = S.tickerSettings(doc);
  const now = S.nowKST();
  const list = (doc.ticker || []).filter(k => !k.deleted_at).sort(byCreated);
  const sw = c => `<span class="swatch" style="background:var(--tk-${c}-bg);box-shadow:0 0 0 1px var(--line2)"></span>`;
  const rows = list.map(k => {
    const [lbl, cls] = TK_STATE[S.tickerState(k, now)];
    const fld = (f, type, label, extra = '') => `<input class="in" type="${type}" data-kid="${k.id}" data-kf="${f}" value="${esc(k[f] || '')}" aria-label="${label}"${extra}>`;
    return `<div class="tkrow${k.enabled ? '' : ' off'}" data-row="${k.id}">
      <div class="r1"><button type="button" class="sw" role="switch" data-act="tk-toggle" data-id="${k.id}" aria-checked="${k.enabled}" aria-label="띠에 표시"><i></i></button>${fld('text', 'text', '문장', ' maxlength="120"')}<button type="button" class="icbtn sm" data-act="tk-del" data-id="${k.id}" aria-label="문장 삭제">${ic('trash')}</button></div>
      <div class="r2"><span class="tw">강조<span class="lvseg" role="group" aria-label="강조">${Object.entries(S.TICKER_LEVELS).map(([v, l]) => `<button type="button" data-act="tk-level" data-id="${k.id}" data-v="${v}" aria-pressed="${S.tickerLevel(k) === v}" class="lv-${v}">${l}</button>`).join('')}</span></span><span class="tw">종료일${fld('expire_date', 'date', '표시 종료일')}</span><span class="tw">매일${fld('daily_from', 'time', '표시 시작 시각')}~${fld('daily_to', 'time', '표시 종료 시각')}</span><span class="tkst ${cls}">${lbl}</span></div>
    </div>`;
  }).join('');
  return `<div class="fsec"><span class="fl">띠 색상</span>${seg('tkcolor', Object.entries(S.TICKER_COLORS).map(([v, l]) => [v, sw(v) + l]), set.color)}</div>
    <div class="fsec"><span class="fl">띠 위치</span>${seg('tkpos', [['top', '위'], ['bottom', '아래']], set.position)}</div>
    <div class="fsec"><span class="fl">문장</span><div class="tkset">${rows || '<p class="hint">아직 문장이 없습니다.</p>'}</div></div>
    <form class="prow" id="tkForm" autocomplete="off"><input class="in" name="text" maxlength="120" placeholder="새 문장" aria-label="새 문장" required><button class="btn primary" type="submit">추가</button></form>
    <p class="hint">켜 둔 문장만 띠에 흐릅니다. 강조는 보통·강조(굵게)·긴급(굵게 + 테두리 + !) 중에서 고릅니다. 종료일이 지나면 띠에서 사라지고 "만료"로 남습니다. 매일 시간대는 시작과 끝을 모두 넣어야 적용되고, 시작이 끝보다 늦으면 자정을 넘깁니다(예: 22:00~06:00). 띠를 누르면 일시정지합니다.</p>`;
}
function refreshTickerDlg(focusSel) {
  if (!dlg.open || dlg.dataset.kind !== 'ticker') return;
  dlg.querySelector('.dlg-b').innerHTML = tickerHtml();
  if (focusSel) dlg.querySelector(focusSel)?.focus();
}
function updateTickerRow(k) { // 입력 중 포커스를 잃지 않도록 행의 상태 표시만 갱신
  const row = dlg.querySelector(`[data-row="${k.id}"]`);
  if (!row) return;
  const [lbl, cls] = TK_STATE[S.tickerState(k)];
  const st = row.querySelector('.tkst');
  st.textContent = lbl; st.className = `tkst ${cls}`;
  row.classList.toggle('off', !k.enabled);
  row.querySelector('[data-act="tk-toggle"]').setAttribute('aria-checked', String(k.enabled));
}
const tickerById = id => (doc.ticker || []).find(k => k.id === id && !k.deleted_at);

// ---------- 팝오버 메뉴 ----------
let closeMenu = () => {};
function openMenu(anchor, items) {
  closeMenu();
  const root = $('#menuRoot');
  root.innerHTML = `<div class="pop" role="menu">${items.map((it, i) => `<button class="mi${it.cur ? ' cur' : ''}${it.add ? ' add' : ''}" role="menuitem" data-i="${i}">${it.icon || ''}${esc(it.label)}${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}${it.cur ? ic('check', '', 'ck') : ''}</button>`).join('')}</div>`;
  const pop = root.firstElementChild;
  const r = anchor.getBoundingClientRect();
  const w = Math.max(pop.offsetWidth, anchor.matches('.sel') ? r.width : 0);
  if (anchor.matches('.sel')) pop.style.width = r.width + 'px';
  let top = r.bottom + 4;
  if (top + pop.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 4);
  pop.style.top = top + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  const onDown = e => { if (!pop.contains(e.target)) closeMenu(); };
  const onKey = e => { if (e.key === 'Escape') { closeMenu(); anchor.focus(); } };
  pop.addEventListener('click', e => {
    const b = e.target.closest('.mi');
    if (!b) return;
    const it = items[+b.dataset.i];
    closeMenu();
    it.onPick();
  });
  setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
  document.addEventListener('keydown', onKey);
  addEventListener('resize', closeMenu, { once: true });
  closeMenu = () => {
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey);
    root.innerHTML = '';
    closeMenu = () => {};
  };
  pop.querySelector('.mi.cur, .mi')?.focus();
}

// ---------- 토스트 / 다이얼로그 ----------
let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-act="${action.act}" data-id="${action.id}">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2200);
}

const dlg = $('#dlg');
function openDlg(kind, title, bodyHtml) {
  dlg.dataset.kind = kind;
  dlg.innerHTML = `<div class="dlg-h"><h2>${esc(title)}</h2><button class="icbtn" data-act="close-dlg" aria-label="닫기">${ic('x')}</button></div><div class="dlg-b">${bodyHtml}</div>`;
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { dlg.dataset.kind = ''; });

function settingsHtml() {
  const persisted = settingsHtml.persisted;
  return `<div class="kv"><span>화면 크기 (CSS px)</span><span id="scrSize">${innerWidth} × ${innerHeight}</span></div>
    <div class="kv"><span>화면 배율</span><span>${devicePixelRatio}x</span></div>
    <p class="hint">폴드 접힘/펼침 상태에서 이 값을 확인해 두면 화면 분기 기준(700px / 1100px)을 맞추는 데 쓸 수 있습니다.</p>
    <div class="kv"><span>Google Drive 동기화</span><span>${SYNC_TEXT[Sync.getState().status]}${Sync.getState().lastSync ? ' · ' + esc(Sync.getState().lastSync) : ''}</span></div>
    ${Sync.getState().detail && Sync.getState().status !== 'ok' ? `<p class="hint">${esc(Sync.getState().detail)}</p>` : ''}
    ${Sync.getState().signedIn ? '<button class="btn" data-act="sync-now">지금 동기화</button><button class="btn" data-act="sign-out">Google 로그아웃 (동기화 중지)</button>' : '<button class="btn primary" data-act="sign-in">Google 로그인 · Drive 동기화 켜기</button>'}
    <div class="kv"><span>저장 위치</span><span>${S.storageOk ? '이 기기 (IndexedDB)' : '저장 불가 (임시)'}</span></div>
    <div class="kv"><span>브라우저 보존 보장</span><span>${persisted === undefined ? '확인 중' : persisted ? '예' : '아니오'}</span></div>
    <div class="kv"><span>Task / Project</span><span>${liveTasks().length}건 / ${liveProjects().length}개</span></div>
    <button class="btn" data-act="projects">Project 관리</button>
    <button class="btn" data-act="topics">주제 관리</button>
    <button class="btn" data-act="ticker">티커 관리</button>
    <button class="btn" data-act="export">JSON 내려받기</button>
    <button class="btn danger" data-act="wipe">이 기기 데이터 삭제</button>`;
}

function projectsHtml() {
  const list = liveProjects();
  const rows = list.map((p, i) => `<div class="prow${p.archived ? ' arch' : ''}"><span class="dot" style="background:${esc(p.color)}"></span><input class="in" data-pid="${p.id}" value="${esc(p.name)}" maxlength="40" aria-label="Project 이름">`
    + `<button class="icbtn sm" data-act="proj-up" data-id="${p.id}" aria-label="${esc(p.name)} 위로 이동"${i === 0 ? ' disabled' : ''}>${ic('chev', 'transform:rotate(180deg)')}</button>`
    + `<button class="icbtn sm" data-act="proj-down" data-id="${p.id}" aria-label="${esc(p.name)} 아래로 이동"${i === list.length - 1 ? ' disabled' : ''}>${ic('chev')}</button>`
    + `<button class="btn" data-act="archive" data-id="${p.id}">${p.archived ? '복원' : '보관'}</button></div>`).join('');
  return `${rows || '<p class="hint">아직 Project가 없습니다.</p>'}
    <form class="prow" id="newProjForm"><input class="in" name="name" maxlength="40" placeholder="새 Project 이름" aria-label="새 Project 이름" required><button class="btn primary" type="submit">추가</button></form>
    <p class="hint">보관한 Project는 선택 목록에서 숨겨지고 Task는 그대로 유지됩니다.</p>
    <button class="btn" data-act="topics">주제 관리</button>`;
}

function newProjectDialog(forTaskId) {
  openDlg('newproj', '새 Project', `<form id="newProjForm" data-task="${forTaskId || ''}" class="dlg-b" style="padding:0"><input class="in" name="name" maxlength="40" placeholder="Project 이름" aria-label="Project 이름" required><button class="btn primary" type="submit">추가</button></form>`);
  dlg.querySelector('input').focus();
}

// ---------- 필터·정렬 시트 ----------
const tog = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const chipBtn = (act, v, label, on) => `<button type="button" class="chip" data-act="${act}" data-v="${v}" aria-pressed="${on}">${label}</button>`;

function filterHtml() {
  const views = (doc.views || []).filter(v => !v.deleted_at);
  return `<div class="fsec"><label class="fl" for="q-text">검색 (제목·메모·ID)</label><input class="in" id="q-text" type="search" value="${esc(q.text)}" maxlength="100"></div>
  <div class="fsec"><span class="fl">상태</span><div class="chips2">${['todo', 'in_progress', 'delayed', 'done', 'canceled'].map(v => chipBtn('q-status', v, STATUS_LABEL[v], q.statuses.includes(v))).join('')}</div></div>
  <div class="fsec"><span class="fl">긴급도</span><div class="chips2">${Object.keys(URG_LABEL).map(v => chipBtn('q-urg', v, URG_LABEL[v], q.urgencies.includes(v))).join('')}</div></div>
  ${topicFilterHtml()}
  <div class="fsec"><span class="fl">마감</span><div class="chips2">${Object.keys(DUE_LABEL).map(v => chipBtn('q-due', v, DUE_LABEL[v], q.due === v)).join('')}</div></div>
  <div class="fsec"><span class="fl">정렬</span><div class="chips2">${Object.keys(SORT_LABEL).map(v => chipBtn('q-sort', v, SORT_LABEL[v], q.sort === v)).join('')}${chipBtn('q-dir', q.dir === 'asc' ? 'desc' : 'asc', q.dir === 'asc' ? '오름차순 ↑' : '내림차순 ↓', false)}</div></div>
  <div class="fsec"><span class="fl">그룹</span><div class="chips2">${Object.keys(GROUP_LABEL).map(v => chipBtn('q-group', v, GROUP_LABEL[v], q.group === v)).join('')}</div></div>
  <button type="button" class="sw" data-act="q-hide" role="switch" aria-checked="${q.hideDone}"><i></i>완료/취소 숨김 (상태를 고르지 않았을 때)</button>
  <div class="fsec"><span class="fl">저장된 뷰</span>
    ${views.map(v => `<div class="vrow"><button class="apply" data-act="apply-view" data-id="${v.id}">${esc(v.name)}</button><button class="icbtn" data-act="del-view" data-id="${v.id}" aria-label="${esc(v.name)} 삭제">${ic('trash')}</button></div>`).join('') || '<p class="hint">저장된 뷰가 없습니다.</p>'}
    <form class="prow" id="viewForm"><input class="in" name="name" maxlength="30" placeholder="현재 조건을 뷰로 저장" aria-label="뷰 이름" required><button class="btn primary" type="submit">저장</button></form>
  </div>
  <div style="display:flex;gap:8px"><button class="btn" data-act="q-reset" style="flex:1">초기화</button><button class="btn primary" data-act="close-dlg" style="flex:1">${visibleTasks().length}건 보기</button></div>`;
}
function topicFilterHtml() {
  const pid = ui.filter !== 'all' && ui.filter !== 'none' ? ui.filter : null;
  const sel = q.topics || [];
  let list = pid ? S.topicsOf(doc, pid) : liveProjects().flatMap(p => S.topicsOf(doc, p.id));
  list = list.concat((doc.topics || []).filter(g => sel.includes(g.id) && !g.deleted_at && !list.includes(g))); // 고른 것은 보관돼도 보이게
  if (!list.length && !sel.length) return '';
  const pname = g => (pid ? '' : `${liveProjects().find(p => p.id === g.project_id)?.name || ''} · `);
  return `<div class="fsec"><span class="fl">주제</span><div class="chips2">${list.map(g => chipBtn('q-topic', g.id, esc(pname(g) + g.name), sel.includes(g.id))).join('')}${chipBtn('q-topic', 'none', '주제 없음', sel.includes('none'))}</div></div>`;
}
function refreshFilter() { savePrefs(); renderList(); renderSide(); if (dlg.dataset.kind === 'filter') dlg.querySelector('.dlg-b').innerHTML = filterHtml(); }

function applyView(v) {
  q = { ...DEFAULT_Q, ...v.q };
  ui.filter = v.project === 'all' || v.project === 'none' || liveProjects().some(p => p.id === v.project) ? v.project : 'all';
  savePrefs(); renderSide(); renderList();
  if (dlg.open && dlg.dataset.kind === 'filter') dlg.querySelector('.dlg-b').innerHTML = filterHtml();
}

// ---------- 동작 ----------
function setStatus(t, v) {
  t.status = v;
  t.completed_at = v === 'done' ? new Date().toISOString() : null;
  touch(t);
  if (ui.selectedId === t.id) renderPanel();
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* 무시 */ }
    ta.remove();
    return ok;
  }
}

function closePanel() {
  ui.selectedId = null;
  renderPanel();
  renderList();
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const t = id ? taskById(id) : null;

  switch (act) {
    case 'filter': ui.filter = el.dataset.v; savePrefs(); setRail(false); renderList(); break;
    case 'rail-toggle': setRail(!ui.railOpen); break;
    case 'open':
      ui.selectedId = id; renderPanel(); renderList(); break;
    case 'close-panel': closePanel(); break;
    case 'menu-status': {
      if (!t) break;
      openMenu(el, ['todo', 'in_progress', 'done', 'canceled'].map(v => ({
        label: STATUS_LABEL[v], icon: stIcon(v), cur: t.status === v, onPick: () => setStatus(t, v),
      })));
      break;
    }
    case 'menu-project': {
      const t2 = taskById(ui.selectedId);
      if (!t2) break;
      const items = liveProjects().filter(p => !p.archived || p.id === t2.project_id).map(p => ({
        label: p.name, icon: `<span class="dot" style="background:${esc(p.color)}"></span>`, cur: t2.project_id === p.id,
        onPick: () => setProject(t2, p.id),
      }));
      items.push({ label: '미분류', icon: '<span class="dot"></span>', cur: !t2.project_id, onPick: () => setProject(t2, null) });
      items.push({ label: '새 Project', icon: ic('plus'), add: true, onPick: () => newProjectDialog(t2.id) });
      openMenu(el, items);
      break;
    }
    case 'menu-blocker': {
      const t2 = taskById(ui.selectedId);
      if (!t2) break;
      const same = c => c.project_id === t2.project_id;
      const cands = liveTasks()
        .filter(c => c.id !== t2.id && (!isFin(c) || c.id === t2.blocked_by) && !S.wouldCycle(doc, t2.id, c.id))
        .sort((a, b) => (same(a) === same(b) ? S.compareDefault(a, b) : same(a) ? -1 : 1));
      const items = [{ label: '없음', icon: '', cur: !t2.blocked_by, onPick: () => setBlocker(t2, null) }];
      cands.forEach(c => items.push({ label: c.title, sub: c.id, icon: stIcon(S.displayStatus(c)), cur: t2.blocked_by === c.id, onPick: () => setBlocker(t2, c.id) }));
      if (!cands.length) items.push({ label: '고를 수 있는 Task가 없습니다', icon: '', onPick: () => {} });
      openMenu(el, items);
      break;
    }
    case 'menu-topic': {
      const t2 = taskById(ui.selectedId);
      if (!t2 || !t2.project_id) break;
      const cur = topicOf(t2);
      const items = S.topicsOf(doc, t2.project_id, { archived: true }).filter(g => !g.archived || g.id === cur?.id).map(g => ({
        label: g.name, sub: g.memo || '', icon: ic('tag'), cur: cur?.id === g.id,
        onPick: () => { t2.topic_id = g.id; touch(t2); renderPanel(); },
      }));
      items.push({ label: '없음', icon: '', cur: !cur, onPick: () => { t2.topic_id = null; touch(t2); renderPanel(); } });
      items.push({ label: '새 주제', icon: ic('plus'), add: true, onPick: () => newTopicDialog(t2.id, t2.project_id) });
      openMenu(el, items);
      break;
    }
    case 'clear-topic': { const t2 = taskById(ui.selectedId); if (t2) { t2.topic_id = null; touch(t2); renderPanel(); } break; }
    case 'topics': if (ui.railOpen) setRail(false); openDlg('topics', '주제 관리', topicsHtml()); break;
    case 'topic-archive': {
      const g = topicById(id);
      if (!g) break;
      g.archived = !g.archived; g.updated_at = new Date().toISOString();
      persist(); renderAll(); refreshTopicsDlg();
      break;
    }
    case 'topic-del': {
      const g = topicById(id);
      if (!g) break;
      if (el.dataset.armed !== '1') { // 실수 방지: 한 번 더 눌러야 삭제
        el.dataset.armed = '1'; el.style.color = 'var(--danger)'; el.setAttribute('aria-label', '한 번 더 누르면 삭제');
        setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.style.color = ''; el.setAttribute('aria-label', `${g.name} 삭제`); } }, 3000);
        break;
      }
      const n = S.deleteTopic(doc, g);
      q.topics = (q.topics || []).filter(x => x !== g.id);
      persist(); renderAll(); refreshTopicsDlg();
      toast(`주제 “${g.name}” 삭제${n ? ` (Task ${n}건에서 해제)` : ''}`);
      break;
    }
    case 'q-topic': q.topics = tog(q.topics || [], el.dataset.v); refreshFilter(); break;
    case 'clear-blocker': { const t2 = taskById(ui.selectedId); if (t2) setBlocker(t2, null); break; }
    case 'ticker': if (ui.railOpen) setRail(false); openDlg('ticker', '티커', tickerHtml()); break;
    case 'set-tkcolor': case 'set-tkpos': {
      const v = el.dataset.v;
      S.setTickerSettings(doc, act === 'set-tkcolor' ? { color: v } : { position: v });
      persist(); renderTicker();
      refreshTickerDlg(`[data-act="${act}"][data-v="${v}"]`);
      break;
    }
    case 'tk-toggle': {
      const k = tickerById(id);
      if (!k) break;
      k.enabled = !k.enabled; k.updated_at = new Date().toISOString();
      persist(); renderTicker(); updateTickerRow(k);
      break;
    }
    case 'tk-level': {
      const k = tickerById(id);
      if (!k || S.tickerLevel(k) === el.dataset.v) break;
      k.level = el.dataset.v; k.updated_at = new Date().toISOString();
      persist(); renderTicker();
      el.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
      break;
    }
    case 'tk-del': {
      const k = tickerById(id);
      if (!k) break;
      if (el.dataset.armed !== '1') { // 실수 방지: 한 번 더 눌러야 삭제
        el.dataset.armed = '1'; el.style.color = 'var(--danger)'; el.setAttribute('aria-label', '한 번 더 누르면 삭제');
        setTimeout(() => { if (el.isConnected) { el.dataset.armed = ''; el.style.color = ''; el.setAttribute('aria-label', '문장 삭제'); } }, 3000);
        break;
      }
      k.deleted_at = new Date().toISOString(); k.updated_at = k.deleted_at;
      persist(); renderTicker(); refreshTickerDlg('#tkForm input');
      break;
    }
    case 'set-status': { const t2 = taskById(ui.selectedId); if (t2) setStatus(t2, el.dataset.v); break; }
    case 'set-urgency': { const t2 = taskById(ui.selectedId); if (t2) { t2.urgency = el.dataset.v; touch(t2); renderPanel(); } break; }
    case 'clear-start_date': case 'clear-due_date': {
      const t2 = taskById(ui.selectedId);
      if (!t2) break;
      const f = act.slice(6);
      t2[f] = null;
      if (f === 'due_date') t2.due_time = null;
      touch(t2); renderPanel();
      break;
    }
    case 'toggle-allday': {
      const t2 = taskById(ui.selectedId);
      if (!t2 || !t2.due_date) break;
      t2.due_time = t2.due_time ? null : DEFAULT_TIME;
      touch(t2); renderPanel();
      break;
    }
    case 'copy-id': {
      e.stopPropagation();
      toast((await copyText(id)) ? `${id} 복사됨` : `복사 실패: ${id}`);
      break;
    }
    case 'delete': {
      if (!t) break;
      t.deleted_at = new Date().toISOString();
      t.updated_at = t.deleted_at;
      persist();
      if (ui.selectedId === id) ui.selectedId = null;
      renderAll();
      toast('삭제했습니다', { act: 'undo', id, label: '실행 취소' });
      break;
    }
    case 'undo': {
      const d = doc.tasks.find(x => x.id === id);
      if (d) { d.deleted_at = null; d.updated_at = new Date().toISOString(); persist(); renderAll(); }
      $('#toast').hidden = true;
      break;
    }
    case 'settings': {
      if (ui.railOpen) setRail(false);
      openDlg('settings', '설정', settingsHtml());
      if (settingsHtml.persisted === undefined && navigator.storage?.persisted) {
        navigator.storage.persisted().then(v => { settingsHtml.persisted = v; if (dlg.dataset.kind === 'settings') dlg.querySelector('.dlg-b').innerHTML = settingsHtml(); });
      }
      break;
    }
    case 'projects': if (ui.railOpen) setRail(false); openDlg('projects', 'Project 관리', projectsHtml()); break;
    case 'proj-up': case 'proj-down': {
      const list = liveProjects();
      const i = list.findIndex(p => p.id === id);
      const j = act === 'proj-up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= list.length) break;
      [list[i], list[j]] = [list[j], list[i]];
      const ts = new Date().toISOString();
      list.forEach((p, n) => { if (p.order !== n) { p.order = n; p.updated_at = ts; } });
      persist(); renderAll();
      dlg.querySelector('.dlg-b').innerHTML = projectsHtml();
      const same = dlg.querySelector(`[data-act="${act}"][data-id="${id}"]`);
      (same && !same.disabled ? same : dlg.querySelector(`[data-id="${id}"][data-act^="proj-"]:not([disabled])`))?.focus();
      break;
    }
    case 'archive': {
      const p = doc.projects.find(x => x.id === id);
      if (!p) break;
      p.archived = !p.archived; p.updated_at = new Date().toISOString();
      persist(); renderSide();
      if (p.archived && ui.filter === p.id) ui.filter = 'all';
      renderAll();
      dlg.querySelector('.dlg-b').innerHTML = projectsHtml();
      break;
    }
    case 'export': download(`tasks-export-${S.todayKST().replaceAll('-', '')}.json`, JSON.stringify(doc, null, 2)); break;
    case 'wipe': {
      if (el.dataset.armed !== '1') {
        el.dataset.armed = '1';
        el.textContent = '정말 삭제합니다 — 한 번 더 누르세요';
        break;
      }
      await S.clearAll();
      location.reload();
      break;
    }
    case 'close-dlg': dlg.close(); break;
    case 'sign-in': Sync.signIn(); break;
    case 'sign-out': Sync.signOut(); toast('동기화를 중지했습니다. 이 기기의 데이터는 그대로 남아 있습니다.'); break;
    case 'sync-now': Sync.syncNow(); break;
    case 'sync-click': {
      const st = Sync.getState();
      if (!st.signedIn) { openDlg('settings', '설정', settingsHtml()); break; }
      Sync.syncNow();
      break;
    }
    case 'filter-sheet': openDlg('filter', '필터·정렬', filterHtml()); break;
    case 'q-status': q.statuses = tog(q.statuses, el.dataset.v); refreshFilter(); break;
    case 'q-urg': q.urgencies = tog(q.urgencies, el.dataset.v); refreshFilter(); break;
    case 'q-due': q.due = el.dataset.v; refreshFilter(); break;
    case 'q-sort': q.sort = el.dataset.v; refreshFilter(); break;
    case 'q-dir': q.dir = el.dataset.v; refreshFilter(); break;
    case 'q-group': q.group = el.dataset.v; refreshFilter(); break;
    case 'q-hide': q.hideDone = !q.hideDone; refreshFilter(); break;
    case 'q-reset': q = { ...DEFAULT_Q }; ui.filter = 'all'; refreshFilter(); break;
    case 'toggle-views': ui.viewsOpen = !ui.viewsOpen; savePrefs(); renderSide(); break;
    case 'apply-view': { setRail(false); const v = (doc.views || []).find(x => x.id === id && !x.deleted_at); if (v) { applyView(v); if (dlg.open && dlg.dataset.kind === 'filter') dlg.close(); } break; }
    case 'del-view': {
      const v = (doc.views || []).find(x => x.id === id);
      if (v) { v.deleted_at = new Date().toISOString(); v.updated_at = v.deleted_at; persist(); refreshFilter(); }
      break;
    }
  }
});

document.addEventListener('pointerdown', e => { if (ui.railOpen && !e.target.closest('#side')) setRail(false); });
$('#backdrop').addEventListener('click', closePanel);
$('#swHide').addEventListener('click', () => { q.hideDone = !q.hideDone; savePrefs(); renderList(); });

// 입력 필드 (자동 저장)
document.addEventListener('input', e => {
  const f = e.target.dataset?.f;
  if (!f || e.target.closest('#panel') == null) return;
  const t = taskById(ui.selectedId);
  if (!t) return;
  const v = e.target.value;
  if (f === 'title') { if (v.trim()) { t.title = v.trim(); touch(t); } }
  else if (f === 'memo') { t.memo = v; touch(t); }
});
document.addEventListener('change', e => {
  const f = e.target.dataset?.f;
  if (!f || e.target.closest('#panel') == null) return;
  const t = taskById(ui.selectedId);
  if (!t) return;
  const v = e.target.value;
  if (f === 'title' && !v.trim()) { e.target.value = t.title; return; }
  if (f === 'start_date' || f === 'due_date') {
    t[f] = v || null;
    if (f === 'due_date' && !v) t.due_time = null;
    touch(t); renderPanel();
  } else if (f === 'due_time') {
    t.due_time = v || null;
    touch(t); renderPanel();
  }
});
// Project 이름 변경 (관리 다이얼로그)
dlg.addEventListener('change', e => {
  const pid = e.target.dataset?.pid;
  if (!pid) return;
  const p = doc.projects.find(x => x.id === pid);
  const name = e.target.value.trim().slice(0, 40);
  if (!p || !name) { if (p) e.target.value = p.name; return; }
  p.name = name; p.updated_at = new Date().toISOString();
  persist(); renderAll();
});

// 티커 문장 편집 (관리 다이얼로그) — 입력을 마치면(change) 저장
dlg.addEventListener('change', e => {
  const kid = e.target.dataset?.kid;
  if (!kid) return;
  const k = tickerById(kid);
  if (!k) return;
  const f = e.target.dataset.kf, v = e.target.value;
  if (f === 'text') {
    const s = v.trim().slice(0, 120);
    if (!s) { e.target.value = k.text; return; }
    k.text = s;
  } else if (['expire_date', 'daily_from', 'daily_to'].includes(f)) k[f] = v || null;
  else return;
  k.updated_at = new Date().toISOString();
  persist(); renderTicker(); updateTickerRow(k);
});
dlg.addEventListener('submit', e => {
  if (e.target.id !== 'tkForm') return;
  e.preventDefault();
  const k = S.createTicker(doc, new FormData(e.target).get('text'));
  if (!k) return;
  persist(); renderTicker(); refreshTickerDlg('#tkForm input');
});

// 뷰 저장 / 검색
dlg.addEventListener('input', e => {
  if (e.target.id === 'q-text') { q.text = e.target.value.trim(); savePrefs(); renderList(); const b = dlg.querySelector('[data-act=close-dlg].primary'); if (b) b.textContent = `${visibleTasks().length}건 보기`; }
});
dlg.addEventListener('submit', e => {
  if (e.target.id !== 'viewForm') return;
  e.preventDefault();
  const name = String(new FormData(e.target).get('name')).trim().slice(0, 30);
  if (!name) return;
  const ts = new Date().toISOString();
  doc.views = doc.views || [];
  const used = new Set(doc.views.map(v => v.id));
  let vid; do { vid = 'V-' + Array.from(crypto.getRandomValues(new Uint8Array(5)), b => '23456789abcdefghjkmnpqrstuvwxyz'[b % 31]).join(''); } while (used.has(vid));
  const exist = doc.views.find(v => !v.deleted_at && v.name === name);
  if (exist) { exist.project = ui.filter; exist.q = { ...q }; exist.updated_at = ts; }
  else doc.views.push({ id: vid, name, project: ui.filter, q: { ...q }, updated_at: ts, deleted_at: null });
  persist(); refreshFilter(); toast(`뷰 “${name}” 저장됨`);
});

// 주제: 새로 만들기 (Task 편집에서 / 주제 관리에서), 이름·메모 변경
dlg.addEventListener('submit', e => {
  if (e.target.id !== 'newTopicForm' && e.target.id !== 'newTopicMgr') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const pid = e.target.id === 'newTopicForm' ? e.target.dataset.pid : String(fd.get('pid'));
  const r = S.addTopic(doc, pid, String(fd.get('name')), String(fd.get('memo') || ''));
  if (r.error) { toast(r.error); return; }
  const forTask = e.target.dataset.task && taskById(e.target.dataset.task);
  if (forTask && forTask.project_id === pid) { forTask.topic_id = r.topic.id; forTask.updated_at = new Date().toISOString(); }
  persist(); renderAll();
  if (r.existed) toast(`같은 이름의 주제 “${r.topic.name}”가 있어 그것을 사용합니다`);
  if (dlg.dataset.kind === 'topics') { refreshTopicsDlg(); dlg.querySelector('#newTopicMgr input[name=name]')?.focus(); }
  else dlg.close();
});
dlg.addEventListener('change', e => {
  const gid = e.target.dataset?.gid;
  if (!gid) return;
  const g = topicById(gid);
  if (!g) return;
  if (e.target.dataset.gf === 'name') {
    const name = e.target.value.trim().slice(0, 60);
    const dup = name && S.topicsOf(doc, g.project_id, { archived: true }).some(x => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase());
    if (!name || dup) { e.target.value = g.name; if (dup) toast('같은 Project에 같은 이름의 주제가 있습니다'); return; }
    g.name = name;
  } else g.memo = e.target.value.trim().slice(0, 200);
  g.updated_at = new Date().toISOString();
  persist(); renderList(); renderPanel();
});

// 새 Project 폼 (두 다이얼로그 공용)
dlg.addEventListener('submit', e => {
  if (e.target.id !== 'newProjForm') return;
  e.preventDefault();
  const name = new FormData(e.target).get('name');
  const p = S.addProject(doc, String(name));
  if (!p) return;
  const forTask = e.target.dataset.task && taskById(e.target.dataset.task);
  if (forTask) { forTask.project_id = p.id; forTask.topic_id = null; forTask.updated_at = new Date().toISOString(); }
  persist();
  renderAll();
  if (dlg.dataset.kind === 'projects') dlg.querySelector('.dlg-b').innerHTML = projectsHtml();
  else dlg.close();
});

// 빠른 추가
$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#quickInput');
  const title = input.value.trim();
  if (!title) return;
  const pid = ui.filter !== 'all' && ui.filter !== 'none' ? ui.filter : null;
  S.createTask(doc, { title, project_id: pid });
  input.value = '';
  persist();
  renderSide(); renderList();
  $('#list').scrollTop = 0;
});

addEventListener('resize', () => {
  const sz = $('#scrSize');
  if (sz) sz.textContent = `${innerWidth} × ${innerHeight}`;
  document.body.classList.toggle('sheet-open', !!ui.selectedId && !wide());
  clearTimeout(tkResize);
  tkResize = setTimeout(() => renderTicker(), 200);
});
let tkResize;

// ---------- 시작 ----------
(async function init() {
  doc = await S.load();
  if (S.ensureProjectOrder(doc)) persist();
  loadPrefs();
  if (!['all', 'none'].includes(ui.filter) && !liveProjects().some(p => p.id === ui.filter)) ui.filter = 'all';
  renderAll();
  Sync.init({ getDoc: () => doc, applyMerged, onStatus: renderSyncLabel });
  renderSyncLabel();
  navigator.storage?.persist?.().then(v => { settingsHtml.persisted = v; }).catch(() => {});
  setInterval(() => { renderList(); renderSide(); renderTicker(); }, 60000); // 지연 중 상태·티커 표시 시간 갱신
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderTicker(); });
})();

// 탭을 닫거나 숨길 때 대기 중인 저장을 즉시 반영
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && doc) persist(true); });
addEventListener('pagehide', () => { if (doc) persist(true); });
