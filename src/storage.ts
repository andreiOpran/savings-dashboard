import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Exchange, SalaryPlan, Snapshot } from './types';
import { uid } from './id';
import { inClaude, use, type DocRef } from './runtime';

const KEY = 'economii:data:v1';
const SYNC_TIMEOUT_MS = 10_000;
const WRITE_DEBOUNCE_MS = 600;

export function emptyData(): AppData {
  return {
    version: 1,
    settings: { eurRon: 5.0, autoRate: true },
    plan: { salaries: 0, savingsPerSalary: '2500', investPerSalaryEur: '200', exchanges: [] },
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
    plan: migratePlan({ ...base.plan, exchanges: undefined, ...d.plan } as unknown as LegacyPlan, d.settings?.eurRon ?? base.settings.eurRon),
    receivables: Array.isArray(d.receivables) ? d.receivables : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    snapshots: Array.isArray(d.snapshots) ? d.snapshots.map(migrateSnapshot) : [],
  };
}

type LegacyPlan = Omit<SalaryPlan, 'exchanges'> & { exchanges?: Exchange[]; xtbFreeEur?: string; eurRate?: string };

/**
 * Before the exchange log, the plan held "invested per salary × salaries" and one
 * XTB free-funds sum, all converted at a single rate (the sheet used a fixed 5).
 * Turn that into individual exchanges at that rate, so the ING amount stays the
 * same; their real rates can then be corrected one by one.
 */
export function migratePlan(p: LegacyPlan, liveRate: number): SalaryPlan {
  const { xtbFreeEur, eurRate, ...plan } = p;
  if (Array.isArray(p.exchanges)) return { ...plan, exchanges: p.exchanges };
  // Old format: no exchange log yet.
  const rate = eurRate?.trim() ? Number(eurRate.replace(',', '.')) || liveRate : liveRate;
  const exchanges: Exchange[] = [];
  for (let i = 0; i < (p.salaries || 0); i++) {
    exchanges.push({ id: uid(), kind: 'invest', eurExpr: p.investPerSalaryEur || '0', rate });
  }
  // "390+185" was two separate transfers: keep them as two entries.
  const xtb = (xtbFreeEur ?? '').replace(/\s+/g, '');
  const parts = /^\d+(\.\d+)?(\+\d+(\.\d+)?)*$/.test(xtb) ? xtb.split('+') : xtb && xtb !== '0' ? [xtb] : [];
  for (const eurExpr of parts) exchanges.push({ id: uid(), kind: 'xtb', eurExpr, rate });
  return { ...plan, exchanges };
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

function loadLocal(): AppData | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? parseData(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

/**
 * Where the data lives:
 * - `local`: this browser only (the app runs outside claude.ai, or sync is unavailable)
 * - `connecting`: waiting for the claude.ai store
 * - `synced`: saved to the viewer's private record on claude.ai, shared by all their devices
 * - `error`: the store couldn't be reached; changes are kept in this browser
 */
export type SyncState = 'local' | 'connecting' | 'synced' | 'error';

export function useAppData() {
  const [data, setData] = useState<AppData | null>(loadLocal);
  const [sync, setSync] = useState<SyncState>(() => (inClaude() ? 'connecting' : 'local'));
  const ref = useRef<DocRef | null>(null);
  /** JSON of what the store holds as far as we know; null until the store has answered. */
  const remote = useRef<string | null>(null);
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  const [remoteReady, setRemoteReady] = useState(0);

  // Local cache (and the only storage outside claude.ai).
  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  }, [data]);

  // Subscribe once to this viewer's private document.
  useEffect(() => {
    if (!inClaude()) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    const timer = setTimeout(() => setSync((s) => (s === 'connecting' ? 'error' : s)), SYNC_TIMEOUT_MS);

    (async () => {
      const [db, user] = await Promise.all([use('db'), use('user')]);
      const id = user ? await user.id().catch(() => null) : null;
      if (cancelled) return;
      if (!db || !id) { clearTimeout(timer); setSync('local'); return; }

      const doc = db.doc(`data/users/${id}/economii`);
      unsub = doc.onSnapshot((snap) => {
        if (!snap.metadata.fromCache) { clearTimeout(timer); setSync('synced'); }
        if (snap.exists) {
          const json = snap.data()?.json;
          if (typeof json !== 'string') return;
          ref.current = doc;
          if (json === remote.current) return; // our own write echoing back
          remote.current = json;
          try { setData(parseData(JSON.parse(json))); } catch { /* ignore a corrupt record */ }
          setRemoteReady((n) => n + 1);
        } else if (!snap.metadata.fromCache) {
          // Nothing stored yet: the push effect uploads what this browser has, if anything.
          ref.current = doc;
          remote.current = '';
          setRemoteReady((n) => n + 1);
        }
      }, () => { clearTimeout(timer); setSync('error'); });
    })();

    return () => { cancelled = true; clearTimeout(timer); unsub?.(); };
  }, []);

  // Push changes, debounced, one write at a time.
  useEffect(() => {
    const doc = ref.current;
    if (!data || !doc || remote.current === null) return;
    const json = JSON.stringify(data);
    if (json === remote.current) return;
    const t = setTimeout(() => {
      remote.current = json;
      writes.current = writes.current
        .then(() => doc.set({ json, savedAt: new Date().toISOString() }))
        .then(() => setSync('synced'), () => setSync('error'));
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data, remoteReady]);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((d) => (d ? fn(d) : d));
  }, []);

  return { data, setData, update, sync };
}

/** Save a backup file: through the claude.ai save dialog when hosted there, else a normal download. */
export async function downloadJson(data: AppData): Promise<'saved' | 'declined' | 'failed'> {
  const filename = `economii-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify(data, null, 2);
  if (inClaude()) {
    const downloads = await use('downloads');
    if (!downloads) return 'failed';
    try {
      await downloads.save({ filename, data: json });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'failed';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return 'saved';
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
