import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData, Exchange, SalaryEntry, SalaryPlan, Snapshot } from './types';
import { uid } from './id';
import { inClaude, use, type DocRef } from './runtime';

const KEY = 'economii:data:v1';
const SYNC_TIMEOUT_MS = 10_000;
const WRITE_DEBOUNCE_MS = 600;

export function emptyData(): AppData {
  return {
    version: 1,
    settings: { eurRon: 5.0, autoRate: true },
    plan: { savingsPerSalary: '2500', investPerSalaryEur: '200', salaries: [], exchanges: [] },
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
    plan: migratePlan({ ...base.plan, salaries: undefined, exchanges: undefined, ...d.plan } as unknown as LegacyPlan, d.settings?.eurRon ?? base.settings.eurRon),
    receivables: Array.isArray(d.receivables) ? d.receivables : [],
    goals: Array.isArray(d.goals) ? d.goals : [],
    snapshots: Array.isArray(d.snapshots) ? d.snapshots.map(migrateSnapshot) : [],
  };
}

type LegacyPlan = {
  savingsPerSalary: string;
  investPerSalaryEur: string;
  /** A count in older versions, a list of entries now. */
  salaries?: number | SalaryEntry[];
  exchanges?: Exchange[];
  xtbFreeEur?: string;
  eurRate?: string;
};

/**
 * Bring any older salary-split format up to date without changing the ING amount:
 * - v0 (the sheet): a salary count × "saved per salary", "invested per salary" and
 *   one XTB sum, all at one rate → one exchange per investment and XTB transfer;
 * - v1: a salary count + dated investment exchanges → one salary entry per month,
 *   holding that month's savings and investment (with its real rate).
 */
export function migratePlan(p: LegacyPlan, liveRate: number): SalaryPlan {
  const { savingsPerSalary, investPerSalaryEur } = p;
  if (Array.isArray(p.salaries)) {
    return { savingsPerSalary, investPerSalaryEur, salaries: p.salaries, exchanges: p.exchanges ?? [] };
  }
  const count = p.salaries ?? 0;
  const exchanges = Array.isArray(p.exchanges) ? p.exchanges : migrateV0Exchanges(p, liveRate);
  // Oldest first, undated ones (from the sheet) in their original order.
  const invests = exchanges
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => x.kind === 'invest')
    .sort((a, b) => (a.x.date ?? '').localeCompare(b.x.date ?? '') || a.i - b.i)
    .map(({ x }) => x);
  const salaries: SalaryEntry[] = [];
  for (let i = 0; i < Math.max(count, invests.length); i++) {
    const inv = invests[i];
    salaries.push({
      id: inv?.id ?? uid(),
      ...(inv?.date ? { month: inv.date.slice(0, 7) } : {}),
      savedExpr: i < count ? savingsPerSalary || '0' : '0',
      investEurExpr: inv?.eurExpr ?? '0',
      rate: inv?.rate ?? liveRate,
    });
  }
  return { savingsPerSalary, investPerSalaryEur, salaries, exchanges: exchanges.filter((x) => x.kind === 'xtb') };
}

function migrateV0Exchanges(p: LegacyPlan, liveRate: number): Exchange[] {
  const { xtbFreeEur, eurRate } = p;
  const rate = eurRate?.trim() ? Number(eurRate.replace(',', '.')) || liveRate : liveRate;
  const exchanges: Exchange[] = [];
  for (let i = 0; i < (typeof p.salaries === 'number' ? p.salaries : 0); i++) {
    exchanges.push({ id: uid(), kind: 'invest', eurExpr: p.investPerSalaryEur || '0', rate });
  }
  // "390+185" was two separate transfers: keep them as two entries.
  const xtb = (xtbFreeEur ?? '').replace(/\s+/g, '');
  const parts = /^\d+(\.\d+)?(\+\d+(\.\d+)?)*$/.test(xtb) ? xtb.split('+') : xtb && xtb !== '0' ? [xtb] : [];
  for (const eurExpr of parts) exchanges.push({ id: uid(), kind: 'xtb', eurExpr, rate });
  return exchanges;
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
