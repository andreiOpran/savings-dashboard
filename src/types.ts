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
  /**
   * Set while received: the month whose "In accounts" got this money and
   * whose de primit was reduced by it, and the lei amount moved.
   */
  movedTo?: { month: string; amount: number };
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
/** One EUR purchase, at the rate actually paid. The rate is kept as logged. */
export interface Exchange {
  id: string;
  /** YYYY-MM-DD; absent for entries imported from the sheet, whose dates aren't known. */
  date?: string;
  /** `invest`: the monthly stock investment; `xtb`: free funds moved to XTB. */
  kind: 'invest' | 'xtb';
  /** Euros bought (expression). */
  eurExpr: string;
  /** RON per EUR paid for this exchange. */
  rate: number;
  note?: string;
}

/** One saved salary: what was put aside that month and what was invested from it. */
export interface SalaryEntry {
  id: string;
  /** YYYY-MM; absent for entries imported from the sheet whose month isn't known. */
  month?: string;
  /** Lei saved from this salary (expression). */
  savedExpr: string;
  /** Euros invested from it (expression); "0" when nothing was invested. */
  investEurExpr: string;
  /** RON per EUR paid for that investment. */
  rate: number;
}

/** The "Numar salariu" block: saved salaries, and the euros bought out of them. */
export interface SalaryPlan {
  /** Default lei saved when adding a salary. */
  savingsPerSalary: string;
  /** Default euros invested when adding a salary. */
  investPerSalaryEur: string;
  salaries: SalaryEntry[];
  /** Free funds moved to XTB (kind "xtb"). */
  exchanges: Exchange[];
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
