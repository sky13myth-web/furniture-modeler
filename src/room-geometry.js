// Geometry is expressed in millimetres on the floor plane: X right, Z forward.
const EPS = 1e-7;
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const samePoint = (a, b) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.z - b.z) <= EPS;
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const edge = (points, index) => [points[index], points[(index + 1) % points.length]];
const pointAt = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
const positiveNumber = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;

/** Clone an outline; remove an optional closing copy of its first vertex. */
export function normalizeRoomOutline(points) {
  if (!Array.isArray(points) || !points.every(finitePoint)) return [];
  const result = points.map(({ x, z }) => ({ x, z }));
  if (result.length > 1 && samePoint(result[0], result.at(-1))) result.pop();
  return result;
}

/** Outline order is preserved. Legacy rooms have a positive-area rectangle. */
export function getRoomOutline(room = {}) {
  const points = normalizeRoomOutline(room.outline);
  if (points.length >= 3) return points;
  const width = positiveNumber(room.width, 4200), depth = positiveNumber(room.depth, 3400);
  return [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }];
}

/** Signed shoelace area in mm²; positive for clockwise order on an X/Z screen. */
export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3 || !points.every(finitePoint)) return 0;
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.z - q.x * p.z;
  }, 0) / 2;
}

function onSegment(p, a, b) {
  const tolerance = EPS * Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
  return Math.abs(cross(a, b, p)) <= tolerance && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.z >= Math.min(a.z, b.z) - EPS && p.z <= Math.max(a.z, b.z) + EPS;
}
function onBoundary(point, polygon) {
  return polygon.some((_, i) => onSegment(point, ...edge(polygon, i)));
}

/** Boundary points are contained. Works for simple convex or concave polygons. */
export function pointInPolygon(point, polygon) {
  if (!finitePoint(point) || !Array.isArray(polygon) || polygon.length < 3 || !polygon.every(finitePoint)) return false;
  if (onBoundary(point, polygon)) return true;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function intersectionParameters(a, b, c, d) {
  const rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z;
  const denominator = rx * sz - rz * sx;
  const qx = c.x - a.x, qz = c.z - a.z;
  if (Math.abs(denominator) > EPS) {
    const t = (qx * sz - qz * sx) / denominator, u = (qx * rz - qz * rx) / denominator;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [Math.max(0, Math.min(1, t))] : [];
  }
  if (Math.abs(qx * rz - qz * rx) > EPS * Math.max(1, Math.hypot(rx, rz))) return [];
  const square = rx * rx + rz * rz;
  if (square <= EPS * EPS) return onSegment(a, c, d) ? [0] : [];
  const t0 = ((c.x - a.x) * rx + (c.z - a.z) * rz) / square;
  const t1 = ((d.x - a.x) * rx + (d.z - a.z) * rz) / square;
  const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
  return lo <= hi + EPS ? [Math.max(0, Math.min(1, lo)), Math.max(0, Math.min(1, hi))] : [];
}

/** Reject crossings, self-touching, overlapping edges and degenerate outlines. */
export function polygonIsSimple(points) {
  if (!Array.isArray(points) || points.length < 3 || points.length > 40 || !points.every(finitePoint) || Math.abs(polygonArea(points)) <= EPS) return false;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) if (samePoint(points[i], points[j])) return false;
    const prev = points[(i + points.length - 1) % points.length], p = points[i], next = points[(i + 1) % points.length];
    if (Math.abs(cross(prev, p, next)) <= EPS && (prev.x - p.x) * (next.x - p.x) + (prev.z - p.z) * (next.z - p.z) > EPS) return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersectionParameters(...edge(points, i), ...edge(points, j)).length) return false;
    }
  }
  return true;
}

export function roomBounds(room = {}) {
  const points = getRoomOutline(room);
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  return { width: maxX - minX, depth: maxZ - minZ, minX, minZ, maxX, maxZ };
}

export function wallLength(room, index) {
  const points = getRoomOutline(room);
  if (!Number.isInteger(index) || index < 0 || index >= points.length) return 0;
  const [a, b] = edge(points, index);
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Preserve openings when contour vertices are inserted, removed or replaced.
 * Accepts either (room, outline, metadata) or (room, outline, openings, metadata).
 */
export function remapWindows(room, newOutline, openingsOrMetadata = {}, changeMetadata = {}) {
  const openings = Array.isArray(openingsOrMetadata) ? openingsOrMetadata : room.windows || [];
  const metadata = Array.isArray(openingsOrMetadata) ? changeMetadata : openingsOrMetadata;
  const old = metadata.oldOutline || getRoomOutline(room), next = normalizeRoomOutline(newOutline);
  const legacy = { back: 0, right: 1, front: 2, left: 3 };
  return openings.map(source => {
    const window = { ...source };
    const oldIndex = Number.isInteger(window.wallIndex) ? window.wallIndex : legacy[window.wall];
    if (metadata.kind === 'drag') return { ...window, wallIndex: oldIndex };
    if (!Number.isInteger(oldIndex) || oldIndex < 0 || oldIndex >= old.length || next.length < 3) return window;
    const [a, b] = edge(old, oldIndex), length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length <= EPS) return window;
    // Local edits leave most walls untouched. Their openings retain their
    // exact coordinates, even if a pre-existing opening needs validation.
    for (let index = 0; index < next.length; index++) {
      const [start, end] = edge(next, index);
      if (samePoint(a, start) && samePoint(b, end)) return { ...window, wallIndex: index };
      if (samePoint(a, end) && samePoint(b, start)) return { ...window, wallIndex: index, offset: length - window.offset - window.width };
    }
    const oldDx = (b.x - a.x) / length, oldDz = (b.z - a.z) / length;
    const center = { x: a.x + oldDx * (window.offset + window.width / 2), z: a.z + oldDz * (window.offset + window.width / 2) };
    let best;
    for (let index = 0; index < next.length; index++) {
      const [start, end] = edge(next, index), len = Math.hypot(end.x - start.x, end.z - start.z);
      if (len <= EPS) continue;
      const dx = (end.x - start.x) / len, dz = (end.z - start.z) / len;
      const projection = (center.x - start.x) * dx + (center.z - start.z) * dz;
      const clamped = Math.max(0, Math.min(len, projection));
      const distance = Math.hypot(center.x - start.x - dx * clamped, center.z - start.z - dz * clamped);
      const alignment = Math.abs(dx * oldDx + dz * oldDz);
      const score = distance + (1 - alignment) * Math.max(window.width, 200);
      if (!best || score < best.score - EPS) best = { index, projection, score };
    }
    // Leave offset/width extending past corners visible to engine validation.
    return best ? { ...window, wallIndex: best.index, offset: Math.round((best.projection - window.width / 2) * 1000) / 1000 } : window;
  });
}

/** Carcass footprint in local coordinates, with an optional rear corner notch. */
export function getCabinetFootprint(cabinet = {}) {
  const width = positiveNumber(cabinet.width, 0), depth = positiveNumber(cabinet.depth, 0);
  if (!width || !depth) return [];
  const notch = cabinet.cutout;
  if (notch && Number.isFinite(notch.width) && Number.isFinite(notch.depth) && notch.width > 0 && notch.depth > 0 && notch.width < width && notch.depth < depth) {
    const w = notch.width, d = notch.depth;
    if (notch.corner === 'back-left') return [{ x: w, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }, { x: 0, z: d }, { x: w, z: d }];
    if (notch.corner === 'back-right') return [{ x: 0, z: 0 }, { x: width - w, z: 0 }, { x: width - w, z: d }, { x: width, z: d }, { x: width, z: depth }, { x: 0, z: depth }];
  }
  return [{ x: 0, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }];
}

/** World footprint; rotation in degrees about bounding-box origin (x,z). */
export function cabinetFootprint(cabinet = {}) {
  const angle = (Number.isFinite(cabinet.rotation) ? cabinet.rotation : 0) * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle), x = Number.isFinite(cabinet.x) ? cabinet.x : 0, z = Number.isFinite(cabinet.z) ? cabinet.z : 0;
  return getCabinetFootprint(cabinet).map(p => ({ x: x + p.x * cos - p.z * sin, z: z + p.x * sin + p.z * cos }));
}

/** All edges must remain inside; checking only vertices fails in concave rooms. */
export function polygonContained(inner, outer) {
  if (!polygonIsSimple(inner) || !polygonIsSimple(outer) || !inner.every(p => pointInPolygon(p, outer))) return false;
  for (let i = 0; i < inner.length; i++) {
    const [a, b] = edge(inner, i), cuts = [0, 1];
    for (let j = 0; j < outer.length; j++) cuts.push(...intersectionParameters(a, b, ...edge(outer, j)));
    cuts.sort((x, y) => x - y);
    for (let k = 1; k < cuts.length; k++) if (cuts[k] - cuts[k - 1] > EPS && !pointInPolygon(pointAt(a, b, (cuts[k] + cuts[k - 1]) / 2), outer)) return false;
  }
  return true;
}

/** Euclidean distance to a finite wall segment, including its two endpoints. */
export function pointSegmentDistance(point, start, end) {
  if (![point, start, end].every(finitePoint)) return 0;
  const dx = end.x - start.x, dz = end.z - start.z, squared = dx * dx + dz * dz;
  const t = squared > EPS * EPS ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / squared)) : 0;
  return Math.hypot(point.x - start.x - t * dx, point.z - start.z - t * dz);
}

/** Exact minimum boundary distance; containment must be checked separately. */
export function polygonBoundaryDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3 || !a.every(finitePoint) || !b.every(finitePoint)) return 0;
  let minimum = Infinity;
  for (let index = 0; index < a.length; index++) for (let next = 0; next < b.length; next++) {
    const [p, q] = edge(a, index), [r, s] = edge(b, next);
    if (intersectionParameters(p, q, r, s).length) return 0;
    minimum = Math.min(minimum, pointSegmentDistance(p, r, s), pointSegmentDistance(q, r, s), pointSegmentDistance(r, p, q), pointSegmentDistance(s, p, q));
  }
  return minimum;
}

/** Positive-area intersection only: shared points or walls are not overlaps. */
export function polygonsOverlap(a, b) {
  if (!polygonIsSimple(a) || !polygonIsSimple(b)) return false;
  const strictInside = (p, poly) => pointInPolygon(p, poly) && !onBoundary(p, poly);
  if (a.some(p => strictInside(p, b)) || b.some(p => strictInside(p, a))) return true;
  const edgeEntersInterior = (p, q, polygon) => {
    const cuts = [0, 1];
    for (let i = 0; i < polygon.length; i++) cuts.push(...intersectionParameters(p, q, ...edge(polygon, i)));
    cuts.sort((x, y) => x - y);
    return cuts.some((t, i) => i > 0 && t - cuts[i - 1] > EPS && strictInside(pointAt(p, q, (t + cuts[i - 1]) / 2), polygon));
  };
  for (let i = 0; i < a.length; i++) {
    const [p, q] = edge(a, i);
    if (edgeEntersInterior(p, q, b)) return true;
    for (let j = 0; j < b.length; j++) {
      const [r, s] = edge(b, j), cuts = intersectionParameters(p, q, r, s);
      if (!cuts.length) continue;
      const denominator = (q.x - p.x) * (s.z - r.z) - (q.z - p.z) * (s.x - r.x);
      if (Math.abs(denominator) > EPS) {
        const t = cuts[0], hit = pointAt(p, q, t);
        if (t > EPS && t < 1 - EPS && !samePoint(hit, r) && !samePoint(hit, s)) return true;
      } else if (cuts.length === 2 && cuts[1] - cuts[0] > EPS) {
        // Coincident boundaries with the same inward side share interior area.
        const directionDot = (q.x - p.x) * (s.x - r.x) + (q.z - p.z) * (s.z - r.z);
        if (directionDot * Math.sign(polygonArea(a)) * Math.sign(polygonArea(b)) > 0) return true;
      }
    }
  }
  return b.some((p, i) => edgeEntersInterior(p, b[(i + 1) % b.length], a));
}
