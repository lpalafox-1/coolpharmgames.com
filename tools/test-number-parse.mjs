function parseNumber(s){
  if (s === null || s === undefined) return NaN;
  const cleaned = String(s).trim();
  if (!/[0-9]/.test(cleaned)) return NaN;
  const filtered = cleaned.replace(/[^0-9\.\-\+eE]/g,'').trim();
  const n = Number(filtered);
  return Number.isFinite(n) ? n : NaN;
}
function parseRange(s){
  if (!s) return null;
  const tolMatch = s.match(/^\s*([+-]?[0-9]*\.?[0-9]+)\s*[±+]\s*([0-9]*\.?[0-9]+)\s*$/);
  if (tolMatch) {
    const val = Number(tolMatch[1]); const tol = Number(tolMatch[2]);
    if (Number.isFinite(val) && Number.isFinite(tol)) return { min: val - tol, max: val + tol };
  }
  const dashMatch = s.match(/^\s*([+-]?[0-9]*\.?[0-9]+)\s*-\s*([+-]?[0-9]*\.?[0-9]+)\s*$/);
  if (dashMatch) {
    const a = Number(dashMatch[1]); const b = Number(dashMatch[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return { min: Math.min(a,b), max: Math.max(a,b) };
  }
  return null;
}

const tests = [
  ['4.5', parseNumber('4.5')],
  [' 4.5 ', parseNumber(' 4.5 ')],
  ['4.5±0.1', parseRange('4.5±0.1')],
  ['4.5 - 4.6', parseRange('4.5 - 4.6')],
  ['abc', parseNumber('abc')],
  ['5e-1', parseNumber('5e-1')],
];
for (const t of tests) console.log(t[0], '->', t[1]);
