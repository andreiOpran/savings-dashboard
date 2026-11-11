import { num } from './expr';
import type { AppData, Currency, Goal, Snapshot } from './types';

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

export function salaryPlan(data: AppData) {
  const p = data.plan;
  const rate = p.eurRate.trim() ? num(p.eurRate) : data.settings.eurRon;
  const totalSavings = p.salaries * num(p.savingsPerSalary);
  const investedEur = p.salaries * num(p.investPerSalaryEur);
  const xtbEur = num(p.xtbFreeEur);
  const ing = totalSavings - (investedEur + xtbEur) * rate;
  return { rate, totalSavings, investedEur, xtbEur, ing };
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
