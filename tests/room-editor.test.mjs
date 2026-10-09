import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomEditor } from '../src/room-editor.js';
import { getRoomOutline, polygonIsSimple, polygonArea, remapWindows, wallLength } from '../src/room-geometry.js';
import { canPlaceCabinet } from '../src/engine.js';

// Exercise the editor's gesture/commit contract independently of SVG rendering.
const editorFixture = () => {
  const editor = Object.create(RoomEditor.prototype), changes = [], moves = [], windowMoves = [];
  editor.project = { room: { width: 4000, depth: 3000, windows: [] }, cabinets: [{ id: 'cab', x: 100, z: 100, width: 600, depth: 400 }], materials: [] };
  editor.outline = getRoomOutline(editor.project.room);
  editor.selectedWall = 0; editor.selectedCorner = null; editor.drag = null; editor.hint = '';
  editor.callbacks = { onChange: (points, metadata) => changes.push({ points, metadata }), onMoveCabinet: (id, position) => moves.push({ id, position }), onMoveWindow: (id, position) => windowMoves.push({ id, position }) };
  editor.root = { releasePointerCapture() {} };
  editor.render = () => {};
  editor.toPlan = event => ({ x: event.clientX, z: event.clientY });
  return { editor, changes, moves, windowMoves };
};
const pointer = (x, z, pointerId = 1) => ({ clientX: x, clientY: z, pointerId, preventDefault() {} });

const installSelectionSurface=editor=>{
  const svg={};
  editor.root={contains:()=>true,focus(){},setPointerCapture(){},releasePointerCapture(){}};
  return {svg,empty:{closest:selector=>selector==='svg'?svg:null},corner:index=>({dataset:{roomCorner:String(index)},closest(){return this;}})};
};

test('adding a corner selects it without mutating the project, removal keeps at least three', () => {
  const { editor, changes } = editorFixture();
  const original = structuredClone(editor.project);
  assert.equal(editor.addCorner(), true);
  assert.equal(editor.outline.length, 5);
  assert.deepEqual(editor.outline[1], { x: 2000, z: 0 });
  assert.equal(editor.selectedCorner, 1);
  assert.equal(changes[0].metadata.kind, 'insert');
  assert.deepEqual(editor.project, original);
  assert.equal(editor.removeCorner(), true);
  assert.equal(editor.outline.length, 4);
  editor.selectedCorner = 0; editor.removeCorner();
  assert.equal(editor.outline.length, 3);
  editor.selectedCorner = 0;
  assert.equal(editor.removeCorner(), false);
  assert.equal(editor.outline.length, 3);
});

test('corner dragging drafts on a ten-millimetre grid and commits only on pointer release', () => {
  const { editor, changes } = editorFixture();
  const original = structuredClone(editor.outline);
  editor.drag = { type: 'corner', index: 1, pointerId: 1, start: { x: 4000, z: 0 }, original, draft: structuredClone(original), moved: false };
  editor.pointerMove(pointer(4123, 50));
  assert.equal(changes.length, 0);
  assert.deepEqual(editor.outline, original);
  assert.deepEqual(editor.drag.draft[1], { x: 4120, z: 0 });
  editor.pointerUp(pointer(4123, 50));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].metadata.kind, 'drag');
  assert.deepEqual(changes[0].metadata.oldOutline, original);
  assert.deepEqual(editor.outline[1], { x: 4120, z: 0 });
});

test('an invalid dragged contour is rolled back and explained without calling onChange', () => {
  const { editor, changes } = editorFixture();
  const original = structuredClone(editor.outline), draft = structuredClone(original);
  draft[1] = { x: 0, z: 3000 }; // duplicates corner 4
  editor.drag = { type: 'corner', index: 1, pointerId: 1, original, draft, moved: true };
  editor.pointerUp(pointer(0, 3000));
  assert.equal(changes.length, 0);
  assert.deepEqual(editor.outline, original);
  assert.match(editor.hint, /Стены пересекаются/);
  assert.equal(editor.applyOutline([{ x: -20001, z: 0 }, { x: 1000, z: 0 }, { x: 0, z: 1000 }], { kind: 'drag' }), false);
});

test('cabinet dragging uses a separate callback and cancellation never commits', () => {
  const { editor, changes, moves } = editorFixture();
  editor.drag = { type: 'cabinet', id: 'cab', pointerId: 1, start: { x: 100, z: 100 }, original: { x: 100, z: 100 }, draft: { x: 100, z: 100 }, moved: false };
  editor.pointerMove(pointer(331, 358));
  assert.equal(moves.length, 0);
  editor.pointerUp(pointer(331, 358));
  assert.deepEqual(moves, [{ id: 'cab', position: { x: 331, z: 358 } }]);
  assert.equal(changes.length, 0);
  assert.deepEqual(editor.project.cabinets[0], { id: 'cab', x: 100, z: 100, width: 600, depth: 400 });
  editor.drag = { type: 'cabinet', pointerId: 1, moved: true };
  editor.pointerCancel(pointer(500, 500));
  assert.equal(moves.length, 1);
  assert.equal(editor.drag, null);
});

test('quick shape choices directly create valid bounded concave outlines', () => {
  const { editor, changes } = editorFixture();
  for (const kind of ['l', 'niche', 'rectangle']) {
    editor.preset(kind);
    assert.equal(polygonIsSimple(editor.outline), true);
    assert.equal(editor.outline.every(p => p.x >= 0 && p.z >= 0 && p.x <= 20000 && p.z <= 20000), true);
    assert.equal(changes.at(-1).metadata.kind, 'preset');
    assert.equal(changes.at(-1).metadata.preset, kind);
  }
  assert.equal(editor.outline.length, 4);
});

test('plan labels and corner handles retain readable screen size on small plans', () => {
  const { editor } = editorFixture();
  const controls = { '.room-toolbar': 40, '.room-plan-hint': 50 };
  editor.root = { clientWidth: 320, clientHeight: 400, querySelector: selector => controls[selector] ? { offsetHeight: controls[selector] } : null };
  const box = { width: 4872, depth: 4072 };
  const metrics = editor.planMetrics(box);
  assert.equal(metrics.scale, Math.min(320 / box.width, 310 / box.depth));
  assert.ok(Math.abs(metrics.font * metrics.scale - 12) < 1e-6);
  assert.ok(Math.abs(metrics.cabinetFont * metrics.scale - 11) < 1e-6);
  assert.ok(Math.abs(metrics.handle * metrics.scale - 6) < 1e-6);
});

test('measured SVG size wins over stale container size and hidden plans have finite fallback metrics', () => {
  const { editor } = editorFixture();
  editor.root = { clientWidth: 900, clientHeight: 700, querySelector: selector => selector === '.room-plan' ? { getBoundingClientRect: () => ({ width: 320, height: 260 }) } : null };
  const actual = editor.planMetrics({ width: 4200, depth: 3400 });
  assert.equal(actual.scale, Math.min(320 / 4200, 260 / 3400));
  editor.root = {};
  const fallback = editor.planMetrics({ width: 4200, depth: 3400 });
  assert.equal(Number.isFinite(fallback.font), true);
  assert.equal(Number.isFinite(fallback.handle), true);
});

test('corner default locks its dominant axis and Alt allows free signed coordinates without an initial jump', () => {
  const { editor, changes } = editorFixture(), original = structuredClone(editor.outline);
  editor.drag = { type: 'corner', index: 0, pointerId: 1, start: { x: 12, z: 8 }, original, draft: structuredClone(original), moved: false };
  editor.pointerMove(pointer(12, 8));
  assert.deepEqual(editor.drag.draft[0], original[0]);
  editor.pointerMove(pointer(27, -143));
  assert.deepEqual(editor.drag.draft[0], { x: 0, z: -150 });
  editor.pointerMove({ ...pointer(-143, -143), altKey: true });
  assert.deepEqual(editor.drag.draft[0], { x: -150, z: -150 });
  editor.pointerUp(pointer(-143, -143));
  assert.equal(changes.length, 1);
  assert.equal(polygonIsSimple(editor.outline), true);
});

test('dragging a vertical wall shifts only X of its two endpoints and leaves other corners fixed', () => {
  const { editor, changes } = editorFixture(), original = structuredClone(editor.outline);
  editor.drag = { type: 'wall', index: 1, pointerId: 1, start: { x: 4000, z: 1500 }, original, draft: structuredClone(original), normal: { x: -1, z: 0 }, moved: false };
  editor.pointerMove(pointer(4244, 1980));
  assert.equal(changes.length, 0);
  assert.deepEqual(editor.drag.draft, [{ x: 0, z: 0 }, { x: 4240, z: 0 }, { x: 4240, z: 3000 }, { x: 0, z: 3000 }]);
  editor.pointerUp(pointer(4244, 1980));
  assert.equal(changes.length, 1);
  assert.equal(changes[0].metadata.wallIndex, 1);
});

test('angled wall endpoints move together along its normal without changing wall length', () => {
  const { editor } = editorFixture();
  const original = [{ x: 0, z: 0 }, { x: 3000, z: 1000 }, { x: 3000, z: 3000 }, { x: 0, z: 3000 }], length = Math.hypot(3000, 1000);
  editor.outline = original;
  editor.drag = { type: 'wall', index: 0, pointerId: 1, start: { x: 1500, z: 500 }, original, draft: structuredClone(original), normal: { x: -1000 / length, z: 3000 / length }, moved: false };
  editor.pointerMove(pointer(1500, 700));
  const [a, b] = editor.drag.draft;
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - length) < 1e-6);
  assert.ok(Math.abs(a.x * 3000 + a.z * 1000) < 1e-6);
});

test('local niche and protrusion preserve existing contour and act near the selected corner', () => {
  for (const kind of ['niche', 'protrusion']) {
    const { editor, changes } = editorFixture(), original = structuredClone(editor.outline), area = polygonArea(original);
    editor.selectedCorner = 0;
    assert.equal(editor.addFeature(kind), true);
    assert.equal(editor.outline.length, 8);
    assert.equal(original.every(p => editor.outline.some(q => p.x === q.x && p.z === q.z)), true);
    assert.equal(editor.outline[1].x, 100);
    assert.equal(polygonIsSimple(editor.outline), true);
    assert.equal(kind === 'niche' ? polygonArea(editor.outline) > area : polygonArea(editor.outline) < area, true);
    assert.equal(changes[0].metadata.kind, 'feature');
  }
});

test('window and door drag along the wall, clamp to both ends, and commit only on release', () => {
  for (const kind of ['window', 'door']) {
    const { editor, windowMoves, changes } = editorFixture();
    editor.project.room.windows = [{ id: 'opening', kind, wallIndex: 0, offset: 100, width: 900, height: 2000, sill: 0 }];
    editor.setSelectedWindow('opening');
    assert.equal(editor.selectedWindowId, 'opening');
    assert.equal(editor.selectedWall, 0);
    editor.drag = { type: 'window', id: 'opening', pointerId: 1, start: { x: 200, z: 0 }, original: 100, draft: 100, direction: { x: 1, z: 0 }, max: 3100, moved: false };
    editor.pointerMove(pointer(9999, 800));
    assert.equal(editor.drag.draft, 3100);
    assert.equal(windowMoves.length, 0);
    editor.pointerMove(pointer(-9999, 800));
    assert.equal(editor.drag.draft, 0);
    editor.pointerUp(pointer(-9999, 800));
    assert.deepEqual(windowMoves, [{ id: 'opening', position: { offset: 0 } }]);
    assert.equal(changes.length, 0);
    assert.equal(editor.project.room.windows[0].offset, 100);
    editor.drag = { type: 'window', pointerId: 1, moved: true };
    editor.pointerCancel(pointer(1, 1));
    assert.equal(windowMoves.length, 1);
  }
});

test('selected door plan renders a swing and live clearances at both wall ends', () => {
  const { editor } = editorFixture();
  editor.project.room.windows = [{ id: 'door-1', kind: 'door', wallIndex: 0, offset: 100, width: 900, height: 2000, sill: 0 }];
  editor.selectedWindowId = 'door-1';
  editor.root = { clientWidth: 500, clientHeight: 450, querySelector: () => null, innerHTML: '' };
  RoomEditor.prototype.render.call(editor);
  assert.match(editor.root.innerHTML, /data-room-window="door-1"/);
  assert.match(editor.root.innerHTML, /room-door-gap is-selected/);
  assert.match(editor.root.innerHTML, /stroke-dasharray="5 4"/);
  assert.equal(editor.root.innerHTML.replace(/\s/g, '').includes('Дверь·слева100·справа3000мм'), true);
  editor.drag = { type: 'window', id: 'door-1', draft: 400, viewBox: editor.viewBox };
  RoomEditor.prototype.render.call(editor);
  assert.equal(editor.root.innerHTML.replace(/\s/g, '').includes('Дверь·слева400·справа2700мм'), true);
  assert.equal(editor.project.room.windows[0].offset, 100);
  assert.doesNotMatch(editor.root.innerHTML, /data-room-preset|data-room-action/);
});

test('local feature selection survives a synchronous parent render callback', () => {
  const { editor } = editorFixture();
  const selected = [];
  editor.callbacks.onChange = () => editor.setSelectedWall(0);
  editor.callbacks.onSelectWall = index => selected.push(index);
  assert.equal(editor.addFeature('niche'), true);
  assert.equal(editor.selectedWall, 2);
  assert.deepEqual(selected, [2]);
});

test('a protrusion on an unrelated wall preserves a door in the default L-shaped room', () => {
  const { editor } = editorFixture();
  editor.project.room.outline = [{ x: 0, z: 0 }, { x: 4200, z: 0 }, { x: 4200, z: 2400 }, { x: 3200, z: 2400 }, { x: 3200, z: 3400 }, { x: 0, z: 3400 }];
  editor.project.room.windows = [{ id: 'door', kind: 'door', wallIndex: 1, offset: 800, width: 800, height: 2000, sill: 0 }];
  editor.setProject(editor.project);
  editor.setSelectedWall(4);
  editor.callbacks.onChange = (outline, metadata) => {
    editor.project.room.windows = remapWindows(editor.project.room, outline, metadata);
    editor.project.room.outline = outline;
    editor.setProject(editor.project);
  };
  assert.equal(editor.addFeature('protrusion'), true);
  assert.equal(editor.outline.length, 10);
  const door = editor.project.room.windows[0];
  assert.equal(door.wallIndex, 1);
  assert.equal(door.offset, 800);
  assert.equal(wallLength(editor.project.room, door.wallIndex), 2400);
  assert.equal(wallLength(editor.project.room, door.wallIndex) - door.offset - door.width, 800);
});

test('features choose a free section of the selected wall without splitting a door or window', () => {
  for (const feature of ['niche', 'protrusion']) for (const kind of ['door', 'window']) {
    const { editor, changes } = editorFixture();
    editor.project.room = { width: 4200, depth: 2400, windows: [{ id: 'opening', kind, wallIndex: 1, offset: 800, width: 800, height: 2000, sill: 0 }] };
    editor.setProject(editor.project);
    editor.setSelectedWall(1);
    assert.equal(editor.addFeature(feature), true);
    const { points, metadata } = changes[0];
    const opening = remapWindows(editor.project.room, points, metadata)[0];
    const length = wallLength({ outline: points }, opening.wallIndex);
    assert.equal(points[2].z, 150);
    assert.equal(points[5].z, 750);
    assert.equal(opening.offset, 50);
    assert.equal(length - opening.offset - opening.width, 800);
    assert.equal(opening.kind, kind);
    assert.ok(opening.offset >= 0 && opening.offset + opening.width <= length);
  }
});

test('a wall occupied by an opening refuses a feature without changing the contour', () => {
  const { editor, changes } = editorFixture();
  editor.project.room = { width: 4200, depth: 2400, windows: [{ id: 'door', kind: 'door', wallIndex: 1, offset: 100, width: 2200, height: 2000, sill: 0 }] };
  editor.setProject(editor.project);
  editor.setSelectedWall(1);
  const original = structuredClone(editor.outline);
  assert.equal(editor.addFeature('protrusion'), false);
  assert.deepEqual(editor.outline, original);
  assert.equal(changes.length, 0);
  assert.match(editor.hint, /нет свободного места.*проём/);
});

const beginCabinetDrag = editor => {
  const cabinet = editor.project.cabinets[0];
  editor.drag = { type: 'cabinet', id: cabinet.id, pointerId: 1, start: { x: cabinet.x, z: cabinet.z }, original: { x: cabinet.x, z: cabinet.z }, draft: { x: cabinet.x, z: cabinet.z }, initialFits:canPlaceCabinet(cabinet,{...editor.project,room:{...editor.project.room,outline:editor.outline}}), moved: false };
};

test('cabinet dragging reaches the wall inset and reverses immediately after pointer overshoot', () => {
  const { editor, moves } = editorFixture();
  editor.project.room.height = 2700;
  editor.project.room.installationClearance = { walls: 50, ceiling: 100 };
  Object.assign(editor.project.cabinets[0], { y: 0, height: 2200 });
  beginCabinetDrag(editor);
  editor.pointerMove(pointer(300, 200));
  assert.deepEqual(editor.drag.draft, { x: 300, z: 200 });
  editor.pointerMove(pointer(3900, 200));
  const contact={...editor.drag.draft};
  assert.ok(contact.x>3349.9&&contact.x<3350);
  assert.equal(contact.z,200);
  assert.equal(canPlaceCabinet({...editor.project.cabinets[0],...contact},editor.project),true);
  assert.match(editor.hint, /скользит вдоль препятствия/);
  editor.pointerMove(pointer(3890, 200));
  assert.ok(Math.abs(editor.drag.draft.x-(contact.x-10))<1e-6,'a ten-millimetre pointer retreat moves the cabinet immediately, without consuming the blocked overshoot');
  const accepted={...editor.drag.draft};
  assert.equal(moves.length,0);
  editor.pointerUp(pointer(3890, 200));
  assert.deepEqual(moves, [{ id: 'cab', position: accepted }]);
  assert.deepEqual([editor.project.cabinets[0].x, editor.project.cabinets[0].z], [100, 100]);
});

test('cabinet drag includes the facade beyond carcass depth and commits only the resolved contact', () => {
  const { editor, moves } = editorFixture();
  editor.project.room.installationClearance = { walls: 50, ceiling: 0 };
  editor.project.cabinets[0].doors = 2;
  beginCabinetDrag(editor);
  editor.pointerMove(pointer(100, 2530));
  assert.deepEqual(editor.drag.draft, { x: 100, z: 2530 });
  editor.pointerMove(pointer(100, 2540));
  const contact={...editor.drag.draft};
  assert.equal(contact.x,100);
  assert.ok(contact.z>2531.9&&contact.z<2532,'the eighteen-millimetre facade and wall inset remain inside the room');
  assert.equal(canPlaceCabinet({...editor.project.cabinets[0],...contact},editor.project),true);
  editor.pointerUp(pointer(100, 2540));
  assert.deepEqual(moves, [{ id: 'cab', position: contact }]);
  beginCabinetDrag(editor);
  editor.pointerMove(pointer(-1000, 100));
  const leftContact={...editor.drag.draft};
  assert.ok(leftContact.x>50&&leftContact.x<50.1);
  assert.equal(canPlaceCabinet({...editor.project.cabinets[0],...leftContact},editor.project),true);
  editor.pointerUp(pointer(-1000, 100));
  assert.deepEqual(moves[1],{id:'cab',position:leftContact});
});

test('rotated cabinets cannot enter a concave room recess while dragging', () => {
  const { editor, moves } = editorFixture();
  editor.project.room.outline = [{ x: 0, z: 0 }, { x: 3000, z: 0 }, { x: 3000, z: 3000 }, { x: 2000, z: 3000 }, { x: 2000, z: 1000 }, { x: 1000, z: 1000 }, { x: 1000, z: 3000 }, { x: 0, z: 3000 }];
  editor.project.room.installationClearance = { walls: 10, ceiling: 0 };
  Object.assign(editor.project.cabinets[0], { x: 800, z: 100, width: 600, depth: 600, rotation: 90 });
  editor.setProject(editor.project);
  beginCabinetDrag(editor);
  editor.pointerMove(pointer(900, 200));
  assert.deepEqual(editor.drag.draft, { x: 900, z: 200 });
  editor.pointerMove(pointer(1800, 1500));
  const contact={...editor.drag.draft};
  assert.ok(contact.x>1700&&contact.z<400,'the rotated cabinet slides horizontally along the front of the recess');
  assert.equal(canPlaceCabinet({...editor.project.cabinets[0],...contact},editor.project),true);
  editor.pointerUp(pointer(1800, 1500));
  assert.deepEqual(moves, [{ id: 'cab', position: contact }]);
});

test('legacy ceiling deficits may remain while dragging improves placement, and release rechecks changed room bounds', () => {
  const { editor, moves } = editorFixture();
  editor.project.room.height = 2210;
  editor.project.room.installationClearance = { walls: 10, ceiling: 20 };
  Object.assign(editor.project.cabinets[0], { y: 0, height: 2200 });
  beginCabinetDrag(editor);
  editor.pointerMove(pointer(300, 200));
  assert.deepEqual(editor.drag.draft, { x: 300, z: 200 },'an unchanged imported ceiling deficit does not prevent lateral repositioning');
  editor.pointerUp(pointer(300, 200));
  assert.deepEqual(moves,[{id:'cab',position:{x:300,z:200}}]);
  editor.project.room.height = 2700;
  beginCabinetDrag(editor);
  editor.pointerMove(pointer(300, 200));
  editor.outline = [{ x: 0, z: 0 }, { x: 800, z: 0 }, { x: 800, z: 3000 }, { x: 0, z: 3000 }];
  editor.pointerUp(pointer(300, 200));
  assert.equal(moves.length, 1);
  assert.match(editor.hint, /Перемещение не сохранено/);
});

test('corner alignment snaps to a neighbour axis within twelve screen pixels and Alt bypasses it', () => {
  const { editor } = editorFixture();
  const original = [{ x: 0, z: 0 }, { x: 4000, z: 100 }, { x: 4000, z: 3000 }, { x: 0, z: 3000 }];
  editor.outline = original;
  editor.planMetrics = () => ({ scale: 1 });
  editor.drag = { type: 'corner', index: 1, pointerId: 1, start: { x: 4000, z: 100 }, original, draft: structuredClone(original), moved: false };
  editor.pointerMove(pointer(4000, 8));
  assert.deepEqual(editor.drag.draft[1], { x: 4000, z: 0 });
  editor.pointerMove({ ...pointer(4000, 8), altKey: true });
  assert.deepEqual(editor.drag.draft[1], { x: 4000, z: 10 });
  const shifted = [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 3700, z: 3000 }, { x: 0, z: 3000 }];
  editor.outline = shifted;
  editor.planMetrics = () => ({ scale: 0.1 });
  editor.drag = { type: 'corner', index: 2, pointerId: 1, start: { x: 3700, z: 3000 }, original: shifted, draft: structuredClone(shifted), moved: false };
  editor.pointerMove(pointer(3914, 3000));
  assert.deepEqual(editor.drag.draft[2], { x: 4000, z: 3000 });
  editor.planMetrics = () => ({ scale: 1 });
  editor.pointerMove(pointer(3914, 3000));
  assert.deepEqual(editor.drag.draft[2], { x: 3910, z: 3000 });
});

test('rubber-band corner selection previews without editing the room and commits selection only on release', () => {
  const {editor,changes}=editorFixture(), surface=installSelectionSurface(editor), before=structuredClone(editor.project);
  editor.pointerDown({...pointer(-100,-100),button:0,target:surface.empty});
  assert.equal(editor.drag.type,'selection');
  editor.pointerMove(pointer(4100,100));
  assert.deepEqual(editor.drag.draftIndices,[0,1]);
  assert.deepEqual(editor.getSelectedCorners(),[],'selection remains a reversible draft while the rectangle moves');
  assert.equal(changes.length,0);
  editor.pointerUp(pointer(4100,100));
  assert.deepEqual(editor.getSelectedCorners(),[0,1]);
  assert.equal(editor.selectedCorner,0);
  assert.deepEqual(editor.project,before);
  editor.pointerDown({...pointer(-100,2900),button:0,target:surface.empty,shiftKey:true});
  editor.pointerMove(pointer(4100,3100));editor.pointerUp(pointer(4100,3100));
  assert.deepEqual(editor.getSelectedCorners(),[0,1,2,3],'Shift rectangle adds to the existing selection');
  editor.pointerDown({...pointer(100,100),button:0,target:surface.empty});
  editor.pointerMove(pointer(100,100));editor.pointerUp(pointer(100,100));
  assert.deepEqual(editor.getSelectedCorners(),[],'a click on empty plan clears selection');
  assert.equal(changes.length,0);
});

test('Shift corner toggles and cancelled selection rectangles preserve the previous set', () => {
  const {editor}=editorFixture(),surface=installSelectionSurface(editor);
  const click=index=>editor.pointerDown({...pointer(0,0),button:0,shiftKey:true,target:surface.corner(index)});
  click(1);click(3);
  assert.deepEqual(editor.getSelectedCorners(),[1,3]);
  click(1);assert.deepEqual(editor.getSelectedCorners(),[3]);
  editor.pointerDown({...pointer(-100,-100),button:0,target:surface.empty});editor.pointerMove(pointer(4100,100));
  assert.deepEqual(editor.drag.draftIndices,[0,1]);
  editor.pointerCancel(pointer(4100,100));
  assert.deepEqual(editor.getSelectedCorners(),[3]);
  click(3);assert.deepEqual(editor.getSelectedCorners(),[]);
});

test('multi-corner deletion validates the final contour atomically and preserves remapped window and door positions', () => {
  const {editor}=editorFixture(),commits=[];
  editor.project.room.outline=[{x:0,z:0},{x:1000,z:0},{x:2000,z:0},{x:4000,z:0},{x:4000,z:3000},{x:0,z:3000}];
  editor.project.room.windows=[{id:'window',wallIndex:2,offset:500,width:800,height:1000,sill:900},{id:'door',kind:'door',wallIndex:3,offset:600,width:900,height:2000,sill:0}];
  editor.setProject(editor.project);
  const original=structuredClone(editor.outline);
  editor.callbacks.onChange=(points,metadata)=>{commits.push({points,metadata});editor.project.room.windows=remapWindows(editor.project.room,points,metadata);editor.project.room.outline=points;editor.setProject(editor.project);};
  editor.setSelectedCorners([1,2],false);
  assert.equal(editor.removeSelectedCorners(),true);
  assert.equal(commits.length,1,'one user gesture creates one history commit');
  assert.equal(commits[0].metadata.kind,'remove-many');
  assert.deepEqual(commits[0].metadata.indices,[1,2]);
  assert.deepEqual(commits[0].metadata.oldOutline,original);
  assert.equal(polygonIsSimple(editor.outline),true);
  assert.deepEqual(editor.project.room.windows.map(w=>[w.wallIndex,w.offset]),[[0,2500],[1,600]]);
  assert.equal(editor.project.room.windows[1].kind,'door');
  assert.deepEqual(editor.getSelectedCorners(),[]);
  editor.setSelectedCorners([0,1],false);
  assert.equal(editor.removeSelectedCorners(),false);
  assert.equal(commits.length,1);
  assert.match(editor.hint,/минимум три угла/);
});

test('deleting concave corners that would produce crossed walls changes neither geometry nor selection', () => {
  const {editor,changes}=editorFixture();
  editor.outline=[{x:0,z:0},{x:4000,z:0},{x:4000,z:4000},{x:3000,z:4000},{x:3000,z:1000},{x:1000,z:1000},{x:1000,z:4000},{x:0,z:4000}];
  const before=structuredClone(editor.outline);
  editor.setSelectedCorners([1,4],false);
  assert.equal(editor.removeSelectedCorners(),false);
  assert.deepEqual(editor.outline,before);
  assert.deepEqual(editor.getSelectedCorners(),[1,4]);
  assert.equal(changes.length,0);
  assert.match(editor.hint,/стены пересекаются/);
});

test('an owner rejection of corner deletion restores the contour and complete selection', () => {
  const {editor}=editorFixture();
  editor.project.room.outline=[{x:0,z:0},{x:1000,z:0},{x:2000,z:0},{x:4000,z:0},{x:4000,z:3000},{x:0,z:3000}];
  editor.setProject(editor.project);
  editor.setSelectedCorners([1,2],false);
  const before=structuredClone(editor.outline),selectedWalls=[],rejected=[];
  editor.callbacks.onSelectWall=index=>selectedWalls.push(index);
  editor.callbacks.onChange=(points,metadata)=>{
    rejected.push({points,metadata});
    editor.setProject(editor.project); // The parent renders its unchanged project.
    return false;
  };
  assert.equal(editor.removeSelectedCorners(),false);
  assert.equal(rejected.length,1);
  assert.deepEqual(editor.outline,before);
  assert.deepEqual(editor.getSelectedCorners(),[1,2]);
  assert.deepEqual(selectedWalls,[],'a rejected edit does not select a different wall');
});

test('Delete routes selected openings to their own callback and never intercepts editable inputs', () => {
  const {editor,changes}=editorFixture(),deleted=[];
  editor.callbacks.onDeleteOpening=id=>deleted.push(id);
  editor.selectedWindowId='door';
  let prevented=0;
  const key={key:'Delete',preventDefault:()=>prevented++,target:{closest:()=>null}};
  editor.keyDown({...key,target:{closest:()=>({tagName:'INPUT'})}});
  assert.deepEqual(deleted,[]);
  editor.keyDown(key);assert.deepEqual(deleted,['door']);assert.equal(prevented,1);assert.equal(changes.length,0);
  editor.setSelectedCorners([0],false);
  editor.keyDown(key);assert.equal(changes.length,1);assert.equal(editor.outline.length,3);assert.equal(prevented,2);
  editor.setSelectedCorners([0],false);
  editor.keyDown({...key,key:'Escape'});assert.deepEqual(editor.getSelectedCorners(),[]);
});
