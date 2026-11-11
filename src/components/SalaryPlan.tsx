import { useTranslation } from 'react-i18next';
import type { AppData, SalaryPlan as Plan } from '../types';
import { salaryPlan } from '../calc';
import { money } from '../format';
import { ExprInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

export function SalaryPlan({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
  const set = (patch: Partial<Plan>) => update((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
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
          <button aria-label={t('plan.less')} onClick={() => set({ salaries: Math.max(0, p.salaries - 1) })}>−</button>
          <output>{p.salaries}</output>
          <button aria-label={t('plan.more')} onClick={() => set({ salaries: p.salaries + 1 })}>+</button>
        </div>
      </div>

      <dl className="plan">
        <dt>{t('plan.perSalary')}</dt>
        <dd><ExprInput className="amount" value={p.savingsPerSalary} ariaLabel={t('plan.perSalary')} onChange={(v) => set({ savingsPerSalary: v })} /> lei</dd>
        <dt>{t('plan.investPerSalary')}</dt>
        <dd><ExprInput className="amount" value={p.investPerSalaryEur} ariaLabel={t('plan.investPerSalary')} onChange={(v) => set({ investPerSalaryEur: v })} /> €</dd>
        <dt>{t('plan.xtbFree')}</dt>
        <dd><ExprInput className="amount" value={p.xtbFreeEur} ariaLabel={t('plan.xtbFree')} onChange={(v) => set({ xtbFreeEur: v })} /> €</dd>
        <dt>{t('plan.rate')}</dt>
        <dd><ExprInput className="amount" value={p.eurRate} placeholder={data.settings.eurRon.toFixed(4)} ariaLabel={t('plan.rateAria')} onChange={(v) => set({ eurRate: v })} /> <small className="muted">{p.eurRate ? t('plan.fixed') : t('plan.live')}</small></dd>
      </dl>

      <div className="split">
        <div><span className="muted">{t('plan.totalSaved')}</span><b>{money(s.totalSavings)}</b></div>
        <div><span className="muted">{t('plan.inStocks')}</span><b>{money(s.investedEur, 'EUR')}</b></div>
        <div><span className="muted">{t('plan.xtbShort')}</span><b>{money(s.xtbEur, 'EUR')}</b></div>
        <div className="hl"><span className="muted">{t('plan.onIng')}</span><b>{money(s.ing)}</b></div>
      </div>
      <p className="hint muted">{t('plan.hint')}</p>
    </section>
  );
}
