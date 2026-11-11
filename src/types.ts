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

/** End-of-month balance. */
export interface Snapshot {
  /** YYYY-MM */
  month: string;
  expr: string;
  note?: string;
  /**
   * Receivables / goals values at the moment the month was recorded.
   * When absent (e.g. imported history) the current values are used, like the sheet did.
   */
  frozen?: { receivables: number; goals: number };
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
