import { num } from './expr';
import { uid } from './id';
import type { AppData, Currency, Exchange, Goal, Receivable, SalaryEntry, Snapshot } from './types';

export const toRon = (amount: number, currency: Currency, eurRon: number) =>
  currency === 'EUR' ? amount * eurRon : amount;

export interface GoalStats {
  total: number;      // full budget (own currency)
  paid: number;       // already paid (own currency)
  remaining: number;  // still to pay (own currency)
  remainingRon: number;
  progress: number;   // 0..1
  done: boolean;
}

export function goalStats(goal: Goal, eurRon: number): GoalStats {
  let total = 0, paid = 0, remaining = 0;
  for (const it of goal.items) {
    const v = num(it.expr);
    total += v;
    if (it.paid) paid += v; else remaining += v;
  }
  const positive = goal.items.reduce((s, it) => s + Math.max(0, num(it.expr)), 0);
  const progress = positive > 0 ? Math.min(1, Math.max(0, paid / positive)) : 1;
  return {
    total, paid, remaining,
    remainingRon: toRon(remaining, goal.currency, eurRon),
    progress,
    done: goal.items.length > 0 && remaining <= 0,
  };
}

/** Copy a goal (typically a finished one, like last summer's vacation) as a fresh plan. */
export function goalFromTemplate(goal: Goal, name: string): Goal {
  return {
    ...goal,
    id: uid(),
    name,
    archived: false,
    countInTotal: true,
    items: goal.items.map((it) => ({ ...it, id: uid(), paid: false })),
  };
}

export function receivablesTotal(data: AppData): number {
  const r = data.settings.eurRon;
  return data.receivables
    .filter((x) => !x.received)
    .reduce((s, x) => s + toRon(num(x.expr), x.currency, r), 0);
}

export function goalsRemaining(data: AppData): number {
  const r = data.settings.eurRon;
  return data.goals
    .filter((g) => g.countInTotal && !g.archived)
    .reduce((s, g) => s + Math.max(0, goalStats(g, r).remainingRon), 0);
}

export interface HistoryRow {
  month: string;
  /** Total in accounts as entered. */
  accounts: number;
  /** ING salary savings taken out (0 when not recorded). */
  ing: number;
  hasIng: boolean;
  /** accounts − ING */
  balance: number;
  withReceivables: number;
  goals: number;
  untilGoals: number;
  receivables: number;
  /** false = de primit wasn't recorded for this month; today's total is used. */
  hasReceivables: boolean;
  hasGoals: boolean;
  snapshot: Snapshot;
}

export function history(data: AppData): HistoryRow[] {
  const rec = receivablesTotal(data);
  const goals = goalsRemaining(data);
  return [...data.snapshots]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((s) => {
      const accounts = num(s.expr);
      const hasIng = s.ingExpr != null && s.ingExpr !== '';
      const ing = hasIng ? num(s.ingExpr!) : 0;
      const balance = accounts - ing;
      const hasReceivables = s.receivablesExpr != null && s.receivablesExpr !== '';
      const r = hasReceivables ? num(s.receivablesExpr!) : rec;
      const g = s.goals ?? goals;
      return {
        month: s.month,
        accounts,
        ing,
        hasIng,
        balance,
        withReceivables: balance + r,
        goals: g,
        untilGoals: balance + r - g,
        receivables: r,
        hasReceivables,
        hasGoals: s.goals != null,
        snapshot: s,
      };
    });
}

export interface ExchangeTotals {
  count: number;
  eur: number;
  /** Lei actually paid, each exchange at its own rate. */
  ron: number;
  /** Weighted average rate (ron / eur); 0 when nothing was exchanged. */
  avgRate: number;
}

function exchangeTotals(list: Exchange[]): ExchangeTotals {
  let eur = 0, ron = 0;
  for (const x of list) {
    const e = num(x.eurExpr);
    eur += e;
    ron += e * x.rate;
  }
  return { count: list.length, eur, ron, avgRate: eur ? ron / eur : 0 };
}

/** What one salary leaves on ING: saved − what its investment cost. */
export const salaryToIng = (s: SalaryEntry) => num(s.savedExpr) - num(s.investEurExpr) * s.rate;

/** ING = everything saved − what the euro purchases really cost in lei. */
export function salaryPlan(data: AppData) {
  const p = data.plan;
  const totalSavings = p.salaries.reduce((sum, s) => sum + num(s.savedExpr), 0);
  const invest = exchangeTotals(p.salaries.map((s) => ({ id: s.id, kind: 'invest', eurExpr: s.investEurExpr, rate: s.rate })));
  invest.count = p.salaries.filter((s) => num(s.investEurExpr) > 0).length;
  const xtb = exchangeTotals(p.exchanges.filter((x) => x.kind === 'xtb'));
  const ing = totalSavings - invest.ron - xtb.ron;
  return { totalSavings, salaryCount: p.salaries.length, invest, xtb, ing };
}

/** Newest month first; undated (imported) entries last, in their original order. */
export function sortedSalaries(list: SalaryEntry[]): SalaryEntry[] {
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (b.x.month ?? '').localeCompare(a.x.month ?? '') || a.i - b.i)
    .map(({ x }) => x);
}

/** Newest first; undated (imported) entries last, in their original order. */
export function sortedExchanges(list: Exchange[]): Exchange[] {
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (b.x.date ?? '').localeCompare(a.x.date ?? '') || a.i - b.i)
    .map(({ x }) => x);
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const fmtAmount = (v: number) => String(Math.round(v * 100) / 100);

/** Append "+x"/"-x" to an expression, or drop that exact suffix if it is already the last term. */
function adjustExpr(expr: string, delta: number): string {
  const amount = fmtAmount(Math.abs(delta));
  const undo = `${delta < 0 ? '+' : '-'}${amount}`;
  if (expr.endsWith(undo) && expr.length > undo.length) return expr.slice(0, -undo.length);
  return `${expr || '0'}${delta < 0 ? '-' : '+'}${amount}`;
}

/**
 * Tick or untick a receivable. Money that arrives moves from de primit into
 * the accounts: when the current month is recorded, its "In accounts" grows by
 * the amount and its recorded de primit shrinks by it, so the real total stays
 * the same.
 *
 * Unticking means "they owe me again": the entry reopens and past months keep
 * the money that already arrived. Only `undo` (a tick made by mistake)
 * reverses the move.
 */
export function setReceived(
  data: AppData, id: string, received: boolean, month = currentMonth(), opts: { undo?: boolean } = {},
): AppData {
  const r = data.receivables.find((x) => x.id === id);
  if (!r || r.received === received) return data;
  let snapshots = data.snapshots;
  let movedTo: Receivable['movedTo'];

  if (received) {
    const amount = toRon(num(r.expr), r.currency, data.settings.eurRon);
    const snap = snapshots.find((s) => s.month === month);
    if (snap && amount !== 0) {
      movedTo = { month, amount };
      snapshots = snapshots.map((s) => s !== snap ? s : {
        ...s,
        expr: adjustExpr(s.expr, amount),
        // An unrecorded de primit already follows the live list, which drops this item by itself.
        ...(s.receivablesExpr != null && s.receivablesExpr !== '' ? { receivablesExpr: adjustExpr(s.receivablesExpr, -amount) } : {}),
      });
    }
  } else if (opts.undo && r.movedTo) {
    const { month: m, amount } = r.movedTo;
    snapshots = snapshots.map((s) => s.month !== m ? s : {
      ...s,
      expr: adjustExpr(s.expr, -amount),
      ...(s.receivablesExpr != null && s.receivablesExpr !== '' ? { receivablesExpr: adjustExpr(s.receivablesExpr, amount) } : {}),
    });
  }

  return {
    ...data,
    snapshots,
    receivables: data.receivables.map((x) => {
      if (x.id !== id) return x;
      const { movedTo: _old, ...rest } = x;
      return movedTo ? { ...rest, received, movedTo } : { ...rest, received };
    }),
  };
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
