import test from 'node:test';
import assert from 'node:assert/strict';
import { createCabinet, createDefaultProject, getCabinetLayout, getFrontLayout } from '../src/engine.js';
import { getHardwareSchedule } from '../src/hardware.js';
import { checkImport } from '../src/project-io.js';

test('doors: overlay vs inset frontMount sets correct geometry and flush depth', () => {
  const project = createDefaultProject();
  const cabOverlay = createCabinet('base', project, { width: 600, height: 720, depth: 560, plinth: 100 });
  cabOverlay.layout = { id: 's1', kind: 'section', front: 'doors', doors: 1, frontMount: 'overlay' };

  const layoutOverlay = getCabinetLayout(cabOverlay, project);
  const frontOverlay = getFrontLayout(cabOverlay, project)[0];
  assert.equal(layoutOverlay.sections[0].frontMount, 'overlay');
  assert.equal(frontOverlay.frontMount, 'overlay');

  const cabInset = createCabinet('base', project, { width: 600, height: 720, depth: 560, plinth: 100 });
  cabInset.layout = { id: 's2', kind: 'section', front: 'doors', doors: 1, frontMount: 'inset' };

  const layoutInset = getCabinetLayout(cabInset, project);
  const frontInset = getFrontLayout(cabInset, project)[0];
  assert.equal(layoutInset.sections[0].frontMount, 'inset');
  assert.equal(frontInset.frontMount, 'inset');

  // Inset door sits inside the carcass opening, with depth adjusted for front thickness
  const bodyDepth = cabInset.depth - (cabInset.backThickness || 3);
  const frontStockThickness = project.materials.find(m => m.id === cabInset.frontMaterialId)?.thickness ?? 18;
  assert.equal(frontInset.depth, bodyDepth - frontStockThickness);

  // Hardware schedule gives inset hinge type for inset doors
  const hwOverlay = getHardwareSchedule(cabOverlay, project);
  const hwInset = getHardwareSchedule(cabInset, project);
  const hingeOverlay = hwOverlay.rows.find(r => r.kind === 'hinge');
  const hingeInset = hwInset.rows.find(r => r.kind === 'hinge');

  assert.equal(hingeOverlay.hingeType, 'full-overlay');
  assert.equal(hingeInset.hingeType, 'inset');
});

test('doors: cabinet frontMount default applies to sections unless overridden', () => {
  const project = createDefaultProject();
  const cab = createCabinet('base', project, {
    width: 800, height: 720, depth: 560,
    frontMount: 'inset'
  });
  cab.layout = {
    id: 'split',
    kind: 'split',
    axis: 'vertical',
    sizes: [1, 1],
    children: [
      { id: 's1', kind: 'section', front: 'doors', doors: 1 }, // inherits inset
      { id: 's2', kind: 'section', front: 'doors', doors: 1, frontMount: 'overlay' } // explicit overlay override
    ]
  };

  const layout = getCabinetLayout(cab, project);
  const fronts = getFrontLayout(cab, project);

  const s1 = layout.sections.find(s => s.id === 's1');
  const s2 = layout.sections.find(s => s.id === 's2');
  const f1 = fronts.find(f => f.sectionId === 's1');
  const f2 = fronts.find(f => f.sectionId === 's2');

  assert.equal(s1.frontMount, 'inset');
  assert.equal(f1.frontMount, 'inset');
  assert.equal(s2.frontMount, 'overlay');
  assert.equal(f2.frontMount, 'overlay');
});

test('doors: opening directions left / right / up on single and double doors', () => {
  const project = createDefaultProject();
  const cab = createCabinet('base', project, { width: 600, height: 720, depth: 560 });

  // Single door opening left
  cab.layout = { id: 's1', kind: 'section', front: 'doors', doors: 1, doorOpening: 'left' };
  let fronts = getFrontLayout(cab, project);
  assert.equal(fronts[0].opening, 'left');

  // Single door opening right
  cab.layout = { id: 's1', kind: 'section', front: 'doors', doors: 1, doorOpening: 'right' };
  fronts = getFrontLayout(cab, project);
  assert.equal(fronts[0].opening, 'right');

  // Single door opening up (lifter)
  cab.layout = { id: 's1', kind: 'section', front: 'doors', doors: 1, doorOpening: 'up' };
  fronts = getFrontLayout(cab, project);
  assert.equal(fronts[0].opening, 'up');

  // Double doors flipped: door 0 is right, door 1 is left
  cab.layout = { id: 's2', kind: 'section', front: 'doors', doors: 2, doorOpenings: ['right', 'left'] };
  fronts = getFrontLayout(cab, project);
  assert.equal(fronts[0].opening, 'right');
  assert.equal(fronts[1].opening, 'left');
});

test('project-io: validates frontMount and doorOpening schemas', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];
  cab.frontMount = 'inset';
  cab.doorOpening = 'right';
  cab.layout = {
    id: 's1',
    kind: 'section',
    front: 'doors',
    doors: 1,
    frontMount: 'inset',
    doorOpening: 'right'
  };

  assert.doesNotThrow(() => checkImport(project));

  // Invalid frontMount throws
  const invalidMount = structuredClone(project);
  invalidMount.cabinets[0].layout.frontMount = 'floating';
  assert.throws(() => checkImport(invalidMount), /overlay или inset/);

  // Invalid doorOpening throws
  const invalidOpening = structuredClone(project);
  invalidOpening.cabinets[0].layout.doorOpening = 'diagonal';
  assert.throws(() => checkImport(invalidOpening), /left, right или up/);
});
