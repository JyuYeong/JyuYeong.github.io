// 보안 영역 화면 (V5): 잠금 화면, 업무 정보 트리, 보안메모, 영역 안 검색, 자동 잠금
import * as S from './store.js';
import { st } from './state.js';
import { $, esc, ic, toast, dlg, openDlg, dlgIs, openMenu, armed, copyText } from './util.js';
import * as Vault from './vault.js';
import { V } from './vault.js';
import { PW_MIN, pwError, isPin } from './vcrypto.js';

const IDLE_MS = 5 * 60 * 1000;
export const vu = { tab: 'work', open: new Set(), revealed: new Set(), q: '', hl: null, gate: null, msg: '', busy: false, recovery: null, syncInfo: () => ({}) };
let rerender = () => {};
export function initVaultUi({ render, syncInfo }) { rerender = render; vu.syncInfo = syncInfo; }
const labelsAll = () => S.liveLabels(st.doc);
const labelById = id => S.labelById(st.doc, id);
const dot = l => `<span class="dot" style="background:${l ? esc(l.color) : 'var(--dot)'}"></span>`;
const isVaultPage = () => st.ui.page.kind === 'vault';

// ---------- 잠금 화면 ----------
const pwIn = (id, label, ac = 'current-password') => `<label class="fl" for="${id}">${label}</label><input class="in" id="${id}" type="password" autocomplete="${ac}" minlength="${PW_MIN}" maxlength="200" required>`;
const pinIn = (id, label) => `<label class="fl" for="${id}">${label}</label><input class="in pin" id="${id}" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" required>`;
const msgHtml = () => (vu.msg ? `<p class="gmsg" role="alert">${esc(vu.msg)}</p>` : '');
function gateHtml() {
  const sync = vu.syncInfo();
  if (vu.recovery) {
    return `<form class="gate" id="vRecoveryShown" autocomplete="off"><h3>${ic('lock')}복구 키를 보관하세요</h3>
      <p>마스터 비밀번호를 잊었을 때 이 키로만 열 수 있습니다. 지금 한 번만 보여 줍니다. 종이나 다른 안전한 곳에 적어 두세요.</p>
      <div class="rkey" id="rkey">${esc(vu.recovery)}</div>
      <button type="button" class="btn sm" data-act="v-copy-recovery">${ic('copy')}복사</button>
      <label class="ck"><input type="checkbox" id="vRkOk" required> 복구 키를 안전한 곳에 적어 두었습니다</label>
      <button class="btn primary" type="submit">계속</button></form>`;
  }
  if (V.conflict) {
    return `<div class="gate"><h3>${ic('lock')}Drive에 다른 금고가 있습니다</h3>
      <p>Drive의 보안 영역은 다른 기기에서 따로 만든 금고라 이 기기의 금고와 합칠 수 없습니다. 보안 영역 동기화를 멈췄습니다.</p>
      <p>Drive 금고로 바꾸면 이 기기의 보안 영역 데이터는 지워지고, Drive 금고의 마스터 비밀번호로 이 기기를 다시 등록합니다.</p>
      <button type="button" class="btn danger" data-act="v-use-remote">Drive 금고로 바꾸기</button></div>`;
  }
  if (!V.meta) {
    if (sync.signedIn && sync.status !== 'ok' && sync.status !== 'error') return `<div class="gate"><h3>${ic('lock')}Drive 확인 중…</h3><p>다른 기기에서 만든 보안 영역이 있는지 확인하고 있습니다.</p></div>`;
    return `<form class="gate" id="vCreate" autocomplete="off"><h3>${ic('lock')}보안 영역 만들기</h3>
      <p>업무 정보(접속 정보 등)와 보안메모를 암호화해 보관합니다. ${sync.signedIn ? '' : '<b>다른 기기에서 이미 만들었다면, 먼저 설정에서 Drive 동기화를 켜세요.</b>'}</p>
      ${pwIn('vPw1', `마스터 비밀번호 (${PW_MIN}자 이상)`, 'new-password')}${pwIn('vPw2', '마스터 비밀번호 확인', 'new-password')}
      <p class="hint">새 기기를 등록하거나 PIN을 ${Vault.MAX_PIN_FAILS}번 틀렸을 때만 입력합니다. 잊으면 복구 키로만 열 수 있습니다.</p>
      ${pinIn('vPin1', '이 기기 PIN (숫자 4자리)')}${pinIn('vPin2', 'PIN 확인')}
      ${msgHtml()}<button class="btn primary" type="submit"${vu.busy ? ' disabled' : ''}>${vu.busy ? '만드는 중…' : '만들기'}</button></form>`;
  }
  if (vu.gate === 'recover') {
    return `<form class="gate" id="vRecover" autocomplete="off"><h3>${ic('lock')}복구 키로 열기</h3>
      <label class="fl" for="vRk">복구 키</label><input class="in mono" id="vRk" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" required>
      ${pwIn('vPw1', `새 마스터 비밀번호 (${PW_MIN}자 이상)`, 'new-password')}${pwIn('vPw2', '새 마스터 비밀번호 확인', 'new-password')}
      ${pinIn('vPin1', '이 기기 PIN (숫자 4자리)')}${pinIn('vPin2', 'PIN 확인')}
      ${msgHtml()}<button class="btn primary" type="submit"${vu.busy ? ' disabled' : ''}>${vu.busy ? '여는 중…' : '열기'}</button>
      <button type="button" class="lnk" data-act="v-gate" data-v="">돌아가기</button></form>`;
  }
  if (!V.device || vu.gate === 'register') {
    return `<form class="gate" id="vRegister" autocomplete="off"><h3>${ic('lock')}${V.device ? '마스터 비밀번호로 열기' : '이 기기 등록'}</h3>
      <p>${V.device ? '마스터 비밀번호로 열고 이 기기 PIN을 다시 정합니다.' : '이 기기에서 처음 여는 보안 영역입니다. 마스터 비밀번호로 열고 이 기기에서 쓸 PIN을 정하세요.'}</p>
      ${pwIn('vPw', '마스터 비밀번호')}${pinIn('vPin1', '이 기기 PIN (숫자 4자리)')}${pinIn('vPin2', 'PIN 확인')}
      ${msgHtml()}<button class="btn primary" type="submit"${vu.busy ? ' disabled' : ''}>${vu.busy ? '여는 중…' : '열기'}</button>
      <div class="glinks">${V.device ? '<button type="button" class="lnk" data-act="v-gate" data-v="">PIN으로 열기</button>' : ''}<button type="button" class="lnk" data-act="v-gate" data-v="recover">비밀번호를 잊었나요? 복구 키로 열기</button></div></form>`;
  }
  return `<form class="gate" id="vPinForm" autocomplete="off"><h3>${ic('lock')}보안 영역 잠김</h3>
    ${pinIn('vPin', 'PIN (숫자 4자리)')}
    ${msgHtml()}<button class="btn primary" type="submit"${vu.busy ? ' disabled' : ''}>${vu.busy ? '확인 중…' : '열기'}</button>
    <div class="glinks"><button type="button" class="lnk" data-act="v-gate" data-v="register">마스터 비밀번호로 열기</button><button type="button" class="lnk" data-act="v-gate" data-v="recover">복구 키로 열기</button></div></form>`;
}

// ---------- 업무 정보 트리 ----------
function labelChips(node) {
  const inh = Vault.inheritedLabels(node);
  const own = (node.label_ids || []).filter(id => !inh.includes(id));
  const chip = (id, cls) => { const l = labelById(id); return l ? `<span class="vlb ${cls}" title="${cls === 'inh' ? '상위 폴더에서 상속' : '이 폴더의 라벨'}">${dot(l)}${esc(l.name)}</span>` : ''; };
  return own.map(id => chip(id, 'own')).join('') + inh.map(id => chip(id, 'inh')).join('');
}
function fieldRowHtml(x, d, indent) {
  const key = x.id + ':v', shown = !x.masked || vu.revealed.has(key);
  const full = vu.revealed.has(x.id + ':full');
  const lines = (x.value || '').split('\n');
  let val;
  if (!x.value) val = '<span class="tv none">값 없음</span>';
  else if (!shown) val = `<button type="button" class="tv tm" data-act="v-reveal" data-key="${key}" aria-label="${esc(x.name)} 눌러서 보기">••••••</button>`;
  else if (lines.length > 1 && !full) val = `<button type="button" class="tv tmore" data-act="v-full" data-id="${x.id}" title="전체 보기">${esc(lines[0])}<small> …(+${lines.length - 1}줄)</small></button>`;
  else val = `<span class="tv${lines.length > 1 ? ' multi' : ''}">${esc(x.value)}</span>`;
  const hide = x.masked && shown && x.value ? `<button type="button" class="icbtn xs" data-act="v-reveal" data-key="${key}" aria-label="${esc(x.name)} 가리기">${ic('eyeOff')}</button>` : '';
  return `<div class="tr tfld${vu.hl === x.id ? ' hl' : ''}" role="treeitem" aria-level="${d + 1}" id="vn-${x.id}">${indent}<span class="tsp"></span><span class="tk" title="${esc(x.name)}">${x.masked ? ic('lock', '', 'kl') : ''}${esc(x.name)}</span><span class="tsep">:</span>${val}${hide}
    <button type="button" class="icbtn xs" data-act="v-edit-field" data-id="${x.id}" aria-label="${esc(x.name)} 편집">${ic('edit')}</button></div>`;
}
// rootId를 주면 그 폴더부터 (라벨 보기용), 아니면 최상위부터
export function treeHtml(rootId = null, { compact = false } = {}) {
  const out = [];
  const indent = d => '<span class="ind"></span>'.repeat(d);
  const folderRow = (f, d) => {
    const open = vu.open.has(f.id);
    const kids = Vault.childrenOf(f.id), n = kids.folders.length + kids.fields.length;
    out.push(`<div class="tr tf${vu.hl === f.id ? ' hl' : ''}" role="treeitem" aria-expanded="${open}" aria-level="${d + 1}" id="vn-${f.id}">${indent(d)}
      <button type="button" class="tt" data-act="v-toggle" data-id="${f.id}"${n ? '' : ' disabled'}>${ic(open ? 'chev' : 'chevR', '', 'car')}${ic('folder', '', 'tfi')}<span class="tn">${esc(f.name)}</span><span class="tc">${n || '비어 있음'}</span></button>
      <span class="vlbs">${labelChips(f)}</span>
      ${compact ? '' : `<button type="button" class="icbtn xs" data-act="v-folder-menu" data-id="${f.id}" aria-label="${esc(f.name)} 폴더 메뉴" aria-haspopup="menu">${ic('dots')}</button>`}</div>`);
    if (open) walk(f.id, d + 1);
  };
  const walk = (pid, d) => {
    const { folders, fields } = Vault.childrenOf(pid);
    folders.forEach(f => folderRow(f, d));
    fields.forEach(x => out.push(fieldRowHtml(x, d, indent(d))));
  };
  if (rootId) { const r = Vault.nodeById(rootId); if (r) folderRow(r, 0); }
  else walk(null, 0);
  return `<div class="vtree" role="tree">${out.join('')}</div>`;
}
function memoRowHtml(m, { compact = false } = {}) {
  const open = vu.revealed.has(m.id + ':memo');
  return `<div class="vmemo${vu.hl === m.id ? ' hl' : ''}" id="vn-${m.id}">
    <div class="vmh"><button type="button" class="tt" data-act="v-reveal" data-key="${m.id}:memo" aria-expanded="${open}">${ic(open ? 'chev' : 'chevR', '', 'car')}${ic('lock', '', 'tfi')}<span class="tn">${esc(m.title)}</span></button>
      <span class="vlbs">${m.label_ids.map(labelById).filter(Boolean).map(l => `<span class="vlb own">${dot(l)}${esc(l.name)}</span>`).join('')}</span>
      ${compact ? '' : `<button type="button" class="icbtn xs" data-act="v-edit-memo" data-id="${m.id}" aria-label="${esc(m.title)} 편집">${ic('edit')}</button>`}</div>
    ${open ? `<div class="vmb">${m.body ? esc(m.body) : '<span class="tv none">내용 없음</span>'}</div>` : ''}</div>`;
}
function searchHtml() {
  const r = Vault.searchVault(vu.q);
  const nodes = r.nodes.map(({ node, path }) => `<button type="button" class="vsr" data-act="v-goto" data-id="${node.id}">${ic(node.type === 'folder' ? 'folder' : 'key')}<span class="p">${path.slice(0, -1).map(p => esc(p.name)).join(' › ')}</span><b>${esc(node.name)}</b>${node.type === 'field' && !node.masked && node.value ? `<span class="v">${esc(node.value.split('\n')[0])}</span>` : ''}</button>`).join('');
  const ms = r.memos.map(m => `<button type="button" class="vsr" data-act="v-goto-memo" data-id="${m.id}">${ic('lock')}<span class="p">보안메모</span><b>${esc(m.title)}</b></button>`).join('');
  return nodes || ms ? `<div class="vsrs">${nodes}${ms}</div><p class="hint">가린 값과 보안메모 내용은 검색하지 않습니다.</p>` : '<p class="hint">맞는 항목이 없습니다. 가린 값과 보안메모 내용은 검색하지 않습니다.</p>';
}
function unlockedHtml() {
  const tabs = `<div class="seg xs vtabs" role="tablist"><button type="button" role="tab" data-act="v-tab" data-v="work" aria-pressed="${vu.tab === 'work'}">업무 정보</button><button type="button" role="tab" data-act="v-tab" data-v="memo" aria-pressed="${vu.tab === 'memo'}">보안메모 <span class="n">${Vault.memos().length}</span></button></div>`;
  const search = `<input class="in xs" type="search" id="vQ" placeholder="보안 영역 검색 (경로·key·보이는 값·메모 제목)" value="${esc(vu.q)}" aria-label="보안 영역 검색">`;
  let body;
  if (vu.q.trim()) body = searchHtml();
  else if (vu.tab === 'work') {
    const top = Vault.childrenOf(null);
    body = `<div class="vbar"><button type="button" class="btn xs" data-act="v-new-folder" data-id="">${ic('plus')}폴더</button><button type="button" class="btn xs" data-act="v-new-field" data-id="">${ic('plus')}항목</button><span class="sp"></span><button type="button" class="icbtn xs" data-act="v-all" data-v="1" aria-label="모두 펼치기" title="모두 펼치기">${ic('down')}</button><button type="button" class="icbtn xs" data-act="v-all" data-v="0" aria-label="모두 접기" title="모두 접기">${ic('up')}</button></div>
      ${top.folders.length || top.fields.length ? treeHtml() : '<p class="hint">업무 정보를 폴더로 정리해 보세요. 예: 고객사/시스템/대상 순서로 폴더를 만들고(/로 여러 단계를 한 번에), 그 안에 ID·PW 같은 항목을 넣습니다. 폴더에 라벨을 붙이면 하위 전체가 그 라벨에 연결됩니다.</p>'}`;
  } else {
    const ms = Vault.memos();
    body = `<div class="vbar"><button type="button" class="btn xs" data-act="v-new-memo">${ic('plus')}메모</button></div>${ms.length ? ms.map(m => memoRowHtml(m)).join('') : '<p class="hint">아직 보안메모가 없습니다. 제목만 보이고, 눌러야 내용이 보입니다.</p>'}`;
  }
  return `<div class="pgh"><h2>${ic('lock')}보안 영역</h2><button type="button" class="icbtn" data-act="v-settings" aria-label="보안 영역 설정" aria-haspopup="menu">${ic('gear')}</button><button type="button" class="btn xs" data-act="v-lock">${ic('lock')}잠그기</button></div>
    ${tabs}${search}<section class="pgs vbody">${body}</section>
    <p class="hint">${Math.round(IDLE_MS / 60000)}분 동안 조작이 없으면 자동으로 잠깁니다.</p>`;
}
export function vaultPageHtml() {
  if (!V.unlocked || vu.recovery || V.conflict) return `<div class="pgh"><h2>${ic('lock')}보안 영역</h2></div>${gateHtml()}`;
  return unlockedHtml();
}

// 라벨 보기 안의 "보안 정보" 구역
export function vaultLabelSection(labelId) {
  if (!V.meta) return '';
  if (!V.unlocked) return `<section class="pgs"><h3>${ic('lock')}보안 정보</h3><p class="hint">보안 영역이 잠겨 있습니다. <button type="button" class="lnk" data-act="v-open">열기</button></p></section>`;
  const folders = Vault.foldersWithLabel(labelId);
  const ms = Vault.memosWithLabel(labelId);
  if (!folders.length && !ms.length) return `<section class="pgs"><h3>${ic('lock')}보안 정보</h3><p class="hint">이 라벨이 붙은 업무 정보 폴더나 보안메모가 없습니다.</p></section>`;
  return `<section class="pgs"><h3>${ic('lock')}보안 정보</h3>
    ${folders.map(f => `<p class="vpath">${Vault.pathOf(f.id).slice(0, -1).map(p => esc(p.name)).join(' › ') || '업무 정보'}</p>${treeHtml(f.id, { compact: true })}`).join('')}
    ${ms.map(m => memoRowHtml(m, { compact: true })).join('')}</section>`;
}

// ---------- 다이얼로그 ----------
function fieldDialog({ id = null, parent = null, name = '', value = '', masked = false } = {}) {
  const n = id ? Vault.nodeById(id) : null;
  if (n) ({ name, value, masked } = n), parent = n.parent_id;
  const where = ['업무 정보', ...Vault.pathOf(parent).map(p => p.name)].join(' › ');
  const rows = Math.min(10, Math.max(2, (value.match(/\n/g) || []).length + 1));
  openDlg('vfield', n ? '항목 편집' : '항목 추가', `<form id="vFieldForm" data-id="${id || ''}" data-parent="${parent || ''}" autocomplete="off" class="vform">
    <p class="hint">위치: ${esc(where)}</p>
    <label class="fl" for="vfKey">key</label><input class="in" id="vfKey" maxlength="100" value="${esc(name)}" autocapitalize="off" spellcheck="false" placeholder="예: ID, PW, IP, privateKey" enterkeyhint="next" required>
    <label class="fl" for="vfVal">값</label><textarea class="in mono" id="vfVal" rows="${rows}" maxlength="20000" spellcheck="false" autocapitalize="off">${esc(value)}</textarea>
    <label class="ck"><input type="checkbox" id="vfMask"${masked ? ' checked' : ''}> 값 가리기 (눌러야 보이고, 검색에서 빠짐)</label>
    <div class="btns">${n ? `<button type="button" class="btn" data-act="v-move" data-id="${n.id}">이동</button><button type="button" class="btn danger" data-act="v-del-node" data-id="${n.id}">삭제</button>` : `<button type="submit" class="btn" name="more" value="1">계속 추가</button>`}<button type="submit" class="btn primary">저장</button></div>
  </form>`);
  $(n ? '#vfVal' : '#vfKey').focus();
}
const FOLDER_HINT = '한 줄에 하나씩(또는 쉼표로 나눠) 쓰면 여러 폴더를 한 번에 만듭니다. /로 이어 쓰면 여러 단계. 이미 있는 폴더는 그대로 씁니다';
function folderPrompt(parentId, renameId = null) {
  const node = renameId ? Vault.nodeById(renameId) : null;
  const base = Vault.nodeById(parentId);
  if (node) {
    openDlg('vfolder', '폴더 이름 바꾸기', `<form id="vFolderForm" data-parent="${parentId || ''}" data-id="${renameId}" autocomplete="off" class="vform">
      <label class="fl" for="vfName">폴더 이름</label><input class="in" id="vfName" maxlength="100" value="${esc(node.name)}" required>
      <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">바꾸기</button></div></form>`);
    $('#vfName').focus();
    return;
  }
  const srcs = Vault.foldersWithFields();
  openDlg('vfolder', base ? `‘${base.name}’ 안에 새 폴더` : '새 폴더', `<form id="vFolderForm" data-parent="${parentId || ''}" data-id="" autocomplete="off" class="vform">
    <label class="fl" for="vfName">폴더 이름</label><textarea class="in mono" id="vfName" rows="4" maxlength="5000" spellcheck="false" placeholder="예:&#10;serverB&#10;serverC&#10;삼성증권/HIWARE/ServerEDR" required></textarea>
    <p class="hint" id="vfHint">${FOLDER_HINT}</p>
    ${srcs.length ? `<label class="fl" for="vfTpl">항목 구조 가져오기 (선택)</label><select class="in" id="vfTpl"><option value="">가져오지 않음</option>${srcs.map(x => `<option value="${x.node.id}">${esc(x.path)} (항목 ${x.count})</option>`).join('')}</select>
      <p class="hint">고른 폴더의 key와 가리기 설정을 새로 만든 각 폴더에 넣습니다. 값은 비워 둡니다.</p>` : ''}
    <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">만들기</button></div></form>`);
  $('#vfName').focus();
}
// 항목을 다른 폴더(여러 개)로 복사
function copyDialog(folderId) {
  const f = Vault.nodeById(folderId);
  const fields = Vault.childrenOf(folderId).fields;
  if (!fields.length) { toast('이 폴더에는 복사할 항목이 없습니다'); return; }
  const targets = Vault.allFolders().filter(x => x.node.id !== folderId);
  if (!targets.length) { toast('붙여 넣을 다른 폴더가 없습니다'); return; }
  const sibling = x => x.node.parent_id === f.parent_id;
  openDlg('vcopy', `‘${f.name}’ 항목 복사`, `<form id="vCopyForm" data-src="${folderId}" autocomplete="off" class="vform">
    <span class="fl">복사할 항목</span>
    <div class="ckbox">${fields.map(x => `<label class="ck"><input type="checkbox" name="fid" value="${x.id}" checked><span class="mono">${esc(x.name)}</span>${x.masked ? ic('lock', '', 'kl') : ''}</label>`).join('')}</div>
    <label class="ck"><input type="checkbox" id="vcVals"> 값도 함께 복사 (끄면 key와 가리기 설정만)</label>
    <div class="flrow"><span class="fl">붙여 넣을 폴더</span><button type="button" class="lnk" data-act="v-copy-sib">같은 위치 폴더 모두 선택</button></div>
    <div class="treebox">${targets.map(x => `<label class="ck" style="padding-left:${6 + x.depth * 18}px"><input type="checkbox" name="tid" value="${x.node.id}" data-sib="${sibling(x) ? 1 : 0}">${ic('folder')}<span>${esc(x.node.name)}</span></label>`).join('')}</div>
    <p class="hint">대상 폴더에 같은 key가 이미 있으면 건너뜁니다.</p>
    <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">복사</button></div></form>`);
}
function memoDialog(id = null) {
  const m = id ? Vault.memoById(id) : null;
  vu.memoLabels = m ? [...m.label_ids] : [];
  openDlg('vmemo', m ? '보안메모 편집' : '보안메모 추가', `<form id="vMemoForm" data-id="${id || ''}" autocomplete="off" class="vform">
    <label class="fl" for="vmTitle">제목</label><input class="in" id="vmTitle" maxlength="120" value="${esc(m?.title || '')}" required>
    <label class="fl" for="vmBody">내용</label><textarea class="in mono" id="vmBody" rows="8" maxlength="50000" spellcheck="false">${esc(m?.body || '')}</textarea>
    <span class="fl">라벨</span><button type="button" class="pv" id="vmLabels" data-act="v-memo-labels">${memoLabelsHtml()}</button>
    <div class="btns">${m ? `<button type="button" class="btn danger" data-act="v-del-memo" data-id="${m.id}">삭제</button>` : ''}<button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">저장</button></div></form>`);
  $('#vmTitle').focus();
}
const memoLabelsHtml = () => (vu.memoLabels.length ? vu.memoLabels.map(labelById).filter(Boolean).map(l => `<span class="lb">${dot(l)}<span class="t">${esc(l.name)}</span></span>`).join('') : '<span class="ph0">라벨 없음 · 선택</span>');
function labelMenu(anchor, getOn, toggle, locked = []) {
  openMenu(anchor, () => {
    const items = labelsAll().filter(l => !l.archived || getOn().includes(l.id) || locked.includes(l.id)).map(l => ({ label: l.name, check: getOn().includes(l.id) || locked.includes(l.id), disabled: locked.includes(l.id), note: locked.includes(l.id) ? '상위 폴더에서 상속' : '', icon: dot(l), onPick: () => { toggle(l.id); return 'keep'; } }));
    return items.length ? items : [{ label: '라벨이 없습니다 (라벨·주제 관리에서 추가)', disabled: true }];
  });
}
function moveDialog(node) {
  const rows = [];
  const walk = (pid, depth) => { for (const f of Vault.childrenOf(pid).folders) { rows.push({ f, depth }); walk(f.id, depth + 1); } };
  walk(null, 1);
  const here = node.parent_id || '';
  const opt = (id, name, depth) => {
    const err = Vault.moveError(node, id || null);
    return `<button type="button" class="mi" data-act="v-move-to" data-id="${node.id}" data-to="${id}" style="padding-left:${8 + depth * 18}px"${err ? ` disabled title="${esc(err)}"` : ''}>${ic(id ? 'folder' : 'list')}<span class="ml">${esc(name)}</span>${id === here ? '<span class="sub">현재 위치</span>' : ''}</button>`;
  };
  openDlg('vmove', `‘${node.name}’ 이동`, `<p class="hint">옮길 폴더를 고르세요.${node.type === 'folder' ? ' 하위 폴더·항목도 함께 옮겨집니다.' : ''}</p><div class="treebox">${opt('', '업무 정보 (최상위)', 0)}${rows.map(r => opt(r.f.id, r.f.name, r.depth)).join('')}</div>`);
}
function pinChangeDialog() {
  openDlg('vpin', 'PIN 변경 (이 기기)', `<form id="vPinChange" autocomplete="off" class="vform">${pinIn('vcPin1', '새 PIN (숫자 4자리)')}${pinIn('vcPin2', 'PIN 확인')}<div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">바꾸기</button></div></form>`);
  $('#vcPin1').focus();
}
function pwChangeDialog() {
  openDlg('vpw', '마스터 비밀번호 변경', `<form id="vPwChange" autocomplete="off" class="vform">${pwIn('vcOld', '지금 마스터 비밀번호')}${pwIn('vcNew1', `새 마스터 비밀번호 (${PW_MIN}자 이상)`, 'new-password')}${pwIn('vcNew2', '새 마스터 비밀번호 확인', 'new-password')}
    <p class="hint">다른 기기는 PIN으로 계속 열 수 있습니다. 새 기기를 등록할 때부터 새 비밀번호를 씁니다.</p>
    <div class="btns"><button type="button" class="btn" data-act="close-dlg">취소</button><button type="submit" class="btn primary">바꾸기</button></div></form>`);
  $('#vcOld').focus();
}

// ---------- 다시 그리기 ----------
function refresh(focusSel) {
  rerender();
  if (focusSel) requestAnimationFrame(() => $(focusSel)?.focus());
}
function save() { Vault.saveDoc(); }
function revealIn(id) {
  for (const n of Vault.pathOf(id).slice(0, -1)) vu.open.add(n.id);
  vu.hl = id; vu.q = '';
  refresh();
  requestAnimationFrame(() => $(`#vn-${id}`)?.scrollIntoView({ block: 'center' }));
}

// ---------- 자동 잠금 ----------
let lastAct = Date.now();
const touchAct = () => { lastAct = Date.now(); };
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, touchAct, { capture: true, passive: true }));
async function checkIdle() {
  if (V.unlocked && Date.now() - lastAct > IDLE_MS) { await lockNow(); toast('보안 영역을 자동으로 잠갔습니다'); }
}
setInterval(checkIdle, 15000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkIdle(); });
export async function lockNow() {
  vu.revealed.clear(); vu.hl = null; vu.q = '';
  if (dlg.open && /^v/.test(dlg.dataset.kind || '')) dlg.close();
  await Vault.lock();
  refresh();
}

// ---------- 입력 처리 ----------
const val = id => $(id)?.value ?? '';
async function busyRun(fn) {
  if (vu.busy) return;
  vu.busy = true; vu.msg = ''; refresh();
  try { await fn(); } finally { vu.busy = false; refresh(); }
}
function pinPair(a, b) {
  if (!isPin(val(a))) return 'PIN은 숫자 4자리입니다';
  if (val(a) !== val(b)) return 'PIN 확인이 맞지 않습니다';
  return null;
}
function pwPair(a, b) { return pwError(val(a)) || (val(a) !== val(b) ? '마스터 비밀번호 확인이 맞지 않습니다' : null); }

document.addEventListener('submit', async e => {
  const f = e.target;
  if (!f.id || !f.id.startsWith('v')) return;
  e.preventDefault();
  if (f.id === 'vCreate') {
    const err = pwPair('#vPw1', '#vPw2') || pinPair('#vPin1', '#vPin2');
    if (err) { vu.msg = err; refresh('#vPw1'); return; }
    const pw = val('#vPw1'), pin = val('#vPin1');
    await busyRun(async () => { vu.recovery = await Vault.createVault(pw, pin); touchAct(); });
  } else if (f.id === 'vRecoveryShown') {
    if (!$('#vRkOk').checked) { toast('복구 키를 적어 두었는지 확인해 주세요'); return; }
    vu.recovery = null; refresh();
  } else if (f.id === 'vRegister') {
    const err = pinPair('#vPin1', '#vPin2');
    if (err) { vu.msg = err; refresh('#vPin1'); return; }
    const pw = val('#vPw'), pin = val('#vPin1');
    await busyRun(async () => {
      try { await Vault.registerDevice(pw, pin); vu.gate = null; touchAct(); }
      catch { vu.msg = '마스터 비밀번호가 맞지 않습니다'; }
    });
  } else if (f.id === 'vPinForm') {
    const pin = val('#vPin');
    if (!isPin(pin)) { vu.msg = 'PIN은 숫자 4자리입니다'; refresh('#vPin'); return; }
    await busyRun(async () => {
      const r = await Vault.unlockPin(pin);
      if (r.ok) { touchAct(); return; }
      vu.msg = r.error === 'locked-out' ? `PIN을 ${Vault.MAX_PIN_FAILS}번 틀려 이 기기의 PIN을 지웠습니다. 마스터 비밀번호로 다시 등록하세요` : `PIN이 맞지 않습니다 (남은 횟수 ${r.left})`;
    });
    requestAnimationFrame(() => $('#vPin')?.focus());
  } else if (f.id === 'vRecover') {
    const err = pwPair('#vPw1', '#vPw2') || pinPair('#vPin1', '#vPin2');
    if (err) { vu.msg = err; refresh(); return; }
    const rk = val('#vRk'), pw = val('#vPw1'), pin = val('#vPin1');
    await busyRun(async () => {
      try { await Vault.recover(rk, pw, pin); vu.gate = null; touchAct(); toast('새 마스터 비밀번호로 바꿨습니다'); }
      catch (er) { vu.msg = er.message === 'bad-recovery-format' ? '복구 키 형식이 맞지 않습니다 (26자)' : '복구 키가 맞지 않습니다'; }
    });
  } else if (f.id === 'vFieldForm') {
    const id = f.dataset.id || null, parent = f.dataset.parent || null;
    const patch = { name: val('#vfKey'), value: val('#vfVal'), masked: $('#vfMask').checked };
    const r = id ? Vault.updateNode(Vault.nodeById(id), patch) : Vault.createNode(parent, 'field', patch);
    if (r.error) { toast(r.error); $('#vfKey').focus(); return; }
    save();
    if (parent) vu.open.add(parent);
    vu.hl = r.node.id;
    if (e.submitter?.name === 'more') { // 계속 추가: key·값을 비우고 가리기는 다시 해제 (가릴 값은 나중에 골라서)
      $('#vfKey').value = ''; $('#vfVal').value = ''; $('#vfMask').checked = false; $('#vfKey').focus();
      toast(`‘${r.node.name}’ 저장됨`); refresh(); return;
    }
    dlg.close(); refresh();
  } else if (f.id === 'vFolderForm') {
    const id = f.dataset.id || null, parent = f.dataset.parent || null;
    if (id) {
      const r = Vault.updateNode(Vault.nodeById(id), { name: val('#vfName') });
      if (r.error) { toast(r.error); return; }
    } else {
      const r = Vault.createPaths(parent, val('#vfName'));
      if (r.error) { toast(r.error); return; }
      const tpl = $('#vfTpl')?.value;
      let copied = null;
      if (tpl) copied = Vault.copyFields(Vault.childrenOf(tpl).fields.map(x => x.id), r.leaves.map(n => n.id).filter(x => x !== tpl));
      for (const leaf of r.leaves) for (const n of Vault.pathOf(leaf.id)) vu.open.add(n.id);
      if (tpl) r.leaves.forEach(n => vu.open.add(n.id));
      vu.hl = r.leaves[r.leaves.length - 1]?.id || null;
      toast((r.created ? `폴더 ${r.created}개를 만들었습니다` : '이미 있는 폴더입니다') + (copied ? ` · 항목 ${copied.added}개 추가${copied.skipped ? `, ${copied.skipped}개 건너뜀` : ''}` : ''));
    }
    save(); dlg.close(); refresh();
  } else if (f.id === 'vCopyForm') {
    const fids = [...f.querySelectorAll('input[name=fid]:checked')].map(x => x.value);
    const tids = [...f.querySelectorAll('input[name=tid]:checked')].map(x => x.value);
    if (!fids.length) { toast('복사할 항목을 고르세요'); return; }
    if (!tids.length) { toast('붙여 넣을 폴더를 고르세요'); return; }
    const r = Vault.copyFields(fids, tids, { withValues: $('#vcVals').checked });
    tids.forEach(t => { for (const n of Vault.pathOf(t)) vu.open.add(n.id); });
    save(); dlg.close(); refresh();
    toast(`폴더 ${tids.length}개에 항목 ${r.added}개를 넣었습니다${r.skipped ? ` (같은 key ${r.skipped}개 건너뜀)` : ''}`);
  } else if (f.id === 'vMemoForm') {
    const r = Vault.saveMemo(f.dataset.id || null, { title: val('#vmTitle'), body: val('#vmBody'), label_ids: vu.memoLabels });
    if (r.error) { toast(r.error); return; }
    vu.hl = r.memo.id; save(); dlg.close(); refresh();
  } else if (f.id === 'vPinChange') {
    const err = pinPair('#vcPin1', '#vcPin2');
    if (err) { toast(err); return; }
    await Vault.changePin(val('#vcPin1')); dlg.close(); toast('이 기기 PIN을 바꿨습니다');
  } else if (f.id === 'vPwChange') {
    const err = pwPair('#vcNew1', '#vcNew2');
    if (err) { toast(err); return; }
    try { await Vault.changePassword(val('#vcOld'), val('#vcNew1')); dlg.close(); toast('마스터 비밀번호를 바꿨습니다'); }
    catch { toast('지금 마스터 비밀번호가 맞지 않습니다'); }
  }
});
// 항목 추가: key에서 Enter를 눌러도 값으로 넘어간다 (Tab도 바로 값으로)
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'vfKey' && !e.isComposing) { e.preventDefault(); $('#vfVal')?.focus(); }
});
// PIN 4자리를 다 넣으면 바로 열기
document.addEventListener('input', e => {
  if (e.target.id === 'vPin' && /^\d{4}$/.test(e.target.value)) $('#vPinForm')?.requestSubmit();
  if (e.target.id === 'vQ') { vu.q = e.target.value; const pos = e.target.selectionStart; rerender(); const q = $('#vQ'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  if (e.target.id === 'vfName' && !$('#vFolderForm')?.dataset.id) {
    const p = Vault.planPaths($('#vFolderForm').dataset.parent || null, e.target.value);
    $('#vfHint').textContent = !p.lines.length ? FOLDER_HINT
      : p.error || (p.newCount ? `새로 만들 폴더 ${p.newCount}개 (${p.lines.length}줄)${p.lines.length === 1 && p.plans[0].toCreate.length ? `: ${p.plans[0].toCreate.join(' › ')}` : ''}` : '모두 이미 있는 폴더입니다');
  }
});

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act^="v-"]');
  if (!el || el.disabled) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'v-open': st.ui.page = { kind: 'vault', id: null }; refresh(); break;
    case 'v-gate': vu.gate = el.dataset.v || null; vu.msg = ''; refresh(); requestAnimationFrame(() => $('#page .gate input')?.focus()); break;
    case 'v-copy-recovery': toast((await copyText(vu.recovery)) ? '복구 키를 복사했습니다' : '복사하지 못했습니다'); break;
    case 'v-use-remote': if (armed(el, '한 번 더 누르면 바꿉니다')) { await vu.syncInfo().resolveConflict?.(); refresh(); } break;
    case 'v-lock': await lockNow(); break;
    case 'v-tab': vu.tab = el.dataset.v; vu.q = ''; refresh(); break;
    case 'v-toggle': vu.open.has(id) ? vu.open.delete(id) : vu.open.add(id); refresh(`#vn-${id} .tt`); break;
    case 'v-all': if (el.dataset.v === '1') Vault.descendantsOf(null).concat(Vault.childrenOf(null).folders).forEach(n => { if (n.type === 'folder') vu.open.add(n.id); }); else vu.open.clear(); refresh(); break;
    case 'v-reveal': { const k = el.dataset.key; vu.revealed.has(k) ? vu.revealed.delete(k) : vu.revealed.add(k); refresh(); break; }
    case 'v-full': vu.revealed.add(id + ':full'); refresh(); break;
    case 'v-goto': revealIn(id); break;
    case 'v-goto-memo': vu.tab = 'memo'; vu.q = ''; vu.hl = id; vu.revealed.add(id + ':memo'); refresh(); requestAnimationFrame(() => $(`#vn-${id}`)?.scrollIntoView({ block: 'center' })); break;
    case 'v-new-folder': folderPrompt(id || null); break;
    case 'v-new-field': fieldDialog({ parent: id || null }); break;
    case 'v-edit-field': fieldDialog({ id }); break;
    case 'v-copy-sib': dlg.querySelectorAll('input[name=tid][data-sib="1"]').forEach(x => { x.checked = true; }); break;
    case 'v-folder-menu': {
      const f = Vault.nodeById(id);
      if (!f) break;
      const c = Vault.countUnder(id);
      openMenu(el, [
        { label: '하위 폴더 만들기', icon: ic('folder'), onPick: () => folderPrompt(id) },
        { label: '항목 추가', icon: ic('plus'), onPick: () => fieldDialog({ parent: id }) },
        ...(Vault.childrenOf(id).fields.length ? [{ label: '항목을 다른 폴더로 복사', icon: ic('copy'), onPick: () => copyDialog(id) }] : []),
        { label: '라벨', icon: ic('label'), note: Vault.inheritedLabels(f).length ? '상위에서 상속된 라벨은 여기서 뗄 수 없습니다' : '', onPick: () => setTimeout(() => { const anchor = $(`#vn-${id} [data-act="v-folder-menu"]`) || el; labelMenu(anchor, () => f.label_ids, lid => { Vault.toggleNodeLabel(f, lid); save(); rerender(); }, Vault.inheritedLabels(f)); }, 0) },
        { label: '이름 바꾸기', icon: ic('edit'), onPick: () => folderPrompt(f.parent_id, id) },
        { label: '이동', icon: ic('chevR'), onPick: () => moveDialog(f) },
        { label: `삭제 (하위 폴더 ${c.folders}개·항목 ${c.fields}개 포함)`, icon: ic('trash'), onPick: () => {
          openDlg('vdel', '폴더 삭제', `<p>‘${esc(f.name)}’ 폴더와 하위 폴더 ${c.folders}개, 항목 ${c.fields}개를 삭제합니다.</p><div class="btns"><button class="btn" data-act="close-dlg">취소</button><button class="btn danger" data-act="v-del-node-ok" data-id="${id}">삭제</button></div>`);
        } },
      ]);
      break;
    }
    case 'v-del-node': if (armed(el, '한 번 더 누르면 삭제')) { const n = Vault.nodeById(id); if (n) { Vault.deleteNode(n); save(); dlg.close(); refresh(); toast(`‘${n.name}’ 삭제`); } } break;
    case 'v-del-node-ok': { const n = Vault.nodeById(id); if (n) { const k = Vault.deleteNode(n); save(); dlg.close(); refresh(); toast(`${k}개 삭제`); } break; }
    case 'v-move': { const n = Vault.nodeById(id); if (n) moveDialog(n); break; }
    case 'v-move-to': {
      const n = Vault.nodeById(id);
      const r = n && Vault.moveNode(n, el.dataset.to || null);
      if (!r || r.error) { toast(r?.error || '옮기지 못했습니다'); break; }
      save(); dlg.close(); revealIn(n.id);
      break;
    }
    case 'v-new-memo': memoDialog(); break;
    case 'v-edit-memo': memoDialog(id); break;
    case 'v-memo-labels': labelMenu(el, () => vu.memoLabels, lid => { vu.memoLabels = vu.memoLabels.includes(lid) ? vu.memoLabels.filter(x => x !== lid) : [...vu.memoLabels, lid]; $('#vmLabels').innerHTML = memoLabelsHtml(); }); break;
    case 'v-del-memo': if (armed(el, '한 번 더 누르면 삭제')) { const m = Vault.memoById(id); if (m) { Vault.deleteMemo(m); save(); dlg.close(); refresh(); toast('보안메모를 삭제했습니다'); } } break;
    case 'v-settings':
      openMenu(el, [
        { label: '이 기기 PIN 변경', onPick: pinChangeDialog },
        { label: '마스터 비밀번호 변경', onPick: pwChangeDialog },
        { label: '복구 키 재발급', note: '이전 복구 키는 더 이상 쓸 수 없습니다', onPick: async () => { vu.recovery = await Vault.reissueRecovery(); refresh(); } },
      ]);
      break;
  }
});
