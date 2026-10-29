// 다이얼로그 내용: 라벨·주제 관리, 새 라벨·주제, 필터·정렬, 설정, 티커
import * as S from './store.js';
import { st, liveTasks, STATUS_LABEL, URG_LABEL, SORT_LABEL, GROUP_LABEL, DUE_LABEL } from './state.js';
import { esc, ic, openDlg, dlgIs, setDlgBody } from './util.js';
import { visibleTasks, byCreated } from './render.js';
import * as Sync from './sync.js';

export const APP_VERSION = 'v2 · V3';
const doc = () => st.doc;
const live = arr => arr.filter(x => !x.deleted_at);
const seg = (field, options, cur) => `<div class="seg xs" role="group">${options.map(([v, l]) => `<button type="button" data-act="set-${field}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
const chipBtn = (act, v, label, on) => `<button type="button" class="chip" data-act="${act}" data-v="${esc(v)}" aria-pressed="${on}">${label}</button>`;

// ---------- 라벨·주제 관리 ----------
export const openTopicsOf = new Set(); // 주제 목록을 펼친 라벨
export function labelsHtml() {
  const list = S.liveLabels(doc());
  const tasksOf = id => liveTasks().filter(t => t.label_ids.includes(id)).length;
  const topicTasks = gid => liveTasks().filter(t => S.taskTopics(doc(), t).some(g => g.id === gid)).length;
  const rows = list.map((l, i) => {
    const topics = S.topicsOfLabel(doc(), l.id, { archived: true });
    const open = openTopicsOf.has(l.id);
    return `<div class="lbrow${l.archived ? ' arch' : ''}">
      <div class="r1">
        <button type="button" class="cdot" data-act="label-color" data-id="${l.id}" aria-label="${esc(l.name)} 색 바꾸기" title="색 바꾸기" style="background:${esc(l.color)}"></button>
        <input class="in sm" data-lid="${l.id}" data-lf="name" value="${esc(l.name)}" maxlength="40" aria-label="라벨 이름">
        <button class="icbtn sm" data-act="label-up" data-id="${l.id}" aria-label="${esc(l.name)} 위로"${i === 0 ? ' disabled' : ''}>${ic('up')}</button>
        <button class="icbtn sm" data-act="label-down" data-id="${l.id}" aria-label="${esc(l.name)} 아래로"${i === list.length - 1 ? ' disabled' : ''}>${ic('down')}</button>
      </div>
      <input class="in sm" data-lid="${l.id}" data-lf="memo" value="${esc(l.memo || '')}" maxlength="200" placeholder="라벨 메모 (선택)" aria-label="라벨 메모">
      <div class="r3">
        <button type="button" class="tg" data-act="label-topics" data-id="${l.id}" aria-expanded="${open}">${ic('chev')}주제 ${topics.length}개</button>
        <span class="tpn">Task ${tasksOf(l.id)}</span>
        <span class="gid">${l.id}</span>
        <button class="btn sm" data-act="label-archive" data-id="${l.id}">${l.archived ? '복원' : '보관'}</button>
        <button class="icbtn sm" data-act="label-del" data-id="${l.id}" aria-label="${esc(l.name)} 삭제">${ic('trash')}</button>
      </div>
      ${open ? `<div class="tplist">${topics.map(g => `<div class="tprow${g.archived ? ' arch' : ''}">
          <div class="r1">${ic('tag')}<input class="in sm" data-gid="${g.id}" data-gf="name" value="${esc(g.name)}" maxlength="60" aria-label="주제 이름"><span class="tpn">${topicTasks(g.id)}</span>
            <button class="btn sm" data-act="topic-archive" data-id="${g.id}">${g.archived ? '복원' : '보관'}</button>
            <button class="icbtn sm" data-act="topic-del" data-id="${g.id}" aria-label="${esc(g.name)} 삭제">${ic('trash')}</button></div>
          <input class="in sm" data-gid="${g.id}" data-gf="memo" value="${esc(g.memo || '')}" maxlength="200" placeholder="주제 메모 (선택: 케이스 번호, Obsidian 문서 이름 등)" aria-label="주제 메모">
        </div>`).join('')}
        <form class="prow" data-newtopic="${l.id}" autocomplete="off"><input class="in sm" name="name" maxlength="60" placeholder="새 주제" aria-label="${esc(l.name)}에 새 주제" required><button class="btn sm primary" type="submit">추가</button></form>
      </div>` : ''}
    </div>`;
  }).join('');
  return `${rows || '<p class="hint">아직 라벨이 없습니다.</p>'}
    <form class="prow" id="newLabelMgr" autocomplete="off"><input class="in" name="name" maxlength="40" placeholder="새 라벨 (프로젝트, 솔루션, 고객사 등)" aria-label="새 라벨 이름" required><button class="btn primary" type="submit">추가</button></form>
    <p class="hint">라벨은 Task에 여러 개 붙일 수 있고, 주제는 라벨 아래에 둡니다. 보관하면 고르는 목록에서만 숨겨집니다. 라벨을 삭제하면 그 라벨의 주제도 함께 삭제되고 Task에서 떼어 냅니다. 색 점을 누르면 색이 바뀝니다.</p>`;
}
export const refreshLabelsDlg = focusSel => { if (dlgIs('labels')) setDlgBody(labelsHtml(), focusSel); };
export function openLabels(focusLabelId) {
  if (focusLabelId) openTopicsOf.add(focusLabelId);
  openDlg('labels', '라벨·주제 관리', labelsHtml());
}

export function newLabelDialog(forTaskId) {
  openDlg('newlabel', '새 라벨', `<form id="newLabelForm" data-task="${forTaskId || ''}" class="dlg-b" style="padding:0" autocomplete="off">
    <input class="in" name="name" maxlength="40" placeholder="라벨 이름" aria-label="라벨 이름" required>
    <button class="btn primary" type="submit">추가</button></form>`);
  document.querySelector('#newLabelForm input').focus();
}
export function newTopicDialog(forTaskId, labelIds, preferLabel) {
  const ls = labelIds.map(id => S.labelById(doc(), id)).filter(Boolean);
  openDlg('newtopic', '새 주제', `<form id="newTopicForm" data-task="${forTaskId || ''}" class="dlg-b" style="padding:0" autocomplete="off">
    <label class="fl" for="nt-label">라벨</label>
    <select class="in" id="nt-label" name="label">${ls.map(l => `<option value="${l.id}"${l.id === preferLabel ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>
    <input class="in" name="name" maxlength="60" placeholder="주제 이름" aria-label="주제 이름" required>
    <input class="in" name="memo" maxlength="200" placeholder="한 줄 메모 (선택)" aria-label="주제 메모">
    <button class="btn primary" type="submit">추가</button></form>`);
  document.querySelector('#newTopicForm input[name=name]').focus();
}

// ---------- 필터·정렬 ----------
function labelFilterHtml() {
  const q = st.q;
  const ls = S.liveLabels(doc()).filter(l => !l.archived || q.labels.includes(l.id));
  if (!ls.length) return '';
  return `<div class="fsec"><div class="flrow"><span class="fl">라벨</span>${q.labels.length > 1 ? seg('qlmode', [['any', '하나라도'], ['all', '모두 포함']], q.labelMode) : ''}</div>
    <div class="chips2">${ls.map(l => chipBtn('q-label', l.id, `<span class="dot" style="background:${esc(l.color)}"></span>${esc(l.name)}`, q.labels.includes(l.id))).join('')}${chipBtn('q-label', 'none', '미분류', q.labels.includes('none'))}</div></div>`;
}
function topicFilterHtml() {
  const q = st.q;
  const base = q.labels.filter(x => x !== 'none');
  const side = st.ui.filter !== 'all' && st.ui.filter !== 'none' ? [st.ui.filter] : [];
  const scope = base.length ? base : side.length ? side : S.liveLabels(doc()).map(l => l.id);
  let list = scope.flatMap(id => S.topicsOfLabel(doc(), id));
  list = list.concat(live(doc().topics).filter(g => q.topics.includes(g.id) && !list.includes(g)));
  if (!list.length && !q.topics.length) return '';
  const multi = new Set(list.map(g => g.label_id)).size > 1;
  const name = g => (multi ? `${S.labelById(doc(), g.label_id)?.name || ''} · ` : '') + g.name;
  return `<div class="fsec"><span class="fl">주제</span><div class="chips2">${list.map(g => chipBtn('q-topic', g.id, esc(name(g)), q.topics.includes(g.id))).join('')}${chipBtn('q-topic', 'none', '주제 없음', q.topics.includes('none'))}</div></div>`;
}
export function filterHtml() {
  const q = st.q;
  const views = live(doc().views);
  return `<div class="fsec"><label class="fl" for="q-text">검색 (제목·메모·ID·라벨·주제)</label><input class="in" id="q-text" type="search" value="${esc(q.text)}" maxlength="100"></div>
  <div class="fsec"><span class="fl">상태</span><div class="chips2">${['todo', 'in_progress', 'delayed', 'done', 'canceled'].map(v => chipBtn('q-status', v, STATUS_LABEL[v], q.statuses.includes(v))).join('')}</div></div>
  <div class="fsec"><span class="fl">긴급도</span><div class="chips2">${Object.keys(URG_LABEL).map(v => chipBtn('q-urg', v, URG_LABEL[v], q.urgencies.includes(v))).join('')}</div></div>
  ${labelFilterHtml()}
  ${topicFilterHtml()}
  <div class="fsec"><span class="fl">마감</span><div class="chips2">${Object.keys(DUE_LABEL).map(v => chipBtn('q-due', v, DUE_LABEL[v], q.due === v)).join('')}</div></div>
  <div class="fsec"><span class="fl">정렬</span><div class="chips2">${Object.keys(SORT_LABEL).map(v => chipBtn('q-sort', v, SORT_LABEL[v], q.sort === v)).join('')}${chipBtn('q-dir', q.dir === 'asc' ? 'desc' : 'asc', q.dir === 'asc' ? '오름차순 ↑' : '내림차순 ↓', false)}</div></div>
  <div class="fsec"><span class="fl">그룹</span><div class="chips2">${Object.keys(GROUP_LABEL).map(v => chipBtn('q-group', v, GROUP_LABEL[v], q.group === v)).join('')}</div>
    ${q.group === 'label' || q.group === 'topic' ? '<p class="hint">라벨·주제가 여러 개인 Task는 해당 그룹마다 한 번씩 나옵니다.</p>' : ''}</div>
  <button type="button" class="sw" data-act="q-hide" role="switch" aria-checked="${q.hideDone}"><i></i>완료/취소 숨김 (상태를 고르지 않았을 때)</button>
  <div class="fsec"><span class="fl">저장된 뷰</span>
    ${views.map(v => `<div class="vrow"><button class="apply" data-act="apply-view" data-id="${v.id}">${esc(v.name)}</button><button class="icbtn" data-act="del-view" data-id="${v.id}" aria-label="${esc(v.name)} 삭제">${ic('trash')}</button></div>`).join('') || '<p class="hint">저장된 뷰가 없습니다.</p>'}
    <form class="prow" id="viewForm" autocomplete="off"><input class="in" name="name" maxlength="30" placeholder="현재 조건을 뷰로 저장" aria-label="뷰 이름" required><button class="btn primary" type="submit">저장</button></form>
  </div>
  <div style="display:flex;gap:8px"><button class="btn" data-act="q-reset" style="flex:1">초기화</button><button class="btn primary" data-act="close-dlg" style="flex:1">${visibleTasks().length}건 보기</button></div>`;
}

// ---------- 설정 ----------
const SYNC_TEXT = { off: '사용 안 함', 'needs-auth': '로그인 필요', syncing: '동기화 중…', ok: '정상', offline: '오프라인', error: '오류' };
function syncHtml() {
  const s = Sync.getState();
  return `<div class="kv"><span>Google Drive 동기화</span><span>${SYNC_TEXT[s.status] || s.status}${s.lastSync ? ' · ' + esc(s.lastSync) : ''}</span></div>
    ${s.detail && s.status !== 'ok' ? `<p class="hint">${esc(s.detail)}</p>` : ''}
    ${s.signedIn ? '<div class="btns"><button class="btn" data-act="sync-now">지금 동기화</button><button class="btn" data-act="sign-out">로그아웃 (동기화 중지)</button></div>'
      : '<button class="btn primary" data-act="sign-in">Google 로그인 · Drive 동기화 켜기</button><p class="hint">저장 위치: 내 드라이브 › 05 CMTINFO › 07 Task Manager › v2. 처음 켜면 이 기기와 Drive의 데이터를 항목별로 합칩니다.</p>'}`;
}
export function settingsHtml() {
  const persisted = settingsHtml.persisted;
  return `<div class="kv"><span>버전</span><span>${APP_VERSION}</span></div>
    <div class="kv"><span>저장 위치</span><span>${S.storageOk ? '이 기기 (IndexedDB)' : '저장 불가 (임시)'}</span></div>
    <div class="kv"><span>브라우저 보존 보장</span><span>${persisted === undefined ? '확인 중' : persisted ? '예' : '아니오'}</span></div>
    ${syncHtml()}
    <div class="kv"><span>화면 크기 (CSS px)</span><span id="scrSize">${innerWidth} × ${innerHeight}</span></div>
    <button type="button" class="sw" role="switch" data-act="toggle-showactive" aria-checked="${st.ui.showActive}"><i></i>목록 맨 위에 “진행 기간 중” 묶음 표시 (이 기기)</button>
    <div class="kv"><span>Task / 라벨 / 주제</span><span>${liveTasks().length}건 / ${S.liveLabels(doc()).length}개 / ${live(doc().topics).length}개</span></div>
    <button class="btn" data-act="labels">라벨·주제 관리</button>
    <button class="btn" data-act="ticker">티커 관리</button>
    <button class="btn" data-act="export-json">JSON 내려받기 (백업)</button>
    <button class="btn danger" data-act="wipe">이 기기 데이터 삭제</button>`;
}

// ---------- 티커 ----------
export const TK_STATE = { on: ['표시 중', 'on'], off: ['꺼짐', ''], outside: ['시간대 외', ''], expired: ['만료', 'exp'] };
export function tickerHtml() {
  const set = S.tickerSettings(doc());
  const now = S.nowKST();
  const list = live(doc().ticker).sort(byCreated);
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
    <p class="hint">켜 둔 문장만 띠에 흐릅니다. 종료일이 지나면 "만료"로 남습니다. 매일 시간대는 시작과 끝을 모두 넣어야 적용되고, 시작이 끝보다 늦으면 자정을 넘깁니다. 띠를 누르면 일시정지합니다.</p>`;
}
