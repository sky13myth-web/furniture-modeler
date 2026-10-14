import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { generateRoomOBJ, downloadRoomOBJ } from '../src/room-obj.js';
import { createRoomPlanSvg } from '../src/room-print.js';
import {
  RoomWebGLRenderer,
  FLOOR_STYLES,
  VERTEX_SHADER_SOURCE,
  FRAGMENT_SHADER_SOURCE,
  createShader,
  createProgram,
} from '../src/room-renderer-webgl.js';

test('generateRoomOBJ exports complete 3D scene with room and cabinet objects', () => {
  const project = createDefaultProject();
  project.cabinets[0].doors = 2;
  const { obj, mtl, filename, mtlFilename } = generateRoomOBJ(project, { doorsOpen: false });

  assert.ok(obj.length > 500, 'OBJ output should contain geometry');
  assert.ok(mtl.length > 100, 'MTL output should contain materials');
  assert.ok(mtlFilename.endsWith('.mtl'), 'MTL filename should have .mtl extension');
  assert.ok(filename.endsWith('.obj'), 'OBJ filename should have .obj extension');

  // Check OBJ structure
  assert.ok(obj.includes(`mtllib ${mtlFilename}`), 'Should reference MTL file');
  assert.ok(obj.includes('o Room_Floor'), 'Should contain room floor object');
  assert.ok(obj.includes('o Room_Walls'), 'Should contain room walls object');
  assert.ok(obj.includes('o Cabinet_'), 'Should contain cabinet objects');
  assert.ok(obj.includes('usemtl '), 'Should reference materials');
  assert.match(obj, /v\s+[-0-9.]+\s+[-0-9.]+\s+[-0-9.]+/u, 'Should contain vertex positions');
  assert.match(obj, /vn\s+[-0-9.]+\s+[-0-9.]+\s+[-0-9.]+/u, 'Should contain vertex normals');
  assert.match(obj, /f\s+\d+\/\/\d+\s+\d+\/\/\d+\s+\d+\/\/\d+/u, 'Should contain polygon faces');

  // Check MTL structure
  assert.ok(mtl.includes('newmtl '), 'MTL should define materials');
  assert.match(mtl, /Kd\s+[-0-9.]+\s+[-0-9.]+\s+[-0-9.]+/u, 'MTL should define diffuse color');
});

test('generateRoomOBJ supports doorsOpen toggle', () => {
  const project = createDefaultProject();
  project.cabinets[0].doors = 2;

  const closed = generateRoomOBJ(project, { doorsOpen: false });
  const open = generateRoomOBJ(project, { doorsOpen: true });

  assert.notEqual(closed.obj, open.obj, 'OBJ geometry should differ when doors are open');
});

test('createRoomPlanSvg renders cabinet front side indicator line', () => {
  const project = createDefaultProject();
  const svg = createRoomPlanSvg(project, { language: 'ru' });

  assert.ok(svg.includes('class="cabinet-front"'), 'SVG should contain cabinet front indicator line');
});

test('RoomWebGLRenderer exports expected class interface', () => {
  assert.equal(typeof RoomWebGLRenderer, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.setProject, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.render, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.resize, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.resetCamera, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.setCameraPreset, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.setLightingMode, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.setFloorStyle, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.setSelectedCabinet, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.focusOnCabinet, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.pickCabinet, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.toggleDoors, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.toggleWallMode, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.captureScreenshot, 'function');
});

function createMockGL() {
  return {
    createShader: type => ({ type, source: '', compiled: false }),
    shaderSource: (s, src) => { s.source = src; },
    compileShader: s => { s.compiled = true; },
    getShaderParameter: (s, p) => true,
    getShaderInfoLog: s => '',
    createProgram: () => ({ shaders: [], linked: false }),
    attachShader: (p, s) => { p.shaders.push(s); },
    linkProgram: p => { p.linked = true; },
    getProgramParameter: (p, param) => true,
    getProgramInfoLog: p => '',
    deleteShader: () => {},
    deleteProgram: () => {},
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
  };
}

test('shaders compile and link successfully in WebGL program', () => {
  const gl = createMockGL();
  const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
  assert.ok(program.linked, 'WebGL program should link shaders');
  assert.equal(program.shaders.length, 2, 'Program should attach VS and FS');

  // Verify procedural shader features in FRAGMENT_SHADER_SOURCE
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('uLightingMode'), 'FS should include uLightingMode uniform');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('uFloorStyle'), 'FS should include uFloorStyle uniform');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('isMetal'), 'FS should include PBR metal detection');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('isCeramic'), 'FS should include PBR ceramic glass detection');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('vPosition.y < 2.0'), 'FS should include floor face detection');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('plankLength'), 'FS should include plankLength for floor tiles/planks');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('plankWidth'), 'FS should include plankWidth for floor tiles/planks');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('isWood'), 'FS should include wood grain detection');
  assert.ok(FRAGMENT_SHADER_SOURCE.includes('grainWave'), 'FS should include procedural wood grain texture');

  // Verify compile error reporting
  const failingGl = {
    ...gl,
    getShaderParameter: () => false,
    getShaderInfoLog: () => 'Syntax error at line 42',
  };
  assert.throws(
    () => createShader(failingGl, failingGl.VERTEX_SHADER, 'invalid glsl'),
    /Shader compile error: Syntax error at line 42/
  );
});

test('RoomWebGLRenderer setCameraPreset supports all presets', () => {
  const project = createDefaultProject();
  const renderer = new RoomWebGLRenderer(null);
  renderer.setProject(project);

  const bounds = renderer.roomBounds;
  const maxDim = Math.max(bounds.width, bounds.depth);

  // 1. 'top' preset
  renderer.setCameraPreset('top');
  assert.equal(renderer.cameraPreset, 'top');
  assert.equal(renderer.yaw, 0);
  assert.ok(Math.abs(renderer.pitch - Math.PI * 0.47) < 1e-4);
  assert.ok(Math.abs(renderer.distance - maxDim * 1.05) < 1e-3);

  // 2. 'corner-1' preset
  renderer.setCameraPreset('corner-1');
  assert.equal(renderer.cameraPreset, 'corner-1');
  assert.ok(Math.abs(renderer.yaw - Math.PI * 0.28) < 1e-4);
  assert.equal(renderer.pitch, 0.28);
  assert.ok(Math.abs(renderer.distance - maxDim * 0.95) < 1e-3);

  // 3. 'corner-2' preset
  renderer.setCameraPreset('corner-2');
  assert.equal(renderer.cameraPreset, 'corner-2');
  assert.ok(Math.abs(renderer.yaw - (-Math.PI * 0.28)) < 1e-4);
  assert.equal(renderer.pitch, 0.28);
  assert.ok(Math.abs(renderer.distance - maxDim * 0.95) < 1e-3);

  // 4. 'front' preset
  renderer.setCameraPreset('front');
  assert.equal(renderer.cameraPreset, 'front');
  assert.equal(renderer.yaw, 0);
  assert.equal(renderer.pitch, 0.18);
  assert.ok(Math.abs(renderer.distance - maxDim * 1.0) < 1e-3);

  // 5. 'door' preset without door in room (camera at front wall looking into center)
  project.room.windows = [];
  renderer.setProject(project);
  renderer.setCameraPreset('door');
  assert.equal(renderer.cameraPreset, 'door');
  const eyeWithoutDoor = renderer.getCameraEye();
  assert.ok(Math.abs(eyeWithoutDoor[1] - 1500) < 2, 'Eye height should be near 1500mm');

  // 6. 'door' preset with door in room (camera near doorway looking into center)
  project.room.windows = [{ id: 'door-entry', kind: 'door', wallIndex: 0, offset: 1200, width: 900, height: 2100, sill: 0 }];
  renderer.setProject(project);
  renderer.setCameraPreset('door');
  assert.equal(renderer.cameraPreset, 'door');
  const eyeWithDoor = renderer.getCameraEye();
  assert.ok(Math.abs(eyeWithDoor[1] - 1500) < 2, 'Eye height should be near 1500mm');
});

test('RoomWebGLRenderer setLightingMode toggles between day and evening', () => {
  const renderer = new RoomWebGLRenderer(null);
  assert.equal(renderer.lightingMode, 'evening');
  assert.deepEqual(renderer.lightColor, [0.82, 0.80, 0.75]);

  // Set 'day' mode
  const modeDay = renderer.setLightingMode('day');
  assert.equal(modeDay, 'day');
  assert.equal(renderer.lightingMode, 'day');
  assert.deepEqual(renderer.lightColor, [0.35, 0.35, 0.35]);

  // Set 'evening' mode
  const modeEvening = renderer.setLightingMode('evening');
  assert.equal(modeEvening, 'evening');
  assert.equal(renderer.lightingMode, 'evening');
  assert.deepEqual(renderer.lightColor, [0.82, 0.80, 0.75]);

  // Toggle without arguments
  renderer.setLightingMode();
  assert.equal(renderer.lightingMode, 'day');
  renderer.setLightingMode();
  assert.equal(renderer.lightingMode, 'evening');
});

test('RoomWebGLRenderer pickCabinet raycasts perspective view, updates selectedCabinetId and triggers onSelect', () => {
  const project = createDefaultProject();
  let selectedId = null;
  const mockCanvas = {
    width: 800,
    height: 600,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    addEventListener: () => {},
  };
  const renderer = new RoomWebGLRenderer(mockCanvas, {
    onSelect: id => { selectedId = id; }
  });
  renderer.setProject(project);

  // Position camera in front of the cabinet looking directly at it
  const cab = project.cabinets[0];
  renderer.target = [cab.x + cab.width / 2, cab.y + cab.height / 2, cab.z + cab.depth / 2];
  renderer.yaw = 0;
  renderer.pitch = 0;
  renderer.distance = 1500;

  // Center screen click (400, 300) hits the cabinet
  const hitId = renderer.pickCabinet(400, 300);
  assert.equal(hitId, cab.id);
  assert.equal(selectedId, cab.id);
  assert.equal(renderer.selectedCabinetId, cab.id);

  // Click far off in the top corner (10, 10) misses
  selectedId = null;
  const missId = renderer.pickCabinet(10, 10);
  assert.equal(missId, null);
  assert.equal(selectedId, null);
});

test('RoomWebGLRenderer supports floor styles, selectedCabinetId, and focusOnCabinet', () => {
  const project = createDefaultProject();
  const cab = project.cabinets[0];
  const renderer = new RoomWebGLRenderer(null);
  renderer.setProject(project, cab.id);

  assert.equal(renderer.selectedCabinetId, cab.id);
  assert.equal(renderer.floorStyle, 'oak');

  for (const styleKey of Object.keys(FLOOR_STYLES)) {
    const res = renderer.setFloorStyle(styleKey);
    assert.equal(res, styleKey);
    assert.equal(renderer.floorStyle, styleKey);
  }
  // Invalid style is ignored
  renderer.setFloorStyle('nonexistent');
  assert.equal(renderer.floorStyle, 'concrete');

  // Focus on cabinet centers target on cabinet and sets a close viewing distance
  const focused = renderer.focusOnCabinet(cab.id);
  assert.equal(focused, true);
  assert.ok(Math.abs(renderer.target[0] - (cab.x + cab.width / 2)) < 1);
  assert.ok(Math.abs(renderer.target[1] - (cab.y + cab.height * 0.5)) < 1);
  assert.ok(Math.abs(renderer.target[2] - (cab.z + cab.depth / 2)) < 1);
  assert.ok(renderer.distance >= 950 && renderer.distance <= 5000);
});
