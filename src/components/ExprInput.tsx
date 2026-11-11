import { useEffect, useState } from 'react';
import { evaluate, isFormula } from '../expr';

interface Props {
  value: string;
  onChange: (expr: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
}

/**
 * Amount field that accepts spreadsheet-style arithmetic ("2600+150").
 * Commits on blur / Enter; shows the computed result while typing.
 */
export function ExprInput({ value, onChange, ariaLabel, placeholder, className }: Props) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);

  const result = evaluate(draft);
  const invalid = result === null;
  const formula = isFormula(draft);
  const showPreview = focused && !invalid && formula;
  // Like a spreadsheet: show the result, reveal the formula while editing.
  const shown = focused || invalid || !formula ? draft : String(Math.round(result! * 100) / 100);

  const commit = () => {
    setFocused(false);
    if (!invalid && draft !== value) onChange(draft.trim().replace(/^=/, '').replace(/\s+/g, ''));
    else if (invalid) setDraft(value);
  };

  return (
    <span className={`expr ${formula && !focused ? 'has-formula' : ''} ${className ?? ''}`} title={formula ? `= ${draft}` : undefined}>
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder={placeholder}
        value={shown}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { setDraft(value); setFocused(false); }
        }}
      />
      {showPreview && <span className="expr-preview">= {Math.round(result! * 100) / 100}</span>}
    </span>
  );
}

/** Plain text field that commits on blur. */
export function TextInput({ value, onChange, ariaLabel, className }: {
  value: string; onChange: (v: string) => void; ariaLabel: string; className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className={className}
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value ? onChange(draft.trim()) : setDraft(value)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
