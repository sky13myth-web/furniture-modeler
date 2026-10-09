/** Continuous translation on the floor plane. Geometry stays in millimetres. */
import { canPlaceCabinet, canEditCabinetPlacement, getCabinetPlacementFootprint, getCabinetPlacementMetrics, getRoomInstallationClearance } from './engine.js';
import { getRoomOutline } from './room-geometry.js';

const SKIN = .01;
const EPS = 1e-8;
const dot = (a, b) => a.x * b.x + a.z * b.z;
const length = vector => Math.hypot(vector.x, vector.z);
const subtract = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const scale = (vector, factor) => ({ x: vector.x * factor, z: vector.z * factor });
const at = (point, velocity, time) => ({ x: point.x + velocity.x * time, z: point.z + velocity.z * time });
const finiteTarget = target => target && Number.isFinite(target.x) && Number.isFinite(target.z);
const edges = polygon => polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]]);

/** Recheck on release against the current room, stocks and other cabinets. */
export function canApplyCabinetMovement(cabinet, target, project) {
  return Boolean(finiteTarget(target) && canEditCabinetPlacement(cabinet, { ...cabinet, x: target.x, z: target.z }, project));
}

function closestOnSegment(point, a, b) {
  const edge = subtract(b, a), square = dot(edge, edge);
  return at(a, edge, square ? Math.max(0, Math.min(1, dot(subtract(point, a), edge) / square)) : 0);
}

function perpendicular(a, b, velocity) {
  const edge = subtract(b, a), size = length(edge);
  if (size < EPS) return scale(velocity, -1 / Math.max(EPS, length(velocity)));
  let normal = { x: -edge.z / size, z: edge.x / size };
  if (dot(normal, velocity) > 0) normal = scale(normal, -1);
  return normal;
}

// Exact event times at a finite segment's capsule: two parallel lines and
// endpoint circles. At radius zero these are polygon edge-crossing events.
function capsuleEvents(point, velocity, a, b, radius, emit) {
  const edge = subtract(b, a), size = length(edge), speedSquare = dot(velocity, velocity);
  if (speedSquare < EPS) return;
  if (size > EPS) {
    const normal = { x: -edge.z / size, z: edge.x / size };
    const distance = dot(subtract(point, a), normal), speed = dot(velocity, normal);
    if (Math.abs(speed) > EPS) for (const boundary of radius > EPS ? [-radius, radius] : [0]) {
      const time = (boundary - distance) / speed, position = at(point, velocity, time);
      const projection = dot(subtract(position, a), edge) / (size * size);
      if (projection >= -EPS && projection <= 1 + EPS) emit(time);
    }
  }
  for (const endpoint of [a, b]) {
    const q = subtract(point, endpoint), linear = 2 * dot(q, velocity), constant = dot(q, q) - radius * radius;
    let discriminant = linear * linear - 4 * speedSquare * constant;
    if (discriminant < -1e-12 * Math.max(1, linear * linear, Math.abs(4 * speedSquare * constant))) continue;
    discriminant = Math.sqrt(Math.max(0, discriminant));
    emit((-linear - discriminant) / (2 * speedSquare));
    if (discriminant > EPS) emit((-linear + discriminant) / (2 * speedSquare));
  }
}

function scene(cabinet, project, policy) {
  const polygon = getCabinetPlacementFootprint(cabinet, project);
  const room = { polygon: getRoomOutline(project.room), radius: getRoomInstallationClearance(project.room).walls, kind: 'wall' };
  if (policy?.legacy && policy.wallDeficit > 0) room.extraRadius = Math.max(0, room.radius - policy.wallDeficit);
  const obstacles = project.cabinets.filter(other => other.id !== cabinet.id &&
    Math.min(cabinet.y + cabinet.height, other.y + other.height) - Math.max(cabinet.y, other.y) > .001)
    .map(other => ({ polygon: getCabinetPlacementFootprint(other, project), radius: 0, kind: 'cabinet', id: other.id }));
  return { polygon, boundaries: [room, ...obstacles] };
}

function contactEvents(cabinet, velocity, project, policy) {
  const { polygon, boundaries } = scene(cabinet, project, policy), events = [];
  const add = (time, normal, metadata) => {
    if (Number.isFinite(time) && time >= -EPS && time <= 1 + EPS) events.push({ time: Math.max(0, Math.min(1, time)), normal, ...metadata });
  };
  for (const boundary of boundaries) {
    const radii = new Set([boundary.radius, ...(boundary.extraRadius !== undefined ? [boundary.extraRadius] : []), ...(policy?.legacy && boundary.kind === 'wall' ? [0] : [])]);
    for (const radius of radii) {
    const staticEdges = edges(boundary.polygon), movingEdges = edges(polygon);
    for (const point of polygon) for (let index = 0; index < staticEdges.length; index++) {
      const [a, b] = staticEdges[index];
      capsuleEvents(point, velocity, a, b, radius, time => {
        const position = at(point, velocity, time), away = subtract(position, closestOnSegment(position, a, b));
        const normal = length(away) > EPS ? scale(away, 1 / length(away)) : perpendicular(a, b, velocity);
        add(time, normal, { kind: boundary.kind, id: boundary.id, edge: index });
      });
    }
    // A room/obstacle corner can hit the middle of a cabinet edge. Checking
    // only moving vertices would miss concave rooms and thin obstructions.
    for (let index = 0; index < boundary.polygon.length; index++) for (const [a, b] of movingEdges) {
      const point = boundary.polygon[index], reverse = scale(velocity, -1);
      capsuleEvents(point, reverse, a, b, radius, time => {
        const relative = at(point, reverse, time), away = subtract(closestOnSegment(relative, a, b), relative);
        const normal = length(away) > EPS ? scale(away, 1 / length(away)) : perpendicular(a, b, velocity);
        add(time, normal, { kind: boundary.kind, id: boundary.id, corner: index });
      });
    }
    }
  }
  return events.sort((a, b) => a.time - b.time);
}

function legacyExtrema(cabinet, velocity, project, start, end) {
  const metric = time => { const value = getCabinetPlacementMetrics({ ...cabinet, ...at(cabinet, velocity, time) }, project); return { outside: value.outsideArea, ...Object.fromEntries(Object.entries(value.collisionVolumes).map(([id, volume]) => [`collision/${id}`, volume])) }; };
  const first = metric(start), middle = metric((start + end) / 2), last = metric(end), times = [];
  // Fixed orientations make all intersection vertices affine in time between
  // topology events. Their shoelace areas (and constant-Y overlap volumes) are
  // quadratic. Locate each exact interior maximum, including a narrow hump
  // which a midpoint/end check would miss.
  for (const key of new Set([...Object.keys(first), ...Object.keys(middle), ...Object.keys(last)])) {
    const f0 = first[key] ?? 0, fm = middle[key] ?? 0, f1 = last[key] ?? 0;
    const a = 2 * (f0 + f1 - 2 * fm), b = f1 - f0 - a;
    if (a >= -EPS) continue;
    const u = -b / (2 * a);
    if (u > EPS && u < 1 - EPS) times.push(start + u * (end - start));
  }
  return times;
}

function firstImpact(cabinet, velocity, project, allowed, policy) {
  const speed = length(velocity), events = contactEvents(cabinet, velocity, project, policy);
  let strictPath = canPlaceCabinet(cabinet, project);
  const pathAllowed = time => {
    const point = at(cabinet, velocity, time), fits = canPlaceCabinet({ ...cabinet, ...point }, project);
    const accepted = strictPath ? fits : allowed(point);
    if (accepted && fits) strictPath = true;
    return accepted;
  };
  const times = [0];
  for (const event of events) if (event.time - times.at(-1) > 1e-12) times.push(event.time);
  if (1 - times.at(-1) > 1e-12) times.push(1);
  for (let index = 0; index + 1 < times.length; index++) {
    const start = times[index], end = times[index + 1], midpoint = (start + end) / 2;
    // The event list splits every possible entry/exit. Even a valid endpoint
    // cannot hide an obstacle between consecutive polygon/capsule contacts.
    const probes = [...(!strictPath ? legacyExtrema(cabinet, velocity, project, start, end) : []), midpoint, end].sort((a, b) => a - b);
    const invalid = probes.find(time => !pathAllowed(time));
    if (invalid === undefined) continue;
    let time = start;
    const intervalAllowed = value => strictPath ? canPlaceCabinet({ ...cabinet, ...at(cabinet, velocity, value) }, project) : allowed(at(cabinet, velocity, value));
    // Imported bad placements can meet a nonzero deficit limit between edge
    // events. Locate that limit rather than requiring immediate full repair.
    if (!canPlaceCabinet(cabinet, project)) {
      let low = start, high = invalid;
      if (intervalAllowed(low)) {
        for (let i = 0; i < 38; i++) { const middle = (low + high) / 2; if (intervalAllowed(middle)) low = middle; else high = middle; }
        time = low;
      }
    }
    const contacts = events.filter(event => Math.abs(event.time - time) * speed <= .05 && dot(event.normal, velocity) < -EPS);
    if (!contacts.length) contacts.push({ time, normal: scale(velocity, -1 / speed), kind: 'limit' });
    return { time, contacts };
  }
  if (!pathAllowed(1)) return { time: 0, contacts: [{ normal: scale(velocity, -1 / speed), kind: 'limit' }] };
  return null;
}

/**
 * Sweep from the cabinet's current position, stop before each contact, and
 * project the remaining movement onto a permissible contact tangent. Never
 * mutates the cabinet or project. `valid` means accepted by the edit policy;
 * `fits` separately reports strict containment for imported invalid starts.
 */
export function resolveCabinetMovement(cabinet, target, project) {
  const initial = { x: cabinet.x, z: cabinet.z };
  const strictStart = canPlaceCabinet(cabinet, project);
  const policy = { legacy: !strictStart, wallDeficit: strictStart ? 0 : getCabinetPlacementMetrics(cabinet, project).deficits.walls };
  const allowed = point => strictStart ? canPlaceCabinet({ ...cabinet, ...point }, project) : canApplyCabinetMovement(cabinet, point, project);
  let position = initial, velocity = finiteTarget(target) ? subtract(target, initial) : { x: 0, z: 0 }, slid = false;
  const contacts = [];
  for (let step = 0; step < 10 && length(velocity) > EPS; step++) {
    const moving = { ...cabinet, ...position }, impact = firstImpact(moving, velocity, project, allowed, policy);
    if (!impact) { position = at(position, velocity, 1); break; }
    const speed = length(velocity), travel = Math.max(0, impact.time - SKIN / speed);
    let next = at(position, velocity, travel);
    // Floating-point intersections must not turn a conservative contact into
    // an outside commit; the original point is always the fallback.
    if (!allowed(next)) {
      let low = 0, high = travel;
      for (let i = 0; i < 38; i++) { const middle = (low + high) / 2; if (allowed(at(position, velocity, middle))) low = middle; else high = middle; }
      next = at(position, velocity, low);
    }
    const remaining = subtract(at(position, velocity, 1), next);
    position = next;
    contacts.push(...impact.contacts.map(({ normal, kind, id, edge, corner }) => ({ normal, kind, ...(id ? { id } : {}), ...(edge !== undefined ? { edge } : {}), ...(corner !== undefined ? { corner } : {}) })));
    const candidates = [];
    for (const contact of impact.contacts) {
      const tangent = subtract(remaining, scale(contact.normal, dot(remaining, contact.normal)));
      if (length(tangent) <= EPS || candidates.some(item => length(subtract(item.vector, tangent)) < EPS)) continue;
      const preview = firstImpact({ ...cabinet, ...position }, tangent, project, allowed, policy);
      const fraction = preview ? Math.max(0, preview.time - SKIN / length(tangent)) : 1;
      const score = dot(scale(tangent, fraction), remaining);
      if (fraction > EPS && score > EPS) candidates.push({ vector: tangent, score });
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) break;
    velocity = candidates[0].vector; slid = true;
  }
  if (!allowed(position)) position = initial;
  return { ...position, valid: canApplyCabinetMovement(cabinet, position, project), fits: canPlaceCabinet({ ...cabinet, ...position }, project), blocked: finiteTarget(target) && length(subtract(position, target)) > .02, slid, contacts };
}
