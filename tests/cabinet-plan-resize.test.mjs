import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getApplianceFit, canPlaceCabinet, canEditCabinetPlacement } from '../src/engine.js';
import { resizeCabinetOnPlan } from '../src/cabinet-plan-resize.js';

function fixture(overrides = {}) {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  project.room = { width: 3000, depth: 2500, height: 2800, windows: [], installationClearance: { walls: 10, ceiling: 20 } };
  // Explicit workshop rear stock keeps this scenario independent of factory
  // catalog/default rear changes.
  Object.assign(cabinet, { width: 900, height: 2200, depth: 620, x: 200, y: 0, z: 200, rotation: 0, plinth: 0, backThickness: 8, backMaterialId: 'hdf-back', layout: createSection('open'), ...overrides });
  return { project, cabinet };
}
const near = (actual, expected, tolerance = .02) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≈ ${expected}`);
const placed = (result, project) => { assert.equal(result.possible, true); assert.equal(canPlaceCabinet(result.cabinet, project), true); };

test('plan width/depth edits preserve origin, rotation, section contents and source data', () => {
  const { project, cabinet } = fixture({ rotation: 25, x: 700, z: 400 }), original = structuredClone(project);
  cabinet.layout.name = 'Custom section';
  const before = structuredClone(project), result = resizeCabinetOnPlan(cabinet, { width: 1100, depth: 700 }, project);
  placed(result, project);
  assert.deepEqual([result.cabinet.width, result.cabinet.depth, result.clamped], [1100, 700, false]);
  assert.deepEqual([result.cabinet.x, result.cabinet.y, result.cabinet.z, result.cabinet.rotation], [700, 0, 400, 25]);
  assert.deepEqual(result.cabinet.layout, cabinet.layout);
  assert.deepEqual(project, before);
  assert.equal(original.cabinets[0].layout.name, undefined);
});

test('width and depth reductions clamp to appliance dimensions and enabled installation allowances', () => {
  const { project, cabinet } = fixture();
  cabinet.layout.appliance = { type: 'washer', label: 'Actual model', width: 600, height: 850, depth: 500, useClearances: true, clearances: { side: 25, top: 25, rear: 50 } };
  const width = resizeCabinetOnPlan(cabinet, { width: 400 }, project);
  near(width.cabinet.width, 686); assert.equal(width.clamped, true); placed(width, project);
  const depth = resizeCabinetOnPlan(cabinet, { depth: 300 }, project);
  near(depth.cabinet.depth, 558); assert.equal(depth.clamped, true); placed(depth, project);
  for (const result of [width, depth]) {
    const section = getCabinetLayout(result.cabinet, project).sections[0];
    assert.equal(getApplianceFit(section, section.node.appliance).fits, true);
  }
});

test('positive construction minima and library bounds also apply without an appliance', () => {
  const { project, cabinet } = fixture();
  const small = resizeCabinetOnPlan(cabinet, { width: -900, depth: 0 }, project);
  assert.deepEqual([small.cabinet.width, small.cabinet.depth, small.clamped], [100, 100, true]);
  placed(small, project);
  project.room.width = project.room.depth = 10000;
  const large = resizeCabinetOnPlan(cabinet, { width: 10000, depth: 8000 }, project);
  assert.deepEqual([large.cabinet.width, large.cabinet.depth, large.clamped], [6000, 3000, true]);
  assert.equal(resizeCabinetOnPlan(cabinet, { width: NaN }, project).possible, false);
  assert.equal(resizeCabinetOnPlan(cabinet, { depth: Infinity }, project).possible, false);
});

test('growth clamps at a finite wall with a conservative contact inset instead of rejecting the whole edit', () => {
  const { project, cabinet } = fixture();
  const width = resizeCabinetOnPlan(cabinet, { width: 4000 }, project);
  near(width.cabinet.width, 2790); assert.ok(width.cabinet.width < 2790); placed(width, project);
  const depth = resizeCabinetOnPlan(cabinet, { depth: 3000 }, project);
  near(depth.cabinet.depth, 2290); assert.ok(depth.cabinet.depth < 2290); placed(depth, project);
  assert.equal(width.clamped && depth.clamped, true);
});

test('a neighbour limits plan growth while vertically touching furniture remains free', () => {
  const { project, cabinet } = fixture();
  project.cabinets.push({ ...structuredClone(cabinet), id: 'neighbour', width: 500, x: 1400, z: 200 });
  const result = resizeCabinetOnPlan(cabinet, { width: 2000 }, project);
  near(result.cabinet.width, 1200); assert.ok(result.cabinet.width < 1200); placed(result, project);
  project.cabinets[1].y = cabinet.height;
  const stacked = resizeCabinetOnPlan(cabinet, { width: 2000 }, project);
  assert.deepEqual([stacked.cabinet.width, stacked.clamped], [2000, false]);
});

test('rotated plan resizing includes the actual facade beyond body depth', () => {
  const { project, cabinet } = fixture({ rotation: 90, x: 1200, z: 200 });
  cabinet.layout.front = 'doors';
  const result = resizeCabinetOnPlan(cabinet, { depth: 2000 }, project);
  near(result.cabinet.depth, 1172); assert.ok(result.cabinet.depth < 1172); placed(result, project);
  near(result.cabinet.x, cabinet.x, 0); near(result.cabinet.z, cabinet.z, 0);
});

test('legacy placement deficits can improve without silently moving the cabinet or increasing another deficit', () => {
  const { project, cabinet } = fixture({ x: 2500 });
  assert.equal(canPlaceCabinet(cabinet, project), false);
  const shrink = resizeCabinetOnPlan(cabinet, { width: 700 }, project);
  assert.equal(shrink.possible, true); assert.equal(shrink.clamped, false); assert.equal(shrink.cabinet.width, 700);
  assert.equal(canEditCabinetPlacement(cabinet, shrink.cabinet, project), true);
  const growth = resizeCabinetOnPlan(cabinet, { width: 1500 }, project);
  assert.equal(growth.clamped, true); near(growth.cabinet.width, cabinet.width);
  assert.deepEqual([growth.cabinet.x, growth.cabinet.z], [2500, 200]);
});
