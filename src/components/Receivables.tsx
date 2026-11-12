import { useTranslation } from 'react-i18next';
import type { AppData, Receivable } from '../types';
import { num } from '../expr';
import { money, monthLabel, uid } from '../format';
import { currentMonth, receivablesTotal, setReceived, toRon } from '../calc';
import { useState } from 'react';
import { ExprInput, TextInput } from './ExprInput';

type Update = (fn: (d: AppData) => AppData) => void;

export function Receivables({ data, update }: { data: AppData; update: Update }) {
  const { t } = useTranslation();
  const set = (id: string, patch: Partial<Receivable>) =>
    update((d) => ({ ...d, receivables: d.receivables.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const remove = (id: string) => update((d) => ({ ...d, receivables: d.receivables.filter((r) => r.id !== id) }));
  const add = () => update((d) => ({
    ...d,
    receivables: [...d.receivables, { id: uid(), label: t('receivables.newLabel'), expr: '0', currency: 'RON', received: false }],
  }));

  /** Feedback after ticking or reopening, with an undo for a tick made by mistake. */
  const [note, setNote] = useState<{ text: string; undoId?: string; ok?: boolean } | null>(null);
  const toggle = (r: Receivable, received: boolean) => {
    const month = currentMonth();
    const recorded = data.snapshots.some((s) => s.month === month);
    const amount = toRon(num(r.expr), r.currency, data.settings.eurRon);
    update((d) => setReceived(d, r.id, received, month));
    if (!received) setNote({ text: t('receivables.reopened', { label: r.label }) });
    else if (amount === 0) setNote(null);
    else if (recorded) setNote({ text: t('receivables.moved', { amount: money(amount), month: monthLabel(month) }), undoId: r.id, ok: true });
    else setNote({ text: t('receivables.notMoved', { month: monthLabel(month) }), undoId: r.id });
  };
  const undo = (id: string) => {
    update((d) => setReceived(d, id, false, currentMonth(), { undo: true }));
    setNote(null);
  };

  const open = data.receivables.filter((r) => !r.received && num(r.expr) !== 0);
  const idle = data.receivables.filter((r) => r.received || num(r.expr) === 0);

  const row = (r: Receivable) => (
    <li key={r.id} className={`row ${r.received ? 'is-done' : ''} ${num(r.expr) === 0 ? 'is-zero' : ''}`}>
      <label className="check" title={r.received ? t('receivables.markNotReceived') : t('receivables.markReceived')}>
        <input type="checkbox" checked={r.received} onChange={(e) => toggle(r, e.target.checked)} />
      </label>
      <TextInput className="grow" value={r.label} ariaLabel={t('receivables.who')} onChange={(label) => set(r.id, { label })} />
      <ExprInput className="amount" value={r.expr} ariaLabel={t('receivables.amountFor', { label: r.label })} onChange={(expr) => set(r.id, { expr })} />
      <CurrencyToggle value={r.currency} onChange={(currency) => set(r.id, { currency })} />
      <button className="icon ghost" aria-label={t('receivables.delete', { label: r.label })} onClick={() => remove(r.id)}>×</button>
    </li>
  );

  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h2>{t('receivables.title')}</h2>
          <p className="muted">{t('receivables.subtitle')}</p>
        </div>
        <div className="card-total">{money(receivablesTotal(data))}</div>
      </header>
      <ul className="rows">{open.map(row)}</ul>
      {idle.length > 0 && (
        <details className="idle">
          <summary>{t('receivables.idle', { count: idle.length })}</summary>
          <ul className="rows">{idle.map(row)}</ul>
        </details>
      )}
      {note && (
        <p className={`hint note ${note.ok ? 'moved' : ''}`} role="status">
          <span>{note.text}</span>
          {note.undoId && <button type="button" className="linkish" onClick={() => undo(note.undoId!)}>{t('receivables.undo')}</button>}
        </p>
      )}
      <button className="add" onClick={add}>{t('receivables.add')}</button>
    </section>
  );
}

export function CurrencyToggle({ value, onChange }: { value: 'RON' | 'EUR'; onChange: (v: 'RON' | 'EUR') => void }) {
  const { t } = useTranslation();
  return (
    <button
      className="cur"
      title={t('currency.switch')}
      aria-label={t('currency.label', { currency: value })}
      onClick={() => onChange(value === 'RON' ? 'EUR' : 'RON')}
    >
      {value === 'EUR' ? '€' : 'lei'}
    </button>
  );
}
