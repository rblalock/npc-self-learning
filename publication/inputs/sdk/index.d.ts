/** Engine-independent TypeScript client for Tactical Air's Rust JSON protocol. */
export interface Config {
    seed: number;
    roles: {
        id: string;
        actions: string[];
    }[];
    contexts: string[];
    learning_rate: number;
    exploration: number;
    temperature: number;
    decay: number;
    max_update: number;
}
export interface Cell {
    role: string;
    context: string;
    action: string;
    score: number;
    samples: number;
}
export interface Inspection {
    version: number;
    encounter: number;
    pending: number;
    queued: number;
    cells: (Cell & {
        probability: number;
    })[];
}
export interface Snapshot {
    version: number;
    config: Config;
    encounter: number;
    next_decision_id: number;
    rng_state: string;
    cells: Cell[];
}
export interface Decision {
    decision_id: number;
    action: string;
    baseline: boolean;
    probabilities: {
        action: string;
        probability: number;
    }[];
}
export interface Transport {
    request(json: string): string;
    free(): void;
}
export interface WasmModule {
    default: (input?: unknown) => Promise<unknown>;
    TacticalEngine: new (config: string) => Transport;
}
/** One client owns one mutable engine. Dispose explicitly when its host is destroyed. */
export declare class TacticalPolicy {
    private readonly engine;
    private disposed;
    constructor(engine: Transport);
    static fromModule(module: WasmModule, config: Config): TacticalPolicy;
    request<T = unknown>(request: object): T;
    choose(role: string, context: string, allowed: string[], baseline?: boolean): Decision;
    feedback(decisionId: number, reward: number, observed?: boolean): boolean;
    commit(): Inspection;
    inspect(): Inspection;
    snapshot(): Snapshot;
    restore(snapshot: Snapshot): Inspection;
    age(steps?: number): Inspection;
    dispose(): void;
}
/** Initialize generated wasm-bindgen glue from a host-supplied URL. No DOM or game dependency. */
export declare function loadPolicy(moduleUrl: string, config: Config): Promise<TacticalPolicy>;
