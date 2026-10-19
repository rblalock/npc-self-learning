import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,copyFile,readdir,access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { ID } from './change-detection-v1/io.mjs';
const name='tactical-air-change-detection-lab-v1',artifact=`target/releases/${name}.tar.gz`,archive=resolve(root,artifact);
try{await access(archive);throw Error('Refusing overwrite '+archive);}catch(e){if(e.code!=='ENOENT')throw e;}
const bytes=await readFile(resolve(root,`docs/experiments/${ID}.results.json`)),r=JSON.parse(bytes),v=JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}.verification.json`)));
await checkHashes(r.provenance.sourceHashes);assert.equal(v.resultSha256,sha(bytes));assert.equal(v.matched,true);
assert.equal(v.auditSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}.audit.json`))));
const development=JSON.parse(await readFile(resolve(root,'docs/experiments/change-detection-development-v1.json')));
await checkHashes(development.sourceHashes);
const paths=new Set([...Object.keys(r.provenance.sourceHashes),...Object.keys(development.sourceHashes)].filter(p=>!p.startsWith('target/')));
for(const f of await readdir(resolve(root,'docs/experiments')))if(f.startsWith(ID+'.')||f.startsWith(ID+'-view.')||f.startsWith('change-detection-development-v1.'))paths.add('docs/experiments/'+f);
const view=JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}-view.view.json`)));await checkHashes(view.sources);
assert.equal(view.resultSha256,v.resultSha256);assert.equal(view.htmlSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}-view.html`))));
assert.equal(view.payloadSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}-view.json`))));
for(const p of ['LICENSE','scripts/replay-change-detection-v1.mjs','scripts/change-detection-v1-view.html','scripts/check-change-arithmetic-v1.py',
 'scripts/package-change-detection-v1.mjs','scripts/validate-change-package-v1.mjs','docs/change-detection-lab-v1.md','docs/verification-change-detection-v1.md',
 'docs/releases/change-detection-v1.browser-qa.json','docs/releases/change-detection-v1.primary-arithmetic.json'])paths.add(p);
await mkdir(resolve(root,'target/releases'),{recursive:true});const staging=await mkdtemp(resolve(root,'target/change-package-')),checksums={};
for(const p of [...paths].sort()){const dest=resolve(staging,p);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,p),dest);checksums[p]=sha(await readFile(dest));}
await writeFile(resolve(staging,'package.json'),JSON.stringify({name,version:'0.1.0',private:true,type:'module',engines:{node:'>=24'},scripts:{
 test:'node --test scripts/change-detection-v1.test.mjs','evaluate:change':'node scripts/evaluate-change-detection-v1.mjs',
 'verify:change':'node scripts/verify-change-detection-v1.mjs','verify:development':'node scripts/verify-change-development-v1.mjs',
 'replay:change':'node scripts/replay-change-detection-v1.mjs'}},null,2)+'\n');
await writeFile(resolve(staging,'README.md'),`# Tactical Air: knowing when to forget\n\nMIT-licensed Node.js 24 research kit. No npm install, API key or Rust rebuild.\n\nRead [the guide](docs/change-detection-lab-v1.md) and [verification](docs/verification-change-detection-v1.md). Open docs/experiments/${ID}-view.html for offline playback.\n\nRun \`shasum -a 256 -c SHA256SUMS\`, \`npm test\`, \`npm run verify:change\`, and \`npm run verify:development\`. Reproduce to a new prefix as explained in the guide. Writers refuse overwrites.\n\nAll 69,120 reserved physical fights and 14,432 cached development transitions are retained. Neither automatic-forgetting rule passes. The existing learner remains unchanged. Cached development uses earlier physical tables and adds no new scored fights. The development verifier includes all its required tables; regenerating their original selection requires the separate opportunity-v2 audit.\n`);
for(const p of ['README.md','package.json'])checksums[p]=sha(await readFile(resolve(staging,p)));
await writeFile(resolve(staging,'SHA256SUMS'),Object.entries(checksums).sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>`${h}  ${p}\n`).join(''));
execFileSync('tar',['-czf',archive,'-C',staging,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const content=await readFile(archive),manifest={artifact,sha256:sha(content),bytes:content.length,files:Object.keys(checksums).length+1,
 reservedEncounters:r.summary.budget.total,cachedDevelopmentTransitions:development.summary.budget.learningEncounters,recordings:view.recordings};
await writeNew(resolve(root,'docs/releases/change-detection-v1.package.json'),manifest);console.log(JSON.stringify(manifest,null,2));
