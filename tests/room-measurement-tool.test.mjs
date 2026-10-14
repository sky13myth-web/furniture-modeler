import test from 'node:test';
import assert from 'node:assert/strict';
import { get2DMeasurementMetrics, RoomEditor } from '../src/room-editor.js';
import { get3DMeasurementMetrics, RoomWebGLRenderer } from '../src/room-renderer-webgl.js';

function createEditorFixture(options = {}) {
  const rootListeners = new Map();
  const windowListeners = new Map();
  const bounds = { left: 0, top: 0, width: 800, height: 600 };
  const svg = { getBoundingClientRect: () => bounds };
  const root = {
    clientWidth: 800,
    clientHeight: 600,
    innerHTML: '',
    focus() {},
    contains: () => true,
    setPointerCapture() {},
    releasePointerCapture() {},
    querySelector: sel => (sel === 'svg' || sel === '.room-plan' ? svg : null),
    querySelectorAll: () => [],
    addEventListener: (name, cb) => rootListeners.set(name, cb),
    removeEventListener: (name) => rootListeners.delete(name),
    remove() {}
  };
  const window = {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    addEventListener: (name, cb) => windowListeners.set(name, cb),
    removeEventListener: (name) => windowListeners.delete(name)
  };
  const document = {
    createElement: () => root,
    defaultView: window,
    documentElement: { lang: 'en' }
  };
  root.ownerDocument = document;
  const container = {
    ownerDocument: document,
    append() {},
    clientWidth: 800,
    clientHeight: 600
  };

  const editor = new RoomEditor(container, options);
  return { editor, root, svg, bounds };
}

test('get2DMeasurementMetrics accurately computes distance, delta, and angle in degrees', () => {
  // Horizontal along X
  const m1 = get2DMeasurementMetrics({ x: 0, z: 0 }, { x: 1000, z: 0 });
  assert.equal(m1.dx, 1000);
  assert.equal(m1.dz, 0);
  assert.equal(m1.distance, 1000);
  assert.equal(m1.angleDeg, 0);

  // Vertical along Z
  const m2 = get2DMeasurementMetrics({ x: 0, z: 0 }, { x: 0, z: 500 });
  assert.equal(m2.dx, 0);
  assert.equal(m2.dz, 500);
  assert.equal(m2.distance, 500);
  assert.equal(m2.angleDeg, 90);

  // 3-4-5 Triangle
  const m3 = get2DMeasurementMetrics({ x: 100, z: 200 }, { x: 400, z: 600 });
  assert.equal(m3.dx, 300);
  assert.equal(m3.dz, 400);
  assert.equal(m3.distance, 500);
  assert.equal(Math.round(m3.angleDeg), 53);

  // Zero distance
  const m0 = get2DMeasurementMetrics({ x: 250, z: 250 }, { x: 250, z: 250 });
  assert.equal(m0.distance, 0);
  assert.equal(m0.angleDeg, 0);
});

test('RoomEditor supports interactive 2D measurement tool workflow', () => {
  let measuredMetrics = null;
  const { editor, root, svg, bounds } = createEditorFixture({
    onMeasure: metrics => { measuredMetrics = metrics; }
  });

  const room = {
    width: 4000,
    depth: 3000,
    height: 2700,
    outline: [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 3000 }, { x: 0, z: 3000 }],
    windows: []
  };

  editor.setProject({ room, cabinets: [] });
  editor.fitView();

  // Initial state: default tool is select
  assert.equal(editor.tool, 'select');
  assert.equal(editor.measureStart, null);

  // Switch to measure tool
  editor.setTool('measure');
  assert.equal(editor.tool, 'measure');

  const pointEvent = (px, pz) => {
    const b = editor.viewBox;
    const s = Math.min(bounds.width / b.width, bounds.height / b.depth);
    const targetObj = {
      closest: sel => (sel === 'svg' ? svg : null)
    };
    return {
      clientX: bounds.left + (bounds.width - b.width * s) / 2 + (px - b.x) * s,
      clientY: bounds.top + (bounds.height - b.depth * s) / 2 + (pz - b.z) * s,
      button: 0,
      pointerId: 1,
      target: targetObj,
      preventDefault() {}
    };
  };

  // Simulate first point click at (1000, 1000)
  editor.pointerDown(pointEvent(1000, 1000));
  assert.ok(editor.measureStart !== null, 'measureStart should be set on first click');
  assert.equal(editor.measureStart.x, 1000);
  assert.equal(editor.measureStart.z, 1000);
  assert.equal(editor.measureEnd, null);

  // Simulate moving tape to (2500, 1000)
  editor.pointerMove(pointEvent(2500, 1000));
  assert.ok(editor.measureCurrent !== null);
  assert.equal(editor.measureCurrent.x, 2500);
  assert.equal(editor.measureDist, 1500);

  // Simulate second click to finalize tape at (2500, 1000)
  editor.pointerDown(pointEvent(2500, 1000));
  assert.ok(editor.measureEnd !== null, 'measureEnd should be set on second click');
  assert.equal(editor.measureEnd.x, 2500);
  assert.equal(editor.measureDist, 1500);

  // Verify callback triggered
  assert.ok(measuredMetrics !== null);
  assert.equal(measuredMetrics.distance, 1500);

  // Render produces SVG with tape overlay
  editor.render();
  assert.ok(root.innerHTML.includes('room-measurement-tape'), 'SVG overlay should include measurement tape group');
  assert.ok(root.innerHTML.includes('data-room-measure="true"'));
  assert.ok(root.innerHTML.includes('stroke-dasharray="6,4"'), 'Tape should have dashed line styling');
  assert.ok(root.innerHTML.includes('room-measure-endpoint'), 'Tape should render endpoint handles');
  assert.ok(root.innerHTML.includes('1 500') || root.innerHTML.includes('1500'), 'Tape should render distance');

  // Clear measurement
  editor.clearMeasurement();
  assert.equal(editor.measureStart, null);
  assert.equal(editor.measureEnd, null);
  assert.equal(editor.measureDist, 0);

  editor.render();
  assert.ok(!root.innerHTML.includes('room-measurement-tape'), 'Cleared measurement should not render overlay');
});

test('get3DMeasurementMetrics calculates 3D Euclidean distance and 2D horizontal distance', () => {
  // Pure horizontal 3D vectors
  const p1 = [0, 0, 0];
  const p2 = [600, 0, 800];
  const m1 = get3DMeasurementMetrics(p1, p2);
  assert.equal(m1.dx, 600);
  assert.equal(m1.dy, 0);
  assert.equal(m1.dz, 800);
  assert.equal(m1.distance, 1000);
  assert.equal(m1.distanceHorizontal, 1000);

  // Pure vertical (elevation) measurement
  const p3 = { x: 500, y: 100, z: 500 };
  const p4 = { x: 500, y: 850, z: 500 };
  const m2 = get3DMeasurementMetrics(p3, p4);
  assert.equal(m2.dx, 0);
  assert.equal(m2.dy, 750);
  assert.equal(m2.dz, 0);
  assert.equal(m2.distance, 750);
  assert.equal(m2.distanceHorizontal, 0);

  // Full 3D diagonal
  const p5 = [100, 200, 300];
  const p6 = [400, 600, 1500]; // dx=300, dy=400, dz=1200 -> horiz=1237, 3d=1300
  const m3 = get3DMeasurementMetrics(p5, p6);
  assert.equal(m3.dx, 300);
  assert.equal(m3.dy, 400);
  assert.equal(m3.dz, 1200);
  assert.equal(m3.distance, 1300);
  assert.equal(m3.distanceHorizontal, 1237);
});

test('RoomWebGLRenderer manages 3D measurement tape state', () => {
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    getContext: () => null
  };
  const renderer = new RoomWebGLRenderer(canvas);

  // Initial measure state
  assert.equal(renderer.measureState.active, false);
  assert.equal(renderer.measureState.start, null);
  assert.equal(renderer.measureState.distance, 0);

  // Activate tool
  renderer.setMeasureTool(true);
  assert.equal(renderer.measureState.active, true);

  // Update points
  const p1 = [1000, 0, 500];
  const p2 = [1000, 850, 500];
  const state = renderer.setMeasureState(p1, p2);
  assert.equal(state.active, true);
  assert.deepEqual(state.start, p1);
  assert.deepEqual(state.end, p2);
  assert.equal(state.distance, 850);
  assert.equal(state.distanceHorizontal, 0);

  // Clear measure
  renderer.clearMeasure();
  assert.equal(renderer.measureState.start, null);
  assert.equal(renderer.measureState.end, null);
  assert.equal(renderer.measureState.distance, 0);

  // Deactivate tool
  renderer.setMeasureTool(false);
  assert.equal(renderer.measureState.active, false);
});
