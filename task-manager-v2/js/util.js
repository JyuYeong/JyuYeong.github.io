// 공용 도구: DOM, 이스케이프, 아이콘, 토스트, 다이얼로그, 팝오버 메뉴, 복사·내려받기
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const wide = () => matchMedia('(min-width:700px)').matches;

// ---------- 아이콘 ----------
const P = {
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  chev: '<path d="M7 10l5 5 5-5"/>',
  chevR: '<path d="M10 7l5 5-5 5"/>',
  chevL: '<path d="M14 7l-5 5 5 5"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10.5 11v5M13.5 11v5"/>',
  copy: '<rect x="8.5" y="8.5" width="10" height="10" rx="2"/><path d="M5.5 14.5V7a2 2 0 012-2h7"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  gear: '<path d="M5 8h9M18 8h1M5 16h1M10 16h9"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  label: '<path d="M3.5 6.5a2 2 0 012-2h9.2l5.8 7.5-5.8 7.5H5.5a2 2 0 01-2-2z"/>',
  bell: '<path d="M4 10v4h3l6 4V6l-6 4z"/><path d="M16.5 9.5a3.5 3.5 0 010 5M19 7a7 7 0 010 10"/>',
  link: '<path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/>',
  pause: '<path d="M9 6v12M15 6v12"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 011-1h8l8 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  up: '<path d="M7 14l5-5 5 5"/>',
  down: '<path d="M7 10l5 5 5-5"/>',
  dash: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4" rx="1.5"/><rect x="13" y="10" width="7" height="10" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16"/><path d="M9.9 5.8A9.7 9.7 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3 3.8M6.3 7.5A15.6 15.6 0 002.5 12S6 18.5 12 18.5a9.5 9.5 0 004.2-.9"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  folder: '<path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  dots: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
  note: '<path d="M6 4h9l3 3v13H6z"/><path d="M9 10h6M9 14h6M9 18h3"/>',
};
export const ic = (name, style = '', cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true"${style ? ` style="${style}"` : ''}>${P[name]}</svg>`;

export function stIcon(s) {
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

// ---------- 토스트 ----------
let toastTimer;
export function toast(msg, action) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-act="${action.act}" data-id="${esc(action.id)}">${esc(action.label)}</button>` : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6000 : 2200);
}

// ---------- 다이얼로그 ----------
export const dlg = document.getElementById('dlg');
export function openDlg(kind, title, bodyHtml) {
  dlg.dataset.kind = kind;
  dlg.innerHTML = `<div class="dlg-h"><h2>${esc(title)}</h2><button class="icbtn" data-act="close-dlg" aria-label="닫기">${ic('x')}</button></div><div class="dlg-b">${bodyHtml}</div>`;
  if (!dlg.open) dlg.showModal();
}
export const dlgIs = kind => dlg.open && dlg.dataset.kind === kind;
export function setDlgBody(html, focusSel) {
  const b = dlg.querySelector('.dlg-b');
  if (!b) return;
  const st = b.scrollTop;
  b.innerHTML = html;
  b.scrollTop = st;
  if (focusSel) dlg.querySelector(focusSel)?.focus();
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { dlg.dataset.kind = ''; });

// ---------- 팝오버 메뉴 ----------
// items: [{ label, sub, icon, cur, add, head, check, note, onPick }] 또는 그것을 돌려주는 함수
// onPick이 'keep'을 돌려주면 메뉴를 닫지 않고 다시 그린다 (여러 개 고르기)
let closeMenuFn = () => {};
let menuOpen = false;
// 다이얼로그 안 메뉴가 열려 있을 때 Esc는 메뉴만 닫는다
dlg.addEventListener('cancel', e => { if (menuOpen) { e.preventDefault(); closeMenu(); } });
export const closeMenu = () => closeMenuFn();
export function openMenu(anchor, items) {
  closeMenu();
  const getItems = typeof items === 'function' ? items : () => items;
  // 모달 다이얼로그 안에서 열 때는 다이얼로그 안에 그린다 (밖에 그리면 다이얼로그 뒤에 가려 누를 수 없다)
  const host = anchor.closest('dialog[open]');
  let root = $('#menuRoot');
  if (host) { root = host.querySelector(':scope > .menuRootDlg') || host.appendChild(Object.assign(document.createElement('div'), { className: 'menuRootDlg' })); }
  let list = getItems();
  const draw = () => {
    root.innerHTML = `<div class="pop" role="menu">${list.map((it, i) => it.head
      ? `<div class="mh">${it.icon || ''}${esc(it.label)}</div>`
      : `<button class="mi${it.cur ? ' cur' : ''}${it.add ? ' add' : ''}${it.check !== undefined ? ' mck' : ''}${it.armed ? ' armed' : ''}" role="${it.check !== undefined ? 'menuitemcheckbox' : 'menuitem'}"${it.check !== undefined ? ` aria-checked="${!!it.check}"` : ''} data-i="${i}"${it.disabled ? ' disabled' : ''}>${it.check !== undefined ? `<span class="cb">${it.check ? ic('check') : ''}</span>` : ''}${it.icon || ''}<span class="ml">${esc(it.label)}${it.note ? `<small>${esc(it.note)}</small>` : ''}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}${it.cur ? ic('check', '', 'ck') : ''}</button>`).join('')}</div>`;
    return root.firstElementChild;
  };
  let pop = draw();
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const isSel = anchor.matches('.sel, .pv');
    if (isSel) pop.style.width = Math.max(r.width, 240) + 'px';
    const w = pop.offsetWidth;
    let top = r.bottom + 4;
    if (top + pop.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - pop.offsetHeight - 4);
    pop.style.top = top + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  };
  place();
  const onDown = e => { if (!root.contains(e.target)) closeMenu(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); anchor.focus(); } };
  root.onclick = e => {
    const b = e.target.closest('.mi');
    if (!b || b.disabled) return;
    const i = +b.dataset.i;
    const r = list[i].onPick?.();
    if (r === 'keep') {
      list = getItems();
      pop = draw(); place();
      root.querySelector(`.mi[data-i="${i}"]`)?.focus();
    } else closeMenu();
  };
  setTimeout(() => document.addEventListener('pointerdown', onDown), 0);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', closeMenu, { once: true });
  menuOpen = true;
  closeMenuFn = () => {
    document.removeEventListener('pointerdown', onDown);
    document.removeEventListener('keydown', onKey, true);
    root.innerHTML = ''; root.onclick = null;
    menuOpen = false;
    closeMenuFn = () => {};
  };
  pop.querySelector('.mi.cur, .mi')?.focus();
}

// 실수 방지: 한 번 더 눌러야 실행 (3초 안에)
// 아이콘만 있는 버튼은 aria-label만, 글자가 있는 버튼은 글자를 바꿔 보여 준다
export function armed(el, armedLabel = '한 번 더 누르면 실행') {
  if (el.dataset.armed === '1') return true;
  const iconOnly = !el.textContent.trim();
  const orig = iconOnly ? el.getAttribute('aria-label') : el.innerHTML;
  el.dataset.armed = '1'; el.classList.add('armed');
  if (iconOnly) el.setAttribute('aria-label', armedLabel); else el.textContent = armedLabel;
  setTimeout(() => {
    if (!el.isConnected || el.dataset.armed !== '1') return;
    el.dataset.armed = ''; el.classList.remove('armed');
    if (iconOnly) el.setAttribute('aria-label', orig || ''); else el.innerHTML = orig;
  }, 3000);
  return false;
}

// ---------- 복사·내려받기 ----------
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* 무시 */ }
    ta.remove();
    return ok;
  }
}
export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
