import { useState } from 'react';
import type { AppData, Snapshot } from '../types';
import { currentMonth, goalsRemaining, history, nextMonth, receivablesTotal } from '../calc';
import { evaluate } from '../expr';
import { money, monthLabel, signedMoney } from '../format';
import { ExprInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

const clean = (expr: string) => expr.trim().replace(/^=/, '').replace(/\s+/g, '');
const round2 = (v: number) => String(Math.round(v * 100) / 100);

export function AddMonth({ data, update }: { data: AppData; update: Update }) {
  const latest = [...data.snapshots].sort((a, b) => b.month.localeCompare(a.month))[0];
  const suggested = latest ? (latest.month >= currentMonth() ? nextMonth(latest.month) : currentMonth()) : currentMonth();
  const [month, setMonth] = useState(suggested);
  const [expr, setExpr] = useState('');
  // De primit follows the live list until you type your own value.
  const listTotal = round2(receivablesTotal(data));
  const [recDraft, setRecDraft] = useState<string | null>(null);
  const recExpr = recDraft ?? listTotal;

  const exists = data.snapshots.some((s) => s.month === month);
  const value = evaluate(expr);
  const recValue = evaluate(recExpr);
  const valid = expr.trim() !== '' && value !== null && recValue !== null && /^\d{4}-\d{2}$/.test(month);

  const save = () => {
    if (!valid) return;
    const snap: Snapshot = { month, expr: clean(expr), receivablesExpr: clean(recExpr) || '0', goals: goalsRemaining(data) };
    update((d) => ({ ...d, snapshots: [...d.snapshots.filter((s) => s.month !== month), snap] }));
    setExpr('');
    setRecDraft(null);
    setMonth(nextMonth(month));
  };

  return (
    <form className="add-month" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label>
        <span className="muted">Month</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
      </label>
      <label className="grow">
        <span className="muted">Balance (all accounts)</span>
        <input inputMode="decimal" placeholder="e.g. 32119-4625" value={expr} onChange={(e) => setExpr(e.target.value)}
          aria-invalid={expr !== '' && value === null} />
        <small className="muted preview">{expr && value !== null ? `= ${money(value)}` : ' '}</small>
      </label>
      <label className="grow">
        <span className="muted">De primit {recDraft === null ? <em>· from your list</em> : (
          <button type="button" className="linkish" onClick={() => setRecDraft(null)}>reset to list</button>
        )}</span>
        <input inputMode="decimal" value={recExpr} onChange={(e) => setRecDraft(e.target.value)}
          aria-invalid={recValue === null} />
        <small className="muted preview">
          {value !== null && recValue !== null && expr ? `Real total ${money(value + recValue)}` : ' '}
        </small>
      </label>
      <button className="primary" disabled={!valid}>{exists ? 'Update month' : 'Record month'}</button>
    </form>
  );
}

export function HistoryTable({ data, update }: { data: AppData; update: Update }) {
  const rows = history(data).reverse();
  const today = receivablesTotal(data);
  const patch = (month: string, p: Partial<Snapshot>) =>
    update((d) => ({ ...d, snapshots: d.snapshots.map((s) => (s.month === month ? { ...s, ...p } : s)) }));
  const remove = (month: string) =>
    update((d) => ({ ...d, snapshots: d.snapshots.filter((s) => s.month !== month) }));

  return (
    <div className="table-wrap">
      <table className="history">
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Balance</th>
            <th className="num">De primit</th>
            <th className="num">Real total</th>
            <th className="num hide-sm">Change</th>
            <th className="num hide-sm">Free after goals</th>
            <th className="hide-sm" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const delta = prev ? r.withReceivables - prev.withReceivables : null;
            return (
              <tr key={r.month}>
                <td><span className="hide-sm">{monthLabel(r.month)}</span><span className="show-sm">{monthLabel(r.month, false)} ’{r.month.slice(2, 4)}</span></td>
                <td className="num">
                  <ExprInput className="amount" value={r.snapshot.expr} ariaLabel={`Balance ${r.month}`}
                    onChange={(e) => patch(r.month, { expr: e })} />
                </td>
                <td className={`num ${r.hasReceivables ? '' : 'unrecorded'}`}>
                  <ExprInput className="amount" value={r.snapshot.receivablesExpr ?? ''} placeholder={round2(today)}
                    ariaLabel={`De primit ${r.month}`}
                    onChange={(e) => patch(r.month, { receivablesExpr: e === '' ? undefined : e })} />
                  {!r.hasReceivables && <span className="dotmark" title="Not recorded for this month: using today's de primit. Type the real amount to fix it.">*</span>}
                </td>
                <td className="num strong">{money(r.withReceivables).replace(' lei', '')}<span className="unit hide-sm"> lei</span></td>
                <td className={`num delta hide-sm ${delta === null ? '' : delta >= 0 ? 'up' : 'down'}`}>
                  {delta === null ? '—' : <>{delta >= 0 ? '▲' : '▼'} {signedMoney(delta)}</>}
                </td>
                <td className={`num hide-sm ${r.untilGoals < 0 ? 'neg' : ''}`}
                  title={r.hasGoals ? undefined : "Uses today's goals total"}>{money(r.untilGoals)}</td>
                <td className="hide-sm"><button className="icon ghost" aria-label={`Delete ${r.month}`}
                  onClick={() => confirm(`Delete ${monthLabel(r.month)}?`) && remove(r.month)}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => !r.hasReceivables) && (
        <p className="hint muted">
          * De primit wasn't tracked per month in the sheet, so those months show today's total (greyed). Type what you
          were actually owed that month to make the real total exact. Real total = balance + de primit; Change compares real totals.
        </p>
      )}
    </div>
  );
}
