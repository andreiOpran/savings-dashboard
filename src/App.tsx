import { useEffect, useRef, useState } from 'react';
import { goalsRemaining, history, receivablesTotal } from './calc';
import { money, monthLabel, signedMoney } from './format';
import { downloadJson, emptyData, fetchEurRon, readJsonFile, useAppData } from './storage';
import type { AppData } from './types';
import { HistoryChart } from './components/HistoryChart';
import { AddMonth, HistoryTable } from './components/History';
import { Receivables } from './components/Receivables';
import { Goals } from './components/Goals';
import { SalaryPlan } from './components/SalaryPlan';

const RATE_TTL_MS = 12 * 60 * 60 * 1000;

export default function App() {
  const { data, setData, update } = useAppData();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const d = await readJsonFile(file);
      if (data && !confirm('Replace all current data with this backup?')) return;
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const fileInput = (
    <input ref={fileRef} type="file" accept="application/json,.json" hidden
      onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
  );

  if (!data) {
    return (
      <main className="onboarding">
        <h1>Economii</h1>
        <p className="muted">Your savings, goals and money owed to you — kept in this browser only.</p>
        <div className="onboarding-actions">
          <button className="primary" onClick={() => fileRef.current?.click()}>Import backup (.json)</button>
          <button onClick={() => setData(emptyData())}>Start empty</button>
        </div>
        <p className="hint muted">Coming from the spreadsheet? Run <code>scripts/import_xlsx.py</code> on it to get a backup file.</p>
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
              <h2>History</h2>
              <p className="muted">Total balance at the end of each month</p>
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
          <header className="card-head"><div><h2>Months</h2></div></header>
          <HistoryTable data={data} update={update} />
        </section>

        <footer className="footer">
          <span className="muted">Data lives only in this browser. Export a backup regularly.</span>
          <span className="spacer" />
          <button onClick={() => downloadJson(data)}>Export backup</button>
          <button onClick={() => fileRef.current?.click()}>Import backup</button>
          {error && <span className="error">{error}</span>}
          {fileInput}
        </footer>
      </main>
    </>
  );
}

function Header({ data, update }: { data: AppData; update: (fn: (d: AppData) => AppData) => void }) {
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

  useEffect(() => {
    const last = data.settings.eurRonUpdated ? Date.parse(data.settings.eurRonUpdated) : 0;
    if (data.settings.autoRate && Date.now() - last > RATE_TTL_MS) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updated = data.settings.eurRonUpdated
    ? new Date(data.settings.eurRonUpdated).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' })
    : 'from import';

  return (
    <header className="topbar">
      <h1>Economii</h1>
      <span className="spacer" />
      <button className={`rate ${rateError ? 'stale' : ''}`} onClick={refresh} disabled={busy}
        title={rateError ? 'Could not refresh — using the last known rate' : `ECB rate, updated ${updated}. Click to refresh.`}>
        <span className="muted">EUR/RON</span> <b>{data.settings.eurRon.toFixed(4)}</b> <span aria-hidden>{busy ? '…' : '↻'}</span>
      </button>
    </header>
  );
}

function Kpis({ data }: { data: AppData }) {
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
    <section className="kpis" aria-label="Summary">
      <div className="kpi">
        <span className="kpi-label">Balance{last ? ` · ${monthLabel(last.month)}` : ''}</span>
        <span className="kpi-value">{money(balance)}</span>
        {delta !== null && (
          <span className={`kpi-sub ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {signedMoney(delta)} vs {monthLabel(prev.month, false)}</span>
        )}
      </div>
      <div className="kpi">
        <span className="kpi-label">De primit</span>
        <span className="kpi-value">{money(rec)}</span>
        <span className="kpi-sub muted">{data.receivables.filter((r) => !r.received && r.expr !== '0').length} open</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">Goals left</span>
        <span className="kpi-value">{money(goals)}</span>
        <span className="kpi-sub muted">{data.goals.filter((g) => g.countInTotal && !g.archived).length} goals counted</span>
      </div>
      <div className={`kpi hero ${free < 0 ? 'neg' : 'pos'}`}>
        <span className="kpi-label">Free after goals</span>
        <span className="kpi-value">{money(free)}</span>
        <span className="kpi-sub">{free >= 0 ? '✓ All goals covered' : '! Short of goals'}</span>
      </div>
    </section>
  );
}
