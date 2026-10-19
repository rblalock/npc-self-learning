import './style.css';
import './playtest.css';
import { Arena, WIDTH, HEIGHT, DURATION, type Input } from './sim';
import { createPolicy, type BrowserPolicy } from './policy';
import { drawBattlefield } from './renderer';
import { Playtest, PLAYTEST_PROTOCOL, fixedStudyPolicy, type Answers } from './playtest';
import { BUILD_ID } from './build-info';

const params=new URLSearchParams(location.search),draws=crypto.getRandomValues(new Uint32Array(2));
const assigned=params.get('order'),qa=params.get('qa')==='1';
const session=new Playtest({id:crypto.randomUUID(),seed:draws[0],adaptiveFirst:assigned==='adaptive-first'||(assigned!=='fixed-first'&&draws[1]%2===0),assignment:['adaptive-first','fixed-first'].includes(assigned??'')?'facilitator':'randomized',build:BUILD_ID,qa});
const $=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
document.querySelector('#app')!.innerHTML=`<main class="shell field-study">
  <header class="top"><h1 class="brand">TACTICAL<span>AIR</span></h1><span>FIELD PLAYTEST</span><a href="./index.html">Back to game</a></header>
  <section class="playtest-heading"><div><span id="progress">Before you play</span><h2 id="stage-title">Two sets. Your verdict.</h2><p id="instructions">Warm up, play two sets of 12 short rounds, then tell us how each felt. Allow about 10–15 minutes. Keyboard and mouse required.</p></div><div class="study-toolbar"><button id="pause-test" disabled>Pause</button><button id="mark-test" disabled>Mark a moment · N</button><button id="end-test">End & export</button></div></section>
  <p class="test-device" id="test-device" hidden>This playtest needs a keyboard and mouse. <a href="./index.html">Watch the game demo instead.</a></p>
  <section class="workspace"><div class="arena-col">
    <div class="control-strip"><div class="controls-line"><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> move</span><span><kbd>Mouse</kbd> aim · <kbd>Hold click</kbd> fire</span><span><kbd>Space</kbd> dash</span><span><kbd>P</kbd> pause</span></div></div>
    <div class="canvas-wrap"><canvas id="arena" tabindex="0" aria-label="Playtest arena. WASD or arrows move, mouse aims, hold click fires, space dashes."></canvas><div class="arena-hud"><span id="hp">100 HP</span><span id="round-clock">Ready</span></div><div class="overlay visible" id="overlay"><h2 id="overlay-title">Get your bearings</h2><p id="overlay-copy">Move with WASD or the arrow keys. Aim with the mouse, hold click to fire, and press Space to dash.</p><button id="advance-test">Start warm-up</button></div></div>
    <div class="canvas-foot"><div class="legend"><span><i></i>You</span><span><i class="enemy"></i>Enemies</span><span><i class="wall"></i>Cover</span></div><span id="round-result">Two warm-up rounds</span></div>
  </div><aside class="sidebar test-notebook"><h2>Field notes</h2><p>Try to survive. Between rounds, you can take a break.</p><p id="set-note">Enemy settings stay unnamed until you have described both sets. Your movement keys always mean the same direction on screen.</p><div class="test-score"><span>Rounds recorded</span><strong id="record-count">0 / 26</strong></div><p class="hand-note">A moment worth remembering? Press N.</p><div id="markers" aria-live="polite"></div></aside></section>
  <form id="questionnaire" class="test-questionnaire" hidden><h2 id="survey-title">Your observations</h2><p>Answer before seeing the enemy settings. “Nothing” and “not sure” are useful answers.</p><label>What changed, if anything? What did you see that supports that?<textarea id="noticed-answer" required rows="3" maxlength="4000"></textarea></label><label>What happened when you changed your movement? Did it help?<textarea id="counterplay-answer" required rows="3" maxlength="4000"></textarea></label><div class="test-ratings">${['Enjoyment','Fairness','Frustration'].map(name=>`<label>${name}<select id="rating-${name.toLowerCase()}" required><option value="">Choose 1–7</option>${Array.from({length:7},(_,i)=>`<option value="${i+1}">${i+1}${i===0?' · very low':i===6?' · very high':''}</option>`).join('')}</select></label>`).join('')}<label>Did enemy behavior change?<select id="change-answer" required><option value="">Choose</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Not sure</option></select></label></div><button type="submit">Save observations</button><span id="survey-error" role="alert"></span></form>
  <section id="test-reveal" class="test-reveal" hidden><h2>Open the notebook</h2><div id="condition-reveal"></div><p>Learning changes the odds of authored tactics after observed outcomes. It never changes enemy health, damage, or your controls. More damage is not proof of a better game.</p><label>Which set would you rather play again?<select id="preference"><option value="unsure">Not sure</option><option value="set-a">Set A</option><option value="set-b">Set B</option><option value="neither">Neither</option></select></label><button id="download-test">Download session JSON</button><a href="./index.html">Play with the learning inspector</a></section>
  <footer class="test-footer"><p id="save-status" role="status">No uploads. This browser keeps a recovery copy; you choose whether to share an exported file. Avoid names or personal details in your notes.</p><div><button id="recovery-download" hidden>Download previous session</button><button id="clear-recovery" hidden>Delete saved copy</button></div><small>Protocol ${PLAYTEST_PROTOCOL.id} · ${qa?'AUTOMATED QA · EXCLUDED FROM HUMAN RESULTS':'Anonymous local session'} · Build ${BUILD_ID.slice(0,12)}</small></footer>
</main>`;

const canvas=$<HTMLCanvasElement>('arena'),ctx=canvas.getContext('2d')!;
const storageKey='tactical-air.playtest.latest.v1';
let previous:string|null=null;let recoveryEnabled=true;
try{previous=localStorage.getItem(storageKey);}catch{/* Browser storage can be unavailable. */}
$('recovery-download').hidden=!previous;$('clear-recovery').hidden=!previous;
let arena:Arena,engine:BrowserPolicy,paused=false,switching=false,last=0,accumulator=0,lastSave=0;
let pointer={x:WIDTH/2,y:HEIGHT/2},firing=false;
const keys=new Set<string>();
let telemetry=emptyTelemetry();
const checkpoints:object[]=[];
function emptyTelemetry(){return {frames:0,moving:0,firing:0,dash:0,directions:[0,0,0,0]};}
function payload(){return {...session.export(),checkpoints:structuredClone(checkpoints),environment:{userAgent:navigator.userAgent,viewport:[innerWidth,innerHeight],devicePixelRatio},privacy:'Local draft and explicit JSON download only; no automatic study upload.'};}
function save(){
  if(!recoveryEnabled)return;
  try{localStorage.setItem(storageKey,JSON.stringify(payload()));$('clear-recovery').hidden=false;}
  catch{$('save-status').textContent='Recovery storage is unavailable. Download your session before leaving this page.';}
}
function download(data:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportSession(){download(payload(),`tactical-air-${PLAYTEST_PROTOCOL.id}-${session.options.id}.json`);}
function clearInput(){keys.clear();firing=false;}
function active(){return arena?.active&&session.running&&!paused&&!switching;}
function setPause(value:boolean,reason='Participant pause'){if(!session.running)return;clearInput();paused=value;accumulator=0;session.event(value?'pause':'resume',reason);save();refresh();if(!value)canvas.focus();}
async function freshPolicy(fixed:boolean,seed=session.options.seed){
  const next=await createPolicy({persist:false,seed});
  arena?.discardEncounter();engine?.dispose();engine=next;
  arena=new Arena(fixed?fixedStudyPolicy(engine):engine);arena.auto=false;arena.learning=!fixed;arena.communication='direct';
  arena.onFinish=outcome=>{
    clearInput();paused=false;accumulator=0;session.record(outcome,telemetry);
    if(session.stage==='survey')checkpoints.push({block:session.block,condition:session.condition,inspection:arena.inspect(),snapshot:engine.request({op:'snapshot'})});
    save();refresh();
    if(session.stage==='survey'){$('questionnaire').scrollIntoView({block:'start'});$('noticed-answer').focus();}
    else $('advance-test').focus();
  };
}
async function advance(){
  if(switching||session.running||['survey','complete','ended'].includes(session.stage))return;
  switching=true;clearInput();recoveryEnabled=true;
  try{
    if(session.stage==='intro')await freshPolicy(true,12345);
    else if(session.stage==='condition-intro')await freshPolicy(session.condition==='selected-fixed');
    if(session.startRound()){telemetry=emptyTelemetry();arena.startEncounter();paused=false;accumulator=0;save();}
  }catch(error){session.event('error',String(error));$('save-status').textContent=`Could not start the round: ${String(error)}`;}
  finally{switching=false;refresh();if(session.running)canvas.focus();}
}
function refresh(){
  const stage=session.stage,set=`Set ${session.block===0?'A':'B'}`;
  const text:Record<string,string[]>={
    intro:['Before you play','Two sets. Your verdict.','Warm up, play two sets of 12 short rounds, then describe each one. Allow about 10–15 minutes.'],
    warmup:[`Warm-up ${session.warmups+1} / 2`,'Get your bearings','Move, aim, fire, and try a dash. These rounds do not count toward either set.'],
    'condition-intro':[set,'Find a repeatable route','Choose a movement pattern you can repeat for six rounds. Try to survive while keeping that route reasonably consistent.'],
    repeat:[`${set} · ${session.round+1} / 12`,'Keep your route','Repeat your chosen movement. Shoot and dodge as needed.'],
    'change-prompt':[`${set} · Movement change`,'Try a different route','For the next six rounds, deliberately change your movement: change direction, vary your timing, or use different cover. The keys stay the same.'],
    change:[`${set} · ${session.round+1} / 12`,'Use your new approach','Keep trying the changed route. Notice what happens.'],
    survey:[`${set} complete`,'What did you see?','Answer the questions below before the enemy settings are revealed.'],
    complete:['Playtest complete','Open the notebook','Both sets are recorded. See the conditions below and download your session.'],
    ended:['Session ended','Partial results retained','Incomplete sessions are useful too. Your export identifies exactly where you stopped.'],
  };
  const row=text[stage];$('progress').textContent=row[0];$('stage-title').textContent=row[1];$('instructions').textContent=row[2];
  $('record-count').textContent=`${session.records.length} / 26`;
  $('hp').textContent=`${arena?.player.hp??100} HP`;
  $('round-clock').textContent=arena?.active?`${Math.ceil(Math.max(0,DURATION-arena.time))}s`:'Ready';
  $('pause-test').textContent=paused?'Resume':'Pause';$<HTMLButtonElement>('pause-test').disabled=!session.running;
  $<HTMLButtonElement>('mark-test').disabled=!session.running;
  $('overlay').classList.toggle('visible',!session.running||paused);
  $('overlay-title').textContent=paused?'Paused':row[1];
  $('overlay-copy').textContent=paused?'Your place is saved. Resume when you are ready.':stage==='intro'?'Two warm-up rounds to practice moving, firing, and dashing. These do not count toward either set.':row[2];
  $('advance-test').textContent=paused?'Resume':stage==='intro'?'Start warm-up':stage==='warmup'?'Next warm-up':stage==='condition-intro'?`Start ${set.toLowerCase()}`:stage==='change-prompt'?'Start changed route':'Next round';
  $('advance-test').hidden=['survey','complete','ended'].includes(stage);
  $<HTMLButtonElement>('advance-test').disabled=switching||(!qa&&matchMedia('(pointer:coarse)').matches);
  $('test-device').hidden=!matchMedia('(pointer:coarse)').matches;
  $('questionnaire').hidden=stage!=='survey';$('survey-title').textContent=`${set}: your observations`;
  $('test-reveal').hidden=!session.complete;
  if(session.complete){
    $('condition-reveal').replaceChildren(...session.order.map((condition,i)=>{
      const p=document.createElement('p');const records=session.records.filter(r=>r.kind==='condition'&&r.block===i);
      const meanDamage=records.reduce((n,r)=>n+r.outcome.damage,0)/records.length;
      p.textContent=`Set ${i===0?'A':'B'}: ${condition==='adaptive'?'learning enabled':'fixed tactics (rush, flank right, lead aim)'}. Average damage received: ${meanDamage.toFixed(1)} HP over ${records.length} rounds.`;return p;
    }));
    $('set-note').textContent='Each set started from independent memory. The fixed enemy used the same authored tactics every round. The learning enemy updated its tactic odds from observed results.';
  }
  if(arena?.outcome)$('round-result').textContent=`Last round: ${arena.outcome.health} HP · ${arena.outcome.duration.toFixed(1)}s`;
}
function input():Input{return {x:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),y:Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp')),aim:pointer,fire:firing,dash:keys.has('Space')};}
function frame(now:number){
  const dt=Math.min((now-(last||now))/1000,.1);last=now;
  if(active()){
    accumulator+=dt;
    while(accumulator>=1/60&&active()){
      const command=input();telemetry.frames++;telemetry.moving+=+(!!command.x||!!command.y);telemetry.firing+=+command.fire;telemetry.dash+=+command.dash;
      telemetry.directions[0]+=+(command.x<0);telemetry.directions[1]+=+(command.x>0);telemetry.directions[2]+=+(command.y<0);telemetry.directions[3]+=+(command.y>0);
      arena.update(1/60,command);accumulator-=1/60;
    }
  }
  if(now-lastSave>5000&&session.records.length+Number(session.running)>0){save();lastSave=now;}
  if(arena){$('hp').textContent=`${Math.max(0,arena.player.hp)} HP`;$('round-clock').textContent=arena.active?`${Math.ceil(Math.max(0,DURATION-arena.time))}s`:'Round complete';}
  drawBattlefield(ctx,canvas,arena,pointer);requestAnimationFrame(frame);
}
new ResizeObserver(()=>{canvas.width=Math.round(canvas.clientWidth*devicePixelRatio);canvas.height=Math.round(canvas.width*HEIGHT/WIDTH);}).observe(canvas);
canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();pointer={x:(e.clientX-r.left)/r.width*WIDTH,y:(e.clientY-r.top)/r.height*HEIGHT};});
canvas.addEventListener('pointerdown',e=>{if(e.button===0&&active()){firing=true;canvas.focus();canvas.setPointerCapture(e.pointerId);}});
for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>{firing=false;});
const movements=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
window.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.altKey||e.metaKey){clearInput();return;}
  if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,button,a,summary,[contenteditable]'))return;
  if(e.code==='KeyP'&&!e.repeat)setPause(!paused);
  if(e.code==='KeyN'&&!e.repeat&&session.running)mark();
  if(movements.has(e.code)&&active()){e.preventDefault();if(!e.repeat||keys.has(e.code))keys.add(e.code);}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>{clearInput();if(session.running)setPause(true,'Window lost focus');});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(session.running)setPause(true,'Page hidden');save();}});
document.addEventListener('focusin',e=>{if(e.target!==canvas)clearInput();});
window.addEventListener('pagehide',()=>{if(session.running)session.event('interruption','Page left during round');if(session.stage!=='intro')save();});
function mark(){session.event('participant-marker',`Arena time ${arena.time.toFixed(2)}s`);$('markers').textContent=`Moment marked in ${session.block===0?'A':'B'}, round ${session.round+1}.`;save();canvas.focus();}
$('mark-test').onclick=mark;$('pause-test').onclick=()=>setPause(!paused);
$('advance-test').onclick=()=>{if(paused)setPause(false);else void advance();};
$('end-test').onclick=()=>{arena?.discardEncounter();session.end();clearInput();save();refresh();exportSession();};
$('download-test').onclick=exportSession;
$('preference').onchange=()=>{session.preference=$<HTMLSelectElement>('preference').value as typeof session.preference;save();};
$('recovery-download').onclick=()=>{if(previous)download(JSON.parse(previous),'tactical-air-recovered-session.json');};
$('clear-recovery').onclick=()=>{try{localStorage.removeItem(storageKey);recoveryEnabled=false;previous=null;$('recovery-download').hidden=true;$('clear-recovery').hidden=true;$('save-status').textContent='Saved copy deleted. The active session remains in this tab; continuing play creates a new recovery copy.';}catch{$('save-status').textContent='Browser storage could not be accessed.';}};
$<HTMLFormElement>('questionnaire').onsubmit=e=>{
  e.preventDefault();
  const answers:Answers={noticed:$<HTMLTextAreaElement>('noticed-answer').value,counterplay:$<HTMLTextAreaElement>('counterplay-answer').value,enjoyment:Number($<HTMLSelectElement>('rating-enjoyment').value),fairness:Number($<HTMLSelectElement>('rating-fairness').value),frustration:Number($<HTMLSelectElement>('rating-frustration').value),change:$<HTMLSelectElement>('change-answer').value as Answers['change']};
  try{session.submit(answers);$<HTMLFormElement>('questionnaire').reset();$('survey-error').textContent='';save();refresh();(session.complete?$('test-reveal'):$('stage-title')).scrollIntoView({block:'start'});if(!session.complete)$('advance-test').focus();}
  catch(error){$('survey-error').textContent=String(error);}
};
if(qa)Object.assign(window,{__playtestQA:{state:()=>payload(),advance,async round(style:'orbit'|'reverse'|'feint'='orbit'){if(!session.running)await advance();if(!session.running)throw Error('No round to run');const result=arena.runEncounter(style);refresh();return result;},arena:()=>arena.state(),pause:setPause}});
refresh();requestAnimationFrame(frame);
