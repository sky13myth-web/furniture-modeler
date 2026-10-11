import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProject,
  createSection,
  generateParts,
  STANDARD_RUNNER_INCREMENTS,
  quantizeDrawerRunnerLength,
  getExternalDrawerLayout,
  getInternalDrawerLayout,
  optimizeCutting
} from '../src/engine.js';
import { getHardwareSchedule, getProjectHardwareSchedule } from '../src/hardware.js';
import { getRearFasteningSchedule, generateDrillingPlan } from '../src/drilling.js';
import { getPriceSettings, getProjectCostEstimate } from '../src/pricing.js';
import { PANEL_EDGE_CODES, generateHardwareHTML } from '../src/renderer.js';
import { generateRoomOBJ } from '../src/room-obj.js';

test('1. Edge banding codes E1-E4 match between SVG drawings and export tables', () => {
  assert.deepEqual(PANEL_EDGE_CODES, {
    left: 'E1',
    right: 'E2',
    top: 'E3',
    bottom: 'E4'
  });
});

test('2. Corner post is 100mm wide, uses sheet thickness, and safe height calculation', () => {
  const project = createDefaultProject('ru');
  const mat = project.materials[0];
  mat.thickness = 19; // non-standard thickness to test dynamic thickness
  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 900,
    height: 860,
    depth: 900,
    type: 'corner-base',
    cornerType: 'post'
  });
  delete cabinet.layout; // test safe fallback when layout is undefined

  const parts = generateParts(project);
  const post = parts.find(p => p.name === 'Угловая опорная планка');
  assert.ok(post, 'Corner post part should be generated');
  assert.equal(post.finishedWidth, 100, 'Corner post finished width must be 100 mm');
  assert.equal(post.thickness, 19, 'Corner post thickness must match material thickness');
  // bodyHeight = 860 - 100 (plinth) = 760; height = 760 - 2 * 19 = 722
  assert.equal(post.finishedHeight, 760 - 2 * 19);
});

test('3. Blind panels and openingMechanism="none" are excluded from handles and hinges', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 1000,
    height: 720,
    depth: 600,
    cornerType: 'blind',
    blindSide: 'left',
    blindWidth: 400,
    layout: {
      id: 'root',
      kind: 'split',
      axis: 'vertical',
      sizes: [400, 600],
      children: [
        { ...createSection('doors'), id: 's1', doors: 1, openingMechanism: 'none' },
        { ...createSection('doors'), id: 's2', doors: 1, openingMechanism: 'handle' }
      ]
    }
  });

  const schedule = getHardwareSchedule(cabinet, project);
  // S1 has openingMechanism='none', so 0 handles, 0 hinges
  // S2 has 1 door with handle, so 1 handle, 2 hinges
  // Blind panel is excluded
  assert.equal(schedule.totals.handles, 1);
  assert.equal(schedule.totals.hinges, 2);
  const blindRows = schedule.rows.filter(r => r.kind === 'handle' && r.source === 'blind-panel');
  assert.equal(blindRows.length, 0);
});

test('4. Return dividers have rear contact edges removed when covered by back panel', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 1200,
    height: 2200,
    depth: 620,
    sidesToFloor: false,
    includeBack: true,
    cutout: { corner: 'back-left', width: 300, depth: 180 }
  });

  const parts = generateParts(project);
  const returnSide = parts.find(p => p.name === 'Возвратная боковина выреза');
  assert.ok(returnSide, 'Return side should exist');
  assert.equal(returnSide.edges.left, 1, 'Front edge left must remain banded');
  assert.equal(returnSide.edges.right, 0, 'Contact edge right must be 0');
});

test('5. Corner post receives CNC drilling operations for connecting top and bottom panels', () => {
  const project = createDefaultProject('ru');
  project.settings.drilling = {
    enabled: true,
    screwDiameter: 7,
    screwLength: 50,
    countersinkDiameter: 10,
    countersinkDepth: 2,
    pilotDiameter: 5,
    clearanceDiameter: 7,
    endOffset: 25
  };
  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 900,
    height: 860,
    depth: 900,
    type: 'corner-base',
    cornerType: 'post'
  });

  const schedule = getRearFasteningSchedule(project);
  assert.ok(schedule.confirmatJoints.length > 0, 'Should generate confirmat joints');
  const plan = generateDrillingPlan(project);
  const postHoles = plan.holes.filter(h => h.partId && plan.parts.find(p => p.id === h.partId)?.name === 'Угловая опорная планка');
  assert.ok(postHoles.length > 0, 'Corner post must receive drilling operations for joints');
});

test('6. L-shaped and U-shaped non-convex rooms are triangulated using ear clipping in room OBJ', () => {
  const project = createDefaultProject('ru');
  // L-shaped room polygon (non-convex)
  project.room = {
    width: 6000,
    depth: 5000,
    height: 2700,
    outline: [
      { x: 0, z: 0 },
      { x: 6000, z: 0 },
      { x: 6000, z: 2500 },
      { x: 3000, z: 2500 },
      { x: 3000, z: 5000 },
      { x: 0, z: 5000 }
    ],
    obstacles: []
  };

  const { obj } = generateRoomOBJ(project);
  assert.ok(typeof obj === 'string', 'OBJ string must be generated');
  assert.ok(obj.includes('o Room_Floor'), 'OBJ must include Room_Floor object');
  
  // Extract floor faces
  const floorSection = obj.split('o Room_Floor')[1]?.split('o ')[0];
  assert.ok(floorSection, 'Floor section must exist');
  const faceMatches = floorSection.match(/^f \d+\/\/\d+ \d+\/\/\d+ \d+\/\/\d+$/gm);
  // An 6-vertex polygon must be triangulated into exactly (6 - 2) = 4 triangles
  assert.equal(faceMatches?.length, 4, 'Ear clipping must decompose 6-vertex polygon into exactly 4 triangles');
});

test('7. Drawer runner length quantizes to standard 50mm increments (250-600mm)', () => {
  assert.deepEqual(STANDARD_RUNNER_INCREMENTS, [250, 300, 350, 400, 450, 500, 550, 600]);
  assert.equal(quantizeDrawerRunnerLength(240), 250);
  assert.equal(quantizeDrawerRunnerLength(270), 250);
  assert.equal(quantizeDrawerRunnerLength(420), 400);
  assert.equal(quantizeDrawerRunnerLength(480), 450);
  assert.equal(quantizeDrawerRunnerLength(537), 500);
  assert.equal(quantizeDrawerRunnerLength(630), 600);

  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 800,
    height: 860,
    depth: 580,
    layout: { ...createSection('drawers'), id: 'box', drawers: 2 },
    quantizeDrawerDepth: true
  });

  const drawers = getExternalDrawerLayout(cabinet, project);
  assert.equal(drawers.length, 2);
  // Depth 580 - 40 - back(18) = 522 -> quantized runner is 500
  assert.equal(drawers[0].runnerLength, 500);
  assert.equal(drawers[0].box.depth, 500);
});

test('8. Long shelves and plinths with grain orient along sheet length (2800mm axis)', () => {
  const project = createDefaultProject('ru');
  const mat = project.materials[0];
  mat.sheetWidth = 2800;  // length
  mat.sheetHeight = 2070; // width
  mat.grain = true;

  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 2400,
    height: 900,
    depth: 600,
    plinth: 100,
    layout: { ...createSection('open'), id: 's', shelves: 1 }
  });

  const parts = generateParts(project);
  const shelf = parts.find(p => p.role === 'shelf' || p.name.includes('полка'));
  const plinth = parts.find(p => p.role === 'plinth');

  assert.ok(shelf, 'Shelf part must exist');
  assert.ok(plinth, 'Plinth part must exist');
  assert.equal(shelf.grainAlongLength, true, 'Shelf must have grainAlongLength flag');
  assert.equal(plinth.grainAlongLength, true, 'Plinth must have grainAlongLength flag');

  const cutting = optimizeCutting(parts, project.materials, project.settings);
  const shelfPlaced = cutting.sheets.flatMap(s => s.placements).find(p => p.partId === shelf.id);
  const plinthPlaced = cutting.sheets.flatMap(s => s.placements).find(p => p.partId === plinth.id);

  assert.ok(shelfPlaced, '2400mm shelf with grain must be successfully placed on 2800x2070 sheet');
  assert.ok(plinthPlaced, '2400mm plinth with grain must be successfully placed on 2800x2070 sheet');
});

test('9. Extended hardware (push-latches, confirmats, plinth legs, shelf supports, corner brackets) in schedule, pricing, and HTML', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  Object.assign(cabinet, {
    width: 900,
    height: 900,
    depth: 600,
    plinth: 100,
    plinthLegs: true,
    shelfSupports: true,
    layout: {
      id: 'root',
      kind: 'split',
      axis: 'vertical',
      sizes: [450, 450],
      children: [
        { ...createSection('doors'), id: 's1', doors: 1, openingMechanism: 'push', shelves: 2 },
        { ...createSection('doors'), id: 's2', doors: 1, openingMechanism: 'handle', shelves: 2 }
      ]
    }
  });
  project.settings.confirmatFasteners = true;
  project.settings.pricing = {
    handlePrice: 10,
    guideSetPrice: 40,
    hingePrice: 5,
    edgeBandPricePerMeter: 2,
    pushLatchPrice: 45,
    confirmatPrice: 1.5,
    plinthLegPrice: 12,
    shelfSupportPrice: 2,
    cornerBracketPrice: 3.5
  };

  const schedule = getProjectHardwareSchedule(project);
  assert.equal(schedule.totals.pushLatches, 1, '1 push latch for openingMechanism=push door');
  assert.equal(schedule.totals.handles, 1, '1 handle for openingMechanism=handle door');
  assert.equal(schedule.totals.shelfSupports, 16, '4 shelves * 4 supports = 16 supports');
  assert.equal(schedule.totals.plinthLegs, 4, '4 plinth legs for 900mm base cabinet');
  assert.ok(schedule.totals.confirmats >= 8, 'At least 8 confirmats for carcass joint');

  const prices = getPriceSettings(project);
  assert.equal(prices.pushLatchPrice.price, 45);
  assert.equal(prices.confirmatPrice.price, 1.5);
  assert.equal(prices.plinthLegPrice.price, 12);
  assert.equal(prices.shelfSupportPrice.price, 2);
  assert.equal(prices.cornerBracketPrice.price, 3.5);

  const estimate = getProjectCostEstimate(project);
  const pushRow = estimate.rows.find(r => r.id === 'pushLatches');
  const legRow = estimate.rows.find(r => r.id === 'plinthLegs');
  const supportRow = estimate.rows.find(r => r.id === 'shelfSupports');
  const confirmatRow = estimate.rows.find(r => r.id === 'confirmats');

  assert.ok(pushRow && pushRow.cost === 45, 'Push latches correctly priced');
  assert.ok(legRow && legRow.cost === 48, 'Plinth legs correctly priced (4 * 12 = 48)');
  assert.ok(supportRow && supportRow.cost === 32, 'Shelf supports correctly priced (16 * 2 = 32)');
  assert.ok(confirmatRow && confirmatRow.cost > 0, 'Confirmats correctly priced');

  const html = generateHardwareHTML(project, { language: 'ru' });
  assert.ok(html.includes('Толкатели push-to-open'), 'Printable BOM table contains push latches');
  assert.ok(html.includes('Опоры цоколя'), 'Printable BOM table contains plinth legs');
  assert.ok(html.includes('Полкодержатели'), 'Printable BOM table contains shelf supports');
  assert.ok(html.includes('Конфирматы'), 'Printable BOM table contains confirmats');
});
