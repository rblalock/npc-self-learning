import assert from 'node:assert/strict';
import { readFile,writeFile,mkdtemp,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join,resolve } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,process.argv[2]??'target/releases');
const manifest=JSON.parse(await readFile(join(out,'release.json'),'utf8'));
for(const f of manifest.files){const bytes=await readFile(join(out,f.name));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
const work=await mkdtemp(join(out,'validation-')),source=join(work,'source'),consumer=join(work,'consumer');
await mkdir(source);await mkdir(consumer);
execFileSync('tar',['-xzf',join(out,`tactical-air-source-${manifest.version}.tar.gz`),'-C',source]);
const checks=[];
function run(name,cmd,args,cwd=source){console.error(`Release check: ${name}`);const output=execFileSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:8e6});checks.push({name,passed:true});return output;}
run('clean Rust host with save/replay','cargo',['run','--locked','--release','-p','tactical-air-core','--example','guard_host']);
run('clean npm dependency install','npm',['ci','--ignore-scripts']);
run('production build from extracted source','npm',['run','build']);
run('actual arena and study tests from extracted source','npm',['run','test:arena']);
await writeFile(join(consumer,'package.json'),JSON.stringify({name:'tactical-air-clean-consumer',private:true,type:'module'}));
run('install downloadable npm tarball','npm',['install','--ignore-scripts',join(out,`tactical-air-browser-${manifest.version}.tgz`)],consumer);
const smoke=`import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TacticalPolicy} from '@tactical-air/browser';
import * as wasm from './node_modules/@tactical-air/browser/wasm/tactical_air.js';
await wasm.default({module_or_path:await readFile(new URL('./node_modules/@tactical-air/browser/wasm/tactical_air_bg.wasm',import.meta.url))});
const config={seed:19,roles:[{id:'guard',actions:['patrol','wait']}],contexts:['courtyard'],learning_rate:.22,exploration:.16,temperature:.3,decay:.025,max_update:.16};
const a=TacticalPolicy.fromModule(wasm,config),b=TacticalPolicy.fromModule(wasm,config);
try{const d=a.choose('guard','courtyard',['patrol']);assert.equal(d.action,'patrol');assert.equal(a.feedback(d.decision_id,.7,true),true);a.commit();b.restore(a.snapshot());assert.deepEqual(a.inspect(),b.inspect());assert.deepEqual(a.choose('guard','courtyard',['patrol','wait']),b.choose('guard','courtyard',['patrol','wait']));console.log('npm consumer: legal mask, real feedback, snapshot and exact choice replay passed');}finally{a.dispose();b.dispose();}
`;
await writeFile(join(consumer,'smoke.mjs'),smoke);run('independent installed npm consumer through real Wasm',process.execPath,['smoke.mjs'],consumer);
if(process.platform==='darwin'&&process.arch==='arm64'){
  execFileSync('tar',['-xzf',join(out,`tactical-air-macos-arm64-${manifest.version}.tar.gz`),'-C',work]);
  const native=join(work,`tactical-air-macos-arm64-${manifest.version}`),binary=join(work,'native-smoke');
  run('compile caller against extracted native release','cc',['-std=c11','-Wall','-Wextra','-Werror','-I',native,join(source,'scripts/ffi-smoke.c'),'-L',native,'-ltactical_air_ffi',`-Wl,-rpath,${native}`,'-o',binary]);
  run('execute extracted native release',binary,[]);
}
const result={schema:1,verifiedAt:new Date().toISOString(),version:manifest.version,platform:process.platform,arch:process.arch,artifacts:manifest.files,checks,limits:['Uses locally installed toolchains and dependency caches; not a fresh OS image.','Browser visual/interaction QA is recorded separately.']};
await writeFile(join(root,'docs/releases/validation-0.3.0.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,version:manifest.version,work},null,2));
