// 작은 마크다운 변환기 (작업 이력용)
// 원문의 HTML은 모두 이스케이프한 뒤, 정해진 문법만 태그로 바꾼다 → 따로 정화(sanitize)할 필요가 없다
// 지원: 제목(#~####), 굵게, 기울임, 취소선, 인라인 코드, 코드 블록(```), 글머리(-,*,+), 번호 목록, 체크(- [ ], - [x]),
//       인용(>), 구분선(---), 링크([글](http…) 와 http… 자동 링크). 목록은 들여쓰기 2칸마다 한 단계
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function inline(src) {
  const codes = [];
  let s = src.replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = esc(s);
  const links = [];
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => { links.push(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`); return `\u0001${links.length - 1}\u0001`; });
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, p, u) => { links.push(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`); return `${p}\u0001${links.length - 1}\u0001`; });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/\u0001(\d+)\u0001/g, (_, i) => links[+i]);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[+i])}</code>`);
}

export function renderMd(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  const stack = []; // 열린 목록: { type: 'ul'|'ol', indent }
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; } };
  const closeLists = (toIndent = -1) => {
    while (stack.length && stack[stack.length - 1].indent > toIndent) out.push(`</li></${stack.pop().type}>`);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { // 코드 블록
      flushPara(); closeLists();
      const buf = [];
      while (++i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    if (!line.trim()) { flushPara(); closeLists(); continue; }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushPara(); closeLists(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); closeLists(); out.push('<hr>'); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara(); closeLists();
      const buf = [m[1]];
      while (i + 1 < lines.length && (m = lines[i + 1].match(/^>\s?(.*)$/))) { buf.push(m[1]); i++; }
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`);
      continue;
    }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const indent = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
      const type = /\d/.test(m[2]) ? 'ol' : 'ul';
      let body = m[3], cls = '';
      const cb = body.match(/^\[([ xX])\]\s+(.*)$/);
      if (cb) { cls = ' class="task"'; body = `<span class="cbx${cb[1] === ' ' ? '' : ' on'}" aria-hidden="true"></span>${inline(cb[2])}`; }
      else body = inline(body);
      const top = stack[stack.length - 1];
      if (!top || indent > top.indent) { stack.push({ type, indent }); out.push(`<${type}><li${cls}>${body}`); }
      else {
        closeLists(indent);
        const t2 = stack[stack.length - 1];
        if (t2 && t2.indent === indent && t2.type === type) out.push(`</li><li${cls}>${body}`);
        else { if (t2 && t2.indent === indent) out.push(`</li></${stack.pop().type}>`); stack.push({ type, indent }); out.push(`<${type}><li${cls}>${body}`); }
      }
      continue;
    }
    if (stack.length && /^\s+\S/.test(line)) { out.push('<br>' + inline(line.trim())); continue; } // 목록 항목 이어 쓰기
    closeLists();
    para.push(line);
  }
  flushPara(); closeLists();
  return out.join('');
}

// 미리보기·검색용: 서식 기호를 걷어 낸 평문
export function plainMd(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ''))
    .replace(/^#{1,4}\s+/gm, '').replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, '').replace(/^\s*([-*+]|\d+[.)])\s+/gm, '')
    .replace(/^>\s?/gm, '').replace(/\*\*|__|~~|`/g, '').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1');
}
