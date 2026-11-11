import type { AppData, SalaryPlan as Plan } from '../types';
import { salaryPlan } from '../calc';
import { money } from '../format';
import { ExprInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

export function SalaryPlan({ data, update }: { data: AppData; update: Update }) {
  const set = (patch: Partial<Plan>) => update((d) => ({ ...d, plan: { ...d.plan, ...patch } }));
  const p = data.plan;
  const s = salaryPlan(data);

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>Salary split</h2>
          <p className="muted">How saved salaries are spread across accounts</p>
        </div>
      </header>

      <div className="stepper-row">
        <span>Salaries saved</span>
        <div className="stepper">
          <button aria-label="One less" onClick={() => set({ salaries: Math.max(0, p.salaries - 1) })}>−</button>
          <output>{p.salaries}</output>
          <button aria-label="One more" onClick={() => set({ salaries: p.salaries + 1 })}>+</button>
        </div>
      </div>

      <dl className="plan">
        <dt>Saved per salary</dt>
        <dd><ExprInput className="amount" value={p.savingsPerSalary} ariaLabel="Saved per salary" onChange={(v) => set({ savingsPerSalary: v })} /> lei</dd>
        <dt>Invested per salary</dt>
        <dd><ExprInput className="amount" value={p.investPerSalaryEur} ariaLabel="Invested per salary (EUR)" onChange={(v) => set({ investPerSalaryEur: v })} /> €</dd>
        <dt>XTB free funds</dt>
        <dd><ExprInput className="amount" value={p.xtbFreeEur} ariaLabel="XTB free funds (EUR)" onChange={(v) => set({ xtbFreeEur: v })} /> €</dd>
        <dt>EUR→RON for this</dt>
        <dd><ExprInput className="amount" value={p.eurRate} placeholder={data.settings.eurRon.toFixed(4)} ariaLabel="Fixed EUR rate, empty for live" onChange={(v) => set({ eurRate: v })} /> <small className="muted">{p.eurRate ? 'fixed' : 'live'}</small></dd>
      </dl>

      <div className="split">
        <div><span className="muted">Total saved</span><b>{money(s.totalSavings)}</b></div>
        <div><span className="muted">In stocks</span><b>{money(s.investedEur, 'EUR')}</b></div>
        <div><span className="muted">XTB free</span><b>{money(s.xtbEur, 'EUR')}</b></div>
        <div className="hl"><span className="muted">On ING</span><b>{money(s.ing)}</b></div>
      </div>
      <p className="hint muted">The ING amount is subtracted from your accounts total when you record a month.</p>
    </section>
  );
}
