import { readFile,writeFile,mkdir,cp,readdir,stat,rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join,dirname,resolve,relative } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),site=join(root,'apps/microsite'),dist=join(site,'dist');
const read=async path=>JSON.parse(await readFile(join(root,path),'utf8'));
await rm(dist,{recursive:true,force:true});
for(const name of ['assets','evidence','downloads','notes','examples/guard'])await mkdir(join(dist,name),{recursive:true});
await cp(join(site,'src'),dist,{recursive:true});
await cp(join(root,'apps/arena/dist'),join(dist,'play'),{recursive:true});
await cp(join(site,'art/action.webp'),join(dist,'assets/field.webp'));
await cp(join(root,'apps/arena/public/fonts'),join(dist,'assets/fonts'),{recursive:true});
await cp(join(root,'examples/browser-guard'),join(dist,'examples/guard'),{recursive:true});
await cp(join(root,'packages/browser/dist'),join(dist,'examples/guard/sdk'),{recursive:true});
await cp(join(root,'apps/arena/public/wasm'),join(dist,'examples/guard/wasm'),{recursive:true});
const release=await read('target/releases/release.json'),performance=await read('docs/releases/performance-0.3.0.json');
for(const f of release.files)await cp(join(root,'target/releases',f.name),join(dist,'downloads',f.name));
for(const name of ['SHA256SUMS','release.json'])await cp(join(root,'target/releases',name),join(dist,'downloads',name));
await cp(join(root,'docs/releases/validation-0.3.0.json'),join(dist,'downloads/validation-0.3.0.json'));
await cp(join(root,'LICENSE'),join(dist,'downloads/LICENSE'));
await cp(join(root,'docs/releases/performance-0.3.0.json'),join(dist,'evidence/performance-0.3.0.json'));
const experiments={};
for(const id of ['adaptation-v1','reward-attribution-v1','additive-credit-v1','scenario-transfer-v1']){
  for(const suffix of ['protocol.json','summary.json'])await cp(join(root,'docs/experiments',`${id}.${suffix}`),join(dist,'evidence',`${id}.${suffix}`));
  const raw=await readFile(join(root,'docs/experiments',`${id}.results.json`));
  await writeFile(join(dist,'evidence',`${id}.results.json.gz`),gzipSync(raw,{level:9}));
  if(id==='scenario-transfer-v1')continue;
  const summary=await read(`docs/experiments/${id}.summary.json`),original=id==='adaptation-v1';
  const keys=original?['online','trained-frozen','selected-fixed','uniform']:['candidate-online','candidate-trained-frozen','selected-fixed','uniform'];
  experiments[id]={styles:Object.fromEntries(Object.entries(summary.bySwitch).map(([style,s])=>{
    const effect=original?s.late.onlineMinusFrozen:s.late.candidateLearningBenefit;
    return [style,{curve:s.curve.map(w=>({rounds:w.rounds,values:keys.map(k=>w.conditions[k].damage)})),effect:{meanDifference:effect.meanDifference,interval:effect.interval}}];
  }))};
}
const scenarios=await read('docs/experiments/scenario-transfer-v1.summary.json');
const rows=Object.entries(scenarios.groups).flatMap(([scenario,styles])=>Object.entries(styles).map(([style,s])=>({scenario,style,original:s.individual.damage,additive:s.additive.damage,fixed:s.fixedDamage,originalBenefit:s.individualLearningBenefit.meanDifference,additiveBenefit:s.additiveLearningBenefit.meanDifference})));
await writeFile(join(dist,'evidence/explorer.json'),JSON.stringify({experiments,scenarios:rows,release,performance})+'\n');

// Small local renderer for the repository's prose, tables and code blocks.
// Escape source HTML and keep links restricted to local files, fragments or HTTP(S).
// Only reviewed documents are public. Adding a Markdown file to the repository
// must not silently publish a draft, handoff or internal working note.
const publicNotes=await read('apps/microsite/public-notes.json');
const sources=new Set(),slugs=new Set();
const documents=publicNotes.documents.map(({source,slug})=>{
  const path=relative(root,resolve(root,source));
  if(path!==source||!source.endsWith('.md')||!(source==='README.md'||source.startsWith('docs/')))
    throw Error('Invalid public document source: '+source);
  if(!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(slug)||sources.has(source)||slugs.has(slug))
    throw Error('Invalid or duplicate public document: '+source+' / '+slug);
  sources.add(source);slugs.add(slug);return [source,slug];
});

const lookup=new Map(documents.map(([path,slug])=>[path,`../notes/${slug}.html`]));
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const jobs=new Map(),missing=[];
function href(path,from){
  if(/^https?:\/\//.test(path)||path.startsWith('#'))return escape(path);
  const [pathname,fragment]=path.split('#'),local=relative(root,resolve(root,dirname(from),pathname)),suffix=fragment?'#'+fragment:'';
  if(local.startsWith('../')||local.startsWith('.'))throw Error('Unsafe publication path: '+path);
  if(lookup.has(local))return lookup.get(local)+suffix;
  if(local.endsWith('.md'))throw Error('Linked document is not listed for publication: '+local);
  const file=local.split('/').at(-1);let dest;
  if(local.startsWith('target/releases/'))dest='downloads/'+file;
  else if(local.startsWith('docs/experiments/'))dest='evidence/'+file+(/\.(results|audit)\.json$/.test(file)?'.gz':'');
  else if(local.startsWith('docs/releases/'))dest='evidence/'+file;
  else if(local.startsWith('apps/arena/public/fonts/'))dest='assets/fonts/'+file;
  else dest='sources/'+local;
  jobs.set(local,dest);return '../'+escape(dest)+suffix;
}
function inline(s,from){return escape(s).replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,text,url)=>`<a href="${href(url,from)}">${text}</a>`).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');}
function markdown(md,from){
  const lines=md.split('\n');let html='',i=0;
  while(i<lines.length){const line=lines[i];if(!line.trim()){i++;continue;}
    if(line.startsWith('```')){const block=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))block.push(lines[i++]);i++;html+=`<pre><code>${escape(block.join('\n'))}</code></pre>`;continue;}
    const head=line.match(/^(#{1,6}) (.*)$/);if(head){html+=`<h${head[1].length}>${inline(head[2],from)}</h${head[1].length}>`;i++;continue;}
    if(line.startsWith('|')&&lines[i+1]?.match(/^\|[\s:|\-]+\|$/)){
      const cells=l=>l.replace(/^\||\|$/g,'').split('|').map(s=>s.trim());html+='<div class="table-scroll"><table><thead><tr>'+cells(line).map(c=>`<th>${inline(c,from)}</th>`).join('')+'</tr></thead><tbody>';i+=2;
      while(i<lines.length&&lines[i].startsWith('|')){html+='<tr>'+cells(lines[i++]).map(c=>`<td>${inline(c,from)}</td>`).join('')+'</tr>';}
      html+='</tbody></table></div>';continue;
    }
    if(/^(?:- |\d+\. )/.test(line)){const ordered=/^\d/.test(line),tag=ordered?'ol':'ul';html+=`<${tag}>`;while(i<lines.length&&/^(?:- |\d+\. )/.test(lines[i]))html+=`<li>${inline(lines[i++].replace(/^(?:- |\d+\. )/,''),from)}</li>`;html+=`</${tag}>`;continue;}
    const paragraph=[line];i++;while(i<lines.length&&lines[i].trim()&&!/^(?:#|```|\||- |\d+\. )/.test(lines[i]))paragraph.push(lines[i++]);html+=`<p>${inline(paragraph.join(' '),from)}</p>`;
  }
  return html;
}
for(const [path,slug] of documents){const md=await readFile(join(root,path),'utf8'),title=md.split('\n')[0].replace(/^#+ /,'');await writeFile(join(dist,'notes',slug+'.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} — Tactical Air</title><link rel="stylesheet" href="../style.css"></head><body><main class="doc-page"><a class="back" href="../index.html">← Tactical Air</a>${markdown(md,path)}</main></body></html>`);}
// Publish the latest viewer and its sibling machine-readable sources.
for(const id of ['conservative-development-v1','change-detection-v1','opportunity-validation-v2']){
  for(const suffix of ['protocol.json','summary.json','verification.json'])jobs.set(`docs/experiments/${id}.${suffix}`,`evidence/${id}.${suffix}`);
}
for(const id of ['change-detection-v1','opportunity-validation-v2'])jobs.set(`docs/experiments/${id}.md`,`evidence/${id}.md`);
await mkdir(join(root,'target/editorial'),{recursive:true});
await writeFile(join(root,'target/editorial/microsite-link-map.json'),JSON.stringify(Object.fromEntries([...lookup.entries(),...[...jobs].map(([s,d])=>[s,'../'+d])]),null,2)+'\n');
for(const [source,dest] of jobs){
  const input=join(root,source),output=join(dist,dest);
  try{await stat(input);}catch(e){if(e.code==='ENOENT'){missing.push(source);continue;}throw e;}
  await mkdir(dirname(output),{recursive:true});
  if(dest.endsWith('.gz')&&!source.endsWith('.gz'))await writeFile(output,gzipSync(await readFile(input),{level:9}));
  else await cp(input,output,{recursive:true});
}
if(missing.length)throw Error('Missing publication sources: '+[...new Set(missing)].join(', '));
// Supplemental kit checksums are separate from the immutable 0.3.0 release manifest.
const {createHash}=await import('node:crypto');let kitChecks='';
for(const f of (await readdir(join(dist,'downloads'))).filter(f=>f.includes('-lab-')&&f.endsWith('.tar.gz')).sort())kitChecks+=createHash('sha256').update(await readFile(join(dist,'downloads',f))).digest('hex')+'  '+f+'\n';
await writeFile(join(dist,'downloads','RESEARCH-SHA256SUMS'),kitChecks);
console.log(`Microsite built at ${dist}; ${Object.keys(experiments).length} chart experiments, ${rows.length} scenario rows, ${documents.length} source-backed notes.`);
