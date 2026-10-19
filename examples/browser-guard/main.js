import { loadPolicy } from './sdk/index.js';
const config={seed:19,roles:[{id:'guard',actions:['patrol','wait']}],contexts:['courtyard'],learning_rate:.22,exploration:.16,temperature:.3,decay:.025,max_update:.16};
const $=id=>document.getElementById(id);
let policy,preferred='patrol';
function refresh(){const view=policy.inspect();const p=view.cells.find(c=>c.action==='patrol').probability;$('odds').textContent=`${(p*100).toFixed(1)}%`;$('bar').value=p;$('inspection').textContent=JSON.stringify(view,null,2);$('status').textContent=`${view.encounter} observations committed.`;}
try{
  policy=await loadPolicy(new URL('./wasm/tactical_air.js',import.meta.url).href,config);refresh();
  $('run').onclick=()=>{for(let i=0;i<40;i++){const d=policy.choose('guard','courtyard',['patrol','wait']);policy.feedback(d.decision_id,d.action===preferred?.8:-.4,true);policy.commit();}refresh();};
  $('switch').onclick=()=>{preferred=preferred==='patrol'?'wait':'patrol';$('rule').textContent=`${preferred==='patrol'?'Patrolling':'Waiting'} currently earns the higher reward.`;};
  $('save').onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(policy.snapshot(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='guard-memory.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
  window.addEventListener('pagehide',()=>policy.dispose(),{once:true});
}catch(error){$('status').textContent=`Wasm could not load: ${String(error)}. Serve this folder over HTTP, not file://.`;for(const b of document.querySelectorAll('button'))b.disabled=true;}
