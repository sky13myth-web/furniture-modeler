import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDefaultProject,
  createCabinet,
  syncMezzanines,
  canPlaceCabinet,
  validateProject,
  createSection,
} from '../src/engine.js';
import { checkImport } from '../src/project-io.js';
import { RoomEditor } from '../src/room-editor.js';
import { getRoomOutline } from '../src/room-geometry.js';
import { translateText } from '../src/i18n.js';

test('creating mezzanine attaches it to parent cabinet with matching dimensions and stacked elevation', () => {
  const project = createDefaultProject();
  project.cabinets = [];
  const parent = createCabinet('tall', project, {
    name: 'Основной шкаф',
    width: 900,
    height: 2000,
    depth: 600,
    y: 0,
    rotation: 45,
    cutout: { corner: 'back-left', width: 150, depth: 150 },
  });
  parent.x = 500;
  parent.z = 500;
  project.cabinets.push(parent);

  const mezzanine = createCabinet('wall', project, {
    name: 'Антресоль (Основной шкаф)',
    parentId: parent.id,
    height: 500,
  });
  project.cabinets.push(mezzanine);

  assert.equal(mezzanine.parentId, parent.id);
  assert.equal(mezzanine.width, 900);
  assert.equal(mezzanine.depth, 600);
  assert.equal(mezzanine.height, 500);
  assert.equal(mezzanine.x, 500);
  assert.equal(mezzanine.z, 500);
  assert.equal(mezzanine.y, 2000);
  assert.equal(mezzanine.rotation, 45);
  assert.deepEqual(mezzanine.cutout, { corner: 'back-left', width: 150, depth: 150 });

  // Stacking vertically without collision
  assert.equal(canPlaceCabinet(mezzanine, project), true);
  const warnings = validateProject(project);
  assert.equal(warnings.filter(w => w.level === 'error').length, 0);
});

test('syncMezzanines synchronizes width, depth, position, rotation, height and cutout from parent to mezzanine', () => {
  const project = createDefaultProject();
  const parent = createCabinet('tall', project, {
    name: 'Базовый',
    width: 800,
    height: 1800,
    depth: 550,
    y: 0,
    rotation: 0,
  });
  parent.x = 0;
  parent.z = 0;
  const child = createCabinet('wall', project, {
    name: 'Антресоль',
    parentId: parent.id,
    height: 400,
  });
  project.cabinets.push(parent, child);

  // Modify parent cabinet parameters
  parent.width = 1000;
  parent.depth = 650;
  parent.x = 250;
  parent.z = 300;
  parent.y = 100;
  parent.height = 1900;
  parent.rotation = 90;
  parent.cutout = { corner: 'back-right', width: 120, depth: 140 };

  syncMezzanines(project);

  assert.equal(child.width, 1000);
  assert.equal(child.depth, 650);
  assert.equal(child.x, 250);
  assert.equal(child.z, 300);
  assert.equal(child.rotation, 90);
  assert.equal(child.y, 2000); // parent.y (100) + parent.height (1900)
  assert.deepEqual(child.cutout, { corner: 'back-right', width: 120, depth: 140 });

  // Remove cutout from parent
  delete parent.cutout;
  syncMezzanines(project);
  assert.equal(child.cutout, undefined);
});

test('project-io schema validation checks parentId validity', () => {
  const project = createDefaultProject();
  const parent = createCabinet('tall', project);
  const child = createCabinet('wall', project, { parentId: parent.id });
  project.cabinets = [parent, child];

  // Valid project passes validation
  assert.doesNotThrow(() => checkImport(project));

  // Invalid parentId pointing to non-existent cabinet throws
  child.parentId = 'cab-nonexistent';
  assert.throws(() => checkImport(project), /родительский шкаф не найден/);

  // Self-referencing parentId throws
  child.parentId = child.id;
  assert.throws(() => checkImport(project), /не может быть привязан к самому себе/);

  // Non-string parentId throws
  child.parentId = 12345;
  assert.throws(() => checkImport(project), /текст/);
});

test('RoomEditor blocks separate dragging and hides resize handles for attached mezzanine', () => {
  const bounds = { left: 50, top: 100, width: 800, height: 500 };
  const svg = { getBoundingClientRect: () => bounds };
  const root = {
    clientWidth: 800,
    clientHeight: 580,
    innerHTML: '',
    focus() {},
    contains: () => true,
    setPointerCapture() {},
    releasePointerCapture() {},
    querySelector: selector => selector === 'svg' || selector === '.room-plan' ? svg : null,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const windowObj = {
    ResizeObserver: class { observe() {} disconnect() {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const documentObj = {
    createElement: () => root,
    createElementNS: () => svg,
    defaultView: windowObj,
    documentElement: { lang: 'ru' },
  };
  root.ownerDocument = documentObj;
  const container = {
    ownerDocument: documentObj,
    append() {},
    clientWidth: 800,
    clientHeight: 580,
  };

  let selectedId = null;
  const editor = new RoomEditor(container, {
    onSelectCabinet: id => { selectedId = id; },
    onMoveCabinet: () => {},
    onResizeCabinet: () => {},
  });

  const project = createDefaultProject();
  const parent = createCabinet('tall', project, { width: 900, depth: 600 });
  const mezzanine = createCabinet('wall', project, { parentId: parent.id, width: 900, depth: 600 });
  project.cabinets = [parent, mezzanine];

  editor.setProject(project);

  const target = {
    dataset: { roomCabinet: mezzanine.id },
    closest: selector => {
      if (selector.includes('[data-room-cabinet]')) return target;
      if (selector === 'svg') return svg;
      return null;
    },
  };

  const event = {
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    button: 0,
    altKey: false,
    shiftKey: false,
    target,
    preventDefault: () => {},
    stopPropagation: () => {},
  };

  editor.pointerDown(event);

  // Clicking mezzanine selects it for inspection
  assert.equal(selectedId, mezzanine.id);
  // Dragging must NOT be initiated (drag is null)
  assert.equal(editor.drag, null);
  // Hint explains that mezzanine is tied to parent cabinet
  assert.match(editor.hint, /привязана к основному шкафу/);
});

test('i18n contains all mezzanine attachment translations for ru, tr, en', () => {
  const ruMsg = 'Антресоль привязана к основному шкафу. Перемещайте основной шкаф.';
  assert.equal(translateText(ruMsg, 'ru'), ruMsg);
  assert.match(translateText(ruMsg, 'tr'), /Üst dolap ana dolaba bağlıdır/);
  assert.match(translateText(ruMsg, 'en'), /The top cabinet is attached to the main cabinet/);

  const dimMsg = 'Ширина и глубина антресоли привязаны к основному шкафу.';
  assert.equal(translateText(dimMsg, 'ru'), dimMsg);
  assert.match(translateText(dimMsg, 'tr'), /Üst dolabın genişlik ve derinliği ana dolaba bağlıdır/);
  assert.match(translateText(dimMsg, 'en'), /The top cabinet width and depth are attached to the main cabinet/);
});
