import { describe, expect, it } from 'vitest';
import { evaluate } from './expr';
import { goalStats, history, salaryPlan } from './calc';
import { emptyData } from './storage';

describe('evaluate', () => {
  it.each([
    ['2600+150', 2750],
    ['51*40', 2040],
    ['= 57 / 3', 19],
    ['250 * 7 + 200 * 4', 2550],
    ['-(1000+150+450)', -1600],
    ['12,5', 12.5],
    ['', 0],
  ])('%s = %d', (src, want) => expect(evaluate(src)).toBe(want));

  it.each(['abc', '2+', '(1', 'alert(1)', '1/0'])('rejects %s', (src) =>
    expect(evaluate(src)).toBeNull());
});

describe('calc', () => {
  it('goal stats: paid items and negative contributions', () => {
    const g = {
      id: 'g', name: 'Vacanta', currency: 'RON' as const, countInTotal: true, archived: false,
      items: [
        { id: '1', label: 'Cazare', expr: '2000', paid: true },
        { id: '2', label: 'Mancare', expr: '1000', paid: false },
        { id: '3', label: 'Bani parinti', expr: '-500', paid: false },
      ],
    };
    const s = goalStats(g, 5);
    expect(s.total).toBe(2500);
    expect(s.remaining).toBe(500);
    expect(s.progress).toBeCloseTo(2000 / 3000);
  });

  it('history uses frozen values when present', () => {
    const d = emptyData();
    d.receivables.push({ id: 'r', label: 'X', expr: '100', currency: 'RON', received: false });
    d.snapshots.push({ month: '2026-01', expr: '1000' });
    d.snapshots.push({ month: '2026-02', expr: '2000', frozen: { receivables: 0, goals: 500 } });
    const [a, b] = history(d);
    expect(a.withReceivables).toBe(1100);
    expect(b.untilGoals).toBe(1500);
  });

  it('salary plan matches the sheet', () => {
    const d = emptyData();
    d.plan = { salaries: 5, savingsPerSalary: '2500', investPerSalaryEur: '200', xtbFreeEur: '390+185', eurRate: '5' };
    expect(salaryPlan(d).ing).toBe(4625);
  });
});
