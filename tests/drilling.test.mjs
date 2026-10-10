import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, generateParts } from '../src/engine.js';
import { DRILLING_DEFAULTS, generateDrillingPlan, normalizeDrillingSettings } from '../src/drilling.js';

const near = (actual, expected, tolerance = .004) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
function fixture(overrides = {}, settings = {}) {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 2200, depth: 620, plinth: 100, sidesToFloor: true,
    layout: { ...createSection('open'), id: 'opening', shelves: 0 }, ...overrides });
  project.settings.drilling = { enabled: true, ...settings };
  return { project, cabinet };
}
function assertPaired(plan) {
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  const groups = Map.groupBy(plan.holes, hole => hole.pairId), parts = new Map(plan.parts.map(part => [part.id, part]));
  for (const pair of groups.values()) {
    assert.equal(pair.length, 3);
    const through = pair.find(hole => hole.kind === 'clearance'), pilot = pair.find(hole => hole.kind === 'pilot'), sink = pair.find(hole => hole.kind === 'countersink');
    assert.notEqual(through.partId, pilot.partId);
    assert.equal(through.partId, sink.partId);
    assert.deepEqual(through.direction, pilot.direction);
    for (const axis of ['x', 'y', 'z']) {
      near(through.worldEntry[axis] + through.direction[axis] * through.depth, pilot.worldEntry[axis]);
      near(through.worldEntry[axis], sink.worldEntry[axis]);
    }
    near(pilot.thicknessCoordinate, parts.get(pilot.partId).thickness / 2);
    for (const hole of pair) {
      const part = parts.get(hole.partId);
      assert.equal(hole.partCode, part.partCode);
      assert.ok(hole.a >= -.002 && hole.a <= part.width + .002);
      assert.ok(hole.b >= -.002 && hole.b <= part.height + .002);
      for (const axis of ['x', 'y', 'z']) {
        near(part.drillingWorldOrigin[axis] + part.drillingBasis.a[axis] * hole.a + part.drillingBasis.b[axis] * hole.b + part.drillingBasis.t[axis] * hole.thicknessCoordinate, hole.worldEntry[axis]);
      }
    }
  }
}

test('drilling is an optional nonmutating feature; incomplete countersink setup stays explicit', () => {
  const { project } = fixture();
  delete project.settings.drilling;
  const before = structuredClone(project), disabled = generateDrillingPlan(project);
  assert.equal(disabled.settings.enabled, false);
  assert.deepEqual(disabled.holes, []);
  assert.deepEqual(disabled.errors, []);
  assert.deepEqual(project, before);
  project.settings.drilling = { enabled: true };
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  assert.equal(plan.joints.length, 4);
  assert.equal(plan.holes.length, 36);
  assert.equal(plan.holes.filter(h => h.kind === 'countersink').every(h => h.depth === null && h.requiresSetup === true), true);
  assert.ok(plan.warnings.some(w => w.code === 'countersink-setup'));
  assert.equal(DRILLING_DEFAULTS.screwDiameter, 7);
  assert.equal(normalizeDrillingSettings({ enabled: true, screwLength: '60' }).screwLength, 60);
});

test('raw references account for only the physical band sides; screw axes follow actual plate centres', () => {
  const { project, cabinet } = fixture({ edgeBand: 2 });
  const before = structuredClone(project), plan = generateDrillingPlan(project);
  assertPaired(plan);
  assert.deepEqual(project, before);
  const left = plan.parts.find(p => p.name === 'Боковина левая');
  assert.equal(left.finishedWidth - left.width, 2);
  assert.deepEqual(left.rawOrigin, { a: 0, b: 0 });
  const top = plan.parts.find(p => p.name === 'Крышка');
  assert.equal(top.finishedHeight - top.height, 2);
  assert.deepEqual(top.rawOrigin, { a: 0, b: 0 });
  const leftThrough = plan.holes.filter(h => h.partId === left.id && h.kind === 'clearance');
  near(Math.max(...leftThrough.map(h => h.b)), cabinet.height - 9);
  near(Math.min(...leftThrough.map(h => h.b)), cabinet.plinth + 9);
  assert.deepEqual([...new Set(leftThrough.map(h => h.a))].sort((a, b) => a - b), [50, 307.5, 565]);
});

test('hole pairs and raw bases remain coaxial after cabinet rotation, room placement and elevation', () => {
  for (const rotation of [0, 37, 90, 180, 270]) {
    const { project } = fixture({ rotation, x: 1342.17, z: 2123.91, y: 350 });
    assertPaired(generateDrillingPlan(project));
  }
});

test('pilot depth follows the actual through plate gauge, with editable tip allowance', () => {
  for (const thickness of [15, 18, 25, 30]) {
    const { project, cabinet } = fixture();
    const material = project.materials.find(m => m.id === cabinet.materialId);
    material.thickness = thickness;
    const plan = generateDrillingPlan(project);
    assertPaired(plan);
    for (const joint of plan.joints) { near(joint.pilotDepth, 50 - thickness + 2); near(joint.engagement, 50 - thickness); }
    for (const hole of plan.holes.filter(h => h.kind === 'pilot')) near(hole.depth, 50 - thickness + 2);
  }
});

test('vertical fixed dividers are drilled through top and bottom rather than omitted', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection(), id: 'left' }, { ...createSection(), id: 'right' }
  ] };
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  const divider = plan.parts.find(p => p.partitionId);
  const joints = plan.joints.filter(j => j.receivingPartId === divider.id);
  assert.equal(joints.length, 2);
  assert.deepEqual(new Set(joints.map(j => j.receivingFace)), new Set(['edge-b-min', 'edge-b-max']));
});

test('top and bottom attach to all real outer and return sides of both L-notch directions', () => {
  for (const corner of ['back-left', 'back-right']) {
    const { project } = fixture({ cutout: { corner, width: 300, depth: 200 } });
    const plan = generateDrillingPlan(project);
    assertPaired(plan);
    assert.equal(plan.joints.length, 6);
    const side = plan.parts.find(p => p.name === 'Возвратная боковина выреза');
    assert.equal(plan.joints.filter(j => j.throughPartId === side.id).length, 2);
    for (const hole of plan.holes.filter(h => h.partId === side.id && h.kind === 'clearance')) assert.ok(hole.a >= 50 && hole.a <= 147);
  }
});

test('loose shelves, backs, fronts, braces and moving drawer boxes do not acquire carcass screw holes', () => {
  const { project, cabinet } = fixture();
  Object.assign(cabinet.layout, { front: 'doors', internalDrawers: 2, shelves: 2 });
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  const excluded = plan.parts.filter(p => p.role === 'back' || p.name.includes('полка') || p.name.includes('Дверь') || p.component?.startsWith('internal-drawer'));
  assert.ok(excluded.length >= 3);
  assert.equal(plan.holes.some(h => excluded.some(p => p.id === h.partId)), false);
});

test('thin plates, screws without engagement and too short joints are blocked explicitly', () => {
  const thin = fixture();
  thin.project.materials.find(m => m.id === thin.cabinet.materialId).thickness = 8;
  const thinPlan = generateDrillingPlan(thin.project);
  assert.equal(thinPlan.valid, false);
  assert.ok(thinPlan.errors.every(e => e.code === 'panel-too-thin'));
  const thick = fixture();
  thick.project.materials.find(m => m.id === thick.cabinet.materialId).thickness = 50;
  assert.ok(generateDrillingPlan(thick.project).errors.some(e => e.code === 'no-engagement'));
  assert.ok(generateDrillingPlan(fixture({ depth: 80 }).project).errors.some(e => e.code === 'joint-too-short'));
});

test('narrow cabinets stagger opposed pilot bores without intersecting receiving holes', () => {
  const { project } = fixture({ width: 100 });
  const plan = generateDrillingPlan(project);
  assertPaired(plan);
  const top = plan.parts.find(p => p.name === 'Крышка'), pilots = plan.holes.filter(h => h.partId === top.id && h.kind === 'pilot');
  const left = pilots.filter(h => h.face === 'edge-a-min'), right = pilots.filter(h => h.face === 'edge-a-max');
  for (const first of left) for (const second of right) assert.ok(Math.abs(first.b - second.b) >= 7);
});

test('separate 5 mm pilot bores also reserve their wider 7 mm screw threads', () => {
  const { project } = fixture({ width: 100 });
  const source = generateParts({ ...project, settings: { ...project.settings, deductEdge: true } });
  const rightSide = source.find(part => part.name === 'Боковина правая');
  rightSide.width -= 6; rightSide.finishedWidth -= 6;
  const plan = generateDrillingPlan(project, { parts: source });
  assertPaired(plan);
  const top = plan.parts.find(part => part.name === 'Крышка'), pilots = plan.holes.filter(hole => hole.partId === top.id && hole.kind === 'pilot');
  const left = pilots.filter(hole => hole.face === 'edge-a-min'), right = pilots.filter(hole => hole.face === 'edge-a-max');
  for (const first of left) for (const second of right) assert.ok(Math.abs(first.b - second.b) >= 7, 'wider screw threads must not meet');
});

test('aligned vertical dividers on both sides of one separator report inaccessible screw heads', () => {
  const { project, cabinet } = fixture();
  const row = id => ({ id, kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection(), id: `${id}-left` }, { ...createSection(), id: `${id}-right` }
  ] });
  cabinet.layout = { id: 'rows', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [row('upper'), row('lower')] };
  const plan = generateDrillingPlan(project);
  assert.equal(plan.valid, false);
  assert.equal(plan.errors.filter(e => e.code === 'unsupported-cross-joint').length, 2);
});

test('numeric settings are checked before generating manufacturing operations', () => {
  for (const settings of [{ endOffset: -1 }, { pilotExtraDepth: -1 }, { clearanceDiameter: 6 }, { pilotDiameter: 7 }, { countersinkDepth: 18 }]) {
    const { project } = fixture({}, settings), plan = generateDrillingPlan(project);
    assert.equal(plan.valid, false, JSON.stringify(settings));
    assert.ok(plan.errors.length);
  }
  const explicit = generateDrillingPlan(fixture({}, { countersinkDepth: 1.5, pilotExtraDepth: 3 }).project);
  assertPaired(explicit);
  assert.ok(explicit.holes.filter(h => h.kind === 'countersink').every(h => h.depth === 1.5 && !h.requiresSetup));
  assert.ok(explicit.holes.filter(h => h.kind === 'pilot').every(h => h.depth === 35));
});

test('supplied production parts keep global P identifiers across cabinets', () => {
  const { project, cabinet } = fixture();
  project.cabinets.push({ ...structuredClone(cabinet), id: 'second', x: 2500, rotation: 90 });
  const source = generateParts({ ...project, settings: { ...project.settings, deductEdge: true } });
  const plan = generateDrillingPlan(project, { parts: source });
  assertPaired(plan);
  assert.deepEqual(plan.parts.map(p => p.partCode), source.map((_, index) => `P${String(index + 1).padStart(4, '0')}`));
  assert.equal(new Set(plan.holes.map(h => h.id)).size, plan.holes.length);
  assert.equal(plan.joints.length, 8);
});
