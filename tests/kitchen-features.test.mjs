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
    'hood-builtin'
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

test('cooktop is rendered on countertop above section and oven respects ventilation clearance when combined', async () => {
  const { makeScene } = await import('../src/renderer.js');
  const project = {
    settings: { unifiedPlinth: false, wallFinishPanels: false, ledLighting: false },
    materials: [{ id: 'm1', name: 'Белый', type: 'ЛДСП', thickness: 18, sheetWidth: 2800, sheetHeight: 2070, color: '#ffffff' }],
    room: { width: 3000, depth: 3000, height: 2500, windows: [] },
    cabinets: [
      {
        id: 'kitchen-base-1',
        type: 'base',
        x: 0,
        y: 0,
        z: 0,
        width: 600,
        height: 850,
        depth: 600,
        plinth: 100,
        countertop: true,
        materialId: 'm1',
        layout: {
          id: 'sec-1',
          kind: 'section',
          front: 'open',
          shelves: 0,
          cooktop: { width: 590, depth: 520, height: 45, label: 'Варочная панель' },
          appliance: {
            type: 'oven',
            width: 595,
            height: 595,
            depth: 550,
            label: 'Духовой шкаф',
            useClearances: true,
            clearances: { side: 5, top: 30, rear: 30 }
          }
        }
      }
    ]
  };

  const scene = makeScene(project, project.cabinets[0], '3d', { plinth: true, exploded: false });
  // Verify cooktop is present in scene and rendered at top of carcass/countertop level (Y >= 850)
  const cooktopFaces = scene.faces.filter(f => f.applianceType === 'cooktop');
  assert.ok(cooktopFaces.length > 0, 'Cooktop must be rendered');
  // Check vertices of cooktop are at or above cabinet height (850mm)
  const cooktopMinY = Math.min(...cooktopFaces.flatMap(f => f.points.map(p => p[1])));
  assert.ok(cooktopMinY >= 850, `Cooktop must sit on top of carcass/countertop (got min Y ${cooktopMinY})`);

  // Verify oven is also rendered in the section
  const ovenFaces = scene.faces.filter(f => f.applianceType === 'oven');
  assert.ok(ovenFaces.length > 0, 'Oven must be rendered in the section');
  const ovenMaxY = Math.max(...ovenFaces.flatMap(f => f.points.map(p => p[1])));
  // Oven max Y must be under the carcass top (850mm) with ventilation clearance (<= 850 - 25 = 825mm)
  assert.ok(ovenMaxY <= 830, `Oven must have ventilation clearance below cooktop (got max Y ${ovenMaxY})`);
});

test('sink is mounted on countertop above section with bowl dipping into carcass', async () => {
  const { makeScene } = await import('../src/renderer.js');
  const project = {
    settings: { unifiedPlinth: false, wallFinishPanels: false, ledLighting: false },
    materials: [{ id: 'm1', name: 'Белый', type: 'ЛДСП', thickness: 18, sheetWidth: 2800, sheetHeight: 2070, color: '#ffffff' }],
    room: { width: 3000, depth: 3000, height: 2500, windows: [] },
    cabinets: [
      {
        id: 'kitchen-sink-base',
        type: 'base',
        x: 0,
        y: 0,
        z: 0,
        width: 800,
        height: 850,
        depth: 600,
        plinth: 100,
        countertop: true,
        materialId: 'm1',
        layout: {
          id: 'sec-sink',
          kind: 'section',
          front: 'doors',
          doors: 2,
          shelves: 0,
          sink: {
            shape: 'rectangular',
            width: 780,
            depth: 500,
            bowlWidth: 450,
            bowlDepth: 400,
            hasDrainer: true,
            drainerSide: 'right',
            label: 'Раковина со сушкой'
          }
        }
      }
    ]
  };

  const scene = makeScene(project, project.cabinets[0], '3d', { plinth: true, exploded: false });
  const sinkFaces = scene.faces.filter(f => f.applianceType === 'sink-rectangular');
  assert.ok(sinkFaces.length > 0, 'Sink faces must be rendered');

  const sinkMaxY = Math.max(...sinkFaces.flatMap(f => f.points.map(p => p[1])));
  const sinkMinY = Math.min(...sinkFaces.flatMap(f => f.points.map(p => p[1])));

  // Countertop top is at 850 + 38 = 888mm. Faucet/rim extends above 888mm.
  assert.ok(sinkMaxY > 888, `Faucet/rim must extend above countertop (got max Y ${sinkMaxY})`);
  // Bowl must dip into carcass under countertop (< 888mm, down to around 888 - 190 = 698mm)
  assert.ok(sinkMinY < 800, `Bowl must dip into cabinet carcass below countertop (got min Y ${sinkMinY})`);

  // Verify faucet base is at the rear (near the wall, small Z) rather than at the front edge
  const highFaces = sinkFaces.filter(f => f.points.some(p => p[1] > 895));
  assert.ok(highFaces.length > 0, 'Faucet faces must exist');
  const minFaucetZ = Math.min(...highFaces.flatMap(f => f.points.map(p => p[2])));
  assert.ok(minFaucetZ < 200, `Faucet must be mounted at rear near wall (got min Z ${minFaucetZ})`);
});

test('built-in hood is mounted into wall cabinet from the bottom', async () => {
  const { makeScene } = await import('../src/renderer.js');
  const project = {
    settings: { unifiedPlinth: false, wallFinishPanels: false, ledLighting: false },
    materials: [{ id: 'm1', name: 'Белый', type: 'ЛДСП', thickness: 18, sheetWidth: 2800, sheetHeight: 2070, color: '#ffffff' }],
    room: { width: 3000, depth: 3000, height: 2500, windows: [] },
    cabinets: [
      {
        id: 'kitchen-wall-hood',
        type: 'wall',
        x: 0,
        y: 1400,
        z: 0,
        width: 600,
        height: 720,
        depth: 350,
        plinth: 0,
        materialId: 'm1',
        layout: {
          id: 'sec-hood',
          kind: 'section',
          front: 'doors',
          doors: 2,
          shelves: 0,
          appliance: {
            type: 'hood-builtin',
            width: 600,
            height: 380,
            depth: 300,
            label: 'Вытяжка встраиваемая'
          }
        }
      }
    ]
  };

  const scene = makeScene(project, project.cabinets[0], '3d', { plinth: false, exploded: false });
  const hoodFaces = scene.faces.filter(f => f.applianceType === 'hood-builtin');
  assert.ok(hoodFaces.length > 0, 'Built-in hood faces must be rendered');

  const hoodMinY = Math.min(...hoodFaces.flatMap(f => f.points.map(p => p[1])));
  // Built-in hood bottom mounting frame sits at Y=1400 with front telescopic visor trim extending down ~20mm
  assert.ok(Math.abs(hoodMinY - (1400 - 20)) <= 5, `Hood must start at cabinet bottom Y=1400 (got ${hoodMinY})`);
});

test('checkImport validates cooktop, sink, and all kitchen appliance configurations', async () => {
  const { checkImport } = await import('../src/project-io.js');
  const { createDefaultProject } = await import('../src/engine.js');
  const validProject = createDefaultProject('ru');
  validProject.cabinets[0].layout = {
    id: 's1',
    kind: 'section',
    front: 'open',
    cooktop: { width: 590, depth: 520, height: 45, label: 'Cooktop' },
    sink: { shape: 'round', width: 510, depth: 510, bowlWidth: 420, bowlDepth: 420, label: 'Round sink' },
    appliance: { type: 'hood-builtin', width: 600, height: 350, depth: 300, label: 'Hood' }
  };

  // Must not throw for valid kitchen equipment schema
  assert.doesNotThrow(() => checkImport(validProject));
});


