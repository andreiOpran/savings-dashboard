export type Currency = 'RON' | 'EUR';

/** A line inside a goal budget (e.g. "Casca", "Sonda lambda"). */
export interface GoalItem {
  id: string;
  label: string;
  /** Arithmetic expression, e.g. "75+40" or "250*7+200*4". Negative = contribution/offset. */
  expr: string;
  paid: boolean;
}

export interface Goal {
  id: string;
  name: string;
  currency: Currency;
  items: GoalItem[];
  /** Whether what's left of this goal counts towards "Goals remaining". */
  countInTotal: boolean;
  archived: boolean;
}

/** Money someone owes you ("De primit"). */
export interface Receivable {
  id: string;
  label: string;
  expr: string;
  currency: Currency;
  received: boolean;
}

/** What you had at the end of a month. */
export interface Snapshot {
  /** YYYY-MM */
  month: string;
  /** Total in all accounts (expression). Before Nov 2026 this was entered with ING already taken out. */
  expr: string;
  /**
   * Salary savings kept on ING, subtracted from the accounts total (expression).
   * Pre-filled from the salary split. Absent = nothing to subtract.
   */
  ingExpr?: string;
  /**
   * De primit at the end of that month (expression). When absent (months imported
   * from the sheet) today's de primit total is used, like the sheet did.
   */
  receivablesExpr?: string;
  /** Goals still to pay when the month was recorded (RON). Absent = today's value. */
  goals?: number;
  note?: string;
}

/** The "Numar salariu" block: how the salary savings are split. */
export interface SalaryPlan {
  salaries: number;
  savingsPerSalary: string;
  investPerSalaryEur: string;
  xtbFreeEur: string;
  /** Fixed EUR→RON rate for this block; empty = use the live rate. */
  eurRate: string;
}

export interface Settings {
  eurRon: number;
  eurRonUpdated?: string;
  autoRate: boolean;
}

export interface AppData {
  version: 1;
  settings: Settings;
  plan: SalaryPlan;
  receivables: Receivable[];
  goals: Goal[];
  snapshots: Snapshot[];
}
