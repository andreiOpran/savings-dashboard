import type { AppData, Receivable } from '../types';
import { num } from '../expr';
import { money, uid } from '../format';
import { receivablesTotal } from '../calc';
import { ExprInput, TextInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

export function Receivables({ data, update }: { data: AppData; update: Update }) {
  const set = (id: string, patch: Partial<Receivable>) =>
    update((d) => ({ ...d, receivables: d.receivables.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const remove = (id: string) => update((d) => ({ ...d, receivables: d.receivables.filter((r) => r.id !== id) }));
  const add = () => update((d) => ({
    ...d,
    receivables: [...d.receivables, { id: uid(), label: 'New', expr: '0', currency: 'RON', received: false }],
  }));

  const open = data.receivables.filter((r) => !r.received && num(r.expr) !== 0);
  const idle = data.receivables.filter((r) => r.received || num(r.expr) === 0);

  const row = (r: Receivable) => (
    <li key={r.id} className={`row ${r.received ? 'is-done' : ''} ${num(r.expr) === 0 ? 'is-zero' : ''}`}>
      <label className="check" title={r.received ? 'Mark as not received' : 'Mark as received'}>
        <input type="checkbox" checked={r.received} onChange={(e) => set(r.id, { received: e.target.checked })} />
      </label>
      <TextInput className="grow" value={r.label} ariaLabel="Who owes you" onChange={(label) => set(r.id, { label })} />
      <ExprInput className="amount" value={r.expr} ariaLabel={`Amount for ${r.label}`} onChange={(expr) => set(r.id, { expr })} />
      <CurrencyToggle value={r.currency} onChange={(currency) => set(r.id, { currency })} />
      <button className="icon ghost" aria-label={`Delete ${r.label}`} onClick={() => remove(r.id)}>×</button>
    </li>
  );

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>De primit</h2>
          <p className="muted">Money you're still owed</p>
        </div>
        <div className="card-total">{money(receivablesTotal(data))}</div>
      </header>
      <ul className="rows">{open.map(row)}</ul>
      {idle.length > 0 && (
        <details className="idle">
          <summary>{idle.length} received or empty</summary>
          <ul className="rows">{idle.map(row)}</ul>
        </details>
      )}
      <button className="add" onClick={add}>+ Add</button>
    </section>
  );
}

export function CurrencyToggle({ value, onChange }: { value: 'RON' | 'EUR'; onChange: (v: 'RON' | 'EUR') => void }) {
  return (
    <button
      className="cur"
      title="Switch currency"
      aria-label={`Currency ${value}, click to switch`}
      onClick={() => onChange(value === 'RON' ? 'EUR' : 'RON')}
    >
      {value === 'EUR' ? '€' : 'lei'}
    </button>
  );
}
