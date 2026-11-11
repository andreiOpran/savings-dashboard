/**
 * Tiny, safe arithmetic evaluator for amount fields, so values can be typed the
 * same way as in the spreadsheet: "2600+150", "51*40", "= 57 / 3", "-(1000+150)".
 * Supports + - * / parentheses, unary minus, "," or "." as decimal separator.
 * Never uses eval().
 */
export function evaluate(input: string): number | null {
  const src = input.trim().replace(/^=/, '').replace(/,/g, '.').replace(/\s+/g, '');
  if (src === '') return 0;
  let pos = 0;

  const peek = () => src[pos];
  const expect = (ch: string) => {
    if (src[pos] !== ch) throw new Error(`expected ${ch}`);
    pos++;
  };

  function parseExpr(): number {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function parseTerm(): number {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++];
      const r = parseFactor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function parseFactor(): number {
    if (peek() === '-') { pos++; return -parseFactor(); }
    if (peek() === '+') { pos++; return parseFactor(); }
    if (peek() === '(') {
      pos++;
      const v = parseExpr();
      expect(')');
      return v;
    }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(pos));
    if (!m) throw new Error('number expected');
    pos += m[0].length;
    return parseFloat(m[0]);
  }

  try {
    const v = parseExpr();
    if (pos !== src.length || !Number.isFinite(v)) return null;
    return v;
  } catch {
    return null;
  }
}

/** Evaluate, treating invalid input as 0. */
export const num = (expr: string): number => evaluate(expr) ?? 0;

/** True when the expression is more than a plain number (worth showing the formula). */
export const isFormula = (expr: string): boolean =>
  /[-+*/()]/.test(expr.trim().replace(/^[=+-]/, ''));
