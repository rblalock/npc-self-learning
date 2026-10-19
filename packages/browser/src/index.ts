/** Engine-independent TypeScript client for Tactical Air's Rust JSON protocol. */
export interface Config {
  seed: number; roles: {id: string; actions: string[]}[]; contexts: string[];
  learning_rate: number; exploration: number; temperature: number; decay: number; max_update: number;
}
export interface Cell { role: string; context: string; action: string; score: number; samples: number }
export interface Inspection { version: number; encounter: number; pending: number; queued: number; cells: (Cell & {probability:number})[] }
export interface Snapshot { version: number; config: Config; encounter: number; next_decision_id: number; rng_state: string; cells: Cell[] }
export interface Decision { decision_id: number; action: string; baseline: boolean; probabilities: {action:string; probability:number}[] }
export interface Transport { request(json: string): string; free(): void }
export interface WasmModule { default: (input?: unknown) => Promise<unknown>; TacticalEngine: new (config: string) => Transport }

/** One client owns one mutable engine. Dispose explicitly when its host is destroyed. */
export class TacticalPolicy {
  private disposed = false;
  constructor(private readonly engine: Transport) {}
  static fromModule(module: WasmModule, config: Config): TacticalPolicy {
    return new TacticalPolicy(new module.TacticalEngine(JSON.stringify(config)));
  }
  request<T = unknown>(request: object): T {
    if (this.disposed) throw new Error('TacticalPolicy has been disposed.');
    const result = JSON.parse(this.engine.request(JSON.stringify(request)));
    if (result.ok !== true) throw new Error(result.error || 'Invalid Tactical Air response.');
    return result.data as T;
  }
  choose(role: string, context: string, allowed: string[], baseline = false): Decision {
    return this.request({op:'choose',role,context,allowed,baseline});
  }
  feedback(decisionId: number, reward: number, observed = true): boolean {
    return this.request<{accepted:boolean}>({op:'feedback',decision_id:decisionId,reward,observed}).accepted;
  }
  commit(): Inspection { return this.request({op:'commit'}); }
  inspect(): Inspection { return this.request({op:'inspect'}); }
  snapshot(): Snapshot { return this.request({op:'snapshot'}); }
  restore(snapshot: Snapshot): Inspection { return this.request({op:'restore',snapshot}); }
  age(steps = 1): Inspection { return this.request({op:'age',steps}); }
  dispose(): void { if (!this.disposed) { this.engine.free(); this.disposed = true; } }
}

/** Initialize generated wasm-bindgen glue from a host-supplied URL. No DOM or game dependency. */
export async function loadPolicy(moduleUrl: string, config: Config): Promise<TacticalPolicy> {
  const module: WasmModule = await import(/* @vite-ignore */ moduleUrl);
  await module.default();
  return TacticalPolicy.fromModule(module, config);
}
