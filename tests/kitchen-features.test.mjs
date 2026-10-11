import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isWallCabinet,
  getPlinthRuns,
  renderUnifiedPlinths,
  getWallCabinetRuns,
  renderUnifiedWallBottomPanels,
  renderUnifiedLEDLighting
} from '../src/kitchen-features.js';
import {
  renderKitchenAppliance,
  getApplianceDefaultDimensions,
  getApplianceGapDefaults,
  APPLIANCE_PRESETS
} from '../src/kitchen-appliances.js';

test('isWallCabinet identifies wall and upper cabinets by height and position', () => {
  assert.equal(isWallCabinet({ placement: 'wall', y: 1400, height: 720 }), true);
  assert.equal(isWallCabinet({ role: 'upper', y: 1400, height: 720 }), true);
  assert.equal(isWallCabinet({ name: 'Навесной шкаф', y: 1400, height: 720 }), true);
  assert.equal(isWallCabinet({ y: 1500, height: 720 }), true);
  assert.equal(isWallCabinet({ y: 0, height: 850, role: 'base' }), false);
});

test('getPlinthRuns groups adjacent collinear base cabinets and generates continuous plinths', () => {
  const project = {
    settings: { unifiedPlinth: true },
    cabinets: [
      { id: 'base-1', type: 'base', x: 0, y: 0, z: 0, width: 600, height: 850, depth: 600, plinth: 100, sidesToFloor: false },
      { id: 'base-2', type: 'base', x: 600, y: 0, z: 0, width: 600, height: 850, depth: 600, plinth: 100, sidesToFloor: false },
      { id: 'base-3', type: 'base', x: 1200, y: 0, z: 0, width: 800, height: 850, depth: 600, plinth: 100, sidesToFloor: false },
      { id: 'wall-1', type: 'wall', x: 0, y: 1400, z: 0, width: 600, height: 720, depth: 320, plinth: 0 }
    ]
  };

  const runs = getPlinthRuns(project);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].cabinets.length, 3);
  assert.equal(runs[0].wings[0].minU, 0);
  assert.equal(runs[0].wings[0].maxU, 2000);
  assert.equal(runs[0].plinthHeight, 100);

  const faces = [];
  const lines = [];
  const face = (pts, col, norm, cabId, extras) => faces.push({ pts, col, norm, cabId, extras });
  const line = (a, b, col) => lines.push({ a, b, col });
  const box = () => {};
  const rawBox = () => {};

  renderUnifiedPlinths(box, rawBox, face, line, project);
  assert.ok(faces.some(f => f.extras?.component === 'unified-plinth'));
});

test('getWallCabinetRuns groups adjacent wall cabinets and generates bottom panels and LED strips', () => {
  const project = {
    settings: { wallFinishPanels: true, ledLighting: true },
    cabinets: [
      { id: 'wall-1', type: 'wall', x: 0, y: 1400, z: 0, width: 600, height: 720, depth: 350 },
      { id: 'wall-2', type: 'wall', x: 600, y: 1400, z: 0, width: 800, height: 720, depth: 350 }
    ]
  };

  const runs = getWallCabinetRuns(project);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].cabinets.length, 2);
  assert.equal(runs[0].wings[0].minU, 0);
  assert.equal(runs[0].wings[0].maxU, 1400);

  const panelFaces = [];
  const panelLines = [];
  const face = (pts, col, norm, cabId, extras) => panelFaces.push({ pts, col, norm, cabId, extras });
  const line = (a, b, col) => panelLines.push({ a, b, col });
  const box = () => {};
  const rawBox = () => {};

  renderUnifiedWallBottomPanels(box, rawBox, face, line, project);
  assert.ok(panelFaces.some(f => f.extras?.component === 'wall-bottom-panel'));

  const ledLines = [];
  const ledLine = (a, b, col, width, cabId, extras) => ledLines.push({ a, b, col, extras });
  renderUnifiedLEDLighting(box, rawBox, face, ledLine, project);
  assert.ok(panelFaces.some(f => f.extras?.component === 'led-lighting'));
  assert.ok(ledLines.some(l => l.extras?.component === 'led-glow'));
});

test('renderKitchenAppliance renders all major kitchen appliances', () => {
  const applianceTypes = [
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
    'hood-wall'
  ];

  for (const type of applianceTypes) {
    const faces = [];
    const lines = [];
    const boxes = [];
    const cylinders = [];

    const renderContext = {
      face: (pts, col, lab, id, comp) => faces.push({ pts, col, lab, id, comp }),
      line: (a, b, col) => lines.push({ a, b, col }),
      box: (minX, minY, minZ, maxX, maxY, maxZ, col, lab, id, comp) => {
        boxes.push({ box: [minX, minY, minZ, maxX, maxY, maxZ], col, lab, id, comp });
      },
      rawBox: (minX, minY, minZ, maxX, maxY, maxZ, col, lab, id, comp) => {
        boxes.push({ rawBox: [minX, minY, minZ, maxX, maxY, maxZ], col, lab, id, comp });
      },
      cylinderX: (cx, cy, cz, r, h, sides, col, lab, id, comp) => {
        cylinders.push({ cylinder: [cx, cy, cz, r, h], col, lab, id, comp });
      },
      cylinderY: (cx, cy, cz, r, h, sides, col, lab, id, comp) => {
        cylinders.push({ cylinder: [cx, cy, cz, r, h], col, lab, id, comp });
      },
      cylinderZ: (cx, cy, cz, r, h, sides, col, lab, id, comp) => {
        cylinders.push({ cylinder: [cx, cy, cz, r, h], col, lab, id, comp });
      }
    };

    const defDims = getApplianceDefaultDimensions(type);
    const app = {
      type,
      label: type,
      width: defDims.width,
      height: defDims.height,
      depth: defDims.depth,
      ...(type === 'sink-rectangular' ? {
        sinkShape: 'rectangular',
        bowlWidth: 400,
        bowlDepth: 400,
        hasDrainer: true,
        drainerSide: 'right'
      } : {})
    };

    renderKitchenAppliance({
      appliance: app,
      bounds: { x: 0, y: 100, z: 0, width: 600, height: 850, depth: 600 },
      cabinetId: 'cab-1',
      sectionId: 'sec-1',
      renderContext
    });

    const totalElements = faces.length + boxes.length + cylinders.length;
    assert.ok(totalElements > 0, `Appliance ${type} should generate 3D elements (got ${totalElements})`);
  }
});

test('getApplianceDefaultDimensions and getApplianceGapDefaults return valid data for all presets', () => {
  for (const [type, preset] of Object.entries(APPLIANCE_PRESETS)) {
    const dims = getApplianceDefaultDimensions(type);
    assert.ok(dims.width > 0 && dims.height > 0 && dims.depth > 0, `Invalid dims for ${type}`);

    const gaps = getApplianceGapDefaults(type);
    assert.ok(gaps.side >= 0 && gaps.top >= 0 && gaps.rear >= 0, `Invalid gaps for ${type}`);
    assert.ok(preset.name && preset.nameTr && preset.nameEn, `Preset ${type} missing localizations`);
  }
});
