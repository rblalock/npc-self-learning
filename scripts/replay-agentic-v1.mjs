import assert from 'node:assert/strict';
import { readFile,writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { ROOT } from './agentic-v1/io.mjs';
import { sha } from './agentic-v1/design.mjs';
import { summarize } from './agentic-v1/trial.mjs';

const [input,output]=process.argv.slice(2);assert.ok(input&&output,'Use <results.json[.gz]> <new-view.html>');
const bytes=await readFile(resolve(ROOT,input));const results=JSON.parse((input.endsWith('.gz')?gunzipSync(bytes):bytes).toString());
const data={protocol:results.protocol,summary:summarize(results),resultsSha256:sha(results),
  cases:results.cases.map(c=>({seed:c.seed,index:c.index,histories:Object.fromEntries(Object.entries(c.histories).map(([h,bs])=>[h,bs.map(b=>({arm:b.arm,replicate:b.replicate,schedule:b.schedule,rows:b.rows.map(r=>({postRound:r.postRound,decision:r.decision,fight:r.fight,call:r.call?{status:r.call.status,metadata:r.call.metadata}:null}))}))]))}))};
const safe=JSON.stringify(data).replaceAll('<','\\u003c').replaceAll('>','\\u003e').replaceAll('&','\\u0026').replaceAll('\u2028','\\u2028').replaceAll('\u2029','\\u2029');
const template=await readFile(new URL('./agentic-v1/view.html',import.meta.url),'utf8');
await writeFile(resolve(ROOT,output),template.replace('__DATA__',safe),{flag:'wx'});
console.log(JSON.stringify({written:output,resultsSha256:data.resultsSha256,recordedFights:data.cases.flatMap(c=>Object.values(c.histories).flat()).reduce((n,b)=>n+b.rows.filter(r=>r.fight.frames).length,0)}));
