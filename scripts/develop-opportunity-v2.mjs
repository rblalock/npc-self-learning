import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { GROUPS,fixture,enumerate } from './opportunity-v2/fixtures.mjs';
import { root,writeNew,hashes } from './synthetic/io.mjs';
const records=[];
for(const group of GROUPS) {
  for(const seed of [201,202,203,204])for(let i=0;i<32;i++)records.push(enumerate(fixture(group,seed,i)));
  const rows=records.filter(r=>r.fixture.group===group),yes=rows.filter(r=>r.admission.accepted);
  console.error(JSON.stringify({group,accepted:yes.length,total:rows.length,first:yes.slice(0,4).map(r=>({seed:r.fixture.seed,index:r.fixture.index,gaps:r.admission.switchGaps}))}));
}
const paths=['scripts/develop-opportunity-v2.mjs','scripts/opportunity-v2/fixtures.mjs'],sources=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await readFile(resolve(root,p),'utf8')]))),
  result={schema:1,purpose:'Development-only action tables. No learner outcome used for selection.',sourceHashes:await hashes(paths),sources,records,
  scoredEncounters:records.reduce((n,r)=>n+r.blocks.flat().reduce((m,b)=>m+b.rows.length,0),0)};
await writeNew(resolve(root,'docs/experiments/opportunity-development-v2.json'),result);
console.log(JSON.stringify({scoredEncounters:result.scoredEncounters}));
