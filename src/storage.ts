import { useCallback, useEffect, useState } from 'react';
import type { AppData, Snapshot } from './types';

const KEY = 'economii:data:v1';

export function emptyData(): AppData {
  return {
    version: 1,
    settings: { eurRon: 5.0, autoRate: true },
    plan: { salaries: 0, savingsPerSalary: '2500', investPerSalaryEur: '200', xtbFreeEur: '0', eurRate: '' },
    receivables: [],
    goals: [],
    snapshots: [],
  };
}

/** Light validation so a bad file can't brick the app. */
export function parseData(raw: unknown): AppData {
  const d = raw as Partial<AppData>;
  if (!d || typeof d !== 'object' || d.version !== 1) throw new Error('Not an Economii backup (version 1).');
  const base = emptyData();
  return {
    version: 1,
    settings: { ...base.settings, ...d.settings },
    plan: { ...base.plan, ...d.plan },
    receivables: Array.isArray(d.receivables) ? d.receivables : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    snapshots: Array.isArray(d.snapshots) ? d.snapshots.map(migrateSnapshot) : [],
  };
}

/** v0.1 stored hidden "frozen" totals; turn them into the editable per-month fields. */
function migrateSnapshot(s: Snapshot & { frozen?: { receivables: number; goals: number } }): Snapshot {
  if (!s.frozen) return s;
  const { frozen, ...rest } = s;
  return {
    ...rest,
    receivablesExpr: rest.receivablesExpr ?? String(Math.round(frozen.receivables * 100) / 100),
    goals: rest.goals ?? frozen.goals,
  };
}

function load(): AppData | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? parseData(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

export function useAppData() {
  const [data, setData] = useState<AppData | null>(load);

  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  }, [data]);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => (d ? fn(d) : d));
  }, []);

  return { data, setData, update };
}

export function downloadJson(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `economii-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readJsonFile(file: File): Promise<AppData> {
  return parseData(JSON.parse(await file.text()));
}

/** Live EUR→RON (ECB reference rate) — replaces GOOGLEFINANCE("CURRENCY:EURRON"). */
export async function fetchEurRon(): Promise<number> {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR&symbols=RON');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const rate = json?.rates?.RON;
  if (typeof rate !== 'number') throw new Error('Unexpected response');
  return rate;
}
