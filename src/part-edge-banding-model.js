/** Cabinet-local, structural edge-band identities. No engine or UI dependency. */
export const PART_EDGE_NAMES = Object.freeze(['top', 'bottom', 'left', 'right']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** A display sequence/production code, dimensions and placement are never an identity.
 * Split boundaries use their neighbours; copied cabinets retain these local IDs. */
export function getPartEdgeBandKey(part) {
  const role = part.component ?? part.role ?? 'panel';
  let feature = String(part.name ?? '').split(' · ').at(-1);
  if (part.partitionId) feature = 'partition';
  if (part.braceId) feature = `brace-${part.bandingSegment ?? 'main'}`;
  if (['back', 'section-back'].includes(role)) feature = `back-${part.bandingSegment ?? 'main'}`;
  if (['bottom', 'plinth'].includes(role)) feature = role;
  return `EB1:${JSON.stringify([
    part.orientation, role, part.sectionId ?? '', part.interiorSectionId ?? '',
    part.partitionParentId ?? '', part.partitionBeforeChildId ?? '', part.partitionAfterChildId ?? '',
    part.braceId ?? '', feature,
    part.drawerIndex ?? part.bandingDrawerIndex ?? part.internalDrawerIndex ?? null,
    part.bandingSectionIds ?? [], part.bandingBoundaryIds ?? []
  ])}`;
}

export function validatePartEdgeBandPatch(value, { complete = false } = {}) {
  if (!record(value) || Object.keys(value).length === 0 || Object.keys(value).some(key => !PART_EDGE_NAMES.includes(key)) || complete && PART_EDGE_NAMES.some(edge => !Object.hasOwn(value, edge))) {
    throw new Error('Кромки детали: ожидаются края top, bottom, left, right.');
  }
  for (const edge of Object.keys(value)) if (typeof value[edge] !== 'number' || !Number.isFinite(value[edge]) || value[edge] < 0 || value[edge] > 3) {
    throw new Error('Кромка детали: толщина должна быть числом от 0 до 3 мм.');
  }
  return value;
}

/** Strict, bounded file schema, also reused before committing a manual edit. */
export function validatePartEdgeBandingOverrides(value) {
  if (value === undefined) return;
  if (!record(value) || Object.keys(value).length > 4096) throw new Error('Кромки деталей: неверная таблица настроек.');
  for (const [key, edges] of Object.entries(value)) {
    let identity;
    try { if (!key.startsWith('EB1:') || key.length > 24000) throw Error(); identity = JSON.parse(key.slice(4)); } catch { throw new Error('Кромки деталей: неверный идентификатор детали.'); }
    const string = item => typeof item === 'string' && item.length <= 4000;
    if (!Array.isArray(identity) || identity.length !== 12 || !['horizontal', 'vertical-depth', 'vertical-width'].includes(identity[0]) || !identity.slice(1, 9).every(string) || !(identity[9] === null || Number.isInteger(identity[9]) && identity[9] >= 0 && identity[9] <= 40) || !identity.slice(10).every(items => Array.isArray(items) && items.length <= 80 && items.every(string))) {
      throw new Error('Кромки деталей: неверный идентификатор детали.');
    }
    validatePartEdgeBandPatch(edges, { complete: true });
  }
}

export function applyPartEdgeBanding(part, cabinet) {
  part.edgeBandKey = getPartEdgeBandKey(part);
  part.defaultEdges = { ...part.edges };
  const overrides = cabinet.partEdgeBanding;
  if (overrides && Object.hasOwn(overrides, part.edgeBandKey)) {
    const edges = overrides[part.edgeBandKey];
    validatePartEdgeBandPatch(edges, { complete: true });
    part.edges = { ...edges };
  }
}
