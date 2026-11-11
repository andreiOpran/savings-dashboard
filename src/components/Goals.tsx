import { useState } from 'react';
import type { AppData, Goal, GoalItem } from '../types';
import { goalStats, goalsRemaining } from '../calc';
import { num } from '../expr';
import { money, uid } from '../format';
import { ExprInput, TextInput } from './ExprInput';
import { CurrencyToggle } from './Receivables';

type Update = (fn: (d: AppData) => AppData) => void;

export function Goals({ data, update }: { data: AppData; update: Update }) {
  const [showArchived, setShowArchived] = useState(false);
  const setGoal = (id: string, fn: (g: Goal) => Goal) =>
    update((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? fn(g) : g)) }));
  const add = () => update((d) => ({
    ...d,
    goals: [...d.goals, {
      id: uid(), name: 'New goal', currency: 'RON', countInTotal: true, archived: false,
      items: [{ id: uid(), label: 'Item', expr: '0', paid: false }],
    }],
  }));

  const active = data.goals.filter((g) => !g.archived);
  const archived = data.goals.filter((g) => g.archived);

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>Goals</h2>
          <p className="muted">What's still left to pay</p>
        </div>
        <div className="card-total">{money(goalsRemaining(data))}</div>
      </header>
      <div className="goals">
        {active.map((g) => (
          <GoalCard key={g.id} goal={g} eurRon={data.settings.eurRon}
            onChange={(fn) => setGoal(g.id, fn)}
            onDelete={() => update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) }))} />
        ))}
      </div>
      <button className="add" onClick={add}>+ New goal</button>
      {archived.length > 0 && (
        <details className="idle" open={showArchived} onToggle={(e) => setShowArchived((e.target as HTMLDetailsElement).open)}>
          <summary>{archived.length} archived</summary>
          <div className="goals">
            {archived.map((g) => (
              <GoalCard key={g.id} goal={g} eurRon={data.settings.eurRon}
                onChange={(fn) => setGoal(g.id, fn)}
                onDelete={() => update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) }))} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function GoalCard({ goal, eurRon, onChange, onDelete }: {
  goal: Goal; eurRon: number; onChange: (fn: (g: Goal) => Goal) => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const s = goalStats(goal, eurRon);
  const setItem = (id: string, patch: Partial<GoalItem>) =>
    onChange((g) => ({ ...g, items: g.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  return (
    <article className={`goal ${s.done ? 'is-done' : ''} ${goal.countInTotal ? '' : 'is-excluded'}`}>
      <button className="goal-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="goal-name">
          {goal.name}
          {s.done && <span className="badge good">✓ Done</span>}
          {!goal.countInTotal && <span className="badge">Not in total</span>}
        </span>
        <span className="goal-left">
          {s.done ? money(s.total, goal.currency) : <>{money(s.remaining, goal.currency)} <small>left</small></>}
          {goal.currency === 'EUR' && !s.done && <small className="muted"> ≈ {money(s.remainingRon)}</small>}
        </span>
        <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.round(s.progress * 100)} aria-label={`${goal.name} progress`}>
          <span style={{ width: `${s.progress * 100}%` }} />
        </span>
        <span className="goal-meta muted">
          {money(s.paid, goal.currency)} of {money(s.total, goal.currency)} · {goal.items.filter((i) => i.paid).length}/{goal.items.length} paid
          <span className="chev" aria-hidden>{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="goal-body">
          <div className="goal-tools">
            <TextInput className="grow" value={goal.name} ariaLabel="Goal name" onChange={(name) => onChange((g) => ({ ...g, name }))} />
            <CurrencyToggle value={goal.currency} onChange={(currency) => onChange((g) => ({ ...g, currency }))} />
          </div>
          <ul className="rows">
            {goal.items.map((it) => (
              <li key={it.id} className={`row ${it.paid ? 'is-done' : ''} ${num(it.expr) < 0 ? 'is-offset' : ''}`}>
                <label className="check" title={it.paid ? 'Mark as unpaid' : 'Mark as paid'}>
                  <input type="checkbox" checked={it.paid} onChange={(e) => setItem(it.id, { paid: e.target.checked })} />
                </label>
                <TextInput className="grow" value={it.label} ariaLabel="Item" onChange={(label) => setItem(it.id, { label })} />
                <ExprInput className="amount" value={it.expr} ariaLabel={`Cost of ${it.label}`} onChange={(expr) => setItem(it.id, { expr })} />
                <button className="icon ghost" aria-label={`Delete ${it.label}`}
                  onClick={() => onChange((g) => ({ ...g, items: g.items.filter((x) => x.id !== it.id) }))}>×</button>
              </li>
            ))}
          </ul>
          <p className="hint muted">Tick items once paid. Use a negative amount for money you get towards it (e.g. −2100 from parents).</p>
          <div className="goal-actions">
            <button className="add" onClick={() => onChange((g) => ({ ...g, items: [...g.items, { id: uid(), label: 'Item', expr: '0', paid: false }] }))}>+ Item</button>
            <span className="spacer" />
            <label className="switch">
              <input type="checkbox" checked={goal.countInTotal} onChange={(e) => onChange((g) => ({ ...g, countInTotal: e.target.checked }))} />
              Count in goals total
            </label>
            <button className="ghost" onClick={() => onChange((g) => ({ ...g, archived: !g.archived }))}>{goal.archived ? 'Unarchive' : 'Archive'}</button>
            <button className="ghost danger" onClick={() => confirm(`Delete goal “${goal.name}”?`) && onDelete()}>Delete</button>
          </div>
        </div>
      )}
    </article>
  );
}
