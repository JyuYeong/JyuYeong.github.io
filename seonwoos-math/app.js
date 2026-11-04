// 선우의 수학 놀이터 — 화면 전환·설정 저장
import { renderWrite, previewSVG } from './write.js';
import { renderAdd, resetAddInput } from './add.js';
import { DIGITS } from './digits.js';

const VERSION = '0.3.0';
const KEY = 'swm-prefs';
const DEFAULTS = { speed: 'normal', repeat: false, inputMode: 'next', method: 'A', split: 'second', digitShapes: {}, lastA: 8, lastB: 7 };

const prefs = (() => {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
})();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* 저장 못 해도 계속 */ } };

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const icons = {
  back: svg('<path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  replay: svg('<path d="M5 12 a7 7 0 1 0 2.1-5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M4 3.5 L4.6 8.6 L9.6 7.6" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>'),
  restart: svg('<path d="M6 5 V19" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M19 5 L10 12 L19 19 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  prev: svg('<path d="M16 5 L7 12 L16 19 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  next: svg('<path d="M8 5 L17 12 L8 19 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  play: svg('<path d="M8 5 L18 12 L8 19 Z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
  pause: svg('<rect x="6" y="5" width="4.2" height="14" rx="1.5" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.5" fill="currentColor"/>'),
  repeat: svg('<path d="M4 11 V9.5 A3.5 3.5 0 0 1 7.5 6 H18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M15 3 L18.5 6 L15 9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 13 V14.5 A3.5 3.5 0 0 1 16.5 18 H6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M9 15 L5.5 18 L9 21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.9 1.9M16.6 16.6l1.9 1.9M5.5 18.5l1.9-1.9M16.6 7.4l1.9-1.9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
};

const root = document.getElementById('app');
let cleanup = null;

// 홈 화면 그림
const PENCIL_ART = `<svg viewBox="0 0 120 90" class="card-art" aria-hidden="true">
  <rect x="6" y="8" width="62" height="74" rx="10" fill="#fff" stroke="#F3C6A0" stroke-width="3"/>
  <path d="M22 30 L37 18 L37 70" fill="none" stroke="#C9C9C9" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M22 30 L37 18 L37 44" fill="none" stroke="#3A3A3A" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <g transform="translate(37 46) rotate(-55)">
    <polygon points="0,0 8,-3 8,3" fill="#454545"/><polygon points="8,-3 20,-8 20,8 8,3" fill="#F6CF9B"/>
    <rect x="20" y="-8" width="56" height="16" fill="#FFC93C" stroke="#E0A520" stroke-width="1.5"/>
    <rect x="76" y="-8.5" width="7" height="17" fill="#C9CED6"/><rect x="83" y="-8" width="10" height="16" rx="4" fill="#FF8FA8"/>
  </g>
</svg>`;
const BLOCK_ART = (() => {
  let s = '<svg viewBox="0 0 120 90" class="card-art" aria-hidden="true">';
  for (let i = 0; i < 10; i++) s += `<rect x="${8 + i * 10}" y="16" width="10" height="16" rx="2.5" fill="#6FA8FF" stroke="#3F7BD6" stroke-width="1.4"/>`;
  for (let i = 0; i < 4; i++) s += `<rect x="${8 + i * 13}" y="48" width="11" height="16" rx="2.5" fill="#FF9F5A" stroke="#D9732C" stroke-width="1.4"/>`;
  s += '<text x="70" y="64" font-size="20" font-weight="900" fill="#FF7A8A">+</text>';
  for (let i = 0; i < 2; i++) s += `<rect x="${86 + i * 13}" y="48" width="11" height="16" rx="2.5" fill="#FF9F5A" stroke="#D9732C" stroke-width="1.4"/>`;
  return s + '</svg>';
})();
const DECOR = `<svg class="decor" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <g fill="#fff" opacity=".9">
    <g class="cloud c1"><ellipse cx="60" cy="58" rx="34" ry="16"/><ellipse cx="80" cy="48" rx="22" ry="18"/><ellipse cx="44" cy="50" rx="16" ry="13"/></g>
    <g class="cloud c2"><ellipse cx="330" cy="44" rx="30" ry="13"/><ellipse cx="346" cy="36" rx="18" ry="14"/><ellipse cx="316" cy="38" rx="13" ry="11"/></g>
  </g>
  <g class="star s1"><path d="M352 112 l5 10 11 1.5 -8 7.5 2 11 -10 -5.5 -10 5.5 2 -11 -8 -7.5 11 -1.5z" fill="#FFD447"/></g>
  <g class="star s2"><path d="M40 150 l4 8 9 1.2 -6.5 6 1.6 9 -8.1 -4.4 -8.1 4.4 1.6 -9 -6.5 -6 9 -1.2z" fill="#FFB0C0"/></g>
  <g class="star s3"><path d="M210 22 l3 6 7 1 -5 4.6 1.2 6.8 -6.2 -3.4 -6.2 3.4 1.2 -6.8 -5 -4.6 7 -1z" fill="#9ED8FF"/></g>
  <g class="balloon b1"><path d="M22 250 q8 -18 2 -40" stroke="#B9A7D9" stroke-width="1.5" fill="none"/><ellipse cx="24" cy="196" rx="15" ry="18" fill="#B78CFF"/><text x="24" y="203" class="bn">1</text></g>
  <g class="balloon b2"><path d="M378 262 q-8 -18 -2 -40" stroke="#9CCFB8" stroke-width="1.5" fill="none"/><ellipse cx="376" cy="206" rx="15" ry="18" fill="#5CC8A0"/><text x="376" y="213" class="bn">2</text></g>
  <g class="balloon b3"><path d="M330 280 q6 -14 0 -30" stroke="#F4B6A0" stroke-width="1.5" fill="none"/><ellipse cx="330" cy="236" rx="13" ry="15.5" fill="#FF9F5A"/><text x="330" y="242" class="bn">3</text></g>
</svg>`;

function title() {
  const colors = ['#FF6F8E', '#FF9F43', '#F7B500', '#3DBE8B', '#3D9BFF', '#9B6BFF'];
  const line = (txt, off) => [...txt].map((ch, i) => ch === ' ' ? '<span class="sp"></span>'
    : `<span class="ch" style="--c:${colors[(i + off) % colors.length]};--i:${i + off}">${ch}</span>`).join('');
  return `<h1 class="title" aria-label="선우의 수학 놀이터"><span class="t1">${line('선우의', 0)}</span><span class="t2">${line('수학 놀이터', 3)}</span></h1>`;
}

function renderHome() {
  resetAddInput();
  root.innerHTML = `
  <div class="screen home">
    <section class="home-top">
      ${DECOR}
      <button class="icon-btn gear" data-go="settings" aria-label="설정">${icons.gear}</button>
      ${title()}
    </section>
    <section class="home-menu">
      <button class="menu-card write-card" data-go="write">${PENCIL_ART}<span class="mc-label">숫자 쓰기</span></button>
      <button class="menu-card add-card" data-go="add">${BLOCK_ART}<span class="mc-label">덧셈 배우기</span></button>
    </section>
  </div>`;
}

function renderSettings() {
  const multi = Object.keys(DIGITS).filter(n => Object.keys(DIGITS[n].variants).length > 1);
  const cur = n => prefs.digitShapes[n] || DIGITS[n].def;
  const segRow = (key, opts) => `<div class="seg wide" data-pref="${key}">${opts.map(([v, t]) =>
    `<button data-v="${v}" class="${prefs[key] === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  root.innerHTML = `
  <div class="screen settings">
    <header class="bar">
      <button class="icon-btn back" data-go="" aria-label="처음으로">${icons.back}</button>
      <h2 class="bar-title">설정</h2><span></span>
    </header>
    <div class="set-body">
      <h3>숫자 모양</h3>
      <p class="hint">동그라미는 쓰기 시작하는 곳이에요. 숫자는 획 순서예요.</p>
      ${multi.map(n => `<div class="shape-row"><div class="shape-n">${n}</div><div class="shape-opts" data-n="${n}">
        ${Object.entries(DIGITS[n].variants).map(([k, v]) => `<button class="shape ${cur(n) === k ? 'on' : ''}" data-k="${k}">${previewSVG(v.strokes)}<span>${v.name}</span></button>`).join('')}
      </div></div>`).join('')}
      <h3>쓰기 속도</h3>
      ${segRow('speed', [['slow', '🐢 천천히'], ['normal', '🙂 보통'], ['fast', '🐇 빠르게']])}
      <h3>덧셈 처음 방법</h3>
      ${segRow('method', [['A', '자리별로'], ['B', '10 채우기']])}
      ${segRow('split', [['second', '뒤 수 가르기'], ['first', '앞 수 가르기']])}
      <p class="ver">버전 ${VERSION}</p>
    </div>
  </div>`;
  root.querySelector('.set-body').addEventListener('click', e => {
    const sh = e.target.closest('.shape');
    if (sh) {
      const n = sh.parentElement.dataset.n;
      prefs.digitShapes[n] = sh.dataset.k; save();
      sh.parentElement.querySelectorAll('.shape').forEach(b => b.classList.toggle('on', b === sh));
      return;
    }
    const bt = e.target.closest('.seg button');
    if (bt) {
      const key = bt.parentElement.dataset.pref;
      prefs[key] = bt.dataset.v; save();
      bt.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === bt));
    }
  });
}

// ---------- 화면 전환 (주소 # 뒤) ----------
const ctx = { prefs, save, icons, go: path => { location.hash = '#' + path; } };
const stack = [];

function route() {
  const raw = location.hash.replace(/^#/, '');
  const [name, qs] = raw.split('?');
  if (stack.length > 1 && stack[stack.length - 2] === raw) stack.pop();
  else if (stack[stack.length - 1] !== raw) stack.push(raw);
  if (cleanup) { cleanup(); cleanup = null; }
  const q = new URLSearchParams(qs || '');
  if (name === 'write') cleanup = renderWrite(root, ctx);
  else if (name === 'add') cleanup = renderAdd(root, ctx, q) || null;
  else if (name === 'settings') renderSettings();
  else renderHome();
  document.body.dataset.screen = name || 'home';
}

// 뒤로 버튼: 바로 앞 화면이 목적지면 브라우저 뒤로(안드로이드 뒤로 버튼과 같게), 아니면 바꿔치기
root.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  const target = b.dataset.go;
  if (b.classList.contains('back')) {
    if (stack.length > 1 && stack[stack.length - 2] === target) history.back();
    else location.replace('#' + target);
  } else ctx.go(target);
});

window.addEventListener('hashchange', route);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
route();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 캐시 없이도 동작 */ });
}
