// Wall-mounted room obstacles: utility pipes (risers, heating / water lines)
// and boxed protrusions (ventilation shafts, columns, pipe casings).
// They share the opening record shape in room.windows (wallIndex, offset,
// width, height, sill) so the plan editor can select and drag them along the
// wall. Unlike windows and doors they never cut the wall; they stand in front
// of it and occupy floor space that furniture has to respect.
import { getRoomOutline, polygonArea, polygonsOverlap, cabinetFootprint } from './room-geometry.js';

export const OBSTACLE_KINDS = Object.freeze(['pipe', 'box']);
export const OPENING_KINDS = Object.freeze(['window', 'door']);
export const ROOM_ELEMENT_KINDS = Object.freeze([...OPENING_KINDS, ...OBSTACLE_KINDS]);

/** Standard Turkish / EU installation pipe outer diameters, mm. */
export const PIPE_DIAMETERS = Object.freeze([16, 20, 25, 32, 40, 50, 75, 110]);

const LEGACY_WALLS = { back: 0, right: 1, front: 2, left: 3 };
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const isObstacle = element => OBSTACLE_KINDS.includes(element?.kind);
export const isOpening = element => !isObstacle(element);
export const roomOpenings = room => (room?.windows || []).filter(isOpening);
export const roomObstacles = room => (room?.windows || []).filter(isObstacle);
export const wallIndexOf = element => Number.isInteger(element?.wallIndex) ? element.wallIndex : LEGACY_WALLS[element?.wall];

/** Depth an obstacle occupies in front of the wall surface (mm). */
export function obstacleDepth(element) {
  if (element?.kind === 'pipe') return Math.max(0, num(element.standoff, 0)) + Math.max(1, num(element.diameter, 32));
  if (element?.kind === 'box') return Math.max(1, num(element.depth, 200));
  return 0;
}

/** Keep the plan envelope (width × height) consistent with the pipe diameter. */
export function normalizeObstacle(element) {
  if (!element || element.kind !== 'pipe') return element;
  const diameter = Math.max(1, num(element.diameter, 32));
  const next = { ...element, diameter, standoff: Math.max(0, num(element.standoff, 20)), orientation: element.orientation === 'horizontal' ? 'horizontal' : 'vertical' };
  if (next.orientation === 'vertical') next.width = diameter;
  else next.height = diameter;
  return next;
}

/** Create a new obstacle record with sensible defaults for the given wall. */
export function createObstacle(kind, { id, wallIndex = 0, wallLength = 3000, roomHeight = 2700, orientation = 'vertical' } = {}) {
  const height = Math.max(100, num(roomHeight, 2700));
  if (kind === 'pipe') {
    const diameter = 32, standoff = 20;
    const vertical = orientation !== 'horizontal';
    const width = vertical ? diameter : Math.min(1200, Math.max(100, wallLength - 200));
    return normalizeObstacle({ id, kind: 'pipe', wallIndex, orientation: vertical ? 'vertical' : 'horizontal', diameter, standoff, offset: Math.max(0, Math.round(vertical ? Math.min(150, wallLength - width) : (wallLength - width) / 2)), width, height: vertical ? height : diameter, sill: vertical ? 0 : 150 });
  }
  const width = Math.min(400, Math.max(50, wallLength / 4));
  return { id, kind: 'box', wallIndex, offset: Math.max(0, Math.round(wallLength - width)), width, height, sill: 0, depth: 250 };
}

/** Switch a pipe between riser and horizontal run, keeping it on its wall. */
export function setPipeOrientation(element, orientation, { wallLength = 3000, roomHeight = 2700 } = {}) {
  if (element?.kind !== 'pipe') return element;
  const vertical = orientation !== 'horizontal';
  const diameter = Math.max(1, num(element.diameter, 32));
  if (vertical) {
    const centre = num(element.offset) + num(element.width) / 2;
    return normalizeObstacle({ ...element, orientation: 'vertical', offset: Math.max(0, Math.min(wallLength - diameter, Math.round(centre - diameter / 2))), sill: 0, height: Math.max(100, num(roomHeight, 2700)) });
  }
  const width = Math.min(1200, Math.max(100, wallLength - 200));
  return normalizeObstacle({ ...element, orientation: 'horizontal', offset: Math.max(0, Math.round(Math.min(num(element.offset), wallLength - width))), width, sill: 150 });
}

/**
 * Frame of the wall an element belongs to. `inward` points into the room.
 * Returns null for missing or degenerate walls.
 */
export function wallFrame(room, element) {
  const outline = getRoomOutline(room || {});
  const index = wallIndexOf(element);
  if (!Number.isInteger(index) || index < 0 || index >= outline.length) return null;
  const a = outline[index], b = outline[(index + 1) % outline.length];
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const orientation = polygonArea(outline) >= 0 ? 1 : -1;
  const u = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
  const inward = { x: -u.z * orientation, z: u.x * orientation };
  return { index, a, b, length, u, inward, point: (along, depth = 0) => ({ x: a.x + u.x * along + inward.x * depth, z: a.z + u.z * along + inward.z * depth }) };
}

/**
 * World geometry of an obstacle.
 * footprint: floor polygon used for collisions and the plan symbol.
 * bottom / top: vertical extent (mm from floor).
 * pipe: { axis: 'y' | 'wall', center, radius, start, end } for cylinder rendering.
 */
export function obstacleGeometry(room, element) {
  if (!isObstacle(element)) return null;
  const frame = wallFrame(room, element);
  if (!frame) return null;
  const item = normalizeObstacle(element);
  const start = num(item.offset), width = Math.max(1, num(item.width, 1));
  const end = start + width;
  const depth = obstacleDepth(item);
  const roomHeight = Math.max(1, num(room?.height, 2700));
  const bottom = Math.max(0, num(item.sill));
  const top = Math.min(roomHeight, bottom + Math.max(1, num(item.height, roomHeight)));
  const nearDepth = item.kind === 'pipe' ? num(item.standoff) : 0;
  const footprint = [frame.point(start, nearDepth), frame.point(end, nearDepth), frame.point(end, depth), frame.point(start, depth)];
  const geometry = { id: item.id, kind: item.kind, element: item, frame, start, end, width, depth, bottom, top, footprint };
  if (item.kind === 'pipe') {
    const radius = item.diameter / 2, axisDepth = item.standoff + radius;
    if (item.orientation === 'vertical') {
      const center = frame.point(start + width / 2, axisDepth);
      geometry.pipe = { axis: 'y', radius, center: { x: center.x, y: bottom, z: center.z }, length: top - bottom };
    } else {
      const from = frame.point(start, axisDepth), to = frame.point(end, axisDepth);
      geometry.pipe = { axis: 'wall', radius, from: { x: from.x, y: bottom + radius, z: from.z }, to: { x: to.x, y: bottom + radius, z: to.z }, length: width };
    }
    // Wall brackets (clamps) every ~1 m, at least two.
    const run = item.orientation === 'vertical' ? top - bottom : width;
    const count = Math.max(2, Math.round(run / 1000) + 1);
    const margin = Math.min(120, run / 4);
    geometry.clamps = Array.from({ length: count }, (_, i) => margin + (run - 2 * margin) * i / (count - 1));
  }
  return geometry;
}

export function obstacleLabel(element, translate = text => text) {
  if (element?.kind === 'pipe') return translate(element.orientation === 'horizontal' ? 'Труба горизонтальная' : 'Труба вертикальная');
  if (element?.kind === 'box') return translate('Короб / выступ');
  return '';
}

/** Cabinet × obstacle conflicts: floor-plan overlap and vertical overlap. */
export function findObstacleConflicts(project, { physical = c => c } = {}) {
  const room = project?.room || {};
  const conflicts = [];
  const obstacles = roomObstacles(room).map(element => obstacleGeometry(room, element)).filter(Boolean);
  if (!obstacles.length) return conflicts;
  for (const cabinet of project?.cabinets || []) {
    const body = physical(cabinet);
    const footprint = cabinetFootprint(body);
    if (footprint.length < 3) continue;
    const y0 = num(body.y), y1 = y0 + num(body.height);
    for (const obstacle of obstacles) {
      if (!(y0 < obstacle.top - .5 && y1 > obstacle.bottom + .5)) continue;
      if (!polygonsOverlap(footprint, obstacle.footprint)) continue;
      conflicts.push({ cabinet, obstacle, suggestion: suggestCabinetCutout(body, obstacle) });
    }
  }
  return conflicts;
}

/**
 * Suggest a rear corner notch (cabinet.cutout) that clears the obstacle with
 * a mounting clearance. Returns null when the obstacle is not at a rear corner
 * (e.g. a riser in the middle of a wide cabinet needs a different solution).
 */
export function suggestCabinetCutout(cabinet, obstacle, clearance = 10) {
  const width = num(cabinet.width), depth = num(cabinet.depth);
  if (!(width > 0 && depth > 0)) return null;
  const angle = num(cabinet.rotation) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const local = obstacle.footprint.map(p => {
    const dx = p.x - num(cabinet.x), dz = p.z - num(cabinet.z);
    return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
  });
  const minX = Math.max(0, Math.min(...local.map(p => p.x))), maxX = Math.min(width, Math.max(...local.map(p => p.x)));
  const maxZ = Math.min(depth, Math.max(...local.map(p => p.z))), minZ = Math.max(0, Math.min(...local.map(p => p.z)));
  if (maxX <= minX || maxZ <= minZ) return null;
  const notchDepth = Math.ceil(maxZ + clearance);
  if (notchDepth > depth - 60) return null;
  const leftWidth = Math.ceil(maxX + clearance), rightWidth = Math.ceil(width - minX + clearance);
  const options = [];
  if (leftWidth <= width - 60) options.push({ corner: 'back-left', width: leftWidth, depth: notchDepth });
  if (rightWidth <= width - 60) options.push({ corner: 'back-right', width: rightWidth, depth: notchDepth });
  if (!options.length) return null;
  options.sort((p, q) => p.width - q.width);
  // A notch wider than half the cabinet usually means the obstacle is central.
  return options[0].width <= width / 2 + clearance ? options[0] : null;
}
