// 통합 검색 (M2): 대소문자·공백·-_. 무시, 일부 일치, 영문 이니셜, 한글 초성, 여러 단어는 모두 맞아야 함
// 검색하지 않는 것: 계정 PW·메모, 보안 메모 내용, 업무 항목 중 가린 값
import { live, cmpText, pathOf } from './store.js';

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const CHO_SET = new Set([...CHO]);
export const norm = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s\-_.]+/g, '');
// 한글 음절을 초성으로 바꾼 문자열 (그 밖의 글자는 그대로)
export function chosung(s) {
  let out = '';
  for (const ch of norm(s)) {
    const c = ch.charCodeAt(0);
    out += c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch;
  }
  return out;
}
export const isChosungQuery = t => t.length > 0 && [...t].every(ch => CHO_SET.has(ch));
// 영문 단어가 둘 이상이면 첫 글자 모음 (Amazon Web Services → aws, myCompanyPortal → mcp)
export function initials(s) {
  const words = String(s ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(w => /^[A-Za-z]/.test(w));
  return words.length >= 2 ? words.map(w => w[0]).join('').toLowerCase() : '';
}
export const terms = q => String(q ?? '').normalize('NFC').trim().split(/\s+/).map(norm).filter(Boolean);

// 문자열 하나가 검색어 하나에 맞는지
function hit(term, text) {
  if (!text) return false;
  if (norm(text).includes(term)) return true;
  return isChosungQuery(term) && chosung(text).includes(term);
}
// 후보(primary: 이름, others: 그 밖의 검색 대상, context: 경로처럼 범위를 좁히는 데만 쓰는 값)에 대해
// 모든 검색어가 어딘가에 맞으면 점수(낮을수록 앞), 아니면 -1. 검색어 하나는 반드시 primary나 others에 맞아야 한다
function score(ts, primary, others, context = []) {
  let s = 0, own = false;
  for (const t of ts) {
    if (primary.some(p => hit(t, p))) { own = true; if (!primary.some(p => norm(p).startsWith(t))) s += 1; }
    else if (others.some(o => hit(t, o))) { own = true; s += 3; }
    else if (context.some(c => hit(t, c))) s += 2;
    else return -1;
  }
  return own ? s : -1;
}

// 결과: { accounts: [{ item, score }], notes: [...], work: [{ item, path, score }] }
export function search(q, { pdoc, wdoc, providerName = () => '', socialLabel = () => '' }) {
  const ts = terms(q);
  const out = { accounts: [], notes: [], work: [], total: 0 };
  if (!ts.length) return out;
  const push = (arr, entry, nameOf) => { if (entry.score >= 0) arr.push(entry); arr.sort((a, b) => a.score - b.score || cmpText(nameOf(a), nameOf(b))); };
  for (const a of live(pdoc?.accounts)) {
    const primary = [a.service, ...(a.aliases || []), initials(a.service)].filter(Boolean);
    const others = [a.login_id, a.url, a.login_type === 'social' ? providerName(a.provider_id) : '', a.login_type === 'social' ? socialLabel(a.social_account_id) : ''].filter(Boolean);
    push(out.accounts, { item: a, score: score(ts, primary, others) }, e => e.item.service);
  }
  for (const n of live(pdoc?.notes)) push(out.notes, { item: n, score: score(ts, [n.title], []) }, e => e.item.title);
  for (const node of live(wdoc?.nodes)) {
    const path = pathOf(wdoc, node.id);
    const ancestors = path.slice(0, -1).map(p => p.name);
    const others = node.type === 'field' && !node.masked && node.value ? [node.value] : [];
    push(out.work, { item: node, path, score: score(ts, [node.name], others, ancestors) }, e => e.item.name);
  }
  out.total = out.accounts.length + out.notes.length + out.work.length;
  return out;
}
