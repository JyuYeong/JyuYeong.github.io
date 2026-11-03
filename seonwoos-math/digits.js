// 숫자 모양 데이터. 좌표 범위: 가로 0~100, 세로 0~140 (칸 안)
// 숫자마다 모양(variant)을 여러 개 두고, 설정에서 고른다. strokes는 쓰는 순서대로.
export const DIGITS = {
  1: { def: 'bar', variants: {
    bar: { name: '막대', strokes: ['M50 14 L50 126'] },
    flag: { name: '꺾은 모양', strokes: ['M30 38 L52 14 L52 126'] },
  } },
  2: { def: 'std', variants: {
    std: { name: '기본', strokes: ['M24 42 C24 20 38 12 52 12 C68 12 78 24 78 40 C78 60 60 76 22 126 L82 126'] },
  } },
  3: { def: 'std', variants: {
    std: { name: '기본', strokes: ['M24 30 C30 17 41 12 52 12 C68 12 77 22 77 36 C77 53 64 64 46 66 C66 67 80 80 80 98 C80 117 66 128 50 128 C36 128 26 120 22 108'] },
  } },
  4: { def: 'closed', variants: {
    closed: { name: '닫힌 모양', strokes: ['M62 14 L18 94 L86 94', 'M64 14 L64 128'] },
    open: { name: '열린 모양', strokes: ['M32 14 L24 86 L84 86', 'M66 42 L66 128'] },
  } },
  5: { def: 'barLast', variants: {
    barLast: { name: '윗줄 나중', strokes: ['M30 14 L27 64 C40 55 56 53 67 58 C80 65 82 84 80 100 C77 119 63 128 48 128 C36 128 27 122 22 112', 'M30 14 L78 14'] },
    barFirst: { name: '윗줄 먼저', strokes: ['M78 14 L30 14 L27 64 C40 55 56 53 67 58 C80 65 82 84 80 100 C77 119 63 128 48 128 C36 128 27 122 22 112'] },
  } },
  6: { def: 'std', variants: {
    std: { name: '기본', strokes: ['M72 18 C64 13 57 12 50 12 C31 14 22 40 22 76 C22 108 34 128 52 128 C68 128 80 116 80 98 C80 80 68 68 52 68 C36 68 25 79 22 95'] },
  } },
  7: { def: 'std', variants: {
    std: { name: '기본', strokes: ['M20 16 L80 16 L40 128'] },
    cross: { name: '가운데 줄', strokes: ['M20 16 L80 16 L40 128', 'M38 72 L74 72'] },
  } },
  8: { def: 'std', variants: {
    std: { name: '기본', strokes: ['M72 34 C72 20 62 12 50 12 C36 12 28 22 28 34 C28 48 40 57 50 64 C64 73 78 82 78 99 C78 117 66 128 50 128 C34 128 22 117 22 99 C22 82 36 73 50 64 C60 57 72 48 72 34'] },
  } },
  9: { def: 'straight', variants: {
    straight: { name: '곧은 꼬리', strokes: ['M76 40 C76 24 64 14 50 14 C34 14 24 26 24 42 C24 58 36 68 50 68 C64 68 76 58 76 40 L76 128'] },
    curved: { name: '굽은 꼬리', strokes: ['M76 40 C76 24 64 14 50 14 C34 14 24 26 24 42 C24 58 36 68 50 68 C64 68 76 58 76 40 C76 84 70 118 40 128'] },
  } },
};

export function strokesOf(n, prefs) {
  const d = DIGITS[n];
  const key = (prefs && prefs[n] && d.variants[prefs[n]]) ? prefs[n] : d.def;
  return d.variants[key].strokes;
}
