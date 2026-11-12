import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppData, Snapshot } from '../types';
import { currentMonth, goalsRemaining, history, nextMonth, receivablesTotal, salaryPlan } from '../calc';
import { evaluate } from '../expr';
import { money, monthLabel, signedMoney } from '../format';
import { ExprInput } from './ExprInput';
import { ConfirmButton } from './ConfirmButton';

type Update = (fn: (d: AppData) => AppData) => void;

const clean = (expr: string) => expr.trim().replace(/^=/, '').replace(/\s+/g, '');
const round2 = (v: number) => String(Math.round(v * 100) / 100);

/** An amount that follows a live value (e.g. the de primit list) until you type your own. */
function useLinked(live: string) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? live;
  return { value, linked: draft === null, set: setDraft, reset: () => setDraft(null), result: evaluate(value) };
}

function LinkedField({ label, source, resetLabel, field, preview }: {
  label: string; source: string; resetLabel: string; field: ReturnType<typeof useLinked>; preview?: string;
}) {
  return (
    <label className="grow">
      <span className="muted">{label} {field.linked ? <em>· {source}</em> : (
        <button type="button" className="linkish" onClick={field.reset}>{resetLabel}</button>
      )}</span>
      <input inputMode="decimal" value={field.value} onChange={(e) => field.set(e.target.value)} aria-invalid={field.result === null} />
      <small className="muted preview">{preview ?? ' '}</small>
    </label>
  );
}

export function AddMonth({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
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
        <span className="muted">{t('month.month')}</span>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} required />
      </label>
      <label className="grow">
        <span className="muted">{t('month.accounts')}</span>
        <input inputMode="decimal" placeholder="30000+1500" value={expr} onChange={(e) => setExpr(e.target.value)}
          aria-invalid={expr !== '' && accounts === null} />
        <small className="muted preview">{expr && accounts !== null ? `= ${money(accounts)}` : ' '}</small>
      </label>
      <LinkedField label={t('month.ing')} source={t('month.fromPlan')} resetLabel={t('month.resetPlan')} field={ing}
        preview={balance !== null ? t('month.balancePreview', { value: money(balance) }) : undefined} />
      <LinkedField label={t('month.receivables')} source={t('month.fromList')} resetLabel={t('month.resetList')} field={rec}
        preview={balance !== null ? t('month.realPreview', { value: money(balance + rec.result!) }) : undefined} />
      <button className="primary" disabled={!valid}>{exists ? t('month.update') : t('month.record')}</button>
    </form>
  );
}

export function HistoryTable({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
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
            <th>{t('table.month')}</th>
            <th className="num">{t('table.accounts')}</th>
            <th className="num">{t('table.ing')}</th>
            <th className="num">{t('table.balance')}</th>
            <th className="num">{t('table.receivables')}</th>
            <th className="num">{t('table.realTotal')}</th>
            <th className="num hide-md">{t('table.change')}</th>
            <th className="num hide-md">{t('table.free')}</th>
            <th aria-label={t('table.actions')} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const delta = prev ? r.withReceivables - prev.withReceivables : null;
            return (
              <tr key={r.month}>
                <td className="month">{monthLabel(r.month)}</td>
                <td className="num" data-label={t('table.accounts')}>
                  <ExprInput className="amount" value={r.snapshot.expr} ariaLabel={t('table.accountsFor', { month: r.month })}
                    onChange={(e) => patch(r.month, { expr: e })} />
                </td>
                <td className="num" data-label={t('table.ing')}>
                  <ExprInput className="amount" value={r.snapshot.ingExpr ?? ''} placeholder="—"
                    ariaLabel={t('table.ingFor', { month: r.month })}
                    onChange={(e) => patch(r.month, { ingExpr: e === '' ? undefined : e })} />
                </td>
                <td className="num" data-label={t('table.balance')}>{money(r.balance)}</td>
                <td className={`num ${r.hasReceivables ? '' : 'unrecorded'}`} data-label={t('table.receivables')}>
                  <ExprInput className="amount" value={r.snapshot.receivablesExpr ?? ''} placeholder={round2(today)}
                    ariaLabel={t('table.receivablesFor', { month: r.month })}
                    onChange={(e) => patch(r.month, { receivablesExpr: e === '' ? undefined : e })} />
                  {!r.hasReceivables && <span className="dotmark" title={t('table.unrecorded')}>*</span>}
                </td>
                <td className="num strong" data-label={t('table.realTotal')}>{money(r.withReceivables)}</td>
                <td className={`num delta hide-md ${delta === null ? '' : delta >= 0 ? 'up' : 'down'}`} data-label={t('table.change')}>
                  {delta === null ? '—' : <>{delta >= 0 ? '▲' : '▼'} {signedMoney(delta)}</>}
                </td>
                <td className={`num hide-md ${r.untilGoals < 0 ? 'neg' : ''}`} data-label={t('table.free')}
                  title={r.hasGoals ? undefined : t('table.todayGoals')}>{money(r.untilGoals)}</td>
                <td className="actions"><ConfirmButton className="icon ghost" ariaLabel={t('table.delete', { month: monthLabel(r.month) })}
                  onConfirm={() => remove(r.month)}>×</ConfirmButton></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="hint muted">
        {t('table.hintFormula')}
        {rows.some((r) => !r.hasIng) && ` ${t('table.hintNoIng')}`}
        {rows.some((r) => !r.hasReceivables) && ` ${t('table.hintUnrecorded')}`}
      </p>
    </div>
  );
}
