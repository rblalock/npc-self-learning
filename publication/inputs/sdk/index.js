/** One client owns one mutable engine. Dispose explicitly when its host is destroyed. */
export class TacticalPolicy {
    engine;
    disposed = false;
    constructor(engine) {
        this.engine = engine;
    }
    static fromModule(module, config) {
        return new TacticalPolicy(new module.TacticalEngine(JSON.stringify(config)));
    }
    request(request) {
        if (this.disposed)
            throw new Error('TacticalPolicy has been disposed.');
        const result = JSON.parse(this.engine.request(JSON.stringify(request)));
        if (result.ok !== true)
            throw new Error(result.error || 'Invalid Tactical Air response.');
        return result.data;
    }
    choose(role, context, allowed, baseline = false) {
        return this.request({ op: 'choose', role, context, allowed, baseline });
    }
    feedback(decisionId, reward, observed = true) {
        return this.request({ op: 'feedback', decision_id: decisionId, reward, observed }).accepted;
    }
    commit() { return this.request({ op: 'commit' }); }
    inspect() { return this.request({ op: 'inspect' }); }
    snapshot() { return this.request({ op: 'snapshot' }); }
    restore(snapshot) { return this.request({ op: 'restore', snapshot }); }
    age(steps = 1) { return this.request({ op: 'age', steps }); }
    dispose() { if (!this.disposed) {
        this.engine.free();
        this.disposed = true;
    } }
}
/** Initialize generated wasm-bindgen glue from a host-supplied URL. No DOM or game dependency. */
export async function loadPolicy(moduleUrl, config) {
    const module = await import(/* @vite-ignore */ moduleUrl);
    await module.default();
    return TacticalPolicy.fromModule(module, config);
}
