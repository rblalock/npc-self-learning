export interface Policy { request<T = unknown>(request: object): T }
export interface PolicyCell { role: string; context: string; action: string; score: number; samples: number; probability: number }
export interface PolicyInspection { version: number; encounter: number; pending: number; queued: number; cells: PolicyCell[] }
export type Style = 'orbit' | 'reverse' | 'cover' | 'weave' | 'feint';
export type Role = 'vanguard' | 'flanker' | 'ranger';
export type Point = { x: number; y: number };
export type Input = { x: number; y: number; aim: Point; fire: boolean; dash: boolean };
type Decision = { decision_id: number; action: string; probabilities: { action: string; probability: number }[]; baseline: boolean };
export type Enemy = Point & { id: number; role: Role; tactic: string; decision: Decision; hp: number; cooldown: number; windup: number; target: Point; lastSeen: (Point & { vx: number; vy: number }) | null; damage: number; sightings: number; aliveTime: number; path: Point[]; repath: number };
export type Bullet = Point & { vx: number; vy: number; life: number; enemy: number | null };
export type Effect = Point & { life: number; max: number; kind: 'hit' | 'dash' | 'shot' };
export type Evidence = { damage: number; hits: number; observed: boolean; defeated: boolean };
export type Scout = Point & { hp: number; status: 'watching' | 'escaping' | 'delivered' | 'intercepted'; observations: Evidence[]; report: Evidence[] | null; path: Point[]; repath: number };
export type TacticRecap = { role: Role; tactic: string; hits: number; damage: number; observed: boolean; accepted: boolean; reward: number; before: number; after: number; reason: string };
export const LOCK_WINDOW = .22;
export type Outcome = { encounter: number; result: 'cleared' | 'survived' | 'down'; duration: number; health: number; damage: number; baseline: boolean; learning: boolean; control: 'demo' | 'manual'; style: Style | null; communication: 'direct' | 'courier'; reportStatus: string; recap: TacticRecap[]; rewards: { role: string; tactic: string; reward: number; observed: boolean }[] };
export const WIDTH = 920, HEIGHT = 600, DURATION = 26;
export const WALLS = [{ x: 250, y: 156, w: 105, h: 64 }, { x: 565, y: 380, w: 105, h: 64 }, { x: 250, y: 380, w: 64, h: 64 }, { x: 606, y: 156, w: 64, h: 64 }];
export const TACTICS: Record<Role, string[]> = { vanguard: ['rush', 'hold'], flanker: ['flank_left', 'flank_right'], ranger: ['aim', 'lead'] };
export const LABELS: Record<string, string> = { rush: 'Close distance', hold: 'Hold a lane', flank_left: 'Flank left', flank_right: 'Flank right', aim: 'Aim at position', lead: 'Lead movement' };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (x: number, y: number) => { const d = Math.hypot(x, y) || 1; return { x: x / d, y: y / d }; };
function blocked(p: Point, radius = 0): boolean {
  return p.x < radius || p.y < radius || p.x > WIDTH - radius || p.y > HEIGHT - radius || WALLS.some(w => p.x > w.x - radius && p.x < w.x + w.w + radius && p.y > w.y - radius && p.y < w.y + w.h + radius);
}
export function lineOfSight(a: Point, b: Point, radius = 0): boolean {
  const n = Math.ceil(distance(a, b) / 5);
  for (let i = 1; i <= n; i++) if (blocked({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, radius)) return false;
  return true;
}
function move(p: Point, x: number, y: number, radius: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x, y) / 5));
  for (let i = 0; i < steps; i++) {
    if (!blocked({ x: p.x + x / steps, y: p.y }, radius)) p.x += x / steps;
    if (!blocked({ x: p.x, y: p.y + y / steps }, radius)) p.y += y / steps;
  }
}
function route(from: Point, to: Point): Point[] {
  if (lineOfSight(from, to, 17)) return [to];
  const size = 40, cols = WIDTH / size, rows = HEIGHT / size;
  const key = (p: Point) => clamp(Math.floor(p.y / size), 0, rows - 1) * cols + clamp(Math.floor(p.x / size), 0, cols - 1);
  const point = (k: number) => ({ x: (k % cols + .5) * size, y: (Math.floor(k / cols) + .5) * size });
  const start = key(from), queue = [start], seen = new Map<number, number>([[start, -1]]);
  let nearest = start, nearestDistance = distance(point(start), to);
  for (let index = 0; index < queue.length; index++) {
    const k = queue[index], p = point(k), d = distance(p, to);
    if (d < nearestDistance) { nearest = k; nearestDistance = d; }
    if (d < 28 && !blocked(to, 17)) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = { x: p.x + dx * size, y: p.y + dy * size }, next = key(q);
      if (!seen.has(next) && !blocked(q, 19) && lineOfSight(p, q, 17)) { seen.set(next, k); queue.push(next); }
    }
  }
  const path = []; let k = nearest;
  while (k !== start && k !== -1) { path.unshift(point(k)); k = seen.get(k) ?? -1; }
  return path;
}

/** Rendering and input never affect policy. Rewards are measurements of this world. */
export class Arena {
  player = { x: 460, y: 300, vx: 0, vy: 0, hp: 100, cooldown: 0, dashCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, invulnerable: 0 };
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  effects: Effect[] = [];
  time = 0;
  active = false;
  baseline = false;
  learning = true;
  communication: 'direct' | 'courier' = 'direct';
  scout: Scout | null = null;
  staleRounds = 0;
  auto = true;
  style: Style = 'orbit';
  outcome: Outcome | null = null;
  history: Outcome[] = [];
  completedRounds = 0;
  onFinish?: (outcome: Outcome) => void;
  private shotClock = 0;
  private beforeCells: PolicyCell[] = [];
  constructor(public policy: Policy) {}
  inspect() { return this.policy.request<PolicyInspection>({ op: 'inspect' }); }
  startEncounter(baseline = this.baseline) {
    if (this.active) this.discardEncounter();
    this.baseline = baseline; this.time = 0; this.shotClock = 0; this.outcome = null;
    this.player = { x: 460, y: 300, vx: 0, vy: 0, hp: 100, cooldown: 0, dashCooldown: 0, dashTime: 0, dashX: 0, dashY: 0, invulnerable: 0 };
    this.bullets = []; this.effects = [];
    this.beforeCells = this.inspect().cells;
    this.scout = this.communication === 'courier' ? { x: 725, y: 300, hp: 36, status: 'watching', observations: [0, 1, 2].map(() => ({damage: 0, hits: 0, observed: false, defeated: false})), report: null, path: [], repath: 0 } : null;
    this.enemies = (['vanguard', 'flanker', 'ranger'] as Role[]).map((role, id) => {
      const decision = this.policy.request<Decision>({ op: 'choose', role, context: 'arena', allowed: TACTICS[role], baseline });
      return { id, role, tactic: decision.action, decision, ...[{ x: 105, y: 300 }, { x: 815, y: 475 }, { x: 790, y: 105 }][id], hp: 72, cooldown: 1 + id * .5, windup: 0, target: { x: 460, y: 300 }, lastSeen: null, damage: 0, sightings: 0, aliveTime: 0, path: [], repath: 0 };
    });
    this.active = true;
  }
  /** Abort a round without generating reward; used when changing evaluation mode. */
  discardEncounter() {
    if (!this.active) return;
    for (const e of this.enemies) this.policy.request({ op: 'feedback', decision_id: e.decision.decision_id, reward: 0, observed: false });
    this.policy.request({ op: 'commit' }); this.active = false;
  }
  finish(result: Outcome['result']) {
    if (!this.active) return;
    this.active = false;
    const report = this.scout?.status === 'delivered' ? this.scout.report : null;
    const recap: TacticRecap[] = [];
    const rewards = this.enemies.map(e => {
      const evidence = this.communication === 'courier' ? report?.[e.id] : { damage: e.damage, hits: e.damage / 12, observed: e.sightings > 0, defeated: e.hp <= 0 };
      const observed = evidence?.observed ?? false;
      const reward = clamp((evidence?.damage ?? 0) / 32 - .22 - (evidence?.defeated ? .18 : 0), -1, 1);
      const accepted = this.policy.request<{accepted: boolean}>({ op: 'feedback', decision_id: e.decision.decision_id, reward, observed: observed && this.learning }).accepted;
      const before = this.beforeCells.find(c => c.role === e.role && c.action === e.tactic)!.probability;
      recap.push({ role: e.role, tactic: e.tactic, hits: evidence?.hits ?? 0, damage: evidence?.damage ?? 0, observed, accepted, reward, before, after: before,
        reason: this.baseline ? 'Uniform baseline; memory unchanged.' : !this.learning ? 'Learned policy held fixed for evaluation.' : !observed ? (this.communication === 'courier' ? 'No delivered observation for this tactic; old preferences can fade.' : 'No legitimate sighting; no evidence.') : `Observed ${evidence!.hits} hit${evidence!.hits === 1 ? '' : 's'}${evidence!.defeated ? ' and elimination' : ''}.` });
      return { role: e.role, tactic: e.tactic, reward, observed };
    });
    this.policy.request({ op: 'commit' });
    const anyEvidence = recap.some(r => r.accepted);
    this.staleRounds = anyEvidence ? 0 : this.staleRounds + 1;
    // Explicit passage-of-time decay is a host rule in courier mode. Evaluation
    // and uniform controls remain frozen; no fresh observations are invented.
    if (this.communication === 'courier' && !anyEvidence && this.learning && !this.baseline) this.policy.request({op:'age', steps:1});
    const after = this.inspect();
    for (const row of recap) row.after = after.cells.find(c => c.role === row.role && c.action === row.tactic)!.probability;
    this.outcome = { encounter: after.encounter, result, duration: this.time, health: Math.max(0, this.player.hp), damage: 100 - Math.max(0, this.player.hp), baseline: this.baseline, learning: this.learning, control: this.auto ? 'demo' : 'manual', style: this.auto ? this.style : null, communication: this.communication, reportStatus: this.scout?.status ?? 'direct', recap, rewards };
    this.history.unshift(this.outcome); this.history = this.history.slice(0, 24);
    this.completedRounds++;
    this.onFinish?.(this.outcome);
  }
  autoInput(): Input {
    const p = this.player, sign = this.style === 'reverse' ? -1 : 1;
    // All demo strategies are just input controllers, with the same weapons and damage.
    let goal = { x: 460 + Math.cos(this.time * .48 * sign) * 325, y: 300 + Math.sin(this.time * .48 * sign) * 220 };
    if (this.style === 'cover') {
      const points = [{ x: 210, y: 255 }, { x: 380, y: 260 }, { x: 710, y: 340 }, { x: 535, y: 460 }];
      goal = points[Math.floor(this.time / 5) % points.length];
    }
    if (this.style === 'weave') goal = {x: 460 + Math.sin(this.time * .7) * 210, y: 300 + Math.sin(this.time * 1.4) * 90};
    if (this.style === 'feint') { const angle = this.time * .38 * (Math.floor(this.time / 3) % 2 ? -1 : 1); goal = {x: 460 + Math.cos(angle) * 270, y: 300 + Math.sin(angle) * 190}; }
    const path = route(p, goal), next = path[0] ?? goal, dir = unit(next.x - p.x, next.y - p.y);
    const candidates = this.enemies.filter(e => e.hp > 0 && lineOfSight(p, e)).sort((a, b) => distance(p, a) - distance(p, b));
    const target = candidates[0];
    const danger = this.bullets.some(b => b.enemy !== null && distance(p, b) < 68);
    return { x: distance(p, goal) > 15 ? dir.x * .78 : 0, y: distance(p, goal) > 15 ? dir.y * .78 : 0, aim: target ?? goal, fire: !!target && this.shotClock > .90, dash: danger && this.style === 'cover' };
  }
  update(dt: number, input?: Input) {
    if (!this.active) return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, 1 / 30); this.time += dt; this.shotClock += dt;
    const p = this.player, command = this.auto ? this.autoInput() : input ?? { x: 0, y: 0, aim: p, fire: false, dash: false };
    p.cooldown -= dt; p.dashCooldown = Math.max(0, p.dashCooldown - dt); p.invulnerable -= dt;
    const direction = unit(command.x, command.y);
    if (command.dash && p.dashCooldown <= 0 && Math.hypot(command.x, command.y) > .1) {
      p.dashTime = .16; p.dashCooldown = 2.4; p.invulnerable = .16; p.dashX = direction.x; p.dashY = direction.y;
      this.effects.push({ x: p.x, y: p.y, kind: 'dash', life: .4, max: .4 });
    }
    const dashing = p.dashTime > 0; p.dashTime -= dt;
    const inputStrength = Math.min(1, Math.hypot(command.x, command.y)), oldX = p.x, oldY = p.y;
    move(p, (dashing ? p.dashX * 550 : direction.x * 165 * inputStrength) * dt, (dashing ? p.dashY * 550 : direction.y * 165 * inputStrength) * dt, 13);
    p.vx = (p.x - oldX) / dt; p.vy = (p.y - oldY) / dt;
    if (command.fire && p.cooldown <= 0) {
      const aim = unit(command.aim.x - p.x, command.aim.y - p.y);
      this.bullets.push({ x: p.x, y: p.y, vx: aim.x * 560, vy: aim.y * 560, life: 1.5, enemy: null });
      p.cooldown = .23; this.shotClock = 0;
    }
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      e.aliveTime += dt; const visible = lineOfSight(e, p);
      if (visible) { e.sightings += dt; e.lastSeen = { x: p.x, y: p.y, vx: p.vx, vy: p.vy }; }
      // Hidden player state is never consumed by movement or targeting. Uninformed
      // enemies patrol authored waypoints; informed enemies search the last sighting.
      const patrol = [{ x: 460, y: 120 }, { x: 750, y: 300 }, { x: 460, y: 480 }, { x: 170, y: 300 }][(e.id + Math.floor(this.time / 6)) % 4];
      const known = e.lastSeen ?? { ...patrol, vx: 0, vy: 0 };
      const to = unit(known.x - e.x, known.y - e.y), range = distance(e, known);
      let goal: Point = known;
      if (e.tactic === 'rush' && visible) goal = { x: known.x + known.vx * .7, y: known.y + known.vy * .7 };
      if (e.tactic === 'hold' && visible) goal = { x: known.x - to.x * 200, y: known.y - to.y * 200 };
      if (e.role === 'flanker') {
        const side = e.tactic === 'flank_left' ? -1 : 1;
        if (visible) goal = { x: known.x - to.x * 95 - to.y * 140 * side, y: known.y - to.y * 95 + to.x * 140 * side };
      }
      if (e.role === 'ranger' && visible) goal = { x: known.x - to.x * 275, y: known.y - to.y * 275 };
      goal = { x: clamp(goal.x, 45, WIDTH - 45), y: clamp(goal.y, 45, HEIGHT - 45) };
      e.repath -= dt;
      if (e.repath <= 0) { e.path = route(e, goal); e.repath = .35; }
      while (e.path.length && distance(e, e.path[0]) < 17) e.path.shift();
      const destination = e.path[0];
      if (destination && e.windup <= 0) {
        const d = unit(destination.x - e.x, destination.y - e.y), speed = e.role === 'vanguard' ? 106 : e.role === 'flanker' ? 121 : 77;
        move(e, d.x * speed * dt, d.y * speed * dt, 17);
      }
      e.cooldown -= dt;
      if (e.windup > 0) {
        if (visible && e.windup > LOCK_WINDOW) {
          const lead = e.tactic === 'lead' ? LOCK_WINDOW + range / 480 : 0;
          e.target = { x: clamp(known.x + known.vx * lead, 15, WIDTH - 15), y: clamp(known.y + known.vy * lead, 15, HEIGHT - 15) };
        }
        e.windup -= dt;
        if (e.windup <= 0 && lineOfSight(e, p)) {
          const aim = unit(e.target.x - e.x, e.target.y - e.y);
          this.bullets.push({ x: e.x, y: e.y, vx: aim.x * 480, vy: aim.y * 480, life: e.role === 'vanguard' ? .65 : 1.6, enemy: e.id });
          e.cooldown = e.role === 'vanguard' ? .85 : e.role === 'flanker' ? 1.15 : 1.35;
        }
      } else if (e.cooldown <= 0 && visible && range < (e.role === 'vanguard' ? 260 : 650)) {
        e.windup = e.role === 'ranger' ? .72 : .48;
        const lead = e.tactic === 'lead' ? LOCK_WINDOW + range / 480 : 0;
        e.target = { x: clamp(known.x + known.vx * lead, 15, WIDTH - 15), y: clamp(known.y + known.vy * lead, 15, HEIGHT - 15) };
      }
    }
    const scout = this.scout;
    if (scout && scout.hp > 0 && scout.status !== 'delivered') {
      if (scout.status === 'watching') {
        for (const e of this.enemies) if (lineOfSight(scout, p) && lineOfSight(scout, e)) {
          if (e.hp > 0) scout.observations[e.id].observed = true;
          else if (scout.observations[e.id].observed) scout.observations[e.id].defeated = true;
        }
        if (this.time >= 8) { scout.report = scout.observations.map(row => ({...row})); scout.status = 'escaping'; }
      }
      if (scout.status === 'escaping') {
        scout.repath -= dt;
        if (scout.repath <= 0) { scout.path = route(scout, {x:900,y:300}); scout.repath = .5; }
        while (scout.path.length && distance(scout, scout.path[0]) < 12) scout.path.shift();
        const goal = scout.path[0];
        if (goal) { const direction = unit(goal.x-scout.x, goal.y-scout.y); move(scout, direction.x*90*dt, direction.y*90*dt, 11); }
        if (scout.x >= 884 && Math.abs(scout.y-300) < 25) scout.status = 'delivered';
      }
    }
    for (const b of this.bullets) {
      const old = { x: b.x, y: b.y }; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (!lineOfSight(old, b, 2)) { b.life = 0; continue; }
      if (b.enemy !== null && distance(b, p) < 16 && p.invulnerable <= 0) {
        p.hp -= 12; this.enemies[b.enemy].damage += 12; b.life = 0;
        if (scout?.status === 'watching' && scout.hp > 0 && lineOfSight(scout, p) && lineOfSight(scout, this.enemies[b.enemy])) {
          const witness = scout.observations[b.enemy]; witness.damage += 12; witness.hits++; witness.observed = true;
        }
        this.effects.push({ x: p.x, y: p.y, life: .3, max: .3, kind: 'hit' });
      }
      if (b.enemy === null && scout && scout.hp > 0 && scout.status !== 'delivered' && distance(b, scout) < 15) {
        scout.hp -= 18; b.life = 0; if (scout.hp <= 0) { scout.status = 'intercepted'; scout.report = null; }
        this.effects.push({x:scout.x,y:scout.y,life:.3,max:.3,kind:'hit'}); continue;
      }
      if (b.enemy === null) for (const e of this.enemies) if (e.hp > 0 && distance(b, e) < 20) {
        e.hp -= 18; b.life = 0; this.effects.push({ x: e.x, y: e.y, life: .3, max: .3, kind: 'hit' }); break;
      }
    }
    this.bullets = this.bullets.filter(b => b.life > 0);
    for (const effect of this.effects) effect.life -= dt;
    this.effects = this.effects.filter(e => e.life > 0);
    if (p.hp <= 0) this.finish('down');
    else if (this.enemies.every(e => e.hp <= 0) && (!this.scout || this.scout.status === 'delivered' || this.scout.status === 'intercepted')) this.finish('cleared');
    else if (this.time >= DURATION) this.finish('survived');
  }
  runEncounter(style: Style = this.style) {
    this.style = style; this.auto = true;
    if (!this.active) this.startEncounter();
    for (let i = 0; i < 1700 && this.active; i++) this.update(1 / 60);
    return this.outcome;
  }
  state() {
    return { active: this.active, time: this.time, baseline: this.baseline, learning: this.learning, communication: this.communication, scout: this.scout, staleRounds: this.staleRounds, auto: this.auto, style: this.style, player: { ...this.player }, enemies: this.enemies.map(e => ({ role: e.role, tactic: e.tactic, hp: e.hp, x: e.x, y: e.y, damage: e.damage })), outcome: this.outcome, policy: this.inspect(), history: this.history };
  }
}
