import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,copyFile,readdir,access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
const id='conservative-development-v1',name='tactical-air-conservative-lab-v1',artifact=`target/releases/${name}.tar.gz`,archive=resolve(root,artifact);
try{await access(archive);throw Error('Refusing overwrite '+archive);}catch(e){if(e.code!=='ENOENT')throw e;}
const bytes=await readFile(resolve(root,`docs/experiments/${id}.results.json`)),r=JSON.parse(bytes),v=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.verification.json`)));
await checkHashes(r.sourceHashes);assert.equal(v.resultSha256,sha(bytes));assert.equal(v.matched,true);
const paths=new Set(Object.keys(r.sourceHashes).filter(p=>!p.startsWith('target/')));
for(const f of await readdir(resolve(root,'docs/experiments')))if(f.startsWith(id+'.')||f.startsWith(id+'-view.'))paths.add('docs/experiments/'+f);
const view=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}-view.view.json`)));await checkHashes(view.sources);
assert.equal(view.resultSha256,v.resultSha256);assert.equal(view.htmlSha256,sha(await readFile(resolve(root,`docs/experiments/${id}-view.html`))));
assert.equal(view.payloadSha256,sha(await readFile(resolve(root,`docs/experiments/${id}-view.json`))));
for(const p of ['LICENSE','scripts/replay-conservative-v1.mjs','scripts/conservative-v1-view.html','scripts/package-conservative-v1.mjs','docs/conservative-intervention-v1.md','docs/releases/conservative-development-v1.arithmetic.json'])paths.add(p);
await mkdir(resolve(root,'target/releases'),{recursive:true});const staging=await mkdtemp(resolve(root,'target/conservative-package-')),checksums={};
for(const p of [...paths].sort()){const dest=resolve(staging,p);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,p),dest);checksums[p]=sha(await readFile(dest));}
await writeFile(resolve(staging,'package.json'),JSON.stringify({name,version:'0.1.0',private:true,type:'module',engines:{node:'>=24'},scripts:{test:'node --test scripts/conservative-v1.test.mjs',evaluate:'node scripts/evaluate-conservative-v1.mjs',verify:'node scripts/verify-conservative-v1.mjs'}},null,2)+'\n');
await writeFile(resolve(staging,'README.md'),`# Tactical Air: conservative interventions\n\nMIT-licensed Node.js 24 research kit. No npm install, API key or Rust rebuild. Python 3 is optional for the separate arithmetic check.\n\nRead [the guide](docs/conservative-intervention-v1.md). Open docs/experiments/${id}-view.html for offline playback.\n\nRun \`shasum -a 256 -c SHA256SUMS\`, \`npm test\`, \`npm run verify\`, and \`python3 scripts/check-conservative-arithmetic-v1.py\`. Regenerate with a new output prefix as explained in the guide. Writers refuse overwrites.\n\nThis is development on 48 previously examined cases: 259,584 cached transitions, zero new scored physical fights. All candidates fail their advancement gates. The original learner remains unchanged. Verification repeats 192 table fights and 8,160 trajectory fights; those are not new inferential samples. The kit includes source audit and selection records, the archived Rust/Wasm runtime, every transition, aggregate results, checksums, and 126 reconstructed recordings.\n`);
for(const p of ['README.md','package.json'])checksums[p]=sha(await readFile(resolve(staging,p)));
await writeFile(resolve(staging,'SHA256SUMS'),Object.entries(checksums).sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>`${h}  ${p}\n`).join(''));
execFileSync('tar',['-czf',archive,'-C',staging,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const content=await readFile(archive),manifest={artifact,sha256:sha(content),bytes:content.length,files:Object.keys(checksums).length+1,cachedTransitions:v.cachedTransitions,newScoredPhysicalEncounters:0,recordings:view.recordings};
await writeNew(resolve(root,'docs/releases/conservative-development-v1.package.json'),manifest);console.log(JSON.stringify(manifest,null,2));
