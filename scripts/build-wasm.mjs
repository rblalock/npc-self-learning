import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) {
    console.error(`${command}: ${result.error.message}`);
    if (command === 'wasm-bindgen') console.error('Install: cargo install wasm-bindgen-cli --version 0.2.129 --locked');
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const output = resolve(root, 'apps/arena/public/wasm');
mkdirSync(output, { recursive: true });
run('cargo', ['build', '--locked', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'tactical-air-wasm']);
run('wasm-bindgen', [resolve(root, 'target/wasm32-unknown-unknown/release/tactical_air_wasm.wasm'), '--target', 'web', '--out-dir', output, '--out-name', 'tactical_air']);
