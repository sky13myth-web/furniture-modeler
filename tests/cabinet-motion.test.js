import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, canPlaceCabinet } from '../src/engine.js';
import { resolveCabinetMovement, canApplyCabinetMovement } from '../src/cabinet-motion.js';

function fixture(overrides = {}) {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  project.room = { width: 3000, depth: 2500, height: 2800, windows: [], installationClearance: { walls: 10, ceiling: 20 } };
  Object.assign(cabinet, { width: 400, height: 700, depth: 300, x: 200, y: 0, z: 200, rotation: 0, plinth: 0, layout: createSection('open'), ...overrides });
  return { project, cabinet };
}

test('free translation preserves an exact requested position and never mutates production data', () => {
  const { project, cabinet } = fixture(), original = structuredClone(project);
  const result = resolveCabinetMovement(cabinet, { x: 900.375, z: 801.125 }, project);
  assert.deepEqual([result.x, result.z, result.valid, result.fits, result.blocked, result.slid], [900.375, 801.125, true, true, false, false]);
  assert.deepEqual(project, original);
  const stationary = resolveCabinetMovement(cabinet, { x: cabinet.x, z: cabinet.z }, project);
  assert.deepEqual([stationary.x, stationary.z, stationary.contacts.length], [cabinet.x, cabinet.z, 0]);
});

test('a large diagonal sweep contacts the wall and spends the remaining motion sliding along it', () => {
  const { project, cabinet } = fixture();
  const result = resolveCabinetMovement(cabinet, { x: -1000, z: 1400 }, project);
  assert.ok(result.x >= 10 && result.x < 10.05);
  assert.ok(Math.abs(result.z - 1400) < .05);
  assert.equal(result.blocked, true);
  assert.equal(result.slid, true);
  assert.equal(canPlaceCabinet({ ...cabinet, ...result }, project), true);
  assert.equal(result.contacts.some(contact => contact.kind === 'wall'), true);
  const reverse = resolveCabinetMovement({ ...cabinet, ...result }, { x: result.x + 20, z: result.z }, project);
  assert.equal(reverse.x, result.x + 20, 'moving away from contact starts immediately');
});

test('a valid endpoint cannot tunnel through even a two-millimetre cabinet obstacle', () => {
  const { project, cabinet } = fixture({ width: 100, depth: 100 });
  project.cabinets.push({ ...structuredClone(cabinet), id: 'thin', width: 2, x: 700, z: 10, depth: 2200 });
  const target = { x: 1700, z: 200 };
  assert.equal(canPlaceCabinet({ ...cabinet, ...target }, project), true);
  const result = resolveCabinetMovement(cabinet, target, project);
  assert.ok(result.x < 600 && result.x > 599.95);
  assert.equal(result.z, 200);
  assert.equal(result.blocked, true);
  assert.equal(result.fits, true);
  assert.equal(result.contacts.some(contact => contact.id === 'thin'), true);
});

test('cabinet contact slides along a neighbour and allows floor-plan overlap for touching stacked units', () => {
  const { project, cabinet } = fixture();
  project.cabinets.push({ ...structuredClone(cabinet), id: 'neighbour', x: 1100, z: 100, depth: 1600 });
  const result = resolveCabinetMovement(cabinet, { x: 1400, z: 1000 }, project);
  assert.ok(result.x > 699.95 && result.x < 700);
  assert.ok(Math.abs(result.z - 1000) < .05);
  assert.equal(result.slid, true);
  assert.equal(result.fits, true);
  project.cabinets[1].y = cabinet.height;
  const above = resolveCabinetMovement(cabinet, { x: 1400, z: 1000 }, project);
  assert.deepEqual([above.x, above.z, above.blocked], [1400, 1000, false]);
});

test('an imported outside cabinet may improve gradually but cannot worsen or cross a new obstacle', () => {
  const { project, cabinet } = fixture({ x: -100, width: 400 });
  const result = resolveCabinetMovement(cabinet, { x: -20, z: 300 }, project);
  assert.deepEqual([result.x, result.z, result.valid, result.fits], [-20, 300, true, false]);
  assert.equal(canApplyCabinetMovement(cabinet, result, project), true);
  const worse = resolveCabinetMovement(cabinet, { x: -200, z: 200 }, project);
  assert.ok(Math.abs(worse.x - cabinet.x) < .001);
  assert.equal(worse.valid, true);
  const acrossRoom = resolveCabinetMovement(cabinet, { x: 2690, z: 200 }, project);
  assert.ok(acrossRoom.x > 2589.9 && acrossRoom.x < 2590.05, 'after repairing the old outside position it cannot exit through another wall');
  assert.equal(acrossRoom.fits, true);
  project.cabinets.push({ ...structuredClone(cabinet), id: 'new-obstacle', x: 800, z: 10, width: 2, depth: 2200 });
  const blocked = resolveCabinetMovement(cabinet, { x: 1600, z: 200 }, project);
  assert.ok(blocked.x > 399.9 && blocked.x < 400);
  assert.equal(blocked.valid, true);
  assert.equal(blocked.fits, true);
});

test('release validation rejects a room or neighbour changed since the movement was resolved', () => {
  const { project, cabinet } = fixture();
  const result = resolveCabinetMovement(cabinet, { x: 900, z: 800 }, project);
  assert.equal(canApplyCabinetMovement(cabinet, result, project), true);
  project.cabinets.push({ ...structuredClone(cabinet), id: 'late-neighbour', x: 950, z: 800 });
  assert.equal(canApplyCabinetMovement(cabinet, result, project), false);
});
