/** Physical wardrobe rods. Geometry is supplied by the engine to avoid a
 * dependency cycle. Rods run along X; all coordinates are cabinet-body local. */
const EPSILON = 0.001;
const finite = (value, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function buildRodLayout(layout, { cabinetId, backThickness = 0 } = {}) {
  const result = [];
  for (const section of [...layout.sections ?? [], ...layout.internalSections ?? []]) {
    for (const rod of Array.isArray(section.node.rods) ? section.node.rods.slice(0, 12) : []) {
      if (!rod || typeof rod.id !== 'string') continue;
      const diameter = finite(rod.diameter, 25), autoLength = rod.length == null;
      const length = autoLength ? section.width - 4 : finite(rod.length);
      const x = section.x + (section.width - length) / 2;
      const y = section.y + finite(rod.y), frontInset = finite(rod.frontInset);
      const z = backThickness + section.depth - frontInset;
      result.push({ id: `${cabinetId ?? 'cabinet'}-rod-${section.id}-${rod.id}`, rodId: rod.id, cabinetId,
        sectionId: section.parentSectionId ?? section.id,
        ...(section.parentSectionId ? { interiorSectionId: section.id } : {}),
        x, y, z, length, diameter, autoLength, frontInset, axis: 'x', holders: 2,
        position: { x, y, z }, end: { x: x + length, y, z },
        opening: { id: section.id, x: section.x, y: section.y, width: section.width, height: section.height,
          depth: section.depth, rearOffset: section.rearOffset ?? 0, usableDepth: section.usableDepth ?? section.depth },
        axisHeight: finite(rod.y) });
    }
  }
  return result;
}

/** Inequalities used by resize guards, including the two 2 mm end gaps. */
export function getRodLimits(rods) {
  return rods.flatMap(rod => {
    const radius = rod.diameter / 2, prefix = `rod/${rod.sectionId}/${rod.interiorSectionId ?? ''}/${rod.rodId}`;
    const row = (suffix, axis, available, required) => ({ key: `${prefix}/${suffix}`, kind: 'rod', sectionId: rod.interiorSectionId ?? rod.sectionId, axis, available, required });
    return [row('width', 'width', rod.opening.width, rod.length + 4),
      row('lower', 'height', rod.axisHeight, radius), row('upper', 'height', rod.opening.height - rod.axisHeight, radius),
      row('front', 'depth', rod.frontInset, radius), row('rear', 'depth', rod.opening.usableDepth - rod.frontInset, radius),
      row('length', 'width', rod.length, EPSILON)];
  });
}

/** Cylinder versus occupied drawer/appliance volume; tangency is allowed. */
export function rodIntersectsBox(rod, box) {
  if (rod.x >= box.x + box.width - EPSILON || rod.x + rod.length <= box.x + EPSILON) return false;
  const dy = Math.max(box.y - rod.y, 0, rod.y - box.y - box.height);
  const dz = Math.max(box.z - rod.z, 0, rod.z - box.z - box.depth);
  return dy * dy + dz * dz < Math.max(0, rod.diameter / 2 - EPSILON) ** 2;
}

const pointInPolygon = (point, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, square = dx * dx + dy * dy;
  const t = square ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / square)) : 0;
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

function polygonIntersectsRectangle(polygon, rect) {
  let clipped = polygon;
  for (const [axis, boundary, lower] of [['x', rect.left, true], ['x', rect.right, false], ['y', rect.bottom, true], ['y', rect.top, false]]) {
    const next = [], inside = point => lower ? point[axis] >= boundary : point[axis] <= boundary;
    for (let i = 0; i < clipped.length; i++) {
      const a = clipped[i], b = clipped[(i + 1) % clipped.length], inA = inside(a), inB = inside(b);
      if (inA) next.push(a);
      if (inA !== inB) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        next.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    clipped = next;
    if (!clipped.length) return false;
  }
  const area = Math.abs(clipped.reduce((sum, a, i) => { const b = clipped[(i + 1) % clipped.length]; return sum + a.x * b.y - b.x * a.y; }, 0)) / 2;
  return area > EPSILON * EPSILON;
}

/** Uses the actual finished contour so an empty rear L notch is not a panel.
 * Cylinder cross-sections, rather than a diameter bounding box, avoid false
 * collisions near a corner of a vertical side panel. */
export function rodIntersectsPart(rod, part) {
  if (!part.position || !part.orientation) return false;
  const p = part.position, radius = rod.diameter / 2 - EPSILON;
  if (!(radius > 0)) return false;
  const width = part.finishedWidth ?? part.width, height = part.finishedHeight ?? part.height;
  const outline = part.finishedOutline ?? part.outline ?? [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  if (part.orientation === 'vertical-depth') {
    if (rod.x >= p.x + part.thickness - EPSILON || rod.x + rod.length <= p.x + EPSILON) return false;
    const center = { x: rod.z - p.z, y: rod.y - p.y };
    return pointInPolygon(center, outline) || outline.some((a, i) => distanceToSegment(center, a, outline[(i + 1) % outline.length]) < radius);
  }
  const horizontal = part.orientation === 'horizontal';
  if (!horizontal && part.orientation !== 'vertical-width') return false;
  const perpendicular = horizontal ? rod.y - p.y : rod.z - p.z;
  const distance = Math.max(-perpendicular, 0, perpendicular - part.thickness);
  if (distance >= radius) return false;
  const crossRadius = Math.sqrt(radius * radius - distance * distance);
  const center = horizontal ? rod.z - p.z : rod.y - p.y;
  return polygonIntersectsRectangle(outline, { left: rod.x - p.x, right: rod.x + rod.length - p.x, bottom: center - crossRadius, top: center + crossRadius });
}

export function rodsIntersect(a, b) {
  return a.x < b.x + b.length - EPSILON && a.x + a.length > b.x + EPSILON &&
    Math.hypot(a.y - b.y, a.z - b.z) < (a.diameter + b.diameter) / 2 - EPSILON;
}
