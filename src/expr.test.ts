import { describe, expect, it } from 'vitest';
import { evaluate } from './expr';
import { goalStats, history, salaryPlan, setReceived } from './calc';
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

  it('migrates the sheet\'s salary split into monthly salaries, keeping the ING amount', () => {
    const d = parseData({ ...emptyData(), plan: { salaries: 5, savingsPerSalary: '2500', investPerSalaryEur: '200', xtbFreeEur: '390+185', eurRate: '5' } });
    expect(d.plan).not.toHaveProperty('xtbFreeEur');
    expect(d.plan.salaries.map((x) => [x.month, x.savedExpr, x.investEurExpr, x.rate])).toEqual(
      Array(5).fill([undefined, '2500', '200', 5]));
    expect(d.plan.exchanges.map((x) => [x.kind, x.eurExpr, x.rate])).toEqual([['xtb', '390', 5], ['xtb', '185', 5]]);
    expect(salaryPlan(d).ing).toBe(4625);
    expect(parseData(JSON.parse(JSON.stringify(d))).plan).toEqual(d.plan); // idempotent
  });

  it('migrates dated investment exchanges (v1) into one salary per month', () => {
    const inv = (date: string, rate: number) => ({ id: date, date, kind: 'invest', eurExpr: '200', rate });
    const d = parseData({ ...emptyData(), plan: {
      salaries: 5, savingsPerSalary: '2500', investPerSalaryEur: '200',
      exchanges: [inv('2026-11-05', 5.11), inv('2026-07-05', 5.07), inv('2026-09-05', 5.09), inv('2026-08-05', 5.08), inv('2026-10-05', 5.1),
        { id: 'x1', kind: 'xtb', eurExpr: '390', rate: 5 }, { id: 'x2', kind: 'xtb', eurExpr: '185', rate: 5 }],
    } });
    expect(d.plan.salaries.map((x) => [x.month, x.rate])).toEqual([
      ['2026-07', 5.07], ['2026-08', 5.08], ['2026-09', 5.09], ['2026-10', 5.1], ['2026-11', 5.11]]);
    expect(d.plan.exchanges).toHaveLength(2);
    expect(salaryPlan(d).ing).toBeCloseTo(12500 - 5090 - 2875);
  });

  it('lets every month save and invest a different amount', () => {
    const d = emptyData();
    d.plan = {
      savingsPerSalary: '2500', investPerSalaryEur: '200', salaries: [
        { id: 'a', month: '2026-10', savedExpr: '2500', investEurExpr: '200', rate: 4.97 },
        { id: 'b', month: '2026-11', savedExpr: '3000+200', investEurExpr: '300', rate: 5.09 },
        { id: 'c', month: '2026-12', savedExpr: '1800', investEurExpr: '0', rate: 5.1 },
      ],
      exchanges: [{ id: 'x', date: '2026-11-12', kind: 'xtb', eurExpr: '100+50', rate: 5.1 }],
    };
    const s = salaryPlan(d);
    expect(s.totalSavings).toBe(7500);
    expect(s.invest.eur).toBe(500);
    expect(s.invest.ron).toBeCloseTo(994 + 1527);
    expect(s.invest.count).toBe(2);
    expect(s.xtb.ron).toBeCloseTo(765);
    expect(s.ing).toBeCloseTo(7500 - 2521 - 765);
  });
});

describe('receiving money', () => {
  const base = () => {
    const d = emptyData();
    d.settings.eurRon = 5;
    d.receivables = [
      { id: 'p', label: 'Petrescu', expr: '2600+150', currency: 'RON', received: false },
      { id: 'e', label: 'Euro', expr: '100', currency: 'EUR', received: false },
    ];
    d.snapshots = [{ month: '2026-11', expr: '32119', ingExpr: '4625', receivablesExpr: '3250', goals: 0 }];
    return d;
  };

  it('moves the amount into the current month, keeping the real total', () => {
    const before = history(base())[0];
    const d = setReceived(base(), 'p', true, '2026-11');
    expect(d.snapshots[0].expr).toBe('32119+2750');
    expect(d.snapshots[0].receivablesExpr).toBe('3250-2750');
    expect(d.receivables[0]).toMatchObject({ received: true, movedTo: { month: '2026-11', amount: 2750 } });
    const after = history(d)[0];
    expect(after.balance).toBe(before.balance + 2750);
    expect(after.withReceivables).toBe(before.withReceivables);
  });

  it('converts euros at the current rate', () => {
    const d = setReceived(base(), 'e', true, '2026-11');
    expect(d.snapshots[0].expr).toBe('32119+500');
  });

  it('undo reverses a tick exactly', () => {
    const d = setReceived(setReceived(base(), 'p', true, '2026-11'), 'p', false, '2026-11', { undo: true });
    expect(d.snapshots[0]).toEqual(base().snapshots[0]);
    expect(d.receivables[0]).toEqual(base().receivables[0]);
  });

  it('undo after the month was edited subtracts instead', () => {
    let d = setReceived(base(), 'p', true, '2026-11');
    d = { ...d, snapshots: [{ ...d.snapshots[0], expr: '35000' }] };
    d = setReceived(d, 'p', false, '2026-12', { undo: true });
    expect(d.snapshots[0].expr).toBe('35000-2750');
  });

  it('owing again (untick) reopens the entry but leaves past months alone', () => {
    const paid = setReceived(base(), 'p', true, '2026-11');
    let d = setReceived(paid, 'p', false, '2027-01');
    expect(d.snapshots).toEqual(paid.snapshots); // November keeps the money that arrived
    expect(d.receivables[0]).toMatchObject({ received: false });
    expect(d.receivables[0].movedTo).toBeUndefined();
    // New debt, then paid again in January: only January changes.
    d = { ...d, receivables: d.receivables.map((r) => (r.id === 'p' ? { ...r, expr: '300' } : r)) };
    d = { ...d, snapshots: [...d.snapshots, { month: '2027-01', expr: '40000', receivablesExpr: '800', goals: 0 }] };
    d = setReceived(d, 'p', true, '2027-01');
    expect(d.snapshots[0]).toEqual(paid.snapshots[0]);
    expect(d.snapshots[1]).toMatchObject({ expr: '40000+300', receivablesExpr: '800-300' });
  });

  it('only flags it when the current month is not recorded', () => {
    const d = setReceived(base(), 'p', true, '2026-12');
    expect(d.snapshots).toEqual(base().snapshots);
    expect(d.receivables[0].received).toBe(true);
    expect(d.receivables[0].movedTo).toBeUndefined();
  });

  it('leaves an unrecorded de primit alone (it follows the list)', () => {
    const b = base(); delete b.snapshots[0].receivablesExpr;
    const d = setReceived(b, 'p', true, '2026-11');
    expect(d.snapshots[0].receivablesExpr).toBeUndefined();
    expect(d.snapshots[0].expr).toBe('32119+2750');
  });
});
