import assert from 'node:assert/strict';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve,dirname } from 'node:path';
import { root,sha,checkHashes,writeNew,hashes } from './synthetic/io.mjs';
import { ID } from './opportunity-v2/io.mjs';
import { metrics } from './opportunity-v2/metrics.mjs';
import { createPolicy } from './research/policy.mjs';
import { encounter } from './research/combat.mjs';

const args=process.argv.slice(2);assert.ok(!args.length||(args.length===2&&args[0]==='--out'));
const prefix=resolve(root,args[1]??`docs/experiments/${ID}-view`),bytes=await readFile(resolve(root,`docs/experiments/${ID}.results.json`)),r=JSON.parse(bytes),
  proof=JSON.parse(await readFile(resolve(root,`docs/experiments/${ID}.verification.json`))),auditBytes=await readFile(resolve(root,`docs/experiments/${ID}.audit.json`)),audit=JSON.parse(auditBytes);
assert.equal(proof.resultSha256,sha(bytes));assert.equal(proof.auditSha256,sha(auditBytes));assert.equal(proof.matched,true);await checkHashes(r.provenance.sourceHashes);
const names={'solo-vanguard':'Vanguard alone','solo-flanker':'Flanker alone','solo-ranger':'Ranger alone',squad:'Squad coordination','context-flanker':'Flanker terrain memory','context-ranger':'Ranger terrain memory'},
  labels={'switch/online':'Learning','switch/frozen':'Frozen memory','switch/uniform':'Random choices','switch/reset':'Reset memory',
    'return/online':'Retained · learning','return/frozen':'Retained · frozen','return/reset':'Reset memory',
    'sham/online':'Learning','sham/frozen':'Frozen memory','independent/online':'Independent roles · learning','independent/frozen':'Independent roles · frozen',
    'pooled/test':'One pooled memory','terrain/test':'Terrain memory','shuffled/test':'Shuffled labels'},groups=[];
let reconstructed=0;
for(const [id,summary] of Object.entries(r.summary.groups)) {
  const t=r.trials.find(t=>t.group===id&&t.seed===r.protocol.demonstration.seed),a=t?audit.records.find(a=>a.fixture.group===id&&a.fixture.seed===t.seed&&a.fixture.index===t.index):null,
    context=id.startsWith('context'),primary=Object.values(summary.comparisons).find(c=>c.primary),phases=context?['context']:['switch','return','sham'],views={};
  for(const phase of phases) {
    const comparison=context?primary:summary.comparisons[phase==='switch'?'learning-minus-frozen':phase==='return'?'return-learning':'sham-learning'],
      trials=r.trials.filter(t=>t.group===id),curves=Array.from({length:r.protocol.phase_rounds},(_,i)=>({round:i+1,left:0,right:0}));
    for(const trial of trials) {
      const table=audit.records.find(a=>a.fixture.group===id&&a.fixture.seed===trial.seed&&a.fixture.index===trial.index);
      for(const side of ['left','right'])for(const [i,m] of metrics(trial.blocks[comparison[side]],table).entries())curves[i][side]+=m.expectedRegret/trials.length;
    }
    const keys=Object.keys(t?.blocks??{}).filter(k=>context?k.endsWith('/test'):k.startsWith(phase+'/')||(phase==='switch'&&k.startsWith('independent/')&&!k.endsWith('/train'))),recordings={};
    for(const key of keys) {
      const b=t.blocks[key],policy=createPolicy(b.seed,b.spec);policy.request({op:'restore',snapshot:b.initial});
      try {
        for(let i=0;i<r.protocol.demonstration.round;i++) {
          const capture=i===r.protocol.demonstration.round-1,value=encounter(policy,b.spec,b.scenarios[i],{...b.options,capture}),row=capture?value.row:value;
          assert.deepEqual(row,b.rows[i]);reconstructed++;
          if(capture)recordings[key]={...value,label:labels[key],scenario:b.scenarios[i],metric:metrics(b,a)[i],
            changes:row.choices.map(c=>{
              const match=x=>x.role===c.request.role&&x.context===c.request.context&&x.action===c.action,
                before=(i?b.rows[i-1].policy:b.initial.cells).find(match),after=row.policy.find(match);
              return {role:c.request.role,action:c.action,probability:c.probabilities.find(p=>p.action===c.action).probability,before:before.score,after:after.score};
            })};
        }
      }finally{policy.dispose();}
    }
    views[phase]={comparison,curves,recordings,leftLabel:labels[comparison.left],rightLabel:labels[comparison.right],
      leftArm:summary.arms[comparison.left],rightArm:summary.arms[comparison.right]};
  }
  groups.push({id,name:names[id],summary,views,seed:r.protocol.demonstration.seed,round:r.protocol.demonstration.round,
    missing:!t,fixture:a?.fixture??null,opportunity:a?.admission??null});
}
const payload={id:ID,groups,reconstructed,verification:proof,selection:r.protocol.demonstration.selection,
  budget:r.summary.budget,threshold:r.protocol.minimum_gain};
await mkdir(dirname(prefix),{recursive:true});await writeNew(prefix+'.json',payload);
const html=(await readFile(resolve(root,'scripts/opportunity-v2-view.html'),'utf8')).replace('__PAYLOAD__',JSON.stringify(payload).replaceAll('<','\\u003c'));
await writeNew(prefix+'.html',html);await writeNew(prefix+'.view.json',{htmlSha256:sha(html),payloadSha256:sha(JSON.stringify(payload)+'\n'),
  sources:await hashes(['scripts/replay-opportunity-v2.mjs','scripts/opportunity-v2-view.html']),resultSha256:sha(bytes),reconstructed,
  recordings:groups.reduce((n,g)=>n+Object.values(g.views).reduce((m,v)=>m+Object.keys(v.recordings).length,0),0)});
console.log(JSON.stringify({html:prefix+'.html',reconstructed}));
