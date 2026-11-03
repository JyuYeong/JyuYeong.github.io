// 숫자 쓰기 화면: 펜 쥔 손이 획을 따라 움직이며 회색 글씨를 검정으로 채운다.
import { strokesOf } from './digits.js';

const NS = 'http://www.w3.org/2000/svg';
const SPEEDS = { slow: 42, normal: 70, fast: 115 }; // 칸 좌표 단위/초
const HAND_SCALE = 0.56;
const HOME = { x: 128, y: 150 }; // 손이 들어오고 나가는 자리 (오른쪽 아래, 이때는 흐리게 숨김)

// 손 그림 (연필 끝이 원점, 연필은 +x 방향. 그룹 전체를 -58° 돌려 오른쪽 위로 눕힌다)
const HAND_SVG = `
<g class="hand-art" transform="rotate(-58)">
  <ellipse cx="150" cy="44" rx="17" ry="31" fill="#7EC4F0" stroke="#4E97C7" stroke-width="2.5"/>
  <path d="M60 22 C66 4 92 -2 116 6 C140 14 150 36 144 58 C138 78 112 86 90 78 C72 72 56 44 60 22 Z" fill="#FFD9BC" stroke="#E2A27E" stroke-width="2.5"/>
  <path d="M104 62 C112 66 122 66 130 60" fill="none" stroke="#E2A27E" stroke-width="2" stroke-linecap="round"/>
  <ellipse cx="50" cy="15" rx="15" ry="8.5" fill="#FFD0AE" stroke="#E2A27E" stroke-width="2.5"/>
  <polygon points="0,0 9,-2.6 9,2.6" fill="#454545"/>
  <polygon points="9,-2.6 23,-8 23,8 9,2.6" fill="#F6CF9B" stroke="#D9A86A" stroke-width="1"/>
  <rect x="23" y="-8" width="92" height="16" fill="#FFC93C" stroke="#E0A520" stroke-width="1.2"/>
  <rect x="23" y="-2.2" width="92" height="4.4" fill="#FFB321" opacity=".55"/>
  <rect x="115" y="-8.6" width="9" height="17.2" fill="#C9CED6" stroke="#9AA1AB" stroke-width="1"/>
  <rect x="124" y="-8" width="13" height="16" rx="4" fill="#FF8FA8" stroke="#E46A87" stroke-width="1"/>
  <rect x="34" y="-14" width="56" height="15" rx="7.5" fill="#FFD9BC" stroke="#E2A27E" stroke-width="2.5"/>
  <path d="M68 -12 C66 -8 66 -4 68 0" fill="none" stroke="#E2A27E" stroke-width="1.6" stroke-linecap="round"/>
  <ellipse cx="62" cy="9" rx="17" ry="9" transform="rotate(-12 62 9)" fill="#FFD9BC" stroke="#E2A27E" stroke-width="2.5"/>
  <ellipse cx="49" cy="7" rx="4" ry="3" fill="#FFF1E6" opacity=".9"/>
</g>`;

function el(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

const ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export class Writer {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute('viewBox', '-34 -16 190 172');
    // 쓰기 칸 (깍두기 공책처럼 점선 십자)
    const guide = el('g', { class: 'guide' }, svg);
    el('rect', { x: -10, y: -6, width: 120, height: 152, rx: 14, class: 'guide-box' }, guide);
    el('line', { x1: 50, y1: -6, x2: 50, y2: 146, class: 'guide-line' }, guide);
    el('line', { x1: -10, y1: 70, x2: 110, y2: 70, class: 'guide-line' }, guide);
    this.gGhost = el('g', { class: 'ghost' }, svg);
    this.gInk = el('g', { class: 'ink' }, svg);
    this.gNum = el('g', { class: 'stroke-nums' }, svg);
    this.shadow = el('ellipse', { rx: 6, ry: 2.6, class: 'pen-shadow' }, svg);
    this.hand = el('g', { class: 'hand' }, svg);
    this.hand.innerHTML = HAND_SVG;
    this.raf = 0;
    this.pos = { ...HOME };
    this.setHand(HOME.x, HOME.y, 1, 0);
  }

  setHand(x, y, lift, op = 1) {
    const dx = lift * 5, dy = -lift * 10, s = HAND_SCALE * (1 + lift * .06);
    this.hand.setAttribute('transform', `translate(${x + dx} ${y + dy}) scale(${s})`);
    this.hand.style.opacity = op;
    this.shadow.setAttribute('cx', x + lift * 3);
    this.shadow.setAttribute('cy', y + 1 + lift * 2);
    this.shadow.style.opacity = op * (0.16 - lift * 0.1);
    this.pos = { x, y };
  }

  load(strokes) {
    this.stop();
    this.gGhost.innerHTML = ''; this.gInk.innerHTML = ''; this.gNum.innerHTML = '';
    this.badges = [];
    this.paths = strokes.map((d, i) => {
      el('path', { d, class: 'ghost-path' }, this.gGhost);
      const ink = el('path', { d, class: 'ink-path' }, this.gInk);
      const len = ink.getTotalLength();
      ink.style.strokeDasharray = `${len} ${len + 10}`;
      ink.style.strokeDashoffset = len;
      ink.style.visibility = 'hidden';
      const p0 = ink.getPointAtLength(0);
      if (strokes.length > 1) {
        // 시작점이 앞 획과 겹치면 번호를 오른쪽에 둔다
        const near = this.badges.some(q => Math.hypot(q.x - p0.x, q.y - p0.y) < 16);
        const bx = p0.x + (near ? 10 : -10), by = p0.y - 9;
        this.badges.push(p0);
        const g = el('g', { class: 'stroke-num' }, this.gNum);
        el('circle', { cx: bx, cy: by, r: 6.5 }, g);
        const t = el('text', { x: bx, y: by + 2.4 }, g);
        t.textContent = String(i + 1);
      }
      return { el: ink, len, start: p0 };
    });
    this.svg.classList.remove('done');
  }

  // 획 그리기 일정표 만들기
  plan(speed) {
    const v = SPEEDS[speed] || SPEEDS.normal;
    const segs = [];
    let cur = { ...HOME };
    const moveTo = (to, fade) => {
      const dist = Math.hypot(to.x - cur.x, to.y - cur.y);
      segs.push({ type: 'move', from: cur, to, fade, dur: Math.max(420, dist / 210 * 1000) });
      cur = to;
    };
    this.paths.forEach((p, i) => {
      moveTo({ x: p.start.x, y: p.start.y }, i === 0 ? 'in' : '');
      segs.push({ type: 'down', at: cur, dur: 220 });
      segs.push({ type: 'draw', i, dur: p.len / v * 1000 });
      const end = p.el.getPointAtLength(p.len);
      cur = { x: end.x, y: end.y };
      segs.push({ type: 'up', at: cur, dur: 200 });
    });
    segs.push({ type: 'wait', at: cur, dur: 250 });
    moveTo({ ...HOME }, 'out');
    return segs;
  }

  reset() {
    this.paths.forEach(p => { p.el.style.strokeDashoffset = p.len; p.el.style.visibility = 'hidden'; });
    this.svg.classList.remove('done');
  }

  play(speed, onDone) {
    this.stop();
    this.reset();
    const segs = this.plan(speed);
    let idx = 0, t0 = performance.now();
    const step = (now) => {
      let seg = segs[idx];
      let t = (now - t0) / seg.dur;
      while (t >= 1) {
        this.apply(seg, 1);
        idx++; t0 += seg.dur;
        if (idx >= segs.length) { this.raf = 0; this.svg.classList.add('done'); onDone && onDone(); return; }
        seg = segs[idx]; t = (now - t0) / seg.dur;
      }
      this.apply(seg, Math.max(0, t));
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  apply(seg, t) {
    if (seg.type === 'move') {
      const k = ease(t);
      const x = seg.from.x + (seg.to.x - seg.from.x) * k;
      const y = seg.from.y + (seg.to.y - seg.from.y) * k - Math.sin(Math.PI * k) * 6;
      const op = seg.fade === 'in' ? Math.min(1, t * 2.5) : seg.fade === 'out' ? Math.max(0, 1 - t * 1.6) : 1;
      this.setHand(x, y, 1, op);
    } else if (seg.type === 'down') {
      this.setHand(seg.at.x, seg.at.y, 1 - ease(t));
    } else if (seg.type === 'up') {
      this.setHand(seg.at.x, seg.at.y, ease(t));
    } else if (seg.type === 'wait') {
      this.setHand(seg.at.x, seg.at.y, 1);
    } else if (seg.type === 'draw') {
      const p = this.paths[seg.i];
      const d = p.len * t;
      p.el.style.visibility = d > 0.01 ? 'visible' : 'hidden';
      p.el.style.strokeDashoffset = p.len - d;
      const pt = p.el.getPointAtLength(d);
      this.setHand(pt.x, pt.y, 0);
    }
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  // 애니메이션 없이 다 쓴 상태로 보여 주기 (테스트·미리보기용)
  finish() {
    this.stop();
    this.paths.forEach(p => { p.el.style.visibility = 'visible'; p.el.style.strokeDashoffset = 0; });
    this.setHand(HOME.x, HOME.y, 1, 0);
    this.svg.classList.add('done');
  }
}

// 설정 화면의 작은 미리보기 (획 시작점 표시)
export function previewSVG(strokes) {
  const starts = [];
  const tmp = document.createElementNS(NS, 'svg');
  tmp.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
  document.body.appendChild(tmp);
  strokes.forEach(d => {
    const p = el('path', { d }, tmp);
    const a = p.getPointAtLength(0), b = p.getPointAtLength(Math.min(10, p.getTotalLength()));
    starts.push({ a, b });
  });
  tmp.remove();
  const paths = strokes.map(d => `<path d="${d}" class="pv-path"/>`).join('');
  const dots = starts.map((s, i) => {
    const ang = Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x) * 180 / Math.PI;
    return `<g class="pv-start"><circle cx="${s.a.x}" cy="${s.a.y}" r="9"/>` +
      (strokes.length > 1 ? `<text x="${s.a.x}" y="${s.a.y + 4}">${i + 1}</text>` :
        `<path d="M${s.a.x - 3} ${s.a.y - 3.5} L${s.a.x + 3.5} ${s.a.y} L${s.a.x - 3} ${s.a.y + 3.5}" transform="rotate(${ang} ${s.a.x} ${s.a.y})"/>`) + '</g>';
  }).join('');
  return `<svg viewBox="-12 -8 124 156" class="pv">${paths}${dots}</svg>`;
}

export function renderWrite(root, ctx) {
  const { prefs, save } = ctx;
  root.innerHTML = `
  <div class="screen write">
    <header class="bar">
      <button class="icon-btn back" data-go="" aria-label="처음으로">${ctx.icons.back}</button>
      <h2 class="bar-title">숫자 쓰기</h2>
      <div class="speed" role="group" aria-label="속도">
        <button data-speed="slow" aria-label="천천히">🐢</button>
        <button data-speed="normal" aria-label="보통">🙂</button>
        <button data-speed="fast" aria-label="빠르게">🐇</button>
      </div>
    </header>
    <div class="write-body">
      <div class="board-wrap">
        <svg class="board" aria-label="숫자 쓰기 칸"></svg>
        <button class="replay" aria-label="다시 보기">${ctx.icons.replay}</button>
      </div>
      <div class="digit-pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="dbtn c${n}" data-n="${n}">${n}</button>`).join('')}
      </div>
    </div>
  </div>`;

  const svg = root.querySelector('.board');
  const w = new Writer(svg);
  let current = prefs.lastDigit || 1;

  const markSpeed = () => root.querySelectorAll('[data-speed]').forEach(b =>
    b.classList.toggle('on', b.dataset.speed === prefs.speed));
  const markDigit = () => root.querySelectorAll('.dbtn').forEach(b =>
    b.classList.toggle('on', +b.dataset.n === current));

  const show = (n, autoplay = true) => {
    current = n; prefs.lastDigit = n; save();
    markDigit();
    w.load(strokesOf(n, prefs.digitShapes));
    if (autoplay) w.play(prefs.speed);
  };

  root.querySelector('.digit-pad').addEventListener('click', e => {
    const b = e.target.closest('.dbtn'); if (b) show(+b.dataset.n);
  });
  root.querySelector('.replay').addEventListener('click', () => w.play(prefs.speed));
  svg.addEventListener('click', () => w.play(prefs.speed));
  root.querySelector('.speed').addEventListener('click', e => {
    const b = e.target.closest('[data-speed]'); if (!b) return;
    prefs.speed = b.dataset.speed; save(); markSpeed(); w.play(prefs.speed);
  });
  markSpeed();
  show(current);
  window.__writer = w; // 테스트용
  return () => w.stop();
}
