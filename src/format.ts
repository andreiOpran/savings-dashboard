import type { Currency } from './types';

const fmt0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

export const money = (v: number, currency: Currency = 'RON', precise = false) =>
  `${(precise ? fmt2 : fmt0).format(v)} ${currency === 'EUR' ? '€' : 'lei'}`;

export const signedMoney = (v: number, currency: Currency = 'RON') =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${money(Math.abs(v), currency)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(month: string, withYear = true): string {
  const [y, m] = month.split('-').map(Number);
  return withYear ? `${MONTHS[m - 1]} ${y}` : MONTHS[m - 1];
}

export const uid = () => Math.random().toString(36).slice(2, 10);
