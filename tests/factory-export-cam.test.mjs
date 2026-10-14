import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartDxf, buildFactoryFiles, CAM_LAYER_COLORS, getHoleCamLayer } from '../src/factory-export.js';
import { createDefaultProject, createCabinet } from '../src/engine.js';

function parseDxfPairs(dxfString) {
  const lines = dxfString.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const group = Number.parseInt(lines[i].trim(), 10);
    const value = lines[i + 1];
    if (!Number.isNaN(group)) {
      pairs.push([group, value]);
    }
  }
  return pairs;
}

function getDxfEntities(pairs) {
  const entities = [];
  let inEntities = false;
  let currentEntity = null;

  for (let i = 0; i < pairs.length; i++) {
    const [group, value] = pairs[i];
    if (group === 0 && value === 'SECTION' && pairs[i + 1]?.[1] === 'ENTITIES') {
      inEntities = true;
      i++;
      continue;
    }
    if (inEntities && group === 0 && value === 'ENDSEC') {
      if (currentEntity) entities.push(currentEntity);
      inEntities = false;
      break;
    }
    if (inEntities) {
      if (group === 0) {
        if (currentEntity) entities.push(currentEntity);
        currentEntity = { type: value, pairs: [] };
      } else if (currentEntity) {
        currentEntity.pairs.push([group, value]);
      }
    }
  }
  return entities;
}

function getDxfLayers(pairs) {
  const layers = [];
  let inTables = false;
  let inLayerTable = false;
  let currentLayer = null;

  for (let i = 0; i < pairs.length; i++) {
    const [group, value] = pairs[i];
    if (group === 0 && value === 'TABLE' && pairs[i + 1]?.[1] === 'LAYER') {
      inLayerTable = true;
      i++;
      continue;
    }
    if (inLayerTable && group === 0 && value === 'ENDTAB') {
      if (currentLayer) layers.push(currentLayer);
      inLayerTable = false;
      continue;
    }
    if (inLayerTable) {
      if (group === 0 && value === 'LAYER') {
        if (currentLayer) layers.push(currentLayer);
        currentLayer = {};
      } else if (currentLayer) {
        if (group === 2) currentLayer.name = value;
        if (group === 62) currentLayer.color = Number(value);
      }
    }
  }
  return layers;
}

test('createPartDxf without holes retains standard no-drilling output with 0 circles', () => {
  const part = { width: 400, height: 720, thickness: 18 };
  const dxf = createPartDxf(part, { code: 'P0001' });

  assert.ok(dxf.includes('CUT_BLANK MM; NO TOOL COMPENSATION; NO DRILLING'));
  assert.doesNotMatch(dxf, /\r\n(?:LINE|TEXT|DIMENSION|CIRCLE|ARC)\r\n/);

  const pairs = parseDxfPairs(dxf);
  const entities = getDxfEntities(pairs);
  assert.equal(entities.length, 1);
  assert.equal(entities[0].type, 'LWPOLYLINE');

  const layers = getDxfLayers(pairs);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].name, 'CUT');
  assert.equal(layers[0].color, 7);
});

test('createPartDxf with holes generates CAM drilling layers with correct ACI colors', () => {
  const part = { width: 560, height: 720, thickness: 18 };
  const holes = [
    { a: 37, b: 100, diameter: 5, depth: 11, face: 'face-t-min', kind: 'shelf-pin' },
    { a: 50, b: 200, diameter: 8, depth: 12, face: 'face-t-max', kind: 'clearance' },
    { a: 22, b: 300, diameter: 35, depth: 12.5, face: 'face-t-min', kind: 'hinge-cup' },
    { a: 0, b: 64, diameter: 8, depth: 30, face: 'edge-a-min', kind: 'pilot' }
  ];

  const dxf = createPartDxf(part, { code: 'P0002', holes });
  assert.ok(dxf.includes('CAM DRILLING LAYERS INCLUDED; HOLE_COUNT=4'));

  const pairs = parseDxfPairs(dxf);
  const layers = getDxfLayers(pairs);

  assert.ok(layers.some(l => l.name === 'CUT' && l.color === 7));
  assert.ok(layers.some(l => l.name === 'DRILL_FACE_D5' && l.color === 1));
  assert.ok(layers.some(l => l.name === 'DRILL_FACE_D8' && l.color === 4));
  assert.ok(layers.some(l => l.name === 'DRILL_FACE_D35' && l.color === 6));
  assert.ok(layers.some(l => l.name === 'DRILL_EDGE_D8' && l.color === 2));

  const entities = getDxfEntities(pairs);
  assert.equal(entities.length, 5); // 1 LWPOLYLINE + 4 CIRCLE
  assert.equal(entities[0].type, 'LWPOLYLINE');

  const circles = entities.filter(e => e.type === 'CIRCLE');
  assert.equal(circles.length, 4);

  // Check 5mm face hole at (37, 100) -> DXF X=37, Y=720-100=620
  const c5 = circles.find(c => c.pairs.some(([g, v]) => g === 8 && v === 'DRILL_FACE_D5'));
  assert.ok(c5);
  const getVal = (pairs, group) => pairs.find(([g]) => g === group)?.[1];
  assert.equal(Number(getVal(c5.pairs, 10)), 37);
  assert.equal(Number(getVal(c5.pairs, 20)), 620);
  assert.equal(Number(getVal(c5.pairs, 40)), 2.5); // radius
  assert.equal(Number(getVal(c5.pairs, 39)), 11);  // depth

  // Check 35mm hinge cup hole at (22, 300) -> DXF X=22, Y=720-300=420
  const c35 = circles.find(c => c.pairs.some(([g, v]) => g === 8 && v === 'DRILL_FACE_D35'));
  assert.ok(c35);
  assert.equal(Number(getVal(c35.pairs, 10)), 22);
  assert.equal(Number(getVal(c35.pairs, 20)), 420);
  assert.equal(Number(getVal(c35.pairs, 40)), 17.5);
  assert.equal(Number(getVal(c35.pairs, 39)), 12.5);

  // Check 8mm edge hole at (0, 64) -> DXF X=0, Y=720-64=656
  const c8edge = circles.find(c => c.pairs.some(([g, v]) => g === 8 && v === 'DRILL_EDGE_D8'));
  assert.ok(c8edge);
  assert.equal(Number(getVal(c8edge.pairs, 10)), 0);
  assert.equal(Number(getVal(c8edge.pairs, 20)), 656);
  assert.equal(Number(getVal(c8edge.pairs, 40)), 4);
  assert.equal(Number(getVal(c8edge.pairs, 39)), 30);
});

test('edge holes at boundary extremes map correctly to DXF edges', () => {
  const part = { width: 500, height: 800, thickness: 18 };
  const holes = [
    { a: 250, b: 0, diameter: 8, depth: 30, face: 'edge-b-min', kind: 'pilot' },
    { a: 250, b: 800, diameter: 8, depth: 30, face: 'edge-b-max', kind: 'pilot' }
  ];

  const dxf = createPartDxf(part, { code: 'P0003', holes });
  const pairs = parseDxfPairs(dxf);
  const entities = getDxfEntities(pairs);
  const circles = entities.filter(e => e.type === 'CIRCLE');
  assert.equal(circles.length, 2);

  const getVal = (pairs, group) => pairs.find(([g]) => g === group)?.[1];
  // b = 0 -> Y = 800 - 0 = 800 (top edge in DXF)
  const topHole = circles.find(c => Number(getVal(c.pairs, 20)) === 800);
  assert.ok(topHole);
  assert.equal(Number(getVal(topHole.pairs, 10)), 250);

  // b = 800 -> Y = 800 - 800 = 0 (bottom edge in DXF)
  const bottomHole = circles.find(c => Number(getVal(c.pairs, 20)) === 0);
  assert.ok(bottomHole);
  assert.equal(Number(getVal(bottomHole.pairs, 10)), 250);
});

test('buildFactoryFiles includes CAM drilling circles in part DXFs when drilling is enabled', () => {
  const project = createDefaultProject('ru');
  const cab = createCabinet('base', project, { shelves: 1, doors: 1 });
  project.cabinets = [cab];
  project.settings.drilling = { enabled: true, system32: true };

  const files = buildFactoryFiles(project);
  const dxfFiles = files.filter(f => f.path.startsWith('dxf/P') && f.path.endsWith('.dxf'));
  assert.ok(dxfFiles.length > 0);

  // At least some panels (e.g. side panels) have holes and CIRCLE entities
  const dxfWithHoles = dxfFiles.filter(f => f.content.includes('CIRCLE'));
  assert.ok(dxfWithHoles.length > 0);
  assert.ok(dxfWithHoles.some(f => f.content.includes('DRILL_FACE_D5')));
});

test('all Group 5 handles in generated DXFs with holes are globally unique (0 duplicate handles)', () => {
  const part = { width: 560, height: 720, thickness: 18 };
  const holes = [
    { a: 37, b: 100, diameter: 5, depth: 11, face: 'face-t-min', kind: 'shelf-pin' },
    { a: 50, b: 200, diameter: 8, depth: 12, face: 'face-t-max', kind: 'clearance' },
    { a: 22, b: 300, diameter: 35, depth: 12.5, face: 'face-t-min', kind: 'hinge-cup' },
    { a: 0, b: 64, diameter: 8, depth: 30, face: 'edge-a-min', kind: 'pilot' }
  ];

  const dxf = createPartDxf(part, { code: 'P0002', holes });
  const lines = dxf.split(/\r?\n/);
  const handles = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    if (lines[i].trim() === '5') {
      handles.push(lines[i + 1].trim());
    }
  }

  assert.ok(handles.length >= 6, `Expected at least 6 handles, got ${handles.length}`);
  const duplicates = handles.filter((h, i) => handles.indexOf(h) !== i);
  assert.deepEqual(duplicates, [], `Found duplicate DXF handles: ${duplicates.join(', ')}`);
});

