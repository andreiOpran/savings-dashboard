import { useState } from 'react';
import type { AppData } from '../types';
import { currentMonth, goalsRemaining, history, nextMonth, receivablesTotal } from '../calc';
import { evaluate } from '../expr';
import { money, monthLabel, signedMoney } from '../format';
import { ExprInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

export function AddMonth({ data, update }: { data: AppData; update: Update }) {
  const latest = [...data.snapshots].sort((a, b) => b.month.localeCompare(a.month))[0];
  const suggested = latest ? (latest.month >= currentMonth() ? nextMonth(latest.month) : currentMonth()) : currentMonth();
  const [month, setMonth] = useState(suggested);
  const [expr, setExpr] = useState('');
  const exists = data.snapshots.some((s) => s.month === month);
  const value = evaluate(expr);
  const valid = expr.trim() !== '' && value !== null && /^\d{4}-\d{2}$/.test(month);

  const save = () => {
    if (!valid) return;
    const frozen = { receivables: receivablesTotal(data), goals: goalsRemaining(data) };
    update((d) => ({
      ...d,
      snapshots: [...d.snapshots.filter((s) => s.month !== month), { month, expr: expr.trim().replace(/^=/, ''), frozen }],
    }));
    setExpr('');
    setMonth(nextMonth(month));
  };

  return (
    <form className="add-month" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label>
        <span className="muted">Month</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
      </label>
      <label className="grow">
        <span className="muted">Total balance (all accounts)</span>
        <input inputMode="decimal" placeholder="e.g. 32119-4625" value={expr} onChange={(e) => setExpr(e.target.value)}
          aria-invalid={expr !== '' && value === null} />
      </label>
      <button className="primary" disabled={!valid}>{exists ? 'Update month' : 'Record month'}</button>
      {expr && value !== null && <span className="muted preview">= {money(value)}</span>}
    </form>
  );
}

export function HistoryTable({ data, update }: { data: AppData; update: Update }) {
  const rows = history(data).reverse();
  const setExpr = (month: string, expr: string) =>
    update((d) => ({ ...d, snapshots: d.snapshots.map((s) => (s.month === month ? { ...s, expr } : s)) }));
  const remove = (month: string) =>
    update((d) => ({ ...d, snapshots: d.snapshots.filter((s) => s.month !== month) }));

  return (
    <div className="table-wrap">
      <table className="history">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Balance</th>
            <th className="num">Change</th>
            <th className="num hide-sm">+ De primit</th>
            <th className="num">Free after goals</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const delta = prev ? r.balance - prev.balance : null;
            return (
              <tr key={r.month}>
                <td>
                  {monthLabel(r.month)}
                  {!r.frozen && <span className="dotmark" title="Recorded before snapshots existed: uses today's De primit and Goals values">*</span>}
                </td>
                <td className="num"><ExprInput className="amount" value={r.snapshot.expr} ariaLabel={`Balance ${r.month}`} onChange={(e) => setExpr(r.month, e)} /></td>
                <td className={`num delta ${delta === null ? '' : delta >= 0 ? 'up' : 'down'}`}>
                  {delta === null ? '—' : <>{delta >= 0 ? '▲' : '▼'} {signedMoney(delta)}</>}
                </td>
                <td className="num hide-sm">{money(r.withReceivables)}</td>
                <td className={`num ${r.untilGoals < 0 ? 'neg' : ''}`}>{money(r.untilGoals)}</td>
                <td><button className="icon ghost" aria-label={`Delete ${r.month}`}
                  onClick={() => confirm(`Delete ${monthLabel(r.month)}?`) && remove(r.month)}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => !r.frozen) && (
        <p className="hint muted">* Imported from the sheet — uses today's De primit and Goals. New months store their own values so history stops shifting.</p>
      )}
    </div>
  );
}
