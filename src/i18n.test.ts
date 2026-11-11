import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import ro from './locales/ro.json';
import { goalFromTemplate, goalStats } from './calc';

const PLURAL = /_(zero|one|two|few|many|other)$/;

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k.replace(PLURAL, '')}`]);
}
const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort();
function flat(obj: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? Object.entries(flat(v, `${prefix}${k}.`)) : [[`${prefix}${k}`, v as string]]));
}

describe('translations', () => {
  it('en and ro have the same keys', () => {
    expect(new Set(keys(ro))).toEqual(new Set(keys(en)));
  });

  it('every Romanian plural has one/few/other forms', () => {
    const f = flat(ro);
    for (const k of Object.keys(f).filter((k) => k.endsWith('_one'))) {
      const base = k.slice(0, -4);
      expect(f[`${base}_few`], `${base}_few`).toBeDefined();
      expect(f[`${base}_other`], `${base}_other`).toBeDefined();
    }
  });

  it('translations use the same {{placeholders}}', () => {
    const e = flat(en), r = flat(ro);
    for (const [k, v] of Object.entries(r)) {
      const enKey = k.replace(/_few$/, '_other');
      expect(placeholders(v), k).toEqual(placeholders(e[enKey] ?? e[k]));
    }
  });
});

describe('goal templates', () => {
  it('copies items unpaid, as a new active goal', () => {
    const past = {
      id: 'v', name: 'Vacanta', currency: 'RON' as const, countInTotal: false, archived: true,
      items: [
        { id: '1', label: 'Cazare', expr: '2064', paid: true },
        { id: '2', label: 'Bani parinti', expr: '-2100', paid: false },
      ],
    };
    const next = goalFromTemplate(past, 'Vacanta 2027');
    expect(next).toMatchObject({ name: 'Vacanta 2027', archived: false, countInTotal: true });
    expect(next.id).not.toBe('v');
    expect(next.items.map((i) => [i.label, i.expr, i.paid])).toEqual([['Cazare', '2064', false], ['Bani parinti', '-2100', false]]);
    expect(new Set(next.items.map((i) => i.id)).has('1')).toBe(false);
    expect(goalStats(next, 5).remaining).toBe(-36);
    expect(past.items[0].paid).toBe(true); // original untouched
  });
});
