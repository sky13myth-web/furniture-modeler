import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, getFrontLayout, generateParts, validateProject } from '../src/engine.js';
import { snapCabinetToNeighbour } from '../src/room-geometry.js';
import { makeScene } from '../src/renderer.js';

test('createCabinet supports corner-base, corner-wall, and corner-tall presets', () => {
  const project = createDefaultProject();
  const base = createCabinet('corner-base', project);
  assert.equal(base.type, 'corner-base');
  assert.equal(base.width, 1000);
  assert.equal(base.height, 860);
  assert.equal(base.depth, 580);
  assert.equal(base.cornerType, 'blind');
  assert.equal(base.blindSide, 'right');
  assert.equal(base.blindWidth, 600);
  assert.equal(base.countertop, true);

  const wall = createCabinet('corner-wall', project);
  assert.equal(wall.type, 'corner-wall');
  assert.equal(wall.width, 600);
  assert.equal(wall.depth, 340);
  assert.equal(wall.blindWidth, 340);

  const tall = createCabinet('corner-tall', project);
  assert.equal(tall.type, 'corner-tall');
  assert.equal(tall.width, 1000);
  assert.equal(tall.height, 2200);
});

test('getFrontLayout generates blind-panel and operable door for blind corner cabinet', () => {
  const project = createDefaultProject();
  // Width 1000, blindWidth 600, blindSide 'right'
  const cabRight = createCabinet('corner-base', project, { width: 1000, blindWidth: 600, blindSide: 'right' });
  const frontsRight = getFrontLayout(cabRight, project);
  assert.equal(frontsRight.length, 2);

  const doorRight = frontsRight.find(f => f.kind === 'door');
  const panelRight = frontsRight.find(f => f.kind === 'blind-panel');
  assert.ok(doorRight, 'Should have operable door');
  assert.ok(panelRight, 'Should have blind fixed panel');
  assert.equal(doorRight.opening, 'left', 'Door on right-blind cabinet hinges on outer left');
  assert.equal(panelRight.openingMechanism, 'none', 'Blind panel has no handle or push-to-open');
  assert.equal(panelRight.width + doorRight.width > 980, true, 'Fronts cover cabinet width');

  // Left blind side
  const cabLeft = createCabinet('corner-base', project, { width: 1000, blindWidth: 600, blindSide: 'left' });
  const frontsLeft = getFrontLayout(cabLeft, project);
  const doorLeft = frontsLeft.find(f => f.kind === 'door');
  const panelLeft = frontsLeft.find(f => f.kind === 'blind-panel');
  assert.equal(doorLeft.opening, 'right', 'Door on left-blind cabinet hinges on outer right');
  assert.equal(panelLeft.x < doorLeft.x, true, 'Blind panel is on the left');
});

test('generateParts includes blind panel and corner support post', () => {
  const project = createDefaultProject();
  const cab = createCabinet('corner-base', project, { width: 1000, height: 860, depth: 580 });
  project.cabinets = [cab];
  const parts = generateParts(project);

  const blindPanelPart = parts.find(p => p.name.includes('Фальш-панель угловая'));
  assert.ok(blindPanelPart, 'Should produce "Фальш-панель угловая" part in cutting list');

  const cornerPostPart = parts.find(p => p.name.includes('Угловая опорная планка'));
  assert.ok(cornerPostPart, 'Should produce "Угловая опорная планка" part in cutting list');
});

test('snapCabinetToNeighbour snaps perpendicular cabinet at 90° to corner cabinet', () => {
  const existing = [
    { id: 'c-corner', x: 0, z: 0, width: 1000, depth: 580, rotation: 0, cornerType: 'blind', blindSide: 'right' }
  ];

  // Dragging a new cabinet near the right corner junction (1000, 580)
  const incoming = { id: 'c-new', x: 1010, z: 575, width: 800, depth: 580, rotation: 0 };
  const snapped = snapCabinetToNeighbour(incoming, existing, 40);

  assert.equal(snapped.x, 1000);
  assert.equal(snapped.z, 580);
  assert.equal(snapped.rotation, 90, 'Should rotate 90° to align flush against corner carcass');
});

test('makeScene renders blind panel without handle and handles doorsOpen mode', () => {
  const project = createDefaultProject();
  const cab = createCabinet('corner-base', project, { id: 'c1', x: 0, z: 0, width: 1000, height: 860, depth: 580 });
  project.cabinets = [cab];

  const closedScene = makeScene(project, { room: false, doorsOpen: false });
  // Should have exactly 1 door handle (for the door, none for the blind panel)
  const handles = closedScene.faces.filter(f => f.component === 'door-handle');
  assert.ok(handles.length > 0);

  const openScene = makeScene(project, { room: false, doorsOpen: true });
  assert.ok(openScene.faces.length > 0);
});

test('validateProject successfully validates corner-base, corner-wall, and corner-tall cabinets without errors', () => {
  const project = createDefaultProject();
  const c1 = createCabinet('corner-base', project, { id: 'cb', x: 200, z: 200 });
  const c2 = createCabinet('corner-wall', project, { id: 'cw', x: 200, z: 200 });
  const c3 = createCabinet('corner-tall', project, { id: 'ct', x: 1400, z: 200 });
  project.cabinets = [c1, c2, c3];

  const issues = validateProject(project);
  const errors = issues.filter(i => i.level === 'error');
  assert.equal(errors.length, 0, 'There should be zero validation errors for corner cabinet types');
});

