const $=id=>document.getElementById(id),colors=['#466240','#9a6c21','#a24132','#6c7580'];
const names=['Continued learning','Frozen learned memory','Selected fixed tactics','Random tactics'];
const titles={reverse:'After the player reverses direction',feint:'When the player keeps changing direction',cover:'When the player uses cover and dodges'};
const number=n=>n.toFixed(2),signed=n=>(n>0?'+':'')+number(n);
try{
  const data=await fetch('./evidence/explorer.json').then(r=>{if(!r.ok)throw Error('Evidence unavailable');return r.json();});
  function render(){
    const id=$('experiment').value,style=$('movement').value,run=data.experiments[id],s=run.styles[style];
    $('chart-title').textContent=titles[style];
    const x=i=>62+i*128,y=n=>254-n*2.1,font=innerWidth<700?25:12;
    const grid=[0,20,40,60,80,100].map(n=>`<path d="M62 ${y(n)}H702" stroke="#d3cfb8"/><text x="48" y="${y(n)+4}" text-anchor="end" fill="#62684f" font-size="${font}">${n}</text>`).join('');
    const labels=s.curve.map((w,i)=>`<text x="${x(i)}" y="277" text-anchor="middle" fill="#62684f" font-size="${font}">${w.rounds.join('–')}</text>`).join('');
    const lines=names.map((name,j)=>{const points=s.curve.map((w,i)=>`${x(i)},${y(w.values[j])}`).join(' ');return `<polyline points="${points}" stroke="${colors[j]}" fill="none" stroke-width="${j===0?3.5:2}" ${j===1?'stroke-dasharray="7 5"':j===3?'stroke-dasharray="2 5"':''}/>${s.curve.map((w,i)=>`<circle cx="${x(i)}" cy="${y(w.values[j])}" r="3.5" fill="${colors[j]}"><title>${name}, rounds ${w.rounds.join('–')}: ${number(w.values[j])} HP</title></circle>`).join('')}`;}).reverse().join('');
    $('evidence-chart').innerHTML=`${grid}${labels}${lines}<text x="380" y="304" fill="#62684f" text-anchor="middle" font-size="${font}">Rounds after movement changes</text>`;
    $('effect').textContent=`${signed(s.effect.meanDifference)} HP`;
    const interval=`[${s.effect.interval.map(number).join(', ')}]`;
    let note=`Continued minus frozen memory in rounds 17–24; 95% interval ${interval}. `;
    if(style==='cover')note+='The policies deal identical damage here; this fixture does not distinguish effectiveness.';
    else if(s.effect.meanDifference<0)note+='Continued learning performs worse in this fixture.';
    else note+='Continued learning improves damage in this fixture.';
    if(style==='reverse')note+=' The selected fixed strategy still deals more damage.';
    if(id!=='adaptation-v1')note+=' This candidate failed its full advancement criteria.';
    $('finding-copy').textContent=note;
    $('chart-description').textContent=`${titles[style]}. ${note} Exact values are in the table below.`;
    $('chart-table').innerHTML=`<caption>Enemy damage per round, averaged across 32 policy seeds</caption><thead><tr><th>Rounds</th>${names.map(n=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${s.curve.map(w=>`<tr><td>${w.rounds.join('–')}</td>${w.values.map(n=>`<td>${number(n)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    $('experiment-sources').innerHTML=`<a href="./notes/${id}.html">Report</a><a href="./evidence/${id}.protocol.json">Protocol</a><a href="./evidence/${id}.summary.json">Summary JSON</a><a href="./evidence/${id}.results.json.gz" download>All traces (.json.gz)</a>`;
  }
  $('experiment').onchange=render;$('movement').onchange=render;window.addEventListener('resize',render);render();
  $('scenario-table').innerHTML='<thead><tr><th>Layout / movement</th><th>Original damage</th><th>Additive damage</th><th>Fixed damage</th><th>Original learning benefit</th><th>Additive learning benefit</th></tr></thead><tbody>'+data.scenarios.map(r=>`<tr><td>${r.scenario} / ${r.style}</td><td>${number(r.original)}</td><td>${number(r.additive)}</td><td>${number(r.fixed)}</td><td>${signed(r.originalBenefit)}</td><td>${signed(r.additiveBenefit)}</td></tr>`).join('')+'</tbody>';
  for(const f of data.release.files){const el=document.querySelector(`[data-size="${f.name}"]`);if(el)el.textContent=f.bytes>=1e6?`${(f.bytes/1e6).toFixed(1)} MB`:`${Math.round(f.bytes/1000)} KB`;}
  const p=data.performance;$('performance-copy').textContent=`${number(p.rust.median)} µs in Rust; ${number(p.wasm.median)} µs through Node/Wasm on ${p.environment.cpu}. Compiled Wasm: ${(p.size.wasmBytes/1024).toFixed(1)} KiB (${(p.size.wasmGzipBytes/1024).toFixed(1)} KiB gzip).`;
}catch(error){$('effect').textContent='Evidence unavailable';$('finding-copy').textContent='The data file could not load. The reports and raw downloads remain available below.';console.error(error);}
