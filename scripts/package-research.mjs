import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp,copyFile,readdir,access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve,dirname } from 'node:path';
import { root,sha,checkHashes,writeNew } from './synthetic/io.mjs';
import { IDS } from './research/io.mjs';

const name='tactical-air-research-lab-v1-r2',artifact=`target/releases/${name}.tar.gz`,archive=resolve(root,artifact);
try {await access(archive);throw Error(`Refusing to overwrite ${archive}`);}catch(e){if(e.code!=='ENOENT')throw e;}
const ids=[...IDS,'learning-opportunity-audit-v1'],paths=new Set();
for(const id of ids) {
  const bytes=await readFile(resolve(root,`docs/experiments/${id}.results.json`)),r=JSON.parse(bytes);
  await checkHashes(r.provenance.sourceHashes);
  for(const path of Object.keys(r.provenance.sourceHashes))if(!path.startsWith('target/'))paths.add(path);
  const v=JSON.parse(await readFile(resolve(root,`docs/experiments/${id}.verification.json`)));
  assert.equal(v.resultSha256,sha(bytes));assert.equal(v.matched,true);
}
for(const file of await readdir(resolve(root,'docs/experiments')))
  if(ids.some(id=>file.startsWith(id+'.'))||file==='research-program-v1.started.json'||file.startsWith('research-program-v1-view-2.'))paths.add(`docs/experiments/${file}`);
const view=JSON.parse(await readFile(resolve(root,'docs/experiments/research-program-v1-view-2.view.json')));
await checkHashes(view.sources);
assert.equal(sha(await readFile(resolve(root,'docs/experiments/research-program-v1-view-2.html'))),view.htmlSha256);
assert.equal(sha(await readFile(resolve(root,'docs/experiments/research-program-v1-view-2.json'))),view.payloadSha256);
for(const path of ['LICENSE','scripts/replay-research.mjs','scripts/research-view.html','scripts/package-research.mjs',
  'scripts/validate-research-package.mjs','docs/research-program.md','docs/verification-research-program-v1.md'])paths.add(path);
await mkdir(resolve(root,'target/releases'),{recursive:true});
const staging=await mkdtemp(resolve(root,'target/research-lab-package-')),checksums={};
for(const path of [...paths].sort()) {
  const dest=resolve(staging,path);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,path),dest);
  checksums[path]=sha(await readFile(dest));
}
const pkg={name,version:'0.1.0',private:true,type:'module',engines:{node:'>=24'},scripts:{
  test:'node --test scripts/research.test.mjs scripts/opportunity-audit.test.mjs',
  'test:research':'node --test scripts/research.test.mjs','test:opportunity':'node --test scripts/opportunity-audit.test.mjs',
  'evaluate:research':'node scripts/evaluate-research.mjs','verify:research':'node scripts/verify-research.mjs',
  'audit:opportunity':'node scripts/opportunity-audit.mjs','replay:research':'node scripts/replay-research.mjs'}};
await writeFile(resolve(staging,'package.json'),JSON.stringify(pkg,null,2)+'\n');
await writeFile(resolve(staging,'README.md'),`# Tactical Air research lab\n\nMIT-licensed, dependency-free headless research kit. Requires Node.js 24; no npm install, API key or Rust rebuild.\n\nRead [the guide](docs/research-program.md) and [verification record](docs/verification-research-program-v1.md). Open docs/experiments/research-program-v1-view-2.html for the offline fieldbook.\n\nCheck files with \`shasum -a 256 -c SHA256SUMS\`, then \`npm test\`. Run \`npm run verify:research\` for all 72,000 main encounters. The guide explains fresh-output replication and the 3,584-encounter opportunity audit.\n\nSix controlled screens and one post-hoc audit are preserved, including unfavorable outcomes. None of the five improvement proposals passed; the scripted harm-margin pass does not establish deception resistance. The original learner remains the reference.\n`);
for(const path of ['README.md','package.json'])checksums[path]=sha(await readFile(resolve(staging,path)));
await writeFile(resolve(staging,'SHA256SUMS'),Object.entries(checksums).sort(([a],[b])=>a.localeCompare(b)).map(([p,h])=>`${h}  ${p}\n`).join(''));
execFileSync('tar',['-czf',archive,'-C',staging,'.'],{env:{...process.env,COPYFILE_DISABLE:'1'}});
const bytes=await readFile(archive),manifest={artifact,sha256:sha(bytes),bytes:bytes.length,files:Object.keys(checksums).length+1,
  scoredEncounters:75584,mainEncounters:72000,diagnosticEncounters:3584,recordings:35};
await writeNew(resolve(root,'docs/releases/research-lab-v1-r2.package.json'),manifest);
console.log(JSON.stringify({...manifest,staging},null,2));
