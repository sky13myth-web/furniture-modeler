import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, generateParts } from '../src/engine.js';
import { generateDrillingPlan, getRearFasteningSchedule, normalizeDrillingSettings } from '../src/drilling.js';
import { classifyRearPanel, REAR_FASTENING_DEFAULTS } from '../src/rear-fastening.js';
import { setPartEdgeBanding } from '../src/part-edge-banding.js';

const near = (a, b, tolerance = .004) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture({ gauge = 8, inset = false, type = 'MDF', bodyGauge = 18, ...overrides } = {}, drilling = {}) {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  const stock = project.materials.find(material => material.id === cabinet.materialId); stock.thickness = bodyGauge;
  if (gauge !== 3 || type !== 'ДВП') {
    project.materials.push({ ...stock, id: 'test-rear', type, name: 'Test rear', thickness: gauge, edgeBand: 0 });
    cabinet.backMaterialId = 'test-rear';
  }
  Object.assign(cabinet, { width: 900, height: 2200, depth: 620, plinth: 100, backThickness: gauge,
    includeBack: !inset, layout: { ...createSection('open'), id: 'opening', back: inset ? 'solid' : 'none', shelves: 2 }, ...overrides });
  project.settings.drilling = { enabled: true, ...drilling };
  return { project, cabinet };
}
function inside(point, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i], cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (Math.abs(cross) < .003 * Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)) && point.x >= Math.min(a.x, b.x) - .003 && point.x <= Math.max(a.x, b.x) + .003 && point.y >= Math.min(a.y, b.y) - .003 && point.y <= Math.max(a.y, b.y) + .003) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}
function assertRearGeometry(plan) {
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const parts = new Map(plan.parts.map(part => [part.id, part])), rearHoles = plan.holes.filter(hole => hole.fastenerType === 'rear-screw');
  for (const pair of Map.groupBy(rearHoles, hole => hole.pairId).values()) {
    assert.equal(pair.length, 2); const through = pair.find(hole => hole.kind === 'clearance'), pilot = pair.find(hole => hole.kind === 'pilot');
    assert.ok(through && pilot); assert.notEqual(through.partId, pilot.partId);
    assert.deepEqual(through.direction, pilot.direction);
    for (const axis of ['x', 'y', 'z']) near(through.worldEntry[axis] + through.direction[axis] * through.depth, pilot.worldEntry[axis]);
    for (const hole of pair) {
      const part = parts.get(hole.partId), start = { a: hole.a, b: hole.b, t: hole.thicknessCoordinate };
      assert.equal(part.partCode, hole.partCode); assert.equal(hole.screwDiameter, 4); assert.equal(hole.screwLength, 30);
      for (const axis of ['x', 'y', 'z']) near(part.drillingWorldOrigin[axis] + part.drillingBasis.a[axis] * start.a + part.drillingBasis.b[axis] * start.b + part.drillingBasis.t[axis] * start.t, hole.worldEntry[axis]);
      const radius = Math.max(hole.diameter, hole.kind === 'pilot' ? hole.screwDiameter : 0) / 2;
      const mins = {}, maxs = {};
      for (const axis of ['a', 'b', 't']) {
        const end = start[axis] + hole.localDirection[axis] * hole.depth, radial = Math.abs(hole.localDirection[axis]) < .5 ? radius : 0;
        mins[axis] = Math.min(start[axis], end) - radial; maxs[axis] = Math.max(start[axis], end) + radial;
      }
      assert.ok(mins.t >= -.004 && maxs.t <= part.thickness + .004, `${hole.id} thickness envelope`);
      for (const a of [mins.a, maxs.a]) for (const b of [mins.b, maxs.b]) assert.ok(inside({ x: a, y: b }, part.drillingOutline), `${hole.id} RAW envelope ${a}/${b}`);
    }
  }
  for (const row of plan.rearFastenings.filter(row => row.method === 'screw')) {
    assert.equal(row.quantity, row.contacts.reduce((sum, contact) => sum + contact.quantity, 0));
    assert.equal(row.quantity * 2, row.contacts.flatMap(contact => contact.pairIds).flatMap(id => rearHoles.filter(hole => hole.pairId === id)).length);
    assert.ok(row.contacts.length >= 2);
  }
}

// Independent axis-aligned finite segment distance, in cabinet coordinates.
function distance(a, b) {
  const end = h => Object.fromEntries(['x','y','z'].map(axis => [axis, h.cabinetEntry[axis] + h.cabinetDirection[axis] * h.depth]));
  const ae = end(a), be = end(b), axisA = ['x','y','z'].find(axis => Math.abs(a.cabinetDirection[axis]) > .5), axisB = ['x','y','z'].find(axis => Math.abs(b.cabinetDirection[axis]) > .5);
  const clamp = (v, start, finish) => Math.max(Math.min(start, finish), Math.min(Math.max(start, finish), v));
  const p = { ...a.cabinetEntry }, q = { ...b.cabinetEntry };
  if (axisA === axisB) {
    const lowA = Math.min(p[axisA], ae[axisA]), highA = Math.max(p[axisA], ae[axisA]), lowB = Math.min(q[axisB], be[axisB]), highB = Math.max(q[axisB], be[axisB]);
    const gap = Math.max(0, lowA - highB, lowB - highA);
    return Math.sqrt(gap ** 2 + ['x','y','z'].filter(axis => axis !== axisA).reduce((sum, axis) => sum + (p[axis] - q[axis]) ** 2, 0));
  }
  p[axisA] = clamp(q[axisA], p[axisA], ae[axisA]); q[axisB] = clamp(p[axisB], q[axisB], be[axisB]);
  return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
}

test('rear stock classification uses the actual type and thickness, not a name containing MDF or 3 mm alone', () => {
  for (const language of ['ru','tr','en']) {
    const project = createDefaultProject(language), part = generateParts(project).find(part => part.role === 'back');
    assert.equal(classifyRearPanel(part, project.materials).method, 'nail');
  }
  assert.equal(classifyRearPanel({ materialId: 'm', thickness: 3 }, [{ id: 'm', thickness: 3, type: 'MDF', name: 'ДВП 3 мм' }]).method, 'screw');
  assert.equal(classifyRearPanel({ materialId: 'm', thickness: 8 }, [{ id: 'm', thickness: 8, type: 'HDF' }]).method, 'screw');
  for (const type of ['SERT LİF LEVHA', 'Sert Li\u0307f Levha', 'SERT LIF LEVHA', 'ДВП', 'Hardboard']) {
    assert.equal(classifyRearPanel({ materialId: 'm', thickness: 3 }, [{ id: 'm', thickness: 3, type }]).method, 'nail', type);
    const { project } = fixture({ gauge: 3, type, inset: true });
    const plan = generateDrillingPlan(project); assert.equal(plan.valid, true, JSON.stringify(plan.errors));
    assert.equal(plan.holes.some(hole => hole.fastenerType === 'rear-screw'), false);
    assert.equal(plan.rearFastenings[0].method, 'nail'); assert.ok(plan.rearFastenings[0].quantity > 0);
  }
  assert.equal(REAR_FASTENING_DEFAULTS.rearScrewLength, 30);
  assert.equal(normalizeDrillingSettings({ rearScrewLength: '35' }).rearScrewLength, 35);
});

test('thin 3 mm lap hardboard has real supported nail stations and no drilled rear operations', () => {
  const { project } = fixture({ gauge: 3, type: 'ДВП' }), before = structuredClone(project), plan = generateDrillingPlan(project);
  assert.equal(plan.valid, true); assert.deepEqual(project, before);
  const row = plan.rearFastenings[0]; assert.equal(row.method, 'nail'); assert.equal(row.quantity, 32); assert.equal(row.contacts.length, 4);
  assert.ok(!Object.hasOwn(row, 'screwLength')); assert.equal(plan.holes.some(hole => hole.partId === row.partId), false);
  assert.ok(plan.holes.every(hole => hole.fastenerType === 'confirmat' && hole.screwDiameter === 7 && hole.screwLength === 50));
  for (const contact of row.contacts) for (let index = 0; index < contact.quantity; index++) {
    near(contact.throughEntries[index].z + 3, contact.receivingEntries[index].z);
    assert.deepEqual(contact.direction, { x: 0, y: 0, z: 1 });
  }
});

test('8/18/25 mm MDF lap rear panels have separate 4×30 pairs into real carcass edges', () => {
  for (const gauge of [8,18,25]) {
    const { project } = fixture({ gauge }), plan = generateDrillingPlan(project); assertRearGeometry(plan);
    const row = plan.rearFastenings[0]; assert.equal(row.method, 'screw'); assert.equal(row.quantity, 32);
    assert.ok(row.contacts.every(contact => contact.attachment === 'lap'));
    for (const hole of plan.holes.filter(hole => hole.fastenerType === 'rear-screw')) {
      assert.deepEqual(hole.cabinetDirection, { x: 0, y: 0, z: 1 });
      if (hole.kind === 'pilot') near(hole.depth, 32 - gauge);
    }
    assert.equal(plan.holes.filter(hole => hole.fastenerType === 'rear-screw' && hole.kind === 'countersink').length, 0);
  }
});

test('local MDF backs lap over surrounding side/top/bottom edges and use real Z-axis connections', () => {
  for (const gauge of [8,18]) for (const bodyGauge of [18,25]) {
    const { project } = fixture({ gauge, bodyGauge, inset: true }), plan = generateDrillingPlan(project); assertRearGeometry(plan);
    const row = plan.rearFastenings[0]; assert.equal(row.contacts.length, 4);
    assert.ok(row.contacts.every(contact => contact.attachment === 'lap' && contact.throughPartId === row.partId));
    for (const hole of plan.holes.filter(hole => hole.fastenerType === 'rear-screw')) {
      assert.equal(hole.cabinetDirection.z, 1);
      if (hole.kind === 'pilot') { near(hole.thicknessCoordinate, bodyGauge / 2); near(hole.depth, 32 - gauge); }
    }
  }
});

test('mirrored L rear segments retain global P IDs and coaxial RAW bores through room rotation/elevation', () => {
  for (const corner of ['back-left','back-right']) for (const inset of [false,true]) for (const bodyGauge of [18,25]) {
    const { project } = fixture({ bodyGauge, inset, rotation: 37, x: 1432.17, z: 2189.45, y: 512.25, cutout: { corner, width: 300.123, depth: 200.123 } });
    const before = structuredClone(project), plan = generateDrillingPlan(project); assertRearGeometry(plan); assert.deepEqual(project, before);
    assert.equal(plan.rearFastenings.length, 2); assert.ok(plan.rearFastenings.every(row => row.quantity > 0));
  }
});

test('loose shelves, drawer boxes, facades and braces are not invented as rear-panel supports', () => {
  const { project, cabinet } = fixture(); cabinet.layout.front = 'doors'; cabinet.layout.internalDrawerCount = 2;
  cabinet.rearBraces = [{ id: 'brace', y: 1000, height: 100, materialId: cabinet.materialId }];
  const plan = generateDrillingPlan(project); assertRearGeometry(plan);
  const used = new Set(plan.rearFastenings.flatMap(row => row.contacts.flatMap(contact => [contact.throughPartId, contact.receivingPartId])));
  for (const part of plan.parts.filter(part => part.sectionId && !['back','section-back','bottom'].includes(part.role) || part.braceId || part.component?.includes('drawer'))) assert.equal(used.has(part.id), false, part.name);
});

test('local thin backs have supported lap nail stations in straight and mirrored cabinets', () => {
  for (const corner of [null,'back-left','back-right']) {
    const { project } = fixture({ gauge: 3, type: 'ДВП', inset: true, ...(corner ? { cutout: { corner, width: 300, depth: 200 } } : {}) });
    const plan = generateDrillingPlan(project); assert.equal(plan.valid, true);
    assert.ok(plan.rearFastenings.every(row => row.method === 'nail' && row.quantity > 0 && !row.unsupported));
    assert.ok(!plan.warnings.some(warning => warning.code === 'rear-nail-needs-support')); assert.equal(plan.holes.some(hole => hole.fastenerType === 'rear-screw'), false);
  }
});

test('adjacent compatible local backs become one board with accessible outer and common-divider contacts', () => {
  for (const axis of ['vertical','horizontal']) {
    const { project, cabinet } = fixture({ inset: true });
    cabinet.layout = { id: 'root', kind: 'split', axis, sizes: [1,1], children: ['s1','s2'].map(id => ({ ...createSection(), id, back: 'solid' })) };
    const plan = generateDrillingPlan(project); assertRearGeometry(plan); assert.equal(plan.rearFastenings.length, 1);
    const row = plan.rearFastenings[0]; assert.equal(row.contacts.length, 5); assert.equal(row.unsupported, false); assert.deepEqual(row.omittedContacts, []);
    assert.deepEqual(plan.parts.find(part => part.id === row.partId).sourceSectionIds, ['s1','s2']);
    assert.ok(!plan.warnings.some(warning => warning.code === 'rear-head-inaccessible'));
  }
});

test('a filled grid merges its coplanar backs and has no inaccessible rear contacts behind the centre cell', () => {
  const { project, cabinet } = fixture({ inset: true });
  cabinet.layout = { id: 'grid', kind: 'split', axis: 'vertical', sizes: [1,1,1], children: [0,1,2].map(column => ({
    id: `column-${column}`, kind: 'split', axis: 'horizontal', sizes: [1,1,1], children: [0,1,2].map(row => ({ ...createSection(), id: `cell-${column}-${row}`, back: 'solid' }))
  })) };
  const plan = generateDrillingPlan(project), part = plan.parts.find(part => part.role === 'section-back' && part.sourceSectionIds.includes('cell-1-1'));
  const row = plan.rearFastenings.find(row => row.partId === part.id);
  assert.equal(plan.rearFastenings.length, 1); assert.equal(part.sourceSectionIds.length, 9);
  assert.equal(row.contacts.length, 12); assert.ok(row.quantity > 0); assert.equal(row.unsupported, false);
  assert.deepEqual(row.omittedContacts, []); assert.ok(!plan.errors.some(error => error.code.startsWith('rear-')));
  assert.ok(plan.holes.some(hole => hole.partId === part.id && hole.fastenerType === 'rear-screw'));
});

test('a floating thick rear or wrong stock gauge fails explicitly instead of exporting unsupported screws', () => {
  const { project } = fixture(), source = generateParts({ ...project, settings: { ...project.settings, deductEdge: true } });
  source.find(part => part.role === 'back').position.z = -100;
  const floating = generateDrillingPlan(project, { parts: source }); assert.equal(floating.valid, false); assert.ok(floating.errors.some(error => error.code === 'rear-no-contact'));
  project.materials.find(material => material.id === 'test-rear').thickness = 18;
  const mismatch = generateDrillingPlan(project); assert.equal(mismatch.valid, false); assert.ok(mismatch.errors.some(error => error.code === 'rear-material-mismatch'));
});

test('rear screws without engagement or with excessive pilot depth do not pierce the next face', () => {
  for (const rearScrewLength of [8,700]) {
    const { project } = fixture({}, { rearScrewLength }), plan = generateDrillingPlan(project);
    assert.equal(plan.valid, false); assert.ok(plan.errors.some(error => error.code === 'rear-insufficient-support'));
    assert.ok(plan.warnings.some(warning => ['rear-no-engagement','rear-pilot-outside','rear-bore-collision'].includes(warning.code)));
    assert.equal(plan.holes.some(hole => hole.fastenerType === 'rear-screw'), false);
  }
});

test('rear/core finite hole and screw-thread envelopes remain separate on each actual panel', () => {
  const { project } = fixture({ inset: true }, { endOffset: 4, rearEndOffset: 10 });
  const plan = generateDrillingPlan(project); assertRearGeometry(plan);
  const known = plan.holes.filter(hole => hole.kind !== 'countersink');
  for (let i = 0; i < known.length; i++) for (let j = i + 1; j < known.length; j++) {
    const a = known[i], b = known[j]; if (a.partId !== b.partId || a.pairId === b.pairId) continue;
    const diameter = hole => Math.max(hole.diameter, hole.kind === 'pilot' ? hole.screwDiameter : 0);
    assert.ok(distance(a,b) >= (diameter(a) + diameter(b)) / 2 - .006, `${a.id}/${b.id} collide`);
  }
});

test('hardware rear schedule is identical with drilling disabled and preserves full-project identifiers', () => {
  const { project } = fixture(), other = structuredClone(project.cabinets[0]); other.id = 'other'; other.x = 1700; project.cabinets.push(other);
  const before = structuredClone(project), enabled = generateDrillingPlan(project), schedule = getRearFasteningSchedule(project);
  assert.equal(schedule.valid, true); assert.deepEqual(schedule.rows, enabled.rearFastenings); assert.equal(schedule.totals.screws, 64);
  project.settings.drilling.enabled = false; assert.deepEqual(getRearFasteningSchedule(project), schedule);
  project.settings.drilling.enabled = true; assert.deepEqual(project, before);
  const codes = new Map(enabled.parts.map(part => [part.id,part.partCode])); for (const row of schedule.rows) assert.equal(row.partCode, codes.get(row.partId));
});

test('rear schedule reports only rear failures while full drilling remains strict about unsupported carcass screws', () => {
  const { project } = fixture({ bodyGauge: 8 }); const plan = generateDrillingPlan(project), schedule = getRearFasteningSchedule(project);
  assert.equal(plan.valid, false); assert.ok(plan.errors.some(error => error.code === 'panel-too-thin'));
  assert.equal(schedule.valid, true); assert.equal(schedule.planValid, false); assert.deepEqual(schedule.errors, []); assert.ok(schedule.totals.screws > 0);
  project.settings.drilling.screwLength = 0;
  const invalidCore = getRearFasteningSchedule(project); assert.equal(invalidCore.valid, true); assert.ok(invalidCore.totals.screws > 0);
});

test('manual rear blank edges preserve the contact plane and reconstruct every station from its shifted RAW datum', () => {
  const { project } = fixture(), before = generateDrillingPlan(project), rear = before.parts.find(part => part.role === 'back');
  setPartEdgeBanding(project, rear.id, { left: 1, bottom: 1.5 });
  const after = generateDrillingPlan(project); assertRearGeometry(after);
  const original = before.holes.filter(hole => hole.partId === rear.id && hole.fastenerType === 'rear-screw'), changed = after.holes.filter(hole => hole.partId === rear.id && hole.fastenerType === 'rear-screw');
  assert.equal(changed.length, original.length);
  for (let index = 0; index < changed.length; index++) {
    near(changed[index].worldEntry.z, original[index].worldEntry.z);
    const actualAxisMovement = changed[index].worldEntry.x - original[index].worldEntry.x;
    near(changed[index].a, original[index].a + actualAxisMovement - 1);
    const actualStationMovement = changed[index].worldEntry.y - original[index].worldEntry.y;
    near(changed[index].b, original[index].b + actualStationMovement - 1.5);
  }
  // End offsets are measured on material that remains after trimming, rather
  // than placing a hole in the 1.5 mm occupied by the manually selected band.
  assert.ok(changed.some((hole,index) => Math.abs(hole.worldEntry.y - original[index].worldEntry.y - 1.5) < .004));
});

test('rear settings reject invalid diameters, lengths, clearances and spacing before unsafe rear machining', () => {
  for (const setting of [{ rearScrewDiameter: 0 }, { rearScrewLength: -1 }, { rearClearanceDiameter: 3 }, { rearPilotDiameter: 4 }, { rearPilotExtraDepth: 21 }, { rearEndOffset: 0 }, { rearMaxSpacing: -1 }]) {
    const { project } = fixture({}, setting), plan = generateDrillingPlan(project); assert.equal(plan.valid, false);
    assert.equal(plan.holes.some(hole => hole.fastenerType === 'rear-screw'), false); assert.ok(plan.errors.some(error => error.code.startsWith('rear-') || String(error.field).startsWith('rear')));
  }
});
