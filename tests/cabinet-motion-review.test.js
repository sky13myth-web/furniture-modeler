import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlaceCabinet, canEditCabinetPlacement, validateCabinetPlacement } from '../src/engine.js';
import { resolveCabinetMovement, canApplyCabinetMovement } from '../src/cabinet-motion.js';

const section = overrides => ({ id: 'opening', kind: 'section', front: 'open', shelves: 0, doors: 0, drawers: 0, depth: null, ...overrides });
const cabinet = overrides => ({ id: 'moving', name: 'Review cabinet', type: 'base', x: 200, z: 200, y: 0, width: 300, depth: 300, height: 1000, plinth: 0, rotation: 0, materialId: 'body', frontMaterialId: 'body', includeBack: false, layout: section(), ...overrides });
const project = (c, others = [], room = {}) => ({
  materials: [{ id: 'body', thickness: 18 }, { id: 'thick-front', thickness: 50 }],
  room: { width: 4000, depth: 4000, height: 4000, installationClearance: { walls: 0, ceiling: 0 }, ...room },
  cabinets: [c, ...others]
});
const near = (actual, expected, tolerance = 0.1) => assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${actual} to be within ${tolerance} of ${expected}`);
const validResult = (c, result, p) => {
  assert.equal(result.valid, true);
  assert.equal(result.fits, true);
  assert.equal(canApplyCabinetMovement(c, result, p), true);
  assert.equal(canPlaceCabinet({ ...c, x: result.x, z: result.z }, p), true);
};

test('review: angular wall slide respects Euclidean clearance in either outline orientation', () => {
  const c = cabinet({ x: 800, z: 800 });
  const outline = [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 0, z: 4000 }];
  const p = project(c, [], { outline, installationClearance: { walls: 20, ceiling: 10 } });
  assert.equal(canPlaceCabinet(c, p), true);
  const result = resolveCabinetMovement(c, { x: 3500, z: 1500 }, p);
  validResult(c, result, p);
  assert.equal(result.blocked, true);
  assert.equal(result.slid, true);
  assert.ok(result.x > 2400 && result.z < 1000, 'the remaining motion follows the sloping wall');
  near(result.x + result.z, 4000 - c.width - c.depth - 20 * Math.SQRT2);
  assert.ok(validateCabinetPlacement({ ...c, ...result }, p).wallClearance >= 19.998);
  const reversed = resolveCabinetMovement(c, { x: 3500, z: 1500 }, { ...p, room: { ...p.room, outline: [...outline].reverse() } });
  validResult(c, reversed, { ...p, room: { ...p.room, outline: [...outline].reverse() } });
  near(reversed.x, result.x); near(reversed.z, result.z);
});

test('review: two simultaneous corner contacts stop safely and pointer reversal immediately moves away', () => {
  const c = cabinet(), p = project(c, [], { installationClearance: { walls: 20, ceiling: 10 } });
  const corner = resolveCabinetMovement(c, { x: 10000, z: 10000 }, p);
  validResult(c, corner, p);
  near(corner.x, 3680); near(corner.z, 3680);
  const atCorner = { ...c, x: corner.x, z: corner.z };
  const back = resolveCabinetMovement(atCorner, { x: corner.x - 12, z: corner.z - 8 }, p);
  validResult(atCorner, back, p);
  near(back.x, corner.x - 12); near(back.z, corner.z - 8);
  assert.equal(back.blocked, false);
});

test('review: valid endpoints cannot tunnel across a 2 mm concave room projection', () => {
  const c = cabinet({ x: 200, z: 500 }), p = project(c, [], {
    width: 2500, depth: 2000,
    outline: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1400 }, { x: 1002, z: 1400 }, { x: 1002, z: 0 }, { x: 2500, z: 0 }, { x: 2500, z: 2000 }, { x: 0, z: 2000 }]
  });
  const target = { x: 1800, z: 500 };
  assert.equal(canPlaceCabinet(c, p), true);
  assert.equal(canPlaceCabinet({ ...c, ...target }, p), true, 'endpoint validation alone would miss this wall');
  const result = resolveCabinetMovement(c, target, p);
  validResult(c, result, p);
  assert.equal(result.blocked, true);
  assert.ok(result.x <= 700.02 && result.x > 699.8);
  near(result.z, c.z);
});

test('review: a whole-room cabinet barrier cannot be crossed by one large drag event', () => {
  const c = cabinet({ x: 200, z: 600 });
  const barrier = cabinet({ id: 'barrier', x: 1200, z: 0, width: 60, depth: 2000, height: 1600 });
  const p = project(c, [barrier], { width: 2500, depth: 2000 }), target = { x: 1600, z: 600 };
  assert.equal(canPlaceCabinet(c, p), true);
  assert.equal(canPlaceCabinet({ ...c, ...target }, p), true);
  const result = resolveCabinetMovement(c, target, p);
  validResult(c, result, p);
  assert.equal(result.blocked, true);
  near(result.x, 900);
  near(result.z, c.z);
});

test('review: a brief concave-corner graze cannot hide between valid midpoint and endpoint', () => {
  const c = cabinet({ x: 200, z: 1499 });
  const p = project(c, [], { width: 4000, depth: 2000,
    outline: [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1400 }, { x: 1002, z: 1400 }, { x: 1002, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 2000 }, { x: 0, z: 2000 }]
  });
  const target = { x: 3000, z: 1499 - 99 / .285 };
  const interpolate = t => ({ ...c, x: c.x + (target.x - c.x) * t, z: c.z + (target.z - c.z) * t });
  assert.equal(canPlaceCabinet(c, p), true);
  assert.equal(canPlaceCabinet(interpolate(.5), p), true);
  assert.equal(canPlaceCabinet(interpolate(1), p), true);
  assert.equal(canPlaceCabinet(interpolate(.286), p), false, 'less than 4 mm of the sweep clips the narrow corner');
  const result = resolveCabinetMovement(c, target, p);
  validResult(c, result, p);
  assert.ok(result.blocked || result.slid, 'the prohibited straight segment must be changed');
  assert.ok(result.contacts.length > 0);
});

test('review: a rotated 50 mm facade sets the wall contact, while a recessed facade does not protrude', () => {
  const closed = cabinet({ x: 800, z: 200, rotation: 90, frontMaterialId: 'thick-front', layout: section({ front: 'doors', doors: 1 }) });
  const p = project(closed, [], { installationClearance: { walls: 20, ceiling: 0 } });
  const result = resolveCabinetMovement(closed, { x: 50, z: 200 }, p);
  validResult(closed, result, p);
  near(result.x, 370);
  const open = { ...closed, layout: section() }, openProject = { ...p, cabinets: [open] };
  const openResult = resolveCabinetMovement(open, { x: 50, z: 200 }, openProject);
  validResult(open, openResult, openProject);
  near(openResult.x, 320);
  near(result.x - openResult.x, 50);
  const recessed = { ...closed, layout: section({ front: 'doors', doors: 1, depth: 200 }) }, recessedProject = { ...p, cabinets: [recessed] };
  const recessedResult = resolveCabinetMovement(recessed, { x: 50, z: 200 }, recessedProject);
  validResult(recessed, recessedResult, recessedProject);
  near(recessedResult.x, openResult.x);
});

test('review: vertically touching stacked furniture is passable, but one millimetre of height overlap blocks', () => {
  const c = cabinet({ x: 500, z: 600 });
  const overhead = cabinet({ id: 'overhead', x: 1200, z: 600, y: 1000 });
  const p = project(c, [overhead]), target = { x: 1400, z: 600 };
  const pass = resolveCabinetMovement(c, target, p);
  validResult(c, pass, p);
  near(pass.x, target.x); near(pass.z, target.z);
  assert.equal(pass.blocked, false);
  const low = { ...overhead, y: 999 }, blockedProject = { ...p, cabinets: [c, low] };
  const stop = resolveCabinetMovement(c, target, blockedProject);
  validResult(c, stop, blockedProject);
  assert.equal(stop.blocked, true);
  assert.ok(stop.x <= 900.02);
});

test('review: the empty corner of an L cabinet is usable space, not a solid bounding rectangle', () => {
  const c = cabinet({ x: 300, z: 300, width: 600, depth: 600, cutout: { corner: 'back-left', width: 200, depth: 200 } });
  const inNotch = cabinet({ id: 'in-notch', x: 350, z: 350, width: 100, depth: 100 });
  const p = project(c, [inNotch]);
  assert.equal(canPlaceCabinet(c, p), true);
  const result = resolveCabinetMovement(c, { x: 320, z: 320 }, p);
  validResult(c, result, p);
  near(result.x, 320); near(result.z, 320);
  assert.equal(result.blocked, false);
});

test('review: signed room coordinates and arbitrary drag sizes preserve immutability', () => {
  const c = cabinet({ x: -800, z: -600 });
  const p = project(c, [], { outline: [{ x: -1500, z: -1000 }, { x: 1000, z: -1000 }, { x: 1000, z: 1000 }, { x: -1500, z: 1000 }], installationClearance: { walls: 10, ceiling: 0 } });
  const before = structuredClone(p), result = resolveCabinetMovement(c, { x: -1400, z: -800 }, p);
  validResult(c, result, p);
  near(result.x, -1400); near(result.z, -800);
  assert.deepEqual(p, before);
  const bad = resolveCabinetMovement(c, { x: Infinity, z: NaN }, p);
  near(bad.x, c.x); near(bad.z, c.z);
  assert.equal(Number.isFinite(bad.x) && Number.isFinite(bad.z), true);
  assert.equal(canApplyCabinetMovement(c, { x: NaN, z: 0 }, p), false);
  assert.deepEqual(p, before);
});

test('review: a legacy overlap cannot worsen briefly and hide that increase before the midpoint', () => {
  const c = cabinet({ x: 1100, z: 850 });
  const obstacle = cabinet({ id: 'overlap', x: 1000, z: 1000 });
  const p = project(c, [obstacle]), target = { x: 2100, z: 1650 };
  assert.equal(canPlaceCabinet(c, p), false);
  assert.equal(canPlaceCabinet({ ...c, ...target }, p), true);
  assert.equal(canEditCabinetPlacement(c, { ...c, x: 1106.25, z: 855 }, p), false, 'the early overlap grows even though midpoint and endpoint improve');
  const result = resolveCabinetMovement(c, target, p);
  assert.equal(result.valid, true);
  assert.equal(canApplyCabinetMovement(c, result, p), true);
  assert.ok(result.blocked || result.slid || result.contacts.length > 0, 'the prohibited direct sweep must stop or change direction');
  if (!result.slid) {
    const early = { ...c, x: c.x + (result.x - c.x) * .00625, z: c.z + (result.z - c.z) * .00625 };
    assert.equal(canEditCabinetPlacement(c, early, p), true, 'an accepted unslid segment cannot deepen the legacy overlap');
  } else assert.ok(result.contacts.length > 0, 'a changed direction must come from a real limiting contact');
});
