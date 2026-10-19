import test from 'node:test';
import assert from 'node:assert/strict';
import { Arena, makePolicy, runSeries } from './arena-harness.mjs';

test('manual movement stays screen-relative through three rounds and demo styles', (t) => {
  const policy = makePolicy(), arena = new Arena(policy);
  t.after(() => policy.dispose());
  arena.auto = false;
  const input = { x: 0, y: 0, aim: { x: 0, y: 0 }, fire: false, dash: false };
  for (const style of ['orbit', 'reverse', 'cover']) {
    arena.style = style;
    arena.startEncounter();
    for (const [x, y] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      const before = { ...arena.player };
      for (let frame = 0; frame < 6; frame++) arena.update(1 / 60, { ...input, x, y });
      assert.ok(Math.abs(arena.player.x - before.x - x * 16.5) < 1e-6, `${style}: horizontal movement`);
      assert.ok(Math.abs(arena.player.y - before.y - y * 16.5) < 1e-6, `${style}: vertical movement`);
    }
    for (let frame = 0; arena.active && frame < 1600; frame++) arena.update(1 / 60, input);
    assert.equal(arena.active, false);
    assert.equal(arena.outcome.control, 'manual');
    assert.equal(arena.outcome.style, null);
  }
  assert.equal(arena.completedRounds, 3);
});

test('real arena outcomes cross Wasm and commit observed feedback', () => {
  const policy = makePolicy(), arena = new Arena(policy);
  const initial = arena.inspect();
  const outcomes = runSeries(arena, 4);
  const after = arena.inspect();
  assert.equal(after.encounter, 4);
  assert.equal(after.pending, 0);
  assert.equal(after.queued, 0);
  assert.ok(outcomes.every(x => x && x.duration > 0 && x.duration < 27));
  assert.equal(after.cells.reduce((s, c) => s + c.samples, 0), outcomes.flatMap(x => x.rewards).filter(x => x.observed).length);
  assert.notDeepEqual(after.cells, initial.cells);
  policy.dispose();
});

test('frozen baseline leaves trained memories unchanged through actual combat', () => {
  const policy = makePolicy(), arena = new Arena(policy);
  runSeries(arena, 6);
  const trained = arena.inspect().cells;
  arena.baseline = true;
  runSeries(arena, 5, 'reverse');
  assert.deepEqual(arena.inspect().cells, trained);
  policy.dispose();
});

test('snapshot replay reproduces a full arena encounter across Wasm instances', () => {
  const a = makePolicy(), arenaA = new Arena(a);
  runSeries(arenaA, 5);
  const snapshot = a.request({ op: 'snapshot' });
  const b = makePolicy();
  b.request({ op: 'restore', snapshot: JSON.parse(JSON.stringify(snapshot)) });
  const arenaB = new Arena(b);
  assert.deepEqual(runSeries(arenaA, 2, 'reverse'), runSeries(arenaB, 2, 'reverse'));
  assert.deepEqual(arenaA.inspect(), arenaB.inspect());
  a.dispose(); b.dispose();
});

test('hidden player movement cannot refresh memory or change an enemy search until sight returns', (t) => {
  const policies = [makePolicy(71), makePolicy(71)];
  t.after(() => policies.forEach(policy => policy.dispose()));
  const arenas = policies.map(policy => new Arena(policy));
  const idle = { x: 0, y: 0, aim: { x: 0, y: 0 }, fire: false, dash: false };
  for (const arena of arenas) {
    arena.startEncounter(); arena.auto = false;
    arena.enemies.slice(1).forEach(enemy => { enemy.hp = 0; });
    Object.assign(arena.enemies[0], { x: 200, y: 188, cooldown: 100, path: [], repath: 0 });
    // First acquire a real sighting to the left of the north-west cover.
    Object.assign(arena.player, { x: 220, y: 250 });
    arena.update(1 / 60, idle);
    assert.ok(arena.enemies[0].lastSeen);
  }
  const remembered = structuredClone(arenas[0].enemies[0].lastSeen);
  const sightings = arenas[0].enemies[0].sightings;
  // Both positions and the complete short movement stay behind the same wall.
  Object.assign(arenas[0].player, { x: 430, y: 188 });
  Object.assign(arenas[1].player, { x: 490, y: 188 });
  for (let frame = 0; frame < 8; frame++) {
    arenas[0].update(1 / 60, { ...idle, x: -.5 });
    arenas[1].update(1 / 60, { ...idle, x: .5 });
    for (const arena of arenas) {
      assert.deepEqual(arena.enemies[0].lastSeen, remembered);
      assert.equal(arena.enemies[0].sightings, sightings);
    }
    const search = arena => {
      const enemy = arena.enemies[0];
      return { x: enemy.x, y: enemy.y, target: enemy.target, path: enemy.path, windup: enemy.windup };
    };
    assert.deepEqual(search(arenas[0]), search(arenas[1]), 'unseen coordinates must not steer the search');
  }
  for (const arena of arenas) {
    Object.assign(arena.player, { x: 220, y: 275 });
    arena.update(1 / 60, idle);
    assert.equal(arena.enemies[0].lastSeen.x, 220);
    assert.equal(arena.enemies[0].lastSeen.y, 275);
    assert.ok(arena.enemies[0].sightings > sightings);
    assert.notDeepEqual(arena.enemies[0].lastSeen, remembered);
  }
});

test('cover blocks firing, cancels a hidden windup, and absorbs an already travelling projectile', (t) => {
  const policy = makePolicy(29), arena = new Arena(policy);
  t.after(() => policy.dispose());
  const idle = { x: 0, y: 0, aim: { x: 0, y: 0 }, fire: false, dash: false };
  const stage = (playerX, playerY) => {
    arena.startEncounter(); arena.auto = false;
    arena.enemies.slice(1).forEach(enemy => { enemy.hp = 0; });
    // Retain a fixed firing position; do not test navigation and cover together.
    Object.assign(arena.enemies[0], { x: 200, y: 188, cooldown: 0, path: [], repath: 100 });
    Object.assign(arena.player, { x: playerX, y: playerY });
  };
  stage(430, 188);
  const initialCells = arena.inspect().cells;
  for (let frame = 0; frame < 60; frame++) arena.update(1 / 60, idle);
  assert.equal(arena.enemies[0].sightings, 0);
  assert.equal(arena.enemies[0].windup, 0);
  assert.equal(arena.bullets.length, 0);
  // A projectile already in flight must still stop at the intervening wall.
  arena.bullets.push({ x: 200, y: 188, vx: 480, vy: 0, life: 1.6, enemy: 0 });
  for (let frame = 0; frame < 60; frame++) arena.update(1 / 60, idle);
  assert.equal(arena.bullets.length, 0);
  assert.equal(arena.player.hp, 100);
  assert.equal(arena.enemies[0].damage, 0);
  arena.finish('survived');
  assert.ok(arena.outcome.rewards.every(reward => !reward.observed));
  assert.deepEqual(arena.inspect().cells, initialCells, 'occluded actors must not generate learning evidence');

  stage(220, 250);
  arena.update(1 / 60, idle);
  assert.ok(arena.enemies[0].windup > 0, 'visible target starts a telegraphed attack');
  Object.assign(arena.player, { x: 430, y: 188 });
  for (let frame = 0; frame < 60; frame++) arena.update(1 / 60, idle);
  assert.ok(arena.enemies[0].windup <= 0);
  assert.equal(arena.bullets.length, 0);
  assert.equal(arena.player.hp, 100);
  assert.equal(arena.enemies[0].damage, 0);
});

test('opposite learned preferences cannot change movement collision, health, speed or damage', (t) => {
  const policies = [makePolicy(42), makePolicy(42)];
  t.after(() => policies.forEach(policy => policy.dispose()));
  const roles = [
    ['vanguard', ['rush', 'hold']],
    ['flanker', ['flank_left', 'flank_right']],
    ['ranger', ['aim', 'lead']],
  ];
  // Build opposing real Wasm memories. This fixture supplies rewards only;
  // neither simulation receives a player-style label or a prescribed decision.
  policies.forEach((policy, side) => {
    for (let encounter = 0; encounter < 30; encounter++) {
      for (const [role, actions] of roles) for (let index = 0; index < actions.length; index++) {
        const choice = policy.request({ op: 'choose', role, context: 'arena', allowed: [actions[index]], baseline: false });
        policy.request({ op: 'feedback', decision_id: choice.decision_id, reward: index === side ? 1 : -1, observed: true });
      }
      policy.request({ op: 'commit' });
    }
  });
  const arenas = policies.map(policy => new Arena(policy));
  arenas.forEach(arena => { arena.startEncounter(); arena.auto = false; });
  assert.notDeepEqual(arenas[0].enemies.map(enemy => enemy.tactic), arenas[1].enemies.map(enemy => enemy.tactic));
  const physicalSpawn = arena => ({ player: arena.player, enemies: arena.enemies.map(enemy => ({
    role: enemy.role, hp: enemy.hp, x: enemy.x, y: enemy.y, cooldown: enemy.cooldown,
  })) });
  assert.deepEqual(physicalSpawn(arenas[0]), physicalSpawn(arenas[1]));
  const idle = { x: 0, y: 0, aim: { x: 0, y: 0 }, fire: false, dash: false };
  for (const arena of arenas) {
    Object.assign(arena.player, { x: 200, y: 188 });
    arena.enemies.forEach((enemy, index) => Object.assign(enemy, {
      x: 100, y: 100 + index * 200, cooldown: 100, windup: 0,
      path: [{ x: 200, y: 100 + index * 200 }], repath: 100,
    }));
  }
  for (let frame = 0; frame < 40; frame++) {
    for (const arena of arenas) arena.update(1 / 60, { ...idle, x: 1, dash: frame === 0 });
  }
  for (const arena of arenas) {
    assert.ok(arena.player.x > 200 && arena.player.x < 250, 'walking and dashing cannot cross the cover face');
    assert.equal(arena.player.y, 188);
    assert.equal(arena.player.hp, 100);
    assert.ok(arena.enemies.every(enemy => enemy.x > 100 && enemy.hp === 72));
  }
  assert.deepEqual(arenas[0].player, arenas[1].player);
  assert.deepEqual(arenas[0].enemies.map(enemy => [enemy.x, enemy.y]), arenas[1].enemies.map(enemy => [enemy.x, enemy.y]), 'same role and path imply the same movement speed');

  for (const arena of arenas) {
    Object.assign(arena.player, { x: 460, y: 300, invulnerable: 0 });
    const target = arena.enemies[0];
    arena.bullets.push({ x: 445, y: 300, vx: 480, vy: 0, life: 1, enemy: 0 });
    arena.bullets.push({ x: target.x - 20, y: target.y, vx: 560, vy: 0, life: 1, enemy: null });
    arena.update(1 / 60, idle);
    assert.equal(arena.player.hp, 88, 'opponent bullets retain authored 12 damage');
    assert.equal(arena.enemies[0].hp, 54, 'player bullets retain authored 18 damage');
    assert.equal(arena.enemies[0].damage, 12, 'reward evidence uses actual fixed damage');
  }
});

test('recap numbers equal actual evidence and committed probabilities', (t) => {
  const policy=makePolicy(),arena=new Arena(policy);t.after(()=>policy.dispose());
  const before=arena.inspect().cells, [outcome]=runSeries(arena,1);
  for(const row of outcome.recap){
    const enemy=arena.enemies.find(e=>e.role===row.role);
    assert.equal(row.damage,enemy.damage); assert.equal(row.hits,enemy.damage/12);
    assert.equal(row.before,before.find(c=>c.role===row.role&&c.action===row.tactic).probability);
    assert.equal(row.after,arena.inspect().cells.find(c=>c.role===row.role&&c.action===row.tactic).probability);
    assert.equal(row.accepted,row.observed);
  }
});

test('learned policy can be evaluated without updating or becoming uniform', (t) => {
  const policy=makePolicy(),arena=new Arena(policy);t.after(()=>policy.dispose());
  runSeries(arena,7);const before=arena.inspect().cells;
  assert.ok(before.some(c=>Math.abs(c.probability-.5)>.05));
  arena.learning=false;runSeries(arena,3,'weave');
  assert.deepEqual(arena.inspect().cells,before);
  assert.ok(arena.outcome.recap.every(r=>!r.accepted));
});

test('intercepting the physical scout prevents a report and only ages existing memory', (t) => {
  const policy=makePolicy(),arena=new Arena(policy);t.after(()=>policy.dispose());
  runSeries(arena,5);const before=arena.inspect().cells;
  arena.communication='courier';arena.startEncounter();arena.auto=false;
  Object.assign(arena.player,{x:675,y:300,invulnerable:100});
  for(let i=0;i<60;i++)arena.update(1/60,{x:0,y:0,aim:{x:725,y:300},fire:true,dash:false});
  assert.equal(arena.scout.status,'intercepted');assert.equal(arena.scout.report,null);
  arena.finish('survived');assert.equal(arena.outcome.reportStatus,'intercepted');
  assert.ok(arena.outcome.recap.every(r=>!r.accepted));
  arena.inspect().cells.forEach((cell,i)=>{
    assert.equal(cell.samples,before[i].samples);
    assert.ok(Math.abs(cell.score-before[i].score*.975)<1e-12);
  });
});

test('a delivered scout packet is frozen at departure and excludes later hits', (t) => {
  const policy=makePolicy(),arena=new Arena(policy);t.after(()=>policy.dispose());
  arena.communication='courier';arena.startEncounter();arena.auto=false;
  Object.assign(arena.player,{x:780,y:300});
  const idle={x:0,y:0,aim:arena.player,fire:false,dash:false};
  const hit=()=>{arena.player.invulnerable=0;arena.bullets.push({x:772,y:300,vx:480,vy:0,life:1,enemy:0});arena.update(1/60,idle);arena.player.invulnerable=100;};
  hit();assert.equal(arena.scout.observations[0].hits,1);
  while(arena.time<8.05)arena.update(1/60,idle);
  const packet=structuredClone(arena.scout.report);assert.ok(packet);
  hit();assert.deepEqual(arena.scout.report,packet);
  while(arena.time<12)arena.update(1/60,idle);
  assert.equal(arena.scout.status,'delivered');
  arena.finish('survived');const recap=arena.outcome.recap[0];
  assert.equal(recap.damage,packet[0].damage);assert.equal(recap.hits,packet[0].hits);
  assert.ok(arena.enemies[0].damage>recap.damage);assert.equal(recap.accepted,true);
});

test('attack target stops following the player once its telegraph locks', (t) => {
  const policy=makePolicy(),arena=new Arena(policy);t.after(()=>policy.dispose());
  arena.startEncounter();arena.auto=false;arena.player.invulnerable=100;
  arena.enemies.slice(0,2).forEach(e=>e.hp=0);
  const ranger=arena.enemies[2];Object.assign(ranger,{x:650,y:300,cooldown:0,repath:100,path:[]});
  const idle={x:0,y:0,aim:arena.player,fire:false,dash:false};
  arena.update(1/60,idle);assert.ok(ranger.windup>.22);
  while(ranger.windup>.22)arena.update(1/60,idle);
  const locked=structuredClone(ranger.target);
  for(let i=0;i<5;i++)arena.update(1/60,{...idle,y:1});
  assert.deepEqual(ranger.target,locked);assert.ok(arena.player.y>300);
});

test('clearing fighters leaves a live scout chase active until the report is resolved', (t)=>{
  const policy=makePolicy(),arena=new Arena(policy);t.after(()=>policy.dispose());
  arena.communication='courier';arena.startEncounter();arena.auto=false;
  arena.enemies.forEach(e=>e.hp=0);
  const idle={x:0,y:0,aim:arena.player,fire:false,dash:false};arena.update(1/60,idle);
  assert.equal(arena.active,true);assert.equal(arena.scout.status,'watching');
  Object.assign(arena.scout,{hp:0,status:'intercepted'});arena.update(1/60,idle);
  assert.equal(arena.outcome.result,'cleared');assert.equal(arena.outcome.control,'manual');
});
