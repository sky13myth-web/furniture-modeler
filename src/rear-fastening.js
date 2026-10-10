/** Geometric rear-panel contacts. No drilling/export dependency. */
import { pointInPolygon } from './room-geometry.js';
import { isDefaultBackMaterial } from './material-defaults.js';

export const REAR_FASTENING_DEFAULTS = Object.freeze({ rearScrewDiameter: 4, rearScrewLength: 30,
  rearClearanceDiameter: 4.5, rearPilotDiameter: 2.5, rearPilotExtraDepth: 2, rearEndOffset: 50, rearMaxSpacing: 200 });
const EPS = .002;
const point = (x = 0, y = 0, z = 0) => ({ x, y, z });
const numeric = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
export function normalizeRearFasteningSettings(settings = {}) {
  return Object.fromEntries(Object.entries(REAR_FASTENING_DEFAULTS).map(([key, fallback]) => [key, numeric(settings[key], fallback)]));
}
export const isRearPanel = part => part?.orientation === 'vertical-width' && ['back', 'section-back'].includes(part.role ?? part.component);
export function classifyRearPanel(part, materials = []) {
  const material = materials.find(item => item.id === part.materialId);
  // Turkish uppercase İ decomposes to I + COMBINING DOT ABOVE. Plain
  // lowercasing leaves that combining mark and must not turn hardboard into MDF.
  const type = String(material?.type ?? '').normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').trim().replace(/[\s_-]+/g, ' ');
  const hardboard = isDefaultBackMaterial(material) || ['двп', 'древесноволокнистая плита', 'hdf', 'hardboard', 'sert lif levha', 'dvp'].includes(type);
  const thin = Math.abs(part.thickness - 3) < EPS && hardboard;
  return { method: thin ? 'nail' : 'screw', material, materialType: material?.type ?? '', thinHardboard: thin,
    materialMismatch: !material || Math.abs(Number(material.thickness) - part.thickness) > EPS };
}

function bounds(part) {
  return { ...part.position, width: part.orientation === 'vertical-depth' ? part.thickness : part.finishedWidth,
    height: part.orientation === 'horizontal' ? part.thickness : part.finishedHeight,
    depth: part.orientation === 'horizontal' ? part.finishedHeight : part.orientation === 'vertical-width' ? part.thickness : part.finishedWidth };
}
function horizontalPolygon(part) {
  const box = bounds(part);
  return (part.finishedOutline ?? [{ x: 0, y: 0 }, { x: box.width, y: 0 }, { x: box.width, y: box.depth }, { x: 0, y: box.depth }])
    .map(vertex => ({ x: box.x + vertex.x, z: box.z + vertex.y }));
}
function lapContacts(rear, structural) {
  const finished = bounds(rear.part), b = { ...finished, x: rear.rawPosition.x, y: rear.rawPosition.y, width: rear.part.width, height: rear.part.height };
  const result = [], receivingZ = b.z + b.depth;
  for (const target of structural) {
    if (target.part.cabinetId !== rear.part.cabinetId) continue;
    const p = bounds(target.part);
    if (target.part.orientation === 'vertical-depth') {
      const overlapLow = Math.max(b.x, p.x), overlapHigh = Math.min(b.x + b.width, p.x + p.width), x = (overlapLow + overlapHigh) / 2;
      const low = Math.max(b.y, p.y), high = Math.min(b.y + b.height, p.y + p.height);
      if (Math.abs(p.z - receivingZ) <= EPS && overlapHigh > overlapLow + EPS && high > low + EPS)
        result.push({ through: rear, receiving: target, direction: point(0, 0, 1), throughFace: 'face-t-min', receivingFace: 'edge-a-min',
          point: point(x, 0, b.z), stationAxis: 'y', low, high, attachment: 'lap' });
    } else if (target.part.orientation === 'horizontal') {
      const polygon = horizontalPolygon(target.part), overlapLow = Math.max(b.y, p.y), overlapHigh = Math.min(b.y + b.height, p.y + p.height), y = (overlapLow + overlapHigh) / 2;
      if (overlapHigh <= overlapLow + EPS) continue;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], c = polygon[(i + 1) % polygon.length];
        if (Math.abs(a.z - c.z) > EPS || Math.abs(a.z - receivingZ) > EPS) continue;
        const low = Math.max(b.x, Math.min(a.x, c.x)), high = Math.min(b.x + b.width, Math.max(a.x, c.x));
        if (high <= low + EPS || !pointInPolygon({ x: (low + high) / 2, z: a.z + .01 }, polygon)) continue;
        result.push({ through: rear, receiving: target, direction: point(0, 0, 1), throughFace: 'face-t-min', receivingFace: 'edge-b-min',
          point: point(0, y, b.z), stationAxis: 'x', low, high, attachment: 'lap' });
      }
    }
  }
  return result;
}
function insetContacts(rear, structural) {
  const b = bounds(rear.part), result = [], z = b.z + b.depth / 2;
  for (const target of structural) {
    if (target.part.cabinetId !== rear.part.cabinetId) continue;
    const p = bounds(target.part);
    if (target.part.orientation === 'vertical-depth') {
      const low = Math.max(b.y, p.y), high = Math.min(b.y + b.height, p.y + p.height);
      if (high <= low + EPS || z < p.z - EPS || z > p.z + p.depth + EPS) continue;
      if (Math.abs(p.x + p.width - b.x) <= EPS) result.push({ through: target, receiving: rear, direction: point(1),
        throughFace: 'face-t-min', receivingFace: 'edge-a-min', point: point(p.x, 0, z), stationAxis: 'y', low, high, attachment: 'inset' });
      if (Math.abs(p.x - b.x - b.width) <= EPS) result.push({ through: target, receiving: rear, direction: point(-1),
        throughFace: 'face-t-max', receivingFace: 'edge-a-max', point: point(p.x + p.width, 0, z), stationAxis: 'y', low, high, attachment: 'inset' });
    } else if (target.part.orientation === 'horizontal') {
      const low = Math.max(b.x, p.x), high = Math.min(b.x + b.width, p.x + p.width);
      if (high <= low + EPS) continue;
      // Bore containment later clips a shaped horizontal board to its real contour.
      if (Math.abs(p.y + p.height - b.y) <= EPS) result.push({ through: target, receiving: rear, direction: point(0, 1),
        throughFace: 'face-t-min', receivingFace: 'edge-b-min', point: point(0, p.y, z), stationAxis: 'x', low, high, attachment: 'inset' });
      if (Math.abs(p.y - b.y - b.height) <= EPS) result.push({ through: target, receiving: rear, direction: point(0, -1),
        throughFace: 'face-t-max', receivingFace: 'edge-b-max', point: point(0, p.y + p.height, z), stationAxis: 'x', low, high, attachment: 'inset' });
    }
  }
  return result;
}

/** Descriptors are supplied by the machining caller, preserving global P IDs. */
export function getRearFasteningContacts(descriptors, structuralDescriptors, materials = []) {
  const rows = [], contacts = [], warnings = [], errors = [];
  for (const rear of descriptors.filter(desc => desc && isRearPanel(desc.part))) {
    const classification = classifyRearPanel(rear.part, materials), detail = { partId: rear.part.id, partCode: rear.part.partCode, cabinetId: rear.part.cabinetId };
    const row = { ...detail, method: classification.method, quantity: 0, materialType: classification.materialType, contacts: [], omittedContacts: [], unsupported: false, issues: [] };
    rows.push(row);
    if (classification.materialMismatch) { const error = { code: 'rear-material-mismatch', message: 'Материал задника отсутствует или его толщина не соответствует детали.', ...detail }; errors.push(error); row.issues.push(error); row.unsupported = true; continue; }
    const candidates = lapContacts(rear, structuralDescriptors);
    if (!candidates.length && classification.method === 'screw') candidates.push(...insetContacts(rear, structuralDescriptors));
    if (!candidates.length) {
      const problem = { code: classification.method === 'nail' ? 'rear-nail-needs-support' : 'rear-no-contact',
        message: classification.method === 'nail' ? 'Тонкий встроенный задник требует паза или дополнительных опор для гвоздей; автоматическое крепление не задано.' : 'У задника нет поддерживаемого контакта с неподвижными плитами корпуса.', ...detail };
      (classification.method === 'nail' ? warnings : errors).push(problem); row.issues.push(problem); row.unsupported = true; row.method = 'unsupported';
      continue;
    }
    for (const contact of candidates) contacts.push({ ...contact, rearRow: row, fasteningMethod: classification.method });
  }
  return { rows, contacts, warnings, errors };
}
