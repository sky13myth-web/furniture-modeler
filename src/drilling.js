/** Optional carcass butt-joint drilling. Millimetres; no hardware postprocessor. */
import { generateParts } from './engine.js';
import { polygonContained, pointInPolygon } from './room-geometry.js';
import { productionPartCode } from './production-id.js';

export const DRILLING_DEFAULTS = Object.freeze({
  enabled: false, screwDiameter: 7, screwLength: 50, clearanceDiameter: 7,
  pilotDiameter: 5, pilotExtraDepth: 2, endOffset: 50, maxSpacing: 300,
  countersinkDiameter: 10, countersinkDepth: null
});
const EPS = .002;
const round = value => Math.round(value * 1000) / 1000;
const number = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const xyz = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => xyz(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => xyz(a.x - b.x, a.y - b.y, a.z - b.z);
const scale = (p, amount) => xyz(p.x * amount, p.y * amount, p.z * amount);
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = p => Math.sqrt(dot(p, p));
const rounded = p => Object.fromEntries(Object.entries(p).map(([axis, value]) => [axis, round(value)]));
const preciseVector = p => Object.fromEntries(Object.entries(p).map(([axis, value]) => [axis, Math.round(value * 1e12) / 1e12]));
const issue = (code, message, details = {}) => ({ code, message, ...details });

export function normalizeDrillingSettings(settings = {}) {
  const result = { enabled: settings.enabled === true };
  for (const [key, value] of Object.entries(DRILLING_DEFAULTS)) {
    if (key === 'enabled') continue;
    result[key] = key === 'countersinkDepth' && (settings[key] === null || settings[key] === undefined || settings[key] === '') ? null : number(settings[key], value);
  }
  return result;
}

const LOCAL_BASES = {
  horizontal: { a: xyz(1, 0, 0), b: xyz(0, 0, 1), t: xyz(0, 1, 0) },
  'vertical-depth': { a: xyz(0, 0, 1), b: xyz(0, 1, 0), t: xyz(1, 0, 0) },
  'vertical-width': { a: xyz(1, 0, 0), b: xyz(0, 1, 0), t: xyz(0, 0, 1) }
};

function worldVector(vector, cabinet) {
  const angle = number(cabinet.rotation, 0) * Math.PI / 180, co = Math.cos(angle), si = Math.sin(angle);
  return xyz(vector.x * co - vector.z * si, vector.y, vector.x * si + vector.z * co);
}
function worldPoint(point, cabinet) {
  return add(worldVector(point, cabinet), xyz(number(cabinet.x, 0), number(cabinet.y, 0) + number(cabinet.plinth, 0), number(cabinet.z, 0)));
}

function rawOrigins(part) {
  // Edge names describe physical edges. A/B are positive cabinet axes, so a
  // vertical panel's bottom, rather than its SVG's top, defines its B origin.
  const edges = part.edges ?? {}, deductedA = Math.max(0, part.finishedWidth - part.width), deductedB = Math.max(0, part.finishedHeight - part.height);
  const originA = part.orientation === 'vertical-depth' ? number(edges.right, 0) : number(edges.left, 0);
  const originB = part.orientation === 'horizontal' ? number(edges.top, 0) : number(edges.bottom, 0);
  return { a: deductedA > EPS ? Math.min(deductedA, originA) : 0, b: deductedB > EPS ? Math.min(deductedB, originB) : 0 };
}

function descriptor(part, index, cabinet) {
  const basis = LOCAL_BASES[part.orientation];
  if (!basis || !part.position || ![part.width, part.height, part.thickness, part.finishedWidth, part.finishedHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const origin = rawOrigins(part), rawPosition = add(part.position, add(scale(basis.a, origin.a), scale(basis.b, origin.b)));
  const sourceOutline = part.orientation === 'horizontal' ? part.finishedOutline : null;
  const outline = sourceOutline ? sourceOutline.map(p => ({ x: Math.max(0, Math.min(part.width, p.x - origin.a)), z: Math.max(0, Math.min(part.height, p.y - origin.b)) }))
    : [{ x: 0, z: 0 }, { x: part.width, z: 0 }, { x: part.width, z: part.height }, { x: 0, z: part.height }];
  const result = { ...part, partCode: productionPartCode(index), rawOrigin: origin,
    drillingBasis: Object.fromEntries(Object.entries(basis).map(([axis, vector]) => [axis, preciseVector(worldVector(vector, cabinet))])),
    drillingWorldOrigin: rounded(worldPoint(rawPosition, cabinet)),
    drillingOutline: outline.map(p => ({ x: round(p.x), y: round(p.z) })) };
  return { part: result, cabinet, basis, rawPosition, outline };
}

function coordinates(desc, point) {
  const delta = sub(point, desc.rawPosition);
  return { a: dot(delta, desc.basis.a), b: dot(delta, desc.basis.b), t: dot(delta, desc.basis.t) };
}
function localDirection(desc, direction) { return { a: dot(direction, desc.basis.a), b: dot(direction, desc.basis.b), t: dot(direction, desc.basis.t) }; }

function structural(part) {
  if (!['horizontal', 'vertical-depth'].includes(part.orientation)) return false;
  if (part.component && !['bottom', 'interior-partition'].includes(part.component)) return false;
  if (part.role && !['bottom', 'interior-partition'].includes(part.role)) return false;
  if (part.orientation === 'horizontal' && part.role !== 'bottom' && !part.partitionId && part.name !== 'Крышка') return false;
  // Loose shelves intentionally have a 2 mm side gap and are not screw fixed.
  return !part.sectionId || part.role === 'bottom' || part.component === 'interior-partition' || Boolean(part.partitionId);
}

function finishedBounds(part) {
  return { x: part.position.x, y: part.position.y, z: part.position.z,
    width: part.orientation === 'vertical-depth' ? part.thickness : part.finishedWidth,
    height: part.orientation === 'horizontal' ? part.thickness : part.finishedHeight,
    depth: part.orientation === 'horizontal' ? part.finishedHeight : part.finishedWidth };
}

function contacts(horizontal, vertical) {
  const h = finishedBounds(horizontal.part), v = finishedBounds(vertical.part), result = [];
  const low = Math.max(h.z, v.z), high = Math.min(h.z + h.depth, v.z + v.depth);
  if (high - low <= EPS) return result;
  const within = (low, high, start, size) => low >= start - EPS && high <= start + size + EPS;
  if (within(h.y, h.y + h.height, v.y, v.height)) {
    const polygon = (horizontal.part.finishedOutline ?? [{ x: 0, y: 0 }, { x: h.width, y: 0 }, { x: h.width, y: h.depth }, { x: 0, y: h.depth }])
      .map(point => ({ x: h.x + point.x, z: h.z + point.y }));
    for (let index = 0; index < polygon.length; index++) {
      const first = polygon[index], second = polygon[(index + 1) % polygon.length];
      if (Math.abs(first.x - second.x) > EPS) continue;
      const segmentLow = Math.max(low, Math.min(first.z, second.z)), segmentHigh = Math.min(high, Math.max(first.z, second.z));
      if (segmentHigh - segmentLow <= EPS) continue;
      const midpoint = (segmentLow + segmentHigh) / 2;
      if (Math.abs(v.x + v.width - first.x) <= EPS && pointInPolygon({ x: first.x + .01, z: midpoint }, polygon)) result.push({ through: vertical, receiving: horizontal, direction: xyz(1, 0, 0),
        throughFace: 'face-t-min', receivingFace: 'edge-a-min', point: xyz(v.x, h.y + h.height / 2), low: segmentLow, high: segmentHigh });
      if (Math.abs(v.x - first.x) <= EPS && pointInPolygon({ x: first.x - .01, z: midpoint }, polygon)) result.push({ through: vertical, receiving: horizontal, direction: xyz(-1, 0, 0),
        throughFace: 'face-t-max', receivingFace: 'edge-a-max', point: xyz(v.x + v.width, h.y + h.height / 2), low: segmentLow, high: segmentHigh });
    }
  }
  if (within(v.x, v.x + v.width, h.x, h.width)) {
    if (Math.abs(h.y - v.y - v.height) <= EPS) result.push({ through: horizontal, receiving: vertical, direction: xyz(0, -1, 0),
      throughFace: 'face-t-max', receivingFace: 'edge-b-max', point: xyz(v.x + v.width / 2, h.y + h.height), low, high });
    if (Math.abs(h.y + h.height - v.y) <= EPS) result.push({ through: horizontal, receiving: vertical, direction: xyz(0, 1, 0),
      throughFace: 'face-t-min', receivingFace: 'edge-b-min', point: xyz(v.x + v.width / 2, h.y), low, high });
  }
  return result;
}

function rectangleInside(outline, minA, maxA, minB, maxB) {
  if (maxA - minA <= EPS || maxB - minB <= EPS) return [
    { x: minA, z: minB }, { x: maxA, z: maxB }, { x: (minA + maxA) / 2, z: (minB + maxB) / 2 }
  ].every(point => pointInPolygon(point, outline));
  return polygonContained([{ x: minA, z: minB }, { x: maxA, z: minB }, { x: maxA, z: maxB }, { x: minA, z: maxB }], outline);
}

function boreContained(desc, entry, direction, depth, radius) {
  const start = coordinates(desc, entry), d = localDirection(desc, direction), end = { a: start.a + d.a * depth, b: start.b + d.b * depth, t: start.t + d.t * depth };
  const minimum = axis => Math.min(start[axis], end[axis]) - (Math.abs(d[axis]) < .5 ? radius : 0);
  const maximum = axis => Math.max(start[axis], end[axis]) + (Math.abs(d[axis]) < .5 ? radius : 0);
  if (minimum('t') < -EPS || maximum('t') > desc.part.thickness + EPS) return false;
  return rectangleInside(desc.outline, minimum('a'), maximum('a'), minimum('b'), maximum('b'));
}

function contactEntries(contact, z) {
  const throughEntry = { ...contact.point, z }, receivingEntry = add(throughEntry, scale(contact.direction, contact.through.part.thickness));
  return { throughEntry, receivingEntry };
}

function headAccessible(contact, z, structuralParts) {
  const { throughEntry } = contactEntries(contact, z), outside = sub(throughEntry, scale(contact.direction, .01));
  return !structuralParts.some(desc => {
    if (desc.part.cabinetId !== contact.through.part.cabinetId || desc === contact.through || desc === contact.receiving) return false;
    const local = coordinates(desc, outside), a = local.a + desc.part.rawOrigin.a, b = local.b + desc.part.rawOrigin.b;
    if (local.t < -EPS || local.t > desc.part.thickness + EPS) return false;
    const polygon = desc.part.finishedOutline?.map(point => ({ x: point.x, z: point.y })) ?? [
      { x: 0, z: 0 }, { x: desc.part.finishedWidth, z: 0 }, { x: desc.part.finishedWidth, z: desc.part.finishedHeight }, { x: 0, z: desc.part.finishedHeight }
    ];
    return pointInPolygon({ x: a, z: b }, polygon);
  });
}
function contactFits(contact, z, settings, pilotDepth, radiusScale = 1) {
  const { throughEntry, receivingEntry } = contactEntries(contact, z);
  return boreContained(contact.through, throughEntry, contact.direction, contact.through.part.thickness,
    Math.max(settings.clearanceDiameter, settings.countersinkDiameter) / 2 * radiusScale)
    && boreContained(contact.receiving, receivingEntry, contact.direction, pilotDepth, Math.max(settings.pilotDiameter, settings.screwDiameter) / 2 * radiusScale);
}

function contactIntervals(contact, settings, pilotDepth, accessParts = null) {
  const cuts = [contact.low, contact.high];
  for (const desc of [contact.through, contact.receiving]) for (const point of desc.outline) {
    const position = add(desc.rawPosition, add(scale(desc.basis.a, point.x), scale(desc.basis.b, point.z)));
    if (position.z > contact.low + EPS && position.z < contact.high - EPS) cuts.push(position.z);
  }
  if (accessParts) for (const desc of accessParts.filter(desc => desc.part.cabinetId === contact.through.part.cabinetId)) {
    const polygon = desc.part.finishedOutline ?? [{ x: 0, y: 0 }, { x: desc.part.finishedWidth, y: 0 }, { x: desc.part.finishedWidth, y: desc.part.finishedHeight }, { x: 0, y: desc.part.finishedHeight }];
    for (const point of polygon) {
      const position = add(desc.part.position, add(scale(desc.basis.a, point.x), scale(desc.basis.b, point.y)));
      if (position.z > contact.low + EPS && position.z < contact.high - EPS) cuts.push(position.z);
    }
  }
  const sorted = [...new Set(cuts.map(round))].sort((a, b) => a - b), intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    const low = sorted[i - 1], high = sorted[i];
    if (!contactFits(contact, (low + high) / 2, settings, pilotDepth, 0) || (accessParts && !headAccessible(contact, (low + high) / 2, accessParts))) continue;
    const last = intervals.at(-1);
    if (last && Math.abs(last.high - low) < EPS) last.high = high;
    else intervals.push({ low, high });
  }
  return intervals;
}

// Exact finite segment distance for perpendicular and parallel bore axes.
function segmentDistance(p, q, r, s) {
  const u = sub(q, p), v = sub(s, r), w = sub(p, r), a = dot(u, u), b = dot(u, v), c = dot(v, v), d = dot(u, w), e = dot(v, w), denominator = a * c - b * b;
  let sn, sd = denominator, tn, td = denominator;
  if (denominator < 1e-9) { sn = 0; sd = 1; tn = e; td = c; }
  else { sn = b * e - c * d; tn = a * e - b * d; if (sn < 0) { sn = 0; tn = e; td = c; } else if (sn > sd) { sn = sd; tn = e + b; td = c; } }
  if (tn < 0) { tn = 0; if (-d < 0) sn = 0; else if (-d > a) sn = sd; else { sn = -d; sd = a; } }
  else if (tn > td) { tn = td; if (-d + b < 0) sn = 0; else if (-d + b > a) sn = sd; else { sn = -d + b; sd = a; } }
  const sc = Math.abs(sn) < 1e-9 ? 0 : sn / sd, tc = Math.abs(tn) < 1e-9 ? 0 : tn / td;
  return length(add(w, sub(scale(u, sc), scale(v, tc))));
}

function operations(contact, z, settings, pilotDepth, pairId) {
  const { throughEntry, receivingEntry } = contactEntries(contact, z);
  const make = (desc, entry, face, kind, diameter, depth) => {
    const local = coordinates(desc, entry), direction = localDirection(desc, contact.direction);
    return { id: '', pairId, partId: desc.part.id, partCode: desc.part.partCode, cabinetId: desc.part.cabinetId, face,
      a: round(local.a), b: round(local.b), thicknessCoordinate: round(local.t),
      worldEntry: rounded(worldPoint(entry, desc.cabinet)), direction: preciseVector(worldVector(contact.direction, desc.cabinet)),
      cabinetEntry: rounded(entry), cabinetDirection: { ...contact.direction }, localDirection: rounded(direction),
      diameter, depth: depth === null ? null : round(depth), kind, ...(depth === null ? { requiresSetup: true } : {}) };
  };
  return [make(contact.through, throughEntry, contact.throughFace, 'clearance', settings.clearanceDiameter, contact.through.part.thickness),
    make(contact.receiving, receivingEntry, contact.receivingFace, 'pilot', settings.pilotDiameter, pilotDepth),
    make(contact.through, throughEntry, contact.throughFace, 'countersink', settings.countersinkDiameter, settings.countersinkDepth)];
}

function conflicts(newHoles, existing, partThickness, screwDiameter) {
  return newHoles.some(hole => existing.some(other => {
    if (hole.partId !== other.partId || hole.pairId === other.pairId) return false;
    const a = hole.cabinetEntry, b = add(a, scale(hole.cabinetDirection, hole.depth ?? partThickness.get(hole.partId)));
    const c = other.cabinetEntry, d = add(c, scale(other.cabinetDirection, other.depth ?? partThickness.get(other.partId)));
    // Pilot bores can be separate while their wider screw threads intersect.
    // Reserve the screw envelope as well as the actual machined hole.
    const diameterA = Math.max(hole.diameter, hole.kind === 'pilot' ? screwDiameter : 0);
    const diameterB = Math.max(other.diameter, other.kind === 'pilot' ? screwDiameter : 0);
    return segmentDistance(a, b, c, d) < (diameterA + diameterB) / 2 - EPS;
  }));
}

/**
 * Automatic fixed carcass joints only. Raw A/B origins follow physical cabinet
 * axes, explicitly recorded per part; cut-only SVG views may use another mirror.
 * worldEntry/direction include cabinet room translation, elevation and rotation.
 */
export function generateDrillingPlan(project, { parts } = {}) {
  const settings = normalizeDrillingSettings(project?.settings?.drilling), warnings = [], errors = [], holes = [], joints = [];
  const source = parts ?? generateParts({ ...project, settings: { ...project?.settings, deductEdge: true } });
  const cabinets = new Map((project?.cabinets ?? []).map(cabinet => [cabinet.id, cabinet]));
  const descriptors = source.map((part, index) => descriptor(part, index, cabinets.get(part.cabinetId) ?? {}));
  const outputParts = source.map((part, index) => descriptors[index]?.part ?? { ...part, partCode: productionPartCode(index) });
  const result = { settings, parts: outputParts, holes, joints, warnings, errors, valid: true };
  if (!settings.enabled) return result;
  for (const key of ['screwDiameter', 'screwLength', 'clearanceDiameter', 'pilotDiameter', 'endOffset', 'maxSpacing', 'countersinkDiameter']) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0 || settings[key] > 10000) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: key }));
  }
  if (settings.pilotExtraDepth < 0 || settings.pilotExtraDepth > 20) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: 'pilotExtraDepth' }));
  if (settings.countersinkDepth !== null && (!Number.isFinite(settings.countersinkDepth) || settings.countersinkDepth <= 0)) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: 'countersinkDepth' }));
  if (settings.pilotDiameter >= settings.screwDiameter || settings.clearanceDiameter < settings.screwDiameter || settings.countersinkDiameter < settings.clearanceDiameter) errors.push(issue('diameter-order', 'Проверьте диаметры отверстий под выбранный винт.'));
  if (errors.length) { result.valid = false; return result; }
  warnings.push(issue('scope', 'Только неподвижные соединения корпуса. Петли, направляющие, задники, свободные полки и ящики не сверлятся автоматически.'));
  if (settings.countersinkDepth === null) warnings.push(issue('countersink-setup', 'Глубину и угол зенковки необходимо согласовать с выбранным винтом и инструментом.'));
  warnings.push(issue('workshop-values', 'Отступы, шаг и запас глубины являются редактируемыми настройками мастерской.'));
  const selected = descriptors.filter(desc => desc && structural(desc.part));
  const thicknesses = new Map(outputParts.map(part => [part.id, part.thickness]));
  let serial = 0;
  for (const horizontal of selected.filter(desc => desc.part.orientation === 'horizontal')) {
    for (const vertical of selected.filter(desc => desc.part.orientation === 'vertical-depth' && desc.part.cabinetId === horizontal.part.cabinetId)) {
      for (const contact of contacts(horizontal, vertical)) {
        const detail = { partId: contact.through.part.id, partCode: contact.through.part.partCode, receivingPartId: contact.receiving.part.id, receivingPartCode: contact.receiving.part.partCode };
        const throughThickness = contact.through.part.thickness, receiverThickness = contact.receiving.part.thickness;
        if (Math.min(throughThickness, receiverThickness) < 15 - EPS) { errors.push(issue('panel-too-thin', 'Плита тоньше 15 мм: автоматическая сверловка под конфирмат не поддерживается.', detail)); continue; }
        if (settings.screwLength <= throughThickness + EPS) { errors.push(issue('no-engagement', 'Длина винта не обеспечивает вход в соединяемую плиту.', detail)); continue; }
        if (settings.countersinkDepth !== null && settings.countersinkDepth >= throughThickness - EPS) { errors.push(issue('countersink-too-deep', 'Зенковка проходит через всю толщину плиты.', detail)); continue; }
        const pilotDepth = settings.screwLength - throughThickness + settings.pilotExtraDepth;
        const physicalIntervals = contactIntervals(contact, settings, pilotDepth);
        if (!physicalIntervals.length) { errors.push(issue('pilot-outside', 'Отверстие выходит за контур заготовки или пересекает вырез.', detail)); continue; }
        const intervals = contactIntervals(contact, settings, pilotDepth, selected);
        if (!intervals.length) {
          errors.push(issue('unsupported-cross-joint', 'Доступ к головке винта закрыт противоположной перегородкой. Такое соединение требует другого крепежа.', detail)); continue;
        }
        const jointHoles = [], pairIds = [];
        let failed = false;
        for (const interval of intervals) {
          const low = interval.low + settings.endOffset, high = interval.high - settings.endOffset;
          if (high - low < Math.max(settings.countersinkDiameter, settings.pilotDiameter) + EPS) { failed = true; errors.push(issue('joint-too-short', 'Соединение слишком короткое для двух отверстий с заданными отступами.', detail)); continue; }
          const count = Math.max(2, Math.ceil((high - low) / settings.maxSpacing) + 1);
          if (count > 200 || serial + count > 5000) { failed = true; errors.push(issue('too-many-holes', 'Слишком малый шаг сверловки.', detail)); continue; }
          const separation = Math.max(settings.countersinkDiameter, settings.pilotDiameter) + 1;
          const chosen = [];
          for (let index = 0; index < count; index++) {
            const nominal = low + (high - low) * index / (count - 1), pairId = `J${String(serial + chosen.length + 1).padStart(4, '0')}`;
            const offsets = [0];
            for (let step = 1; step <= 12; step++) offsets.push(step * separation, -step * separation);
            const position = offsets.map(offset => nominal + offset).find(z => z >= low - EPS && z <= high + EPS && contactFits(contact, z, settings, pilotDepth) && headAccessible(contact, z, selected)
              && !conflicts(operations(contact, z, settings, pilotDepth, pairId), [...holes, ...jointHoles, ...chosen.flatMap(item => item.holes)], thicknesses, settings.screwDiameter));
            if (position === undefined) { failed = true; errors.push(issue('bore-collision', 'Невозможно разместить отверстия без пересечения. Измените отступ или конструкцию соединения.', detail)); break; }
            chosen.push({ z: position, pairId, holes: operations(contact, position, settings, pilotDepth, pairId) });
          }
          const ordered = chosen.map(item => item.z).sort((a, b) => a - b);
          if (ordered.some((z, index) => index > 0 && z - ordered[index - 1] > settings.maxSpacing + EPS)) { failed = true; errors.push(issue('spacing-exceeded', 'Из-за соседних отверстий превышен заданный шаг сверловки.', detail)); }
          if (!failed) { for (const item of chosen) { pairIds.push(item.pairId); jointHoles.push(...item.holes); } serial += chosen.length; }
        }
        if (failed) continue;
        for (const hole of jointHoles) { hole.id = `H${String(holes.length + 1).padStart(5, '0')}`; holes.push(hole); }
        joints.push({ id: `C${String(joints.length + 1).padStart(4, '0')}`, ...detail, throughPartId: contact.through.part.id,
          throughFace: contact.throughFace, receivingFace: contact.receivingFace, pairIds, screwDiameter: settings.screwDiameter,
          screwLength: settings.screwLength, engagement: round(settings.screwLength - throughThickness), pilotDepth: round(pilotDepth) });
      }
    }
  }
  if (!joints.length && !errors.length) warnings.push(issue('no-joints', 'В проекте нет поддерживаемых неподвижных соединений корпуса.'));
  result.valid = errors.length === 0;
  return result;
}
