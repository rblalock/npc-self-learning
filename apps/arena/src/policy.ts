import { TacticalPolicy, type WasmModule } from '../../../packages/browser/src/index';
import type { Policy } from './sim';

export const DEFAULT_CONFIG = {
  seed: 42,
  roles: [
    { id: 'vanguard', actions: ['rush', 'hold'] },
    { id: 'flanker', actions: ['flank_left', 'flank_right'] },
    { id: 'ranger', actions: ['aim', 'lead'] },
  ],
  contexts: ['arena'],
  learning_rate: 0.22,
  exploration: 0.16,
  temperature: 0.3,
  decay: 0.025,
  max_update: 0.16,
};

const STORAGE_KEY = 'tactical-air.memory.v1';
export interface BrowserPolicy extends Policy {
  dispose(): void;
  readonly storageWarning: string | null;
}
let modulePromise: Promise<WasmModule> | undefined;
async function loadWasm(): Promise<WasmModule> {
  if (!modulePromise) {
    const url = new URL(`${import.meta.env.BASE_URL}wasm/tactical_air.js`, window.location.href).href;
    modulePromise = import(/* @vite-ignore */ url).then(async (module: WasmModule) => {
      await module.default();
      return module;
    }).catch(error => { modulePromise = undefined; throw error; });
  }
  return modulePromise;
}

export async function createPolicy(options: { persist?: boolean; seed?: number; restore?: boolean } = {}): Promise<BrowserPolicy> {
  const module = await loadWasm();
  const engine = TacticalPolicy.fromModule(module, { ...DEFAULT_CONFIG, seed: options.seed ?? DEFAULT_CONFIG.seed });
  const persist = options.persist !== false;
  let warning: string | null = null;
  function call<T>(request: object): T {
    return engine.request<T>(request);
  }
  if (persist && options.restore !== false) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) call({ op: 'restore', snapshot: JSON.parse(saved) });
    } catch (error) {
      warning = `Saved memory unavailable; a fresh policy is active. ${String(error)}`;
      console.warn(warning);
    }
  }
  return {
    get storageWarning() { return warning; },
    request<T = unknown>(request: object): T {
      const data = call<T>(request);
      if (persist && ['commit','age'].includes((request as {op:string}).op)) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(call({ op: 'snapshot' }))); }
        catch (error) { warning = `Memory is active for this session but could not be saved: ${String(error)}`; }
      }
      return data;
    },
    dispose() { engine.dispose(); },
  };
}

export async function resetPolicy(): Promise<BrowserPolicy> {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Session still works with blocked storage. */ }
  const policy = await createPolicy({ restore: false });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(policy.request({ op: 'snapshot' }))); }
  catch { /* Memory remains session-local. */ }
  return policy;
}
