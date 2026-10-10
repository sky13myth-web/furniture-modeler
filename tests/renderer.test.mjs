import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, getFrontLayout, getCabinetLayout, getSectionMountingAxes, getInternalDrawerLayout, getPartEdgeBanding, getEdgeBandingSummary, generateParts, validateProject } from '../src/engine.js';
import { FurnitureViewport, createDrawingSvg, generateDrawingHTML, generateCabinet3DHTML, rasterizeFaces, createPartSvg, layoutApplianceCallouts } from '../src/renderer.js';
import { createLaundryExample } from '../src/examples.js';
import { printLanguage, printNumber, translatePrintText, translatePartName, translateBuiltInName, translateMaterialName } from '../src/print-i18n.js';
import { defaultName, localizeMaterialPreset } from '../src/i18n.js';
import { MATERIAL_PRESETS } from '../src/standards.js';

function drawingPages(project,view,options){
  const first=createDrawingSvg(project,view,options),count=Number(first.match(/data-annotation-page-count="(\d+)"/)?.[1]||1);
  return Array.from({length:count},(_,index)=>index?createDrawingSvg(project,view,{...options,annotationPage:index+1}):first).join('');
}

function legacyProject() {
  const project = createDefaultProject();
  project.settings.deductEdge = false;
  project.room = { width: 4200, depth: 3400, height: 2700, wallThickness: 150, windows: [] };
  const baseStock = { sheetWidth:2100,sheetHeight:2800,grain:false,edgeBand:1 };
  project.materials = project.materials.filter(material=>!['mdf-drawer','hdf-bottom'].includes(material.id));
  Object.assign(project.materials.find(material=>material.id==='hdf-back'),{name:'Legacy HDF 3 мм',type:'HDF',thickness:3});
  project.materials.push({...baseStock,id:'mdf-drawer',name:'Legacy MDF 16 мм',type:'MDF',color:'#e8dfcd',thickness:16},{...baseStock,id:'hdf-bottom',name:'Legacy HDF 6 мм',type:'HDF',color:'#d6c4a4',thickness:6});
  const common = { materialId: 'mdf-white', backMaterialId: 'hdf-back', frontMaterialId: 'mdf-sage', drawerMaterialId: 'mdf-drawer', drawerBottomMaterialId: 'hdf-bottom', y: 0, z: 0, plinth: 100, backThickness: 3, drawerBottomThickness: 6, drawerSlideGap: 13, gap: 2, doors: 2, drawers: 0, shelves: 1 };
  project.cabinets = [
    { ...common, id: 'cabinet-1', name: 'Тумба', type: 'base', x: 300, width: 900, height: 860, depth: 580 },
    { ...common, id: 'cabinet-2', name: 'Тумба с ящиками', type: 'base', x: 1200, width: 800, height: 860, depth: 580, frontMaterialId: 'mdf-oak', doors: 0, drawers: 3, shelves: 0 },
  ];
  return project;
}

function mockCanvas() {
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  return { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 900, height: 700, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
}

function withSoftwareViewport(project, callback) {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} }; }
  };
  const viewport = new FurnitureViewport(mockCanvas());
  try { viewport.setProject(project, project.cabinets[0]?.id); callback(viewport); }
  finally { viewport.destroy(); if (previous === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = previous; }
}

test('per-pixel depth resolves intersecting panel projections independently of face order', () => {
  const door = { id: 'door', color: '#008877', screen: [[0, 0, 100], [100, 0, 100], [100, 100, 100], [0, 100, 100]] };
  // Its average depth is the same as the door. One side lies behind it;
  // the other is closer. No single face order can render both halves.
  const side = { id: 'side', color: '#eeeeee', screen: [[0, 0, 0], [100, 0, 200], [100, 100, 200], [0, 100, 0]] };
  for (const order of [[door, side], [side, door]]) {
    const frame = rasterizeFaces(order, 100, 100);
    const left = 50 * 100 + 25, right = 50 * 100 + 75;
    assert.equal(frame.ownerIds[frame.owners[left]], 'door');
    assert.equal(frame.ownerIds[frame.owners[right]], 'side');
    assert.deepEqual([...frame.pixels.slice(left * 4, left * 4 + 4)], [0, 136, 119, 255]);
    assert.deepEqual([...frame.pixels.slice(right * 4, right * 4 + 4)], [238, 238, 238, 255]);
  }
});

test('closed facade masks shelf pixels and picking; raster triangles clip at viewport bounds', () => {
  const frame = rasterizeFaces([
    { id: 'shelf', color: '#ffffff', screen: [[-20, 4, 45], [200, 4, 45], [200, 30, 45], [-20, 30, 45]] },
    { id: 'closed-door', color: '#bb9268', screen: [[4, 2, 60], [35, 2, 60], [35, 40, 60], [4, 40, 60]] },
  ], 40, 40);
  const covered = 10 * 40 + 20, outside = 10 * 40 + 1;
  assert.equal(frame.ownerIds[frame.owners[covered]], 'closed-door');
  assert.equal(frame.ownerIds[frame.owners[outside]], 'shelf');
  assert.equal(frame.depth[covered], 60);
  assert.equal(frame.pixels.length, 40 * 40 * 4);
});

test('standalone engineering drawings preserve selected cabinet dimensions in each orthographic axis', () => {
  const project = legacyProject();
  const cabinet = project.cabinets[1];
  cabinet.width = 837;
  cabinet.height = 913;
  cabinet.depth = 527;
  for (const [view, visible] of [['front', [837, 913]], ['back', [837, 913]], ['left', [527, 913]], ['right', [527, 913]], ['top', [837, 527]]]) {
    const svg = createDrawingSvg(project, view, { cabinetId: cabinet.id });
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
    assert.match(svg, /width="297mm" height="210mm"/);
    visible.forEach(dimension => assert.ok(svg.includes(`>${dimension}</text>`), `${view} should dimension ${dimension} mm`));
    assert.doesNotMatch(svg, /Помещение:/);
  }
});

test('drawing exports safely escape imported text and produce five independent projection sheets', () => {
  const project = createDefaultProject();
  project.name = '<script>alert("test")</script> & кухня';
  project.cabinets[0].name = '<img src=x onerror=alert(1)>';
  project.materials[0].name = '<b>Материал</b>';
  const svg = createDrawingSvg(project, 'front');
  assert.ok(svg.includes('&lt;script&gt;'));
  assert.doesNotMatch(svg, /<script>|<img|<b>/);
  const html = generateDrawingHTML(project, { language: 'ru' });
  assert.equal((html.match(/<svg /g) || []).length-(html.match(/data-assembly-group=/g)||[]).length, 5);
  assert.doesNotMatch(html, /<script>|<img|<b>/);
  assert.match(html, /Печать \/ сохранить PDF/);
});

test('canvas interaction preserves camera on data updates and cleans up subscriptions', () => {
  const events = new Map();
  const drawingCalls = [];
  const context = new Proxy({
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: text => ({ width: String(text).length * 6 }),
  }, { get: (obj, key) => key in obj ? obj[key] : (...args) => { drawingCalls.push([key, args]); } });
  const canvas = {
    style: {}, width: 0, height: 0,
    getContext: () => context,
    getBoundingClientRect: () => ({ width: 900, height: 650, left: 0, top: 0 }),
    setAttribute() {}, addEventListener(type, fn) { events.set(type, fn); },
    removeEventListener(type) { events.delete(type); },
    setPointerCapture() {}, hasPointerCapture: () => false,
  };
  const viewport = new FurnitureViewport(canvas);
  viewport.setProject(createDefaultProject(), 'cabinet-1');
  viewport.zoom = 1.5;
  viewport.yaw = .25;
  viewport.setProject(createDefaultProject(), 'cabinet-2');
  viewport.setView('3d');
  assert.equal(viewport.zoom, 1.5);
  assert.equal(viewport.yaw, .25);
  viewport.setOptions({ doorsOpen: true, ceiling: true, wireframe: true });
  assert.ok(viewport.hits.length > 50);
  assert.ok(drawingCalls.every(([, args]) => !args.some(n => typeof n === 'number' && !Number.isFinite(n))));
  viewport.resetCamera();
  assert.equal(viewport.zoom, 1);
  viewport.destroy();
  assert.equal(events.size, 0);
});

test('real default tall-cabinet geometry displays its closed oak facade over white interior panels', () => {
  const previous = globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas = class {
    constructor(width, height) { this.width = width; this.height = height; }
    getContext() { return { createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {} }; }
  };
  try {
    const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
    const canvas = { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 700, height: 400, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
    const project = createDefaultProject();
    const viewport = new FurnitureViewport(canvas);
    viewport.setProject(project);
    const cabinet = project.cabinets.find(c => c.type === 'tall');
    // Centres of both closed doors, away from handles and the centre gap.
    for (const relativeX of [150, 450]) {
      const pixel = viewport.camera.project([cabinet.x + relativeX, cabinet.y + cabinet.plinth + 900, cabinet.z + cabinet.depth + 18]);
      const frame = viewport.depthFrame;
      const index = Math.floor(pixel[1] * frame.scale) * frame.width + Math.floor(pixel[0] * frame.scale);
      assert.equal(frame.ownerIds[frame.owners[index]], cabinet.id);
      assert.deepEqual([...frame.pixels.slice(index * 4, index * 4 + 4)], [180, 140, 100, 255]);
    }
    viewport.destroy();
  } finally {
    if (previous === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previous;
  }
});

test('mixed cabinet shelves stay below drawer zone, and pure drawer geometry has no shelf intersections', () => {
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 700, height: 400, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
  const project = legacyProject();
  const cabinet = { ...project.cabinets[0], doors: 2, drawers: 2, shelves: 3 };
  project.cabinets = [cabinet];
  const viewport = new FurnitureViewport(canvas);
  viewport.setProject(project);
  const doorTop = Math.max(...getFrontLayout(cabinet).filter(front => front.kind === 'door').map(front => front.y + front.height));
  const shelfFaces = viewport.hits.filter(face => face.component === 'shelf');
  assert.ok(shelfFaces.length > 0);
  assert.ok(shelfFaces.every(face => face.points.every(point => point[1] <= cabinet.y + cabinet.plinth + doorTop)));
  cabinet.doors = 0;
  viewport.setProject(project);
  assert.equal(viewport.hits.filter(face => face.component === 'shelf').length, 0);
  viewport.destroy();
});

test('explicit wardrobe sections render actual dividers and shelves while preserving inset front depths', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.layout.children[0].depth = 400;
  cabinet.layout.children[0].shelves = 1;
  const layout = getCabinetLayout(cabinet, project);
  const viewport = new FurnitureViewport(mockCanvas());
  viewport.setProject(project, cabinet.id);
  const dividerFaces = viewport.hits.filter(face => face.component === 'partition');
  assert.ok(dividerFaces.length >= 2);
  const shelves = viewport.hits.filter(face => face.component === 'shelf');
  assert.ok(shelves.length > 0);
  assert.ok(shelves.every(face => face.sectionId === 'section-top'));
  const topFront = viewport.hits.find(face => face.component === 'front' && face.sectionId === 'section-top');
  assert.ok(topFront);
  assert.ok(topFront.points.every(point => point[2] >= cabinet.z + cabinet.backThickness + 400));
  const shelf = layout.sections.find(section => section.id === 'section-top');
  assert.ok(shelves.every(face => face.points.every(point => point[1] >= cabinet.y + cabinet.plinth + shelf.y && point[1] <= cabinet.y + cabinet.plinth + shelf.y + shelf.height)));
  viewport.setOptions({ focusCabinet: true, selectedSectionId: 'section-middle', room: true });
  assert.equal(new Set(viewport.hits.map(face => face.id)).size, 1);
  viewport.destroy();
});

test('L-outline triangulation leaves the notch empty and model panels follow exact production contours', () => {
  const concave = { id: 'panel', color: '#ffffff', screen: [[40, 0, 10], [100, 0, 10], [100, 100, 10], [0, 100, 10], [0, 30, 10], [40, 30, 10]] };
  const frame = rasterizeFaces([concave], 100, 100);
  assert.equal(frame.owners[10 * 100 + 10], 0);
  assert.equal(frame.ownerIds[frame.owners[50 * 100 + 10]], 'panel');
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.cutout = { corner: 'back-left', width: 200, depth: 220 };
  cabinet.layout.children.forEach(section => { section.front = 'open'; section.shelves = 0; });
  withSoftwareViewport(project, viewport => {
    viewport.setOptions({ focusCabinet: true, room: false });
    viewport.setView('top');
    const image = viewport.depthFrame;
    const hole = viewport.camera.project([cabinet.x + 70, cabinet.height, cabinet.z + 70]);
    const holeIndex = Math.floor(hole[1] * image.scale) * image.width + Math.floor(hole[0] * image.scale);
    assert.equal(image.owners[holeIndex], 0, 'rear L-notch must remain empty in the actual viewport');
    const top = generateParts(project).find(part => part.name === 'Крышка');
    const cap = viewport.hits.find(face => face.partId === top.id && face.points.length === 6);
    assert.ok(cap, '3D top cap uses the six-point production outline');
    const svg = createPartSvg(top, project);
    assert.match(svg, /Деталь раскроя/);
    assert.equal((svg.match(/<polygon /g) || []).length, 1);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  });
});

test('selected-cabinet exports include readable facade sizes, clean section openings and real drawer components', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  const frontal = drawingPages(project, 'front', { cabinetId: cabinet.id });
  assert.match(frontal, /F1 · дверь/);
  assert.match(frontal, /F3 · ящик/);
  assert.match(frontal, /597 × 924 мм/);
  const interior = drawingPages(project, 'interior', { cabinetId: cabinet.id });
  assert.match(interior, /Внутренние секции/);
  assert.ok(interior.replace(/[\u00a0\u202f]/g, ' ').includes('Проём 1 164 × 900 мм'));
  assert.doesNotMatch(interior, /data-component="front"/);
  const html = generateDrawingHTML(project, { cabinetId: cabinet.id, language: 'ru' }).replace(/[\u00a0\u202f]/g, ' ');
  assert.deepEqual([...new Set([...html.matchAll(/data-drawing-view="([^"]+)"/g)].map(match=>match[1]))],['front','back','left','right','top','interior']);
  assert.match(html, /детали и короба ящиков/);
  assert.match(html, /577 × 198/);
  assert.match(html, /1 138 × 577/);
  assert.match(html, /Полезная глубина/);
});

test('arbitrary angular room windows and rotated cabinet model preserve finite coordinates', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  project.room.outline = [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 3600, z: 2500 }, { x: 2200, z: 3000 }, { x: 0, z: 2200 }];
  project.room.windows = [{ id: 'angular-window', wallIndex: 2, offset: 100, width: 900, height: 1000, sill: 800 }];
  cabinet.rotation = 90;
  cabinet.x = 1600; cabinet.z = 500;
  const svg = createDrawingSvg(project, 'top');
  assert.match(svg, /data-wall-index="2" data-window="true"/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  const viewport = new FurnitureViewport(mockCanvas());
  viewport.setProject(project, cabinet.id);
  assert.ok(viewport.hits.every(face => face.points.every(point => point.every(Number.isFinite))));
  assert.ok(viewport.hits.some(face => face.points.some(point => point[0] < cabinet.x - 500)), 'positive rotation turns the cabinet front toward negative X');
  viewport.destroy();
});

test('an open appliance niche respects actual equipment dimensions and omits its rear panel', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 700, height: 950, depth: 650, plinth: 0, includeBack: false, layout: { id: 'machine-niche', kind: 'section', front: 'open', doors: 0, drawers: 0, shelves: 0, depth: null, back: 'none', appliance: { type: 'washer', label: 'Стиральная машина', width: 600, height: 850, depth: 500 } } });
  const viewport = new FurnitureViewport(mockCanvas());
  viewport.setProject(project, cabinet.id);
  assert.equal(viewport.hits.filter(face => face.component === 'back').length, 0);
  const machine = viewport.hits.filter(face => face.component === 'appliance').flatMap(face => face.points);
  assert.ok(machine.length > 0);
  for (const [axis, expected] of [[0, 600], [1, 850], [2, 500]]) assert.equal(Math.max(...machine.map(point => point[axis])) - Math.min(...machine.map(point => point[axis])), expected);
  const drawing = createDrawingSvg(project, 'interior', { cabinetId: cabinet.id }).replace(/[\u00a0\u202f]/g, ' ');
  assert.match(drawing, /Стиральная машина · 600 × 850 × 500 мм/);
  assert.doesNotMatch(drawing, /data-component="back"/);
  viewport.destroy();
});

test('a cabinet without a bottom places the real appliance on the floor instead of a fabricated slab', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 700, height: 950, depth: 650, plinth: 0, includeBottom: false, includeBack: false, layout: { id: 'floor-machine', kind: 'section', front: 'open', shelves: 0, back: 'none', appliance: { type: 'washer', label: 'Машина на полу', width: 600, height: 850, depth: 600 } } });
  const before = structuredClone(project), parts = generateParts(project);
  assert.equal(parts.some(part => /^Дно корпуса/.test(part.name)), false);
  withSoftwareViewport(project, viewport => {
    viewport.setOptions({ focusCabinet: true, room: false });
    const machine = viewport.hits.filter(face => face.component === 'appliance').flatMap(face => face.points);
    assert.equal(Math.min(...machine.map(point => point[1])), 0);
    assert.equal(Math.max(...machine.map(point => point[1])), 850);
    const top = parts.find(part => part.name === 'Крышка');
    assert.ok(viewport.hits.some(face => face.partId === top.id));
    assert.equal(viewport.hits.filter(face => face.component === 'plinth' || face.component === 'leg').length, 0);
  });
  assert.deepEqual(project, before, 'rendering and drawing must not change the cabinet construction');
  const svg = createDrawingSvg(project, 'interior', { cabinetId: cabinet.id });
  assert.match(svg, /Проём 664 × 932 мм/);
  assert.match(svg, /Машина на полу · 600 × 850 × 600 мм/);
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('a partial floor portal retains neighbour bottoms while leaving the actual 3D opening clear', () => {
  const project = createLaundryExample(), cabinet = project.cabinets[0];
  const layout = getCabinetLayout(cabinet, project), portal = layout.sections.find(section => section.id === 'laundry-floor');
  assert.equal(portal.y, -100);
  assert.equal(portal.height, 1486);
  const parts = generateParts(project);
  const bottomParts = parts.filter(part => /^Дно корпуса/.test(part.name));
  const plinthParts = parts.filter(part => part.component === 'plinth');
  assert.equal(bottomParts.length, 2);
  assert.equal(plinthParts.length, 2);
  const outsidePortal = part => part.position.x + part.finishedWidth <= portal.x + .001 || part.position.x >= portal.x + portal.width - .001;
  assert.ok([...bottomParts, ...plinthParts].every(outsidePortal));
  withSoftwareViewport(project, viewport => {
    viewport.setOptions({ focusCabinet: true, room: false });
    viewport.setView('front');
    const machine = viewport.hits.filter(face => face.component === 'appliance' && face.sectionId === portal.id).flatMap(face => face.points);
    assert.equal(Math.min(...machine.map(point => point[1])), cabinet.y);
    for (const part of [...bottomParts, ...plinthParts]) assert.ok(viewport.hits.some(face => face.partId === part.id), 'retained panels come from the cutting model');
    const feet = viewport.hits.filter(face => face.component === 'leg');
    assert.ok(feet.every(face => face.points.every(point => point[0] <= cabinet.x + portal.x || point[0] >= cabinet.x + portal.x + portal.width)));
    const pixel = viewport.camera.project([cabinet.x + portal.x + 10, cabinet.y + 50, cabinet.z + cabinet.depth]);
    const frame = viewport.depthFrame;
    const index = Math.floor(pixel[1] * frame.scale) * frame.width + Math.floor(pixel[0] * frame.scale);
    assert.equal(frame.owners[index], 0, 'no full-width bottom, plinth or invented support crosses the floor portal');
    const extended = parts.filter(part => part.partitionId && part.position.y === -cabinet.plinth);
    assert.equal(extended.length, 2);
    assert.ok(extended.every(part => viewport.hits.some(face => face.partId === part.id && face.points.some(point => point[1] === 0))));
  });
  const svg = drawingPages(project, 'interior', { cabinetId: cabinet.id }).replace(/[\u00a0\u202f]/g, ' ');
  assert.match(svg, /Проём 928 × 1 486 мм/);
  assert.doesNotMatch(svg, /Проём [^<]*-\d|NaN|Infinity|undefined/);
  cabinet.layout.children[1].children[2].front = 'doors';
  cabinet.layout.children[1].children[2].doors = 2;
  const fronts = getFrontLayout(cabinet, project).filter(front => front.sectionId === portal.id);
  assert.ok(fronts.every(front => cabinet.plinth + front.y === cabinet.gap), 'a floor front starts at the actual cabinet base plus its facade gap');
});

test('rear crossbars use real panel geometry and annotate their mount height from the whole cabinet base', () => {
  const project = createLaundryExample(), cabinet = project.cabinets[0];
  // Keep this a whole-cabinet rail fixture. The laundry example now uses
  // local rails within its floor portal, avoiding its vertical partitions.
  cabinet.layout = { id: 'global-rail-opening', kind: 'section', front: 'open', shelves: 0 };
  cabinet.rearBraces = [{ id: 'global-upper', y: 2000, height: 100 }, { id: 'global-lower', y: 300, height: 100 }];
  assert.equal(validateProject(project).filter(issue => issue.level === 'error').length, 0);
  const parts = generateParts(project).filter(part => part.component === 'brace');
  assert.equal(parts.length, 2);
  const viewport = new FurnitureViewport(mockCanvas());
  viewport.setProject(project, cabinet.id);
  viewport.setView('back');
  parts.forEach(part => {
    const original = cabinet.rearBraces.find(brace => brace.id === part.braceId);
    const faces = viewport.hits.filter(face => face.partId === part.id);
    assert.ok(faces.length > 0);
    const vertices = faces.flatMap(face => face.points);
    assert.equal(Math.min(...vertices.map(point => point[1])), cabinet.y + original.y);
    assert.equal(Math.max(...vertices.map(point => point[1])), cabinet.y + original.y + original.height);
    assert.ok(faces.every(face => face.component === 'brace' && face.braceId === original.id));
  });
  viewport.destroy();
  const svg = createDrawingSvg(project, 'back', { cabinetId: cabinet.id }).replace(/[\u00a0\u202f]/g, ' ');
  assert.match(svg, /C1 · 1 564 × 100 × 18 мм/);
  assert.match(svg, /Низ от основания шкафа: 2 000 мм/);
  assert.match(svg, /Низ от основания шкафа: 300 мм/);
  assert.doesNotMatch(svg,/Низ от основания секции:|data-mount-section-mm=/,'whole-cabinet braces have no invented section reference');
  const html = generateDrawingHTML(project, { cabinetId: cabinet.id, language: 'ru' });
  assert.match(html, /задние поперечины/);
  assert.match(html, /Низ от основания, мм/);
  assert.ok(html.includes('<td>300</td>'));
});

test('the laundry pull-out shelf is one actual thin panel that slides independently of drawer boxes', () => {
  const project = createLaundryExample(), cabinet = project.cabinets[0];
  const part = generateParts(project).find(part => part.component === 'pull-out-shelf');
  assert.ok(part);
  assert.equal(part.thickness, 18);
  const section = getCabinetLayout(cabinet, project).sections.find(section => section.id === part.sectionId);
  withSoftwareViewport(project, viewport => {
    viewport.setOptions({ focusCabinet: true, room: false });
    const closed = viewport.hits.filter(face => face.partId === part.id).flatMap(face => face.points);
    assert.ok(closed.length > 0);
    const closedFront = Math.max(...closed.map(point => point[2]));
    viewport.setOptions({ doorsOpen: true });
    const open = viewport.hits.filter(face => face.partId === part.id).flatMap(face => face.points);
    assert.equal(Math.max(...open.map(point => point[2])) - closedFront, Math.min(section.usableDepth * .48, 260));
    assert.equal(Math.max(...open.map(point => point[1])) - Math.min(...open.map(point => point[1])), 18);
    assert.equal(viewport.hits.filter(face => face.component === 'drawer-box' && face.sectionId === section.id).length, 0);
  });
  const drawing = createDrawingSvg(project, 'interior', { cabinetId: cabinet.id });
  assert.match(drawing, /data-component="pull-out-shelf"/);
  assert.match(generateDrawingHTML(project, { cabinetId: cabinet.id, language: 'ru' }), /выдвижная полка/);
  const partSvg = createPartSvg(part, project);
  assert.match(partSvg, /Заготовка без кромки: 900 × 609 мм/);
  assert.match(partSvg, /Готовый размер с кромкой: 902 × 610 мм/);
});

test('a doorway cuts the wall down to zero without a window sill or glazed mullion', () => {
  const project = createDefaultProject();
  project.cabinets = [];
  project.room.windows = [{ id: 'entry', wallIndex: 0, kind: 'door', offset: 600, width: 900, height: 2100, sill: 800 }];
  const svg = createDrawingSvg(project, 'front');
  assert.match(svg, /data-opening-kind="door" data-sill-mm="0"/);
  assert.match(svg, /data-door-leaf="true"/);
  assert.doesNotMatch(svg, /data-window="true"/);
  assert.match(svg.replace(/[\u00a0\u202f]/g, ' '), /Дверной проём · 900 × 2 100 мм/);
  const polygons = [...svg.matchAll(/<polygon points="([^"]+)"([^>]*)>/g)].map(([, points, attributes]) => ({ points: points.split(' ').map(point => point.split(',').map(Number)), attributes }));
  const opening = polygons.find(polygon => polygon.attributes.includes('data-opening-kind="door"'));
  const [left, bottom] = opening.points[0], [right, top] = opening.points[2];
  const probe = [(left + right) / 2, bottom - Math.abs(bottom - top) * .03];
  const contains = (vertices, [x, y]) => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const [xi, yi] = vertices[i], [xj, yj] = vertices[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const wall = polygons.filter(polygon => polygon.attributes.includes('data-wall-index="0"') && !polygon.attributes.includes('data-opening-kind'));
  assert.ok(wall.length > 0);
  assert.equal(wall.some(polygon => contains(polygon.points, probe)), false, 'the actual wall has no panel at the bottom of the door aperture');
  assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
});

test('technical clearances annotate the required niche while keeping the machine envelope and rear placement exact', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  const appliance = { type: 'washer', label: 'Машина с монтажными зазорами', width: 600, height: 850, depth: 600, useClearances: true, clearances: { side: 50, top: 50, rear: 50 } };
  Object.assign(cabinet, { width: 736, height: 950, depth: 650, plinth: 0, includeBottom: false, includeBack: false, layout: { id: 'clearance-niche', kind: 'section', front: 'open', shelves: 0, back: 'none', appliance } });
  const before = structuredClone(project);
  withSoftwareViewport(project, viewport => {
    viewport.setOptions({ focusCabinet: true, room: false });
    const points = viewport.hits.filter(face => face.component === 'appliance').flatMap(face => face.points);
    assert.equal(Math.min(...points.map(point => point[0])), cabinet.x + 18 + 50);
    assert.equal(Math.max(...points.map(point => point[0])) - Math.min(...points.map(point => point[0])), 600);
    assert.equal(Math.min(...points.map(point => point[1])), cabinet.y);
    assert.equal(Math.max(...points.map(point => point[1])) - Math.min(...points.map(point => point[1])), 850);
    assert.equal(Math.min(...points.map(point => point[2])), cabinet.z + 50, 'the frontal alignment leaves the real 50 mm space behind the 600 mm appliance');
    assert.equal(Math.max(...points.map(point => point[2])), cabinet.z + cabinet.depth);
  });
  const svg = createDrawingSvg(project, 'interior', { cabinetId: cabinet.id });
  assert.match(svg, /Ниша с зазорами: 700 × 900 × 650 мм/);
  assert.match(svg, /Зазоры: бок\/сторона 50 · сверху 50 · сзади 50 мм/);
  assert.match(svg, /Проём 700 × 932 мм/);
  const html = generateDrawingHTML(project, { cabinetId: cabinet.id, language: 'ru' });
  assert.match(html, /техника и монтажные зазоры/);
  assert.match(html, /Требуемая ниша: Ш × В × Г, мм/);
  assert.ok(html.includes('<td>700 × 900 × 650</td>'));
  assert.ok(html.includes('<td>50</td><td>50</td><td>50</td><td>Помещается</td>'));
  assert.deepEqual(project, before, 'documentation never changes the user clearance profile');
  appliance.clearances.rear = 70;
  assert.ok(generateDrawingHTML(project, { cabinetId: cabinet.id, language: 'ru' }).includes('<td>Не помещается</td>'), 'a physical fit does not claim to satisfy insufficient technical rear space');
  appliance.useClearances = false;
  const legacy = createDrawingSvg(project, 'interior', { cabinetId: cabinet.id });
  assert.doesNotMatch(legacy, /Ниша с зазорами:|Зазоры: бок/);
  const disabled = generateDrawingHTML(project, { cabinetId: cabinet.id, language: 'ru' });
  assert.ok(disabled.includes('<td>600 × 850 × 600</td><td>—</td><td>—</td><td>—</td><td>Помещается</td>'));
});

test('compact production printing retains six views and gives opening summaries a full detail sheet', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  const html = generateDrawingHTML(project, { cabinetId: cabinet.id });
  assert.match(html, /<html lang="tr">/);
  assert.equal((html.match(/class="sheet projection-sheet"/g) || []).length, 2);
  assert.deepEqual(html.match(/data-projections="\d"/g), ['data-projections="2"','data-projections="2"']);
  const wide = structuredClone(project); wide.cabinets[0].height=1000; wide.cabinets[0].layout = { id:'wide-open', kind:'section', front:'open', shelves:0 };
  const wideHtml=generateDrawingHTML(wide,{cabinetId:wide.cabinets[0].id});
  assert.match(wideHtml,/data-projections="4"/);
  assert.match(wideHtml,/data-drawing-view="front"[\s\S]*?data-section-callout="S1"/);
  assert.match(wideHtml,/data-drawing-view="interior" data-annotation-page="1"/);
  assert.match(wideHtml,/data-section-callout="S1"/);
  assert.equal((html.match(/class="sheet assembly-sheet"/g) || []).length, Math.ceil(generateParts(project).length/12),'all panels receive readable assembly callouts');
  assert.ok((html.match(/class="sheet schedule installation-schedule"/g)||[]).length,'finished panel positions have a companion schedule');
  assert.equal((html.match(/data-schedule-kind="hardware"/g)||[]).length,1);
  assert.equal((html.match(/data-schedule-kind="cost"/g)||[]).length,1);
  assert.doesNotMatch(html,/data-schedule-kind="price-sources"/,'short source lists remain beside the cost table');
  assert.match(html, /combined-schedule/);
  assert.match(html, /parts-schedule/);
  const projections = [...html.matchAll(/<svg[^>]+data-compact-view="([^"]+)"[\s\S]*?<\/svg>/g)];
  assert.deepEqual(projections.map(match => match[1]), ['back','left','right','top']);
  assert.deepEqual([...new Set([...html.matchAll(/data-drawing-view="([^"]+)"/g)].map(match=>match[1]))], ['front','back','left','right','top','interior']);
  for (const [svg] of projections) {
    const fonts = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(match => Number(match[1]));
    assert.ok(fonts.length && fonts.every(font => font >= 14), 'text uses approximately 3.5 mm nominal font size at A4');
    assert.match(svg, /viewBox="0 0 530 676"/);
  }
  const full = generateDrawingHTML(project, { cabinetId: cabinet.id, compact: false, language: 'en' });
  assert.doesNotMatch(full, /data-compact-view=/);
  assert.deepEqual([...new Set([...full.matchAll(/data-drawing-view="([^"]+)"/g)].map(match=>match[1]))], ['front','back','left','right','top','interior']);
  const complex = createLaundryExample();
  const detailed = generateDrawingHTML(complex, { cabinetId: complex.cabinets[0].id });
  assert.deepEqual([...new Set([...detailed.matchAll(/data-drawing-view="([^"]+)"/g)].map(match=>match[1]))], ['front','back','left','right','top','interior']);
  assert.match(detailed, /data-drawing-view="interior" data-annotation-page="1"/);
  assert.match(detailed,/Техника|Çamaşır|Kurutma/, 'equipment names remain present beside the local drawing or in its schedule');
  assert.match(detailed, /viewBox="0 0 530 676"/);
});

test('short internal drawer schedules combine where readable and retain every opening and facade row', () => {
  const project=createDefaultProject(),cabinet=project.cabinets[0],top=getCabinetLayout(cabinet,project).sections[0].node;
  cabinet.name='Шкаф 1';top.shelves=0;top.internalDrawerCount=2;top.doorOpenings=['up','right'];
  const before=structuredClone(project);
  assert.deepEqual(validateProject(project).filter(item=>item.level==='error'),[]);
  for(const language of ['ru','tr','en']){
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    const pages=[...html.matchAll(/<section class="sheet [\s\S]*?<\/section>/g)].map(match=>match[0]);
    assert.ok(pages.some(page=>page.includes('class="sheet assembly-sheet"')),'the cabinet passport also includes panel assembly');
    const schedules=pages.filter(page=>/data-schedule-kind="(?:openings|fronts|internal-fronts)"/.test(page));
    assert.ok(schedules.length<=2,'readable opening/facade schedules share at most two A4 sheets');
    const contents=schedules.join('');
    for(const kind of ['openings','fronts','internal-fronts'])assert.ok(contents.includes(`data-schedule-kind="${kind}"`));
    assert.match(contents,/>I1<\/td>/);assert.match(contents,/>I2<\/td>/);
    assert.match(contents,/>S3<\/td>/);assert.match(contents,/>F6<\/td>/);
    for(const page of schedules){
      const height=Number(page.match(/data-estimated-content-height="(\d+)"/)[1]),limit=Number(page.match(/data-content-height-limit="(\d+)"/)[1]);
      assert.ok(height<=limit-20,'wrapped captions, headers and rows retain the reserved document-footer margin');
    }
    assert.match(html,/\.sheet\.combined-schedule td,\.sheet\.combined-schedule th\{padding:5px 6px;font-size:14px;line-height:1\.25\}/,'compactness preserves comfortable 10.5 pt table text');
  }
  assert.deepEqual(project,before);
  const full=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'tr',compact:false});
  assert.doesNotMatch(full,/data-schedule-kind="(?:openings|fronts|internal-fronts)"/,'the user can retain the separate full-sheet print layout');
});

test('long internal drawer schedules paginate before captions or rows overrun the landscape sheet', () => {
  const project=createDefaultProject(),cabinet=project.cabinets[0];
  cabinet.height=2600;cabinet.name='Detailed cabinet with a long workshop title '.repeat(4).trim();
  cabinet.layout={id:'long-internals',kind:'section',front:'doors',doors:2,shelves:0,internalDrawerCount:12,openingMechanism:'handle'};
  assert.deepEqual(validateProject(project).filter(item=>item.level==='error'),[]);
  const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'en'});
  const schedules=[...html.matchAll(/<section class="sheet [\s\S]*?<\/section>/g)].map(match=>match[0]).filter(page=>/data-schedule-kind="(?:openings|fronts|internal-fronts)"/.test(page));
  assert.equal(schedules.length,2);
  const internal=schedules.find(page=>page.includes('data-schedule-kind="internal-fronts"'));
  assert.ok(internal);assert.ok(!internal.includes('data-schedule-kind="fronts"')&&!internal.includes('data-schedule-kind="openings"'));
  for(let index=1;index<=12;index++)assert.ok(internal.includes(`>I${index}</td>`),'pagination retains every actual internal front');
  for(const page of schedules){
    const height=Number(page.match(/data-estimated-content-height="(\d+)"/)[1]),limit=Number(page.match(/data-content-height-limit="(\d+)"/)[1]);
    assert.ok(height<limit);
  }
});

test('Turkish and English export vocabulary translates construction terms while retaining exact custom names', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  cabinet.name = 'Мой шкаф — дверь';
  const sections = getCabinetLayout(cabinet,project).sections;
  sections.forEach((section,index) => { section.node.name = `Проём Дверь пользователя ${index+1}`; });
  const before = structuredClone(project);
  for (const [language,front,opening,drawer] of [['tr','Ön görünüş','Açıklık','Çekmece'],['en','Front view','Opening','Drawer']]) {
    const svg = createDrawingSvg(project,'front',{cabinetId:cabinet.id,language});
    assert.match(svg,new RegExp(front));
    assert.ok(svg.includes(cabinet.name));
    assert.match(svg,/data-i18n="off"/);
    assert.doesNotMatch(svg,/Вид спереди|Все размеры|F1 · дверь/);
    const html = generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.ok(html.includes(cabinet.name));
    sections.forEach(section => assert.ok(html.includes(section.node.name),'custom section names are not dictionary fragments'));
    assert.ok(html.includes(opening));
    assert.ok(html.includes(drawer));
    const visible = html.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    const systemText = [cabinet.name,...sections.map(section=>section.node.name)].reduce((text,name)=>text.replaceAll(name,''),visible);
    assert.doesNotMatch(systemText,/[А-Яа-яЁё]/,'all generated labels, part names, gauge units and table prose are localized');
    const drawerPart = generateParts(project).find(part=>/Ящик 1 · дно$/.test(part.name));
    const partSvg = createPartSvg(drawerPart,project,{language});
    assert.ok(partSvg.includes(sections[1].node.name));
    assert.ok(partSvg.includes(drawer));
    assert.doesNotMatch(partSvg,/Деталь раскроя|толщина|после кромки/);
  }
  assert.equal(translatePartName('Секция 2 · Мой Ящик · Ящик 1 · дно','en'),'Section 2 · Мой Ящик · Drawer 1 · bottom');
  assert.equal(translatePrintText('Ширина заготовки мм','tr'),'Kesim genişliği mm');
  assert.equal(translatePrintText('Ящик 1 · передняя стенка','en'),'Drawer 1 · front panel');
  assert.equal(printNumber(18.5,'en'),'18.5');
  assert.equal(printNumber(18.5,'tr'),'18,5');
  assert.equal(printLanguage('unknown','tr'),'tr');
  delete project.settings.printLanguage;
  assert.match(generateDrawingHTML(project,{cabinetId:cabinet.id}),/<html lang="tr">/);
  project.settings.printLanguage='en';
  assert.match(generateDrawingHTML(project,{cabinetId:cabinet.id}),/<html lang="en">/);
  project.settings = before.settings;
  assert.deepEqual(project,before,'print language never rewrites the underlying user names');
});

test('canvas language changes generated appliance and millimetre HUD labels without changing its camera', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0], texts = [];
  Object.assign(cabinet,{width:700,height:950,depth:650,plinth:0,includeBottom:false,includeBack:false,layout:{id:'localized-machine',kind:'section',front:'open',shelves:0,appliance:{type:'washer',width:600,height:850,depth:600}}});
  const canvas = mockCanvas(), context = canvas.getContext();
  context.fillText = text => texts.push(String(text));
  const viewport = new FurnitureViewport(canvas);
  try {
    viewport.setProject(project,cabinet.id);
    viewport.yaw=.35;
    texts.length=0;
    viewport.setLanguage('en');
    assert.equal(viewport.yaw,.35);
    assert.equal(viewport.applianceCallouts[0].text,'Washing machine · 600 × 850 × 600 mm');
    assert.ok(texts.includes('Washing machine'));
    assert.ok(texts.includes('600 × 850 × 600 mm'));
    assert.ok(texts.some(text=>/^\d[\d,.]* mm$/.test(text)));
    assert.ok(texts.every(text=>!text.includes('мм')));
    cabinet.layout.appliance.label='Проём Дверь пользователя';
    texts.length=0;viewport.setProject(project,cabinet.id);
    assert.equal(viewport.applianceCallouts[0].text,'Проём Дверь пользователя · 600 × 850 × 600 mm');
    assert.ok(texts.includes('Проём Дверь пользователя'));
  } finally { viewport.destroy(); }
});

function laundryColumnProject() {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  const appliance = (id, type) => ({ id, kind: 'section', front: 'open', shelves: 0, back: 'none', appliance: { type, width: 600, height: 850, depth: 600 } });
  Object.assign(cabinet, { width: 696, height: 2200, depth: 660, includeBack: false, layout: { id: 'column', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [appliance('dryer-niche', 'dryer'), appliance('washer-niche', 'washer')] } });
  return project;
}

function assertCalloutsInside(cards, width, height) {
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    assert.ok(card.x >= 0 && card.y >= 0, `${card.sectionId} has a nonnegative caption origin`);
    assert.ok(card.x + card.width <= width + .001 && card.y + card.height <= height + .001, 'caption stays inside the canvas');
    assert.ok(card.leader.flat().every(Number.isFinite));
    assert.ok(card.leader.every(p => p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height), 'leader stays inside the canvas');
    if (index) assert.ok(cards[index - 1].y + cards[index - 1].height <= card.y + .001, 'caption boxes do not overlap');
  }
}

test('appliance callout layout wraps long names and separates crowded anchors inside narrow and wide canvases', () => {
  const annotations = [
    { sectionId: 'lower', name: 'Стиральная машина пользователя с длинным названием', dimensions: '600 × 850 × 600 мм', anchor: [30, 125] },
    { sectionId: 'upper', name: 'Сушильная машина', dimensions: '600 × 850 × 600 мм', anchor: [20, 124] },
  ], before = structuredClone(annotations), measureText = (text, font) => [...text].length * font * .56;
  for (const [width, height] of [[900, 700], [320, 260], [200, 180]]) {
    const layout = layoutApplianceCallouts(annotations, { width, height, measureText });
    assert.equal(layout.cards.length, 2);
    assert.deepEqual(layout.cards.map(card => card.sectionId), ['upper', 'lower']);
    assertCalloutsInside(layout.cards, width, height);
    for (const card of layout.cards) {
      assert.ok(card.x > layout.modelWidth, 'caption is outside the reserved model area');
      assert.ok(card.lines.length >= 2);
      assert.ok(card.lines.every(line => measureText(line, card.fontSize) <= card.width - card.padding * 2 + .001), 'wrapped text fits its caption');
      assert.equal(card.text, `${card.name} · ${card.dimensions}`, 'complete custom caption is retained');
    }
  }
  const crowded = Array.from({ length: 12 }, (_, index) => ({ ...annotations[index % 2], sectionId: `crowded-${index}`, anchor: [40, 30] }));
  assertCalloutsInside(layoutApplianceCallouts(crowded, { width: 280, height: 150, measureText }).cards, 280, 150);
  assert.equal(layoutApplianceCallouts([{ ...annotations[0], anchor: [NaN, 0] }], { width: 320, height: 260 }).cards.length, 0);
  assert.deepEqual(annotations, before, 'layout never mutates project annotation data');
});

test('two appliances use separate side callouts with arrows on their own surfaces across camera rotations and zoom', () => {
  const project = laundryColumnProject(), cabinet = project.cabinets[0], before = structuredClone(project);
  const canvas = mockCanvas(), viewport = new FurnitureViewport(canvas);
  try {
    viewport.setProject(project, cabinet.id);
    viewport.setOptions({ focusCabinet: true, room: false, dimensions: false, hud: false });
    viewport.setLanguage('ru');
    for (const [width, height] of [[900, 700], [320, 420]]) {
      canvas.getBoundingClientRect = () => ({ width, height, left: 0, top: 0 }); viewport.resize();
      for (const [yaw, elevation, zoom] of [[0, 0, 1], [.63, .52, 1], [Math.PI, .2, 1], [.3, 1.47, .65], [.63, .52, 1.8]]) {
        Object.assign(viewport, { yaw, elevation, zoom }); viewport.draw();
        const cards = viewport.applianceCallouts;
        assert.equal(cards.length, 2, `both appliances remain annotated at camera ${yaw}/${elevation}/${zoom}`);
        assertCalloutsInside(cards, width, height);
        assert.ok(cards.every(card => card.x > viewport.camera.width));
        assert.deepEqual(new Set(cards.map(card => card.sectionId)), new Set(['dryer-niche', 'washer-niche']));
        for (const card of cards) {
          const section = getCabinetLayout(cabinet, project).sections.find(section => section.id === card.sectionId);
          assert.ok(card.worldAnchor[1] >= cabinet.y + cabinet.plinth + section.y && card.worldAnchor[1] <= cabinet.y + cabinet.plinth + section.y + 850);
          assert.ok(card.worldAnchor[0] >= cabinet.x + section.x && card.worldAnchor[0] <= cabinet.x + section.x + section.width);
        }
        assert.ok(cards.find(card => card.sectionId === 'dryer-niche').worldAnchor[1] > cards.find(card => card.sectionId === 'washer-niche').worldAnchor[1], 'each arrow retains its own appliance rather than swapping identities');
      }
    }
    viewport.pan = { x: 20000, y: 20000 }; viewport.draw();
    assert.equal(viewport.applianceCallouts.length, 0, 'fully offscreen appliances do not leave misleading arrows behind');
    assert.deepEqual(project, before);
  } finally { viewport.destroy(); }
});

test('room perspective annotates only the selected cabinet and leaves orthographic captions unchanged', () => {
  const project = laundryColumnProject(), cabinet = project.cabinets[0];
  project.cabinets.push({ ...structuredClone(cabinet), id: 'another-column', x: cabinet.x + 1800 });
  const canvas = mockCanvas(), texts = [], context = canvas.getContext(); context.fillText = text => texts.push(String(text));
  const viewport = new FurnitureViewport(canvas);
  try {
    viewport.setLanguage('en'); viewport.setProject(project, null);
    assert.equal(viewport.applianceCallouts.length, 0, 'unselected room view is not filled with callouts');
    assert.ok(!texts.some(text => /Washing machine|Dryer/.test(text)));
    viewport.setProject(project, cabinet.id);
    assert.equal(viewport.applianceCallouts.length, 2);
    assert.ok(viewport.applianceCallouts.every(card => card.id === cabinet.id));
    texts.length = 0; viewport.setView('front');
    assert.equal(viewport.applianceCallouts.length, 0);
    assert.ok(texts.includes('Washing machine · 600 × 850 × 600 mm'), 'orthographic appliance caption remains unchanged');
  } finally { viewport.destroy(); }
});

test('3D print capture includes localized appliance callouts and leaders without mutating the live annotation layout', () => {
  const project = laundryColumnProject(), cabinet = project.cabinets[0], canvas = mockCanvas(), viewport = new FurnitureViewport(canvas), captures = [], texts = [];
  const originalDraw = FurnitureViewport.prototype.drawApplianceCallouts;
  const factory = () => {
    const context = new Proxy({ createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }), putImageData() {}, measureText: text => ({ width: String(text).length * 6 }), fillText: text => texts.push(String(text)) }, { get: (target, key) => key in target ? target[key] : () => {} });
    return { getContext: () => context, toDataURL: () => 'data:image/png;base64,aW1hZ2U=' };
  };
  try {
    viewport.setProject(project, cabinet.id); viewport.setOptions({ focusCabinet: true, room: false, dimensions: false });
    const before = { camera: viewport.camera, callouts: viewport.applianceCallouts, pan: { ...viewport.pan }, project: structuredClone(project) };
    FurnitureViewport.prototype.drawApplianceCallouts = function(layout) { if (this !== viewport) captures.push({ cards: structuredClone(layout.cards), width: this.width, height: this.height }); return originalDraw.call(this, layout); };
    const snapshot = viewport.captureCabinet3D({ language: 'en', width: 1200, canvasFactory: factory });
    assert.equal(captures.length, 1); assert.equal(captures[0].cards.length, 2);
    assertCalloutsInside(captures[0].cards, captures[0].width, captures[0].height);
    assert.ok(captures[0].cards.some(card => card.text === 'Dryer · 600 × 850 × 600 mm'));
    assert.ok(captures[0].cards.some(card => card.text === 'Washing machine · 600 × 850 × 600 mm'));
    assert.ok(texts.includes('Dryer') && texts.includes('Washing machine'));
    assert.ok(texts.includes('600 × 850 × 600 mm'));
    assert.ok(generateCabinet3DHTML(project, { ...snapshot, language: 'en' }).includes(snapshot.imageDataUrl));
    assert.equal(viewport.camera, before.camera); assert.equal(viewport.applianceCallouts, before.callouts);
    assert.deepEqual(viewport.pan, before.pan); assert.deepEqual(project, before.project);
  } finally { FurnitureViewport.prototype.drawApplianceCallouts = originalDraw; viewport.destroy(); }
});

test('floor-length sides keep the raised bottom and front plinth without fabricating separate support legs', () => {
  const project = createDefaultProject(), cabinet = project.cabinets[0];
  Object.assign(cabinet,{height:2200,plinth:100,sidesToFloor:true,includeBottom:true});
  const parts = generateParts(project), sides = parts.filter(part=>/^Боковина (левая|правая)$/.test(part.name)), bottom = parts.find(part=>part.name==='Дно корпуса');
  assert.equal(sides.length,2);
  sides.forEach(side=>{assert.equal(side.finishedHeight,2200);assert.equal(side.position.y,-100);});
  assert.equal(bottom.position.y,0,'the structural bottom stays above the retained plinth');
  assert.equal(getCabinetLayout(cabinet,project).bodyHeight,2100);
  const before = structuredClone(project);
  withSoftwareViewport(project,viewport=>{
    viewport.setOptions({focusCabinet:true,room:false});
    for(const side of sides){
      const vertices=viewport.hits.filter(face=>face.partId===side.id).flatMap(face=>face.points);
      assert.equal(Math.min(...vertices.map(point=>point[1])),cabinet.y);
      assert.equal(Math.max(...vertices.map(point=>point[1])),cabinet.y+2200);
    }
    const bottomVertices=viewport.hits.filter(face=>face.partId===bottom.id).flatMap(face=>face.points);
    assert.equal(Math.min(...bottomVertices.map(point=>point[1])),cabinet.y+100);
    assert.equal(viewport.hits.filter(face=>face.component==='leg').length,0);
    const plinth=viewport.hits.filter(face=>face.component==='plinth');
    assert.ok(plinth.length>0);
    assert.ok(plinth.every(face=>face.points.every(point=>point[1]>=cabinet.y&&point[1]<cabinet.y+100)));
  });
  const sideDrawing = createPartSvg(sides[0],project,{language:'en'});
  assert.match(sideDrawing,/>2,199<\/text>/);
  assert.match(sideDrawing,/Finished size including edge bands: 616 \u00d7 2,200 mm|Finished size including edge bands: 617 \u00d7 2,200 mm/);
  assert.match(createDrawingSvg(project,'front',{cabinetId:cabinet.id,language:'en'}),/>2,200<\/text>/);
  assert.deepEqual(project,before);
  delete cabinet.sidesToFloor;
  const legacySides=generateParts(project).filter(part=>/^Боковина (левая|правая)$/.test(part.name));
  assert.ok(legacySides.every(part=>part.finishedHeight===2100&&part.position.y===0),'old projects retain their original raised carcass construction');
  const legacy=new FurnitureViewport(mockCanvas());
  try {legacy.setProject(project,cabinet.id);assert.ok(legacy.hits.some(face=>face.component==='leg'));} finally {legacy.destroy();}
});

test('built-in saved names print in the target language across all creation languages', () => {
  for (const creationLanguage of ['ru','tr','en']) {
    const project=createDefaultProject(creationLanguage), cabinet=project.cabinets[0], before=structuredClone(project);
    assert.equal(project.name,defaultName('defaultProject',creationLanguage));
    assert.equal(cabinet.name,defaultName('defaultCabinet',creationLanguage));
    for(const language of ['ru','tr','en']) {
      const cabinetName=defaultName('defaultCabinet',language), projectName=defaultName('defaultProject',language), sectionName=defaultName('upperSection',language);
      const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
      assert.ok(html.includes(`<title>${cabinetName} — `),`${creationLanguage} cabinet print title becomes ${language}`);
      assert.ok(html.includes(sectionName),`${creationLanguage} stored section becomes ${language}`);
      const prefix={ru:'Секция',tr:'Bölme',en:'Section'}[language];
      assert.ok(html.includes(`${prefix} 1 · ${sectionName} · `),'part schedules translate only the known section middle');
      const interior=createDrawingSvg(project,'interior',{cabinetId:cabinet.id,language});
      assert.ok(interior.includes(`<title>${cabinetName} — `));
      assert.ok(interior.includes(sectionName));
      assert.ok(createDrawingSvg(project,'front',{language}).includes(`<title>${projectName} — `));
      assert.ok(generateDrawingHTML(project,{language}).includes(`<title>${projectName} — `));
      const part=generateParts(project).find(part=>part.sectionId===getCabinetLayout(cabinet,project).sections[0].id);
      assert.ok(createPartSvg(part,project,{language}).includes(cabinetName));
      for(const material of project.materials) assert.equal(translateMaterialName(material.name,language),material.id==='thin-back-3'?defaultName('thinBack',language):localizeMaterialPreset(material,language).name);
    }
    assert.deepEqual(project,before,'printing never rewrites stored names or the creation language');
  }
  assert.equal(translatePartName('Секция 1 · Üst bölme · Дверь 1','ru'),'Секция 1 · Верхняя секция · Дверь 1');
  assert.equal(translatePrintText('Секция 1 · Üst bölme · Дверь 1','ru'),'Секция 1 · Верхняя секция · Дверь 1');
  assert.equal(translatePartName('Секция 1 · Üst bölme · Дверь 1','en'),'Section 1 · Upper section · Door 1');
  assert.equal(translateBuiltInName('Ortası çekmeceli dolap','en','cabinet'),defaultName('defaultCabinet','en'),'older exact Turkish aliases remain readable');
});

test('factory catalogue aliases localize precisely while custom lookalikes and custom title punctuation stay intact', () => {
  for(const preset of MATERIAL_PRESETS) {
    const aliases=[preset.name,...['ru','tr','en'].flatMap(sourceLanguage=>{
      const name=localizeMaterialPreset(preset,sourceLanguage).name;
      return [name,name.replace(/(?:мм|mm)$/,'мм'),name.replace(/(?:мм|mm)$/,'mm')];
    })];
    for(const language of ['ru','tr','en']) for(const alias of aliases) {
      const actual=translateMaterialName(alias,language);
      assert.equal(actual,localizeMaterialPreset(preset,language).name);
      assert.ok(actual.includes(preset.decorCode),'translation preserves the factory article');
    }
  }
  const project=createDefaultProject(), cabinet=project.cabinets[0];
  project.name='Новый проект · [для Валерии]';cabinet.name='Шкаф 1 для мастерской · копия';
  const sections=getCabinetLayout(cabinet,project).sections;
  sections[0].node.name='Верхняя секция · [для Валерии]';
  project.materials.find(material=>material.id===cabinet.materialId).name='Yıldız MDFLAM · Мой материал VT_068 · 18 мм';
  const before=structuredClone(project);
  for(const language of ['ru','tr','en']) {
    assert.equal(translateBuiltInName(project.name,language,'project'),project.name);
    assert.equal(translateBuiltInName(cabinet.name,language,'cabinet'),cabinet.name);
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.ok(html.includes(cabinet.name));
    assert.ok(html.includes(sections[0].node.name),'custom dots and brackets survive the production schedule');
    assert.ok(html.includes('Yıldız MDFLAM · Мой материал VT_068 · 18 мм'),'a factory-like user name is never changed by metadata or unit replacement');
    assert.ok(createDrawingSvg(project,'front',{language}).includes(project.name));
    assert.equal(translateMaterialName('Yıldız MDFLAM · Beyaz VT_068 · 18 mm · заказ',language),'Yıldız MDFLAM · Beyaz VT_068 · 18 mm · заказ');
  }
  assert.deepEqual(project,before);
});

test('generated cabinet copy suffixes translate only after an exactly recognized built-in base', () => {
  for(const language of ['ru','tr','en']) {
    const copy=defaultName('copy',language);
    for(const sourceLanguage of ['ru','tr','en']) {
      const base=defaultName('defaultCabinet',sourceLanguage);
      assert.equal(translateBuiltInName(`${base} · ${defaultName('copy',sourceLanguage)}`,language,'cabinet'),`${defaultName('defaultCabinet',language)} · ${copy}`);
      assert.equal(translateBuiltInName(`${base} · копия · copy`,language,'cabinet'),`${defaultName('defaultCabinet',language)} · ${copy} · ${copy}`);
      assert.equal(translateBuiltInName(`${defaultName('cabinet',sourceLanguage,12)} · kopya`,language,'cabinet'),`${defaultName('cabinet',language,12)} · ${copy}`);
    }
    for(const custom of ['Мой шкаф · копия','Cabinet 2 for the workshop · copy','Dolap 3 · kopya [customer]']) assert.equal(translateBuiltInName(custom,language,'cabinet'),custom);
    assert.equal(translateBuiltInName('Шкаф 12',language,'project'),'Шкаф 12','name categories prevent an unrelated project title from being renamed');
  }
  const sample=createLaundryExample('tr'), cabinet=sample.cabinets[0];
  for(const language of ['ru','en']) {
    const html=generateDrawingHTML(sample,{cabinetId:cabinet.id,language});
    const beforeName=cabinet.name;
    assert.ok(html.includes(translateBuiltInName(beforeName,language,'cabinet')));
    for(const section of getCabinetLayout(cabinet,sample).sections) assert.ok(html.includes(translateBuiltInName(section.node.name,language,'section')));
    assert.ok(html.includes(defaultName('washer',language)));
    assert.doesNotMatch(html,/Cihaz nişi ve yan dolaplar|Sol dolap|Zemindeki cihaz/);
  }
});

test('3D print capture renders only the selected cabinet at real export resolution without changing the live camera or canvas', () => {
  const project=createDefaultProject(), cabinet=project.cabinets[0];
  project.cabinets.push({...structuredClone(cabinet),id:'neighbour',x:cabinet.x+1500});
  const canvas=mockCanvas(), viewport=new FurnitureViewport(canvas), captures=[], texts=[];
  viewport.setProject(project,cabinet.id);
  viewport.yaw=.43;viewport.elevation=.29;viewport.zoom=1.25;viewport.pan={x:17,y:-12};
  viewport.setOptions({room:true,doorsOpen:true,dimensions:false,selectedSectionId:'row-top'});
  const before={project:structuredClone(project),options:structuredClone(viewport.options),yaw:viewport.yaw,elevation:viewport.elevation,zoom:viewport.zoom,pan:{...viewport.pan},camera:viewport.camera,depthFrame:viewport.depthFrame,hits:viewport.hits,width:canvas.width,height:canvas.height};
  const factory=()=>{
    const context=new Proxy({
      createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),putImageData(){},
      measureText:text=>({width:String(text).length*6}),fillText:text=>texts.push(String(text))
    },{get:(target,key)=>key in target?target[key]:()=>{}});
    return {width:0,height:0,getContext:()=>context,toDataURL:()=> 'data:image/png;base64,aW1hZ2U='};
  };
  const originalDraw=FurnitureViewport.prototype.drawDepthFurniture;
  FurnitureViewport.prototype.drawDepthFurniture=function(items,scale){const result=originalDraw.call(this,items,scale);captures.push({ids:this.project.cabinets.map(c=>c.id),options:{...this.options},frame:this.depthFrame,faces:this.hits});return result;};
  try {
    const snapshot=viewport.captureCabinet3D({language:'en',canvasFactory:factory});
    assert.equal(snapshot.width,2400);
    assert.equal(snapshot.height,Math.round(2400*700/900));
    assert.deepEqual(snapshot.camera,{yaw:.43,elevation:.29,zoom:1.25,pan:{x:17,y:-12}});
    assert.equal(snapshot.doorsOpen,true);
    assert.equal(snapshot.cabinetId,cabinet.id);
    assert.equal(captures.length,1);
    const capture=captures[0];
    assert.deepEqual(capture.ids,[cabinet.id]);
    assert.equal(capture.options.room,false);
    assert.equal(capture.options.hud,false);
    assert.equal(capture.options.selection,false);
    assert.equal(capture.options.selectedSectionId,null);
    assert.equal(capture.frame.width,2400,'the depth buffer is rendered at export pixels instead of upscaling the screen buffer');
    assert.ok(capture.faces.length>40);
    assert.ok(capture.faces.every(face=>face.id===cabinet.id));
    assert.ok(capture.faces.some(face=>face.component==='front'&&face.points.some(point=>point[2]>cabinet.z+cabinet.depth+100)),'open fronts remain physically open in the capture');
    assert.deepEqual(texts,[],'the image contains no compass, scale HUD or selection text');
    const html=generateCabinet3DHTML(project,{...snapshot,language:'en'});
    assert.equal((html.match(/<section /g)||[]).length,1);
    assert.match(html,/@page\{size:A4 landscape;margin:0\}/);
    assert.match(html,/Cabinet 3D view/);
    assert.match(html,/Fronts open/);
    assert.match(html,/data-camera-yaw="0.43"/);
    assert.ok(html.includes(snapshot.imageDataUrl));
    assert.doesNotMatch(html,/toolbar|<button|<canvas|<script|neighbour/);
    assert.deepEqual(project,before.project);
    assert.deepEqual(viewport.options,before.options);
    assert.deepEqual(viewport.pan,before.pan);
    for(const key of ['yaw','elevation','zoom','camera','depthFrame','hits'])assert.equal(viewport[key],before[key]);
    assert.equal(canvas.width,before.width);assert.equal(canvas.height,before.height);
  } finally {FurnitureViewport.prototype.drawDepthFurniture=originalDraw;viewport.destroy();}
});

test('single 3D print sheet localizes exact built-in titles and rejects non-image inputs while escaping custom titles', () => {
  const project=createDefaultProject(), cabinet=project.cabinets[0], imageDataUrl='data:image/png;base64,aW1hZ2U=';
  const ru=generateCabinet3DHTML(project,{cabinetId:cabinet.id,imageDataUrl,language:'ru'});
  assert.ok(ru.includes(defaultName('defaultCabinet','ru')));
  assert.match(ru,/Фасады закрыты/);
  const tr=generateCabinet3DHTML(project,{cabinetId:cabinet.id,imageDataUrl});
  assert.match(tr,/<html lang="tr">/);assert.match(tr,/Dolabın 3B görünümü/);
  assert.doesNotMatch(tr,/[А-Яа-яЁё]/);
  cabinet.name='<script>мой шкаф</script> & деталь';
  const en=generateCabinet3DHTML(project,{cabinetId:cabinet.id,imageDataUrl,language:'en'});
  assert.ok(en.includes('&lt;script&gt;мой шкаф&lt;/script&gt; &amp; деталь'));
  assert.doesNotMatch(en,/<script>/);
  for(const invalid of ['https://example.com/view.png','data:image/svg+xml;base64,aW1hZ2U=','data:text/html;base64,aW1hZ2U=','data:image/png;base64,aW1hZ2U=" onerror="alert(1)']) assert.throws(()=>generateCabinet3DHTML(project,{cabinetId:cabinet.id,imageDataUrl:invalid,language:'en'}),/Could not create/);
  assert.throws(()=>generateCabinet3DHTML(project,{cabinetId:'missing',imageDataUrl,language:'en'}),/Select a cabinet/);
});

test('front and construction drawings distinguish real panel-centre mounting heights from clear opening heights', () => {
  const project=createDefaultProject(), cabinet=project.cabinets[0];
  cabinet.y=325;
  const before=structuredClone(project), middle=getSectionMountingAxes(cabinet,project).find(axis=>axis.id==='section-middle');
  assert.deepEqual([middle.bottom,middle.top,middle.height,middle.openingHeight],[775,1273,498,480]);
  for(const view of ['front','interior']) {
    const svg=drawingPages(project,view,{cabinetId:cabinet.id,language:'en'});
    assert.match(svg,/data-section-axis="section-middle" data-axis-bottom-mm="775" data-axis-top-mm="1273" data-axis-height-mm="498"/);
    assert.match(svg,/>A=498<\/text>/);
    assert.match(svg,/A = Between fixing centers, mm/);
    assert.doesNotMatch(svg,/NaN|undefined|Infinity/);
    if(view==='interior')assert.match(svg,/Opening 1,164 × 480 mm/);
    const compact=createDrawingSvg(project,view,{cabinetId:cabinet.id,language:'en',compact:true});
    assert.match(compact,/>A=498<\/text>/);
    assert.match(compact,/data-min-font="14"/);
  }
  for(const [language,label] of [['ru','Между осями крепления, мм'],['tr','Bağlantı eksenleri arası, mm'],['en','Between fixing centers, mm']]) {
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language}).replace(/[\u00a0\u202f]/g,' ');
    assert.ok(html.includes(`<th>${label}</th>`));
    assert.ok(html.includes(`<td>${printNumber(1164,language).replace(/[\u00a0\u202f]/g,' ')} × 480</td><td>498</td>`),'clear opening and centre-to-centre height are separate adjacent schedule values');
  }
  assert.deepEqual(project,before);
});

test('floor portals display a missing lower fixing axis instead of zero height or an invented floor screw line', () => {
  const project=createLaundryExample(), cabinet=project.cabinets[0];
  const floorAxis=getSectionMountingAxes(cabinet,project).find(axis=>axis.id==='laundry-floor');
  assert.equal(floorAxis.bottom,null);assert.equal(floorAxis.height,null);
  for(const view of ['front','interior']) {
    const svg=createDrawingSvg(project,view,{cabinetId:cabinet.id,language:'en'});
    const missing=/<g data-section-axis="laundry-floor" data-axis-bottom-mm="missing" data-axis-top-mm="1495" data-axis-height-mm="missing">([\s\S]*?)<\/g>/.exec(svg);
    assert.ok(missing);
    assert.match(missing[1],/<title>S4 A—<\/title>/);
    assert.doesNotMatch(missing[1],/<path|A0</,'an absent lower plate cannot produce a mounting dimension or endpoint');
    if(view==='interior')assert.match(drawingPages(project,view,{cabinetId:cabinet.id,language:'en'}),/No lower fixing axis/);
  }
  const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'en'});
  assert.match(html,/<td>928 × 1,486<\/td><td>—<\/td>/);
  assert.match(html,/No bottom panel — no lower fixing axis/);
});

test('left, right and upward doors rotate about the requested physical edge and preserve all manufacturing panels', () => {
  const project=createDefaultProject(), cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:800,height:1000,depth:600,layout:{id:'direction-door',kind:'section',front:'doors',doors:1,shelves:0,doorOpenings:['left']}});
  const manufacturing=generateParts(project);
  for(const opening of ['left','right','up']) {
    const angle=opening==='up'?Math.PI*.44:Math.PI/2, cos=Math.cos(angle), sin=Math.sin(angle);
    cabinet.layout.doorOpenings=[opening];
    const front=getFrontLayout(cabinet,project)[0], fx=cabinet.x+front.x, fy=cabinet.y+cabinet.plinth+front.y, fz=cabinet.z+cabinet.depth, fw=front.width, fh=front.height;
    withSoftwareViewport(project,viewport=>{
      viewport.setOptions({focusCabinet:true,room:false,doorsOpen:false});
      const closed=viewport.hits.filter(face=>face.component==='front').flatMap(face=>face.points), handle=viewport.hits.filter(face=>face.component==='door-handle').flatMap(face=>face.points);
      assert.ok(viewport.hits.filter(face=>face.component==='front').every(face=>face.doorOpening===opening&&face.frontIndex===0));
      assert.equal(Math.min(...closed.map(p=>p[0])),fx);assert.equal(Math.max(...closed.map(p=>p[0])),fx+fw);
      assert.equal(Math.min(...closed.map(p=>p[1])),fy);assert.equal(Math.max(...closed.map(p=>p[1])),fy+fh);
      if(opening==='up') {
        assert.equal(Math.min(...handle.map(p=>p[1])),fy+26);
        assert.ok(Math.max(...handle.map(p=>p[0]))-Math.min(...handle.map(p=>p[0]))>100,'lift doors have a horizontal handle along the bottom');
      } else {
        assert.equal(Math.min(...handle.map(p=>p[0])),opening==='right'?fx+26:fx+fw-34);
        assert.ok(Math.max(...handle.map(p=>p[1]))-Math.min(...handle.map(p=>p[1]))>100);
      }
      viewport.setOptions({doorsOpen:true});
      const points=viewport.hits.filter(face=>face.component==='front').flatMap(face=>face.points), near=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} differs from ${b}`);
      const contains=p=>points.some(point=>point.every((value,index)=>Math.abs(value-p[index])<.00001));
      if(opening==='up') {
        assert.ok(contains([fx,fy+fh,fz])&&contains([fx+fw,fy+fh,fz]),'the entire top hinge edge stays fixed');
        near(Math.min(...points.map(p=>p[1])),fy+fh-fh*cos);
        near(Math.max(...points.map(p=>p[2])),fz+fh*sin+18*cos);
      } else {
        const hinge=opening==='right'?fx+fw:fx;
        assert.ok(contains([hinge,fy,fz])&&contains([hinge,fy+fh,fz]),'the requested vertical hinge edge stays fixed');
        const free=opening==='right'?hinge-fw*cos:hinge+fw*cos;
        assert.ok(contains([free,fy,fz+fw*sin]));
        near(Math.max(...points.map(p=>p[2])),fz+fw*sin+18*cos,'front thickness remains on the external face for either hinge side');
      }
    });
    assert.deepEqual(generateParts(project),manufacturing,'swing directions do not alter cut panels, quantities or edge-band dimensions');
  }
});

test('front and interior CAD symbols and print schedules use the configured hinge direction in all print languages', () => {
  const project=createDefaultProject(), cabinet=project.cabinets[0];
  cabinet.layout={id:'three-doors',kind:'section',front:'doors',doors:3,shelves:0,doorOpenings:['left','right','up']};
  for(const [language,heading,directions] of [['ru','Направление открытия',['Влево','Вправо','Вверх']],['tr','Açılma yönü',['Sola','Sağa','Yukarı']],['en','Opening direction',['To the left','To the right','Upwards']]]) {
    for(const view of ['front','interior']) {
      const svg=createDrawingSvg(project,view,{cabinetId:cabinet.id,language});
      for(const [index,opening] of ['left','right','up'].entries())assert.ok(svg.includes(`data-opening-symbol="true" data-door-opening="${opening}" data-front-index="${index+1}"`));
      assert.match(svg,/stroke-dasharray="6 4"/);
      assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
    }
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.ok(html.includes(`<th>${heading}</th>`));
    directions.forEach(direction=>assert.ok(html.includes(`<td>${direction}</td>`)));
  }
  delete cabinet.layout.doorOpenings;
  assert.deepEqual(getFrontLayout(cabinet,project).map(front=>front.opening),['left','right','left'],'legacy automatic pair directions remain intact');
});

test('actual internal drawer parts stay behind closed doors and slide together only under the separate open-internals option', () => {
  const project=createDefaultProject(), cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:900,height:860,depth:580,backThickness:8,backMaterialId:'hdf-back',layout:{id:'inner-section',kind:'section',front:'doors',doors:2,shelves:0,internalDrawerCount:2,openingMechanism:'handle'}});
  const drawers=getInternalDrawerLayout(cabinet,project), parts=generateParts(project), internalParts=parts.filter(part=>part.internalDrawerIndex!==undefined);
  assert.equal(internalParts.length,12);
  assert.deepEqual([drawers[0].depth,drawers[0].box.depth,drawers[0].handleProjection],[536,496,16]);
  withSoftwareViewport(project,viewport=>{
    viewport.setView('front');viewport.setOptions({focusCabinet:true,room:false,dimensions:false,selection:false,doorsOpen:false,internalDrawersOpen:true});
    const bounds=part=>{
      const points=viewport.hits.filter(face=>face.partId===part.id).flatMap(face=>face.points);
      assert.ok(points.length);
      return {x:Math.min(...points.map(point=>point[0])),y:Math.min(...points.map(point=>point[1])),z:Math.min(...points.map(point=>point[2]))};
    };
    const stored=new Map(internalParts.map(part=>[part.id,bounds(part)]));
    const front=drawers[0], world=[cabinet.x+front.x+front.width*.25,cabinet.y+cabinet.plinth+front.y+front.height*.5,cabinet.z+8+front.depth+front.frontThickness];
    const pixel=()=>{const p=viewport.camera.project(world),f=viewport.depthFrame,index=Math.floor(p[1]*f.scale)*f.width+Math.floor(p[0]*f.scale);return [...f.pixels.slice(index*4,index*4+4)];};
    assert.deepEqual(pixel(),[180,140,100,255],'the closed oak door physically masks the internal white front');
    const handles=viewport.hits.filter(face=>face.component==='internal-drawer-handle').flatMap(face=>face.points);
    assert.ok(handles.length>0);
    assert.ok(Math.max(...handles.map(point=>point[2]))<=cabinet.z+cabinet.depth-2,'internal handles fit behind the closed door with the specified gap');
    viewport.setOptions({doorsOpen:true,internalDrawersOpen:false});
    assert.deepEqual(pixel(),[228,228,224,255],'opening the outer doors reveals the actual internal front');
    for(const part of internalParts)assert.deepEqual(bounds(part),stored.get(part.id));
    viewport.setOptions({internalDrawersOpen:true});
    for(const part of internalParts){
      const actual=bounds(part),before=stored.get(part.id),drawer=drawers.find(drawer=>drawer.index===part.internalDrawerIndex);
      assert.equal(actual.x,before.x);assert.equal(actual.y,before.y);
      assert.ok(Math.abs(actual.z-before.z-Math.min(drawer.box.depth*.48,260))<.00001,'front, bottom and every side translate by the same drawer stroke');
    }
    viewport.setOptions({doorsOpen:false});
    for(const part of internalParts)assert.deepEqual(bounds(part),stored.get(part.id),'closing outer doors always stores the internal boxes');
  });
});

test('push-to-open removes handles while internal print fronts remain distinct from the outer door schedule', () => {
  const project=createDefaultProject(),cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:900,height:860,depth:580,layout:{id:'push-inner',kind:'section',name:'Мои скрытые ящики',front:'doors',doors:2,shelves:0,internalDrawerCount:2,openingMechanism:'push'}});
  withSoftwareViewport(project,viewport=>{
    viewport.setOptions({focusCabinet:true,room:false,doorsOpen:false});
    assert.equal(viewport.hits.filter(face=>face.handle).length,0,'neither external nor internal push fronts acquire a fabricated handle');
    viewport.setOptions({doorsOpen:true,internalDrawersOpen:true});
    assert.equal(viewport.hits.filter(face=>face.handle).length,0);
    assert.ok(viewport.hits.some(face=>face.component==='internal-drawer-front'));
  });
  assert.equal(getFrontLayout(cabinet,project).length,2,'outer facades include only the two doors');
  assert.deepEqual(getInternalDrawerLayout(cabinet,project).map(drawer=>drawer.width),[820,820]);
  const svg=createDrawingSvg(project,'interior',{cabinetId:cabinet.id,language:'en'});
  assert.match(svg,/data-internal-front="1"/);assert.match(svg,/Internal drawer front/);
  const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'en'});
  assert.match(html,/<th>Opening mechanism<\/th>/);assert.match(html,/<td>Push-to-open<\/td>/);
  assert.match(html,/>I1<\/td>/);assert.match(html,/>F1<\/td>/);assert.doesNotMatch(html,/>F3<\/td>/);
  assert.ok(html.includes('Мои скрытые ящики'));
  assert.match(html,/Internal drawer 1 · front/);
  assert.equal(translatePartName('Секция 1 · Мои скрытые ящики · Внутренний ящик 1 · фасад','tr'),'Bölme 1 · Мои скрытые ящики · İç çekmece 1 · ön panel');
  const print=generateCabinet3DHTML(project,{cabinetId:cabinet.id,imageDataUrl:'data:image/png;base64,aW1hZ2U=',language:'en',doorsOpen:true,internalDrawersOpen:true});
  assert.match(print,/Internal drawers extended/);
  cabinet.layout={id:'push-outer-drawers',kind:'section',front:'drawers',drawers:2,shelves:0,openingMechanism:'push'};
  withSoftwareViewport(project,viewport=>{viewport.setOptions({doorsOpen:false});assert.equal(viewport.hits.filter(face=>face.handle).length,0);});
});

test('production printing reports each real edge-band length and grouped material totals without changing finished geometry', () => {
  const project=createDefaultProject(),cabinet=project.cabinets[0],parts=generateParts(project),summary=getEdgeBandingSummary(parts);
  const before=structuredClone(project), sides=parts.filter(part=>/^Боковина/.test(part.name));
  assert.equal(getPartEdgeBanding(sides[0]).lengthMeters,2.817);
  assert.equal(summary.lengthMeters,35.102);
  const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'en'});
  assert.match(html,/<th>Edge band length, m<\/th>/);
  assert.ok(html.includes(`Total edge band: ${printNumber(summary.lengthMeters,'en')} m`));
  for(const group of summary.groups){
    const material=translateMaterialName(project.materials.find(material=>material.id===group.materialId).name,'en');
    assert.ok(html.includes(`<td>${material}</td><td>${group.thickness}</td><td>${group.partCount}</td><td>${printNumber(group.lengthMeters,'en')}</td>`));
  }
  assert.deepEqual(project,before);
  project.settings.deductEdge=true;
  const deducted=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'en'});
  assert.ok(deducted.includes(`Total edge band: ${printNumber(summary.lengthMeters,'en')} m`),'deducting cutting blanks does not shorten band lengths based on finished outlines');
  const tr=generateDrawingHTML(project,{cabinetId:cabinet.id,language:'tr'});
  assert.match(tr,/Toplam kenar bandı: 35,102 m/);
  assert.match(tr,/Toplam kenar bandı:/);
  const cutting=[...tr.matchAll(/<section class="sheet schedule parts-schedule"[\s\S]*?<\/section>/g)].map(match=>match[0]).join('');
  assert.equal((cutting.match(/<td>P\d+<\/td>/g)||[]).length,parts.length,'pagination retains every real cutting panel');
});

function sectionBaseProject(globalPlinth=100) {
  const project=createDefaultProject('ru'), cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:1800,height:2200,depth:620,plinth:globalPlinth,backThickness:8,backMaterialId:'hdf-back',includeBack:false,sidesToFloor:false,rearBraces:[]});
  cabinet.layout={id:'local-bases',kind:'split',axis:'vertical',sizes:[1,1,1],children:[
    {id:'floor',kind:'section',front:'open',shelves:0,floor:'open',back:'none',appliance:{type:'washer',label:'500 mm machine',width:500,height:850,depth:500}},
    {id:'zero',kind:'section',front:'doors',doors:1,shelves:0,plinthHeight:0,back:'solid'},
    {id:'raised',kind:'section',front:'doors',doors:1,shelves:0,plinthHeight:180,back:'braces',rearBraces:[{id:'local-low',y:40,height:100}]},
  ]};
  return project;
}

test('section bases render the real zero and raised bottoms and leave the floor portal free of fabricated support',()=>{
  for(const globalPlinth of [0,100]){
    const project=sectionBaseProject(globalPlinth),cabinet=project.cabinets[0],layout=getCabinetLayout(cabinet,project),parts=generateParts(project);
    const floor=layout.sections.find(section=>section.id==='floor'),zero=layout.sections.find(section=>section.id==='zero'),raised=layout.sections.find(section=>section.id==='raised');
    assert.equal(cabinet.plinth+floor.y,0);
    assert.equal(cabinet.plinth+zero.y,18);
    assert.equal(cabinet.plinth+raised.y,198);
    withSoftwareViewport(project,viewport=>{
      viewport.setOptions({focusCabinet:true,room:false,interior:true});viewport.setView('front');
      for(const part of parts.filter(part=>['bottom','plinth','section-back','brace'].includes(part.component))){
        const faces=viewport.hits.filter(face=>face.partId===part.id),points=faces.flatMap(face=>face.points);
        assert.ok(points.length,`${part.name} is drawn from the actual cutting panel`);
        assert.equal(Math.min(...points.map(point=>point[1])),cabinet.y+cabinet.plinth+part.position.y);
        assert.equal(Math.max(...points.map(point=>point[1])),cabinet.y+cabinet.plinth+part.position.y+(part.orientation==='horizontal'?part.thickness:part.finishedHeight));
      }
      assert.equal(viewport.hits.filter(face=>face.component==='leg').length,0,'local bases do not receive uniform-height visual feet');
      const appliance=viewport.hits.filter(face=>face.component==='appliance').flatMap(face=>face.points);
      assert.equal(Math.min(...appliance.map(point=>point[1])),cabinet.y);
      const pixel=viewport.camera.project([cabinet.x+floor.x+5,cabinet.y+50,cabinet.z+cabinet.depth]),frame=viewport.depthFrame,index=Math.floor(pixel[1]*frame.scale)*frame.width+Math.floor(pixel[0]*frame.scale);
      assert.equal(frame.owners[index],0,'no full-width fallback plinth or bottom crosses the floor portal');
    });
    const fronts=getFrontLayout(cabinet,project);
    assert.equal(cabinet.plinth+fronts.find(front=>front.sectionId==='zero').y,2);
    assert.equal(cabinet.plinth+fronts.find(front=>front.sectionId==='raised').y,182);
  }
  const project=sectionBaseProject(),cabinet=project.cabinets[0];
  cabinet.layout.children.forEach(node=>{node.front='open';node.plinthHeight=0;node.back='none';delete node.rearBraces;delete node.appliance;delete node.floor;});
  assert.equal(generateParts(project).filter(part=>part.component==='plinth').length,0);
  withSoftwareViewport(project,viewport=>assert.equal(viewport.hits.filter(face=>face.component==='plinth'||face.component==='leg').length,0,'all zero section bases intentionally omit the global plinth'));
});

test('local rear braces and base dimensions print accurate section and cabinet references in all three languages',()=>{
  const project=sectionBaseProject(),cabinet=project.cabinets[0],before=structuredClone(project);
  const brace=generateParts(project).find(part=>part.braceId==='local-low');
  assert.equal(cabinet.plinth+brace.position.y,238);
  assert.equal(brace.position.y-brace.braceBaseY,40);
  for(const language of ['ru','tr','en']){
    const back=createDrawingSvg(project,'back',{cabinetId:cabinet.id,language});
    assert.match(back,/data-brace-id="local-low" data-section-id="raised" data-mount-cabinet-mm="238" data-mount-section-mm="40"/);
    assert.ok(back.includes(translatePrintText('Низ от основания секции:',language)));
    const front=createDrawingSvg(project,'front',{cabinetId:cabinet.id,language});
    assert.match(front,/data-local-plinth="raised" data-plinth-height-mm="180"/);
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.ok(html.includes(translatePrintText('Высота цоколя, мм',language)));
    assert.ok(html.includes(translatePrintText('Низ проёма от основания, мм',language)));
    assert.ok(html.includes(translatePrintText('Низ от основания секции, мм',language)));
    assert.ok(html.includes('<td>S3</td><td>40</td>'));
    assert.ok(html.includes(translatePartName(brace.name,language)));
    if(language!=='ru')assert.equal((html.match(/[А-Яа-яЁё][^<>]*/g)||[]).join('\n'),'','all generated construction labels translate, including lower-case local brace names');
  }
  assert.deepEqual(project,before,'drawing language and dimensions never alter stored section configuration');
});

test('the whole back overrides all local rear choices and remains the only rear panel in the renderer',()=>{
  const project=sectionBaseProject(),cabinet=project.cabinets[0];cabinet.includeBack=true;
  const layout=getCabinetLayout(cabinet,project),parts=generateParts(project);
  assert.ok(layout.sections.every(section=>section.backMode==='global'));
  assert.equal(parts.filter(part=>part.component==='brace'||part.component==='section-back').length,0);
  const back=parts.find(part=>part.component==='back');
  withSoftwareViewport(project,viewport=>{
    viewport.setOptions({room:false,focusCabinet:true});viewport.setView('back');
    assert.ok(viewport.hits.some(face=>face.partId===back.id&&face.component==='back'));
    assert.equal(viewport.hits.filter(face=>face.component==='brace'||face.component==='section-back').length,0);
  });
});

test('the thin back preset localizes only its exact generated aliases',()=>{
  const aliases={ru:'Тонкий задник · 3 мм',tr:'Arkalık levhası · 3 mm',en:'Thin back panel · 3 mm'};
  for(const source of Object.values(aliases))for(const language of Object.keys(aliases))assert.equal(translateMaterialName(source,language),aliases[language]);
  assert.equal(translateMaterialName('Thin back panel · my workshop · 3 mm','tr'),'Thin back panel · my workshop · 3 mm');
});

test('independent inner rows share unchanged outer doors and render actual internal partitions, fronts and shelf strokes',()=>{
  const project=createDefaultProject('ru'),cabinet=project.cabinets[0];
  Object.assign(cabinet,{width:900,height:1200,depth:580,backThickness:8,backMaterialId:'hdf-back',layout:{id:'outer',kind:'section',front:'doors',doors:2,shelves:0,internalDrawerCount:7,interiorLayout:{id:'inner-rows',kind:'split',axis:'horizontal',sizes:[1,1],children:[
    {id:'shelf-row',kind:'section',front:'open',shelves:0,depth:340,pullOutShelf:true},
    {id:'drawer-row',kind:'section',front:'drawers',drawers:2,shelves:0,depth:560,openingMechanism:'push'},
  ]}}});
  const original=structuredClone(project),layout=getCabinetLayout(cabinet,project),parts=generateParts(project),drawers=getInternalDrawerLayout(cabinet,project),fronts=getFrontLayout(cabinet,project);
  assert.equal(fronts.length,2);assert.ok(fronts.every(front=>front.kind==='door'&&front.sectionId==='outer'));
  assert.equal(drawers.length,2,'explicit interior rows replace the old outer internalDrawerCount');assert.ok(drawers.every(drawer=>drawer.sectionId==='outer'&&drawer.interiorSectionId==='drawer-row'));
  const innerParts=parts.filter(part=>part.interiorSectionId),shelf=innerParts.find(part=>part.component==='pull-out-shelf');
  assert.ok(innerParts.some(part=>part.component==='interior-partition'));
  withSoftwareViewport(project,viewport=>{
    viewport.setView('front');viewport.setOptions({room:false,focusCabinet:true,doorsOpen:false,internalDrawersOpen:true,selection:false,dimensions:false});
    const minZ=part=>Math.min(...viewport.hits.filter(face=>face.partId===part.id).flatMap(face=>face.points.map(point=>point[2])));
    const stored=new Map(innerParts.map(part=>[part.id,minZ(part)]));
    const front=drawers[0],pixel=viewport.camera.project([cabinet.x+front.x+front.width*.25,cabinet.y+cabinet.plinth+front.y+front.height/2,cabinet.z+8+front.depth+front.frontThickness]),frame=viewport.depthFrame,index=Math.floor(pixel[1]*frame.scale)*frame.width+Math.floor(pixel[0]*frame.scale);
    assert.deepEqual([...frame.pixels.slice(index*4,index*4+4)],[180,140,100,255],'one common closed door masks the independently arranged internal drawers');
    viewport.setOptions({doorsOpen:true,internalDrawersOpen:false});
    const shelfSection=layout.internalSections.find(section=>section.id==='shelf-row');
    assert.ok(Math.abs(minZ(shelf)-stored.get(shelf.id)-Math.min(shelfSection.usableDepth*.48,260))<.001,'the pull-out shelf stroke uses its own inset row depth');
    for(const part of innerParts.filter(part=>part.component.startsWith('internal-drawer')))assert.equal(minZ(part),stored.get(part.id));
    viewport.setOptions({internalDrawersOpen:true});
    for(const part of innerParts.filter(part=>part.component.startsWith('internal-drawer'))){const drawer=drawers.find(drawer=>drawer.index===part.internalDrawerIndex);assert.ok(Math.abs(minZ(part)-stored.get(part.id)-Math.min(drawer.box.depth*.48,260))<.001);}
  });
  for(const language of ['ru','tr','en']){
    const svg=createDrawingSvg(project,'interior',{cabinetId:cabinet.id,language});
    assert.match(svg,/data-interior-section="shelf-row" data-parent-section-id="outer" data-section-mark="S1.1"/);
    assert.match(svg,/data-interior-section="drawer-row" data-parent-section-id="outer" data-section-mark="S1.2"/);
    assert.match(svg,/data-component="interior-partition"/);assert.match(svg,/data-section-axis="drawer-row"/);
    const html=generateDrawingHTML(project,{cabinetId:cabinet.id,language});
    assert.match(html,/data-schedule-kind="interior-openings"/);assert.ok(html.includes('<td>I1</td><td>S1.2</td>'));assert.doesNotMatch(html,/>F3<\/td>/);
    if(language!=='ru')assert.equal((html.match(/[А-Яа-яЁё][^<>]*/g)||[]).join('\n'),'','the interior partition and compartment prefixes translate completely');
  }
  assert.deepEqual(project,original);
});
