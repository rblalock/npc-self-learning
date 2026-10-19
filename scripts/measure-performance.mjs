import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { cpus,platform,arch,release } from 'node:os';
import { performance } from 'node:perf_hooks';
import * as module from '../apps/arena/public/wasm/tactical_air.js';
import { TacticalPolicy } from '../packages/browser/dist/index.js';
const wasm=await readFile(new URL('../apps/arena/public/wasm/tactical_air_bg.wasm',import.meta.url));
await module.default({module_or_path:wasm});
const config={seed:19,roles:[{id:'guard',actions:['patrol','wait']}],contexts:['courtyard'],learning_rate:.22,exploration:.16,temperature:.3,decay:.025,max_update:.16};
const p=TacticalPolicy.fromModule(module,config),times=[];
for(let batch=0;batch<35;batch++){
  const start=performance.now();
  for(let i=0;i<1000;i++){const d=p.choose('guard','courtyard',['patrol','wait']);p.feedback(d.decision_id,i%2===0?.5:-.2,true);p.commit();}
  if(batch>=5)times.push((performance.now()-start)*1000/1000);
}
p.dispose();times.sort((a,b)=>a-b);
const rust=JSON.parse(execFileSync('cargo',['run','--locked','--release','-p','tactical-air-core','--example','performance'],{encoding:'utf8'}));
const result={schema:1,measuredAt:new Date().toISOString(),environment:{platform:platform(),osRelease:release(),arch:arch(),cpu:cpus()[0].model,logicalCpus:cpus().length,node:process.version,rust:execFileSync('rustc',['--version'],{encoding:'utf8'}).trim()},size:{wasmBytes:wasm.length,wasmGzipBytes:gzipSync(wasm).length},rust,wasm:{unit:'microseconds per choose + feedback + commit',configuration:'1 role, 2 actions, 1 context; typed JS client, JSON transport, Node Wasm; release Wasm',batches:30,cycles_per_batch:1000,warmup_batches:5,median:times[15],p95_batch_mean:times[28],min:times[0],max:times[29],batch_means:times},limits:['Batch means, not individual-call tail latency.','Single local hardware/runtime measurement; not a browser/mobile or production capacity guarantee.','Small policy only. No combat, rendering, file I/O, startup, network, or population-scale policy measured.','Repeated synthetic feedback measures execution cost, not learning quality.']};
await mkdir(new URL('../docs/releases/',import.meta.url),{recursive:true});
await writeFile(new URL('../docs/releases/performance-0.3.0.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({rustMedianUs:rust.median,wasmMedianUs:times[15],wasmBytes:wasm.length,wasmGzipBytes:gzipSync(wasm).length,environment:result.environment},null,2));
