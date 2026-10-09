import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoomOutline, normalizeRoomOutline, polygonArea, pointInPolygon, polygonIsSimple, roomBounds, wallLength, getCabinetFootprint, cabinetFootprint, polygonContained, polygonBoundaryDistance, pointSegmentDistance, polygonsOverlap, remapWindows } from '../src/room-geometry.js';

const rectangle = (x, z, width, depth) => [{ x, z }, { x: x + width, z }, { x: x + width, z: z + depth }, { x, z: z + depth }];
const roomU = [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 2000, z: 3000 }, { x: 2000, z: 1000 }, { x: 1000, z: 1000 }, { x: 1000, z: 3000 }, { x: 0, z: 3000 }];
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('wall clearance uses finite segments and exact minimum boundary distance', () => {
  close(pointSegmentDistance({ x: 5, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 }), 3);
  close(pointSegmentDistance({ x: 13, z: 4 }, { x: 0, z: 0 }, { x: 10, z: 0 }), 5);
  close(pointSegmentDistance({ x: 3, z: 4 }, { x: 0, z: 0 }, { x: 0, z: 0 }), 5);
  close(polygonBoundaryDistance(rectangle(10, 20, 100, 200), rectangle(0, 0, 1000, 1000)), 10);
  close(polygonBoundaryDistance(rectangle(0, 0, 10, 10), rectangle(15, 5, 10, 10)), 5);
  close(polygonBoundaryDistance(rectangle(0, 0, 10, 10), rectangle(10, 5, 10, 10)), 0);
  close(polygonBoundaryDistance(rectangle(0, 0, 10, 10), rectangle(5, 5, 10, 10)), 0);
});

test('legacy room falls back to a positive-area rectangle without mutating it', () => {
  const room = { width: 4000, depth: 3000 };
  assert.deepEqual(getRoomOutline(room), rectangle(0, 0, 4000, 3000));
  assert.equal(polygonArea(getRoomOutline(room)), 12000000);
  assert.deepEqual(room, { width: 4000, depth: 3000 });
  assert.equal(polygonArea([...getRoomOutline(room)].reverse()), -12000000);
});

test('outline cloning and bounds support shifted and angled rooms', () => {
  const outline = [{ x: 100, z: 200 }, { x: 3100, z: 200 }, { x: 2100, z: 2200 }, { x: 100, z: 2200 }];
  const room = { width: 5000, depth: 5000, outline };
  const read = getRoomOutline(room);
  read[0].x = 999;
  assert.equal(outline[0].x, 100);
  assert.deepEqual(roomBounds(room), { minX: 100, minZ: 200, maxX: 3100, maxZ: 2200, width: 3000, depth: 2000 });
  close(wallLength(room, 1), Math.hypot(1000, 2000));
  assert.equal(wallLength(room, -1), 0);
  assert.deepEqual(normalizeRoomOutline([...outline, outline[0]]), outline);
});

test('concave containment includes wall points but excludes room recesses', () => {
  assert.equal(pointInPolygon({ x: 1000, z: 2000 }, roomU), true);
  assert.equal(pointInPolygon({ x: 500, z: 2000 }, roomU), true);
  assert.equal(pointInPolygon({ x: 1500, z: 2000 }, roomU), false);
  assert.equal(pointInPolygon({ x: -1, z: 0 }, roomU), false);
  assert.equal(pointInPolygon({ x: 3000, z: 0 }, roomU), true);
  assert.equal(pointInPolygon({ x: NaN, z: 0 }, roomU), false);
});

test('simple polygon validation permits straight added corners and rejects crossings or backtracking', () => {
  assert.equal(polygonIsSimple(roomU), true);
  assert.equal(polygonIsSimple([{ x: 0, z: 0 }, { x: 500, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }]), true);
  assert.equal(polygonIsSimple([{ x: 0, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 1000 }, { x: 1000, z: 0 }]), false);
  assert.equal(polygonIsSimple([{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 500, z: 0 }, { x: 500, z: 1000 }, { x: 0, z: 1000 }]), false);
  assert.equal(polygonIsSimple([...rectangle(0, 0, 1000, 1000), { x: 0, z: 0 }]), false);
  assert.equal(polygonIsSimple([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 20, z: 0 }]), false);
  assert.equal(polygonIsSimple([{ x: 0, z: 0 }, { x: Infinity, z: 0 }, { x: 10, z: 10 }]), false);
});

test('whole-edge containment catches bridges whose vertices are inside a concave room', () => {
  const bridge = rectangle(500, 2000, 2000, 500);
  assert.equal(bridge.every(p => pointInPolygon(p, roomU)), true);
  assert.equal(polygonContained(bridge, roomU), false);
  assert.equal(polygonContained(rectangle(0, 1000, 1000, 1500), roomU), true);
  assert.equal(polygonContained([...roomU].reverse(), roomU), true);
  assert.equal(polygonContained(rectangle(0, 0, 3000, 3000), roomU), false);
});

test('cabinet rear corner notches remove the correct physical footprint', () => {
  for (const corner of ['back-left', 'back-right']) {
    const points = getCabinetFootprint({ width: 1000, depth: 800, cutout: { corner, width: 300, depth: 200 } });
    assert.equal(points.length, 6);
    assert.equal(polygonArea(points), 740000);
    assert.equal(polygonIsSimple(points), true);
    assert.equal(pointInPolygon({ x: corner === 'back-left' ? 100 : 900, z: 100 }, points), false);
    assert.equal(pointInPolygon({ x: 500, z: 500 }, points), true);
  }
  assert.deepEqual(getCabinetFootprint({ width: 1000, depth: 800 }), rectangle(0, 0, 1000, 800));
});

test('cabinet rotation follows the shared origin and X/Z matrix', () => {
  const points = cabinetFootprint({ x: 2000, z: 1000, width: 600, depth: 400, rotation: 90 });
  close(points[0].x, 2000); close(points[0].z, 1000);
  close(points[1].x, 2000); close(points[1].z, 1600);
  close(points[2].x, 1600); close(points[2].z, 1600);
  assert.equal(polygonContained(points, rectangle(0, 0, 3000, 2000)), true);
  const angled = cabinetFootprint({ x: 1500, z: 100, width: 900, depth: 400, rotation: 45 });
  close(polygonArea(angled), 360000);
  assert.equal(polygonIsSimple(angled), true);
});

test('overlap means shared interior area, while adjoining walls or corners are permitted', () => {
  const a = rectangle(0, 0, 1000, 1000);
  assert.equal(polygonsOverlap(a, rectangle(1000, 0, 1000, 1000)), false);
  assert.equal(polygonsOverlap(a, rectangle(1000, 1000, 1000, 1000)), false);
  assert.equal(polygonsOverlap(a, rectangle(999, 0, 1000, 1000)), true);
  assert.equal(polygonsOverlap(a, rectangle(200, 200, 100, 100)), true);
  assert.equal(polygonsOverlap(a, [...a].reverse()), true);
  assert.equal(polygonsOverlap(rectangle(0, 400, 1000, 200), rectangle(400, 0, 200, 1000)), true);
  const notched = getCabinetFootprint({ width: 1000, depth: 1000, cutout: { corner: 'back-right', width: 500, depth: 500 } });
  assert.equal(polygonsOverlap(notched, rectangle(500, 0, 500, 500)), false);
  assert.equal(polygonsOverlap(notched, rectangle(450, 0, 500, 500)), true);
});

test('inserting a wall corner carries openings in the right half to the second segment', () => {
  const room = { width: 2000, depth: 1000, windows: [{ id: 'w1', wall: 'back', offset: 1400, width: 200, height: 500, sill: 700 }] };
  const old = getRoomOutline(room), next = [old[0], { x: 1000, z: 0 }, ...old.slice(1)];
  const result = remapWindows(room, next, { kind: 'insert', oldOutline: old });
  assert.equal(result[0].wallIndex, 1);
  assert.equal(result[0].offset, 400);
  assert.equal(room.windows[0].wallIndex, undefined);
  assert.equal(room.windows[0].offset, 1400);
});

test('drag preserves wall coordinates and corner-crossing openings remain visible to validation', () => {
  const old = rectangle(0, 0, 2000, 1000), next = [old[0], { x: 1000, z: 0 }, ...old.slice(1)];
  const room = { outline: old, windows: [{ id: 'w', wallIndex: 0, offset: 900, width: 300, height: 500, sill: 700 }] };
  const crossing = remapWindows(room, next, { kind: 'insert' })[0];
  assert.equal(crossing.wallIndex, 1);
  assert.equal(crossing.offset, -100);
  const moved = remapWindows(room, rectangle(0, 0, 800, 1000), { kind: 'drag' })[0];
  assert.equal(moved.wallIndex, 0);
  assert.equal(moved.offset, 900);
  assert.equal(moved.width, 300);
});

test('local feature remapping keeps window or door kind and shifts unrelated wall indices', () => {
  const old = rectangle(0, 0, 2000, 1000);
  const next = [old[0], { x: 700, z: 0 }, { x: 700, z: -300 }, { x: 1300, z: -300 }, { x: 1300, z: 0 }, ...old.slice(1)];
  const room = { outline: old, windows: [{ id: 'door', kind: 'door', wallIndex: 1, offset: 100, width: 800, height: 2000, sill: 0 }] };
  const result = remapWindows(room, next, { kind: 'feature' });
  assert.equal(result[0].kind, 'door');
  assert.equal(result[0].wallIndex, 5);
  assert.equal(result[0].offset, 100);
  assert.equal(result[0].sill, 0);
});

test('unchanged walls preserve exact opening positions instead of snapping to a nearby parallel wall', () => {
  const old = [{ x: 0, z: 0 }, { x: 2000, z: 0 }, { x: 2000, z: 1000 }, { x: 1900, z: 1000 }, { x: 1900, z: 2000 }, { x: 0, z: 2000 }];
  const next = [old[0], { x: 700, z: 0 }, { x: 700, z: 300 }, { x: 1300, z: 300 }, { x: 1300, z: 0 }, ...old.slice(1)];
  // Existing invalid geometry should remain visible to validation, not migrate
  // to another wall merely because an unrelated feature was inserted.
  const room = { outline: old, windows: [{ id: 'door', kind: 'door', wallIndex: 1, offset: 1200, width: 600, height: 2000, sill: 0 }] };
  const before = structuredClone(room);
  const [door] = remapWindows(room, next, { kind: 'feature', wallIndex: 0 });
  assert.deepEqual(door, { ...room.windows[0], wallIndex: 5 });
  assert.deepEqual(room, before);
});

test('explicit opening-list overload and reversed unchanged walls preserve world placement', () => {
  const old = rectangle(0, 0, 2000, 1000), reversed = [...old].reverse();
  const room = { outline: old, windows: [] };
  const openings = [{ id: 'door', kind: 'door', wallIndex: 0, offset: 100, width: 800, height: 2000, sill: 0 }];
  const [door] = remapWindows(room, reversed, openings, { kind: 'preset', oldOutline: old });
  assert.equal(door.wallIndex, 2);
  assert.equal(door.offset, 1100);
  assert.equal(openings[0].offset, 100);
  assert.deepEqual(room.windows, []);
});
