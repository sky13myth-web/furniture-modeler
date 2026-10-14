/** Optional carcass butt-joint drilling. Millimetres; no hardware postprocessor. */
import { generateParts, getCabinetLayout, getFrontLayout, getExternalDrawerLayout, getInternalDrawerLayout } from './engine.js';
import { polygonContained, pointInPolygon } from './room-geometry.js';
import { productionPartCode } from './production-id.js';
import { REAR_FASTENING_DEFAULTS, normalizeRearFasteningSettings, getRearFasteningContacts, isRearPanel } from './rear-fastening.js';
import { defaultHingesPerDoor } from './hardware.js';

export const SYSTEM32_DEFAULTS = Object.freeze({
  system32: false,
  shelfPins: true,
  shelfPinDiameter: 5,
  shelfPinDepth: 11,
  shelfPinPitch: 32,
  shelfPinFrontSetback: 37,
  shelfPinRearSetback: 37,
  shelfPinMode: 'centered',
  shelfPinHolesPerShelf: 3,
  drawerSlides: true,
  drawerSlideDiameter: 5,
  drawerSlideDepth: 11,
  drawerSlideFrontSetback: 37,
  drawerSlidePitch: 32,
  hinges: true,
  hingeCupDiameter: 35,
  hingeCupDepth: 12.5,
  hingeCupSetback: 22,
  hingePlateDiameter: 5,
  hingePlateDepth: 11,
  hingePlateSetback: 37,
  hingePlateSpacing: 32,
  hingeEdgeOffset: 100
});

export const DRILLING_DEFAULTS = Object.freeze({
  enabled: false, screwDiameter: 7, screwLength: 50, clearanceDiameter: 7,
  pilotDiameter: 5, pilotExtraDepth: 2, endOffset: 50, maxSpacing: 300,
  countersinkDiameter: 10, countersinkDepth: null, screwsPerJoint: 'auto', measureFromFinishedEdge: false,
  crossJointFastener: 'bracket', bracketScrewDiameter: 3.5, bracketScrewLength: 16,
  bracketPilotDiameter: 3, bracketPilotDepth: 10, bracketHoles: false,
  ...REAR_FASTENING_DEFAULTS,
  ...SYSTEM32_DEFAULTS
});
const EPS = .002;
// Cut dimensions and operation coordinates are recorded to 0.001 mm, while
// panel positions retain the model precision. Only an exterior blank boundary
// may absorb half that recording step; this is not extra drilling clearance.
const RECORD_BOUNDARY_EPS = .0005 + 1e-9;
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
    if (key === 'measureFromFinishedEdge' || key === 'bracketHoles') { result[key] = settings[key] === true; continue; }
    if (key === 'system32') { result[key] = settings[key] === true; continue; }
    if (key === 'shelfPins' || key === 'drawerSlides' || key === 'hinges') {
      result[key] = settings[key] === undefined ? value : settings[key] !== false;
      continue;
    }
    if (key === 'shelfPinMode') {
      result[key] = settings[key] === 'full' ? 'full' : 'centered';
      continue;
    }
    if (key === 'crossJointFastener') {
      result[key] = settings[key] === 'error' ? 'error' : 'bracket';
      continue;
    }
    if (key === 'screwsPerJoint') {
      result[key] = settings[key] === undefined || settings[key] === 'auto' ? 'auto' : number(settings[key], settings[key]);
      continue;
    }
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

/** A display datum only. The plan's entry points, RAW blank and world axes
 * remain unchanged when a workshop chooses the assembled, banded outline. */
export function getDrillingMeasurementFrame(part, { measureFromFinishedEdge = false } = {}) {
  const finished = measureFromFinishedEdge === true;
  const origin = finished ? (part.rawOrigin ?? rawOrigins(part)) : { a: 0, b: 0 };
  const width = finished ? part.finishedWidth : part.width, height = finished ? part.finishedHeight : part.height;
  const outline = finished ? part.finishedOutline : part.drillingOutline ?? part.outline;
  return { basis: finished ? 'finished' : 'raw', width, height, thickness: part.thickness,
    offset: { a: origin.a, b: origin.b }, outline: (outline ?? [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }]).map(point => ({ x: point.x, y: point.y })) };
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

function isPartitionPart(part) {
  return !part ? false : (
    part.component === 'partition' ||
    part.component === 'interior-partition' ||
    part.role === 'partition' ||
    part.role === 'interior-partition' ||
    Boolean(part.partitionId)
  );
}

function structural(part) {
  if (!['horizontal', 'vertical-depth'].includes(part.orientation)) return false;
  if (part.component && !['bottom', 'interior-partition', 'partition', 'corner-post'].includes(part.component)) return false;
  if (part.role && !['bottom', 'interior-partition', 'partition', 'corner-post'].includes(part.role)) return false;
  if (part.orientation === 'horizontal' && part.role !== 'bottom' && !part.partitionId && part.name !== 'Крышка') return false;
  // Loose shelves intentionally have a 2 mm side gap and are not screw fixed.
  return !part.sectionId || part.role === 'bottom' || isPartitionPart(part) || part.component === 'corner-post';
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

function rectangleInside(desc, minA, maxA, minB, maxB) {
  const { outline } = desc;
  // An L contour can retain its precise exterior vertex when the bounding
  // blank dimension rounds up. Compare to that actual contour boundary;
  // snapping to the recorded width would move a valid entry outside it.
  const boundsA = [Math.min(...outline.map(point => point.x)), Math.max(...outline.map(point => point.x))];
  const boundsB = [Math.min(...outline.map(point => point.z)), Math.max(...outline.map(point => point.z))];
  const recordedBoundary = (value, [low, high]) => Math.abs(value - low) <= RECORD_BOUNDARY_EPS ? low
    : Math.abs(value - high) <= RECORD_BOUNDARY_EPS ? high : value;
  minA = recordedBoundary(minA, boundsA); maxA = recordedBoundary(maxA, boundsA);
  minB = recordedBoundary(minB, boundsB); maxB = recordedBoundary(maxB, boundsB);
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
  return rectangleInside(desc, minimum('a'), maximum('a'), minimum('b'), maximum('b'));
}

function contactEntries(contact, z) {
  const throughEntry = { ...contact.point, [contact.stationAxis ?? 'z']: z }, receivingEntry = add(throughEntry, scale(contact.direction, contact.through.part.thickness));
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
  const cuts = [contact.low, contact.high], axis = contact.stationAxis ?? 'z';
  for (const desc of [contact.through, contact.receiving]) for (const point of desc.outline) {
    const position = add(desc.rawPosition, add(scale(desc.basis.a, point.x), scale(desc.basis.b, point.z)));
    if (position[axis] > contact.low + EPS && position[axis] < contact.high - EPS) cuts.push(position[axis]);
  }
  if (accessParts) for (const desc of accessParts.filter(desc => desc.part.cabinetId === contact.through.part.cabinetId)) {
    const polygon = desc.part.finishedOutline ?? [{ x: 0, y: 0 }, { x: desc.part.finishedWidth, y: 0 }, { x: desc.part.finishedWidth, y: desc.part.finishedHeight }, { x: 0, y: desc.part.finishedHeight }];
    for (const point of polygon) {
      const position = add(desc.part.position, add(scale(desc.basis.a, point.x), scale(desc.basis.b, point.y)));
      if (position[axis] > contact.low + EPS && position[axis] < contact.high - EPS) cuts.push(position[axis]);
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
      fastenerType: contact.fasteningMethod === 'screw' ? 'rear-screw' : 'confirmat', screwDiameter: settings.screwDiameter, screwLength: settings.screwLength,
      a: round(local.a), b: round(local.b), thicknessCoordinate: round(local.t),
      worldEntry: rounded(worldPoint(entry, desc.cabinet)), direction: preciseVector(worldVector(contact.direction, desc.cabinet)),
      cabinetEntry: rounded(entry), cabinetDirection: { ...contact.direction }, localDirection: rounded(direction),
      diameter, depth: depth === null ? null : round(depth), kind, ...(depth === null ? { requiresSetup: true } : {}) };
  };
  const result = [make(contact.through, throughEntry, contact.throughFace, 'clearance', settings.clearanceDiameter, contact.through.part.thickness),
    make(contact.receiving, receivingEntry, contact.receivingFace, 'pilot', settings.pilotDiameter, pilotDepth)];
  if (contact.fasteningMethod !== 'screw') result.push(make(contact.through, throughEntry, contact.throughFace, 'countersink', settings.countersinkDiameter, settings.countersinkDepth));
  return result;
}

function conflicts(newHoles, existing, partThickness, screwDiameter) {
  return newHoles.some(hole => existing.some(other => {
    if (hole.partId !== other.partId || hole.pairId === other.pairId) return false;
    const a = hole.cabinetEntry, b = add(a, scale(hole.cabinetDirection, hole.depth ?? partThickness.get(hole.partId)));
    const c = other.cabinetEntry, d = add(c, scale(other.cabinetDirection, other.depth ?? partThickness.get(other.partId)));
    // Pilot bores can be separate while their wider screw threads intersect.
    // Reserve the screw envelope as well as the actual machined hole.
    const diameterA = Math.max(hole.diameter, hole.kind === 'pilot' ? (hole.screwDiameter ?? screwDiameter) : 0);
    const diameterB = Math.max(other.diameter, other.kind === 'pilot' ? (other.screwDiameter ?? screwDiameter) : 0);
    const isOpposingCoaxial = dot(hole.cabinetDirection, other.cabinetDirection) < -0.9 &&
      length(sub(sub(c, a), scale(hole.cabinetDirection, dot(sub(c, a), hole.cabinetDirection)))) < EPS;
    const threshold = isOpposingCoaxial ? EPS : (diameterA + diameterB) / 2 - EPS;
    return segmentDistance(a, b, c, d) < threshold;
  }));
}

function addRearFastenings(project, descriptors, selected, result, thicknesses, serial) {
  const geometric = getRearFasteningContacts(descriptors, selected, project.materials ?? []);
  result.rearFastenings.push(...geometric.rows); result.warnings.push(...geometric.warnings); result.errors.push(...geometric.errors);
  const rear = normalizeRearFasteningSettings(result.settings), accessParts = [...selected, ...descriptors.filter(desc => desc && isRearPanel(desc.part))];
  const screw = { screwDiameter: rear.rearScrewDiameter, screwLength: rear.rearScrewLength,
    clearanceDiameter: rear.rearClearanceDiameter, pilotDiameter: rear.rearPilotDiameter, pilotExtraDepth: rear.rearPilotExtraDepth,
    countersinkDiameter: rear.rearClearanceDiameter, countersinkDepth: null, endOffset: rear.rearEndOffset, maxSpacing: rear.rearMaxSpacing };
  // Nail rows identify actual supported stations, not fictional machined holes.
  const nail = { ...screw, screwDiameter: 2, clearanceDiameter: 2, pilotDiameter: 2, countersinkDiameter: 2 };
  for (const contact of geometric.contacts) {
    const row = contact.rearRow, isScrew = contact.fasteningMethod === 'screw', settings = isScrew ? screw : nail;
    if (isScrew) { row.screwDiameter = settings.screwDiameter; row.screwLength = settings.screwLength; }
    const detail = { partId: row.partId, partCode: row.partCode, cabinetId: row.cabinetId,
      throughPartId: contact.through.part.id, throughPartCode: contact.through.part.partCode,
      receivingPartId: contact.receiving.part.id, receivingPartCode: contact.receiving.part.partCode };
    const fail = (code, message) => {
      const problem = issue(code, message, detail); result.warnings.push(problem); row.issues.push(problem);
      row.omittedContacts.push({ ...detail, code, attachment: contact.attachment, stationAxis: contact.stationAxis });
    };
    const throughThickness = contact.through.part.thickness;
    if (isScrew && settings.screwLength <= throughThickness + EPS) { fail('rear-no-engagement', 'Винт задника не входит в соединяемую плиту.'); continue; }
    const pilotDepth = isScrew ? settings.screwLength - throughThickness + settings.pilotExtraDepth : 0;
    const physical = contactIntervals(contact, settings, pilotDepth);
    if (!physical.length) { fail('rear-pilot-outside', 'Отверстие задника выходит за контур соединяемой плиты или пересекает вырез.'); continue; }
    const intervals = contactIntervals(contact, settings, pilotDepth, accessParts);
    if (!intervals.length) { fail('rear-head-inaccessible', 'Доступ к головке крепежа задника закрыт другой плитой.'); continue; }
    const chosen = []; let failed = false;
    for (const interval of intervals) {
      const low = interval.low + settings.endOffset, high = interval.high - settings.endOffset;
      if (high - low < Math.max(settings.clearanceDiameter, settings.pilotDiameter) + EPS) { fail('rear-contact-too-short', 'Контакт задника слишком короткий для крепежа с заданными отступами.'); failed = true; break; }
      const count = Math.max(2, Math.ceil((high - low) / settings.maxSpacing) + 1);
      if (count > 200 || serial + count > 5000) { fail('rear-too-many-holes', 'Слишком малый шаг крепежа задника.'); failed = true; break; }
      const separation = Math.max(settings.clearanceDiameter, settings.screwDiameter) + 1;
      for (let index = 0; index < count; index++) {
        const nominal = low + (high - low) * index / (count - 1), pairId = `J${String(serial + chosen.length + 1).padStart(4, '0')}`;
        const offsets = [0]; for (let step = 1; step <= 12; step++) offsets.push(step * separation, -step * separation);
        const station = offsets.map(offset => nominal + offset).find(value => value >= low - EPS && value <= high + EPS
          && contactFits(contact, value, settings, pilotDepth) && headAccessible(contact, value, accessParts)
          && (!isScrew || !conflicts(operations(contact, value, settings, pilotDepth, pairId), [...result.holes, ...chosen.flatMap(item => item.holes)], thicknesses, settings.screwDiameter)));
        if (station === undefined) { fail('rear-bore-collision', 'Не удалось разместить крепёж задника без выхода за материал или пересечения отверстий.'); failed = true; break; }
        chosen.push({ station, pairId, holes: isScrew ? operations(contact, station, settings, pilotDepth, pairId) : [] });
      }
      if (failed) break;
    }
    const ordered = chosen.map(item => item.station).sort((a, b) => a - b);
    if (!failed && ordered.some((station, index) => index > 0 && station - ordered[index - 1] > settings.maxSpacing + EPS)) { fail('rear-spacing-exceeded', 'Из-за соседних отверстий превышен заданный шаг крепежа задника.'); failed = true; }
    if (failed) continue;
    serial += isScrew ? chosen.length : 0;
    const pairIds = isScrew ? chosen.map(item => item.pairId) : [];
    for (const hole of chosen.flatMap(item => item.holes)) { hole.id = `H${String(result.holes.length + 1).padStart(5, '0')}`; result.holes.push(hole); }
    const jointId = isScrew ? `C${String(result.joints.length + 1).padStart(4, '0')}` : `N${String(row.contacts.length + 1).padStart(4, '0')}`;
    row.contacts.push({ jointId, attachment: contact.attachment, throughPartId: contact.through.part.id, receivingPartId: contact.receiving.part.id,
      throughPartCode: contact.through.part.partCode, receivingPartCode: contact.receiving.part.partCode,
      pairIds, quantity: chosen.length, stations: chosen.map(item => round(item.station)), stationAxis: contact.stationAxis,
      direction: { ...contact.direction }, throughEntries: chosen.map(item => rounded(contactEntries(contact, item.station).throughEntry)),
      receivingEntries: chosen.map(item => rounded(contactEntries(contact, item.station).receivingEntry)) });
    row.quantity += chosen.length;
    if (isScrew) result.joints.push({ id: jointId, ...detail, fastenerType: 'rear-screw', throughFace: contact.throughFace, receivingFace: contact.receivingFace,
      pairIds, screwDiameter: settings.screwDiameter, screwLength: settings.screwLength,
      engagement: round(settings.screwLength - throughThickness), pilotDepth: round(pilotDepth) });
  }
  for (const row of geometric.rows) {
    if (row.unsupported) continue;
    const supports = new Set(row.contacts.map(contact => `${contact.throughPartId}/${contact.receivingPartId}/${contact.stationAxis}`));
    if (supports.size >= 2) continue;
    const problem = issue('rear-insufficient-support', 'У задника менее двух доступных поддерживающих контактов; нужны дополнительные опоры или другой способ крепления.', { partId: row.partId, partCode: row.partCode, cabinetId: row.cabinetId });
    (row.method === 'screw' ? result.errors : result.warnings).push(problem); row.issues.push(problem); row.unsupported = true;
  }
}

function makeSystem32Hole(desc, entry, direction, face, kind, diameter, depth, pairId, fastenerType, settings) {
  const local = coordinates(desc, entry);
  const dir = localDirection(desc, direction);
  return {
    id: '',
    pairId,
    partId: desc.part.id,
    partCode: desc.part.partCode,
    cabinetId: desc.part.cabinetId,
    face,
    fastenerType,
    type: fastenerType,
    screwDiameter: diameter,
    screwLength: depth,
    a: round(local.a),
    b: round(local.b),
    thicknessCoordinate: round(local.t),
    worldEntry: rounded(worldPoint(entry, desc.cabinet)),
    direction: preciseVector(worldVector(direction, desc.cabinet)),
    cabinetEntry: rounded(entry),
    cabinetDirection: { ...direction },
    localDirection: rounded(dir),
    diameter,
    depth: round(depth),
    kind,
    system32: true
  };
}

export function generateSystem32Matrix(descriptors, outputParts, project, settings, result, thicknesses) {
  const cabinets = new Map((project?.cabinets ?? []).map(cabinet => [cabinet.id, cabinet]));
  const holes = result.holes;
  
  for (const [cabinetId, cabinet] of cabinets) {
    const layout = getCabinetLayout(cabinet, project);
    const cabParts = descriptors.filter(d => d && d.part.cabinetId === cabinetId);
    const sidePanels = cabParts.filter(d => d.part.orientation === 'vertical-depth');
    const backThick = number(cabinet.backThickness, 3);
    
    // --- 1. SHELF PINS ---
    if (settings.shelfPins !== false) {
      const looseShelves = outputParts.filter(p => p.cabinetId === cabinetId && p.role === 'shelf');
      
      const tryAddShelfPin = (panelDesc, entry, direction, face, pairId) => {
        const isPartition = isPartitionPart(panelDesc.part);
        const maxDepth = isPartition ? Math.min(8, Math.floor((panelDesc.part.thickness - 2) / 2)) : panelDesc.part.thickness - 2;
        const depth = Math.min(settings.shelfPinDepth, maxDepth);
        const radius = settings.shelfPinDiameter / 2;
        if (!boreContained(panelDesc, entry, direction, depth, radius)) return;
        const hole = makeSystem32Hole(panelDesc, entry, direction, face, 'shelf-pin', settings.shelfPinDiameter, depth, pairId, 'shelf-pin-system32', settings);
        if (conflicts([hole], holes, thicknesses, settings.shelfPinDiameter)) return;
        hole.id = `H${String(holes.length + 1).padStart(5, '0')}`;
        holes.push(hole);
      };
      
      if (settings.shelfPinMode === 'full') {
        for (const section of layout.sections) {
          const leftPanel = sidePanels.find(d => Math.abs((d.part.position.x + d.part.thickness) - section.x) < 2);
          const rightPanel = sidePanels.find(d => Math.abs(d.part.position.x - (section.x + section.width)) < 2);
          if (!leftPanel && !rightPanel) continue;
          
          const yMin = section.y + 64;
          const yMax = section.y + section.height - 64;
          const pairId = `S32-SHLF-${cabinetId}-${section.id}`;
          
          for (let y = yMin; y <= yMax + EPS; y += settings.shelfPinPitch) {
            if (leftPanel) {
              const zFront = leftPanel.part.position.z + leftPanel.part.finishedWidth - settings.shelfPinFrontSetback;
              const zRear = leftPanel.part.position.z + backThick + settings.shelfPinRearSetback;
              const xEntry = leftPanel.part.position.x + leftPanel.part.thickness;
              tryAddShelfPin(leftPanel, xyz(xEntry, y, zFront), xyz(-1, 0, 0), 'face-t-max', pairId);
              tryAddShelfPin(leftPanel, xyz(xEntry, y, zRear), xyz(-1, 0, 0), 'face-t-max', pairId);
            }
            if (rightPanel) {
              const zFront = rightPanel.part.position.z + rightPanel.part.finishedWidth - settings.shelfPinFrontSetback;
              const zRear = rightPanel.part.position.z + backThick + settings.shelfPinRearSetback;
              const xEntry = rightPanel.part.position.x;
              tryAddShelfPin(rightPanel, xyz(xEntry, y, zFront), xyz(1, 0, 0), 'face-t-min', pairId);
              tryAddShelfPin(rightPanel, xyz(xEntry, y, zRear), xyz(1, 0, 0), 'face-t-min', pairId);
            }
          }
        }
      } else {
        const holesPerShelf = settings.shelfPinHolesPerShelf === 5 ? 5 : 3;
        const offsets = holesPerShelf === 5 ? [-64, -32, 0, 32, 64] : [-32, 0, 32];
        
        looseShelves.forEach((shelf, sIdx) => {
          const section = layout.sections.find(s => s.id === shelf.sectionId) ?? layout.sections[0];
          if (!section) return;
          const leftPanel = sidePanels.find(d => Math.abs((d.part.position.x + d.part.thickness) - section.x) < 2);
          const rightPanel = sidePanels.find(d => Math.abs(d.part.position.x - (section.x + section.width)) < 2);
          if (!leftPanel && !rightPanel) return;
          
          const shelfNominalY = shelf.position.y;
          const pairId = `S32-SHLF-${cabinetId}-${sIdx + 1}`;
          
          for (const dy of offsets) {
            const y = shelfNominalY + dy;
            if (y < section.y + 10 || y > section.y + section.height - 10) continue;
            if (leftPanel) {
              const zFront = leftPanel.part.position.z + leftPanel.part.finishedWidth - settings.shelfPinFrontSetback;
              const zRear = leftPanel.part.position.z + backThick + settings.shelfPinRearSetback;
              const xEntry = leftPanel.part.position.x + leftPanel.part.thickness;
              tryAddShelfPin(leftPanel, xyz(xEntry, y, zFront), xyz(-1, 0, 0), 'face-t-max', pairId);
              tryAddShelfPin(leftPanel, xyz(xEntry, y, zRear), xyz(-1, 0, 0), 'face-t-max', pairId);
            }
            if (rightPanel) {
              const zFront = rightPanel.part.position.z + rightPanel.part.finishedWidth - settings.shelfPinFrontSetback;
              const zRear = rightPanel.part.position.z + backThick + settings.shelfPinRearSetback;
              const xEntry = rightPanel.part.position.x;
              tryAddShelfPin(rightPanel, xyz(xEntry, y, zFront), xyz(1, 0, 0), 'face-t-min', pairId);
              tryAddShelfPin(rightPanel, xyz(xEntry, y, zRear), xyz(1, 0, 0), 'face-t-min', pairId);
            }
          }
        });
      }
    }
    
    // --- 2. DRAWER RUNNERS ---
    if (settings.drawerSlides !== false) {
      const extDrawers = getExternalDrawerLayout(cabinet, project);
      const intDrawers = getInternalDrawerLayout(cabinet, project);
      const allDrawers = [...extDrawers, ...intDrawers];
      
      allDrawers.forEach((drawer, dIdx) => {
        const section = layout.sections.find(s => s.id === drawer.sectionId) ?? layout.sections[0];
        if (!section) return;
        const leftPanel = sidePanels.find(d => Math.abs((d.part.position.x + d.part.thickness) - section.x) < 2);
        const rightPanel = sidePanels.find(d => Math.abs(d.part.position.x - (section.x + section.width)) < 2);
        if (!leftPanel && !rightPanel) return;
        
        const yRunner = drawer.box.y + 16;
        const runnerL = drawer.runnerLength || 450;
        const pairId = `S32-RUNNER-${cabinetId}-${dIdx + 1}`;
        
        const zDistances = [
          settings.drawerSlideFrontSetback,
          settings.drawerSlideFrontSetback + (runnerL >= 350 ? 128 : 96),
          settings.drawerSlideFrontSetback + Math.floor((runnerL - 50) / settings.drawerSlidePitch) * settings.drawerSlidePitch
        ];
        
        const tryAddSlideHole = (panelDesc, zDist, dir, face, xEntry) => {
          const zPos = panelDesc.part.position.z + panelDesc.part.finishedWidth - zDist;
          const entry = xyz(xEntry, yRunner, zPos);
          const isPartition = isPartitionPart(panelDesc.part);
          const maxDepth = isPartition ? Math.min(8, Math.floor((panelDesc.part.thickness - 2) / 2)) : panelDesc.part.thickness - 2;
          const depth = Math.min(settings.drawerSlideDepth, maxDepth);
          const radius = settings.drawerSlideDiameter / 2;
          if (!boreContained(panelDesc, entry, dir, depth, radius)) return;
          const hole = makeSystem32Hole(panelDesc, entry, dir, face, 'runner-mount', settings.drawerSlideDiameter, depth, pairId, 'drawer-slide-system32', settings);
          if (conflicts([hole], holes, thicknesses, settings.drawerSlideDiameter)) return;
          hole.id = `H${String(holes.length + 1).padStart(5, '0')}`;
          holes.push(hole);
        };
        
        for (const zDist of zDistances) {
          if (leftPanel) {
            const xEntry = leftPanel.part.position.x + leftPanel.part.thickness;
            tryAddSlideHole(leftPanel, zDist, xyz(-1, 0, 0), 'face-t-max', xEntry);
          }
          if (rightPanel) {
            const xEntry = rightPanel.part.position.x;
            tryAddSlideHole(rightPanel, zDist, xyz(1, 0, 0), 'face-t-min', xEntry);
          }
        }
      });
    }
    
    // --- 3. HINGES (DOOR CUPS & CARCASS MOUNTING PLATES) ---
    if (settings.hinges !== false) {
      const fronts = getFrontLayout(cabinet, project);
      const doors = fronts.filter(f => f.kind === 'door');
      const doorDescs = cabParts.filter(d => d.part.orientation === 'vertical-width' && (d.part.role === 'door' || /Дверь/i.test(d.part.name)));
      
      doors.forEach((door, doorIndex) => {
        const doorDesc = doorDescs.find(d => Math.abs(d.part.position.x - door.x) < 2) ?? doorDescs[doorIndex];
        if (!doorDesc) return;
        
        const opening = door.opening || (doorIndex % 2 === 1 ? 'right' : 'left');
        const hingeCount = (cabinet.hingesPerDoor && Number.isInteger(cabinet.hingesPerDoor) && cabinet.hingesPerDoor >= 2) ? cabinet.hingesPerDoor : defaultHingesPerDoor(door.height);
        
        let adjacentPanel = null;
        let plateDirection = null;
        let plateFace = null;
        let plateX = null;
        
        if (opening === 'left') {
          adjacentPanel = sidePanels.find(d => Math.abs((d.part.position.x + d.part.thickness) - door.x) <= Math.max(12, d.part.thickness) || (door.x <= d.part.thickness + 5 && d.part.position.x < 1));
          if (adjacentPanel) {
            plateDirection = xyz(-1, 0, 0);
            plateFace = 'face-t-max';
            plateX = adjacentPanel.part.position.x + adjacentPanel.part.thickness;
          }
        } else if (opening === 'right') {
          const doorRight = door.x + door.width;
          adjacentPanel = sidePanels.find(d => Math.abs(d.part.position.x - doorRight) <= Math.max(12, d.part.thickness) || (doorRight >= cabinet.width - d.part.thickness - 5 && d.part.position.x >= cabinet.width - d.part.thickness - 1));
          if (adjacentPanel) {
            plateDirection = xyz(1, 0, 0);
            plateFace = 'face-t-min';
            plateX = adjacentPanel.part.position.x;
          }
        }
        
        const hOffset = Math.min(settings.hingeEdgeOffset || 100, Math.floor(door.height / 3));
        const bBottom = hOffset;
        const bTop = door.height - hOffset;
        
        for (let hIdx = 0; hIdx < hingeCount; hIdx++) {
          const b = hingeCount === 1 ? door.height / 2 : bBottom + (bTop - bBottom) * hIdx / (hingeCount - 1);
          const hingePairId = `HNG-${cabinetId}-${doorIndex + 1}-${hIdx + 1}`;
          
          // 3A. Door hinge cup (35mm)
          let aCup = settings.hingeCupSetback;
          if (opening === 'right') aCup = doorDesc.part.finishedWidth - settings.hingeCupSetback;
          const entryCup = xyz(doorDesc.part.position.x + aCup, doorDesc.part.position.y + b, doorDesc.part.position.z);
          const depthCup = Math.min(settings.hingeCupDepth, doorDesc.part.thickness - 2);
          const radiusCup = settings.hingeCupDiameter / 2;
          
          if (boreContained(doorDesc, entryCup, xyz(0, 0, 1), depthCup, radiusCup)) {
            const cupHole = makeSystem32Hole(doorDesc, entryCup, xyz(0, 0, 1), 'face-t-min', 'hinge-cup', settings.hingeCupDiameter, depthCup, hingePairId, 'hinge-cup-35mm', settings);
            if (!conflicts([cupHole], holes, thicknesses, settings.hingeCupDiameter)) {
              cupHole.id = `H${String(holes.length + 1).padStart(5, '0')}`;
              holes.push(cupHole);
            }
          }
          
          // 3B. Carcass mounting plate (2x 5mm holes at 32mm vertical spacing)
          if (adjacentPanel && plateDirection && plateFace) {
            const zPlate = adjacentPanel.part.position.z + adjacentPanel.part.finishedWidth - settings.hingePlateSetback;
            const yCenter = door.y + b;
            const isPartition = isPartitionPart(adjacentPanel.part);
            const maxPlateDepth = isPartition ? Math.min(8, Math.floor((adjacentPanel.part.thickness - 2) / 2)) : (adjacentPanel.part.thickness < 20 ? 9 : adjacentPanel.part.thickness - 2);
            const plateDepth = Math.min(settings.hingePlateDepth, maxPlateDepth);
            const plateRadius = settings.hingePlateDiameter / 2;
            
            for (const dy of [-settings.hingePlateSpacing / 2, settings.hingePlateSpacing / 2]) {
              const entryPlate = xyz(plateX, yCenter + dy, zPlate);
              if (boreContained(adjacentPanel, entryPlate, plateDirection, plateDepth, plateRadius)) {
                const plateHole = makeSystem32Hole(adjacentPanel, entryPlate, plateDirection, plateFace, 'hinge-plate', settings.hingePlateDiameter, plateDepth, hingePairId, 'hinge-plate-system32', settings);
                if (!conflicts([plateHole], holes, thicknesses, settings.hingePlateDiameter)) {
                  plateHole.id = `H${String(holes.length + 1).padStart(5, '0')}`;
                  holes.push(plateHole);
                }
              }
            }
          }
        }
      });
    }
  }
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
  const result = { settings, parts: outputParts, holes, joints, rearFastenings: [], warnings, errors, valid: true };
  if (!settings.enabled) return result;
  if (settings.screwsPerJoint !== 'auto' && settings.screwsPerJoint !== 2) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: 'screwsPerJoint' }));
  for (const key of ['screwDiameter', 'screwLength', 'clearanceDiameter', 'pilotDiameter', 'endOffset', 'maxSpacing', 'countersinkDiameter']) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0 || settings[key] > 10000) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: key }));
  }
  if (settings.pilotExtraDepth < 0 || settings.pilotExtraDepth > 20) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: 'pilotExtraDepth' }));
  if (settings.countersinkDepth !== null && (!Number.isFinite(settings.countersinkDepth) || settings.countersinkDepth <= 0)) errors.push(issue('invalid-setting', 'Недопустимый параметр сверловки.', { field: 'countersinkDepth' }));
  if (settings.pilotDiameter >= settings.screwDiameter || settings.clearanceDiameter < settings.screwDiameter || settings.countersinkDiameter < settings.clearanceDiameter) errors.push(issue('diameter-order', 'Проверьте диаметры отверстий под выбранный винт.'));
  const coreSettingsValid = errors.length === 0;
  for (const key of Object.keys(REAR_FASTENING_DEFAULTS).filter(key => key !== 'rearPilotExtraDepth')) {
    if (!Number.isFinite(settings[key]) || settings[key] <= 0 || settings[key] > 10000) errors.push(issue('invalid-setting', 'Недопустимый параметр крепления задника.', { field: key }));
  }
  if (settings.rearPilotExtraDepth < 0 || settings.rearPilotExtraDepth > 20) errors.push(issue('invalid-setting', 'Недопустимый запас глубины отверстия задника.', { field: 'rearPilotExtraDepth' }));
  if (settings.rearPilotDiameter >= settings.rearScrewDiameter || settings.rearClearanceDiameter < settings.rearScrewDiameter) errors.push(issue('rear-diameter-order', 'Проверьте диаметры отверстий под винт задника.'));
  const rearSettingsValid = !errors.some(error => error.code.startsWith('rear-') || String(error.field ?? '').startsWith('rear'));
  if (!coreSettingsValid && !rearSettingsValid) { result.valid = false; return result; }
  warnings.push(issue('scope', 'Неподвижные соединения корпуса и поддерживаемые задники. Петли, направляющие, свободные полки и ящики не сверлятся автоматически.'));
  if (settings.countersinkDepth === null) warnings.push(issue('countersink-setup', 'Глубину и угол зенковки необходимо согласовать с выбранным винтом и инструментом.'));
  warnings.push(issue('workshop-values', 'Отступы, шаг и запас глубины являются редактируемыми настройками мастерской.'));
  const selected = descriptors.filter(desc => desc && structural(desc.part));
  const thicknesses = new Map(outputParts.map(part => [part.id, part.thickness]));
  let serial = 0;
  if (coreSettingsValid) for (const horizontal of selected.filter(desc => desc.part.orientation === 'horizontal')) {
    for (const vertical of selected.filter(desc => desc.part.orientation === 'vertical-depth' && desc.part.cabinetId === horizontal.part.cabinetId)) {
      for (const contact of contacts(horizontal, vertical)) {
        const detail = { cabinetId: contact.through.part.cabinetId, partId: contact.through.part.id, partCode: contact.through.part.partCode, receivingPartId: contact.receiving.part.id, receivingPartCode: contact.receiving.part.partCode };
        const throughThickness = contact.through.part.thickness, receiverThickness = contact.receiving.part.thickness;
        if (Math.min(throughThickness, receiverThickness) < 15 - EPS) { errors.push(issue('panel-too-thin', 'Плита тоньше 15 мм: автоматическая сверловка под конфирмат не поддерживается.', detail)); continue; }
        if (settings.screwLength <= throughThickness + EPS) { errors.push(issue('no-engagement', 'Длина винта не обеспечивает вход в соединяемую плиту.', detail)); continue; }
        if (settings.countersinkDepth !== null && settings.countersinkDepth >= throughThickness - EPS) { errors.push(issue('countersink-too-deep', 'Зенковка проходит через всю толщину плиты.', detail)); continue; }
        const pilotDepth = settings.screwLength - throughThickness + settings.pilotExtraDepth;
        const physicalIntervals = contactIntervals(contact, settings, pilotDepth);
        if (!physicalIntervals.length) { errors.push(issue('pilot-outside', 'Отверстие выходит за контур заготовки или пересекает вырез.', detail)); continue; }
        const intervals = contactIntervals(contact, settings, pilotDepth, selected);
        if (!intervals.length) {
          if (settings.crossJointFastener === 'error') {
            errors.push(issue('unsupported-cross-joint', 'Доступ к головке винта закрыт противоположной перегородкой. Такое соединение требует другого крепежа.', detail));
            continue;
          }
          const safeRanges = physicalIntervals.filter(interval => interval.high - interval.low >= 2 * settings.endOffset);
          const placementIntervals = settings.screwsPerJoint === 2 && safeRanges.length
            ? [{ low: safeRanges[0].low, high: safeRanges.at(-1).high }]
            : settings.screwsPerJoint === 2 ? physicalIntervals.slice(0, 1) : physicalIntervals;
          const chosen = [];
          for (const interval of placementIntervals) {
            const low = interval.low + settings.endOffset, high = interval.high - settings.endOffset;
            if (high - low < EPS) {
              chosen.push(round((interval.low + interval.high) / 2));
            } else {
              const count = settings.screwsPerJoint === 2 ? 2 : Math.max(2, Math.ceil((high - low) / settings.maxSpacing) + 1);
              for (let index = 0; index < count; index++) {
                chosen.push(round(count === 1 ? (low + high) / 2 : low + (high - low) * index / (count - 1)));
              }
            }
          }
          const bracketJointId = `B${String(joints.length + 1).padStart(4, '0')}`;
          joints.push({
            id: bracketJointId,
            ...detail,
            fastenerType: 'bracket',
            name: 'Уголок мебельный специальный',
            quantity: chosen.length,
            pairIds: [],
            throughPartId: contact.through.part.id,
            receivingPartId: contact.receiving.part.id,
            throughFace: contact.throughFace,
            receivingFace: contact.receivingFace,
            positions: chosen,
            stationAxis: contact.stationAxis ?? 'z',
            screwDiameter: settings.bracketScrewDiameter,
            screwLength: settings.bracketScrewLength
          });
          warnings.push(issue('cross-joint-bracket', 'Стык перегородок закреплён специальным мебельным уголком.', detail));
          continue;
        }
        const jointHoles = [], pairIds = [];
        let failed = false;
        // Explicit two-screw mode spans the usable ranges of one physical
        // joint. It never puts two screws in every separate accessible range.
        const safeRanges = intervals.filter(interval => interval.high - interval.low >= 2 * settings.endOffset);
        const placementIntervals = settings.screwsPerJoint === 2 && safeRanges.length
          ? [{ low: safeRanges[0].low, high: safeRanges.at(-1).high }]
          : settings.screwsPerJoint === 2 ? intervals.slice(0, 1) : intervals;
        for (const interval of placementIntervals) {
          const low = interval.low + settings.endOffset, high = interval.high - settings.endOffset;
          if (high - low < Math.max(settings.countersinkDiameter, settings.pilotDiameter) + EPS) { failed = true; errors.push(issue('joint-too-short', 'Соединение слишком короткое для двух отверстий с заданными отступами.', detail)); continue; }
          const count = settings.screwsPerJoint === 2 ? 2 : Math.max(2, Math.ceil((high - low) / settings.maxSpacing) + 1);
          if (count > 200 || serial + count > 5000) { failed = true; errors.push(issue('too-many-holes', 'Слишком малый шаг сверловки.', detail)); continue; }
          const separation = Math.max(settings.countersinkDiameter, settings.pilotDiameter) + 1;
          const chosen = [];
          for (let index = 0; index < count; index++) {
            const nominal = low + (high - low) * index / (count - 1), pairId = `J${String(serial + chosen.length + 1).padStart(4, '0')}`;
            const offsets = [0];
            for (let step = 1; step <= 12; step++) offsets.push(step * separation, -step * separation);
            const position = offsets.map(offset => nominal + offset).find(z => z >= low - EPS && z <= high + EPS && contactFits(contact, z, settings, pilotDepth) && headAccessible(contact, z, selected)
              && (settings.screwsPerJoint !== 2 || safeRanges.some(range => z >= range.low + settings.endOffset - EPS && z <= range.high - settings.endOffset + EPS))
              && !conflicts(operations(contact, z, settings, pilotDepth, pairId), [...holes, ...jointHoles, ...chosen.flatMap(item => item.holes)], thicknesses, settings.screwDiameter));
            if (position === undefined) { failed = true; errors.push(issue('bore-collision', 'Невозможно разместить отверстия без пересечения. Измените отступ или конструкцию соединения.', detail)); break; }
            chosen.push({ z: position, pairId, holes: operations(contact, position, settings, pilotDepth, pairId) });
          }
          const ordered = chosen.map(item => item.z).sort((a, b) => a - b);
          if (settings.screwsPerJoint === 'auto' && ordered.some((z, index) => index > 0 && z - ordered[index - 1] > settings.maxSpacing + EPS)) { failed = true; errors.push(issue('spacing-exceeded', 'Из-за соседних отверстий превышен заданный шаг сверловки.', detail)); }
          if (!failed) { for (const item of chosen) { pairIds.push(item.pairId); jointHoles.push(...item.holes); } serial += chosen.length; }
        }
        if (failed) continue;
        for (const hole of jointHoles) { hole.id = `H${String(holes.length + 1).padStart(5, '0')}`; holes.push(hole); }
        joints.push({ id: `C${String(joints.length + 1).padStart(4, '0')}`, ...detail, fastenerType: 'confirmat', throughPartId: contact.through.part.id,
          throughFace: contact.throughFace, receivingFace: contact.receivingFace, pairIds, screwDiameter: settings.screwDiameter,
          screwLength: settings.screwLength, engagement: round(settings.screwLength - throughThickness), pilotDepth: round(pilotDepth) });
      }
    }
  }

  if (rearSettingsValid) addRearFastenings(project, descriptors, selected, result, thicknesses, serial);
  if (settings.system32 === true) {
    generateSystem32Matrix(descriptors, outputParts, project, settings, result, thicknesses);
  }
  if (!joints.length && !errors.length && !result.holes.length) warnings.push(issue('no-joints', 'В проекте нет поддерживаемых неподвижных соединений корпуса.'));
  result.valid = errors.length === 0;
  return result;
}

/** One project-wide machining pass gives the hardware estimate the same safe stations. */
export function getRearFasteningSchedule(project, options = {}) {
  const plan = generateDrillingPlan({ ...project, settings: { ...project.settings, drilling: { ...project.settings?.drilling, enabled: true } } }, options);
  const errors = plan.errors.filter(error => error.code.startsWith('rear-') || String(error.field ?? '').startsWith('rear'));
  const bracketJoints = plan.joints.filter(joint => joint.fastenerType === 'bracket');
  const bracketCount = bracketJoints.reduce((sum, joint) => sum + (joint.quantity ?? 2), 0);
  const confirmatJoints = plan.joints.filter(joint => joint.fastenerType === 'confirmat');
  return { rows: plan.rearFastenings, rearFastenings: plan.rearFastenings, bracketJoints, confirmatJoints,
    totals: { screws: plan.rearFastenings.filter(row => row.method === 'screw').reduce((sum, row) => sum + row.quantity, 0),
      nails: plan.rearFastenings.filter(row => row.method === 'nail').reduce((sum, row) => sum + row.quantity, 0),
      brackets: bracketCount },
    errors, allErrors: plan.errors, warnings: plan.warnings, valid: errors.length === 0, planValid: plan.valid };
}
