import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createObstacle,
  normalizeObstacle,
  obstacleGeometry,
  findObstacleConflicts,
  suggestCabinetCutout,
  setPipeOrientation,
  isObstacle
} from '../src/room-obstacles.js';
import { createDefaultProject, createSection, validateProject } from '../src/engine.js';
import { checkImport } from '../src/project-io.js';
import { FurnitureViewport, makeScene } from '../src/renderer.js';

function mockCanvas() {
  const context = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) },
    { get: (target, key) => key in target ? target[key] : () => {} }
  );
  return {
    style: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 950, height: 800, left: 0, top: 0 }),
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {}
  };
}

test('obstacleGeometry generates correct footprint, pipe axis and clamps', () => {
  const room = { width: 3000, depth: 3000, height: 2700, walls: [] };
  const riser = createObstacle('pipe', { id: 'p1', wallIndex: 0, wallLength: 3000, roomHeight: 2700, orientation: 'vertical' });
  riser.offset = 500;
  riser.diameter = 32;
  riser.standoff = 20;

  const geom = obstacleGeometry(room, riser);
  assert.ok(geom);
  assert.equal(geom.id, 'p1');
  assert.equal(geom.kind, 'pipe');
  assert.equal(geom.depth, 52); // 32 + 20
  assert.equal(geom.pipe.axis, 'y');
  assert.equal(geom.pipe.radius, 16);
  assert.equal(geom.pipe.length, 2700);
  assert.ok(geom.clamps.length >= 2);
  assert.equal(geom.footprint.length, 4);

  // Horizontal pipe
  const horiz = setPipeOrientation(riser, 'horizontal', { wallLength: 3000, roomHeight: 2700 });
  const horizGeom = obstacleGeometry(room, horiz);
  assert.ok(horizGeom);
  assert.equal(horizGeom.pipe.axis, 'wall');
  assert.equal(horizGeom.pipe.radius, 16);

  // Box protrusion
  const box = createObstacle('box', { id: 'b1', wallIndex: 0, wallLength: 3000, roomHeight: 2700 });
  box.offset = 2600;
  box.width = 400;
  box.depth = 250;
  const boxGeom = obstacleGeometry(room, box);
  assert.ok(boxGeom);
  assert.equal(boxGeom.id, 'b1');
  assert.equal(boxGeom.kind, 'box');
  assert.equal(boxGeom.depth, 250);
});

test('checkImport validates pipe and box room obstacles correctly', () => {
  const project = createDefaultProject('ru');
  project.room.windows = [
    { id: 'p1', kind: 'pipe', wallIndex: 0, offset: 100, width: 32, height: 2700, sill: 0, diameter: 32, standoff: 20, orientation: 'vertical' },
    { id: 'b1', kind: 'box', wallIndex: 1, offset: 200, width: 300, height: 2700, sill: 0, depth: 250 }
  ];

  const valid = checkImport(project);
  assert.ok(valid);
  assert.equal(project.room.windows.length, 2);
  assert.ok(isObstacle(project.room.windows[0]));
  assert.ok(isObstacle(project.room.windows[1]));

  // Invalid pipe standoff / diameter
  const badPipe = { ...project.room.windows[0], diameter: -5 };
  assert.throws(() => checkImport({ ...project, room: { ...project.room, windows: [badPipe] } }));
});

test('findObstacleConflicts detects collision with cabinet and suggestCabinetCutout suggests notch', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  // Default cabinet is placed at x=450, z=10, width=1200, depth=620 on wall 0 (back wall along X from 0 to 3000, depth Z>0)
  // Let's place a riser pipe at wall 0, offset 500 (inside cabinet's x range: 450..1650, near rear wall z=0..52)
  const pipe = normalizeObstacle({
    id: 'pipe-collision',
    kind: 'pipe',
    wallIndex: 0,
    offset: 500,
    width: 32,
    height: 2700,
    sill: 0,
    diameter: 32,
    standoff: 20,
    orientation: 'vertical'
  });
  project.room.windows = [pipe];

  const conflicts = findObstacleConflicts(project);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].cabinet.id, cabinet.id);
  assert.equal(conflicts[0].obstacle.id, pipe.id);

  // Validation produces warning
  const val = validateProject(project);
  assert.ok(val.some(w => w.message.includes('упирается в трубу')));

  // Suggest cutout
  const suggestion = suggestCabinetCutout(cabinet, conflicts[0].obstacle);
  assert.ok(suggestion);
  assert.equal(suggestion.corner, 'back-left');
  assert.ok(suggestion.width > 0);
  assert.ok(suggestion.depth > 0);

  // Applying cutout eliminates conflict
  cabinet.cutout = {
    corner: suggestion.corner,
    width: suggestion.width,
    depth: suggestion.depth
  };
  const afterConflicts = findObstacleConflicts(project);
  assert.equal(afterConflicts.length, 0);
});

test('3D scene renders obstacles without cutting holes in walls', () => {
  const project = createDefaultProject('ru');
  const pipe = normalizeObstacle({
    id: 'test-pipe',
    kind: 'pipe',
    wallIndex: 0,
    offset: 200,
    width: 32,
    height: 2700,
    sill: 0,
    diameter: 32,
    standoff: 20,
    orientation: 'vertical'
  });
  project.room.windows = [pipe];

  const scene = makeScene(project, { room: true });
  const obstacleFaces = scene.faces.filter(f => f.obstacle);
  assert.ok(obstacleFaces.length > 0, 'scene contains obstacle faces');
  const pipeLines = scene.lines.filter(l => l.obstacle && l.obstacleKind === 'pipe');
  assert.ok(pipeLines.length >= 2, 'pipe generates silhouette lines and highlight');

  // Also test box obstacle
  const box = createObstacle('box', { id: 'test-box', wallIndex: 0, wallLength: 3000, roomHeight: 2700 });
  project.room.windows = [pipe, box];
  const sceneWithBox = makeScene(project, { room: true });
  const boxFaces = sceneWithBox.faces.filter(f => f.obstacle && f.obstacleKind === 'box');
  assert.ok(boxFaces.length >= 5, 'box has at least 5 faces (4 walls + top cap)');
  assert.ok(boxFaces.every(f => f.stroke && f.stroke !== 'transparent'), 'box faces have visible stroke');
  const boxLines = sceneWithBox.lines.filter(l => l.obstacle && l.obstacleKind === 'box');
  assert.ok(boxLines.length >= 8, 'box has corner seam lines and perimeter edges');

  const viewport = new FurnitureViewport(mockCanvas());
  try {
    viewport.setProject(project);
    viewport.setOptions({ room: true });
    const obstacles = viewport.hits.filter(h => h.component === 'obstacle');
    assert.ok(obstacles.length > 0, 'viewport hits contain obstacle components');
  } finally {
    viewport.destroy();
  }
});

test('twin doors mounted on a shared partition open outwards without intersecting', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  cabinet.width = 1200;
  cabinet.depth = 600;
  // Two sections with doors: left door hinged right, right door hinged left (both on shared partition)
  cabinet.layout = {
    id: 'shared-columns',
    kind: 'split',
    axis: 'vertical',
    sizes: [1, 1],
    children: [
      {
        ...createSection('doors'),
        id: 'col-left',
        doors: 1,
        doorOpenings: ['right']
      },
      {
        ...createSection('doors'),
        id: 'col-right',
        doors: 1,
        doorOpenings: ['left']
      }
    ]
  };

  const viewport = new FurnitureViewport(mockCanvas());
  try {
    viewport.setProject(project, cabinet.id);
    viewport.setOptions({ room: false, focusCabinet: true, doorsOpen: true });

    const openDoors = viewport.hits.filter(h => h.component === 'front' && h.doorOpening);
    assert.ok(openDoors.length > 0, 'open door front faces rendered');

    const leftFaces = openDoors.filter(h => h.sectionId === 'col-left');
    const rightFaces = openDoors.filter(h => h.sectionId === 'col-right');
    assert.ok(leftFaces.length > 0 && rightFaces.length > 0);

    const leftX = leftFaces.flatMap(h => h.points.map(p => p[0]));
    const rightX = rightFaces.flatMap(h => h.points.map(p => p[0]));

    const maxLeftX = Math.max(...leftX);
    const minRightX = Math.min(...rightX);

    // Left door (right-hinged on partition) swings open forward along its own hinge plane
    // Right door (left-hinged on partition) swings open forward along its own hinge plane
    // The two open doors must remain separated along X (no intersection)
    assert.ok(maxLeftX <= minRightX + 1, `left door panel (${maxLeftX}) must not invade right door space (${minRightX})`);
  } finally {
    viewport.destroy();
  }
});
