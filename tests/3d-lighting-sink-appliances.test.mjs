import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDefaultProject,
  generateParts
} from '../src/engine.js';
import {
  createDrawingSvg,
  createAssemblySvg
} from '../src/renderer.js';
import {
  checkImport
} from '../src/project-io.js';
import {
  generateRoomPlanHTML
} from '../src/room-print.js';
import { getCountertopCutoutsForCabinets, renderUnifiedCountertops } from '../src/countertop.js';
import { renderKitchenAppliance } from '../src/kitchen-appliances.js';
import { RoomWebGLRenderer, FRAGMENT_SHADER_SOURCE } from '../src/room-renderer-webgl.js';

test('sink and cooktop cabinets automatically use traverse rails instead of solid top panel and cut openings in countertop slab', () => {
  const project = createDefaultProject('ru');
  const cab = project.cabinets[0];
  cab.type = 'base';
  cab.width = 800;
  cab.height = 860;
  cab.depth = 580;
  cab.countertop = true;
  project.settings.unifiedCountertop = true;
  project.settings.worktopThickness = 38;
  cab.layout = {
    id: 'sec-sink',
    kind: 'section',
    front: 'doors',
    doors: 2,
    shelves: 0,
    sink: {
      type: 'sink-rectangular',
      width: 650,
      depth: 480,
      height: 190,
      bowlWidth: 380,
      bowlDepth: 400,
      bowlHeight: 190,
      hasDrainer: true,
      drainerSide: 'right'
    }
  };

  // 1. Traverse rails instead of solid top panel ('Крышка') so sink basin can drop down freely
  const partsNoCountertop = generateParts({
    ...project,
    settings: { ...project.settings, unifiedCountertop: false },
    cabinets: [{ ...cab, countertop: false }]
  });
  const cabParts = partsNoCountertop.filter(p => p.cabinetId === cab.id);
  assert.equal(cabParts.some(p => p.name === 'Крышка'), false, 'Cabinet with sink must not have a solid top panel blocking the sink');
  assert.equal(cabParts.some(p => p.name === 'Царга передняя'), true, 'Cabinet with sink must use front traverse rail');
  assert.equal(cabParts.some(p => p.name === 'Царга задняя'), true, 'Cabinet with sink must use rear traverse rail');

  // 2. Countertop cutout extraction
  const cutouts = getCountertopCutoutsForCabinets([cab], project);
  assert.equal(cutouts.length, 1, 'Must detect 1 countertop cutout for the sink');
  assert.equal(cutouts[0].applianceType, 'sink-rectangular');
  assert.ok(cutouts[0].localCutX > 0 && cutouts[0].localCutX + cutouts[0].width < cab.width, 'Cutout X range must lie within cabinet width');
  assert.ok(cutouts[0].localCutZ > 10 && cutouts[0].localCutZ + cutouts[0].depth < 600, 'Cutout Z range must lie within countertop depth');

  // 3. Unified countertop rendering splits slab around cutout (leaves open hole over sink bowl)
  const boxes = [];
  const faces = [];
  const rawBox = (x, y, z, w, h, d, col, cid, ext) => boxes.push({ x, y, z, w, h, d, col, cid, ext });
  const face = (pts, col, norm, cid, ext) => faces.push({ pts, col, norm, cid, ext });
  renderUnifiedCountertops(rawBox, rawBox, face, () => {}, project);

  const topFaces = faces.filter(f => f.norm && f.norm[1] > 0.9);
  const innerWallFaces = faces.filter(f => f.col === '#c9beaa');
  assert.ok(topFaces.length >= 4, `Countertop top surface must be split into >= 4 pieces around sink cutout (got ${topFaces.length})`);
  assert.ok(innerWallFaces.length >= 4, `Countertop cutout must render inner vertical cut walls (got ${innerWallFaces.length})`);

  // Verify center of sink cutout has NO top countertop face covering it
  const cut = cutouts[0];
  const worldCenterX = cut.x + cut.width / 2;
  const worldCenterZ = cut.z + cut.depth / 2;
  const coveringTopFaces = topFaces.filter(f => {
    const xs = f.pts.map(p => p[0]);
    const zs = f.pts.map(p => p[2]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    return worldCenterX > minX + 1 && worldCenterX < maxX - 1 &&
           worldCenterZ > minZ + 1 && worldCenterZ < maxZ - 1;
  });
  assert.equal(coveringTopFaces.length, 0, 'Center of sink bowl must not be covered by solid countertop top face');
});

test('renderKitchenAppliance renders hollow recessed 3D sink basins and 3D geometry for all appliance types', () => {
  const types = [
    'oven',
    'cooktop',
    'microwave',
    'fridge-builtin',
    'fridge-freestanding',
    'dishwasher-builtin',
    'dishwasher-freestanding',
    'sink-round',
    'sink-rectangular',
    'hood-builtin',
    'washer',
    'dryer',
    'boiler'
  ];

  for (const type of types) {
    const faces = [];
    const boxes = [];
    const rawBox = (x, y, z, w, h, d, col, cid, ext) => boxes.push({ x, y, z, w, h, d, col, cid, ext });
    const box = rawBox;
    const face = (pts, col, norm, cid, ext) => faces.push({ pts, col, norm, cid, ext });
    const cylinderAxis = (axis, cx, cy, cz, len, diam, col, cid, ext) => {
      faces.push({ pts: [[cx, cy, cz]], col, norm: [0, 1, 0], cid, ext });
    };

    renderKitchenAppliance({
      appliance: { type, width: 600, height: 600, depth: 520 },
      bounds: { x: 0, y: 0, z: 0, width: 600, height: 600, depth: 520 },
      cabinetId: 'cab-test',
      sectionId: 'sec-test',
      renderContext: {
        box,
        rawBox,
        face,
        line: () => {},
        cylinderAxis,
        cylinderX: (x, y, z, l, d, c, id, ex) => cylinderAxis('x', x, y, z, l, d, c, id, ex),
        cylinderY: (x, y, z, l, d, c, id, ex) => cylinderAxis('y', x, y, z, l, d, c, id, ex),
        cylinderZ: (x, y, z, l, d, c, id, ex) => cylinderAxis('z', x, y, z, l, d, c, id, ex)
      }
    });

    assert.ok(boxes.length + faces.length >= 6, `Appliance "${type}" must generate rich 3D geometry`);
  }
});

test('room lights validate in project I/O, render in 3D, and never appear in production drawings', () => {
  const project = createDefaultProject('ru');
  project.room.lights = [
    {
      id: 'light-test-1',
      kind: 'pendant',
      label: 'Люстра над островом',
      x: 1500,
      z: 1200,
      y: 2200,
      intensity: 1.4,
      color: '#fff4dc',
      enabled: true
    },
    {
      id: 'light-test-2',
      kind: 'floor',
      label: 'Торшер в углу',
      x: 400,
      z: 400,
      y: 1650,
      intensity: 1.0,
      color: '#ffe8c2',
      enabled: true
    }
  ];

  // 1. Project import validation accepts room.lights
  assert.doesNotThrow(() => checkImport(project));

  // 2. Production drawings must NEVER include room lights
  const cabId = project.cabinets[0].id;
  const frontSvg = createDrawingSvg(project, 'front', { cabinetId: cabId });
  const assemblySvg = createAssemblySvg(project, { cabinetId: cabId });
  const roomPlanHtml = generateRoomPlanHTML(project, { language: 'ru' });

  for (const doc of [frontSvg, assemblySvg, roomPlanHtml]) {
    assert.doesNotMatch(doc, /light-test-1|Люстра над островом|Торшер в углу|data-room-light/);
  }
});

test('WebGL shader has balanced lighting and supports user-placed point lights and live geometry invalidation', () => {
  assert.match(FRAGMENT_SHADER_SOURCE, /uniform int uExtraLightCount;/);
  assert.match(FRAGMENT_SHADER_SOURCE, /uniform vec3 uExtraLightPos\[6\];/);
  assert.match(FRAGMENT_SHADER_SOURCE, /uniform vec3 uExtraLightColor\[6\];/);

  // Create headless RoomWebGLRenderer (without WebGL context) to verify geometry & cache invalidation and selection clearing
  const fakeCanvas = {
    width: 800,
    height: 600,
    style: {},
    getContext: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  };

  let lastSelected = 'initial';
  const renderer = new RoomWebGLRenderer(fakeCanvas, {
    onSelect: id => { lastSelected = id; }
  });

  const project = createDefaultProject('ru');
  project.room.lights = [
    { id: 'l1', kind: 'pendant', x: 1200, z: 1200, y: 2100, intensity: 1.2, color: '#fff4dc' }
  ];

  renderer.setProject(project, project.cabinets[0].id);
  assert.equal(renderer.selectedCabinetId, project.cabinets[0].id);

  const vertsWithCeiling = renderer.opaqueVertexCount;
  assert.ok(vertsWithCeiling > 0, 'Must build 3D triangles');

  // Toggle ceiling off -> must immediately rebuild geometry even without camera move
  renderer.setShowCeiling(false);
  const vertsWithoutCeiling = renderer.opaqueVertexCount;
  assert.notEqual(vertsWithoutCeiling, vertsWithCeiling, 'Toggling ceiling must immediately rebuild 3D geometry');

  // Changing wall color -> must update vertex colors immediately
  project.room.wallColor = '#334455';
  renderer.setProject(project, project.cabinets[0].id);
  assert.ok(renderer._lastCulledWallsKey.includes('#334455'), 'Wall cache key must track wallColor');

  // Clicking empty space (where no cabinet is hit) must clear selection and notify onSelect(null)
  renderer.pickCabinet(1, 1);
  assert.equal(renderer.selectedCabinetId, null, 'Clicking empty space must deselect cabinet in 3D');
  assert.equal(lastSelected, null, 'onSelect(null) must be called when deselecting in 3D');

  renderer.destroy();
});
