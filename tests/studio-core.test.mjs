import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleGlobalKeydown,
  setMeasureTool,
  getMeasureToolActive,
  getDrcStatus,
  renderDrcStatusBadge,
  switchMode,
  switchRoomView,
  switchCabinetView
} from '../src/studio.js';
import { get3DMeasurementMetrics } from '../src/room-renderer-webgl.js';
import { makeScene } from '../src/renderer.js';
import { createDefaultProject } from '../src/engine.js';

function createMockEvent(key, options = {}) {
  return {
    key,
    defaultPrevented: false,
    ctrlKey: Boolean(options.ctrlKey),
    metaKey: Boolean(options.metaKey),
    altKey: Boolean(options.altKey),
    shiftKey: Boolean(options.shiftKey),
    preventDefault() {
      this.defaultPrevented = true;
    },
    target: {
      tagName: options.tagName || 'DIV',
      isContentEditable: Boolean(options.isContentEditable),
      matches: () => Boolean(options.matchesInput)
    }
  };
}

test('switchMode, switchRoomView, and switchCabinetView safely manage studio state', () => {
  const context = {
    mode: 'cabinet',
    roomView: 'plan',
    cabinetView: 'scheme'
  };

  // Mode switching
  assert.equal(switchMode('room', context), true);
  assert.equal(context.mode, 'room');
  assert.equal(switchMode('cutting', context), true);
  assert.equal(context.mode, 'cutting');
  assert.equal(switchMode('drawings', context), true);
  assert.equal(context.mode, 'drawings');
  assert.equal(switchMode('cabinet', context), true);
  assert.equal(context.mode, 'cabinet');
  assert.equal(switchMode('invalid-mode', context), false);
  assert.equal(context.mode, 'cabinet');

  // Room view switching
  assert.equal(switchRoomView('3d', context), true);
  assert.equal(context.roomView, '3d');
  assert.equal(switchRoomView('render', context), true);
  assert.equal(context.roomView, 'render');
  assert.equal(switchRoomView('plan', context), true);
  assert.equal(context.roomView, 'plan');
  assert.equal(switchRoomView('nonexistent-view', context), false);
  assert.equal(context.roomView, 'plan');

  // Cabinet view switching
  assert.equal(switchCabinetView('3d', context), true);
  assert.equal(context.cabinetView, '3d');
  assert.equal(switchCabinetView('drawings', context), true);
  assert.equal(context.cabinetView, 'drawings');
  assert.equal(switchCabinetView('scheme', context), true);
  assert.equal(context.cabinetView, 'scheme');
  assert.equal(switchCabinetView('bad-view', context), false);
  assert.equal(context.cabinetView, 'scheme');
});

test('setMeasureTool toggles 2D roomEditor and 3D roomRenderer measurement modes', () => {
  let roomEditorTool = 'select';
  let roomRendererMeasureActive = false;

  const mockEditor = {
    setTool(tool) {
      roomEditorTool = tool;
    }
  };
  const mockRenderer = {
    setMeasureTool(active) {
      roomRendererMeasureActive = active;
    }
  };

  const context = {
    roomEditor: mockEditor,
    roomRenderer: mockRenderer,
    measureToolActive: false
  };

  assert.equal(getMeasureToolActive(context), false);

  // Activate measurement tool
  const stateActive = setMeasureTool(true, context);
  assert.equal(stateActive, true);
  assert.equal(getMeasureToolActive(context), true);
  assert.equal(roomEditorTool, 'measure');
  assert.equal(roomRendererMeasureActive, true);

  // Deactivate measurement tool
  const stateInactive = setMeasureTool(false, context);
  assert.equal(stateInactive, false);
  assert.equal(getMeasureToolActive(context), false);
  assert.equal(roomEditorTool, 'select');
  assert.equal(roomRendererMeasureActive, false);
});

test('get3DMeasurementMetrics safely coalesces 2D and incomplete coordinate arrays without producing NaN', () => {
  // Complete 3D points
  const p1_full = [100, 200, 300];
  const p2_full = [400, 600, 300];
  const fullMetrics = get3DMeasurementMetrics(p1_full, p2_full);
  assert.equal(Number.isFinite(fullMetrics.distance), true);
  assert.equal(fullMetrics.distance, 500);
  assert.equal(fullMetrics.distanceHorizontal, 300);

  // 2D arrays (missing index 2 for z) - Regression fix from Reviewer M3.1
  const p1_2d = [100, 200];
  const p2_2d = [100, 200, 500];
  const partialMetrics = get3DMeasurementMetrics(p1_2d, p2_2d);
  assert.equal(Number.isFinite(partialMetrics.dx), true);
  assert.equal(Number.isFinite(partialMetrics.dy), true);
  assert.equal(Number.isFinite(partialMetrics.dz), true);
  assert.equal(Number.isFinite(partialMetrics.distance), true);
  assert.equal(Number.isFinite(partialMetrics.distanceHorizontal), true);
  assert.equal(partialMetrics.dx, 0);
  assert.equal(partialMetrics.dy, 0);
  assert.equal(partialMetrics.dz, 500);
  assert.equal(partialMetrics.distance, 500);
  assert.equal(partialMetrics.distanceHorizontal, 500);

  // Partial objects
  const objMetrics = get3DMeasurementMetrics({ x: 50 }, { x: 50, z: 120 });
  assert.equal(Number.isFinite(objMetrics.distance), true);
  assert.equal(objMetrics.distance, 120);
  assert.equal(objMetrics.distanceHorizontal, 120);
});

test('getDrcStatus and renderDrcStatusBadge provide rich feedback for kitchen projects', () => {
  const cleanProject = createDefaultProject('tr');
  const cleanStatus = getDrcStatus(cleanProject);
  assert.equal(typeof cleanStatus.count, 'number');
  assert.equal(typeof cleanStatus.errors, 'number');
  assert.equal(typeof cleanStatus.warnings, 'number');
  assert.ok(Array.isArray(cleanStatus.issues));

  // Render badge with 0 issues
  const okBadgeRu = renderDrcStatusBadge([], 'ru');
  assert.match(okBadgeRu, /drc-status-badge/);
  assert.match(okBadgeRu, /ok/);
  assert.match(okBadgeRu, /DRC: норма/);

  const okBadgeTr = renderDrcStatusBadge([], 'tr');
  assert.doesNotMatch(okBadgeTr, /[А-Яа-яЁё]/u, 'Turkish OK badge must not leak Cyrillic');
  assert.match(okBadgeTr, /DRC: normal/);

  // Render badge with warnings
  const mockWarnings = [
    { level: 'warning', code: 'work-triangle-bounds', message: 'Work triangle warning' },
    { level: 'warning', code: 'aisle-clearance-too-narrow', message: 'Aisle warning' }
  ];
  const warnBadge = renderDrcStatusBadge(mockWarnings, 'en');
  assert.match(warnBadge, /warning/);
  assert.match(warnBadge, /2/);
  assert.doesNotMatch(warnBadge, /[А-Яа-яЁё]/u, 'English warning badge must not leak Cyrillic');

  // Render badge with errors
  const mockErrors = [
    { level: 'error', message: 'Invalid outline' },
    { level: 'warning', message: 'Clearance warning' }
  ];
  const errorBadge = renderDrcStatusBadge(mockErrors, 'ru');
  assert.match(errorBadge, /error/);
  assert.match(errorBadge, /1/);
});

test('handleGlobalKeydown guards modifier key chords (Reviewer M3.1 hardening)', () => {
  let deletedCabId = null;
  const context = {
    mode: 'cabinet',
    cabinetView: 'scheme',
    roomView: 'plan',
    cabinetId: 'cab-target',
    deleteCabinet: id => { deletedCabId = id; },
    modalOpen: false
  };

  // Plain Delete -> Deletion allowed
  deletedCabId = null;
  const deleteEv = createMockEvent('Delete');
  assert.equal(handleGlobalKeydown(deleteEv, context), true);
  assert.equal(deleteEv.defaultPrevented, true);
  assert.equal(deletedCabId, 'cab-target');

  // Plain Backspace -> Deletion allowed
  deletedCabId = null;
  const backspaceEv = createMockEvent('Backspace');
  assert.equal(handleGlobalKeydown(backspaceEv, context), true);
  assert.equal(backspaceEv.defaultPrevented, true);
  assert.equal(deletedCabId, 'cab-target');

  // Ctrl+Shift+Delete (Browser Clear History chord) -> Must be blocked!
  deletedCabId = null;
  const ctrlShiftDel = createMockEvent('Delete', { ctrlKey: true, shiftKey: true });
  assert.equal(handleGlobalKeydown(ctrlShiftDel, context), false);
  assert.equal(ctrlShiftDel.defaultPrevented, false);
  assert.equal(deletedCabId, null);

  // Alt+Backspace (Browser Back / Word Deletion) -> Must be blocked!
  deletedCabId = null;
  const altBackspace = createMockEvent('Backspace', { altKey: true });
  assert.equal(handleGlobalKeydown(altBackspace, context), false);
  assert.equal(altBackspace.defaultPrevented, false);
  assert.equal(deletedCabId, null);

  // Meta+Delete / Command+Delete -> Must be blocked!
  deletedCabId = null;
  const metaDel = createMockEvent('Delete', { metaKey: true });
  assert.equal(handleGlobalKeydown(metaDel, context), false);
  assert.equal(metaDel.defaultPrevented, false);
  assert.equal(deletedCabId, null);

  // Shift+Delete -> Must be blocked!
  deletedCabId = null;
  const shiftDel = createMockEvent('Delete', { shiftKey: true });
  assert.equal(handleGlobalKeydown(shiftDel, context), false);
  assert.equal(shiftDel.defaultPrevented, false);
  assert.equal(deletedCabId, null);

  // Shift+Backspace -> Must be blocked!
  deletedCabId = null;
  const shiftBackspace = createMockEvent('Backspace', { shiftKey: true });
  assert.equal(handleGlobalKeydown(shiftBackspace, context), false);
  assert.equal(shiftBackspace.defaultPrevented, false);
  assert.equal(deletedCabId, null);
});

test('makeScene passes freestanding flag in obstacle extras (Reviewer M3.2 recommendation)', () => {
  const project = {
    room: {
      width: 4000,
      depth: 3000,
      height: 2700,
      wallThickness: 150,
      outline: [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 3000 }, { x: 0, z: 3000 }],
      windows: [
        {
          id: 'pillar-1',
          kind: 'box',
          wallIndex: -1,
          x: 2000,
          z: 1500,
          width: 400,
          depth: 400,
          height: 2700,
          freestanding: true
        }
      ]
    },
    cabinets: []
  };

  const scene = makeScene(project, { room: true, allFaces: false }, [0, 0.45, -1]);
  assert.ok(scene.faces.length > 0, 'Scene should contain faces');

  const obstacleFace = scene.faces.find(f => f.obstacleId === 'pillar-1');
  assert.ok(obstacleFace, 'Freestanding pillar face should be present in scene');
  assert.equal(obstacleFace.freestanding, true, 'obstacleFace.freestanding should be true');
});
