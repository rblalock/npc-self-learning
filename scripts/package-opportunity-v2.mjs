import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,copyFile,readdir,access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { ID } from './opportunity-v2/io.mjs';
const name='tactical-air-opportunity-lab-v2',artifact=`target/releases/${name}.tar.gz`,archive=resolve(root,artifact);
try{await access(archive);throw Error('Refusing to overwrite '+archive);}catch(e){if(e.code!=='ENOENT')throw e;}
const bytes=await readFile(resolve(root,`docs/experiments/${ID}.results.json`)),r=JSON.parse(bytes),v=JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}.verification.json`)));
await checkHashes(r.provenance.sourceHashes);assert.equal(v.resultSha256,sha(bytes));assert.equal(v.matched,true);
assert.equal(v.auditSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}.audit.json`))));
const paths=new Set(Object.keys(r.provenance.sourceHashes).filter(p=>!p.startsWith('target/')));
for(const f of await readdir(resolve(root,'docs/experiments')))
 if(f.startsWith(ID+'.')||f.startsWith(ID+'-view-2.')||f.startsWith('opportunity-development-v2.'))paths.add('docs/experiments/'+f);
const view=JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}-view-2.view.json`)));await checkHashes(view.sources);
assert.equal(view.resultSha256,v.resultSha256);assert.equal(view.htmlSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}-view-2.html`))));
assert.equal(view.payloadSha256,sha(await readFile(resolve(root,`docs/experiments/${ID}-view-2.json`))));
for(const p of ['LICENSE','scripts/replay-opportunity-v2.mjs','scripts/opportunity-v2-view.html','scripts/verify-opportunity-development-v2.mjs',
 'scripts/package-opportunity-v2.mjs','scripts/validate-opportunity-package-v2.mjs','docs/opportunity-lab-v2.md','docs/verification-opportunity-v2.md'])paths.add(p);
await mkdir(resolve(root,'target/releases'),{recursive:true});const staging=await mkdtemp(resolve(root,'target/opportunity-package-')),checksums={};
for(const p of [...paths].sort()){const dest=resolve(staging,p);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,p),dest);checksums[p]=sha(await readFile(dest));}
await writeFile(resolve(staging,'package.json'),JSON.stringify({name,version:'0.1.0',private:true,type:'module',engines:{node:'>=24'},scripts:{
 test:'node --test scripts/opportunity-v2.test.mjs','evaluate:opportunity-v2':'node scripts/evaluate-opportunity-v2.mjs',
 'verify:opportunity-v2':'node scripts/verify-opportunity-v2.mjs','replay:opportunity-v2':'node scripts/replay-opportunity-v2.mjs'}},null,2)+'\n');
await writeFile(resolve(staging,'README.md'),`# Tactical Air: validated adaptation opportunities\n\nMIT-licensed Node.js 24 research kit. No npm install, API key or Rust rebuild.\n\nRead [the guide](docs/opportunity-lab-v2.md) and [verification](docs/verification-opportunity-v2.md). Open docs/experiments/${ID}-view-2.html for offline playback.\n\nRun \`shasum -a 256 -c SHA256SUMS\`, \`npm test\`, then \`npm run verify:opportunity-v2\`. Reproduce to a new output prefix as explained in the guide; evidence writers refuse overwrites.\n\nAll 46,080 reserved fights and 4,608 development fights are retained, including rejected candidates. Five primary screens pass in this deliberately selected challenge population; joint squad remains inconclusive. No production learner was changed.\n`);
for(const p of ['README.md','package.json'])checksums[p]=sha(await readFile(resolve(staging,p)));
await writeFile(resolve(staging,'SHA256SUMS'),Object.entries(checksums).sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>`${h}  ${p}\n`).join(''));
execFileSync('tar',['-czf',archive,'-C',staging,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const content=await readFile(archive),manifest={artifact,sha256:sha(content),bytes:content.length,files:Object.keys(checksums).length+1,
 reservedEncounters:r.summary.budget.total,developmentEncounters:4608,recordings:view.recordings};
await writeNew(resolve(root,'docs/releases/opportunity-lab-v2.package.json'),manifest);console.log(JSON.stringify(manifest,null,2));
