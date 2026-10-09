import test from 'node:test';
import assert from 'node:assert/strict';
import { CabinetEditor } from '../src/cabinet-editor.js';
import { createDefaultProject, getCabinetLayout, validateProject } from '../src/engine.js';

// Use the actual pointer handlers and constructor subscriptions, while replacing
// SVG drawing and coordinate conversion with a deterministic millimetre plane.
function fixture(project = createDefaultProject()) {
  const previousObserver = globalThis.ResizeObserver;
  let disconnected = false;
  globalThis.ResizeObserver = class { observe() {} disconnect() { disconnected = true; } };
  const listeners = new Map(), captures = [], commits = [], selections = [];
  const container = {
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
    setPointerCapture(id) { captures.push(id); },
  };
  const editor = new CabinetEditor(container, { onResize: (id, axis, value) => commits.push({ id, axis, value }), onSelect: id => selections.push(id) });
  editor.render = () => {
    const shown = editor.draft || editor.project;
    const cabinet = shown?.cabinets.find(c => c.id === editor.cabinet?.id);
    if (cabinet) editor.layout = getCabinetLayout(cabinet, shown);
  };
  editor.screenPoint = event => ({ x: event.clientX, y: event.clientY });
  editor.setProject(project, project.cabinets[0].id, null);
  return { editor, project, commits, selections, captures, listeners, cleanup() { editor.destroy(); assert.equal(listeners.size, 0); assert.equal(disconnected, true); if (previousObserver === undefined) delete globalThis.ResizeObserver; else globalThis.ResizeObserver = previousObserver; } };
}

function pointer(x, y, dataset = {}, pointerId = 7) {
  return { clientX: x, clientY: y, pointerId, button: 0, shiftKey: false, preventDefault() {}, target: { closest() { return Object.keys(dataset).length ? { dataset } : null; } } };
}

function startDivider(f, partition, x = 0, y = 0) {
  const data = f.editor.dividerData(partition, f.editor.layout);
  const event = pointer(x, y, { divider: partition.id, resizeNode: data.nodeId, axis: partition.axis });
  f.listeners.get('pointerdown')(event);
  return data;
}

test('divider gesture previews a separate draft and commits only once on pointer release', () => {
  const f = fixture();
  try {
    const original = structuredClone(f.project), partition = f.editor.layout.partitions[0];
    const selected = startDivider(f, partition);
    assert.deepEqual(f.captures, [7]);
    f.listeners.get('pointermove')(pointer(0, 75));
    assert.equal(f.commits.length, 0);
    assert.notEqual(f.editor.draft, f.project);
    assert.deepEqual(f.project, original, 'preview does not mutate the production project');
    const draftGeometry = getCabinetLayout(f.editor.draft.cabinets[0], f.editor.draft);
    assert.equal(draftGeometry.nodes.find(node => node.id === selected.nodeId).height, 975);
    f.listeners.get('pointerup')(pointer(0, 75));
    assert.deepEqual(f.commits, [{ id: selected.nodeId, axis: 'horizontal', value: 975 }]);
    assert.equal(f.editor.drag, null);
    assert.equal(f.editor.draft, null);
    assert.deepEqual(f.project, original, 'the owner applies the callback as its own undoable change');
    f.listeners.get('pointerup')(pointer(0, 75));
    assert.equal(f.commits.length, 1);
  } finally { f.cleanup(); }
});

test('pointer cancellation discards a valid divider draft without committing', () => {
  const f = fixture();
  try {
    const original = structuredClone(f.project);
    startDivider(f, f.editor.layout.partitions[0]);
    f.listeners.get('pointermove')(pointer(0, 100));
    assert.ok(f.editor.draft);
    f.listeners.get('pointercancel')(pointer(0, 100));
    assert.equal(f.commits.length, 0);
    assert.equal(f.editor.drag, null);
    assert.equal(f.editor.draft, null);
    assert.deepEqual(f.project, original);
  } finally { f.cleanup(); }
});

test('nested divider metadata targets the immediate preceding branch rather than a nearby leaf', () => {
  const project = createDefaultProject();
  const leaf = id => ({ id, kind: 'section', front: 'open', doors: 0, drawers: 0, shelves: 0, depth: null });
  project.cabinets[0].layout = { id: 'root', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { id: 'left-branch', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [
      { id: 'upper-branch', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [leaf('upper-left'), leaf('upper-right')] },
      leaf('lower-left'),
    ] },
    leaf('right-column'),
  ] };
  const f = fixture(project);
  try {
    const geometry = f.editor.layout;
    for (const partition of geometry.partitions) assert.equal(f.editor.dividerData(partition, geometry).nodeId, partition.beforeChildId);
    const divider = geometry.partitions.find(partition => partition.parentId === 'left-branch');
    const data = startDivider(f, divider);
    assert.equal(data.nodeId, 'upper-branch');
    f.listeners.get('pointermove')(pointer(0, 50));
    const draft = getCabinetLayout(f.editor.draft.cabinets[0], f.editor.draft);
    const branch = draft.nodes.find(node => node.id === 'upper-branch');
    assert.ok(branch.height > data.entry.height);
    assert.equal(draft.nodes.find(node => node.id === 'upper-left').height, branch.height);
    assert.equal(draft.nodes.find(node => node.id === 'upper-right').height, branch.height);
    f.listeners.get('pointerup')(pointer(0, 50));
    assert.equal(f.commits[0].id, 'upper-branch');
    assert.equal(f.commits[0].axis, 'horizontal');
  } finally { f.cleanup(); }
});

test('section selection emits no resize and an extreme divider gesture commits a valid clamped draft', () => {
  const f = fixture();
  try {
    const original = structuredClone(f.project);
    f.listeners.get('pointerdown')(pointer(10, 10, { node: 'section-middle' }));
    assert.deepEqual(f.selections, ['section-middle']);
    assert.equal(f.editor.drag, undefined);
    assert.equal(f.commits.length, 0);
    startDivider(f, f.editor.layout.partitions[0]);
    f.listeners.get('pointermove')(pointer(0, 100000));
    assert.ok(f.editor.draft, 'an extreme gesture stops at the nearest valid divider position');
    assert.deepEqual(validateProject(f.editor.draft).filter(item => item.level === 'error'), []);
    const geometry = getCabinetLayout(f.editor.draft.cabinets[0], f.editor.draft);
    const accepted = geometry.sections.find(section => section.id === 'section-top').height;
    assert.ok(accepted > 900 && accepted < 100000);
    assert.equal(geometry.sections.find(section => section.id === 'section-bottom').height, 648, 'the divider keeps the non-adjacent lower opening unchanged');
    assert.equal(f.commits.length, 0, 'a clamped preview still commits only on release');
    assert.deepEqual(f.project, original);
    f.listeners.get('pointerup')(pointer(0, 100000));
    assert.deepEqual(f.commits, [{ id: 'section-top', axis: 'horizontal', value: accepted }]);
    assert.deepEqual(f.project, original);
  } finally { f.cleanup(); }
});

test('appliance divider preview uses and commits the accepted opening width rather than the undersized pointer request', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.width = 1400;
  const leaf = id => ({ id, kind: 'section', front: 'open', doors: 0, drawers: 0, shelves: 0, depth: null });
  const machine = leaf('machine');
  machine.appliance = { type: 'washer', label: '600 mm machine', width: 600, height: 850, depth: 500, useClearances: true, clearances: { side: 25, top: 25, rear: 50 } };
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [machine, leaf('storage')] };
  const f = fixture(project);
  try {
    const original = structuredClone(project), divider = f.editor.layout.partitions[0];
    startDivider(f, divider);
    f.listeners.get('pointermove')(pointer(-500, 0));
    assert.equal(f.commits.length, 0);
    const shown = getCabinetLayout(f.editor.draft.cabinets[0], f.editor.draft).sections.find(section => section.id === 'machine');
    assert.ok(Math.abs(shown.width - 650) < .001, '600 mm appliance plus 25 mm on each side sets the accepted minimum');
    assert.equal(f.editor.drag.value, shown.width);
    assert.deepEqual(f.project, original);
    f.listeners.get('pointerup')(pointer(-500, 0));
    assert.deepEqual(f.commits, [{ id: 'machine', axis: 'vertical', value: shown.width }]);
    assert.deepEqual(f.project, original, 'the preview and callback leave history management to the studio');
  } finally { f.cleanup(); }
});
