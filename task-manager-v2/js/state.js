// 앱 상태: 문서, 화면 상태, 필터 조건, 기기별 설정, 저장
import * as S from './store.js';

export const STATUS_LABEL = { todo: '대기', in_progress: '진행 중', delayed: '지연 중', done: '완료', canceled: '취소' };
export const URG_LABEL = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' };
export const URG_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
export const SORT_LABEL = { due: '마감일', start: '시작일', urgency: '긴급도', created: '생성일', title: '제목' };
export const GROUP_LABEL = { none: '없음', label: '라벨', topic: '주제', urgency: '긴급도', status: '상태', due: '마감' };
export const DUE_LABEL = { any: '전체', overdue: '지연', today: '오늘', week: '7일 이내', none: '마감일 없음' };
export const DEFAULT_TIME = '09:00';

export const DEFAULT_Q = { text: '', statuses: [], urgencies: [], labels: [], labelMode: 'any', topics: [], due: 'any', sort: 'due', dir: 'asc', group: 'none', hideDone: true };

// filter: 사이드바에서 고른 라벨 ('all' | 'none' | 라벨 ID). 새로 열면 항상 'all'
export const st = {
  doc: null,
  logs: null, // 작업 이력 문서 { schema: 'tm2-logs', logs: [] }
  ui: { filter: 'all', selectedId: null, viewsOpen: true, railOpen: false, activeOpen: true, showActive: true, propsOpen: true, calOpen: false },
  q: { ...DEFAULT_Q },
};

const PREF_KEY = 'tm2-ui';
export function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
    if (!p) return;
    st.q = { ...DEFAULT_Q, ...p.q };
    for (const k of ['viewsOpen', 'activeOpen', 'showActive', 'propsOpen', 'calOpen']) if (typeof p[k] === 'boolean') st.ui[k] = p[k];
  } catch { /* 무시 */ }
}
export function savePrefs() {
  const { viewsOpen, activeOpen, showActive, propsOpen, calOpen } = st.ui;
  try { localStorage.setItem(PREF_KEY, JSON.stringify({ q: st.q, viewsOpen, activeOpen, showActive, propsOpen, calOpen })); } catch { /* 무시 */ }
}

let saveTimer;
const afterSave = [];
export const onSaved = fn => afterSave.push(fn);
export function persist(now = false) {
  clearTimeout(saveTimer);
  const run = async () => { await S.save(st.doc); afterSave.forEach(f => f()); };
  if (now) return run();
  saveTimer = setTimeout(run, 250);
}
let logTimer;
export function persistLogs(now = false) {
  clearTimeout(logTimer);
  const run = async () => { await S.saveLogs(st.logs); afterSave.forEach(f => f()); };
  if (now) return run();
  logTimer = setTimeout(run, 250);
}

// 자주 쓰는 조회
export const doc = () => st.doc;
export const liveTasks = () => st.doc.tasks.filter(t => !t.deleted_at);
export const taskById = id => S.taskById(st.doc, id);
export const selTask = () => (st.ui.selectedId ? S.taskById(st.doc, st.ui.selectedId) : null);
