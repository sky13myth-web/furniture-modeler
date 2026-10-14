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

/** Normalize any single or dual cabinet rear cutouts into a uniform array. */
export function getCabinetCutouts(cabinet) {
  if (!cabinet) return [];
  const c = cabinet.cutout;
  if (!c) return [];
  if (c.corner === 'both') {
    const lw = positiveNumber(c.leftWidth ?? c.width, 0), ld = positiveNumber(c.leftDepth ?? c.depth, 0);
    const rw = positiveNumber(c.rightWidth, 0), rd = positiveNumber(c.rightDepth, 0);
    const result = [];
    if (lw > 0 && ld > 0) result.push({ corner: 'back-left', width: lw, depth: ld });
    if (rw > 0 && rd > 0) result.push({ corner: 'back-right', width: rw, depth: rd });
    return result;
  }
  if (c.corner === 'back-left' || c.corner === 'back-right') {
    const w = positiveNumber(c.width, 0), d = positiveNumber(c.depth, 0);
    if (w > 0 && d > 0) return [{ corner: c.corner, width: w, depth: d }];
  }
  return [];
}

export function getCabinetCutout(cabinet, corner) {
  return getCabinetCutouts(cabinet).find(c => c.corner === corner) ?? null;
}

/** Carcass footprint in local coordinates, with optional rear corner notches. */
export function getCabinetFootprint(cabinet = {}) {
  const width = positiveNumber(cabinet.width, 0), depth = positiveNumber(cabinet.depth, 0);
  if (!width || !depth) return [];
  const cutouts = getCabinetCutouts(cabinet);
  const leftCut = cutouts.find(c => c.corner === 'back-left');
  const rightCut = cutouts.find(c => c.corner === 'back-right');
  const hasLeft = leftCut && leftCut.width > 0 && leftCut.depth > 0 && leftCut.width < width && leftCut.depth < depth;
  const hasRight = rightCut && rightCut.width > 0 && rightCut.depth > 0 && rightCut.width < width && rightCut.depth < depth;
  if (hasLeft && hasRight && leftCut.width + rightCut.width < width) {
    const wl = leftCut.width, dl = leftCut.depth, wr = rightCut.width, dr = rightCut.depth;
    return [
      { x: wl, z: 0 },
      { x: width - wr, z: 0 },
      { x: width - wr, z: dr },
      { x: width, z: dr },
      { x: width, z: depth },
      { x: 0, z: depth },
      { x: 0, z: dl },
      { x: wl, z: dl }
    ];
  }
  if (hasLeft) {
    const w = leftCut.width, d = leftCut.depth;
    return [{ x: w, z: 0 }, { x: width, z: 0 }, { x: width, z: depth }, { x: 0, z: depth }, { x: 0, z: d }, { x: w, z: d }];
  }
  if (hasRight) {
    const w = rightCut.width, d = rightCut.depth;
    return [{ x: 0, z: 0 }, { x: width - w, z: 0 }, { x: width - w, z: d }, { x: width, z: d }, { x: width, z: depth }, { x: 0, z: depth }];
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

const cleanZero = v => Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1000) / 1000;

/** Snap cabinet rear edge flush against the nearest wall segment within threshold. */
export function snapCabinetToWall(cabinet, room = {}, threshold = 45) {
  if (!cabinet || typeof cabinet !== 'object') return cabinet;
  const outline = Array.isArray(room) ? normalizeRoomOutline(room) : getRoomOutline(room);
  if (!Array.isArray(outline) || outline.length < 3) return { ...cabinet };
  const width = positiveNumber(cabinet.width, 0);
  const depth = positiveNumber(cabinet.depth, 0);
  if (!width || !depth) return { ...cabinet };

  const currentRot = Number.isFinite(cabinet.rotation) ? cabinet.rotation : 0;
  const rad = currentRot * Math.PI / 180;
  const bl = { x: Number.isFinite(cabinet.x) ? cabinet.x : 0, z: Number.isFinite(cabinet.z) ? cabinet.z : 0 };
  const br = { x: bl.x + width * Math.cos(rad), z: bl.z + width * Math.sin(rad) };
  const bm = { x: (bl.x + br.x) / 2, z: (bl.z + br.z) / 2 };

  let best = null;
  let minDistance = Infinity;

  for (let i = 0; i < outline.length; i++) {
    const [a, b] = edge(outline, i);
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    if (segLen <= EPS) continue;

    const dBl = pointSegmentDistance(bl, a, b);
    const dBr = pointSegmentDistance(br, a, b);
    const dBm = pointSegmentDistance(bm, a, b);
    const rearDist = Math.min(dBm, (dBl + dBr) / 2, Math.max(dBl, dBr));

    if (rearDist < minDistance) {
      minDistance = rearDist;
      best = { a, b, index: i, segLen, dBl, dBr, dBm, rearDist };
    }
  }

  if (!best) return { ...cabinet };

  const isWithin = best.dBm <= threshold || (best.dBl <= threshold && best.dBr <= threshold) || best.rearDist <= threshold;
  if (!isWithin) return { ...cabinet };

  const { a, b, segLen } = best;
  const segX = (b.x - a.x) / segLen, segZ = (b.z - a.z) / segLen;
  const isClockwise = polygonArea(outline) >= 0;
  const wallDirX = isClockwise ? segX : -segX;
  const wallDirZ = isClockwise ? segZ : -segZ;

  let targetAngle = Math.atan2(wallDirZ, wallDirX) * 180 / Math.PI;
  targetAngle = Math.round(targetAngle * 1000) / 1000;
  while (targetAngle > 180) targetAngle -= 360;
  while (targetAngle <= -180) targetAngle += 360;

  // Project back-left corner onto the wall segment
  const toBlX = bl.x - a.x, toBlZ = bl.z - a.z;
  const t = (toBlX * (b.x - a.x) + toBlZ * (b.z - a.z)) / (segLen * segLen);
  let clampedT = t;
  if (segLen >= width) {
    clampedT = isClockwise ? Math.max(0, Math.min(1 - width / segLen, t)) : Math.max(width / segLen, Math.min(1, t));
  } else {
    clampedT = Math.max(0, Math.min(1, t));
  }

  const projBl = {
    x: a.x + clampedT * (b.x - a.x),
    z: a.z + clampedT * (b.z - a.z)
  };

  const newX = projBl.x;
  const newZ = projBl.z;

  return {
    ...cabinet,
    x: cleanZero(newX),
    z: cleanZero(newZ),
    rotation: cleanZero(targetAngle)
  };
}

/** Snap cabinet flush side-to-side to an adjacent cabinet within threshold, aligning front facades. */
export function snapCabinetToNeighbour(cabinet, existingCabinets = [], options = 40) {
  if (!cabinet || typeof cabinet !== 'object' || !Array.isArray(existingCabinets) || !existingCabinets.length) {
    return { ...cabinet };
  }
  const wB = positiveNumber(cabinet.width, 0);
  const dB = positiveNumber(cabinet.depth, 0);
  if (!wB || !dB) return { ...cabinet };

  const curX = Number.isFinite(cabinet.x) ? cabinet.x : 0;
  const curZ = Number.isFinite(cabinet.z) ? cabinet.z : 0;

  const threshold = typeof options === 'number' ? options : (options && typeof options.threshold === 'number' ? options.threshold : 40);

  let best = null;
  let minDistance = threshold;

  for (const other of existingCabinets) {
    if (!other || other.id === cabinet.id || other.parentId === cabinet.id || other.parentId) continue;
    const wA = positiveNumber(other.width, 0);
    const dA = positiveNumber(other.depth, 0);
    if (!wA || !dA) continue;

    const rotA = Number.isFinite(other.rotation) ? other.rotation : 0;
    const radA = rotA * Math.PI / 180;
    const cosA = Math.cos(radA), sinA = Math.sin(radA);
    const oX = Number.isFinite(other.x) ? other.x : 0;
    const oZ = Number.isFinite(other.z) ? other.z : 0;

    // Candidate 1: Place cabinet on the RIGHT of other cabinet.
    // In other's local coordinates: x = wA, front facade aligns: z = dA - dB
    const candRightX = oX + wA * cosA - (dA - dB) * sinA;
    const candRightZ = oZ + wA * sinA + (dA - dB) * cosA;
    const distRight = Math.hypot(curX - candRightX, curZ - candRightZ);
    if (distRight <= minDistance) {
      minDistance = distRight;
      best = {
        x: cleanZero(candRightX),
        z: cleanZero(candRightZ),
        rotation: rotA
      };
    }

    // Candidate 2: Place cabinet on the LEFT of other cabinet.
    // In other's local coordinates: x = -wB, front facade aligns: z = dA - dB
    const candLeftX = oX - wB * cosA - (dA - dB) * sinA;
    const candLeftZ = oZ - wB * sinA + (dA - dB) * cosA;
    const distLeft = Math.hypot(curX - candLeftX, curZ - candLeftZ);
    if (distLeft <= minDistance) {
      minDistance = distLeft;
      best = {
        x: cleanZero(candLeftX),
        z: cleanZero(candLeftZ),
        rotation: rotA
      };
    }

    // Corner filler allowance for perpendicular L-corner junctions
    let cornerFillerWidth = 50;
    if (typeof options === 'object' && options !== null && options.cornerFillerWidth !== undefined) {
      cornerFillerWidth = positiveNumber(options.cornerFillerWidth, 0);
    } else if (other.cornerType === 'blind' || other.type === 'corner-base' || other.type === 'corner-wall' || other.type === 'corner-tall') {
      cornerFillerWidth = 0;
    }

    // Candidate 3: L-Corner on other's right side (perpendicular +90°)
    const candCornerRightX = oX + wA * cosA - (dA + cornerFillerWidth) * sinA;
    const candCornerRightZ = oZ + wA * sinA + (dA + cornerFillerWidth) * cosA;
    const distCornerRight = Math.hypot(curX - candCornerRightX, curZ - candCornerRightZ);
    if (distCornerRight <= minDistance) {
      minDistance = distCornerRight;
      best = {
        x: cleanZero(candCornerRightX),
        z: cleanZero(candCornerRightZ),
        rotation: cleanZero((rotA + 90) % 360)
      };
    }

    // Candidate 4: L-Corner on other's left side (perpendicular -90°)
    const candCornerLeftX = oX - (dA + wB + cornerFillerWidth) * sinA;
    const candCornerLeftZ = oZ + (dA + wB + cornerFillerWidth) * cosA;
    const distCornerLeft = Math.hypot(curX - candCornerLeftX, curZ - candCornerLeftZ);
    if (distCornerLeft <= minDistance) {
      minDistance = distCornerLeft;
      best = {
        x: cleanZero(candCornerLeftX),
        z: cleanZero(candCornerLeftZ),
        rotation: cleanZero((rotA - 90 + 360) % 360)
      };
    }
  }

  if (best) {
    return {
      ...cabinet,
      x: best.x,
      z: best.z,
      rotation: best.rotation
    };
  }

  return { ...cabinet };
}
