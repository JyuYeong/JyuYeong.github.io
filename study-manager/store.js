// Study Manager 데이터 모델 + IndexedDB 저장 (M1: 이 기기에만 저장)
const DB_NAME = 'study-manager';
const STORE = 'kv';
const KEY = 'doc';
const ID_CHARS = '23456789abcdefghjkmnpqrstuvwxyz';
export const SCHEMA_VERSION = 1;
export const PURGE_DAYS = 180;
export const MAX_TEXT = 1000;
export const MAX_NOTE = 4000;

// ---------- 공통 ----------
export const nowIso = () => new Date().toISOString();
function randId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return prefix + Array.from(bytes, b => ID_CHARS[b % ID_CHARS.length]).join('');
}
export function uniqueId(prefix, arr) {
  const used = new Set((arr || []).map(x => x.id));
  let id;
  do { id = randId(prefix); } while (used.has(id));
  return id;
}
const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
export const cmpText = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));
export const live = arr => (arr || []).filter(x => x && !x.deleted_at);
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || cmpText(a.name, b.name);

export function emptyDoc() {
  return { schema_version: SCHEMA_VERSION, updated_at: nowIso(), sentences: [], units: [], tags: [], progress: [], settings: [] };
}
// 빠진 배열을 채운다 (모르는 키는 그대로 둔다)
export function normalizeDoc(d) {
  const base = emptyDoc();
  for (const k of Object.keys(base)) if (Array.isArray(base[k]) && !Array.isArray(d[k])) d[k] = [];
  d.schema_version = Math.max(d.schema_version || 1, SCHEMA_VERSION);
  for (const s of d.sentences) if (!Array.isArray(s.tag_ids)) s.tag_ids = [];
  return d;
}
export function todayKst(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// =====================================================================
// 빈칸 표기: {답}, {답|힌트}, \{ \} 는 글자 그대로
// =====================================================================
// 문장을 조각으로 나눈다: [{ t: 'text', s }, { t: 'blank', ans, hint }]
export function parse(text) {
  const src = String(text ?? '');
  const out = [];
  let buf = '';
  const pushText = s => { if (!s) return; const last = out[out.length - 1]; if (last && last.t === 'text') last.s += s; else out.push({ t: 'text', s }); };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\' && (src[i + 1] === '{' || src[i + 1] === '}')) { buf += src[i + 1]; i++; continue; }
    if (ch === '{') {
      // 닫는 괄호 찾기 (안쪽의 \} 는 글자)
      let j = i + 1, inner = '', ok = false;
      for (; j < src.length; j++) {
        if (src[j] === '\\' && (src[j + 1] === '{' || src[j + 1] === '}')) { inner += src[j + 1]; j++; continue; }
        if (src[j] === '{') break;
        if (src[j] === '}') { ok = true; break; }
        inner += src[j];
      }
      const bar = inner.indexOf('|');
      const ans = (bar < 0 ? inner : inner.slice(0, bar));
      const hint = bar < 0 ? '' : inner.slice(bar + 1).trim();
      if (ok && ans.trim()) {
        pushText(buf); buf = '';
        out.push({ t: 'blank', ans, hint });
        i = j;
        continue;
      }
      buf += ch; // 짝이 없거나 빈 괄호는 글자 그대로
      continue;
    }
    buf += ch;
  }
  pushText(buf);
  return out;
}
const escText = s => String(s).replace(/[{}]/g, c => '\\' + c);
export function stringify(segs) {
  return segs.map(g => (g.t === 'text' ? escText(g.s) : `{${escText(g.ans).replace(/\|/g, '｜')}${g.hint ? '|' + escText(g.hint) : ''}}`)).join('');
}
export const plainOf = text => parse(text).map(g => (g.t === 'text' ? g.s : g.ans)).join('');
export const blanksOf = text => parse(text).filter(g => g.t === 'blank');
// 중복 판단용: 공백·대소문자·문장부호 차이 무시
export const normKey = text => plainOf(text).normalize('NFC').toLowerCase().replace(/[\s.,!?·…"'“”‘’()[\]]/g, '');

// ---------- 초성 ----------
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CHO_SET = new Set([...CHO]);
export function choOf(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    out += c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch;
  }
  return out;
}
export const isCho = t => t.length > 0 && [...t].every(ch => CHO_SET.has(ch));
// 문제 모드 초성 힌트: 한글은 첫 자음, 영문·숫자는 단어마다 첫 글자만 남기고 나머지는 _, 기호·공백은 그대로
export function choHint(ans) {
  let out = '', inWord = false;
  for (const ch of String(ans)) {
    const c = ch.codePointAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) { out += CHO[Math.floor((c - 0xAC00) / 588)]; inWord = false; }
    else if (/[A-Za-z0-9]/.test(ch)) { out += inWord ? '_' : ch; inWord = true; }
    else { out += ch; inWord = false; }
  }
  return out;
}

// ---------- 단어 칩 (등록 화면) ----------
// 끝에 붙는 조사·어미 (긴 것부터). 떼고 남는 부분이 2글자 이상일 때만 뗀다
const JOSA = ['이라는', '이라고', '입니다', '에서는', '에서도', '에게서', '으로써', '으로서', '으로는', '으로도', '이었다', '하였다', '되었다',
  '에서', '에게', '한테', '으로', '로써', '로서', '로는', '까지', '부터', '처럼', '보다', '이나', '이란', '이며', '이고', '이다', '이라', '라는', '라고',
  '에는', '에도', '와는', '과는', '하는', '하다', '한다', '하고', '하여', '해서', '했다', '하며', '하면', '된다', '되는', '되어', '됐다', '이자',
  '은', '는', '이', '가', '을', '를', '의', '에', '로', '와', '과', '도', '만', '란', '랑', '며', '고', '다', '한', '된', '할', '될'];
const TAIL_PUNCT = /[.,!?;:·…"'”’)\]」』]+$/u;
const HEAD_PUNCT = /^["'“‘(\[「『]+/u;
// 단어 하나에서 빈칸으로 쓸 핵심 범위 [시작, 끝)을 돌려준다 (단어 안 위치)
export function coreRange(word) {
  const head = (word.match(HEAD_PUNCT) || [''])[0].length;
  let end = word.length - (word.slice(head).match(TAIL_PUNCT) || [''])[0].length;
  const fullEnd = end;
  const body = word.slice(head, end);
  for (const j of JOSA) {
    if (body.length - j.length >= 2 && body.endsWith(j)) { end = head + body.length - j.length; break; }
  }
  return { core: [head, end], full: [head, fullEnd] };
}
// 문장을 글자 배열 + 글자별 빈칸 표시로 바꾼다 (칩 편집용)
export function toMask(text) {
  const segs = parse(text);
  let plain = '';
  const mask = [];
  const hints = new Map();
  let n = 0;
  for (const g of segs) {
    if (g.t === 'text') { for (const ch of g.s) { plain += ch; mask.push(0); } }
    else { n++; if (g.hint) hints.set(g.ans, g.hint); for (const ch of g.ans) { plain += ch; mask.push(n); } }
  }
  return { chars: [...plain], mask, hints };
}
export function fromMask(chars, mask, hints = new Map()) {
  const segs = [];
  let i = 0;
  while (i < chars.length) {
    if (!mask[i]) {
      let s = '';
      while (i < chars.length && !mask[i]) s += chars[i++];
      segs.push({ t: 'text', s });
    } else {
      const id = mask[i];
      let s = '';
      while (i < chars.length && mask[i] === id) s += chars[i++];
      segs.push({ t: 'blank', ans: s, hint: hints.get(s) || '' });
    }
  }
  return stringify(segs);
}
// 띄어쓰기로 단어를 나누고, 각 단어의 상태(none/core/full/part)를 붙인다
export function wordsOf(text) {
  const { chars, mask } = toMask(text);
  const words = [];
  let i = 0;
  while (i < chars.length) {
    if (/\s/.test(chars[i])) { i++; continue; }
    const st = i;
    while (i < chars.length && !/\s/.test(chars[i])) i++;
    const w = chars.slice(st, i).join('');
    const { core, full } = coreRange(w);
    const m = mask.slice(st, i);
    const on = k => !!m[k];
    const rangeOn = ([a, b]) => { for (let k = 0; k < m.length; k++) if (on(k) !== (k >= a && k < b)) return false; return true; };
    const coreDiff = core[0] !== full[0] || core[1] !== full[1];
    let state = 'none';
    if (m.some(Boolean)) state = coreDiff && rangeOn(core) ? 'core' : rangeOn(full) ? 'full' : 'part';
    words.push({ start: st, end: i, text: w, core, full, state, coreDiff, m: m.map(Boolean) });
  }
  return words;
}
// 단어 칩을 눌렀을 때: none → core → full → none (조사가 없으면 none → full → none, 일부만 빈칸이면 → none)
export function toggleWord(text, index) {
  const { chars, mask, hints } = toMask(text);
  const words = wordsOf(text);
  const w = words[index];
  if (!w) return text;
  const next = { none: w.coreDiff ? 'core' : 'full', core: 'full', full: 'none', part: 'none' }[w.state];
  for (let k = w.start; k < w.end; k++) mask[k] = 0;
  if (next !== 'none') {
    const [a, b] = next === 'core' ? w.core : w.full;
    for (let k = w.start + a; k < w.start + b; k++) mask[k] = -1;
  }
  // 번호를 다시 매긴다. 앞 단어와 공백 하나로만 떨어져 있고, 양쪽이 단어 전체 빈칸이면 하나로 합친다
  return fromMask(chars, renumber(chars, mask, words, index, next), hints);
}
function renumber(chars, mask, words, changed, nextState) {
  const out = new Array(mask.length).fill(0);
  const wordAt = new Map();
  words.forEach((w, i) => { for (let k = w.start; k < w.end; k++) wordAt.set(k, i); });
  const stateOf = i => (i === changed ? nextState : words[i].state);
  let id = 0;
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k]) continue;
    const prevMasked = k > 0 && mask[k - 1];
    if (prevMasked) { out[k] = id; continue; }
    // 공백 하나 건너 앞 단어 끝이 빈칸이면, 두 단어가 모두 '단어 끝까지' 빈칸일 때만 합친다
    if (k >= 2 && /\s/.test(chars[k - 1]) && mask[k - 2] && !/\s/.test(chars[k - 2])) {
      const a = wordAt.get(k - 2), b = wordAt.get(k);
      const endsAtWordEnd = a != null && words[a].start + words[a].full[1] === k - 1 && stateOf(a) === 'full';
      const startsAtWordStart = b != null && words[b].start + words[b].full[0] === k && stateOf(b) !== 'none';
      if ((a === changed || b === changed) && endsAtWordEnd && startsAtWordStart) { out[k - 1] = id; out[k] = id; continue; }
    }
    out[k] = ++id;
  }
  return out;
}
// 선택 범위 [a, b)를 {}로 감싼다 (원문 기준 위치). 이미 빈칸 안이면 그대로
export function wrapRange(text, a, b) {
  if (a > b) [a, b] = [b, a];
  let sel = text.slice(a, b);
  const lead = sel.length - sel.trimStart().length, trail = sel.length - sel.trimEnd().length;
  a += lead; b -= trail; sel = text.slice(a, b);
  if (!sel || /[{}]/.test(sel)) return null;
  return { text: text.slice(0, a) + '{' + sel + '}' + text.slice(b), caret: b + 2 };
}

// =====================================================================
// 과목·단원 (2단계)
// =====================================================================
export const subjectsOf = (doc, { archived = false } = {}) => live(doc.units).filter(u => !u.parent_id && (archived || !u.archived)).sort(byOrder);
export const chaptersOf = (doc, parentId, { archived = false } = {}) => live(doc.units).filter(u => u.parent_id === parentId && (archived || !u.archived)).sort(byOrder);
export const unitById = (doc, id) => (id ? live(doc.units).find(u => u.id === id) || null : null);
// 문장의 과목·단원 이름 [과목, 단원]
export function unitPath(doc, id) {
  const u = unitById(doc, id);
  if (!u) return [];
  if (!u.parent_id) return [u];
  const p = unitById(doc, u.parent_id);
  return p ? [p, u] : [u];
}
export function addUnit(doc, name, parentId = null) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { error: '이름을 입력하세요' };
  if (parentId && !live(doc.units).some(u => u.id === parentId && !u.parent_id)) return { error: '과목이 없습니다' };
  const sib = live(doc.units).filter(u => (u.parent_id || null) === parentId);
  if (sib.some(u => u.name.toLowerCase() === name.toLowerCase())) return { error: parentId ? '같은 이름의 단원이 있습니다' : '같은 이름의 과목이 있습니다' };
  const ts = nowIso();
  const order = Math.max(-1, ...sib.map(u => u.order ?? 0)) + 1;
  const u = { id: uniqueId('U-', doc.units), name, parent_id: parentId, order, archived: false, created_at: ts, updated_at: ts, deleted_at: null };
  doc.units.push(u);
  return { item: u };
}
export function renameUnit(doc, u, name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { error: '이름을 입력하세요' };
  if (live(doc.units).some(x => x.id !== u.id && (x.parent_id || null) === (u.parent_id || null) && x.name.toLowerCase() === name.toLowerCase())) return { error: '같은 이름이 있습니다' };
  if (u.name !== name) { u.name = name; u.updated_at = nowIso(); }
  return { item: u };
}
export function setArchived(item, on) { if (!!item.archived !== on) { item.archived = on; item.updated_at = nowIso(); } }
// 같은 단계 안에서 순서를 한 칸 옮긴다 (dir: -1 위, +1 아래)
export function moveItem(list, item, dir) {
  const i = list.indexOf(item), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  const ts = nowIso();
  list.forEach((x, k) => { if (x.order !== k) { x.order = k; x.updated_at = ts; } });
  [list[i].order, list[j].order] = [j, i];
  list[i].updated_at = ts; list[j].updated_at = ts;
  return true;
}
// 과목(또는 단원)에 들어 있는 문장 수. 과목은 그 아래 단원의 문장까지 센다
export function unitCount(doc, u) {
  const ids = new Set([u.id, ...(u.parent_id ? [] : chaptersOf(doc, u.id, { archived: true }).map(c => c.id))]);
  return live(doc.sentences).filter(s => ids.has(s.unit_id)).length;
}
// 단원 삭제: 그 문장들은 과목으로 올린다. 과목 삭제: 문장이 있으면 거부(보관 안내), 없으면 단원과 함께 지운다
export function deleteUnit(doc, u) {
  const ts = nowIso();
  if (u.parent_id) {
    for (const s of live(doc.sentences)) if (s.unit_id === u.id) { s.unit_id = u.parent_id; s.updated_at = ts; }
  } else {
    if (unitCount(doc, u)) return { error: '문장이 들어 있어 지울 수 없습니다. 문장을 옮기거나 대신 보관하세요' };
    for (const c of live(doc.units)) if (c.parent_id === u.id) { c.deleted_at = ts; c.updated_at = ts; }
  }
  u.deleted_at = ts; u.updated_at = ts;
  return { ok: true };
}

// =====================================================================
// 태그
// =====================================================================
export const tagsOf = doc => live(doc.tags).sort(byOrder);
export const tagById = (doc, id) => live(doc.tags).find(t => t.id === id) || null;
export const normTag = s => String(s || '').trim().replace(/^#+/, '').replace(/\s+/g, ' ').slice(0, 30);
export function addTag(doc, name) {
  name = normTag(name);
  if (!name) return { error: '이름을 입력하세요' };
  if (live(doc.tags).some(t => t.name.toLowerCase() === name.toLowerCase())) return { error: '같은 이름의 태그가 있습니다' };
  const ts = nowIso();
  const order = Math.max(-1, ...live(doc.tags).map(t => t.order ?? 0)) + 1;
  const t = { id: uniqueId('T-', doc.tags), name, order, created_at: ts, updated_at: ts, deleted_at: null };
  doc.tags.push(t);
  return { item: t };
}
export function renameTag(doc, t, name) {
  name = normTag(name);
  if (!name) return { error: '이름을 입력하세요' };
  if (live(doc.tags).some(x => x.id !== t.id && x.name.toLowerCase() === name.toLowerCase())) return { error: '같은 이름이 있습니다' };
  if (t.name !== name) { t.name = name; t.updated_at = nowIso(); }
  return { item: t };
}
export const tagCount = (doc, t) => live(doc.sentences).filter(s => s.tag_ids.includes(t.id)).length;
// 태그 삭제: 문장에서 떼어 낸다
export function deleteTag(doc, t) {
  const ts = nowIso();
  for (const s of live(doc.sentences)) if (s.tag_ids.includes(t.id)) { s.tag_ids = s.tag_ids.filter(x => x !== t.id); s.updated_at = ts; }
  t.deleted_at = ts; t.updated_at = ts;
  return { ok: true };
}

// =====================================================================
// 문장
// =====================================================================
export const sentenceById = (doc, id) => live(doc.sentences).find(s => s.id === id) || null;
function cleanSentence(doc, f) {
  const text = String(f.text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_TEXT);
  const note = String(f.note ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_NOTE);
  const unit_id = f.unit_id && unitById(doc, f.unit_id) ? f.unit_id : null;
  const tag_ids = [...new Set((f.tag_ids || []).filter(id => tagById(doc, id)))];
  return { text, note, unit_id, tag_ids, starred: !!f.starred };
}
// 같은 문장(공백·문장부호 무시)이 이미 있는지
export function findDuplicate(doc, text, exceptId = null) {
  const k = normKey(text);
  if (!k) return null;
  return live(doc.sentences).find(s => s.id !== exceptId && normKey(s.text) === k) || null;
}
export function saveSentence(doc, f, id = null) {
  const fields = cleanSentence(doc, f);
  if (!plainOf(fields.text).trim()) return { error: '문장을 입력하세요' };
  const ts = nowIso();
  let s = id ? sentenceById(doc, id) : null;
  if (s) {
    const changed = ['text', 'note', 'unit_id', 'starred'].some(k => (s[k] ?? null) !== (fields[k] ?? null)) || s.tag_ids.join() !== fields.tag_ids.join();
    if (changed) Object.assign(s, fields, { updated_at: ts });
  } else {
    s = { id: uniqueId('S-', doc.sentences), ...fields, created_at: ts, updated_at: ts, deleted_at: null };
    doc.sentences.push(s);
  }
  return { item: s };
}
export function deleteSentences(doc, ids) {
  const ts = nowIso(), set = new Set(ids);
  for (const s of live(doc.sentences)) if (set.has(s.id)) { s.deleted_at = ts; s.updated_at = ts; }
}
export function setUnitMany(doc, ids, unitId) {
  const ts = nowIso(), set = new Set(ids);
  const u = unitId && unitById(doc, unitId) ? unitId : null;
  let n = 0;
  for (const s of live(doc.sentences)) if (set.has(s.id) && (s.unit_id || null) !== u) { s.unit_id = u; s.updated_at = ts; n++; }
  return n;
}
export function tagMany(doc, ids, tagId, on) {
  const ts = nowIso(), set = new Set(ids);
  let n = 0;
  for (const s of live(doc.sentences)) {
    if (!set.has(s.id)) continue;
    const has = s.tag_ids.includes(tagId);
    if (on && !has) { s.tag_ids = [...s.tag_ids, tagId]; s.updated_at = ts; n++; }
    if (!on && has) { s.tag_ids = s.tag_ids.filter(x => x !== tagId); s.updated_at = ts; n++; }
  }
  return n;
}

// ---------- 여러 줄 붙여넣기 ----------
// 한 줄에 한 문장, '>>' 뒤는 보충설명. 빈 줄은 건너뛴다
export function parsePaste(doc, raw) {
  const seen = new Set();
  const rows = [];
  for (const line of String(raw ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim()) continue;
    const at = line.indexOf('>>');
    const text = (at < 0 ? line : line.slice(0, at)).trim().slice(0, MAX_TEXT);
    const note = at < 0 ? '' : line.slice(at + 2).trim().slice(0, MAX_NOTE);
    if (!plainOf(text).trim()) { rows.push({ text, note, bad: true, blanks: 0 }); continue; }
    const k = normKey(text);
    const dup = findDuplicate(doc, text) ? 'saved' : seen.has(k) ? 'paste' : null;
    seen.add(k);
    rows.push({ text, note, dup, blanks: blanksOf(text).length });
  }
  return rows;
}

// ---------- 검색·범위 ----------
const norm = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
export function matchText(s, q) {
  const qq = norm(q);
  if (!qq) return true;
  const plain = plainOf(s.text);
  if (norm(plain).includes(qq) || norm(s.note).includes(qq)) return true;
  return isCho(qq) && norm(choOf(plain)).includes(qq);
}
// scope: { kind: 'all' | 'none' | 'star' | 'unit' | 'tag', id }
export function inScope(doc, s, scope) {
  switch (scope?.kind) {
    case 'none': return !s.unit_id;
    case 'star': return !!s.starred;
    case 'unit': {
      if (s.unit_id === scope.id) return true;
      const u = unitById(doc, s.unit_id);
      return !!u && u.parent_id === scope.id;
    }
    case 'tag': return s.tag_ids.includes(scope.id);
    default: return true;
  }
}
// 최근 등록 순
export const sentencesSorted = doc => live(doc.sentences).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '') || (a.id < b.id ? 1 : -1));

// =====================================================================
// 학습 범위 (조회·문제 공통): { units: [], tags: [], none, star }
// 과목을 고르면 그 아래 전체. 그 과목의 단원을 하나라도 고르면 고른 단원만.
// 과목·미분류·태그는 "하나라도 맞으면", 즐겨찾기만은 그 결과에서 다시 거른다. 아무것도 안 고르면 전체
// =====================================================================
export const emptyScope = () => ({ units: [], tags: [], none: false, star: false });
export function cleanScope(doc, sc) {
  const s = { ...emptyScope(), ...(sc || {}) };
  s.units = (s.units || []).filter(id => unitById(doc, id));
  s.tags = (s.tags || []).filter(id => tagById(doc, id));
  s.none = !!s.none; s.star = !!s.star;
  return s;
}
export const scopeEmpty = sc => !sc.units.length && !sc.tags.length && !sc.none;
export function matchScope(doc, s, sc) {
  if (sc.star && !s.starred) return false;
  if (scopeEmpty(sc)) return true;
  if (sc.none && !s.unit_id) return true;
  if (s.tag_ids.some(t => sc.tags.includes(t))) return true;
  const u = unitById(doc, s.unit_id);
  if (!u) return false;
  const subjId = u.parent_id || u.id;
  if (!sc.units.includes(subjId)) return false;
  const pickedCh = sc.units.filter(id => unitById(doc, id)?.parent_id === subjId);
  return !pickedCh.length || pickedCh.includes(u.id);
}
export const scoped = (doc, sc) => live(doc.sentences).filter(s => matchScope(doc, s, sc));

// =====================================================================
// 학습 기록 (progress): 문장마다 P-<문장 id>
// =====================================================================
export const MAX_LEVEL = 4;
export const progressOf = (doc, sid) => live(doc.progress).find(p => p.id === 'P-' + sid) || null;
export function record(doc, sid, known) {
  const ts = nowIso();
  let p = doc.progress.find(x => x.id === 'P-' + sid);
  if (!p) { p = { id: 'P-' + sid, sid, level: 0, seen: 0, known: 0, unknown: 0, last_at: null, last_result: null, created_at: ts, updated_at: ts, deleted_at: null }; doc.progress.push(p); }
  p.deleted_at = null;
  p.seen++;
  if (known) { p.known++; p.level = Math.min(MAX_LEVEL, (p.level || 0) + 1); } else { p.unknown++; p.level = 0; }
  p.last_result = known ? 'known' : 'unknown';
  p.last_at = ts; p.updated_at = ts;
  return p;
}
export function resetProgress(doc, sids) {
  const ts = nowIso(), set = new Set(sids);
  for (const p of live(doc.progress)) if (set.has(p.sid)) { p.deleted_at = ts; p.updated_at = ts; }
}
// 처음 / 몰랐음 / 알았음 n
export function levelInfo(doc, sid) {
  const p = progressOf(doc, sid);
  if (!p || !p.seen) return { key: 'new', label: '처음' };
  if (p.last_result === 'unknown' || !p.level) return { key: 'unknown', label: '몰랐음' };
  return { key: 'known', label: p.level >= MAX_LEVEL ? `알았음 ${MAX_LEVEL}회+` : `알았음 ${p.level}회 연속`, level: p.level };
}
// 레벨별 몇 바퀴에 한 번 내는지: 0·1 → 매 바퀴, 2 → 2바퀴, 3 → 3바퀴, 4 → 4바퀴
export const intervalOf = level => Math.max(1, level || 0);
const hashId = id => [...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// 문제 모드 한 바퀴: 레벨이 높은 문장은 몇 바퀴에 한 번만. 범위가 10개 미만이거나 다 빠지면 모두 낸다
export function quizRound(doc, ids, round, avoidFirst = null, rnd = Math.random) {
  let pick = ids;
  if (ids.length >= 10) {
    pick = ids.filter(id => { const n = intervalOf(progressOf(doc, id)?.level); return n === 1 || (round + hashId(id)) % n === 0; });
    if (!pick.length) pick = ids;
  }
  return shuffleAvoid(pick, avoidFirst, rnd);
}
export function shuffleAvoid(ids, avoidFirst, rnd = Math.random) {
  const a = shuffle(ids, rnd);
  if (a.length > 1 && a[0] === avoidFirst) { const j = 1 + Math.floor(rnd() * (a.length - 1)); [a[0], a[j]] = [a[j], a[0]]; }
  return a;
}
// 글자(자소 묶음) 단위로 나누기
const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
export const graphemes = str => (seg ? [...seg.segment(str)].map(x => x.segment) : Array.from(str));

// =====================================================================
// 설정
// =====================================================================
export const PREF_DEFAULTS = { speed: 8, hold: 2, reviewNote: 'off', quizType: 'fixed', keepClass: false, start: 'register' };
export const QUIZ_TYPES = ['fixed', 'len', 'cho'];
export function prefs(doc) {
  const rec = live(doc.settings).find(x => x.id === 'S-prefs');
  return { ...PREF_DEFAULTS, ...(rec?.value || {}) };
}
export function setPref(doc, key, value) {
  let rec = doc.settings.find(x => x.id === 'S-prefs');
  const ts = nowIso();
  if (!rec) { rec = { id: 'S-prefs', value: {}, created_at: ts, updated_at: ts, deleted_at: null }; doc.settings.push(rec); }
  if (rec.value[key] === value) return;
  rec.value = { ...rec.value, [key]: value };
  rec.updated_at = ts;
}

// ---------- 정리 ----------
export function purgeOld(doc, now = Date.now()) {
  const limit = now - PURGE_DAYS * 86400000;
  for (const k of Object.keys(doc)) if (Array.isArray(doc[k])) doc[k] = doc[k].filter(x => !x?.deleted_at || Date.parse(x.deleted_at) > limit);
}
export function checkImport(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.sentences) || !Array.isArray(obj.units)) return 'Study Manager 내보내기 파일이 아닙니다';
  return null;
}

// =====================================================================
// IndexedDB
// =====================================================================
let mem = null;
export let storageOk = true;
function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error); };
  }));
}
export async function load() {
  try {
    const d = await tx('readonly', s => s.get(KEY));
    if (d && Array.isArray(d.sentences)) return normalizeDoc(d);
  } catch { storageOk = false; }
  return mem || emptyDoc();
}
export async function save(doc) {
  doc.updated_at = nowIso();
  mem = doc;
  try { await tx('readwrite', s => s.put(JSON.parse(JSON.stringify(doc)), KEY)); storageOk = true; }
  catch { storageOk = false; }
  return storageOk;
}
export async function clearAll() {
  mem = null;
  try { await tx('readwrite', s => s.delete(KEY)); } catch { /* 무시 */ }
}
