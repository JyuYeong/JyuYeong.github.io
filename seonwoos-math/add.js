// 덧셈 배우기: 수 블록으로 '왜 그 합이 되는지' 단계별로 보여 준다.
// 무대(stage)는 1000×770 논리 좌표. 단계마다 모든 블록의 위치를 미리 계산해 두고(스냅숏),
// 다음/이전으로 스냅숏을 바꾸면 CSS 전환으로 움직인다.

const W = 1000, H = 770;
const CUBE = 38, LP = 44, TP = 38, RP = 50;   // 블록 크기, 낱개 간격, 붙은 간격, 줄 간격
const LX = 40, RX = 526, BY = 215;            // 왼쪽/오른쪽 묶음 x, 블록 시작 y
const CX = Math.round((W - (9 * LP + CUBE)) / 2); // 가운데 묶음 x
const GAP = 30;                               // 가르기 할 때 벌리는 폭

const clone = o => JSON.parse(JSON.stringify(o));
const chunk = ids => { const r = []; for (let i = 0; i < ids.length; i += 10) r.push(ids.slice(i, i + 10)); return r; };
const join = arr => arr.filter(n => n !== 0).join(' + ');
const rodBox = (x, y) => ({ x: x - 5, y: y - 5, w: 9 * TP + CUBE + 10, h: CUBE + 10 });

export function validate(a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b)) return 'empty';
  if (a < 1 || b < 1) return 'zero';
  if (a > 99 || b > 99) return 'big';
  if (a + b > 100) return 'over';
  return '';
}

// opt.method: 'A'(자리별) | 'B'(10 채우기),  opt.split: 'second'(뒤 수 가르기) | 'first'(앞 수 가르기)
export function build(a, b, opt) {
  const aT = Math.floor(a / 10), aO = a % 10, bT = Math.floor(b / 10), bO = b % 10;
  const total = a + b, carry = aO + bO >= 10;
  const A = Array.from({ length: a }, (_, i) => 'a' + i), B = Array.from({ length: b }, (_, i) => 'b' + i);
  const aRows = chunk(A), bRows = chunk(B);
  const aTens = aRows.slice(0, aT), aOnes = aRows[aT] || [];
  const bTens = bRows.slice(0, bT), bOnes = bRows[bT] || [];

  const cubes = {}, rods = {}, labels = {};
  let formula = { top: '', main: '' };
  const S = [];
  const snap = (name, wait) => S.push(clone({ name, wait, cubes, rods, labels, formula }));
  const noDelay = () => { for (const k in cubes) cubes[k].d = 0; for (const k in rods) rods[k].d = 0; for (const k in labels) labels[k].d = 0; };
  const stag = n => Math.min(45, 1100 / Math.max(1, n));

  const initCol = (rows, x0, c) => rows.forEach((r, ri) => r.forEach((id, i) => {
    cubes[id] = { x: x0 + i * LP, y: BY + ri * RP, o: 0, s: .2, d: 0, c };
  }));
  initCol(aRows, LX, 'a'); initCol(bRows, RX, 'b');
  aTens.forEach((r, ri) => rods['ra' + ri] = { ...rodBox(LX, BY + ri * RP), o: 0, d: 0, ids: r });
  bTens.forEach((r, ri) => rods['rb' + ri] = { ...rodBox(RX, BY + ri * RP), o: 0, d: 0, ids: r });
  labels.hA = { x: LX + 217, y: BY - 70, t: String(a), o: 0, d: 0, cls: 'hdr a' };
  labels.hB = { x: RX + 217, y: BY - 70, t: String(b), o: 0, d: 0, cls: 'hdr b' };
  labels.plus = { x: W / 2, y: BY - 70, t: '+', o: 0, d: 0, cls: 'hdr plus' };

  // 1. 첫 번째 수
  A.forEach((id, i) => Object.assign(cubes[id], { o: 1, s: 1, d: i * stag(a) }));
  labels.hA.o = 1;
  formula = { top: '', main: `${a}` };
  snap('first', 1400 + a * stag(a));

  // 2. 두 번째 수
  noDelay();
  B.forEach((id, i) => Object.assign(cubes[id], { o: 1, s: 1, d: i * stag(b) }));
  labels.hB.o = 1; labels.plus.o = 1;
  formula = { top: '', main: `${a} + ${b}` };
  snap('second', 1400 + b * stag(b));

  const top = `${a} + ${b}`;
  const part = (T, O) => (T && O) ? `(${T * 10} + ${O})` : `${T * 10 || O}`;

  // 3. 10개씩 묶기
  if (aT || bT) {
    noDelay();
    const tighten = (rows, x0, key) => rows.forEach((r, ri) => {
      r.forEach((id, i) => { cubes[id].x = x0 + i * TP; cubes[id].d = ri * 140; });
      Object.assign(rods[key + ri], { o: 1, d: ri * 140 + 350 });
    });
    tighten(aTens, LX, 'ra'); tighten(bTens, RX, 'rb');
    formula = { top, main: opt.method === 'B' && carry ? `= ${a} + ${b}` : `= ${part(aT, aO)} + ${part(bT, bO)}` };
    snap('group', 1800 + Math.max(aT, bT) * 140);
  }

  let mRod = null, restIds = [], second = opt.split !== 'first';
  if (carry) {
    const dOnes = second ? bOnes : aOnes, rOnes = second ? aOnes : bOnes;
    const dX = second ? RX : LX, rX = second ? LX : RX;
    const dRow = second ? bT : aT, rRow = second ? aT : bT;
    const dNum = second ? b : a, rNum = second ? a : b;
    const need = 10 - rOnes.length;
    const moving = second ? dOnes.slice(0, need) : dOnes.slice(dOnes.length - need);
    restIds = second ? dOnes.slice(need) : dOnes.slice(0, dOnes.length - need);
    const rest = restIds.length;
    const hD = second ? 'hB' : 'hA', hR = second ? 'hA' : 'hB';
    const dy = BY + dRow * RP, ry = BY + rRow * RP;
    const tensTerms = [aT * 10, bT * 10];

    // 4. 가르기
    const doSplit = opt.method === 'B' ? dNum - need > 0 : rest > 0;
    if (doSplit) {
      noDelay();
      if (second) {
        moving.forEach((id, i) => cubes[id].x = dX + i * LP);
        restIds.forEach((id, i) => cubes[id].x = dX + (need + i) * LP + GAP);
      } else {
        restIds.forEach((id, i) => cubes[id].x = dX + i * LP);
        moving.forEach((id, i) => cubes[id].x = dX + (rest + i) * LP + GAP);
      }
      const mx0 = cubes[moving[0]].x, mx1 = cubes[moving[need - 1]].x + CUBE;
      labels.sM = { x: (mx0 + mx1) / 2, y: dy + CUBE + 10, t: String(need), o: 1, d: 350, cls: 'split ' + (second ? 'b' : 'a') };
      if (opt.method === 'A' && rest > 0) {
        const rx0 = cubes[restIds[0]].x, rx1 = cubes[restIds[rest - 1]].x + CUBE;
        labels.sR = { x: (rx0 + rx1) / 2, y: dy + CUBE + 10, t: String(rest), o: 1, d: 350, cls: 'split ' + (second ? 'b' : 'a') };
      }
      if (opt.method === 'B') labels[hD].t = second ? `${need} + ${dNum - need}` : `${dNum - need} + ${need}`;
      const main = opt.method === 'B'
        ? (second ? join([a, need, b - need]) : join([a - need, need, b]))
        : join([...tensTerms, ...(second ? [aO, need, rest] : [rest, need, bO])]);
      formula = { top, main: '= ' + main };
      snap('split', 1900);
    }

    // 5. 10 만들기 (옮기기)
    noDelay();
    for (const k in labels) if (k === 'sM' || k === 'sR') labels[k].o = 0;
    rOnes.forEach((id, i) => { cubes[id].x = rX + i * TP; cubes[id].d = 0; });
    moving.forEach((id, i) => Object.assign(cubes[id], { x: rX + (rOnes.length + i) * TP, y: ry, d: 150 + i * 110 }));
    restIds.forEach((id, i) => Object.assign(cubes[id], { x: dX + i * LP, d: 300 + need * 110 }));
    mRod = 'm';
    rods.m = { ...rodBox(rX, ry), o: 1, d: 450 + need * 110, ids: [...rOnes, ...moving], made: true };
    labels[hR].t = String(rNum + need);
    labels[hD].t = String(dNum - need);
    if (dNum - need === 0) labels[hD].o = 0;
    const main = opt.method === 'B'
      ? (second ? join([a + need, b - need]) : join([a - need, b + need]))
      : join([...tensTerms, ...(second ? [10, rest] : [rest, 10])]);
    formula = { top, main: '= ' + main };
    snap('make10', 2000 + need * 110);
  }

  // 6. 모두 모으기
  noDelay();
  const keyA = aTens.map((_, i) => 'ra' + i), keyB = bTens.map((_, i) => 'rb' + i);
  const order = !carry ? [...keyA, ...keyB]
    : (opt.method === 'B' && second) ? [...keyA, mRod, ...keyB] : [...keyA, ...keyB, mRod];
  const ones = carry ? restIds : [...aOnes, ...bOnes];
  // 낱개(1)가 먼저 맨 아래 자리로 내려가 자리를 잡고, 그다음 10 막대들이 위에서 차례로 자리를 잡는다
  const oy = BY + order.length * RP;
  ones.forEach((id, i) => Object.assign(cubes[id], { x: CX + i * LP, y: oy, d: i * 70, z: 3 }));
  const O = ones.length, rd = O ? O * 70 + 650 : 0;
  order.forEach((k, ri) => {
    const y = BY + ri * RP;
    rods[k].ids.forEach((id, i) => Object.assign(cubes[id], { x: CX + i * TP, y, d: rd + ri * 110 }));
    Object.assign(rods[k], rodBox(CX, y), { d: rd + ri * 110 });
  });
  const od = rd + order.length * 110 + 300;
  labels.hA.o = 0; labels.hB.o = 0; labels.plus.o = 0;
  const T = order.length * 10;
  if (T) labels.sumT = { x: CX + 9 * TP + CUBE + 66, y: BY + ((order.length - 1) * RP + CUBE) / 2, t: String(T), o: 1, d: od, cls: 'sum left' };
  if (O) labels.sumO = { x: CX + (O - 1) * LP + CUBE + 18, y: oy + CUBE / 2, t: String(O), o: 1, d: O * 70 + 400, cls: 'sum left' };
  let main = (T && O) ? `= ${T} + ${O}` : `= ${total}`;
  if (main === formula.main) main = `= ${total}`;
  formula = { top, main };
  const combineWait = od + 1500;
  if (main !== `= ${total}` || total === 100) {
    snap('combine', combineWait);
    noDelay();
    formula = { top, main: `= ${total}` };
  }
  // 7. 다 합친 수
  if (total === 100) {
    order.forEach((k, ri) => {
      const y = BY + ri * TP;
      rods[k].ids.forEach((id, i) => Object.assign(cubes[id], { y, d: ri * 60 }));
      Object.assign(rods[k], rodBox(CX, y), { o: 0, d: 0 });
    });
    if (labels.sumT) Object.assign(labels.sumT, { x: CX + 9 * TP + CUBE + 26, y: BY + (9 * TP + CUBE) / 2, t: '100', d: 700 });
    rods.sq = { x: CX - 6, y: BY - 6, w: 9 * TP + CUBE + 12, h: 9 * TP + CUBE + 12, o: 1, d: 650, ids: [], square: true };
  }
  snap('total', 2600);
  S[S.length - 1].final = true;
  // 이 문제에서 블록이 내려가는 가장 아래 위치 → 무대 높이
  let bottom = 0;
  S.forEach(s => {
    for (const k in s.cubes) bottom = Math.max(bottom, s.cubes[k].y + CUBE);
    for (const k in s.rods) if (s.rods[k].o) bottom = Math.max(bottom, s.rods[k].y + s.rods[k].h);
    for (const k in s.labels) if (s.labels[k].o) bottom = Math.max(bottom, s.labels[k].y + 50);
  });
  return { steps: S, carry, total, height: Math.max(420, Math.ceil(bottom + 30)) };
}

// ---------- 화면 ----------

export function renderAdd(root, ctx, query) {
  const a = parseInt(query.get('a'), 10), b = parseInt(query.get('b'), 10);
  if (validate(a, b)) return renderInput(root, ctx);
  return renderPlay(root, ctx, a, b);
}

// 입력 화면 상태: 풀이를 보고 돌아와도 그대로 남고, 홈으로 나가면 지운다
let inputState = null;
const freshInput = () => ({ vals: ['', '', ''], idx: 0, fresh: false, shown: false, result: null });
export function resetAddInput() { inputState = null; }

function randomPair() {
  let a, b;
  if (Math.random() < .4) { a = 1 + Math.floor(Math.random() * 9); b = 1 + Math.floor(Math.random() * 9); }
  else { a = 1 + Math.floor(Math.random() * 99); b = 1 + Math.floor(Math.random() * Math.min(99, 100 - a)); }
  return [a, b];
}

function renderInput(root, ctx) {
  const p = ctx.prefs;
  if (!inputState) inputState = freshInput();
  const st = inputState;
  st.result = null; // 결과 창은 다시 들어오면 닫혀 있게
  root.innerHTML = `
  <div class="screen add-input">
    <header class="bar">
      <button class="icon-btn back" data-go="" aria-label="처음으로">${ctx.icons.back}</button>
      <h2 class="bar-title">덧셈 배우기</h2>
      <div class="seg mode" data-pref="inputMode" role="group" aria-label="입력 방식">
        <button data-v="next">▶ 차례로</button><button data-v="expr">+ = 식으로</button>
      </div>
    </header>
    <div class="input-body">
      <div class="expr">
        <button class="nbox a" data-box="0"></button>
        <span class="op op-plus">+</span>
        <button class="nbox b" data-box="1"></button>
        <span class="op op-eq">=</span>
        <span class="ans-slot">
          <span class="qmark">?</span>
          <button class="nbox ans" data-box="2"></button>
        </span>
        <button class="check-btn">정답<br>확인</button>
      </div>
      <p class="warn" aria-live="polite"></p>
      <div class="keypad"></div>
      <div class="solve-bar">
        <button class="dice-btn" aria-label="아무 문제">🎲</button>
        <button class="solve-btn">풀이 보기</button>
        <div class="solve-opts">
          <div class="seg" data-pref="method" role="group" aria-label="방법"><button data-v="A">자리별로</button><button data-v="B">10 채우기</button></div>
          <div class="seg" data-pref="split" role="group" aria-label="가르는 수"><button data-v="second">뒤 수 가르기</button><button data-v="first">앞 수 가르기</button></div>
        </div>
      </div>
    </div>
    <div class="result-ov" hidden>
      <div class="result-card">
        <div class="r-emoji"></div>
        <div class="r-msg"></div>
        <div class="r-btns"></div>
      </div>
      <div class="confetti"></div>
    </div>
  </div>`;

  const $ = q => root.querySelector(q);
  const boxes = root.querySelectorAll('.nbox'), warn = $('.warn'), pad = $('.keypad');
  const num = i => parseInt(st.vals[i], 10);
  const pairErr = () => validate(num(0), num(1));

  const drawPad = () => {
    const keys = p.inputMode === 'expr'
      ? ['1', '2', '3', 'del', '4', '5', '6', '+', '7', '8', '9', '=', '', '0', '', '']
      : ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'next', '0', 'del'];
    const label = { del: '⌫', next: '▶', '+': '+', '=': '=' };
    pad.className = 'keypad ' + (p.inputMode === 'expr' ? 'k4' : 'k3');
    pad.innerHTML = keys.map(k => k === '' ? '<span></span>'
      : `<button class="key${label[k] ? ' fn' : ''}${k === 'next' ? ' nextk' : ''}" data-k="${k}" aria-label="${k === 'del' ? '지우기' : k === 'next' ? '다음 칸' : k}">${label[k] || k}</button>`).join('');
  };

  const draw = () => {
    boxes.forEach((bx, i) => {
      bx.textContent = st.vals[i] || '';
      bx.classList.toggle('on', i === st.idx && !st.result);
      bx.classList.toggle('fresh', i === st.idx && st.fresh && !!st.vals[i]);
    });
    const root2 = $('.expr');
    root2.classList.toggle('shown', st.shown);
    $('.op-plus').classList.toggle('dim', st.idx < 1 && !st.vals[1]);
    $('.op-eq').classList.toggle('dim', !st.shown);
    const err = st.vals[0] && st.vals[1] ? pairErr() : '';
    warn.textContent = err === 'over' ? '두 수를 더해서 100까지만 돼요' : err === 'zero' ? '0은 빼고 넣어 주세요' : '';
    boxes[0].classList.toggle('bad', err === 'over'); boxes[1].classList.toggle('bad', err === 'over');
    $('.check-btn').disabled = !st.shown || !st.vals[2] || !!pairErr();
    $('.solve-btn').disabled = !!pairErr();
    const nx = pad.querySelector('[data-k="next"]');
    if (nx) nx.disabled = st.idx === 2 || !st.vals[st.idx];
    root.querySelectorAll('[data-pref]').forEach(sg => sg.querySelectorAll('button').forEach(bt =>
      bt.classList.toggle('on', p[sg.dataset.pref] === bt.dataset.v)));
  };

  const shake = () => {
    const bx = boxes[st.idx]; bx.classList.remove('nudge'); void bx.offsetWidth; bx.classList.add('nudge');
  };
  const clearAnswer = () => { st.vals[2] = ''; st.shown = false; };
  // 다음 칸으로: 지금 칸이 비어 있으면 못 넘어감, 둘째 수 다음은 합이 100 이하일 때만 답 칸
  const advance = () => {
    if (!st.vals[st.idx]) return shake();
    if (st.idx === 0) { st.idx = 1; st.fresh = false; return; }
    if (st.idx === 1) {
      if (pairErr()) return shake();
      st.idx = 2; st.shown = true; st.fresh = false;
    }
  };

  const onKey = v => {
    if (v === 'next') advance();
    else if (v === '+') { if (st.idx === 0) advance(); else shake(); }
    else if (v === '=') { if (st.idx === 1) advance(); else shake(); }
    else if (v === 'del') {
      const cur = st.vals[st.idx];
      if (cur && !st.fresh) { st.vals[st.idx] = cur.slice(0, -1); if (st.idx < 2) clearAnswer(); }
      else if (cur && st.fresh) { st.vals[st.idx] = ''; if (st.idx < 2) clearAnswer(); }
      else if (st.idx > 0) { if (st.idx === 2) st.shown = false; st.idx--; }
      st.fresh = false;
    } else {
      let cur = st.fresh ? '' : st.vals[st.idx];
      if (cur === '0') cur = '';
      const max = st.idx < 2 ? 2 : 3;
      if (cur.length >= max) return shake();
      cur += v;
      st.vals[st.idx] = cur; st.fresh = false;
      if (st.idx < 2) {
        clearAnswer();
        if (cur.length === 2) {
          if (st.idx === 0 || !pairErr()) advance();
        }
      }
    }
  };

  pad.addEventListener('click', e => {
    const k = e.target.closest('.key'); if (!k || k.disabled) return;
    onKey(k.dataset.k); draw();
  });
  $('.expr').addEventListener('click', e => {
    const bx = e.target.closest('.nbox');
    if (bx) { const i = +bx.dataset.box; if (i === 2 && !st.shown) return; st.idx = i; st.fresh = true; draw(); return; }
    if (e.target.closest('.check-btn')) check();
  });
  $('.dice-btn').addEventListener('click', () => {
    const [a, b] = randomPair();
    st.vals = [String(a), String(b), '']; st.idx = 2; st.shown = true; st.fresh = false;
    draw();
  });
  const goSolve = () => {
    if (pairErr()) return;
    p.lastA = num(0); p.lastB = num(1); ctx.save();
    ctx.go(`add?a=${num(0)}&b=${num(1)}`);
  };
  $('.solve-btn').addEventListener('click', goSolve);
  root.querySelectorAll('[data-pref]').forEach(sg => sg.addEventListener('click', e => {
    const bt = e.target.closest('button'); if (!bt) return;
    p[sg.dataset.pref] = bt.dataset.v; ctx.save();
    if (sg.dataset.pref === 'inputMode') drawPad();
    draw();
  }));

  // ---------- 정답 확인 ----------
  const ov = $('.result-ov'), confetti = ov.querySelector('.confetti');
  const closeOv = () => { ov.hidden = true; ov.className = 'result-ov'; st.result = null; };
  const check = () => {
    if (!st.shown || !st.vals[2] || pairErr()) return;
    const ok = num(2) === num(0) + num(1);
    st.result = ok ? 'ok' : 'no';
    ov.className = 'result-ov ' + (ok ? 'ok' : 'no');
    ov.querySelector('.r-emoji').textContent = ok ? '🎉' : '😢';
    ov.querySelector('.r-msg').textContent = ok ? '정답입니다!' : '틀렸습니다';
    ov.querySelector('.r-btns').innerHTML = ok
      ? '<button class="rb new">다른 문제</button><button class="rb solve">풀이 보기</button>'
      : '<button class="rb retry">다시 풀기</button><button class="rb solve main">풀이 보기</button>';
    ov.hidden = false;
    confetti.innerHTML = '';
    if (ok) burst(confetti, 40, 520);
    draw();
  };
  ov.addEventListener('click', e => {
    const bt = e.target.closest('.rb'); if (!bt) return;
    if (bt.classList.contains('solve')) { closeOv(); goSolve(); }
    else if (bt.classList.contains('retry')) { closeOv(); st.vals[2] = ''; st.idx = 2; st.fresh = false; draw(); }
    else if (bt.classList.contains('new')) { closeOv(); Object.assign(st, freshInput()); draw(); }
  });

  drawPad();
  draw();
  window.__input = { st, check }; // 테스트용
}

// 색종이 터뜨리기 (덧셈 풀이·정답 확인 같이 씀)
function burst(box, n = 26, spread = 420) {
  box.innerHTML = '';
  const colors = ['#FF7A8A', '#FFC93C', '#5CC8A0', '#6FA8FF', '#B78CFF'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i');
    const ang = Math.random() * Math.PI * 2, dist = spread * (.35 + Math.random() * .65);
    s.style.setProperty('--tx', `${Math.cos(ang) * dist}px`);
    s.style.setProperty('--ty', `${Math.sin(ang) * dist * .7}px`);
    s.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 200}ms`;
    box.appendChild(s);
  }
}

function renderPlay(root, ctx, a, b) {
  const p = ctx.prefs;
  root.innerHTML = `
  <div class="screen add-play">
    <header class="bar">
      <button class="icon-btn back" data-go="add" aria-label="문제 바꾸기">${ctx.icons.back}</button>
      <div class="opts">
        <div class="seg" data-opt="method" role="group" aria-label="방법">
          <button data-v="A">자리별로</button><button data-v="B">10 채우기</button>
        </div>
        <div class="seg" data-opt="split" role="group" aria-label="가르는 수">
          <button data-v="second">뒤 수 가르기</button><button data-v="first">앞 수 가르기</button>
        </div>
      </div>
    </header>
    <div class="stage-wrap"><div class="stage">
      <div class="formula"><div class="f-top"></div><div class="f-main"></div></div>
      <div class="layer"></div>
      <div class="confetti"></div>
    </div></div>
    <div class="dots"></div>
    <nav class="ctrl">
      <button class="cbtn" data-c="restart" aria-label="처음부터">${ctx.icons.restart}</button>
      <button class="cbtn" data-c="prev" aria-label="이전">${ctx.icons.prev}</button>
      <button class="cbtn main" data-c="next" aria-label="다음">${ctx.icons.next}</button>
      <button class="cbtn auto" data-c="auto" aria-label="자동">${ctx.icons.play}<span>자동</span></button>
    </nav>
  </div>`;

  const stage = root.querySelector('.stage'), wrap = root.querySelector('.stage-wrap');
  const layer = root.querySelector('.layer');
  const fTop = root.querySelector('.f-top'), fMain = root.querySelector('.f-main');
  const dotsEl = root.querySelector('.dots'), confetti = root.querySelector('.confetti');
  let plan, idx = -1, auto = false, timer = 0;
  const els = {};

  const fit = () => {
    const r = wrap.getBoundingClientRect();
    const h = plan ? plan.height : H;
    const k = Math.min(r.width / W, r.height / h);
    stage.style.height = h + 'px';
    stage.style.transform = `translate(${(r.width - W * k) / 2}px, ${Math.max(0, (r.height - h * k) / 2)}px) scale(${k})`;
  };
  const ro = new ResizeObserver(fit); ro.observe(wrap);

  const setup = () => {
    plan = build(a, b, { method: p.method, split: p.split });
    layer.innerHTML = ''; for (const k in els) delete els[k];
    const s0 = plan.steps[0];
    // 블록 → 막대 테두리 → 글자 순으로 쌓는다
    Object.keys(s0.cubes).forEach(id => { const d = document.createElement('div'); d.className = 'cube ' + s0.cubes[id].c; layer.appendChild(d); els['c:' + id] = d; });
    const rodKeys = new Set(); plan.steps.forEach(s => Object.keys(s.rods).forEach(k => rodKeys.add(k)));
    rodKeys.forEach(k => { const d = document.createElement('div'); d.className = 'rod' + (k === 'sq' ? ' square' : '') + (k === 'm' ? ' made' : ''); d.innerHTML = `<span>${k === 'sq' ? '' : '10'}</span>`; layer.appendChild(d); els['r:' + k] = d; });
    const labKeys = new Set(); plan.steps.forEach(s => Object.keys(s.labels).forEach(k => labKeys.add(k)));
    labKeys.forEach(k => { const d = document.createElement('div'); d.className = 'lbl'; d.innerHTML = '<span></span>'; layer.appendChild(d); els['l:' + k] = d; });
    dotsEl.innerHTML = plan.steps.map(() => '<i></i>').join('');
    root.querySelectorAll('.seg button').forEach(bt => bt.disabled = !plan.carry);
    root.querySelectorAll('.opts').forEach(o => o.classList.toggle('dim', !plan.carry));
    idx = -1;
    fit();
    paint(null, true);
  };

  // 스냅숏 그리기 (s가 null이면 아무것도 없는 상태)
  const paint = (s, instant) => {
    layer.classList.toggle('instant', !!instant);
    const ref = s || plan.steps[0];
    for (const id in ref.cubes) {
      const c = ref.cubes[id], d = els['c:' + id];
      const o = s ? c.o : 0, sc = s ? c.s : .2;
      d.style.transitionDelay = instant ? '0ms' : `${c.d}ms`;
      d.style.transform = `translate(${c.x}px, ${c.y}px) scale(${sc})`;
      d.style.opacity = o;
      d.style.zIndex = (s && c.z) || '';
    }
    for (const k in els) {
      if (k.startsWith('r:')) {
        const r = s && s.rods[k.slice(2)], d = els[k];
        if (r) {
          d.style.transitionDelay = instant ? '0ms' : `${r.d}ms`;
          d.style.transform = `translate(${r.x}px, ${r.y}px)`;
          d.style.width = r.w + 'px'; d.style.height = r.h + 'px';
          d.style.opacity = r.o;
        } else { d.style.transitionDelay = '0ms'; d.style.opacity = 0; }
      } else if (k.startsWith('l:')) {
        const l = s && s.labels[k.slice(2)], d = els[k];
        if (l) {
          d.className = 'lbl ' + (l.cls || '');
          d.firstChild.textContent = l.t;
          d.style.transitionDelay = instant ? '0ms' : `${l.d}ms`;
          d.style.transform = `translate(${l.x}px, ${l.y}px)`;
          d.style.opacity = l.o;
        } else { d.style.transitionDelay = '0ms'; d.style.opacity = 0; }
      }
    }
    fTop.textContent = s ? s.formula.top : '';
    fMain.textContent = s ? s.formula.main : '';
    fMain.classList.remove('pop'); void fMain.offsetWidth; if (s) fMain.classList.add('pop');
    stage.classList.toggle('final', !!(s && s.final));
    if (s && s.final && !instant) burstHere();
    [...dotsEl.children].forEach((d, i) => d.classList.toggle('on', i <= idx));
    root.querySelector('[data-c="prev"]').disabled = idx < 0;
    root.querySelector('[data-c="restart"]').disabled = idx < 0;
    root.querySelector('[data-c="next"]').disabled = idx >= plan.steps.length - 1;
  };

  const burstHere = () => burst(confetti);

  const go = (n, instant = false) => {
    idx = Math.max(-1, Math.min(plan.steps.length - 1, n));
    paint(idx < 0 ? null : plan.steps[idx], instant);
  };
  const stopAuto = () => { auto = false; clearTimeout(timer); root.querySelector('.auto').classList.remove('on'); root.querySelector('.auto').innerHTML = `${ctx.icons.play}<span>자동</span>`; };
  const tick = () => {
    if (!auto) return;
    if (idx >= plan.steps.length - 1) { stopAuto(); return; }
    go(idx + 1);
    timer = setTimeout(tick, plan.steps[idx].wait);
  };
  const startAuto = () => {
    auto = true; root.querySelector('.auto').classList.add('on');
    root.querySelector('.auto').innerHTML = `${ctx.icons.pause}<span>멈춤</span>`;
    if (idx >= plan.steps.length - 1) go(-1, true);
    timer = setTimeout(tick, idx < 0 ? 200 : 300);
  };

  root.querySelector('.ctrl').addEventListener('click', e => {
    const bt = e.target.closest('.cbtn'); if (!bt || bt.disabled) return;
    const c = bt.dataset.c;
    if (c === 'auto') { auto ? stopAuto() : startAuto(); return; }
    stopAuto();
    if (c === 'next') go(idx + 1);
    else if (c === 'prev') go(idx - 1);
    else if (c === 'restart') go(-1, true);
  });

  const markOpts = () => root.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(bt =>
    bt.classList.toggle('on', p[sg.dataset.opt] === bt.dataset.v)));
  root.querySelector('.opts').addEventListener('click', e => {
    const bt = e.target.closest('.seg button'); if (!bt || bt.disabled) return;
    const key = bt.closest('.seg').dataset.opt;
    if (p[key] === bt.dataset.v) return;
    p[key] = bt.dataset.v; ctx.save(); markOpts();
    stopAuto();
    // 방법을 바꾸면 처음(빈 화면)부터 다시
    setup();
  });

  markOpts();
  setup();
  requestAnimationFrame(fit);
  window.__add = { go: n => go(n, true), steps: () => plan.steps, idx: () => idx }; // 테스트용
  return () => { stopAuto(); ro.disconnect(); };
}
