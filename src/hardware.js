/** Quantity schedule only. Hardware model, loading, drilling and compatibility
 * must be selected from the actual hinge/runner/lift manufacturer's passport. */
import { getCabinetLayout, getFrontLayout, getInternalDrawerLayout, getRodLayout } from './engine.js';
import { getRearFasteningSchedule } from './drilling.js';

/** Our editable preliminary height estimate, never a universal hardware rule.
 * Door width, mass, material and the chosen mechanism remain to be checked. */
export function defaultHingesPerDoor(height) {
  const h = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : 0;
  for (const [limit, count] of [[750, 2], [1500, 3], [2000, 4], [2400, 5], [2600, 6], [2800, 7]]) if (h <= limit) return count;
  return Math.min(12, 7 + Math.ceil((h - 2800) / 400));
}

const explicitHinges = value => Number.isInteger(value) && value >= 2 && value <= 12;
const emptyTotals = () => ({ handles: 0, guideSets: 0, hinges: 0, rods: 0, rodHolders: 0, rodLengthMeters: 0 });
const mechanism = node => node?.openingMechanism === 'push' ? 'push' : 'handle';

export function getHardwareSchedule(cabinet, project = { materials: [] }) {
  const rows = [], totals = emptyTotals(), layout = getCabinetLayout(cabinet, project);
  const add = (kind, quantity, source, metadata = {}) => {
    const field = { handle: 'handles', 'guide-set': 'guideSets', hinge: 'hinges', rod: 'rods', 'rod-holder': 'rodHolders' }[kind];
    totals[field] += quantity;
    rows.push({ id: `${cabinet.id}-hardware-${rows.length + 1}`, cabinetId: cabinet.id, cabinetName: cabinet.name,
      kind, quantity, unit: kind === 'guide-set' ? 'sets' : 'pcs', source, planned: false, ...metadata });
  };
  for (const front of getFrontLayout(cabinet, project)) {
    const node = layout.sections.find(section => section.id === front.sectionId)?.node ?? cabinet;
    const source = front.kind === 'door' ? 'door' : 'drawer';
    const metadata = { ...(front.sectionId ? { sectionId: front.sectionId } : {}), index: front.index, ...(front.opening ? { opening: front.opening } : {}) };
    if (front.openingMechanism !== 'push') add('handle', 1, source, metadata);
    if (front.kind === 'drawer') add('guide-set', 1, source, metadata);
    else {
      const override = explicitHinges(node.hingesPerDoor) ? node.hingesPerDoor : explicitHinges(cabinet.hingesPerDoor) ? cabinet.hingesPerDoor : null;
      add('hinge', override ?? defaultHingesPerDoor(front.height), source, { ...metadata, planned: override === null });
    }
  }
  for (const front of getInternalDrawerLayout(cabinet, project)) {
    const metadata = { sectionId: front.sectionId, ...(front.interiorSectionId ? { interiorSectionId: front.interiorSectionId } : {}), index: front.index };
    if (front.openingMechanism !== 'push') add('handle', 1, 'internal-drawer', metadata);
    add('guide-set', 1, 'internal-drawer', metadata);
  }
  const openings = [...layout.sections.filter(section => !section.node.interiorLayout), ...layout.internalSections];
  for (const section of openings) if (section.node.pullOutShelf) {
    const metadata = { sectionId: section.parentSectionId ?? section.id, ...(section.parentSectionId ? { interiorSectionId: section.id } : {}), index: 0 };
    if (mechanism(section.node) !== 'push') add('handle', 1, 'pull-out-shelf', metadata);
    add('guide-set', 1, 'pull-out-shelf', metadata);
  }
  for (const rod of getRodLayout(cabinet, project)) {
    const metadata = { sectionId: rod.sectionId, ...(rod.interiorSectionId ? { interiorSectionId: rod.interiorSectionId } : {}), rodId: rod.rodId, diameter: rod.diameter };
    add('rod', 1, 'wardrobe-rod', { ...metadata, length: rod.length, lengthMeters: rod.length / 1000 });
    add('rod-holder', 2, 'wardrobe-rod', metadata);
    totals.rodLengthMeters += rod.length / 1000;
  }
  return { cabinetId: cabinet.id, cabinetName: cabinet.name, rows, totals };
}

export function getProjectHardwareSchedule(project) {
  const cabinets = (project?.cabinets ?? []).map(cabinet => getHardwareSchedule(cabinet, project));
  const rear = getRearFasteningSchedule(project);
  for (const cabinet of cabinets) {
    cabinet.rearFastenings = rear.rows.filter(row => row.cabinetId === cabinet.cabinetId);
    cabinet.rearTotals = { screws: 0, nails: 0 };
    for (const row of cabinet.rearFastenings) {
      const kind = row.method === 'screw' ? 'rear-screw' : row.method === 'nail' ? 'rear-nail' : null;
      if (!kind || !row.quantity) continue;
      cabinet.rearTotals[kind === 'rear-screw' ? 'screws' : 'nails'] += row.quantity;
      cabinet.rows.push({ id: `${row.partId}-fasteners`, cabinetId: cabinet.cabinetId, cabinetName: cabinet.cabinetName,
        partId: row.partId, partCode: row.partCode, kind, quantity: row.quantity, unit: 'pcs', source: 'back-panel',
        planned: false, ...(kind === 'rear-screw' ? { diameter: row.screwDiameter, length: row.screwLength } : {}) });
    }
  }
  const totals = emptyTotals();
  for (const schedule of cabinets) for (const key of Object.keys(totals)) totals[key] += schedule.totals[key];
  return { cabinets, rows: cabinets.flatMap(schedule => schedule.rows), totals,
    rearTotals: rear.totals, rearFastenings: rear.rows, rearIssues: rear.errors,
    rearValid: rear.valid && !rear.rows.some(row=>row.unsupported) };
}
