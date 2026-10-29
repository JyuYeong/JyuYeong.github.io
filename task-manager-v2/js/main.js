// 시작과 사용자 동작 처리
import * as S from './store.js';
import * as Sync from './sync.js';
import * as Vault from './vault.js';
import { initVaultUi } from './vaultui.js';
import { st, DEFAULT_Q, DEFAULT_TIME, STATUS_LABEL, loadPrefs, savePrefs, persist, persistLogs, liveTasks, taskById, selTask, onSaved } from './state.js';
import { $, esc, ic, stIcon, wide, toast, dlg, openDlg, dlgIs, setDlgBody, openMenu, armed, copyText, download } from './util.js';
import { renderList, renderSide, renderPanel, renderTicker, renderAll, touch, refreshPanelValues, growArea, fitMemos, visibleTasks, tsFootHtml } from './render.js';
import { openComposer, composer, refreshLinked, refreshSuggest, refreshDateNote, refreshCount, mdFormat, togglePreview, scrollToLog } from './logs.js';
import { dashOpen } from './views.js';
import { labelsHtml, refreshLabelsDlg, openLabels, openTopicsOf, newLabelDialog, newTopicDialog, filterHtml, settingsHtml, tickerHtml, TK_STATE } from './dialogs.js';

const doc = () => st.doc;
const now = () => new Date().toISOString();

const SYNC_LABEL = {
  'needs-auth': ['로그인 필요', 'warn'], syncing: ['동기화 중…', ''], offline: ['오프라인 (대기 중)', ''], error: ['동기화 오류', 'warn'],
};
function renderSyncLabel() {
  const el = $('#syncLabel');
  const stt = Sync.getState();
  let [text, cls] = SYNC_LABEL[stt.status] || [];
  if (stt.status === 'ok') { text = `동기화됨 ${stt.lastSync ? stt.lastSync.slice(-5) : ''}`; cls = 'ok'; }
  if (!text) { text = S.storageOk ? '이 기기에 저장됨' : '저장 불가 (임시)'; cls = S.storageOk ? '' : 'warn'; }
  el.textContent = text;
  el.className = 'sync ' + cls;
  el.title = stt.detail || '';
  if (dlgIs('settings') && !dlg.contains(document.activeElement?.closest('input') || null)) setDlgBody(settingsHtml());
  if (st.ui.page.kind === 'vault' && !Vault.V.unlocked && !$('#page')?.contains(document.activeElement)) renderList();
}
onSaved(() => { renderSyncLabel(); Sync.schedule(); });

// 다른 기기의 변경이 병합되어 들어왔을 때: 저장하고 다시 그린다 (입력 중인 칸은 건드리지 않음)
async function applyMerged({ core, logs }) {
  if (core) { st.doc = core; await S.save(st.doc); }
  if (logs) { st.logs = logs; S.indexLogs(st.logs); await S.saveLogs(st.logs); }
  if (!['all', 'none'].includes(st.ui.filter) && !S.labelById(st.doc, st.ui.filter)) st.ui.filter = 'all';
  renderSide(); renderList(); renderTicker();
  const typing = document.activeElement && $('#panel').contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
  if (!typing || (st.ui.selectedId && !selTask())) renderPanel();
  const dlgTyping = dlg.contains(document.activeElement?.closest('input, textarea') || null);
  if (!dlgTyping) {
    if (dlgIs('filter')) setDlgBody(filterHtml());
    if (dlgIs('labels')) refreshLabelsDlg();
    if (dlgIs('ticker')) refreshTickerDlg();
  }
}

function goPage(p) {
  st.ui.page = p;
  setRail(false);
  renderList(); renderSide();
  $(p.kind === 'list' ? '#list' : '#page').scrollTop = 0;
}
function setRail(v) { st.ui.railOpen = v; $('.app').classList.toggle('rail-open', v); renderSide(); }
function closePanel() { st.ui.selectedId = null; renderPanel(); renderList(); }
function refreshFilter() { savePrefs(); renderList(); renderSide(); if (dlgIs('filter')) setDlgBody(filterHtml()); }
const tog = (arr, v) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
const refreshTickerDlg = focusSel => { if (dlgIs('ticker')) setDlgBody(tickerHtml(), focusSel); };
const tickerById = id => doc().ticker.find(k => k.id === id && !k.deleted_at);
function updateTickerRow(k) {
  const row = dlg.querySelector(`[data-row="${k.id}"]`);
  if (!row) return;
  const [lbl, cls] = TK_STATE[S.tickerState(k)];
  const s = row.querySelector('.tkst');
  s.textContent = lbl; s.className = `tkst ${cls}`;
  row.classList.toggle('off', !k.enabled);
  row.querySelector('[data-act="tk-toggle"]').setAttribute('aria-checked', String(k.enabled));
}

// ---------- Task 변경 ----------
function setStatus(t, v) {
  t.status = v;
  t.completed_at = v === 'done' ? now() : null;
  touch(t);
  if (st.ui.selectedId === t.id) renderPanel();
}
// 이력이 있는 날은 점을 지울 수 없고, 누르면 해당 이력으로 이동한다
function openLogsAt(t, date) {
  st.ui.selectedId = t.id; renderPanel(); renderList();
  requestAnimationFrame(() => scrollToLog({ date }));
}
function markDay(t, date, fromPanel = false) {
  if (!t || date > S.todayKST()) return;
  if (S.hasLogOn(t, date)) { openLogsAt(t, date); return; }
  const on = S.toggleMarked(t, date);
  let msg = '';
  if (on && t.status === 'todo') { t.status = 'in_progress'; t.completed_at = null; msg = '상태를 “진행 중”으로 바꿨습니다'; }
  touch(t);
  if (st.ui.selectedId === t.id) renderPanel(fromPanel ? `[data-act="dc-day"][data-d="${date}"]` : undefined);
  if (msg) toast(msg);
}

// ---------- 고르는 메뉴 (라벨·주제는 여러 개) ----------
function labelPicker(anchor, t) {
  let armedId = null;
  openMenu(anchor, () => {
    const items = S.liveLabels(doc()).filter(l => !l.archived || t.label_ids.includes(l.id)).map(l => {
      const on = t.label_ids.includes(l.id);
      const lost = on ? S.topicsLostByRemoving(doc(), t, l.id) : [];
      const isArmed = armedId === l.id;
      return {
        label: l.name, check: on, icon: `<span class="dot" style="background:${esc(l.color)}"></span>`, armed: isArmed,
        note: isArmed ? `주제 ${lost.length}개도 함께 해제됩니다 · 다시 누르면 해제` : '',
        onPick: () => {
          if (on && lost.length && armedId !== l.id) { armedId = l.id; return 'keep'; }
          armedId = null;
          S.toggleTaskLabel(doc(), t, l.id);
          if (!on && st.ui.filter === 'none') { /* 미분류 보기에서 라벨을 붙이면 목록에서 빠진다 */ }
          touch(t); refreshPanelValues(t);
          if (!on || !lost.length) return 'keep';
          toast(`라벨과 주제 ${lost.length}개를 해제했습니다`);
          return 'keep';
        },
      };
    });
    if (!items.length) items.push({ label: '아직 라벨이 없습니다', disabled: true });
    items.push({ label: '새 라벨', icon: ic('plus'), add: true, onPick: () => newLabelDialog(t.id) });
    return items;
  });
}
function topicPicker(anchor, t) {
  openMenu(anchor, () => {
    const items = [];
    const ls = S.taskLabels(doc(), t);
    for (const l of ls) {
      const gs = S.topicsOfLabel(doc(), l.id, { archived: true }).filter(g => !g.archived || t.topic_ids.includes(g.id));
      items.push({ head: true, label: l.name, icon: `<span class="dot" style="background:${esc(l.color)}"></span>` });
      gs.forEach(g => items.push({
        label: g.name, sub: g.memo || '', check: t.topic_ids.includes(g.id), icon: ic('tag'),
        onPick: () => { S.toggleTaskTopic(t, g.id); touch(t); refreshPanelValues(t); return 'keep'; },
      }));
      if (!gs.length) items.push({ label: '주제 없음', disabled: true });
    }
    items.push({ label: '새 주제', icon: ic('plus'), add: true, onPick: () => newTopicDialog(t.id, t.label_ids, ls[0]?.id) });
    return items;
  });
}
function blockerPicker(anchor, t) {
  const shared = c => c.label_ids.some(id => t.label_ids.includes(id));
  const cands = liveTasks()
    .filter(c => c.id !== t.id && (!S.isFin(c) || c.id === t.blocked_by) && !S.wouldCycle(doc(), t.id, c.id))
    .sort((a, b) => (shared(a) === shared(b) ? S.compareDefault(a, b) : shared(a) ? -1 : 1));
  const set = id => { t.blocked_by = id; touch(t); renderPanel(); };
  const items = [{ label: '없음', cur: !t.blocked_by, onPick: () => set(null) }];
  cands.forEach(c => items.push({ label: c.title, sub: c.id, icon: stIcon(S.displayStatus(c)), cur: t.blocked_by === c.id, onPick: () => set(c.id) }));
  if (!cands.length) items.push({ label: '고를 수 있는 Task가 없습니다', disabled: true });
  openMenu(anchor, items);
}

// ---------- 클릭 ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  const t = id ? taskById(id) : null;
  const cur = selTask();

  switch (act) {
    case 'filter': st.ui.filter = el.dataset.v; st.ui.page = { kind: 'list', id: null }; setRail(false); renderList(); renderSide(); $('#list').scrollTop = 0; break;

    // 페이지: 대시보드 · 라벨 보기 · 주제 보기
    case 'page-dash': goPage({ kind: 'dash', id: null }); break;
    case 'label-view': e.stopPropagation(); goPage({ kind: 'label', id }); break;
    case 'topic-view': e.stopPropagation(); goPage({ kind: 'topic', id }); break;
    case 'dash-toggle': dashOpen.has(id) ? dashOpen.delete(id) : dashOpen.add(id); renderList(); $(`#page [data-act="dash-toggle"][data-id="${id}"]`)?.focus(); break;
    case 'go-list': {
      const [kind, sid] = el.dataset.scope.split(':');
      const k = el.dataset.st;
      st.q = { ...DEFAULT_Q, statuses: k === 'all' ? [] : [k], hideDone: k === 'all' ? false : true };
      st.ui.filter = 'all';
      if (kind === 'label') st.ui.filter = sid;
      if (kind === 'topic') { const g = S.topicById(doc(), sid); if (g) { st.ui.filter = g.label_id; st.q.topics = [g.id]; } }
      savePrefs();
      goPage({ kind: 'list', id: null });
      break;
    }
    case 'rail-toggle': setRail(!st.ui.railOpen); break;
    case 'open': st.ui.selectedId = id; renderPanel(); renderList(); break;
    case 'close-panel': closePanel(); break;
    case 'copy-id': e.stopPropagation(); toast((await copyText(id)) ? `${id} 복사됨` : `복사 실패: ${id}`); break;

    // 상태·속성
    case 'menu-status': if (t) openMenu(el, ['todo', 'in_progress', 'done', 'canceled'].map(v => ({ label: STATUS_LABEL[v], icon: stIcon(v), cur: t.status === v, onPick: () => setStatus(t, v) }))); break;
    case 'set-status': if (cur) setStatus(cur, el.dataset.v); break;
    case 'set-urgency': if (cur) { cur.urgency = el.dataset.v; touch(cur); renderPanel(); } break;
    case 'menu-labels': if (cur) labelPicker(el, cur); break;
    case 'menu-topics': if (cur) topicPicker(el, cur); break;
    case 'menu-blocker': if (cur) blockerPicker(el, cur); break;
    case 'clear-blocker': if (cur) { cur.blocked_by = null; touch(cur); renderPanel(); } break;
    case 'clear-start_date': case 'clear-due_date': {
      if (!cur) break;
      const f = act.slice(6);
      cur[f] = null;
      if (f === 'due_date') cur.due_time = null;
      touch(cur); renderPanel();
      break;
    }
    case 'toggle-allday': if (cur && cur.due_date) { cur.due_time = cur.due_time ? null : DEFAULT_TIME; touch(cur); renderPanel(); } break;
    case 'toggle-props': st.ui.propsOpen = !st.ui.propsOpen; savePrefs(); renderPanel('[data-act="toggle-props"]'); break;
    case 'toggle-cal': st.ui.calOpen = !st.ui.calOpen; savePrefs(); renderPanel('[data-act="toggle-cal"]'); break;
    case 'toggle-daycheck': if (cur) { cur.day_check = !cur.day_check; if (cur.day_check) st.ui.calOpen = true; touch(cur); renderPanel('[data-act="toggle-daycheck"]'); } break;
    case 'dc-today': if (t) markDay(t, S.todayKST()); break;
    case 'dc-day': markDay(cur, el.dataset.d, true); break;
    case 'toggle-active': st.ui.activeOpen = !st.ui.activeOpen; savePrefs(); renderList(); $('#list [data-act="toggle-active"]')?.focus(); break;
    case 'delete': {
      if (!t) break;
      t.deleted_at = now(); t.updated_at = t.deleted_at;
      persist();
      if (st.ui.selectedId === id) st.ui.selectedId = null;
      renderAll();
      toast('삭제했습니다', { act: 'undo', id, label: '실행 취소' });
      break;
    }
    case 'undo': {
      const d = doc().tasks.find(x => x.id === id);
      if (d) { d.deleted_at = null; d.updated_at = now(); persist(); renderAll(); }
      $('#toast').hidden = true;
      break;
    }

    // 라벨·주제 관리
    case 'labels': if (st.ui.railOpen) setRail(false); openLabels(); break;
    case 'label-topics': openTopicsOf.has(id) ? openTopicsOf.delete(id) : openTopicsOf.add(id); refreshLabelsDlg(`[data-act="label-topics"][data-id="${id}"]`); break;
    case 'label-color': {
      const l = S.labelById(doc(), id);
      if (!l) break;
      l.color = S.PALETTE[(S.PALETTE.indexOf(l.color) + 1) % S.PALETTE.length]; l.updated_at = now();
      persist(); renderAll(); refreshLabelsDlg(`[data-act="label-color"][data-id="${id}"]`);
      break;
    }
    case 'label-up': case 'label-down': {
      if (!S.moveLabel(doc(), id, act === 'label-up' ? -1 : 1)) break;
      persist(); renderAll();
      refreshLabelsDlg();
      const same = dlg.querySelector(`[data-act="${act}"][data-id="${id}"]`);
      (same && !same.disabled ? same : dlg.querySelector(`[data-id="${id}"][data-act^="label-"]:not([disabled])`))?.focus();
      break;
    }
    case 'label-archive': {
      const l = S.labelById(doc(), id);
      if (!l) break;
      l.archived = !l.archived; l.updated_at = now();
      if (l.archived && st.ui.filter === l.id) st.ui.filter = 'all';
      persist(); renderAll(); refreshLabelsDlg();
      break;
    }
    case 'label-del': {
      const l = S.labelById(doc(), id);
      if (!l) break;
      const u = S.labelUsage(doc(), id);
      if (!armed(el, `한 번 더 누르면 삭제 (주제 ${u.topics.length}개 삭제, Task ${u.tasks.length}건에서 해제)`)) { toast(`“${l.name}” 삭제: 주제 ${u.topics.length}개 함께 삭제, Task ${u.tasks.length}건에서 해제 — 한 번 더 누르세요`); break; }
      const r = S.deleteLabel(doc(), l);
      if (st.ui.filter === id) st.ui.filter = 'all';
      st.q.labels = st.q.labels.filter(x => x !== id); savePrefs();
      persist(); renderAll(); refreshLabelsDlg();
      toast(`라벨 “${l.name}” 삭제 (주제 ${r.topics}개, Task ${r.tasks}건에서 해제)`);
      break;
    }
    case 'topic-archive': {
      const g = S.topicById(doc(), id);
      if (!g) break;
      g.archived = !g.archived; g.updated_at = now();
      persist(); renderAll(); refreshLabelsDlg();
      break;
    }
    case 'topic-del': {
      const g = S.topicById(doc(), id);
      if (!g) break;
      if (!armed(el, '한 번 더 누르면 삭제')) { toast('한 번 더 누르면 주제를 삭제합니다'); break; }
      const n = S.deleteTopic(doc(), g);
      st.q.topics = st.q.topics.filter(x => x !== id); savePrefs();
      persist(); renderAll(); refreshLabelsDlg();
      toast(`주제 “${g.name}” 삭제${n ? ` (Task ${n}건에서 해제)` : ''}`);
      break;
    }

    // 필터·뷰
    case 'filter-sheet': openDlg('filter', '필터·정렬', filterHtml()); break;
    case 'q-status': st.q.statuses = tog(st.q.statuses, el.dataset.v); refreshFilter(); break;
    case 'q-urg': st.q.urgencies = tog(st.q.urgencies, el.dataset.v); refreshFilter(); break;
    case 'q-label': st.q.labels = tog(st.q.labels, el.dataset.v); refreshFilter(); break;
    case 'set-qlmode': st.q.labelMode = el.dataset.v; refreshFilter(); break;
    case 'q-topic': st.q.topics = tog(st.q.topics, el.dataset.v); refreshFilter(); break;
    case 'q-due': st.q.due = el.dataset.v; refreshFilter(); break;
    case 'q-sort': st.q.sort = el.dataset.v; refreshFilter(); break;
    case 'q-dir': st.q.dir = el.dataset.v; refreshFilter(); break;
    case 'q-group': st.q.group = el.dataset.v; refreshFilter(); break;
    case 'q-hide': st.q.hideDone = !st.q.hideDone; refreshFilter(); break;
    case 'q-reset': st.q = { ...DEFAULT_Q }; st.ui.filter = 'all'; refreshFilter(); break;
    case 'toggle-views': st.ui.viewsOpen = !st.ui.viewsOpen; savePrefs(); renderSide(); break;
    case 'apply-view': {
      setRail(false);
      const v = doc().views.find(x => x.id === id && !x.deleted_at);
      if (!v) break;
      st.q = { ...DEFAULT_Q, ...v.q };
      st.ui.filter = v.filter === 'all' || v.filter === 'none' || S.labelById(doc(), v.filter) ? v.filter : 'all';
      savePrefs(); renderSide(); renderList();
      if (dlgIs('filter')) dlg.close();
      break;
    }
    case 'del-view': {
      const v = doc().views.find(x => x.id === id);
      if (v) { v.deleted_at = now(); v.updated_at = v.deleted_at; persist(); refreshFilter(); renderSide(); }
      break;
    }

    // 티커
    case 'ticker': if (st.ui.railOpen) setRail(false); openDlg('ticker', '티커', tickerHtml()); break;
    case 'set-tkcolor': case 'set-tkpos': {
      const v = el.dataset.v;
      S.setTickerSettings(doc(), act === 'set-tkcolor' ? { color: v } : { position: v });
      persist(); renderTicker();
      refreshTickerDlg(`[data-act="${act}"][data-v="${v}"]`);
      break;
    }
    case 'tk-toggle': { const k = tickerById(id); if (k) { k.enabled = !k.enabled; k.updated_at = now(); persist(); renderTicker(); updateTickerRow(k); } break; }
    case 'tk-level': {
      const k = tickerById(id);
      if (!k || S.tickerLevel(k) === el.dataset.v) break;
      k.level = el.dataset.v; k.updated_at = now();
      persist(); renderTicker();
      el.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === el)));
      break;
    }
    case 'tk-del': {
      const k = tickerById(id);
      if (!k || !armed(el, '한 번 더 누르면 삭제')) break;
      k.deleted_at = now(); k.updated_at = k.deleted_at;
      persist(); renderTicker(); refreshTickerDlg('#tkForm input');
      break;
    }

    // 설정
    case 'settings': {
      if (st.ui.railOpen) setRail(false);
      openDlg('settings', '설정', settingsHtml());
      if (settingsHtml.persisted === undefined && navigator.storage?.persisted) {
        navigator.storage.persisted().then(v => { settingsHtml.persisted = v; if (dlgIs('settings')) setDlgBody(settingsHtml()); });
      }
      break;
    }
    case 'toggle-showactive': st.ui.showActive = !st.ui.showActive; savePrefs(); renderList(); setDlgBody(settingsHtml(), '[data-act="toggle-showactive"]'); break;
    case 'export-json': download(`tm2-backup-${S.todayKST().replaceAll('-', '')}.json`, JSON.stringify({ core: doc(), logs: st.logs }, null, 2)); break;
    case 'wipe': if (armed(el, '정말 삭제합니다 — 한 번 더 누르세요')) { Sync.resetSeen(); await S.clearAll(); location.reload(); } break;
    case 'close-dlg': dlg.close(); break;

    // 작업 이력
    case 'log-new': if (cur) openComposer(cur.id); break;
    case 'log-menu': { const l = S.logById(st.logs, id); if (l && cur) logMenu(el, l); break; }
    case 'log-undo': {
      const [lid, tid] = id.split('|');
      const l = st.logs.logs.find(x => x.id === lid);
      if (!l) break;
      if (tid) { if (!l.task_ids.includes(tid)) l.task_ids.push(tid); }
      l.deleted_at = null; l.updated_at = now();
      S.indexLogs(st.logs); persistLogs(); renderList(); renderPanel();
      $('#toast').hidden = true;
      break;
    }
    case 'lg-link': if (!composer.taskIds.includes(id)) composer.taskIds.push(id); composer.query = ''; $('#lgSearch').value = ''; refreshLinked(); $('#lgSearch').focus(); break;
    case 'lg-unlink': if (composer.taskIds.length > 1) { composer.taskIds = composer.taskIds.filter(x => x !== id); refreshLinked(); } break;
    case 'md-h': case 'md-b': case 'md-li': case 'md-cb': case 'md-code': mdFormat(act.slice(3)); break;
    case 'md-preview': togglePreview(el); break;
    case 'sync-click': if (Sync.getState().signedIn) Sync.syncNow(); else openDlg('settings', '설정', settingsHtml()); break;
    case 'sign-in': Sync.signIn(); break;
    case 'sign-out': if (armed(el, '한 번 더 누르면 동기화 중지')) { Sync.signOut(); toast('동기화를 중지했습니다. 이 기기의 데이터는 그대로 남아 있습니다.'); } break;
    case 'sync-now': Sync.syncNow(); break;
  }
});

document.addEventListener('pointerdown', e => { if (st.ui.railOpen && !e.target.closest('#side')) setRail(false); });
$('#backdrop').addEventListener('click', closePanel);
$('#swHide').addEventListener('click', () => { st.q.hideDone = !st.q.hideDone; savePrefs(); renderList(); });
$('#ticker').addEventListener('click', e => e.currentTarget.classList.toggle('paused'));

// ---------- 입력 (자동 저장) ----------
document.addEventListener('input', e => {
  const f = e.target.dataset?.f;
  if (!f || !e.target.closest('#panel')) return;
  const t = selTask();
  if (!t) return;
  const v = e.target.value;
  if (f === 'title' || f === 'memo') {
    const one = v.replace(/[\r\n]+/g, ' ');
    if (one !== v) e.target.value = one;
    if (f === 'title') { if (one.trim()) { t.title = one.trim(); touch(t); } }
    else { t.memo = one; touch(t); }
    growArea(e.target);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.id === 'lgBody') { e.preventDefault(); $('#logForm')?.requestSubmit(); return; }
  if (e.key === 'Enter' && e.target.id === 'lgSearch') { e.preventDefault(); $('#lgSug .sug')?.click(); return; }
  if (e.key === 'Enter' && e.target.matches?.('#f-title, #f-memo')) { e.preventDefault(); e.target.blur(); }
});
document.addEventListener('change', e => {
  const f = e.target.dataset?.f;
  if (!f || !e.target.closest('#panel')) return;
  const t = selTask();
  if (!t) return;
  const v = e.target.value;
  if (f === 'title' && !v.trim()) { e.target.value = t.title; return; }
  if (f === 'start_date' || f === 'due_date') {
    t[f] = v || null;
    if (f === 'due_date' && !v) t.due_time = null;
    touch(t); renderPanel();
  } else if (f === 'due_time') { t.due_time = v || null; touch(t); renderPanel(); }
});

// ---------- 다이얼로그 입력 ----------
dlg.addEventListener('change', e => {
  const d = e.target.dataset || {};
  if (d.lid) { // 라벨 이름·메모
    const l = S.labelById(doc(), d.lid);
    if (!l) return;
    if (d.lf === 'name') {
      const name = e.target.value.trim().slice(0, 40);
      const dup = name && S.liveLabels(doc()).some(x => x.id !== l.id && x.name.toLowerCase() === name.toLowerCase());
      if (!name || dup) { e.target.value = l.name; if (dup) toast('같은 이름의 라벨이 있습니다'); return; }
      l.name = name;
    } else l.memo = e.target.value.trim().slice(0, 200);
    l.updated_at = now(); persist(); renderAll();
  } else if (d.gid) { // 주제 이름·메모
    const g = S.topicById(doc(), d.gid);
    if (!g) return;
    if (d.gf === 'name') {
      const name = e.target.value.trim().slice(0, 60);
      const dup = name && S.topicsOfLabel(doc(), g.label_id, { archived: true }).some(x => x.id !== g.id && x.name.toLowerCase() === name.toLowerCase());
      if (!name || dup) { e.target.value = g.name; if (dup) toast('같은 라벨에 같은 이름의 주제가 있습니다'); return; }
      g.name = name;
    } else g.memo = e.target.value.trim().slice(0, 200);
    g.updated_at = now(); persist(); renderList(); renderPanel();
  } else if (d.kid) { // 티커 문장
    const k = tickerById(d.kid);
    if (!k) return;
    const v = e.target.value;
    if (d.kf === 'text') { const s = v.trim().slice(0, 120); if (!s) { e.target.value = k.text; return; } k.text = s; }
    else if (['expire_date', 'daily_from', 'daily_to'].includes(d.kf)) k[d.kf] = v || null;
    else return;
    k.updated_at = now(); persist(); renderTicker(); updateTickerRow(k);
  }
});
dlg.addEventListener('input', e => {
  if (e.target.id === 'lgSearch') { composer.query = e.target.value; refreshSuggest(); return; }
  if (e.target.id === 'lgBody') { refreshCount(); return; }
  if (e.target.id === 'lgDate') { refreshDateNote(); return; }
  if (e.target.id !== 'q-text') return;
  st.q.text = e.target.value.trim(); savePrefs(); renderList();
  const b = dlg.querySelector('[data-act=close-dlg].primary');
  if (b) b.textContent = `${visibleTasks().length}건 보기`;
});
function saveLog(f) {
  const fd = new FormData(f);
  const body = String(fd.get('body') || '').replace(/\s+$/, '');
  const date = String(fd.get('work_date') || '');
  if (!body.trim()) { toast('내용을 입력하세요'); $('#lgBody')?.focus(); return; }
  if (!date || date > S.todayKST()) { toast('작업일은 오늘 이전이어야 합니다'); return; }
  const ids = composer.taskIds.filter(id => taskById(id));
  if (!ids.length) { toast('연결할 Task가 없습니다'); return; }
  let l = composer.editId ? S.logById(st.logs, composer.editId) : null;
  if (l) S.updateLog(st.logs, l, { body, work_date: date, task_ids: ids });
  else l = S.createLog(st.logs, { task_ids: ids, work_date: date, body });
  // 대기 중인 Task에 처음 이력을 남기면 진행 중으로
  const moved = ids.map(taskById).filter(t => t.status === 'todo');
  moved.forEach(t => { t.status = 'in_progress'; t.completed_at = null; t.updated_at = now(); });
  if (moved.length) persist();
  persistLogs();
  dlg.close();
  renderList(); renderPanel();
  requestAnimationFrame(() => scrollToLog({ id: l.id }));
  toast(moved.length ? `저장했습니다 · ${moved.length > 1 ? `Task ${moved.length}건을` : '상태를'} “진행 중”으로 바꿨습니다` : (ids.length > 1 ? `Task ${ids.length}건에 저장했습니다` : '저장했습니다'));
}
function logMenu(anchor, l) {
  const t = selTask();
  let armedDel = false;
  openMenu(anchor, () => [
    { label: '수정', onPick: () => openComposer(t.id, l.id) },
    ...(l.task_ids.length > 1 ? [{ label: '이 Task에서만 빼기', note: `다른 Task ${l.task_ids.length - 1}건에는 남습니다`, onPick: () => { S.detachLog(st.logs, l, t.id); persistLogs(); renderList(); renderPanel(); toast('이 Task에서 뺐습니다', { act: 'log-undo', id: l.id + '|' + t.id, label: '실행 취소' }); } }] : []),
    { label: armedDel ? '한 번 더 누르면 삭제' : '이력 삭제', armed: armedDel, note: l.task_ids.length > 1 && armedDel ? `연결된 Task ${l.task_ids.length}건 모두에서 사라집니다` : '', onPick: () => {
      if (!armedDel) { armedDel = true; return 'keep'; }
      S.deleteLog(st.logs, l); persistLogs(); renderList(); renderPanel();
      toast('이력을 삭제했습니다', { act: 'log-undo', id: l.id, label: '실행 취소' });
    } },
  ]);
}

dlg.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'logForm') { saveLog(f); return; }
  const fd = new FormData(f);
  if (f.id === 'tkForm') {
    if (S.createTicker(doc(), fd.get('text'))) { persist(); renderTicker(); refreshTickerDlg('#tkForm input'); }
  } else if (f.id === 'viewForm') {
    const v = S.saveView(doc(), fd.get('name'), st.ui.filter, st.q);
    if (v) { persist(); refreshFilter(); renderSide(); toast(`뷰 “${v.name}” 저장됨`); }
  } else if (f.id === 'newLabelMgr' || f.id === 'newLabelForm') {
    const r = S.addLabel(doc(), fd.get('name'));
    if (r.error) { toast(r.error); return; }
    if (r.existed) toast(`같은 이름의 라벨 “${r.label.name}”가 있어 그것을 사용합니다`);
    const forTask = f.dataset.task && taskById(f.dataset.task);
    if (forTask && !forTask.label_ids.includes(r.label.id)) { forTask.label_ids.push(r.label.id); forTask.updated_at = now(); }
    persist(); renderAll();
    if (f.id === 'newLabelMgr') refreshLabelsDlg('#newLabelMgr input'); else dlg.close();
  } else if (f.dataset.newtopic || f.id === 'newTopicForm') {
    const lid = f.dataset.newtopic || String(fd.get('label'));
    const r = S.addTopic(doc(), lid, fd.get('name'), fd.get('memo') || '');
    if (r.error) { toast(r.error); return; }
    if (r.existed) toast(`같은 이름의 주제 “${r.topic.name}”가 있어 그것을 사용합니다`);
    const forTask = f.dataset.task && taskById(f.dataset.task);
    if (forTask && forTask.label_ids.includes(lid) && !forTask.topic_ids.includes(r.topic.id)) { forTask.topic_ids.push(r.topic.id); forTask.updated_at = now(); }
    persist(); renderAll();
    if (f.dataset.newtopic) refreshLabelsDlg(`[data-newtopic="${lid}"] input`); else dlg.close();
  }
});

// ---------- 빠른 추가 ----------
$('#quick').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#quickInput');
  const title = input.value.trim();
  if (!title) return;
  // 지금 보고 있는 라벨·주제를 붙여서 만든다
  const p = st.ui.page, f = st.ui.filter;
  let fields = { label_ids: f !== 'all' && f !== 'none' ? [f] : [] };
  if (p.kind === 'label') fields = { label_ids: p.id !== 'none' && S.labelById(doc(), p.id) ? [p.id] : [] };
  if (p.kind === 'topic') { const g = S.topicById(doc(), p.id); fields = g ? { label_ids: [g.label_id], topic_ids: [g.id] } : {}; }
  if (p.kind === 'dash') fields = {};
  const t = S.createTask(doc(), { title, ...fields });
  input.value = '';
  persist(); renderSide(); renderList();
  if (p.kind === 'list') $('#list').scrollTop = 0;
  else toast(`“${t.title}” 추가됨`, { act: 'open', id: t.id, label: '열기' });
});

let tkResize, memoW = 0;
addEventListener('resize', () => {
  const sz = $('#scrSize');
  if (sz) sz.textContent = `${innerWidth} × ${innerHeight}`;
  document.body.classList.toggle('sheet-open', !!st.ui.selectedId && !wide());
  clearTimeout(tkResize);
  tkResize = setTimeout(() => renderTicker(), 200);
});
new ResizeObserver(es => {
  const w = Math.round(es[0].contentRect.width);
  if (w === memoW) return;
  memoW = w;
  clearTimeout(fitMemos.tm); fitMemos.tm = setTimeout(fitMemos, 120);
}).observe($('#list'));

// ---------- 시작 ----------
(async function init() {
  st.doc = await S.load();
  st.logs = await S.loadLogs();
  await Vault.loadVault();
  initVaultUi({ render: () => { renderList(); renderSide(); }, syncInfo: () => ({ ...Sync.getState(), resolveConflict: Sync.resolveVaultConflict }) });
  Vault.onVaultChange(what => {
    if (what === 'saved' || what === 'meta') Sync.schedule(1500);
    if (what === 'unlock') Sync.schedule(300); // 잠긴 동안 미뤄 둔 병합을 바로 처리
    if (what !== 'saved' && ['vault', 'label'].includes(st.ui.page.kind)) { renderList(); renderSide(); }
  });
  loadPrefs();
  renderAll();
  Sync.init({ getCore: () => st.doc, getLogs: () => st.logs, apply: applyMerged, onStatus: renderSyncLabel });
  renderSyncLabel();
  navigator.storage?.persist?.().then(v => { settingsHtml.persisted = v; }).catch(() => {});
  setInterval(() => { renderList(); renderSide(); renderTicker(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { renderTicker(); renderList(); } });
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && st.doc) { persist(true); persistLogs(true); } });
addEventListener('pagehide', () => { if (st.doc) { persist(true); persistLogs(true); } });
