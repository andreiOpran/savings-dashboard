import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { goalsRemaining, history, receivablesTotal } from './calc';
import { money, monthLabel, signedMoney } from './format';
import { LANGUAGES, type Lang } from './i18n';
import { downloadJson, emptyData, fetchEurRon, readJsonFile, useAppData, type SyncState } from './storage';
import { num } from './expr';
import { inClaude } from './runtime';
import { ExprInput } from './components/ExprInput';
import type { AppData } from './types';
import { HistoryChart } from './components/HistoryChart';
import { AddMonth, HistoryTable } from './components/History';
import { Receivables } from './components/Receivables';
import { Goals } from './components/Goals';
import { SalaryPlan } from './components/SalaryPlan';

const RATE_TTL_MS = 12 * 60 * 60 * 1000;

export default function App() {
  const { t } = useTranslation();
  const { data, setData, update, sync } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** A backup waiting for "Replace" (the claude.ai viewer shows no confirm dialogs). */
  const [pending, setPending] = useState<AppData | null>(null);

  const importFile = async (file?: File) => {
    if (!file) return;
    setNotice(null);
    try {
      const d = await readJsonFile(file);
      setError(null);
      if (data) setPending(d); else setData(d);
    } catch {
      setError(t('backup.invalid'));
    }
  };

  const exportBackup = async () => {
    if (!data) return;
    const result = await downloadJson(data);
    setNotice(result === 'saved' ? t('backup.saved') : result === 'failed' ? t('backup.failed') : null);
  };

  const fileInput = (
    <input ref={fileRef} type="file" accept="application/json,.json" hidden
      onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
  );

  if (!data && sync === 'connecting') {
    return <main className="onboarding"><p className="muted">{t('app.loading')}</p></main>;
  }

  if (!data) {
    return (
      <main className="onboarding">
        <div className="onboarding-lang"><LanguageSwitch /></div>
        <h1>{t('app.title')}</h1>
        <p className="muted">{t('app.tagline')}</p>
        <div className="onboarding-actions">
          <button className="primary" onClick={() => fileRef.current?.click()}>{t('app.importBackup')}</button>
          <button onClick={() => setData(emptyData())}>{t('app.startEmpty')}</button>
        </div>
        <p className="hint muted"><Trans i18nKey="app.fromSheet" components={{ code: <code /> }} /></p>
        {error && <p className="error">{error}</p>}
        {fileInput}
      </main>
    );
  }

  return (
    <>
      <Header data={data} update={update} />
      <main className="page">
        <Kpis data={data} />

        <section className="card">
          <header className="card-head">
            <div>
              <h2>{t('history.title')}</h2>
              <p className="muted">{t('history.subtitle')}</p>
            </div>
          </header>
          <HistoryChart rows={history(data)} />
          <AddMonth data={data} update={update} />
        </section>

        <div className="cols">
          <Goals data={data} update={update} />
          <div className="stack">
            <Receivables data={data} update={update} />
            <SalaryPlan data={data} update={update} />
          </div>
        </div>

        <section className="card">
          <header className="card-head"><div><h2>{t('history.months')}</h2></div></header>
          <HistoryTable data={data} update={update} />
        </section>

        {pending && (
          <div className="replace-bar" role="alertdialog" aria-label={t('backup.replaceConfirm')}>
            <span>{t('backup.replaceConfirm')}</span>
            <span className="spacer" />
            <button className="primary" onClick={() => { setData(pending); setPending(null); }}>{t('backup.replace')}</button>
            <button onClick={() => setPending(null)}>{t('backup.cancel')}</button>
          </div>
        )}

        <footer className="footer">
          <SyncStatus sync={sync} />
          <span className="spacer" />
          <button onClick={exportBackup}>{t('backup.export')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('backup.import')}</button>
          {notice && <span className="muted" role="status">{notice}</span>}
          {error && <span className="error">{error}</span>}
          {fileInput}
        </footer>
      </main>
    </>
  );
}

function SyncStatus({ sync }: { sync: SyncState }) {
  const { t } = useTranslation();
  return (
    <span className={`sync sync-${sync}`} role="status">
      <span className="sync-dot" aria-hidden />
      {t(`sync.${sync}`)}
    </span>
  );
}

function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <div className="lang" role="group" aria-label={t('app.language')}>
      {(Object.keys(LANGUAGES) as Lang[]).map((lng) => (
        <button key={lng} title={LANGUAGES[lng]} aria-pressed={i18n.language === lng}
          onClick={() => i18n.changeLanguage(lng)}>{lng.toUpperCase()}</button>
      ))}
    </div>
  );
}

function Header({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [rateError, setRateError] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const eurRon = await fetchEurRon();
      update((d) => ({ ...d, settings: { ...d.settings, eurRon, eurRonUpdated: new Date().toISOString() } }));
      setRateError(false);
    } catch {
      setRateError(true);
    } finally {
      setBusy(false);
    }
  };

  // The claude.ai page can't reach outside services, so there the rate is typed by hand.
  const canFetch = !inClaude();

  useEffect(() => {
    const last = data.settings.eurRonUpdated ? Date.parse(data.settings.eurRonUpdated) : 0;
    if (canFetch && data.settings.autoRate && Date.now() - last > RATE_TTL_MS) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updated = data.settings.eurRonUpdated
    ? new Date(data.settings.eurRonUpdated).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })
    : t('rate.fromImport');

  return (
    <header className="topbar">
      <h1>{t('app.title')}</h1>
      <span className="spacer" />
      <div className={`rate ${rateError ? 'stale' : ''}`} title={!canFetch ? t('rate.manual', { date: updated }) : rateError ? t('rate.failed') : t('rate.updated', { date: updated })}>
        <span className="muted">EUR/RON</span>
        <ExprInput className="rate-input" value={data.settings.eurRon.toFixed(4)} ariaLabel={t('rate.edit')}
          onChange={(v) => {
            const eurRon = num(v);
            if (eurRon > 0) update((d) => ({ ...d, settings: { ...d.settings, eurRon, eurRonUpdated: new Date().toISOString() } }));
          }} />
        {canFetch && <button className="icon ghost" onClick={refresh} disabled={busy} aria-label={t('rate.refresh')}>{busy ? '…' : '↻'}</button>}
      </div>
      <LanguageSwitch />
    </header>
  );
}

function Kpis({ data }: { data: AppData }) {
  const { t } = useTranslation();
  const rows = history(data);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  // Headline numbers use today's de primit list and goals, not the values recorded for the month.
  const balance = last?.balance ?? 0;
  const rec = receivablesTotal(data);
  const goals = goalsRemaining(data);
  const free = balance + rec - goals;
  const delta = last && prev ? last.balance - prev.balance : null;

  return (
    <section className="kpis" aria-label={t('kpi.summary')}>
      <div className="kpi">
        <span className="kpi-label">{t('kpi.balance')}{last ? ` · ${monthLabel(last.month)}` : ''}</span>
        <span className="kpi-value">{money(balance)}</span>
        {delta !== null && (
          <span className={`kpi-sub ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {signedMoney(delta)} {t('kpi.vs', { month: monthLabel(prev.month, false) })}</span>
        )}
      </div>
      <div className="kpi">
        <span className="kpi-label">{t('kpi.receivables')}</span>
        <span className="kpi-value">{money(rec)}</span>
        <span className="kpi-sub muted">{t('kpi.open', { count: data.receivables.filter((r) => !r.received && r.expr !== '0').length })}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">{t('kpi.goalsLeft')}</span>
        <span className="kpi-value">{money(goals)}</span>
        <span className="kpi-sub muted">{t('kpi.goalsCounted', { count: data.goals.filter((g) => g.countInTotal && !g.archived).length })}</span>
      </div>
      <div className={`kpi hero ${free < 0 ? 'neg' : 'pos'}`}>
        <span className="kpi-label">{t('kpi.free')}</span>
        <span className="kpi-value">{money(free)}</span>
        <span className="kpi-sub">{free >= 0 ? `✓ ${t('kpi.covered')}` : `! ${t('kpi.short')}`}</span>
      </div>
    </section>
  );
}
