import './style.css';
import { Study, type StudyMode } from './study';
import { Mission } from './mission';
import { drawBattlefield } from './renderer';
import { Arena, WIDTH, HEIGHT, DURATION, LABELS, type Style, type Input, type PolicyInspection, type Role } from './sim';
import { createPolicy, resetPolicy, type BrowserPolicy } from './policy';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
<main class="shell">
  <header class="top"><h1 class="brand">TACTICAL<span>AIR</span></h1><nav class="mode-switch" aria-label="Game mode"><button id="start-mission" aria-pressed="true">Missions</button><button id="leave-mission" aria-pressed="false">Experiments</button></nav><div class="status"><i class="dot"></i><span id="engine-status">LOADING</span></div></header>
  <section id="mission-bar" class="mission-bar" aria-label="Mission progress" hidden><strong id="mission-number">Mission 01</strong><div class="wave-track"><span id="wave-one">1 · Contact</span><span id="wave-two">2 · Reinforcements</span></div></section>
  <div id="practice-bar" class="practice-bar" hidden><strong>Free practice</strong><button id="experiments-toggle" aria-expanded="false" aria-controls="experiments-panel">Choose an experiment <i class="disclosure-mark" aria-hidden="true"></i></button></div>
  <section id="experiments-panel" class="experiments-panel" aria-label="Experiments" hidden>
    <div class="experiment-launchers"><a class="playtest-link" href="./study.html"><strong>Field playtest</strong><span>Warm up, compare two enemy squads, then give your verdict.</span></a><button id="start-lesson"><strong>Change your movement</strong><span>Repeat your movement for 4 rounds, then change it for 3.</span></button><button id="start-blind"><strong>Compare enemy learning</strong><span>Two 3-round sets. Find out afterward which enemies could learn.</span></button><button id="start-practice"><strong>Practice freely</strong><span>Choose settings below and play as many rounds as you like.</span></button><p id="experiment-session-note" hidden>Finish or leave this session to change experiments.</p></div>
    <div class="experiment-options"><label class="switch-label"><input id="baseline" type="checkbox"/>Random tactics (no learning)</label><p id="baseline-note">Equal tactic odds; memory held fixed.</p><label class="switch-label"><input id="courier" type="checkbox"/>Require scout reports</label><p id="courier-note">Intercept the scout to stop new learning.</p></div>
    <div class="experiment-memory"><span>Practice memory</span><button id="reset" class="small-button">Reset memory</button><p>Tests start fresh. Your practice results stay saved.</p></div>
  </section>
  <section id="study-bar" class="study-bar" aria-label="Active experiment" hidden>
    <div class="study-progress"><span class="tag" id="study-stage"></span><strong id="study-title"></strong><span id="study-copy"></span></div>
    <div class="study-actions"><button id="noticed" title="Mark when you notice adaptation">Noticed <kbd>N</kbd></button><button id="countered" title="Mark a counterplay attempt">Countered <kbd>C</kbd></button><button id="free-play">Exit experiment</button></div>
  </section>
  <section class="workspace" aria-label="Interactive tactical arena">
    <div class="arena-col">
      <div class="toolbar"><div class="segmented" aria-label="Control mode"><button id="manual-mode" aria-pressed="false" title="Requires keyboard and mouse" aria-describedby="device-hint">Play yourself</button><button id="auto-mode" class="active" aria-pressed="true">Watch demo</button></div><label class="demo-controls">Demo movement<select id="demo-movement"><option value="orbit">Circle clockwise</option><option value="reverse">Circle counterclockwise</option><option value="cover">Use cover + dodge</option></select></label><div class="actions"><button id="speed" title="Demo playback speed">1×</button><button id="pause">Pause</button><button id="next">New round</button></div></div>
      <div class="control-strip"><p class="device-hint" id="device-hint">Keyboard + mouse to play. On touch, watch the demo.</p><div class="controls-line"><span><kbd>WASD</kbd><span class="arrow-keys"> / <kbd>↑↓←→</kbd></span> move</span><span><kbd>Mouse</kbd> aim · <kbd>Hold click</kbd> fire</span><span><kbd>Space</kbd> dash</span><span><kbd>P</kbd> pause</span></div><span id="habit-note">DEMO ACTIVE</span></div>
      <div class="canvas-wrap"><canvas id="arena" tabindex="0" aria-label="Combat arena. WASD or arrows to move, mouse to aim, hold click to fire, space to dash."></canvas><div class="arena-hud"><div class="hud-health"><span id="hp">100 HP</span><div class="health-track"><i id="hp-bar" style="width:100%"></i></div></div><div><span id="round">ROUND 01</span> &nbsp; / &nbsp; <span id="time">00:26</span></div></div><div class="overlay" id="overlay"><h2 id="overlay-title"></h2><p id="overlay-copy"></p><button id="overlay-action">Next encounter</button></div></div>
      <div class="canvas-foot"><div class="legend"><span><i></i>You</span><span><i class="enemy"></i>Enemies</span><span><i class="wall"></i>Cover</span></div><span id="combat-state">Dash ready</span></div>
    </div>
    <aside class="sidebar" aria-label="Learning inspector">
      <div class="inspector-head"><h2>Intelligence notes</h2><span class="tag" id="learning-tag">Learning on</span></div>
      <div class="inspector-tabs" role="tablist" aria-label="Learning data"><button id="memory-tab" role="tab" aria-selected="true" aria-controls="memory-panel">Memory</button><button id="recap-tab" role="tab" aria-selected="false" aria-controls="recap-panel" tabindex="-1">Last round <span id="recap-dot" hidden role="img" aria-label="New report"></span></button></div>
      <section id="memory-panel" class="panel policy-panel" role="tabpanel" aria-labelledby="memory-tab" tabindex="0"><div class="panel-caption">Next-round odds <span><i></i> Active tactic</span></div><div id="policy"></div><div class="stats"><div class="stat"><strong id="samples">0</strong><span>observations</span></div><div class="stat"><strong id="completed">0</strong><span>rounds</span></div></div></section>
      <section id="recap-panel" class="panel recap-section" role="tabpanel" aria-labelledby="recap-tab" tabindex="0" hidden><div class="recap-heading"><h2 id="recap-title">Learning changes</h2><span id="report-status" class="tag">NO REPORT</span></div><div id="recap" class="recap-grid"><p class="empty-recap">Complete a round to see what changed.</p></div></section>
      <div class="blind-intel" hidden id="blind-intel"><h2>Results hidden</h2><p>Revealed after both sets.</p></div>
      <section class="history-area"><div class="panel-caption">Survival <span>HP / round</span></div><div class="history" id="history"></div><div class="history-label"><span>← LATEST</span><span id="history-caption">No rounds yet</span></div></section>
    </aside>
  </section>
  <div class="session-footer"><span id="notice" role="status" aria-live="polite"></span><span>TACTICS ADAPT · STATS STAY FIXED</span></div>
  <details id="playtest-notes" class="playtest-notes" hidden><summary>Session notes & export</summary><div class="notes-content"><label for="notes">What did you notice?</label><textarea id="notes" rows="2" placeholder="Patterns, counterplay, fairness…"></textarea><div class="notes-actions"><span>Local to this tab until exported.</span><button id="export-session">Export JSON <svg class="action-icon" aria-hidden="true" viewBox="0 0 14 16"><path d="M7 1v9M3 6l4 4 4-4M1 11v4h12v-4"/></svg></button></div></div></details>
</main>`;

const prefersDemo = () => matchMedia('(pointer: coarse)').matches || matchMedia('(max-width: 520px)').matches;
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('arena');
const ctx = canvas.getContext('2d')!;
let arena: Arena;
let study = new Study();
let mission: Mission | null = null;
let switching = false;
let practiceReady = false;
let inspectorTab: 'memory' | 'recap' = 'memory';
const percent = (n: number) => `${(n*100).toFixed(1)}%`;
let paused = false, speed = 1, last = 0, accumulator = 0, refresh = 0, intermission = 0;
let pointer = { x: WIDTH / 2, y: HEIGHT / 2 }, firing = false;
const keys = new Set<string>();
let inspection: PolicyInspection | undefined;
let noticeTimer: ReturnType<typeof setTimeout>;
function notice(message: string) {
  $('notice').textContent = message; clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { $('notice').textContent = ''; }, 7000);
}
function showExperiments(open: boolean) {
  $('experiments-panel').hidden = !open;
  $('experiments-toggle').setAttribute('aria-expanded', String(open));
}
function showInspector(tab: 'memory' | 'recap') {
  inspectorTab = tab;
  for (const name of ['memory', 'recap'] as const) {
    const selected = name === tab;
    $(`${name}-tab`).setAttribute('aria-selected', String(selected));
    $(`${name}-tab`).tabIndex = selected ? 0 : -1;
    $(`${name}-panel`).hidden = !selected;
  }
  if (tab === 'recap') $('recap-dot').hidden = true;
}
function wireArena(next: Arena) {
  arena = next;
  arena.onFinish = outcome => {
    clearControls();
    intermission = 5;
    study.record(outcome);
    mission?.record(outcome);
    if (study.waiting || mission?.waiting) intermission = Infinity;
    notice(study.mode==='blind' ? 'Encounter recorded.' : outcome.baseline ? 'Baseline round: no learning applied.' : 'Encounter evidence recorded.');
    const warning = (arena.policy as BrowserPolicy).storageWarning;
    if (warning) notice(warning);
    renderRecap();
    $('recap-dot').hidden = inspectorTab === 'recap';
    if (study.complete || mission?.waiting || (study.waiting && study.mode === 'lesson')) showInspector('recap');
    if (study.complete) $<HTMLDetailsElement>('playtest-notes').open = true;
    refreshUI();
  };
}
function newRound(discard = true) {
  clearControls();
  if (discard && arena.active) arena.discardEncounter();
  arena.startEncounter(); intermission = 0; accumulator = 0; refreshUI();
  if (!arena.auto && !paused && !switching) canvas.focus();
}
function setAuto(auto: boolean) {
  clearControls(); arena.auto = auto;
  $('auto-mode').classList.toggle('active', auto); $('manual-mode').classList.toggle('active', !auto);
  $('auto-mode').setAttribute('aria-pressed', String(auto)); $('manual-mode').setAttribute('aria-pressed', String(!auto));
  document.body.dataset.control = auto ? 'demo' : 'play';
  $('habit-note').textContent = auto ? 'DEMO ACTIVE' : 'YOU ARE IN CONTROL';
  $('speed').textContent = auto ? `${speed}×` : '1×';
  $<HTMLButtonElement>('speed').disabled = !auto;
  if (!auto) canvas.focus();
}
function setStyle(style: Style) {
  arena.style = style;
  $<HTMLSelectElement>('demo-movement').value = style;
}
function clearControls() { keys.clear(); firing = false; }
function setPaused(value: boolean) {
  clearControls();
  if (!value && practiceReady) return;
  paused = value; accumulator = 0;
  $('pause').textContent = paused ? 'Resume' : 'Pause'; refreshUI();
  if (!paused && arena?.active && !arena.auto) canvas.focus();
}
function setBaseline(value: boolean) {
  arena.discardEncounter(); arena.baseline = value;
  $<HTMLInputElement>('baseline').checked = value;
  newRound(false);
  notice(value ? 'Learning off. Enemies choose tactics at random.' : 'Learning on. Enemies use your saved practice results.');
}

function refreshUI() {
  if (!arena) return;
  refreshStudy();
  $('mission-bar').hidden = !mission;
  $('start-mission').setAttribute('aria-pressed',String(!!mission));
  $('leave-mission').setAttribute('aria-pressed',String(!mission));
  $<HTMLButtonElement>('start-mission').disabled = switching;
  $<HTMLButtonElement>('leave-mission').disabled = switching;
  $('practice-bar').hidden = !!mission || study.mode !== 'free';
  if (mission) {
    $('mission-number').textContent = `Mission ${String(mission.number).padStart(2,'0')}`;
    $('wave-one').classList.toggle('current',mission.wave===1);
    $('wave-two').classList.toggle('current',mission.wave===2);
  }
  inspection = arena.inspect();
  $('engine-status').textContent = paused ? 'PAUSED' : !arena.active ? 'READY' : arena.auto ? 'DEMO' : 'LIVE';
  $('hp').textContent = `${Math.max(0, arena.player.hp)} HP`;
  $('hp-bar').style.width = `${Math.max(0, arena.player.hp)}%`;
  $('round').textContent = mission ? `WAVE ${mission.wave} / 2` : `ROUND ${String(inspection.encounter + (arena.active ? 1 : 0)).padStart(2, '0')}`;
  $('time').textContent = `00:${String(Math.ceil(Math.max(0, DURATION - arena.time))).padStart(2, '0')}`;
  $('learning-tag').textContent = arena.baseline ? 'Learning off' : !arena.learning ? 'Learning paused' : 'Learning on';
  $('learning-tag').title = arena.baseline ? 'Enemies choose tactics at random and do not learn.' : !arena.learning ? 'Enemies use earlier learning without updating it.' : arena.communication === 'courier' ? 'Enemies learn from scout reports that reach the relay.' : 'Enemies learn from the results of each round.';
  $('baseline-note').textContent = arena.baseline ? 'Equal odds. Results are not learned.' : 'Enemies learn which tactics work.';
  $('samples').textContent = String(inspection.cells.reduce((n, c) => n + c.samples, 0));
  $('completed').textContent = String(arena.completedRounds);
  $('courier-note').textContent = arena.communication === 'courier' ? `Scout ${arena.scout?.status ?? 'awaiting'} · no report, no new learning.` : 'Off · observations shared directly.';
  const scoutState = arena.communication === 'courier' ? `Scout ${arena.scout?.status ?? 'awaiting'} · ` : '';
  $('combat-state').textContent = arena.active && arena.scout && arena.enemies.every(e => e.hp <= 0) ? 'Intercept the scout →' : arena.active ? `${scoutState}Dash ${arena.player.dashCooldown > 0 ? `${arena.player.dashCooldown.toFixed(1)}s` : 'ready'}` : mission?.phase === 'briefing' ? 'Ready to start' : 'Round complete';
  $('policy').innerHTML = (['vanguard', 'flanker', 'ranger'] as Role[]).map(role => {
    const enemy = arena.enemies.find(e => e.role === role);
    return `<div class="role"><div class="role-header"><span><i class="role-icon"></i>${role}</span><span>${enemy && enemy.hp <= 0 ? 'ELIMINATED' : '02 TACTICS'}</span></div>${inspection!.cells.filter(c => c.role === role).map(c => {
      const probability = arena.baseline ? .5 : c.probability;
      return `<div class="policy-row ${enemy?.tactic === c.action ? 'selected' : ''}"><span>${LABELS[c.action] ?? c.action}</span><span class="value">${Math.round(probability * 100)}%</span><div class="policy-bar"><i style="width:${probability * 100}%"></i></div><small>${c.score >= 0 ? '+' : ''}${c.score.toFixed(3)} score · ${c.samples} observed</small></div>`;
    }).join('')}</div>`;
  }).join('');
  $('history').innerHTML = Array.from({ length: 18 }, (_, i) => {
    const h = arena.history[i];
    return `<div class="history-bar ${h?.baseline ? 'baseline' : ''}" title="${h ? `Round ${h.encounter}: ${h.health} HP, ${h.result}${h.baseline && study.mode !== 'blind' ? ', baseline' : ''}` : 'No encounter yet'}"><i style="height:${h ? Math.max(3, h.health) : 0}%"></i></div>`;
  }).join('');
  const latest = arena.history[0];
  $('history-caption').textContent = latest ? `${latest.health} HP · ${latest.damage} damage` : 'No rounds yet';
  const show = paused || !arena.active || !!mission?.waiting;
  $('overlay').classList.toggle('visible', show);
  if (practiceReady) {
    $('overlay-title').textContent = 'Free practice';
    $('overlay-copy').textContent = 'Choose settings, try different moves, and inspect what the enemies learn.';
    $('overlay-action').textContent = 'Start practice';
  } else if (paused) {
    $('overlay-title').textContent = 'Paused';
    $('overlay-copy').textContent = prefersDemo() ? 'Choose Resume to continue.' : 'Press P to resume.'; $('overlay-action').textContent = 'Resume';
  } else if (mission?.waiting) {
    const copy = {
      briefing: ['Ready for mission 1?', 'Survive two waves. A scout can report what it sees to the next squad.', 'Start mission'],
      between: ['Reinforcements incoming', mission.reportSummary, 'Start wave 2'],
      won: ['Mission complete', mission.outcomes.slice(-2).some(o=>o.recap.some(row=>row.accepted)) ? 'The enemy is learning. Try a different approach next mission.' : 'No new information reached the enemy. Ready for the next mission?', `Next mission · ${mission.number+1}`],
      lost: ['Mission failed', 'Try a different approach.', 'Retry mission'],
      active: ['', '', ''],
    }[mission.phase];
    $('overlay-title').textContent = copy[0]; $('overlay-copy').textContent = copy[1]; $('overlay-action').textContent = copy[2];
  } else if (study.waiting) {
    $('overlay-title').textContent = study.complete ? 'Experiment complete' : study.mode === 'blind' ? 'First set complete' : 'Change your movement';
    $('overlay-copy').textContent = study.complete ? 'Results unlocked in intelligence notes.' : study.mode === 'blind' ? 'Play three more rounds, then compare the results.' : arena.auto ? 'The demo will circle in the opposite direction for three rounds. See how the enemies respond.' : 'Change how you move for three rounds: switch direction, dodge, or use cover. Your movement keys stay the same.';
    $('overlay-action').textContent = study.complete ? 'Back to experiments' : study.mode === 'blind' ? 'Start second set' : arena.auto ? 'Watch demo change direction' : 'Try different moves';
  } else if (arena.outcome) {
    $('overlay-title').textContent = arena.outcome.result === 'cleared' ? 'Arena cleared' : arena.outcome.result === 'down' ? 'You’re down' : 'Time’s up';
    $('overlay-copy').textContent = `${arena.outcome.health} HP · ${arena.outcome.duration.toFixed(1)}s${arena.auto ? ' · next round shortly' : ''}`;
    $('overlay-action').textContent = 'Next round';
  }
}

function renderRecap() {
  const outcome = arena.outcome;
  if (!outcome) { $('recap').innerHTML = '<p class="empty-recap">Complete a round to see what changed.</p>'; $('report-status').textContent='NO REPORT'; $('recap-dot').hidden=true; return; }
  $('report-status').textContent = outcome.baseline ? 'MEMORY FIXED' : outcome.communication === 'courier' ? `SCOUT ${outcome.reportStatus.toUpperCase()}` : 'DIRECT';
  $('recap').innerHTML = outcome.recap.map(row => {
    const delta = (row.after-row.before)*100;
    const change = `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp`;
    return `<article class="recap-card"><h3><span class="recap-role">${row.role}</span> · ${LABELS[row.tactic]}</h3><div class="recap-probability">${percent(row.before)} <span>→</span> ${percent(row.after)} <small>${change}</small></div><div class="recap-evidence">${row.observed ? `${row.hits} hits · ${row.damage} damage` : 'No observation'}${row.accepted ? ` · reward ${row.reward.toFixed(2)}` : ''}</div><details class="evidence-detail"><summary>Evidence</summary><p>${row.reason}</p></details></article>`;
  }).join('');
}
function refreshStudy() {
  const blind = study.mode === 'blind' && !study.complete;
  document.body.dataset.study = blind ? 'blind' : study.mode === 'blind' ? 'results' : study.mode;
  $('study-bar').hidden = study.mode === 'free';
  $('free-play').hidden = study.mode === 'free';
  $('start-lesson').hidden = study.mode !== 'free' || !!mission;
  $('start-blind').hidden = study.mode !== 'free' || !!mission;
  $('start-practice').hidden = study.mode !== 'free' || !!mission;
  $('playtest-notes').hidden = study.mode === 'free';
  $('experiment-session-note').hidden = study.mode === 'free' && !mission;
  $('experiment-session-note').textContent = mission ? 'Choose Experiments to compare enemy behavior.' : 'Exit this session to change experiments.';
  $('blind-intel').hidden = !blind;
  for (const id of ['reset','baseline','courier','next']) ($<HTMLButtonElement>(id)).disabled = study.mode !== 'free' || !!mission || switching;
  $<HTMLButtonElement>('export-session').disabled = study.mode === 'blind' && !study.complete;
  $<HTMLButtonElement>('auto-mode').disabled = study.mode === 'blind' && !study.complete;
  $<HTMLButtonElement>('pause').disabled = practiceReady || !arena.active || switching;
  $<HTMLButtonElement>('next').disabled ||= practiceReady;
  if (study.mode === 'free') {
    $('study-stage').textContent = ''; $('study-title').textContent = ''; $('study-copy').textContent = '';
  } else if (study.mode === 'blind') {
    $('study-stage').textContent = `Comparison · ${study.outcomes.length}/6`;
    $('study-title').textContent = study.complete ? 'Complete' : study.block===0?'First set':'Second set';
    $('study-copy').textContent = study.complete ? `First: learning ${study.adaptiveFirst?'on':'off'} · second: learning ${study.adaptiveFirst?'off':'on'}` : 'Conditions hidden';
  } else {
    const texts = {
      teach: ['Repeat your movement', 'Use a similar route for 4 rounds'],
      reflect: ['See what the enemies learned', 'Next, change how you move'],
      counter: ['Change your movement', arena.auto ? 'Demo now circles the other way' : 'Try a different route, direction, or cover'],
      complete: ['Complete', 'Compare your results'],
    }[study.phase];
    $('study-stage').textContent = `Movement test · ${study.outcomes.length}/7`;
    $('study-title').textContent = texts[0]; $('study-copy').textContent = texts[1];
  }
}
async function replacePolicy(persist: boolean, seed = 42) {
  const next = await createPolicy({persist,seed});
  const old = arena?.policy as BrowserPolicy | undefined;
  wireArena(new Arena(next)); old?.dispose();
  renderRecap();
}
async function startStudy(mode: StudyMode) {
  if (switching) return;
  const wasAuto=arena?.auto ?? prefersDemo();
  switching=true; paused=true;clearControls();practiceReady=false;
  try {
    arena?.discardEncounter();
    mission = null;
    const draws = new Uint32Array(2); crypto.getRandomValues(draws);
    study = new Study(mode, mode === 'blind' ? draws[0] : 42, draws[1]%2===0);
    await replacePolicy(mode==='free',study.seed);
    showExperiments(false); showInspector('memory');
    $<HTMLDetailsElement>('playtest-notes').open = false;
    arena.baseline=study.baseline; arena.auto=mode==='blind'?false:wasAuto; arena.communication='direct';
    $<HTMLInputElement>('baseline').checked=arena.baseline; $<HTMLInputElement>('courier').checked=false;
    $<HTMLTextAreaElement>('notes').value='';
    speed=1; setAuto(arena.auto);setStyle('orbit');newRound(false);practiceReady=mode==='free';setPaused(practiceReady);
    showExperiments(practiceReady);notice(mode==='free'?'Your practice results are restored.':'New test. Your practice results stay saved.');
  } catch(error) { notice(`Session could not start: ${String(error)}`); }
  finally {switching=false; refreshUI();}
}
async function startMission() {
  if (switching) return;
  const wasAuto=arena?.auto ?? prefersDemo();
  switching=true; paused=true;clearControls();practiceReady=false;
  try {
    arena?.discardEncounter();
    await replacePolicy(false,42);
    mission=new Mission(); study=new Study(); arena.communication='courier';
    speed=1; setAuto(wasAuto);setStyle('orbit');showExperiments(false);showInspector('memory');
    $<HTMLInputElement>('baseline').checked=false;$<HTMLInputElement>('courier').checked=true;
    paused=false;$('pause').textContent='Pause';
    notice('Mission progress lasts until you switch to Experiments or reload.');
  } catch(error) {notice(`Mission could not start: ${String(error)}`);}
  finally {switching=false;refreshUI();}
}
function advanceMission() {
  if (!mission?.advance()) return;
  clearControls();paused=false;$('pause').textContent='Pause';
  newRound(false); if(!arena.auto)canvas.focus();
}
async function continueStudy() {
  if (switching) return;
  if (study.complete) { await startStudy('free');return; }
  if (!study.continue()) return;
  switching=true;paused=true;
  try {
    if (study.mode==='blind') { await replacePolicy(false,study.seed);arena.baseline=study.baseline;setAuto(false); }
    else if(arena.auto) setStyle('reverse');
    newRound(false);paused=false;$('pause').textContent='Pause';
    if (!arena.auto) canvas.focus();
  } catch(error) { notice(String(error)); }
  finally {switching=false;refreshUI();}
}

function render() {
  drawBattlefield(ctx, canvas, arena, pointer);
}

function manualInput(): Input {
  return { x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')), y: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')), aim: pointer, fire: firing, dash: keys.has('Space') };
}
const movementCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
function movementCode(event: KeyboardEvent) {
  if (event.code) return event.code;
  const fallback: Record<string, string> = { w:'KeyW', a:'KeyA', s:'KeyS', d:'KeyD', ' ':'Space' };
  return fallback[event.key.toLowerCase()] ?? event.key;
}
function manualControlsActive() { return arena?.active && !arena.auto && !paused && !practiceReady && !switching; }
function frame(now: number) {
  const dt = Math.min((now - (last || now)) / 1000, .1); last = now;
  if (arena && !paused && !practiceReady && !switching) {
    if (arena.active) {
      accumulator += dt * (arena.auto ? speed : 1);
      while (accumulator >= 1 / 60) { arena.update(1 / 60, manualInput()); accumulator -= 1 / 60; }
    } else if (arena.auto && !study.waiting && !mission?.waiting && !switching) { intermission -= dt; if (intermission <= 0) newRound(false); }
  }
  refresh += dt; if (refresh > .12) { refreshUI(); refresh = 0; }
  render(); requestAnimationFrame(frame);
}
new ResizeObserver(() => {
  const ratio = window.devicePixelRatio || 1; canvas.width = Math.round(canvas.clientWidth * ratio); canvas.height = Math.round(canvas.width * HEIGHT / WIDTH); render();
}).observe(canvas);
canvas.addEventListener('pointermove', event => { const r = canvas.getBoundingClientRect(); pointer = { x: (event.clientX - r.left) / r.width * WIDTH, y: (event.clientY - r.top) / r.height * HEIGHT }; });
canvas.addEventListener('pointerdown', event => { if (event.button === 0 && manualControlsActive()) { canvas.focus(); firing = true; canvas.setPointerCapture(event.pointerId); } });
canvas.addEventListener('pointerup', () => { firing = false; });
canvas.addEventListener('pointercancel', () => { firing = false; });
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('experiments-panel').hidden) {
    showExperiments(false); $('experiments-toggle').focus(); return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) { clearControls(); return; }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.target instanceof HTMLElement && event.target.isContentEditable) return;
  const key = event.key.toLowerCase();
  if (event.target instanceof HTMLElement && event.target.closest('button, summary') && [' ', 'enter'].includes(key)) return;
  if (key === 'p' && !event.repeat && arena?.active && !practiceReady && !switching) setPaused(!paused);
  if (study.mode !== 'free' && !event.repeat && (key === 'n' || key === 'c')) { study.event(key === 'n' ? 'noticed' : 'counterplay', 'Keyboard marker'); notice('Playtest timestamp recorded.'); }
  const code = movementCode(event);
  if (!movementCodes.has(code) || !manualControlsActive()) return;
  if (event.target instanceof HTMLElement && event.target.closest('button, summary')) return;
  event.preventDefault();
  // A key held across a pause, lost focus, or a new round must be released
  // and pressed again. Browser auto-repeat must not re-latch cleared input.
  if (!event.repeat || keys.has(code)) keys.add(code);
});
window.addEventListener('keyup', event => { keys.delete(movementCode(event)); });
function releaseOnFocusLoss() { clearControls(); if (arena?.active && !arena.auto && !practiceReady) setPaused(true); }
window.addEventListener('blur', releaseOnFocusLoss);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseOnFocusLoss(); });
document.addEventListener('focusin', event => { if (event.target !== canvas) clearControls(); });
$('experiments-toggle').addEventListener('click', () => showExperiments($('experiments-panel').hidden));
for (const name of ['memory', 'recap'] as const) {
  $(`${name}-tab`).addEventListener('click', () => showInspector(name));
  $(`${name}-tab`).addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const tab = event.key === 'Home' ? 'memory' : event.key === 'End' ? 'recap' : name === 'memory' ? 'recap' : 'memory';
    showInspector(tab); $(`${tab}-tab`).focus();
  });
}
$('auto-mode').addEventListener('click', () => {if(study.mode!=='blind'||study.complete)setAuto(true);});
$('manual-mode').addEventListener('click', () => setAuto(false));
$('pause').addEventListener('click', () => setPaused(!paused));
$('speed').addEventListener('click', () => { if (arena.auto) { speed = speed === 1 ? 3 : 1; $('speed').textContent = `${speed}×`; } });
$('next').addEventListener('click', () => { if (study.mode !== 'free') return; if (arena.active) notice('Unfinished round discarded without reward.'); newRound(); });
function startPractice() { practiceReady=false;showExperiments(false);setPaused(false);if(!arena.auto)canvas.focus(); }
$('start-practice').addEventListener('click',startPractice);
$('overlay-action').addEventListener('click', () => { if(practiceReady)startPractice(); else if (paused) setPaused(false); else if (mission?.waiting) advanceMission(); else if (study.waiting) void continueStudy(); else newRound(false); });
$<HTMLInputElement>('baseline').addEventListener('change', event => setBaseline((event.target as HTMLInputElement).checked));
$<HTMLSelectElement>('demo-movement').addEventListener('change', event => setStyle((event.target as HTMLSelectElement).value as Style));
$('start-mission').addEventListener('click', () => {if(!mission)void startMission();});
$('leave-mission').addEventListener('click', () => {if(mission)void startStudy('free');else if(study.mode==='free')showExperiments(true);});
$('reset').addEventListener('click', async () => {
  if (study.mode !== 'free') return;
  const button = $<HTMLButtonElement>('reset'); button.disabled = true;
  try { const auto = arena.auto, style = arena.style, baseline = arena.baseline, old = arena.policy as BrowserPolicy; const next = await resetPolicy(); wireArena(new Arena(next)); old.dispose(); arena.auto = auto; arena.style = style; arena.baseline = baseline; newRound(false); notice(next.storageWarning ?? 'Memory reset. Every tactic starts equally likely.'); }
  catch (error) { notice(`Could not reset memory: ${String(error)}`); }
  finally { button.disabled = false; }
});

$('start-lesson').addEventListener('click',()=>void startStudy('lesson'));
$('start-blind').addEventListener('click',()=>void startStudy('blind'));
$('free-play').addEventListener('click',()=>void startStudy('free'));
$<HTMLInputElement>('courier').addEventListener('change',event=>{
  arena.discardEncounter();arena.communication=(event.target as HTMLInputElement).checked?'courier':'direct';newRound(false);
  notice(arena.communication==='courier'?'The violet scout runs to the relay after eight seconds. Intercept it to stop the report.':'Direct observation sharing restored.');
});
$('noticed').addEventListener('click',()=>{study.event('noticed','Player marked perceived adaptation');notice('Observation timestamp recorded.');});
$('countered').addEventListener('click',()=>{study.event('counterplay','Player marked a counterplay attempt');notice('Counterplay timestamp recorded.');});
$('export-session').addEventListener('click',()=>{
  if(study.mode==='blind'&&!study.complete)return;
  const payload=study.export($<HTMLTextAreaElement>('notes').value);
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`tactical-air-${study.mode}-${Date.now()}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

async function boot() {
  try {
    const policy = await createPolicy({persist:false}); wireArena(new Arena(policy)); mission=new Mission(); arena.communication='courier'; setAuto(prefersDemo()); $<HTMLInputElement>('courier').checked=true; refreshUI(); if (policy.storageWarning) notice(policy.storageWarning);
    Object.assign(window, { __tacticalAir: {
      state: () => arena.state(),
      inspect: () => arena.inspect(),
      step: (n = 1) => { for (let i = 0; i < Math.min(10000, n); i++) arena.update(1 / 60, manualInput()); refreshUI(); return arena.state(); },
      runEncounter: (style: Style = 'orbit') => { const result = arena.runEncounter(style); refreshUI(); return result; },
      setPaused, setAuto, setStyle, setBaseline, startStudy, continueStudy, startMission, advanceMission, mission: () => mission && ({number:mission.number,wave:mission.wave,phase:mission.phase,outcomes:mission.outcomes}), study: () => study.export(''),
      setCourier: (value: boolean) => { arena.discardEncounter();arena.communication=value?'courier':'direct';$<HTMLInputElement>('courier').checked=value;newRound(false); },
      newEncounter: () => { newRound(); return arena.state(); },
      async isolatedRun(styles: Style[], baseline = false) {
        const policy = await createPolicy({ persist: false, seed: 42 });
        try { const experiment = new Arena(policy); experiment.baseline = baseline;
          const outcomes = styles.map(style => experiment.runEncounter(style)); return { outcomes, policy: experiment.inspect() };
        } finally { policy.dispose(); }
      },
    } });
    requestAnimationFrame(frame);
  } catch (error) {
    app.innerHTML = '<div class="error"><h1>The Rust engine could not load.</h1><p>This arena requires the compiled WebAssembly package. Run the workspace build, then refresh.</p><pre id="error-detail"></pre></div>';
    $('error-detail').textContent = String(error);
    console.error(error);
  }
}
void boot();
