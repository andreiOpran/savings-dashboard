import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppData, Exchange, SalaryEntry, SalaryPlan as Plan } from '../types';
import { currentMonth, nextMonth, salaryPlan, salaryToIng, sortedExchanges, sortedSalaries } from '../calc';
import { evaluate, num } from '../expr';
import { money, monthLabel, uid } from '../format';
import { ExprInput } from './ExprInput';
import { ConfirmButton } from './ConfirmButton';

type Update = (fn: (d: AppData) => AppData) => void;

const VISIBLE = 4;
const today = () => new Date().toISOString().slice(0, 10);
const fmtRate = (r: number) => r.toFixed(4);
const clean = (e: string) => e.trim().replace(/^=/, '').replace(/\s+/g, '');

/** Summary: totals, where the money went, and the defaults for a new salary. */
export function SalaryPlan({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
  const setPlan = (patch: Partial<Plan>) => update((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const p = data.plan;
  const s = salaryPlan(data);

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{t('plan.title')}</h2>
          <p className="muted">{t('plan.subtitle')}</p>
        </div>
      </header>

      <div className="split">
        <div>
          <span className="muted">{t('plan.totalSaved')}</span><b>{money(s.totalSavings)}</b>
          <small className="muted">{t('plan.salaryCount', { count: s.salaryCount })}</small>
        </div>
        <div>
          <span className="muted">{t('plan.inStocks')}</span><b>{money(s.invest.eur, 'EUR')}</b>
          <small className="muted">{t('plan.costAt', { ron: money(s.invest.ron), rate: fmtRate(s.invest.avgRate) })}</small>
        </div>
        <div>
          <span className="muted">{t('plan.xtbShort')}</span><b>{money(s.xtb.eur, 'EUR')}</b>
          <small className="muted">{t('plan.costAt', { ron: money(s.xtb.ron), rate: fmtRate(s.xtb.avgRate) })}</small>
        </div>
        <div className="hl"><span className="muted">{t('plan.onIng')}</span><b>{money(s.ing)}</b></div>
      </div>

      <h3 className="subhead">{t('plan.defaults')}</h3>
      <dl className="plan">
        <dt>{t('plan.perSalary')}</dt>
        <dd><ExprInput className="amount" value={p.savingsPerSalary} ariaLabel={t('plan.perSalary')} onChange={(v) => setPlan({ savingsPerSalary: v })} /> lei</dd>
        <dt>{t('plan.investPerSalary')}</dt>
        <dd><ExprInput className="amount" value={p.investPerSalaryEur} ariaLabel={t('plan.investPerSalary')} onChange={(v) => setPlan({ investPerSalaryEur: v })} /> €</dd>
      </dl>
      <p className="hint muted">{t('plan.hint')}</p>
    </section>
  );
}

/** The monthly salary log beside the XTB transfers. */
export function Exchanges({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
  const setSalaries = (fn: (xs: SalaryEntry[]) => SalaryEntry[]) =>
    update((d) => ({ ...d, plan: { ...d.plan, salaries: fn(d.plan.salaries) } }));
  const setExchanges = (fn: (xs: Exchange[]) => Exchange[]) =>
    update((d) => ({ ...d, plan: { ...d.plan, exchanges: fn(d.plan.exchanges) } }));
  const salaries = sortedSalaries(data.plan.salaries);
  const xtb = sortedExchanges(data.plan.exchanges.filter((x) => x.kind === 'xtb'));

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{t('salaries.title')}</h2>
          <p className="muted">{t('salaries.subtitle')}</p>
        </div>
      </header>
      <div className="logs">
        <div className="log">
          <h3 className="subhead">{t('salaries.logTitle')}</h3>
          <AddSalary data={data} onAdd={(x) => setSalaries((xs) => [...xs, x])} />
          <Collapsible items={salaries} empty={t('salaries.empty')} older={(n) => t('salaries.older', { count: n })}
            render={(x) => <SalaryRow key={x.id} x={x} setSalaries={setSalaries} />} />
        </div>
        <div className="log">
          <h3 className="subhead">{t('exchange.xtbTitle')}</h3>
          <AddXtb data={data} onAdd={(x) => setExchanges((xs) => [...xs, x])} />
          <Collapsible items={xtb} empty={t('exchange.empty')} older={(n) => t('exchange.older', { count: n })}
            render={(x) => <ExchangeRow key={x.id} x={x} setExchanges={setExchanges} />} />
        </div>
      </div>
    </section>
  );
}

function Collapsible<T>({ items, empty, older, render }: {
  items: T[]; empty: string; older: (n: number) => string; render: (x: T) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="muted empty-log">{empty}</p>;
  return (
    <>
      <ul className="exchanges">{items.slice(0, VISIBLE).map(render)}</ul>
      {items.length > VISIBLE && (
        <details className="idle">
          <summary>{older(items.length - VISIBLE)}</summary>
          <ul className="exchanges">{items.slice(VISIBLE).map(render)}</ul>
        </details>
      )}
    </>
  );
}

/** Field that shows a default until you type your own value. */
function useDefault(fallback: string) {
  const [own, setOwn] = useState<string | null>(null);
  const value = own ?? fallback;
  return { value, set: setOwn, reset: () => setOwn(null), result: evaluate(value) };
}

function AddSalary({ data, onAdd }: { data: AppData; onAdd: (x: SalaryEntry) => void }) {
  const { t } = useTranslation();
  const months = data.plan.salaries.map((s) => s.month).filter(Boolean).sort() as string[];
  const latest = months[months.length - 1];
  const suggested = !latest || latest < currentMonth() ? currentMonth() : nextMonth(latest);
  const [month, setMonth] = useState<string | null>(null);
  const m = month ?? suggested;
  const saved = useDefault(data.plan.savingsPerSalary);
  const invest = useDefault(data.plan.investPerSalaryEur);
  const rate = useDefault(fmtRate(data.settings.eurRon));
  const ok = [saved, invest, rate].every((f) => f.result !== null) && saved.result! >= 0 && invest.result! >= 0 && rate.result! > 0 && /^\d{4}-\d{2}$/.test(m);
  const toIng = ok ? saved.result! - invest.result! * rate.result! : null;
  const exists = data.plan.salaries.some((s) => s.month === m);

  const add = () => {
    if (!ok) return;
    onAdd({ id: uid(), month: m, savedExpr: clean(saved.value) || '0', investEurExpr: clean(invest.value) || '0', rate: rate.result! });
    setMonth(null); saved.reset(); invest.reset(); rate.reset();
  };

  return (
    <form className="log-exchange" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div className="log-fields four">
        <label>
          <span className="muted">{t('salaries.month')}</span>
          <input type="month" value={m} onChange={(e) => setMonth(e.target.value)} required />
        </label>
        <label>
          <span className="muted">{t('salaries.saved')}</span>
          <input inputMode="decimal" value={saved.value} onChange={(e) => saved.set(e.target.value)} aria-invalid={saved.result === null} />
        </label>
        <label>
          <span className="muted">{t('salaries.invested')}</span>
          <input inputMode="decimal" value={invest.value} onChange={(e) => invest.set(e.target.value)} aria-invalid={invest.result === null} />
        </label>
        <label>
          <span className="muted">{t('exchange.rate')}</span>
          <input inputMode="decimal" value={rate.value} onChange={(e) => rate.set(e.target.value)} aria-invalid={rate.result === null} />
        </label>
      </div>
      <div className="log-foot">
        <span className="muted">
          {toIng !== null ? t('salaries.preview', { cost: money(invest.result! * rate.result!), ing: money(toIng) }) : ' '}
          {exists && <><br /><span className="warn">{t('salaries.exists', { month: monthLabel(m) })}</span></>}
        </span>
        <button className="primary" disabled={!ok}>{t('salaries.add')}</button>
      </div>
    </form>
  );
}

function SalaryRow({ x, setSalaries }: { x: SalaryEntry; setSalaries: (fn: (xs: SalaryEntry[]) => SalaryEntry[]) => void }) {
  const { t } = useTranslation();
  const patch = (p: Partial<SalaryEntry>) => setSalaries((xs) => xs.map((y) => (y.id === x.id ? { ...y, ...p } : y)));
  const invested = num(x.investEurExpr);

  return (
    <li className="exchange salary">
      <span className="ex-when">
        {x.month
          ? <b>{monthLabel(x.month)}</b>
          : <span className="muted" title={t('salaries.importedHint')}>{t('exchange.imported')}</span>}
      </span>
      <span className="ex-math">
        <ExprInput className="amount" value={x.savedExpr} ariaLabel={t('salaries.saved')} onChange={(v) => patch({ savedExpr: v })} />
        <span className="muted">lei</span>
        <span className="muted sep">·</span>
        <ExprInput className="amount" value={x.investEurExpr} ariaLabel={t('salaries.invested')} onChange={(v) => patch({ investEurExpr: v })} />
        <span className="muted">€ ×</span>
        <ExprInput className="amount" value={fmtRate(x.rate)} ariaLabel={t('exchange.rate')}
          onChange={(v) => { const r = num(v); if (r > 0) patch({ rate: r }); }} />
      </span>
      <span className="ex-ron" title={t('salaries.toIngHint')}>
        <small className="muted">{invested > 0 ? t('salaries.costShort', { cost: money(invested * x.rate) }) : ' '}</small>
        {t('salaries.toIng', { ing: money(salaryToIng(x)) })}
      </span>
      <ConfirmButton className="icon ghost" ariaLabel={t('salaries.delete')}
        onConfirm={() => setSalaries((xs) => xs.filter((y) => y.id !== x.id))}>×</ConfirmButton>
    </li>
  );
}

function AddXtb({ data, onAdd }: { data: AppData; onAdd: (x: Exchange) => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today);
  const eur = useDefault('');
  const rate = useDefault(fmtRate(data.settings.eurRon));
  const ok = eur.value.trim() !== '' && eur.result !== null && eur.result > 0 && rate.result !== null && rate.result > 0 && !!date;

  const add = () => {
    if (!ok) return;
    onAdd({ id: uid(), date, kind: 'xtb', eurExpr: clean(eur.value), rate: rate.result! });
    eur.reset(); rate.reset();
  };

  return (
    <form className="log-exchange" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div className="log-fields">
        <label>
          <span className="muted">{t('exchange.date')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <span className="muted">{t('exchange.eur')}</span>
          <input inputMode="decimal" value={eur.value} placeholder="0" onChange={(e) => eur.set(e.target.value)}
            aria-invalid={eur.value !== '' && eur.result === null} />
        </label>
        <label>
          <span className="muted">{t('exchange.rate')}</span>
          <input inputMode="decimal" value={rate.value} onChange={(e) => rate.set(e.target.value)} aria-invalid={rate.result === null} />
        </label>
      </div>
      <div className="log-foot">
        <span className="muted">{ok ? t('exchange.costs', { ron: money(eur.result! * rate.result!, 'RON', true) }) : ' '}</span>
        <button className="primary" disabled={!ok}>{t('exchange.add')}</button>
      </div>
    </form>
  );
}

function ExchangeRow({ x, setExchanges }: { x: Exchange; setExchanges: (fn: (xs: Exchange[]) => Exchange[]) => void }) {
  const { t, i18n } = useTranslation();
  const patch = (p: Partial<Exchange>) => setExchanges((xs) => xs.map((y) => (y.id === x.id ? { ...y, ...p } : y)));
  const eur = num(x.eurExpr);
  const date = x.date
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${x.date}T00:00:00Z`))
    : t('exchange.imported');

  return (
    <li className="exchange">
      <span className="ex-when">
        <span className={x.date ? '' : 'muted'} title={x.date ? undefined : t('exchange.importedHint')}>{date}</span>
      </span>
      <span className="ex-math">
        <ExprInput className="amount" value={x.eurExpr} ariaLabel={t('exchange.eur')} onChange={(v) => patch({ eurExpr: v })} />
        <span className="muted">€ ×</span>
        <ExprInput className="amount" value={fmtRate(x.rate)} ariaLabel={t('exchange.rate')}
          onChange={(v) => { const r = num(v); if (r > 0) patch({ rate: r }); }} />
      </span>
      <span className="ex-ron">= {money(eur * x.rate)}</span>
      <ConfirmButton className="icon ghost" ariaLabel={t('exchange.delete')}
        onConfirm={() => setExchanges((xs) => xs.filter((y) => y.id !== x.id))}>×</ConfirmButton>
    </li>
  );
}
