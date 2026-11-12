import { describe, expect, it } from 'vitest';
import { evaluate } from './expr';
import { goalStats, history, salaryPlan } from './calc';
import { emptyData, parseData } from './storage';

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

  it('history uses each month\'s recorded de primit, falling back to today\'s', () => {
    const d = emptyData();
    d.receivables.push({ id: 'r', label: 'X', expr: '100', currency: 'RON', received: false });
    d.snapshots.push({ month: '2026-01', expr: '1000' });
    d.snapshots.push({ month: '2026-02', expr: '2000', receivablesExpr: '300+50', goals: 500 });
    const [a, b] = history(d);
    expect(a.withReceivables).toBe(1100);
    expect(a.hasReceivables).toBe(false);
    expect(b.withReceivables).toBe(2350);
    expect(b.untilGoals).toBe(1850);
  });

  it('subtracts the ING salary savings from the accounts total', () => {
    const d = emptyData();
    d.snapshots.push({ month: '2026-10', expr: '29543' });
    d.snapshots.push({ month: '2026-11', expr: '32119', ingExpr: '4625', receivablesExpr: '5290', goals: 28653 });
    const [oct, nov] = history(d);
    expect(oct.balance).toBe(29543);
    expect(oct.hasIng).toBe(false);
    expect(nov.balance).toBe(27494);
    expect(nov.untilGoals).toBe(27494 + 5290 - 28653);
  });

  it('migrates old frozen snapshots', () => {
    const d = parseData({ ...emptyData(), snapshots: [{ month: '2026-03', expr: '1', frozen: { receivables: 5290, goals: 28653.18 } }] });
    expect(d.snapshots[0]).toEqual({ month: '2026-03', expr: '1', receivablesExpr: '5290', goals: 28653.18 });
  });

  it('migrates the sheet\'s salary split into exchanges, keeping the ING amount', () => {
    const d = parseData({ ...emptyData(), plan: { salaries: 5, savingsPerSalary: '2500', investPerSalaryEur: '200', xtbFreeEur: '390+185', eurRate: '5' } });
    expect(d.plan).not.toHaveProperty('xtbFreeEur');
    expect(d.plan.exchanges.map((x) => [x.kind, x.eurExpr, x.rate])).toEqual([
      ['invest', '200', 5], ['invest', '200', 5], ['invest', '200', 5], ['invest', '200', 5], ['invest', '200', 5],
      ['xtb', '390', 5], ['xtb', '185', 5],
    ]);
    expect(salaryPlan(d).ing).toBe(4625);
    expect(parseData(JSON.parse(JSON.stringify(d))).plan.exchanges).toEqual(d.plan.exchanges); // idempotent
  });

  it('converts each exchange at its own rate', () => {
    const d = emptyData();
    d.plan = {
      salaries: 2, savingsPerSalary: '2500', investPerSalaryEur: '200', exchanges: [
        { id: 'a', date: '2026-10-05', kind: 'invest', eurExpr: '200', rate: 4.97 },
        { id: 'b', date: '2026-11-05', kind: 'invest', eurExpr: '200', rate: 5.09 },
        { id: 'c', date: '2026-11-12', kind: 'xtb', eurExpr: '100+50', rate: 5.1 },
      ],
    };
    const s = salaryPlan(d);
    expect(s.invest.eur).toBe(400);
    expect(s.invest.ron).toBeCloseTo(994 + 1018);
    expect(s.invest.avgRate).toBeCloseTo(5.03);
    expect(s.xtb.ron).toBeCloseTo(765);
    expect(s.ing).toBeCloseTo(5000 - 2012 - 765);
  });
});
