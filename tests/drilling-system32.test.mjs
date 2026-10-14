import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, generateParts, createSection, splitSection, getCabinetLayout } from '../src/engine.js';
import { generateDrillingPlan, DRILLING_DEFAULTS, SYSTEM32_DEFAULTS } from '../src/drilling.js';
import { getSystem32HardwareCounts, getProjectHardwareSchedule } from '../src/hardware.js';
import { validateProjectSchema } from '../src/project-io.js';

test('system32 default is false in DRILLING_DEFAULTS for backward compatibility', () => {
  assert.equal(DRILLING_DEFAULTS.system32, false);
  assert.equal(SYSTEM32_DEFAULTS.system32, false);
  assert.equal(SYSTEM32_DEFAULTS.shelfPinDiameter, 5);
  assert.equal(SYSTEM32_DEFAULTS.shelfPinDepth, 11);
  assert.equal(SYSTEM32_DEFAULTS.shelfPinPitch, 32);
  assert.equal(SYSTEM32_DEFAULTS.shelfPinFrontSetback, 37);
  assert.equal(SYSTEM32_DEFAULTS.hingeCupDiameter, 35);
  assert.equal(SYSTEM32_DEFAULTS.hingeCupDepth, 12.5);
  assert.equal(SYSTEM32_DEFAULTS.hingePlateSpacing, 32);
});

test('when system32 is disabled, no system32 holes are generated', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { shelves: 2, doors: 2 });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: false };

  const plan = generateDrillingPlan(project);
  assert.equal(plan.holes.some(h => h.system32 === true), false);
  assert.equal(plan.holes.some(h => h.fastenerType === 'shelf-pin-system32'), false);
  assert.equal(plan.holes.some(h => h.fastenerType === 'hinge-cup-35mm'), false);
});

test('shelf pin holes generated on carcass sides with 32mm pitch and 37mm setback', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { shelves: 1, doors: 0, drawers: 0 });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true, shelfPins: true, shelfPinMode: 'centered', shelfPinHolesPerShelf: 3 };

  const plan = generateDrillingPlan(project);
  const shelfPinHoles = plan.holes.filter(h => h.fastenerType === 'shelf-pin-system32');
  assert.ok(shelfPinHoles.length >= 12, `Expected >= 12 shelf pin holes, got ${shelfPinHoles.length}`);

  for (const hole of shelfPinHoles) {
    assert.equal(hole.diameter, 5);
    assert.equal(hole.depth, 11);
    assert.equal(hole.system32, true);
    assert.ok(hole.partId.includes('part-1') || hole.partId.includes('part-2'), 'Should be on side panels');
  }

  // Left side panel holes
  const leftHoles = shelfPinHoles.filter(h => h.face === 'face-t-max');
  assert.ok(leftHoles.length >= 6);

  // Group by Y to check 32mm pitch
  const yStations = [...new Set(leftHoles.map(h => h.b))].sort((a, b) => a - b);
  assert.equal(yStations.length, 3, 'Centered mode with 3 holes per position should yield 3 Y levels');
  assert.equal(Math.round(yStations[1] - yStations[0]), 32);
  assert.equal(Math.round(yStations[2] - yStations[1]), 32);

  // Check front and rear setbacks along A axis (depth)
  const aStations = [...new Set(leftHoles.map(h => h.a))].sort((a, b) => a - b);
  assert.equal(aStations.length, 2, 'Should have rear and front hole rows');
  // Rear hole setback from rear
  assert.ok(aStations[0] >= 37 && aStations[0] <= 45);
  // Front hole setback 37mm from front edge
  const sidePart = plan.parts.find(p => p.id === leftHoles[0].partId);
  const frontDist = sidePart.finishedWidth - aStations[1];
  assert.ok(Math.abs(frontDist - 37) <= 2, `Front setback should be ~37mm, got ${frontDist}`);
});

test('full shelf pin mode generates continuous column of 32mm pitch holes', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('wall', project, { shelves: 2, height: 720 });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true, shelfPins: true, shelfPinMode: 'full' };

  const plan = generateDrillingPlan(project);
  const shelfPinHoles = plan.holes.filter(h => h.fastenerType === 'shelf-pin-system32');
  assert.ok(shelfPinHoles.length > 20, `Full mode should generate extensive pin matrix, got ${shelfPinHoles.length}`);

  const leftHoles = shelfPinHoles.filter(h => h.face === 'face-t-max');
  const yStations = [...new Set(leftHoles.map(h => h.b))].sort((a, b) => a - b);
  assert.ok(yStations.length >= 10);
  for (let i = 1; i < yStations.length; i++) {
    assert.equal(Math.round(yStations[i] - yStations[i - 1]), 32);
  }
});

test('drawer runner mounting holes generated at 37mm setback and 32mm multiples', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, {
    drawers: 2, doors: 0,
    layout: { ...createSection('drawers'), id: 'section-drawers', drawers: 2 }
  });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true, drawerSlides: true, shelfPins: false, hinges: false };

  const plan = generateDrillingPlan(project);
  const slideHoles = plan.holes.filter(h => h.fastenerType === 'drawer-slide-system32');
  assert.ok(slideHoles.length >= 12, `Expected >= 12 slide holes for 2 drawers (3 holes * 2 sides * 2 drawers), got ${slideHoles.length}`);

  for (const hole of slideHoles) {
    assert.equal(hole.diameter, 5);
    assert.equal(hole.depth, 11);
    assert.equal(hole.kind, 'runner-mount');
  }

  // Verify pairIds link left and right holes per drawer
  const drawerPairIds = [...new Set(slideHoles.map(h => h.pairId))];
  assert.equal(drawerPairIds.length, 2, 'Two drawers should have two distinct pairIds');
});

test('door hinge cups (dia 35mm) and carcass mounting plates (2x dia 5mm, 32mm pitch) generated and paired', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, {
    doors: 1, shelves: 0, drawers: 0, doorOpening: 'left',
    layout: { ...createSection('doors'), id: 'section-door', shelves: 0, doorOpenings: ['left'] }
  });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true, hinges: true, shelfPins: false, drawerSlides: false };

  const plan = generateDrillingPlan(project);
  const cupHoles = plan.holes.filter(h => h.fastenerType === 'hinge-cup-35mm');
  const plateHoles = plan.holes.filter(h => h.fastenerType === 'hinge-plate-system32');

  assert.ok(cupHoles.length >= 2, `Expected >= 2 hinge cups, got ${cupHoles.length}`);
  assert.equal(plateHoles.length, cupHoles.length * 2, 'Each hinge cup should have 2 matching plate holes');

  // Verify cup dimensions & setbacks
  for (const cup of cupHoles) {
    assert.equal(cup.diameter, 35);
    assert.equal(cup.depth, 12.5);
    assert.equal(cup.face, 'face-t-min');
    // Setback from door hinge edge should be ~22mm
    assert.ok(Math.abs(cup.a - 22) <= 2, `Hinge cup setback should be 22mm, got ${cup.a}`);
  }

  // Verify plate holes dimensions & spacing
  for (const plate of plateHoles) {
    assert.equal(plate.diameter, 5);
    assert.ok(plate.depth >= 9 && plate.depth <= 11);
    assert.equal(plate.face, 'face-t-max', 'For left-opening door, plate is on left side panel inner face');
  }

  // Check 32mm spacing between paired plate holes
  for (const cup of cupHoles) {
    const matchingPlates = plateHoles.filter(p => p.pairId === cup.pairId);
    assert.equal(matchingPlates.length, 2);
    const yDiff = Math.abs(matchingPlates[0].b - matchingPlates[1].b);
    assert.equal(Math.round(yDiff), 32, 'Plate holes must be exactly 32mm apart');
  }
});

test('hardware schedule aggregates System 32 hole counts', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { shelves: 1, doors: 1 });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true };

  const counts = getSystem32HardwareCounts(project);
  assert.ok(counts.shelfPins > 0);
  assert.ok(counts.hingeCups > 0);
  assert.ok(counts.hingePlates > 0);
  assert.ok(counts.totalHoles > 0);

  const schedule = getProjectHardwareSchedule(project);
  assert.ok(schedule.totals.system32ShelfPins > 0);
  assert.ok(schedule.totals.system32HingeCups > 0);
  assert.ok(schedule.totals.system32HingePlates > 0);
});

test('project-io validates system32 settings correctly', () => {
  const project = createDefaultProject();
  project.settings.drilling = {
    enabled: true,
    system32: true,
    shelfPins: true,
    drawerSlides: true,
    hinges: true,
    shelfPinMode: 'centered'
  };

  assert.doesNotThrow(() => validateProjectSchema(project));

  project.settings.drilling.shelfPinMode = 'invalid-mode';
  assert.throws(() => validateProjectSchema(project), /режим полкодержателей/);

  project.settings.drilling.shelfPinMode = 'full';
  project.settings.drilling.system32 = 'not-a-boolean';
  assert.throws(() => validateProjectSchema(project), /система 32/);
});

test('intermediate partition receives hinge plate holes for overlay doors on both sides', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { width: 1200, doors: 2 });
  const g = getCabinetLayout(cab, project);
  splitSection(cab, g.sections[0].id, 'vertical', project);
  const g2 = getCabinetLayout(cab, project);
  g2.sections[0].node.front = 'doors';
  g2.sections[0].node.doors = 1;
  g2.sections[0].node.doorOpening = 'right';
  g2.sections[1].node.front = 'doors';
  g2.sections[1].node.doors = 1;
  g2.sections[1].node.doorOpening = 'left';
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true, hinges: true };

  const plan = generateDrillingPlan(project);
  const partitionPart = plan.parts.find(p => p.component === 'partition' || p.role === 'partition' || p.role === 'interior-partition' || p.component === 'interior-partition');
  assert.ok(partitionPart, 'Intermediate partition part must exist');

  const partitionPlates = plan.holes.filter(h => h.fastenerType === 'hinge-plate-system32' && h.partId === partitionPart.id);
  assert.ok(partitionPlates.length > 0, 'Intermediate partition must receive hinge plate holes');

  const faceMinPlates = partitionPlates.filter(h => h.face === 'face-t-min');
  const faceMaxPlates = partitionPlates.filter(h => h.face === 'face-t-max');
  assert.ok(faceMinPlates.length >= 4, `Expected >= 4 plates on face-t-min, got ${faceMinPlates.length}`);
  assert.ok(faceMaxPlates.length >= 4, `Expected >= 4 plates on face-t-max, got ${faceMaxPlates.length}`);

  for (const h of partitionPlates) {
    assert.equal(h.depth, 8, 'Hinge plate hole depth on partition must be capped at 8mm');
  }
});

test('shared intermediate partition generates dual-sided shelf pin holes with 8mm capped depth and zero coaxial collision', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { width: 1200, shelves: 0 });
  const g = getCabinetLayout(cab, project);
  splitSection(cab, g.sections[0].id, 'vertical', project);
  const g2 = getCabinetLayout(cab, project);
  g2.sections[0].node.shelves = 2;
  g2.sections[1].node.shelves = 2;
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true, shelfPins: true, shelfPinMode: 'centered' };

  const plan = generateDrillingPlan(project);
  const partitionPart = plan.parts.find(p => p.component === 'partition' || p.role === 'partition' || p.role === 'interior-partition' || p.component === 'interior-partition');
  assert.ok(partitionPart, 'Partition part must exist');

  const partitionPins = plan.holes.filter(h => h.fastenerType === 'shelf-pin-system32' && h.partId === partitionPart.id);
  assert.ok(partitionPins.length > 0, 'Partition must have shelf pins');

  const minPins = partitionPins.filter(h => h.face === 'face-t-min');
  const maxPins = partitionPins.filter(h => h.face === 'face-t-max');
  assert.ok(minPins.length >= 12, `Expected >= 12 shelf pins on face-t-min, got ${minPins.length}`);
  assert.ok(maxPins.length >= 12, `Expected >= 12 shelf pins on face-t-max, got ${maxPins.length}`);

  for (const h of partitionPins) {
    assert.equal(h.depth, 8, 'Shelf pin hole depth on intermediate partition must be 8mm');
    assert.equal(h.diameter, 5);
  }
});

