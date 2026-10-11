import test from 'node:test';
import assert from 'node:assert/strict';
import { createDoorHingeSymbols } from '../src/hinge-preview.js';
import { createDefaultProject, createSection, generateParts } from '../src/engine.js';
import { getHardwareSchedule } from '../src/hardware.js';
import { FurnitureViewport } from '../src/renderer.js';

function canvas() {
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  return { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 950, height: 800, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
}

test('left, right and lift-up hinge cups stay on the actual moving door while cabinet plates remain fixed', () => {
  for (const opening of ['left', 'right', 'up']) {
    const settings = { width: 400, height: 1200, opening, count: 3 }, closed = createDoorHingeSymbols(settings), open = createDoorHingeSymbols({ ...settings, opened: true });
    assert.equal(open.length, 3);
    for (let index = 0; index < 3; index++) {
      assert.deepEqual(open[index].plate, closed[index].plate);
      assert.notDeepEqual(open[index].cup, closed[index].cup);
      for (const point of closed[index].cupOutline) assert.ok(point[0] >= 0 && point[0] <= settings.width && point[1] >= 0 && point[1] <= settings.height);
      assert.equal(open[index].arm.length, 3);
      assert.deepEqual(open[index].arm.at(-1), open[index].cup);
      assert.ok(open[index].cup[2] > 0, 'an opened cup moves with the door in front of the carcass');
    }
    if (opening === 'left') assert.ok(closed.every(hinge => hinge.cup[0] < 25));
    if (opening === 'right') assert.ok(closed.every(hinge => hinge.cup[0] > settings.width - 25));
    if (opening === 'up') assert.ok(closed.every(hinge => hinge.cup[1] > settings.height - 25));
  }
});

test('3D hinge symbols match the hardware count including section overrides and push-to-open without manufacturing changes', () => {
  const project = createDefaultProject('en'), cabinet = project.cabinets[0];
  cabinet.layout = { ...createSection('doors'), id: 'hinge-section', doors: 3, doorOpenings: ['left', 'right', 'up'], openingMechanism: 'push', hingesPerDoor: 4 };
  const parts = generateParts(project), before = structuredClone(project), viewport = new FurnitureViewport(canvas());
  try {
    viewport.setProject(project, cabinet.id); viewport.setOptions({ room: false, focusCabinet: true, doorsOpen: true });
    const cups = viewport.hits.filter(hit => hit.component === 'hinge' && hit.hingePart === 'cup');
    const hardware = getHardwareSchedule(cabinet, project);
    assert.equal(cups.length, hardware.totals.hinges); assert.equal(cups.length, 12);
    for (let door = 0; door < 3; door++) assert.equal(cups.filter(hit => hit.frontIndex === door).length, 4);
    assert.ok(cups.every(hit => hit.schematic && !hit.partId));
    viewport.setOptions({ hinges: false }); assert.ok(viewport.hits.every(hit => hit.component !== 'hinge'));
    viewport.setOptions({ hinges: true, exploded: true }); assert.ok(viewport.hits.every(hit => hit.component !== 'hinge'));
    assert.deepEqual(generateParts(project), parts); assert.deepEqual(project, before);
  } finally { viewport.destroy(); }
});

test('twin doors mounted on a shared partition receive half-overlay hinges with 9mm crank geometry in schedule and 3D', () => {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  cabinet.layout = {
    id: 'shared-columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
      { ...createSection('doors'), id: 'col-left', doors: 1, doorOpenings: ['right'], hingesPerDoor: 3 },
      { ...createSection('doors'), id: 'col-right', doors: 1, doorOpenings: ['left'], hingesPerDoor: 3 },
    ]
  };
  const schedule = getHardwareSchedule(cabinet, project);
  const hingeRows = schedule.rows.filter(row => row.kind === 'hinge');
  assert.equal(hingeRows.length, 2);
  assert.ok(hingeRows.every(row => row.hingeType === 'half-overlay' && row.sharedPartition === true), 'both doors sharing the partition must specify half-overlay hinges');

  const viewport = new FurnitureViewport(canvas());
  try {
    viewport.setProject(project, cabinet.id);
    viewport.setOptions({ room: false, focusCabinet: true, doorsOpen: false });
    const halfHinges = viewport.hits.filter(hit => hit.component === 'hinge' && hit.hingeType === 'half-overlay');
    assert.ok(halfHinges.length > 0, 'half-overlay hinge components rendered in 3D');
    const cranks = viewport.hits.filter(hit => hit.component === 'hinge' && hit.hingePart === 'arm-crank');
    const crankHinges = new Set(cranks.map(hit => `${hit.sectionId}-${hit.frontIndex}-${hit.hingeIndex}`));
    assert.equal(crankHinges.size, 6, 'all 6 half-overlay hinges must have distinct 9mm crank arm geometry');
  } finally {
    viewport.destroy();
  }
});
