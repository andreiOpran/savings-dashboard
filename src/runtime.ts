/**
 * Bridge to the claude.ai Artifact runtime (window.claude), used when the app
 * is published as a private Artifact. Outside claude.ai every capability
 * resolves null and the app falls back to plain browser features.
 */

export interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
  metadata: { fromCache: boolean; hasPendingWrites: boolean };
}
export interface DocRef {
  set(data: Record<string, unknown>): Promise<void>;
  onSnapshot(next: (s: DocSnapshot) => void, error?: (e: { code: string }) => void): () => void;
}
export interface Db { doc(path: string): DocRef }
export interface User { id(): Promise<string | null> }
export interface Downloads {
  save(req: { filename: string; data: string | Blob }): Promise<{ status: 'saved' | 'delivered' }>;
}

interface Capabilities { db: Db; user: User; downloads: Downloads }

type ClaudeRuntime = { use<K extends keyof Capabilities>(name: K): Promise<Capabilities[K] | null> };

const runtime = (): ClaudeRuntime | undefined =>
  (window as unknown as { claude?: ClaudeRuntime }).claude;

/** True when running inside a claude.ai viewer (or its own artifact host). */
export const inClaude = () => typeof runtime()?.use === 'function';

export async function use<K extends keyof Capabilities>(name: K): Promise<Capabilities[K] | null> {
  const c = runtime();
  if (!c?.use) return null;
  try { return await c.use(name); } catch { return null; }
}
