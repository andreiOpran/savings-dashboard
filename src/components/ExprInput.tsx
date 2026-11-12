import { useEffect, useRef, useState } from 'react';
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
  const focusedRef = useRef(false);
  const cancelRef = useRef(false);
  // Pick up outside changes to the value, but never clobber what's being typed.
  useEffect(() => { if (!focusedRef.current) setDraft(value); }, [value]);

  const result = evaluate(draft);
  const invalid = result === null;
  const formula = isFormula(draft);
  const showPreview = focused && !invalid && formula;
  // Like a spreadsheet: show the result, reveal the formula while editing.
  const shown = focused || invalid || !formula ? draft : String(Math.round(result! * 100) / 100);

  const commit = () => {
    focusedRef.current = false;
    setFocused(false);
    if (cancelRef.current) { cancelRef.current = false; setDraft(value); return; }
    if (!invalid && draft !== value) onChange(draft.trim().replace(/^=/, '').replace(/\s+/g, ''));
    else if (invalid) setDraft(value);
  };

  return (
    <span className={`expr ${formula && !focused ? 'has-formula' : ''} ${className ?? ''}`} title={formula ? `= ${draft}` : undefined}>
      <input
        inputMode="decimal"
        style={{ width: `calc(${Math.min(Math.max((shown || placeholder || '').length, 3), 16)}ch + 20px)` }}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder={placeholder}
        value={shown}
        onFocus={() => { focusedRef.current = true; setFocused(true); }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { cancelRef.current = true; (e.target as HTMLInputElement).blur(); }
        }}
      />
      {showPreview && <span className="expr-preview">= {Math.round(result! * 100) / 100}</span>}
    </span>
  );
}

/**
 * Label field that commits on blur. Long text wraps onto more lines instead of
 * being cut off (a textarea stacked on an invisible copy of its own text).
 */
export function TextInput({ value, onChange, ariaLabel, className }: {
  value: string; onChange: (v: string) => void; ariaLabel: string; className?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <span className={`autogrow ${className ?? ''}`} data-value={draft}>
      <textarea
        rows={1}
        aria-label={ariaLabel}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\n/g, ' '))}
        onBlur={() => (draft.trim() && draft !== value ? onChange(draft.trim()) : setDraft(value))}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
      />
    </span>
  );
}
