import { readFile } from 'node:fs/promises';
import init, { TacticalEngine } from '../apps/arena/public/wasm/tactical_air.js';
import { Arena, TACTICS } from '../target/arena-test/sim.js';

await init({ module_or_path: await readFile(new URL('../apps/arena/public/wasm/tactical_air_bg.wasm', import.meta.url)) });
export { Arena, TACTICS };
export const POLICY_CONFIG = {
    roles: [
      { id: 'vanguard', actions: ['rush', 'hold'] },
      { id: 'flanker', actions: ['flank_left', 'flank_right'] },
      { id: 'ranger', actions: ['aim', 'lead'] },
    ],
    contexts: ['arena'], learning_rate: .22, exploration: .16,
    temperature: .3, decay: .025, max_update: .16,
};
export function makePolicy(seed = 42) {
  const engine = new TacticalEngine(JSON.stringify({ ...POLICY_CONFIG, seed }));
  return {
    request(request) {
      const result = JSON.parse(engine.request(JSON.stringify(request)));
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    dispose() { engine.free(); },
  };
}

export function runSeries(arena, count, style = 'orbit') {
  return Array.from({ length: count }, () => {
    arena.startEncounter();
    return arena.runEncounter(style);
  });
}
