import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppData, Exchange, SalaryPlan as Plan } from '../types';
import { salaryPlan, sortedExchanges } from '../calc';
import { evaluate, num } from '../expr';
import { money, uid } from '../format';
import { ExprInput } from './ExprInput';
import { ConfirmButton } from './ConfirmButton';

type Update = (fn: (d: AppData) => AppData) => void;

const VISIBLE = 4;
const today = () => new Date().toISOString().slice(0, 10);
const fmtRate = (r: number) => r.toFixed(4);

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

      <div className="stepper-row">
        <span>{t('plan.salaries')}</span>
        <div className="stepper">
          <button aria-label={t('plan.less')} onClick={() => setPlan({ salaries: Math.max(0, p.salaries - 1) })}>−</button>
          <output>{p.salaries}</output>
          <button aria-label={t('plan.more')} onClick={() => setPlan({ salaries: p.salaries + 1 })}>+</button>
        </div>
      </div>

      <dl className="plan">
        <dt>{t('plan.perSalary')}</dt>
        <dd><ExprInput className="amount" value={p.savingsPerSalary} ariaLabel={t('plan.perSalary')} onChange={(v) => setPlan({ savingsPerSalary: v })} /> lei</dd>
        <dt>{t('plan.investPerSalary')}</dt>
        <dd><ExprInput className="amount" value={p.investPerSalaryEur} ariaLabel={t('plan.investPerSalary')} onChange={(v) => setPlan({ investPerSalaryEur: v })} /> €</dd>
      </dl>

      <div className="split">
        <div><span className="muted">{t('plan.totalSaved')}</span><b>{money(s.totalSavings)}</b></div>
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
      {s.invest.count !== p.salaries && (
        <p className="hint muted">{t('plan.mismatch', { salaries: p.salaries, count: s.invest.count })}</p>
      )}

      <p className="hint muted">{t('plan.hint')}</p>
    </section>
  );
}

/** The euro purchases behind the salary split: log form beside the list on wide screens. */
export function Exchanges({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
  const setExchanges = (fn: (xs: Exchange[]) => Exchange[]) =>
    update((d) => ({ ...d, plan: { ...d.plan, exchanges: fn(d.plan.exchanges) } }));
  const list = sortedExchanges(data.plan.exchanges);

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{t('exchange.title')}</h2>
          <p className="muted">{t('exchange.subtitle')}</p>
        </div>
      </header>
      <div className="exchanges-layout">
        <LogExchange data={data} onAdd={(x) => setExchanges((xs) => [...xs, x])} />
        <div className="exchanges-list">
          {list.length > 0 ? (
            <ul className="exchanges">
              {list.slice(0, VISIBLE).map((x) => <ExchangeRow key={x.id} x={x} setExchanges={setExchanges} />)}
            </ul>
          ) : <p className="muted">{t('exchange.empty')}</p>}
          {list.length > VISIBLE && (
            <details className="idle">
              <summary>{t('exchange.older', { count: list.length - VISIBLE })}</summary>
              <ul className="exchanges">
                {list.slice(VISIBLE).map((x) => <ExchangeRow key={x.id} x={x} setExchanges={setExchanges} />)}
              </ul>
            </details>
          )}
        </div>
      </div>
    </section>
  );
}

function LogExchange({ data, onAdd }: { data: AppData; onAdd: (x: Exchange) => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Exchange['kind']>('invest');
  const [date, setDate] = useState(today);
  const [eur, setEur] = useState<string | null>(null); // null = follow the default for the kind
  const [rate, setRate] = useState<string | null>(null); // null = follow the current EUR/RON
  const eurExpr = eur ?? (kind === 'invest' ? data.plan.investPerSalaryEur : '');
  const rateExpr = rate ?? fmtRate(data.settings.eurRon);
  const eurValue = evaluate(eurExpr);
  const rateValue = evaluate(rateExpr);
  const valid = eurExpr.trim() !== '' && eurValue !== null && eurValue > 0 && rateValue !== null && rateValue > 0 && !!date;

  const add = () => {
    if (!valid) return;
    onAdd({ id: uid(), date, kind, eurExpr: eurExpr.trim().replace(/^=/, '').replace(/\s+/g, ''), rate: rateValue! });
    setEur(null);
    setRate(null);
  };

  return (
    <form className="log-exchange" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div className="seg" role="radiogroup" aria-label={t('exchange.kind')}>
        {(['invest', 'xtb'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k}
            onClick={() => { setKind(k); setEur(null); }}>{t(`exchange.${k}`)}</button>
        ))}
      </div>
      <div className="log-fields">
        <label>
          <span className="muted">{t('exchange.date')}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          <span className="muted">{t('exchange.eur')}</span>
          <input inputMode="decimal" value={eurExpr} placeholder="0" onChange={(e) => setEur(e.target.value)}
            aria-invalid={eurExpr !== '' && eurValue === null} />
        </label>
        <label>
          <span className="muted">{t('exchange.rate')}</span>
          <input inputMode="decimal" value={rateExpr} onChange={(e) => setRate(e.target.value)}
            aria-invalid={rateValue === null} />
        </label>
      </div>
      <div className="log-foot">
        <span className="muted">{valid ? t('exchange.costs', { ron: money(eurValue! * rateValue!, 'RON', true) }) : ' '}</span>
        <button className="primary" disabled={!valid}>{t('exchange.add')}</button>
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
        <span className={`badge ${x.kind}`}>{t(`exchange.${x.kind}Short`)}</span>
      </span>
      <span className="ex-math">
        <ExprInput className="amount eur" value={x.eurExpr} ariaLabel={t('exchange.eur')} onChange={(v) => patch({ eurExpr: v })} />
        <span className="muted">€ ×</span>
        <ExprInput className="amount ex-rate" value={fmtRate(x.rate)} ariaLabel={t('exchange.rate')}
          onChange={(v) => { const r = num(v); if (r > 0) patch({ rate: r }); }} />
        <span className="ex-ron">= {money(eur * x.rate)}</span>
      </span>
      <ConfirmButton className="icon ghost" ariaLabel={t('exchange.delete')}
        onConfirm={() => setExchanges((xs) => xs.filter((y) => y.id !== x.id))}>×</ConfirmButton>
    </li>
  );
}
