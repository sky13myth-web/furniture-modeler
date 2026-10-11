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
import { createDefaultProject, createSection, validateProject, generateParts, getCabinetCutouts } from '../src/engine.js';
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

test('cabinet with obstacles on both sides supports dual rear corner cutouts', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  cabinet.width = 1200;
  cabinet.depth = 600;
  cabinet.x = 200;
  cabinet.z = 10;
  cabinet.y = 0;
  cabinet.rotation = 0;

  // Obstacle on left (wall 0, offset near 200..250)
  const pipeLeft = normalizeObstacle({
    id: 'pipe-left',
    kind: 'pipe',
    wallIndex: 0,
    offset: 220,
    width: 32,
    height: 2700,
    sill: 0,
    diameter: 32,
    standoff: 20,
    orientation: 'vertical'
  });
  // Obstacle on right (wall 0, offset near 1250)
  const boxRight = createObstacle('box', { id: 'box-right', wallIndex: 0, wallLength: 3000, roomHeight: 2700 });
  boxRight.offset = 1250;
  boxRight.width = 140;
  boxRight.depth = 120;
  boxRight.sill = 0;
  boxRight.height = 2700;

  project.room.windows = [pipeLeft, boxRight];

  // Both obstacles collide with cabinet
  const conflicts = findObstacleConflicts(project);
  assert.equal(conflicts.length, 2);

  const leftConflict = conflicts.find(c => c.obstacle.id === 'pipe-left');
  const rightConflict = conflicts.find(c => c.obstacle.id === 'box-right');
  assert.ok(leftConflict?.suggestion);
  assert.ok(rightConflict?.suggestion);
  assert.equal(leftConflict.suggestion.corner, 'back-left');
  assert.equal(rightConflict.suggestion.corner, 'back-right');

  // Set dual cutout
  cabinet.cutout = {
    corner: 'both',
    leftWidth: leftConflict.suggestion.width,
    leftDepth: leftConflict.suggestion.depth,
    rightWidth: rightConflict.suggestion.width,
    rightDepth: rightConflict.suggestion.depth,
    width: leftConflict.suggestion.width,
    depth: leftConflict.suggestion.depth
  };

  // Verify cutouts getter
  const cutouts = getCabinetCutouts(cabinet);
  assert.equal(cutouts.length, 2);
  assert.equal(cutouts[0].corner, 'back-left');
  assert.equal(cutouts[1].corner, 'back-right');

  // Verify conflicts resolved
  const resolvedConflicts = findObstacleConflicts(project);
  assert.equal(resolvedConflicts.length, 0);

  // Validation passes
  assert.deepEqual(validateProject(project), []);

  // Parts generation
  const parts = generateParts(project);
  // Both sides shortened
  const leftSide = parts.find(p => p.name === 'Боковина левая');
  const rightSide = parts.find(p => p.name === 'Боковина правая');
  assert.ok(leftSide.width < 600 - 3);
  assert.ok(rightSide.width < 600 - 3);

  // Return sides on both corners
  const returnSides = parts.filter(p => p.name === 'Возвратная боковина выреза');
  assert.equal(returnSides.length, 2);
  assert.equal(returnSides[0].position.x, cabinet.cutout.leftWidth);
  assert.equal(returnSides[1].position.x, cabinet.width - cabinet.cutout.rightWidth - 18);

  // Back panels: central back + 2 notch backs
  const backMain = parts.find(p => p.name === 'Задняя стенка');
  const backNotches = parts.filter(p => p.name === 'Задняя стенка выреза');
  assert.ok(backMain);
  assert.equal(backNotches.length, 2);

  // Top cover has 8 outline vertices
  const top = parts.find(p => p.name === 'Крышка');
  assert.ok(top.outline);
  assert.equal(top.outline.length, 8);

  // Check import validation passes
  assert.ok(checkImport(project));
});

