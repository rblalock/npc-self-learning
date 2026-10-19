import assert from "node:assert/strict";

export const WIDTH = 920,
  HEIGHT = 600;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const unit = (x, y) => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
};
export const blocked = (walls, p, radius = 0) =>
  p.x < radius ||
  p.y < radius ||
  p.x > WIDTH - radius ||
  p.y > HEIGHT - radius ||
  walls.some(
    (w) =>
      p.x > w.x - radius &&
      p.x < w.x + w.w + radius &&
      p.y > w.y - radius &&
      p.y < w.y + w.h + radius,
  );
/** Same five-unit collision probes and radius convention as the archived combat. */
export function lineClear(walls, a, b, radius = 0) {
  const n = Math.ceil(distance(a, b) / 5);
  for (let i = 1; i <= n; i++)
    if (
      blocked(
        walls,
        { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n },
        radius,
      )
    )
      return false;
  return true;
}

export function navigation(walls) {
  const nodes = [];
  for (let y = 20; y < HEIGHT; y += 40)
    for (let x = 20; x < WIDTH; x += 40)
      if (!blocked(walls, { x, y }, 19)) nodes.push({ x, y });
  const ids = new Map(nodes.map((p, i) => [`${p.x}/${p.y}`, i]));
  const edges = nodes.map((p) =>
    [
      [40, 0],
      [-40, 0],
      [0, 40],
      [0, -40],
    ].flatMap(([dx, dy]) => {
      const id = ids.get(`${p.x + dx}/${p.y + dy}`);
      return id !== undefined && lineClear(walls, p, nodes[id], 17) ? [id] : [];
    }),
  );
  const nearest = (p, projectBlockedGoal = false) =>
    nodes
      .map((q, i) => ({ i, d: distance(p, q) }))
      .sort((a, b) => a.d - b.d)
      .find((q) => projectBlockedGoal || lineClear(walls, p, nodes[q.i], 17))
      ?.i;
  function route(from, goal) {
    if (!blocked(walls, goal, 17) && lineClear(walls, from, goal, 17))
      return [goal];
    const start = nearest(from),
      end = nearest(goal, blocked(walls, goal, 17));
    if (start === undefined || end === undefined) return [];
    const queue = [start],
      parents = new Map([[start, -1]]);
    for (let i = 0; i < queue.length && !parents.has(end); i++)
      for (const next of edges[queue[i]])
        if (!parents.has(next)) {
          parents.set(next, queue[i]);
          queue.push(next);
        }
    if (!parents.has(end)) return [];
    const path = [];
    for (let k = end; k !== start; k = parents.get(k)) path.unshift(nodes[k]);
    if (!blocked(walls, goal, 17) && lineClear(walls, nodes[end], goal, 17))
      path.push(goal);
    if (path.length && !lineClear(walls, from, path[0], 17))
      path.unshift(nodes[start]);
    return path.length ? path : [nodes[start]];
  }
  return { nodes, edges, route, nearest };
}

export function validateWorld(world) {
  const errors = [];
  if (
    !Array.isArray(world.walls) ||
    !Array.isArray(world.spawns) ||
    world.spawns.length !== 3 ||
    !world.player
  )
    return { valid: false, errors: ["missing geometry or spawns"] };
  for (const w of world.walls)
    if (
      ![w.x, w.y, w.w, w.h].every(Number.isFinite) ||
      w.x < 0 ||
      w.y < 0 ||
      w.w <= 0 ||
      w.h <= 0 ||
      w.x + w.w > WIDTH ||
      w.y + w.h > HEIGHT
    )
      errors.push("invalid wall");
  const spawns = [world.player, ...world.spawns];
  for (const p of spawns)
    if (![p.x, p.y].every(Number.isFinite) || blocked(world.walls, p, 19))
      errors.push("blocked spawn");
  for (let i = 0; i < spawns.length; i++)
    for (let j = 0; j < i; j++)
      if (distance(spawns[i], spawns[j]) < 70)
        errors.push("overlapping spawn clearance");
  if (errors.length) return { valid: false, errors };
  const nav = navigation(world.walls),
    start = nav.nearest(world.player),
    seen = new Set(start === undefined ? [] : [start]),
    queue = [...seen];
  for (let i = 0; i < queue.length; i++)
    for (const n of nav.edges[queue[i]])
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  if (seen.size !== nav.nodes.length) errors.push("disconnected walkable grid");
  for (const p of [...spawns, ...(world.waypoints ?? [])])
    if (blocked(world.walls, p, 19) || !seen.has(nav.nearest(p)))
      errors.push("unreachable spawn or waypoint");
  return {
    valid: errors.length === 0,
    errors,
    reachableNodes: seen.size,
    totalNodes: nav.nodes.length,
    radius: 19,
    gridSpacing: 40,
  };
}
export function requireWorld(world) {
  const validation = validateWorld(world);
  assert.ok(validation.valid, JSON.stringify(validation));
  return validation;
}
