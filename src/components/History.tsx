import { useState } from 'react';
import type { AppData, Snapshot } from '../types';
import { currentMonth, goalsRemaining, history, nextMonth, receivablesTotal, salaryPlan } from '../calc';
import { evaluate } from '../expr';
import { money, monthLabel, signedMoney } from '../format';
import { ExprInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

const clean = (expr: string) => expr.trim().replace(/^=/, '').replace(/\s+/g, '');
const round2 = (v: number) => String(Math.round(v * 100) / 100);

/** An amount that follows a live value (e.g. the de primit list) until you type your own. */
function useLinked(live: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? live;
  return { value, linked: draft === null, set: setDraft, reset: () => setDraft(null), result: evaluate(value) };
}

function LinkedField({ label, source, field, preview }: {
  label: string; source: string; field: ReturnType<typeof useLinked>; preview?: string;
}) {
  return (
    <label className="grow">
      <span className="muted">{label} {field.linked ? <em>· {source}</em> : (
        <button type="button" className="linkish" onClick={field.reset}>reset to {source.replace(/^from /, '')}</button>
      )}</span>
      <input inputMode="decimal" value={field.value} onChange={(e) => field.set(e.target.value)} aria-invalid={field.result === null} />
      <small className="muted preview">{preview ?? ' '}</small>
    </label>
  );
}

export function AddMonth({ data, update }: { data: AppData; update: Update }) {
  const latest = [...data.snapshots].sort((a, b) => b.month.localeCompare(a.month))[0];
  const suggested = latest ? (latest.month >= currentMonth() ? nextMonth(latest.month) : currentMonth()) : currentMonth();
  const [month, setMonth] = useState(suggested);
  const [expr, setExpr] = useState('');
  const ing = useLinked(round2(salaryPlan(data).ing));
  const rec = useLinked(round2(receivablesTotal(data)));

  const exists = data.snapshots.some((s) => s.month === month);
  const accounts = evaluate(expr);
  const ok = expr.trim() !== '' && accounts !== null && ing.result !== null && rec.result !== null;
  const valid = ok && /^\d{4}-\d{2}$/.test(month);
  const balance = ok ? accounts! - ing.result! : null;

  const save = () => {
    if (!valid) return;
    const snap: Snapshot = {
      month,
      expr: clean(expr),
      ingExpr: clean(ing.value) || '0',
      receivablesExpr: clean(rec.value) || '0',
      goals: goalsRemaining(data),
    };
    update((d) => ({ ...d, snapshots: [...d.snapshots.filter((s) => s.month !== month), snap] }));
    setExpr('');
    ing.reset();
    rec.reset();
    setMonth(nextMonth(month));
  };

  return (
    <form className="add-month" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label>
        <span className="muted">Month</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
      </label>
      <label className="grow">
        <span className="muted">Total in accounts</span>
        <input inputMode="decimal" placeholder="e.g. 32119" value={expr} onChange={(e) => setExpr(e.target.value)}
          aria-invalid={expr !== '' && accounts === null} />
        <small className="muted preview">{expr && accounts !== null ? `= ${money(accounts)}` : ' '}</small>
      </label>
      <LinkedField label="− ING savings" source="from salary split" field={ing}
        preview={balance !== null ? `Balance ${money(balance)}` : undefined} />
      <LinkedField label="De primit" source="from your list" field={rec}
        preview={balance !== null ? `Real total ${money(balance + rec.result!)}` : undefined} />
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
            <th className="num hide-sm">In accounts</th>
            <th className="num hide-sm">− ING</th>
            <th className="num">Balance</th>
            <th className="num">De primit</th>
            <th className="num">Real total</th>
            <th className="num hide-md">Change</th>
            <th className="num hide-md">Free after goals</th>
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
                <td className="num hide-sm">
                  <ExprInput className="amount" value={r.snapshot.expr} ariaLabel={`In accounts ${r.month}`}
                    onChange={(e) => patch(r.month, { expr: e })} />
                </td>
                <td className="num hide-sm">
                  <ExprInput className="amount" value={r.snapshot.ingExpr ?? ''} placeholder="—"
                    ariaLabel={`ING savings ${r.month}`}
                    onChange={(e) => patch(r.month, { ingExpr: e === '' ? undefined : e })} />
                </td>
                <td className="num">{money(r.balance).replace(' lei', '')}</td>
                <td className={`num ${r.hasReceivables ? '' : 'unrecorded'}`}>
                  <ExprInput className="amount" value={r.snapshot.receivablesExpr ?? ''} placeholder={round2(today)}
                    ariaLabel={`De primit ${r.month}`}
                    onChange={(e) => patch(r.month, { receivablesExpr: e === '' ? undefined : e })} />
                  {!r.hasReceivables && <span className="dotmark" title="Not recorded for this month: using today's de primit. Type the real amount to fix it.">*</span>}
                </td>
                <td className="num strong">{money(r.withReceivables).replace(' lei', '')}<span className="unit hide-sm"> lei</span></td>
                <td className={`num delta hide-md ${delta === null ? '' : delta >= 0 ? 'up' : 'down'}`}>
                  {delta === null ? '—' : <>{delta >= 0 ? '▲' : '▼'} {signedMoney(delta)}</>}
                </td>
                <td className={`num hide-md ${r.untilGoals < 0 ? 'neg' : ''}`}
                  title={r.hasGoals ? undefined : "Uses today's goals total"}>{money(r.untilGoals)}</td>
                <td className="hide-sm"><button className="icon ghost" aria-label={`Delete ${r.month}`}
                  onClick={() => confirm(`Delete ${monthLabel(r.month)}?`) && remove(r.month)}>×</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint muted">
        Balance = in accounts − ING salary savings. Real total = balance + de primit; Change compares real totals.
        {rows.some((r) => !r.hasIng) && ' Months with “—” under ING were entered with the ING part already taken out.'}
        {rows.some((r) => !r.hasReceivables) && ' * De primit wasn’t tracked per month in the sheet, so those months show today’s total (greyed); type the real amount to make them exact.'}
      </p>
    </div>
  );
}
