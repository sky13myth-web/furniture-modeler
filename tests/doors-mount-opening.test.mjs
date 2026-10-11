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

  // Room door swing and hinge validation
  project.room.windows = [{ id: 'd1', kind: 'door', wallIndex: 0, offset: 100, width: 800, height: 2000, sill: 0, swing: 'inward', hinge: 'left' }];
  assert.doesNotThrow(() => checkImport(project));

  project.room.windows[0].swing = 'outward';
  project.room.windows[0].hinge = 'right';
  assert.doesNotThrow(() => checkImport(project));

  project.room.windows[0].swing = 'diagonal';
  assert.throws(() => checkImport(project), /inward или outward/);

  project.room.windows[0].swing = 'inward';
  project.room.windows[0].hinge = 'center';
  assert.throws(() => checkImport(project), /left или right/);
});

test('room door: renders swing arc taking inward/outward and left/right into account', async () => {
  const { RoomEditor } = await import('../src/room-editor.js');
  const { getRoomOutline } = await import('../src/room-geometry.js');

  const editorFixture = (doorProps = {}) => {
    const editor = Object.create(RoomEditor.prototype);
    editor.project = {
      room: { width: 4000, depth: 3000, windows: [{ id: 'door-1', kind: 'door', wallIndex: 0, offset: 200, width: 800, height: 2000, sill: 0, ...doorProps }] },
      cabinets: [],
      materials: []
    };
    editor.outline = getRoomOutline(editor.project.room);
    editor.selectedWall = 0;
    editor.selectedWindowId = 'door-1';
    editor.selectedCorner = null;
    editor.root = { clientWidth: 500, clientHeight: 450, querySelector: () => null, innerHTML: '' };
    return editor;
  };

  // 1. Inward + Left (default)
  const edInLeft = editorFixture({ swing: 'inward', hinge: 'left' });
  RoomEditor.prototype.render.call(edInLeft);
  // sx=200, sz=0, ex=1000, ez=0; inward normal into room is +z; hinge at (200,0), open tip at (200, 800)
  assert.match(edInLeft.root.innerHTML, /M200 0L200 800M1000 0A800 800 0 0 1 200 800/);

  // 2. Outward + Left
  const edOutLeft = editorFixture({ swing: 'outward', hinge: 'left' });
  RoomEditor.prototype.render.call(edOutLeft);
  // outward normal is -z; hinge at (200,0), open tip at (200, -800)
  assert.match(edOutLeft.root.innerHTML, /M200 0L200 -800M1000 0A800 800 0 0 0 200 -800/);

  // 3. Inward + Right
  const edInRight = editorFixture({ swing: 'inward', hinge: 'right' });
  RoomEditor.prototype.render.call(edInRight);
  // hinge at (1000,0), open tip at (1000, 800)
  assert.match(edInRight.root.innerHTML, /M1000 0L1000 800M200 0A800 800 0 0 0 1000 800/);

  // 4. Outward + Right
  const edOutRight = editorFixture({ swing: 'outward', hinge: 'right' });
  RoomEditor.prototype.render.call(edOutRight);
  // hinge at (1000,0), open tip at (1000, -800)
  assert.match(edOutRight.root.innerHTML, /M1000 0L1000 -800M200 0A800 800 0 0 1 1000 -800/);
});

