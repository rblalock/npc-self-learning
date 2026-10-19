import { detectorFor } from './intervention.mjs';

export function stressChecks(p) {
  const id={role:'ranger',context:'arena',action:'aim'}, other={...id,action:'lead'};
  const rows=(reward,count,extra={})=>Array.from({length:count},()=>({...id,reward,observed:true,...extra}));
  const cases=[
    ...[-1,0,1].map(reward=>({name:`constant-${reward}`,training:rows(reward,16),test:rows(reward,800).map((o,i)=>({...o,...(i%37===0?id:other),observed:i%3===0})),expect:false})),
    {name:'single-outlier',training:rows(.8,16),test:[...rows(-1,1),...rows(.8,40)],expect:false},
    {name:'unobserved',training:rows(.8,16),test:[...rows(-1,100,{observed:false}),...rows(.8,40)],expect:false},
    {name:'increase',training:rows(-.8,16),test:rows(.8,40),expect:false},
    {name:'sustained-decline',training:rows(.8,16),test:rows(-.8,40),expect:true}
  ];
  return Object.fromEntries(p.candidates.map(arm=>{
    const results=cases.map(c=>{
      const d=detectorFor(arm,[id,other],p.legacy_detector);
      for(const o of c.training)d.observe(o,{armed:false});
      const events=c.test.map((o,i)=>({round:i+1,event:d.observe(o)})).filter(r=>r.event);
      const interventions=events.filter(r=>r.event.delta<0);
      return {name:c.name,observations:c.test.length,events,interventions:interventions.length,pass:c.expect?interventions.length>0:interventions.length===0};
    });
    return [arm,{cases:results,pass:results.every(r=>r.pass)}];
  }));
}
