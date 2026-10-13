import * as S from './store.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wide = () => matchMedia('(min-width:700px)').matches;

let doc;
const DEFAULT_Q = { text: '', statuses: [], urgencies: [], due: 'any', sort: 'due', dir: 'asc', group: 'none', hideDone: true };
const ui = { filter: 'all', selectedId: null, viewsOpen: true, railOpen: false };
function setRail(v) { ui.railOpen = v; document.querySelector('.app').classList.toggle('rail-open', v); renderSide(); }
let q = { ...DEFAULT_Q };
const SORT_LABEL = { due: '마감일', start: '시작일', urgency: '긴급도', created: '생성일', title: '제목' };
const GROUP_LABEL = { none: '없음', project: 'Project', urgency: '긴급도', status: '상태', due: '마감' };
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
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  gear: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  folder: '<path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>',
};
const ic = (name, style = '', cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}>${P[name]}</svg>`;

function stIcon(s) {
  const base = (stroke, fill = '#fff') => `<circle cx="12" cy="12" r="9" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  const body = {
    todo: base('#7A8294'),
    in_progress: base('#2D5BE3') + '<path d="M12 3a9 9 0 010 18z" fill="#2D5BE3"/>',
    done: base('#1E7A46', '#1E7A46') + '<path d="M7.8 12.4l3 3 5.4-5.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    canceled: base('#6B7385', '#6B7385') + '<path d="M9 9l6 6M15 9l-6 6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
    delayed: base('#D93025') + '<path d="M12 7.5v5" stroke="#D93025" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.3" r="1.4" fill="#D93025"/>',
  }[s];
  return `<svg class="st" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

// ---------- 데이터 조회 ----------
const liveTasks = () => doc.tasks.filter(t => !t.deleted_at);
const liveProjects = () => doc.projects.filter(p => !p.deleted_at);
const projOf = t => (t.project_id ? liveProjects().find(p => p.id === t.project_id) || null : null);
const taskById = id => doc.tasks.find(t => t.id === id && !t.deleted_at);
const isFin = t => t.status === 'done' || t.status === 'canceled';

function matches(t, now) {
  const ds = S.displayStatus(t, now);
  if (q.statuses.length) { if (!q.statuses.includes(ds) && !q.statuses.includes(t.status)) return false; }
  else if (q.hideDone && isFin(t)) return false;
  if (q.urgencies.length && !q.urgencies.includes(t.urgency)) return false;
  if (q.text) {
    const hay = `${t.title} ${t.memo} ${t.id}`.toLowerCase();
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
  return (q.text ? 1 : 0) + (q.statuses.length ? 1 : 0) + (q.urgencies.length ? 1 : 0) + (q.due !== 'any' ? 1 : 0) + (q.group !== 'none' ? 1 : 0)
    + (q.sort !== 'due' || q.dir !== 'asc' ? 1 : 0) + (!q.hideDone && !q.statuses.length ? 1 : 0);
}

// ---------- 저장 ----------
let saveTimer;
function persist(now = false) {
  clearTimeout(saveTimer);
  const run = async () => {
    const ok = await S.save(doc);
    $('#syncLabel').textContent = ok ? '이 기기에 저장됨' : '저장 불가 (임시)';
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
    parts.push(`<span class="d${late ? ' late' : ''}"${!late && !isFin(t) ? ' style="color:#1B1F2A;font-weight:600"' : ''}>${clock}마감 ${md(t.due_date)}${t.due_time ? ' ' + t.due_time : ''}${suffix}</span>`);
  }
  if (t.start_date) parts.push(`<span class="d">시작 ${md(t.start_date)}</span>`);
  return parts.length ? `<div class="dates">${parts.join('')}</div>` : '';
}

// ---------- 렌더 ----------
function cardHtml(t, now) {
  const ds = S.displayStatus(t, now);
  const p = projOf(t);
  return `<article class="card${isFin(t) ? ' fin' : ''}" data-act="open" data-id="${t.id}"${ui.selectedId === t.id ? ' aria-current="true"' : ''}>
    <button class="chk" data-act="menu-status" data-id="${t.id}" aria-label="상태: ${STATUS_LABEL[ds]}, 변경하려면 선택" aria-haspopup="menu">${stIcon(ds)}</button>
    <div class="body">
      <div class="row1"><div class="title">${esc(t.title)}</div><button class="idbtn" data-act="copy-id" data-id="${t.id}" aria-label="Task ID ${t.id} 복사">${t.id}</button></div>
      <div class="meta"><span class="proj"><span class="dot" style="background:${p ? esc(p.color) : '#9AA1B1'}"></span>${p ? esc(p.name) : '미분류'}</span><span class="badge u-${t.urgency}">${URG_LABEL[t.urgency]}</span></div>
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
  const lead = it => it.icon || `<span class="dot" style="background:${it.color ? esc(it.color) : '#9AA1B1'}"></span>`;
  $('#chips').innerHTML = items.map(it => `<button class="chip" data-act="filter" data-v="${it.v}" aria-pressed="${ui.filter === it.v}">${it.icon ? '' : lead(it)}${esc(it.name)} <span class="n">${count(it.v)}</span></button>`).join('');
  $('#side').innerHTML = `<button class="nav rail-toggle" data-act="rail-toggle" aria-expanded="${ui.railOpen}" title="메뉴 펼치기/접기">${ic('menu')}<span class="lbl">접기</span></button><h3>Project</h3>` +
    items.map(it => `<button class="nav" data-act="filter" data-v="${it.v}" aria-pressed="${ui.filter === it.v}" title="${esc(it.name)}">${lead(it)}<span class="lbl">${esc(it.name)}</span><span class="n">${count(it.v)}</span></button>`).join('') +
    `<button class="vh" data-act="toggle-views" aria-expanded="${ui.viewsOpen}">${ic('chev')}저장된 뷰</button>` +
    (ui.viewsOpen ? ((doc.views || []).filter(v => !v.deleted_at).map(v => `<button class="nav vh-item" data-act="apply-view" data-id="${v.id}" title="${esc(v.name)}"><span class="lbl">${esc(v.name)}</span></button>`).join('') || '<span class="hint" style="margin:0 10px">저장된 뷰 없음</span>') : '') +
    `<span class="sp"></span>` +
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
    <div><span class="fl" id="lbl-proj">Project</span><button type="button" class="sel" data-act="menu-project" aria-haspopup="listbox" aria-labelledby="lbl-proj"><span class="l"><span class="dot" style="background:${p ? esc(p.color) : '#9AA1B1'}"></span>${p ? esc(p.name) : '미분류'}</span>${ic('chev', 'color:#5F6676')}</button></div>
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

function renderPanel() {
  const t = ui.selectedId ? taskById(ui.selectedId) : null;
  if (!t) ui.selectedId = null;
  $('#panel').innerHTML = panelHtml(t);
  document.body.classList.toggle('sheet-open', !!t && !wide());
}
const renderAll = () => { renderSide(); renderList(); renderPanel(); };

// ---------- 팝오버 메뉴 ----------
let closeMenu = () => {};
function openMenu(anchor, items) {
  closeMenu();
  const root = $('#menuRoot');
  root.innerHTML = `<div class="pop" role="menu">${items.map((it, i) => `<button class="mi${it.cur ? ' cur' : ''}${it.add ? ' add' : ''}" role="menuitem" data-i="${i}">${it.icon || ''}${esc(it.label)}${it.cur ? ic('check', '', 'ck') : ''}</button>`).join('')}</div>`;
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
    <div class="kv"><span>저장 위치</span><span>${S.storageOk ? '이 기기 (IndexedDB)' : '저장 불가 (임시)'}</span></div>
    <div class="kv"><span>브라우저 보존 보장</span><span>${persisted === undefined ? '확인 중' : persisted ? '예' : '아니오'}</span></div>
    <div class="kv"><span>Task / Project</span><span>${liveTasks().length}건 / ${liveProjects().length}개</span></div>
    <button class="btn" data-act="projects">Project 관리</button>
    <button class="btn" data-act="export">JSON 내려받기</button>
    <button class="btn danger" data-act="wipe">이 기기 데이터 삭제</button>`;
}

function projectsHtml() {
  const rows = liveProjects().map(p => `<div class="prow${p.archived ? ' arch' : ''}"><span class="dot" style="background:${esc(p.color)}"></span><input class="in" data-pid="${p.id}" value="${esc(p.name)}" maxlength="40" aria-label="Project 이름"><button class="btn" data-act="archive" data-id="${p.id}">${p.archived ? '복원' : '보관'}</button></div>`).join('');
  return `${rows || '<p class="hint">아직 Project가 없습니다.</p>'}
    <form class="prow" id="newProjForm"><input class="in" name="name" maxlength="40" placeholder="새 Project 이름" aria-label="새 Project 이름" required><button class="btn primary" type="submit">추가</button></form>
    <p class="hint">보관한 Project는 선택 목록에서 숨겨지고 Task는 그대로 유지됩니다.</p>`;
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
        onPick: () => { t2.project_id = p.id; touch(t2); renderPanel(); },
      }));
      items.push({ label: '미분류', icon: '<span class="dot"></span>', cur: !t2.project_id, onPick: () => { t2.project_id = null; touch(t2); renderPanel(); } });
      items.push({ label: '새 Project', icon: ic('plus'), add: true, onPick: () => newProjectDialog(t2.id) });
      openMenu(el, items);
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

// 새 Project 폼 (두 다이얼로그 공용)
dlg.addEventListener('submit', e => {
  if (e.target.id !== 'newProjForm') return;
  e.preventDefault();
  const name = new FormData(e.target).get('name');
  const p = S.addProject(doc, String(name));
  if (!p) return;
  const forTask = e.target.dataset.task && taskById(e.target.dataset.task);
  if (forTask) { forTask.project_id = p.id; forTask.updated_at = new Date().toISOString(); }
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
});

// ---------- 시작 ----------
(async function init() {
  doc = await S.load();
  loadPrefs();
  if (!['all', 'none'].includes(ui.filter) && !liveProjects().some(p => p.id === ui.filter)) ui.filter = 'all';
  if (!S.storageOk) $('#syncLabel').textContent = '저장 불가 (임시)';
  renderAll();
  navigator.storage?.persist?.().then(v => { settingsHtml.persisted = v; }).catch(() => {});
  setInterval(() => { renderList(); renderSide(); }, 60000); // 지연 중 상태 갱신
})();

// 탭을 닫거나 숨길 때 대기 중인 저장을 즉시 반영
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && doc) persist(true); });
addEventListener('pagehide', () => { if (doc) persist(true); });
