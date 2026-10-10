import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { generateRoomOBJ, downloadRoomOBJ } from '../src/room-obj.js';
import { createRoomPlanSvg } from '../src/room-print.js';
import { RoomWebGLRenderer } from '../src/room-renderer-webgl.js';

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
  assert.equal(typeof RoomWebGLRenderer.prototype.toggleDoors, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.toggleWallMode, 'function');
  assert.equal(typeof RoomWebGLRenderer.prototype.captureScreenshot, 'function');
});
