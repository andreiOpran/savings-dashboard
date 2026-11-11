import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppData, Goal, GoalItem } from '../types';
import { goalFromTemplate, goalStats, goalsRemaining } from '../calc';
import { num } from '../expr';
import { money, uid } from '../format';
import { ExprInput, TextInput } from './ExprInput';
import { CurrencyToggle } from './Receivables';
import { ConfirmButton } from './ConfirmButton';

type Update = (fn: (d: AppData) => AppData) => void;

export function Goals({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const setGoal = (id: string, fn: (g: Goal) => Goal) =>
    update((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? fn(g) : g)) }));
  const remove = (id: string) => update((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== id) }));
  const add = () => {
    const g: Goal = {
      id: uid(), name: t('goals.newName'), currency: 'RON', countInTotal: true, archived: false,
      items: [{ id: uid(), label: t('goals.newItem'), expr: '0', paid: false }],
    };
    update((d) => ({ ...d, goals: [...d.goals, g] }));
    setOpenId(g.id);
  };
  const fromTemplate = (goal: Goal) => {
    const g = goalFromTemplate(goal, t('goals.templateName', { name: goal.name }));
    update((d) => ({ ...d, goals: [...d.goals, g] }));
    setOpenId(g.id);
  };

  const active = data.goals.filter((g) => !g.archived);
  const past = data.goals.filter((g) => g.archived);
  const card = (g: Goal) => (
    <GoalCard key={g.id} goal={g} eurRon={data.settings.eurRon}
      open={openId === g.id} onToggle={() => setOpenId(openId === g.id ? null : g.id)}
      onChange={(fn) => setGoal(g.id, fn)} onDelete={() => remove(g.id)} onTemplate={() => fromTemplate(g)} />
  );

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{t('goals.title')}</h2>
          <p className="muted">{t('goals.subtitle')}</p>
        </div>
        <div className="card-total">{money(goalsRemaining(data))}</div>
      </header>
      <div className="goals">{active.map(card)}</div>
      <button className="add" onClick={add}>{t('goals.add')}</button>
      {past.length > 0 && (
        <details className="idle">
          <summary>{t('goals.past', { count: past.length })}</summary>
          <div className="goals">{past.map(card)}</div>
        </details>
      )}
    </section>
  );
}

function GoalCard({ goal, eurRon, open, onToggle, onChange, onDelete, onTemplate }: {
  goal: Goal; eurRon: number; open: boolean; onToggle: () => void;
  onChange: (fn: (g: Goal) => Goal) => void; onDelete: () => void; onTemplate: () => void;
}) {
  const { t } = useTranslation();
  const s = goalStats(goal, eurRon);
  const past = goal.archived;
  const setItem = (id: string, patch: Partial<GoalItem>) =>
    onChange((g) => ({ ...g, items: g.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  return (
    <article className={`goal ${s.done ? 'is-done' : ''} ${goal.countInTotal || past ? '' : 'is-excluded'} ${past ? 'is-past' : ''}`}>
      <button className="goal-summary" aria-expanded={open} onClick={onToggle}>
        <span className="goal-name">
          {goal.name}
          {past ? <span className="badge">{t('goals.pastBadge')}</span> : <>
            {s.done && <span className="badge good">✓ {t('goals.done')}</span>}
            {!goal.countInTotal && <span className="badge">{t('goals.notInTotal')}</span>}
          </>}
        </span>
        <span className="goal-left">
          {past || s.done
            ? <>{money(s.total, goal.currency)} {past && <small>{t('goals.total')}</small>}</>
            : <>{money(s.remaining, goal.currency)} <small>{t('goals.left')}</small></>}
          {goal.currency === 'EUR' && !s.done && !past && <small className="muted"> ≈ {money(s.remainingRon)}</small>}
        </span>
        {!past && (
          <span className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={Math.round(s.progress * 100)} aria-label={t('goals.progress', { name: goal.name })}>
            <span style={{ width: `${s.progress * 100}%` }} />
          </span>
        )}
        <span className="goal-meta muted">
          {past
            ? t('goals.pastSummary', { count: goal.items.length })
            : t('goals.paidOf', {
                paid: money(s.paid, goal.currency), total: money(s.total, goal.currency),
                done: goal.items.filter((i) => i.paid).length, count: goal.items.length,
              })}
          <span className="chev" aria-hidden>{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="goal-body">
          <div className="goal-tools">
            <TextInput className="grow" value={goal.name} ariaLabel={t('goals.name')} onChange={(name) => onChange((g) => ({ ...g, name }))} />
            <CurrencyToggle value={goal.currency} onChange={(currency) => onChange((g) => ({ ...g, currency }))} />
          </div>
          <ul className="rows">
            {goal.items.map((it) => (
              <li key={it.id} className={`row ${it.paid && !past ? 'is-done' : ''} ${num(it.expr) < 0 ? 'is-offset' : ''}`}>
                {!past && (
                  <label className="check" title={it.paid ? t('goals.markUnpaid') : t('goals.markPaid')}>
                    <input type="checkbox" checked={it.paid} onChange={(e) => setItem(it.id, { paid: e.target.checked })} />
                  </label>
                )}
                <TextInput className="grow" value={it.label} ariaLabel={t('goals.item')} onChange={(label) => setItem(it.id, { label })} />
                <ExprInput className="amount" value={it.expr} ariaLabel={t('goals.costOf', { label: it.label })} onChange={(expr) => setItem(it.id, { expr })} />
                <button className="icon ghost" aria-label={t('goals.deleteItem', { label: it.label })}
                  onClick={() => onChange((g) => ({ ...g, items: g.items.filter((x) => x.id !== it.id) }))}>×</button>
              </li>
            ))}
          </ul>
          <p className="hint muted">{past ? t('goals.templateHint') : t('goals.hint')}</p>
          <div className="goal-actions">
            {past ? (
              <button className="primary" onClick={onTemplate}>{t('goals.template')}</button>
            ) : (
              <>
                <button className="add" onClick={() => onChange((g) => ({ ...g, items: [...g.items, { id: uid(), label: t('goals.newItem'), expr: '0', paid: false }] }))}>{t('goals.addItem')}</button>
                <span className="spacer" />
                <label className="switch">
                  <input type="checkbox" checked={goal.countInTotal} onChange={(e) => onChange((g) => ({ ...g, countInTotal: e.target.checked }))} />
                  {t('goals.countInTotal')}
                </label>
              </>
            )}
            {past && <span className="spacer" />}
            <button className="ghost" onClick={() => onChange((g) => ({ ...g, archived: !g.archived }))}>{past ? t('goals.restore') : t('goals.archive')}</button>
            <ConfirmButton className="ghost danger" onConfirm={onDelete}>{t('goals.delete')}</ConfirmButton>
          </div>
        </div>
      )}
    </article>
  );
}
