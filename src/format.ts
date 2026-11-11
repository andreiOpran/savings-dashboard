import i18n from './i18n';
import type { Currency } from './types';

const fmt0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

export const money = (v: number, currency: Currency = 'RON', precise = false) =>
  `${(precise ? fmt2 : fmt0).format(v)} ${currency === 'EUR' ? '€' : 'lei'}`;

export const signedMoney = (v: number, currency: Currency = 'RON') =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), currency)}`;

/** "Nov 2026" / "nov. 2026", following the UI language. */
export function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export { uid } from './id';
