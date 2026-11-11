import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Two-step delete: the first click arms it ("Delete?"), the second confirms.
 * Replaces window.confirm(), which the claude.ai viewer doesn't show.
 */
export function ConfirmButton({ className = '', ariaLabel, children, onConfirm }: {
  className?: string; ariaLabel?: string; children: ReactNode; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className} ${armed ? 'armed' : ''}`}
      aria-label={armed ? t('confirm.again') : ariaLabel}
      title={armed ? t('confirm.again') : undefined}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      onBlur={() => setArmed(false)}
    >
      {armed ? t('confirm.short') : children}
    </button>
  );
}
