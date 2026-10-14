/** Quantity schedule only. Hardware model, loading, drilling and compatibility
 * must be selected from the actual hinge/runner/lift manufacturer's passport. */
import { getCabinetLayout, getFrontLayout, getInternalDrawerLayout, getRodLayout } from './engine.js';
import { getRearFasteningSchedule, generateDrillingPlan } from './drilling.js';

/** Our editable preliminary height estimate, never a universal hardware rule.
 * Door width, mass, material and the chosen mechanism remain to be checked. */
export function defaultHingesPerDoor(height) {
  const h = Number.isFinite(Number(height)) ? Math.max(0, Number(height)) : 0;
  for (const [limit, count] of [[750, 2], [1500, 3], [2000, 4], [2400, 5], [2600, 6], [2800, 7]]) if (h <= limit) return count;
  return Math.min(12, 7 + Math.ceil((h - 2800) / 400));
}

export function getSystem32HardwareCounts(project) {
  const plan = generateDrillingPlan({ ...project, settings: { ...project.settings, drilling: { ...project.settings?.drilling, enabled: true, system32: true } } });
  return {
    shelfPins: plan.holes.filter(h => h.fastenerType === 'shelf-pin-system32').length,
    slideScrews: plan.holes.filter(h => h.fastenerType === 'drawer-slide-system32').length,
    hingePlates: plan.holes.filter(h => h.fastenerType === 'hinge-plate-system32').length,
    hingeCups: plan.holes.filter(h => h.fastenerType === 'hinge-cup-35mm').length,
    totalHoles: plan.holes.filter(h => h.system32).length
  };
}

const explicitHinges = value => Number.isInteger(value) && value >= 2 && value <= 12;
const emptyTotals = () => {
  const totals = { handles: 0, guideSets: 0, hinges: 0, rods: 0, rodHolders: 0, rodLengthMeters: 0 };
  const extra = {
    pushLatches: 0, confirmats: 0, plinthLegs: 0, shelfSupports: 0, cornerBrackets: 0, ventGrilles: 0,
    system32ShelfPins: 0, system32SlideScrews: 0, system32HingePlates: 0, system32HingeCups: 0
  };
  for (const [key, initial] of Object.entries(extra)) {
    let val = initial;
    Object.defineProperty(totals, key, {
      get() { return val; },
      set(v) { val = v; },
      enumerable: false,
      configurable: true
    });
  }
  return totals;
};
const mechanism = node => node?.openingMechanism === 'push' ? 'push' : 'handle';

export function isDoorOnSharedPartition(front, allFronts, layout, cabinetWidth) {
  if (front?.kind !== 'door') return false;
  const section = layout?.sections?.find(s => s.id === front.sectionId);
  if (!section) return false;
  const opening = front.opening || (Number(front.index) % 2 === 1 ? 'right' : 'left');
  if (opening === 'up') return false;

  const t = layout.thickness || 18;
  const w = Number(cabinetWidth) || (section.x + section.width + t);
  const EPSILON = 2.5;

  if (opening === 'left') {
    if (section.x <= t + EPSILON) return false;
    const partitionX = section.x - t;
    return allFronts.some(other => {
      if (other === front || other.kind !== 'door') return false;
      const otherSection = layout.sections.find(s => s.id === other.sectionId);
      if (!otherSection) return false;
      const otherOpening = other.opening || (Number(other.index) % 2 === 1 ? 'right' : 'left');
      if (otherOpening !== 'right') return false;
      if (Math.abs((otherSection.x + otherSection.width) - partitionX) > EPSILON) return false;
      return Math.max(front.y, other.y) < Math.min(front.y + front.height, other.y + other.height) - EPSILON;
    });
  } else if (opening === 'right') {
    if (section.x + section.width >= w - t - EPSILON) return false;
    const partitionRight = section.x + section.width + t;
    return allFronts.some(other => {
      if (other === front || other.kind !== 'door') return false;
      const otherSection = layout.sections.find(s => s.id === other.sectionId);
      if (!otherSection) return false;
      const otherOpening = other.opening || (Number(other.index) % 2 === 1 ? 'right' : 'left');
      if (otherOpening !== 'left') return false;
      if (Math.abs(otherSection.x - partitionRight) > EPSILON) return false;
      return Math.max(front.y, other.y) < Math.min(front.y + front.height, other.y + other.height) - EPSILON;
    });
  }
  return false;
}

export function getHardwareSchedule(cabinet, project = { materials: [] }) {
  const rows = [], totals = emptyTotals(), layout = getCabinetLayout(cabinet, project);
  const add = (kind, quantity, source, metadata = {}) => {
    const field = {
      handle: 'handles',
      'guide-set': 'guideSets',
      hinge: 'hinges',
      'push-latch': 'pushLatches',
      confirmat: 'confirmats',
      'plinth-leg': 'plinthLegs',
      'shelf-support': 'shelfSupports',
      'corner-bracket': 'cornerBrackets',
      'vent-grille': 'ventGrilles',
      rod: 'rods',
      'rod-holder': 'rodHolders'
    }[kind];
    if (field && totals[field] !== undefined) totals[field] += quantity;
    rows.push({ id: `${cabinet.id}-hardware-${rows.length + 1}`, cabinetId: cabinet.id, cabinetName: cabinet.name,
      kind, quantity, unit: kind === 'guide-set' ? 'sets' : 'pcs', source, planned: false, ...metadata });
  };
  const allFronts = getFrontLayout(cabinet, project);
  for (const front of allFronts) {
    if (front.kind === 'blind-panel' || front.openingMechanism === 'none') continue;
    const node = layout.sections.find(section => section.id === front.sectionId)?.node ?? cabinet;
    const source = front.kind === 'door' ? 'door' : 'drawer';
    const metadata = { ...(front.sectionId ? { sectionId: front.sectionId } : {}), index: front.index, ...(front.opening ? { opening: front.opening } : {}) };
    if (front.openingMechanism === 'push') add('push-latch', 1, source, metadata);
    else add('handle', 1, source, metadata);
    if (front.kind === 'drawer') add('guide-set', 1, source, { ...metadata, runnerLength: front.runnerLength ?? front.box?.runnerLength });
    else {
      const override = explicitHinges(node.hingesPerDoor) ? node.hingesPerDoor : explicitHinges(cabinet.hingesPerDoor) ? cabinet.hingesPerDoor : null;
      const shared = isDoorOnSharedPartition(front, allFronts, layout, cabinet.width);
      const isInset = front.frontMount === 'inset';
      add('hinge', override ?? defaultHingesPerDoor(front.height), source, {
        ...metadata,
        hingeType: isInset ? 'inset' : (shared ? 'half-overlay' : 'full-overlay'),
        sharedPartition: shared,
        planned: override === null
      });
    }
  }
  for (const front of getInternalDrawerLayout(cabinet, project)) {
    const metadata = { sectionId: front.sectionId, ...(front.interiorSectionId ? { interiorSectionId: front.interiorSectionId } : {}), index: front.index };
    if (front.openingMechanism === 'push') add('push-latch', 1, 'internal-drawer', metadata);
    else add('handle', 1, 'internal-drawer', metadata);
    add('guide-set', 1, 'internal-drawer', { ...metadata, runnerLength: front.runnerLength ?? front.box?.runnerLength });
  }
  const openings = [...layout.sections.filter(section => !section.node.interiorLayout), ...layout.internalSections];
  for (const section of openings) if (section.node.pullOutShelf) {
    const metadata = { sectionId: section.parentSectionId ?? section.id, ...(section.parentSectionId ? { interiorSectionId: section.id } : {}), index: 0 };
    if (mechanism(section.node) === 'push') add('push-latch', 1, 'pull-out-shelf', metadata);
    else add('handle', 1, 'pull-out-shelf', metadata);
    add('guide-set', 1, 'pull-out-shelf', metadata);
  }
  for (const rod of getRodLayout(cabinet, project)) {
    const metadata = { sectionId: rod.sectionId, ...(rod.interiorSectionId ? { interiorSectionId: rod.interiorSectionId } : {}), rodId: rod.rodId, diameter: rod.diameter };
    add('rod', 1, 'wardrobe-rod', { ...metadata, length: rod.length, lengthMeters: rod.length / 1000 });
    add('rod-holder', 2, 'wardrobe-rod', metadata);
    totals.rodLengthMeters += rod.length / 1000;
  }
  const looseShelfCount = [
    ...layout.sections.filter(s => !s.node.interiorLayout).map(s => Number(s.node?.shelves) || 0),
    ...layout.internalSections.map(s => Number(s.node?.shelves) || 0),
    ...(cabinet.layout ? [] : [Number(cabinet.shelves) || 0])
  ].reduce((sum, count) => sum + count, 0);
  const includeSupports = cabinet.shelfSupports === true || project?.settings?.shelfSupports === true || project?.settings?.includeAllHardware === true || project?.settings?.pricing?.shelfSupportPrice !== undefined || cabinet.shelfMount === 'support';
  if (looseShelfCount > 0 && includeSupports) {
    add('shelf-support', looseShelfCount * 4, 'shelf', { planned: true, shelfCount: looseShelfCount });
  }
  const hasPlinth = Number(cabinet.plinth) > 10;
  const isFloorCab = !cabinet.type || ['base', 'tall', 'corner-base', 'corner-tall'].includes(cabinet.type);
  const includeLegs = cabinet.plinthLegs === true || cabinet.legs === true || cabinet.legType === 'plinth-leg' || project?.settings?.plinthLegs === true || project?.settings?.includeAllHardware === true || project?.settings?.pricing?.plinthLegPrice !== undefined;
  if (hasPlinth && isFloorCab && includeLegs) {
    const legCount = Number(cabinet.width) > 1000 ? 6 : 4;
    add('plinth-leg', legCount, 'plinth', { planned: true });
  }
  const hasBuiltinFridge = (layout?.sections || []).some(s => s.node?.appliance?.type === 'fridge-builtin' || s.node?.appliance?.type === 'fridge') || cabinet.appliance?.type === 'fridge-builtin';
  if (hasBuiltinFridge) {
    add('vent-grille', 1, 'plinth-ventilation', {
      name: 'Вентиляционная решётка цоколя (для встраиваемого холодильника)',
      areaCm2: 200,
      planned: true
    });
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
    const cabinetBrackets = (rear.bracketJoints ?? []).filter(joint => joint.cabinetId === cabinet.cabinetId);
    const bracketQuantity = cabinetBrackets.reduce((sum, joint) => sum + (joint.quantity ?? 2), 0);
    cabinet.bracketTotals = { brackets: bracketQuantity, screws: bracketQuantity * 2 };
    if (bracketQuantity > 0) {
      cabinet.totals.cornerBrackets = (cabinet.totals.cornerBrackets || 0) + bracketQuantity;
      cabinet.rows.push({
        id: `${cabinet.cabinetId}-brackets`,
        cabinetId: cabinet.cabinetId,
        cabinetName: cabinet.cabinetName,
        kind: 'corner-bracket',
        quantity: bracketQuantity,
        unit: 'pcs',
        source: 'cross-joint',
        name: 'Уголок мебельный специальный',
        diameter: 3.5,
        length: 16,
        screwsPerBracket: 2,
        planned: false
      });
    }
    const includeConfirmats = project?.settings?.confirmatFasteners === true || project?.settings?.drilling?.enabled === true || project?.settings?.includeAllHardware === true || (project?.cabinets ?? []).some(c => c.fastener === 'confirmat') || project?.settings?.pricing?.confirmatPrice !== undefined;
    const cabinetConfirmats = (rear.confirmatJoints ?? []).filter(joint => joint.cabinetId === cabinet.cabinetId);
    let confirmatQuantity = cabinetConfirmats.reduce((sum, joint) => sum + (joint.pairIds?.length ?? 2), 0);
    if (includeConfirmats && confirmatQuantity === 0 && (cabinet.fastener === 'confirmat' || project?.settings?.confirmatFasteners)) {
      confirmatQuantity = 8;
    }
    if (includeConfirmats && confirmatQuantity > 0) {
      cabinet.totals.confirmats = (cabinet.totals.confirmats || 0) + confirmatQuantity;
      cabinet.rows.push({
        id: `${cabinet.cabinetId}-confirmats`,
        cabinetId: cabinet.cabinetId,
        cabinetName: cabinet.cabinetName,
        kind: 'confirmat',
        quantity: confirmatQuantity,
        unit: 'pcs',
        source: 'carcass-joint',
        name: 'Конфирмат (евровинт)',
        planned: false
      });
    }
  }
  const totals = emptyTotals();
  for (const schedule of cabinets) {
    for (const key of Object.keys(totals)) totals[key] += schedule.totals[key] || 0;
    for (const key of ['pushLatches', 'confirmats', 'plinthLegs', 'shelfSupports', 'cornerBrackets', 'system32ShelfPins', 'system32SlideScrews', 'system32HingePlates', 'system32HingeCups']) {
      totals[key] += schedule.totals[key] || 0;
    }
  }
  if (project?.settings?.drilling?.enabled && project?.settings?.drilling?.system32) {
    const s32 = getSystem32HardwareCounts(project);
    totals.system32ShelfPins = s32.shelfPins;
    totals.system32SlideScrews = s32.slideScrews;
    totals.system32HingePlates = s32.hingePlates;
    totals.system32HingeCups = s32.hingeCups;
  }
  return { cabinets, rows: cabinets.flatMap(schedule => schedule.rows), totals,
    rearTotals: rear.totals, rearFastenings: rear.rows, rearIssues: rear.errors,
    bracketTotals: { brackets: rear.totals?.brackets ?? 0, screws: (rear.totals?.brackets ?? 0) * 2 },
    bracketJoints: rear.bracketJoints ?? [],
    rearValid: rear.valid && !rear.rows.some(row=>row.unsupported) };
}
