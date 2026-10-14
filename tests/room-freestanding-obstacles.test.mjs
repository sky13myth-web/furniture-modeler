import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isObstacle,
  wallIndexOf,
  createObstacle,
  obstacleGeometry,
  obstacleDepth,
  obstacleLabel,
  findObstacleConflicts
} from '../src/room-obstacles.js';
import { validateProject } from '../src/engine.js';
import { makeScene } from '../src/renderer.js';

function baseProject(cabinets = [], windows = []) {
  return {
    settings: { kerf: 3, margin: 10 },
    materials: [
      { id: 'm1', name: 'ЛДСП 16', thickness: 16, sheetWidth: 2800, sheetHeight: 2070 }
    ],
    room: {
      width: 5000,
      depth: 5000,
      height: 2700,
      wallThickness: 150,
      windows
    },
    cabinets
  };
}

test('createObstacle and isObstacle support freestanding pillars and columns', () => {
  const pillar = createObstacle('pillar', { x: 1500, z: 2000, width: 450, depth: 450, roomHeight: 2800 });
  assert.equal(pillar.kind, 'pillar');
  assert.equal(pillar.freestanding, true);
  assert.equal(pillar.x, 1500);
  assert.equal(pillar.z, 2000);
  assert.equal(pillar.width, 450);
  assert.equal(pillar.depth, 450);
  assert.equal(pillar.height, 2800);
  assert.equal(isObstacle(pillar), true);
  assert.equal(wallIndexOf(pillar), null);

  const column = createObstacle('column', { x: 2200, z: 1800, width: 500, depth: 300 });
  assert.equal(column.kind, 'column');
  assert.equal(column.freestanding, true);
  assert.equal(isObstacle(column), true);
  assert.equal(wallIndexOf(column), null);

  // Objects with type: 'pillar' or 'column'
  assert.equal(isObstacle({ type: 'pillar' }), true);
  assert.equal(isObstacle({ type: 'column' }), true);
  assert.equal(isObstacle({ freestanding: true }), true);
});

test('obstacleDepth and obstacleLabel handle pillars and columns', () => {
  assert.equal(obstacleDepth({ kind: 'pillar', depth: 400 }), 400);
  assert.equal(obstacleDepth({ type: 'column', depth: 350 }), 350);
  assert.equal(obstacleDepth({ freestanding: true, depth: 500 }), 500);

  assert.ok(obstacleLabel({ kind: 'pillar' }).includes('Колонна'));
  assert.ok(obstacleLabel({ type: 'column' }).includes('Колонна'));
});

test('obstacleGeometry calculates footprint and bounds for freestanding columns', () => {
  const room = { width: 5000, depth: 5000, height: 2700 };
  const column = {
    id: 'col-1',
    kind: 'column',
    freestanding: true,
    x: 1000,
    z: 1200,
    width: 400,
    depth: 300,
    height: 2700,
    rotation: 0
  };

  const geom = obstacleGeometry(room, column);
  assert.ok(geom);
  assert.equal(geom.freestanding, true);
  assert.equal(geom.width, 400);
  assert.equal(geom.depth, 300);
  assert.equal(geom.bottom, 0);
  assert.equal(geom.top, 2700);

  // Check 4 footprint vertices: (1000, 1200), (1400, 1200), (1400, 1500), (1000, 1500)
  assert.deepEqual(geom.footprint, [
    { x: 1000, z: 1200 },
    { x: 1400, z: 1200 },
    { x: 1400, z: 1500 },
    { x: 1000, z: 1500 }
  ]);

  // Check bounding box
  assert.equal(geom.bounds.minX, 1000);
  assert.equal(geom.bounds.maxX, 1400);
  assert.equal(geom.bounds.minZ, 1200);
  assert.equal(geom.bounds.maxZ, 1500);
  assert.equal(geom.bounds.width, 400);
  assert.equal(geom.bounds.depth, 300);

  // Check virtual frame compatibility
  assert.ok(geom.frame);
  assert.equal(geom.frame.freestanding, true);
  assert.ok(geom.frame.inward);
  assert.ok(geom.frame.u);
});

test('obstacleGeometry calculates rotated footprint for freestanding obstacles', () => {
  const room = { width: 5000, depth: 5000, height: 2700 };
  const pillar = {
    id: 'pil-1',
    kind: 'pillar',
    freestanding: true,
    x: 1000,
    z: 1000,
    width: 400,
    depth: 400,
    rotation: 90
  };

  const geom = obstacleGeometry(room, pillar);
  assert.ok(geom);
  // Rotated 90 degrees about (1000, 1000):
  // local (0, 0) -> (1000, 1000)
  // local (400, 0) -> (1000, 1400)
  // local (400, 400) -> (600, 1400)
  // local (0, 400) -> (600, 1000)
  assert.equal(Math.round(geom.footprint[0].x), 1000);
  assert.equal(Math.round(geom.footprint[0].z), 1000);
  assert.equal(Math.round(geom.footprint[1].x), 1000);
  assert.equal(Math.round(geom.footprint[1].z), 1400);
  assert.equal(Math.round(geom.footprint[2].x), 600);
  assert.equal(Math.round(geom.footprint[2].z), 1400);
  assert.equal(Math.round(geom.footprint[3].x), 600);
  assert.equal(Math.round(geom.footprint[3].z), 1000);
});

test('findObstacleConflicts detects collision with freestanding pillar', () => {
  const pillar = {
    id: 'col-1',
    kind: 'pillar',
    freestanding: true,
    x: 1500,
    z: 1500,
    width: 400,
    depth: 400,
    height: 2700
  };

  // Cabinet 1 collides with column (x = 1400 to 2000, z = 1400 to 2000)
  const collidingCab = {
    id: 'cab-1',
    name: 'Тумба 1',
    type: 'base',
    x: 1400,
    y: 0,
    z: 1400,
    width: 600,
    height: 850,
    depth: 600,
    rotation: 0
  };

  // Cabinet 2 is far away (x = 3000 to 3600, z = 500 to 1100)
  const safeCab = {
    id: 'cab-2',
    name: 'Тумба 2',
    type: 'base',
    x: 3000,
    y: 0,
    z: 500,
    width: 600,
    height: 850,
    depth: 600,
    rotation: 0
  };

  const project = baseProject([collidingCab, safeCab], [pillar]);
  const conflicts = findObstacleConflicts(project);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].cabinet.id, 'cab-1');
  assert.equal(conflicts[0].obstacle.id, 'col-1');
});

test('validateProject validates freestanding columns and reports dimension errors or conflicts', () => {
  // Valid freestanding column
  const validPillar = {
    id: 'col-ok',
    kind: 'pillar',
    freestanding: true,
    x: 2000,
    z: 2000,
    width: 400,
    depth: 400,
    height: 2700,
    sill: 0
  };

  const projectValid = baseProject([], [validPillar]);
  const warningsValid = validateProject(projectValid);
  const errorsValid = warningsValid.filter(w => w.level === 'error');
  assert.equal(errorsValid.length, 0, 'Valid freestanding column should produce 0 errors');

  // Invalid column: negative width
  const invalidPillar = {
    id: 'col-bad',
    kind: 'pillar',
    freestanding: true,
    x: 2000,
    z: 2000,
    width: -100,
    depth: 400,
    height: 2700
  };

  const projectInvalid = baseProject([], [invalidPillar]);
  const warningsInvalid = validateProject(projectInvalid);
  const columnError = warningsInvalid.find(w => w.level === 'error' && w.message.includes('Колонна или пилон'));
  assert.ok(columnError, 'Must emit error for invalid column dimensions');
});

test('makeScene renders 3D mesh faces for freestanding column obstacles', () => {
  const column = {
    id: 'col-3d',
    kind: 'column',
    freestanding: true,
    x: 1500,
    z: 1500,
    width: 400,
    depth: 400,
    height: 2700,
    sill: 0
  };

  const project = baseProject([], [column]);
  const scene = makeScene(project, { room: true, allFaces: true }, null);
  assert.ok(scene);
  assert.ok(Array.isArray(scene.faces));

  const columnFaces = scene.faces.filter(f => f.obstacleId === 'col-3d');
  // Box has 4 vertical side walls + 1 top face = 5 faces (or 6 if sill > 0)
  assert.ok(columnFaces.length >= 5, `Freestanding column must generate 3D faces (got ${columnFaces.length})`);
});
