import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,copyFile,readdir,access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';

const name='tactical-air-retention-lab-v1',artifact=`target/releases/${name}.tar.gz`,archive=resolve(root,artifact);
try {await access(archive);throw Error(`Refusing to overwrite ${archive}`);}catch(e){if(e.code!=='ENOENT')throw e;}
const ids=['synthetic-population-v1','switch-boundary-v1','retention-v1'],paths=new Set();
for(const id of ids) {
  const r=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.results.json`)));
  await checkHashes(r.provenance.sourceHashes);
  for(const path of Object.keys(r.provenance.sourceHashes))if(!path.startsWith('target/'))paths.add(path);
}
for(const id of ['switch-boundary-v1','retention-v1']) {
  const v=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.verification.json`)));
  const h=sha(await readFile(resolve(root,`docs/experiments/${id}.results.json`)));
  assert.equal(v.resultsSha256??v.resultSha256,h);assert.equal(v.matched,true);
}
for(const name of await readdir(resolve(root,'docs/experiments'))) {
  if(ids.some(id=>name.startsWith(id)))paths.add(`docs/experiments/${name}`);
}
for(const path of ['LICENSE','scripts/synthetic.test.mjs','scripts/replay-retention.mjs','scripts/retention-replay-view.html',
  'scripts/package-retention.mjs','docs/retention-lab.md','docs/verification-retention-v1.md'])paths.add(path);
await mkdir(resolve(root,'target/releases'),{recursive:true});
const staging=await mkdtemp(resolve(root,'target/retention-lab-package-')),checksums={};
for(const path of [...paths].sort()) {
  const dest=resolve(staging,path);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,path),dest);
  checksums[path]=sha(await readFile(dest));
}
const pkg={name,version:'0.1.0',private:true,type:'module',engines:{node:'>=24'},scripts:{
  'test':'node --test scripts/retention.test.mjs scripts/synthetic.test.mjs',
  'test:retention':'node --test scripts/retention.test.mjs',
  'evaluate:synthetic':'node scripts/evaluate-synthetic.mjs','verify:synthetic':'node scripts/synthetic/verify.mjs population',
  'evaluate:boundary':'node scripts/evaluate-boundary.mjs','verify:boundary':'node scripts/verify-boundary.mjs',
  'evaluate:retention':'node scripts/evaluate-retention.mjs','verify:retention':'node scripts/verify-retention.mjs',
  'replay:retention':'node scripts/replay-retention.mjs'}};
await writeFile(resolve(staging,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await writeFile(resolve(staging,'README.md'),`# Tactical Air retention lab\n\nMIT-licensed headless research kit. Requires Node.js 24; no npm install, API key or Rust rebuild.\n\nRead [the guide](docs/retention-lab.md). Open docs/experiments/retention-v1-view.html for the preselected four-condition replay.\n\nCheck files with \`shasum -a 256 -c SHA256SUMS\`, then \`npm test\`. See the guide for reproduction commands. Result and verification writers refuse to overwrite evidence: reproduce to a new target prefix before invoking a verifier.\n\nThis includes 17,856 new measured encounters across two follow-ups, plus the prior population data needed to reconstruct switch checkpoints. The original learner remains unchanged; unfavorable findings are retained.\n`);
for(const path of ['README.md','package.json'])checksums[path]=sha(await readFile(resolve(staging,path)));
await writeFile(resolve(staging,'SHA256SUMS'),Object.entries(checksums).sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>`${h}  ${p}\n`).join(''));
execFileSync('tar',['-czf',archive,'-C',staging,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const bytes=await readFile(archive),manifest={artifact,sha256:sha(bytes),bytes:bytes.length,files:Object.keys(checksums).length+1,newMeasuredEncounters:17856,priorPopulationEncounters:9920};
await writeNew(resolve(root,'docs/releases/retention-lab-v1.package.json'),manifest);
console.log(JSON.stringify({...manifest,staging},null,2));
