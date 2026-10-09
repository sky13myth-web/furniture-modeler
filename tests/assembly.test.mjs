import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, generateParts, getCabinetLayout, getFrontLayout, getExternalDrawerLayout, getInternalDrawerLayout, getPartEdgeBanding, validateProject } from '../src/engine.js';
import { polygonsOverlap } from '../src/room-geometry.js';
import { getProjectHardwareSchedule } from '../src/hardware.js';
import { getProjectCostEstimate } from '../src/pricing.js';
import { constrainCabinetEdit } from '../src/appliance-constraints.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .002, `${actual} != ${expected}`);
function fixture(overrides = {}) {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 860, depth: 580, plinth: 100, sidesToFloor: true,
    layout: { ...createSection('doors'), id: 'opening', doors: 2 }, ...overrides });
  return { project, cabinet };
}
function bounds(part) {
  const p = part.position;
  return { x: p.x, y: p.y, z: p.z,
    width: part.orientation === 'vertical-depth' ? part.thickness : part.finishedWidth,
    height: part.orientation === 'horizontal' ? part.thickness : part.finishedHeight,
    depth: part.orientation === 'vertical-depth' ? part.finishedWidth : part.orientation === 'horizontal' ? part.finishedHeight : part.thickness };
}
function plan(part) {
  const b = bounds(part);
  if (part.orientation === 'horizontal' && part.finishedOutline) return part.finishedOutline.map(p => ({ x: b.x + p.x, z: b.z + p.y }));
  return [{ x: b.x, z: b.z }, { x: b.x + b.width, z: b.z }, { x: b.x + b.width, z: b.z + b.depth }, { x: b.x, z: b.z + b.depth }];
}
function overlaps(a, b) {
  const x = bounds(a), y = bounds(b);
  return Math.min(x.y + x.height, y.y + y.height) - Math.max(x.y, y.y) > .002 && polygonsOverlap(plan(a), plan(b));
}
function assertAssembly(parts) {
  const positioned = parts.filter(p => p.position && p.orientation);
  for (let i = 0; i < positioned.length; i++) for (let j = i + 1; j < positioned.length; j++) {
    assert.equal(overlaps(positioned[i], positioned[j]), false, `${positioned[i].name} overlaps ${positioned[j].name}`);
  }
}

test('an inset plinth fits between floor-length sides, while an unsupported tall divider does not split it', () => {
  const { project, cabinet } = fixture();
  let parts = generateParts(project), plinth = parts.find(p => p.role === 'plinth');
  assert.deepEqual([plinth.position.x, plinth.finishedWidth, plinth.finishedHeight], [18, 864, 90]);
  assert.deepEqual([plinth.width, plinth.height], [864, 89]);
  assert.deepEqual([plinth.edges.left, plinth.edges.right, getPartEdgeBanding(plinth).lengthMm], [0, 0, 864]);
  assertAssembly(parts);
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection('doors'), id: 'left' }, { ...createSection('doors'), id: 'right' }
  ] };
  parts = generateParts(project);
  assert.equal(parts.filter(p => p.role === 'plinth').length, 1);
  assert.equal(parts.find(p => p.role === 'plinth').finishedWidth, 864);
  assertAssembly(parts);
});

test('local raised plinths fit real floor dividers and low neighbouring bottoms in either column order', () => {
  for (const portalOnLeft of [true, false]) {
    const { project, cabinet } = fixture({ width: 1218, height: 2400, depth: 700, plinth: 0 });
    const portal = { ...createSection('open'), id: 'portal', floor: 'open' };
    const raised = { ...createSection('doors'), id: 'raised', plinthHeight: 100 };
    cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: portalOnLeft ? [portal, raised] : [raised, portal] };
    const opening = getCabinetLayout(cabinet, project).sections.find(s => s.id === 'raised');
    const parts = generateParts(project), plinth = parts.find(p => p.role === 'plinth');
    near(plinth.position.x, opening.x); near(plinth.finishedWidth, opening.width);
    assertAssembly(parts);
    const low = portalOnLeft ? cabinet.layout.children[0] : cabinet.layout.children[1];
    low.floor = 'inherit'; low.plinthHeight = 0;
    assertAssembly(generateParts(project));
  }
});

test('reduced-depth fronts are inset within real panels, full-depth overlays stay unchanged and cutting bands reconstruct either front', () => {
  for (const front of ['doors', 'drawers']) {
    const { project, cabinet } = fixture();
    Object.assign(cabinet.layout, { front, depth: 400 });
    const section = getCabinetLayout(cabinet, project).sections[0], fronts = getFrontLayout(cabinet, project);
    assert.equal(section.frontMount, 'inset');
    assert.deepEqual([section.frontX, section.frontY, section.frontWidth, section.frontHeight], [20, 20, 860, 720]);
    const parts = generateParts(project);
    assertAssembly(parts);
    for (const facade of parts.filter(p => /(?:Дверь \d+|Фасад ящика \d+)$/.test(p.name))) {
      assert.equal(facade.width + facade.edges.left + facade.edges.right, facade.finishedWidth);
      assert.equal(facade.height + facade.edges.top + facade.edges.bottom, facade.finishedHeight);
      near(facade.position.z, 403);
    }
    assert.equal(fronts.every(f => f.frontMount === 'inset'), true);
    cabinet.layout.depth = null;
    const overlay = getCabinetLayout(cabinet, project).sections[0];
    assert.deepEqual([overlay.frontMount, overlay.frontX, overlay.frontY, overlay.frontWidth, overlay.frontHeight], ['overlay', 2, 2, 896, 756]);
  }
});

test('a thicker manual body clips an outer drawer to the real opening while 18 mm bodies retain their former boxes', () => {
  for (const legacy of [false, true]) for (const thickness of [18, 25, 30, 50]) {
    const { project, cabinet } = fixture({ width: 800 });
    if (legacy) { delete cabinet.layout; Object.assign(cabinet, { drawers: 1, doors: 0, shelves: 0 }); }
    else Object.assign(cabinet.layout, { front: 'drawers', drawers: 1 });
    // Drawer/front stock stays18 and the applied bottom8 even when the
    // manual carcass stock is thicker, so each gauge has its own role.
    const stock = project.materials.find(m => m.id === cabinet.materialId);
    project.materials.push({ ...stock, id: 'thick-body', thickness });
    cabinet.materialId = 'thick-body';
    const before = structuredClone(project), drawer = getExternalDrawerLayout(cabinet, project)[0];
    const opening = getCabinetLayout(cabinet, project).sections.find(s => s.node.front === 'drawers');
    const bottomY = Math.max(22, thickness + 2), topY = Math.min(738, 760 - thickness - 2);
    assert.deepEqual([drawer.box.y, drawer.box.height, drawer.box.bottomThickness], [bottomY, topY - bottomY - 8, 8]);
    if (thickness === 18) assert.deepEqual([drawer.box.y, drawer.box.height, drawer.box.width, drawer.box.depth], [22, 708, 738, 537]);
    if (thickness === 30) assert.deepEqual([drawer.box.y, drawer.box.height, drawer.box.width, drawer.box.depth], [32, 688, 714, 537]);
    assert.ok(drawer.box.y - opening.y >= 2);
    assert.ok(opening.y + opening.height - drawer.box.y - drawer.box.height - drawer.box.bottomThickness >= 2);
    assert.deepEqual(drawer.verticalClearance, { bottom: bottomY - thickness, top: 760 - thickness - topY, required: 2 });
    const parts = generateParts(project), boxParts = parts.filter(p => p.component === 'external-drawer-box');
    assert.equal(boxParts.length, 5);
    assert.equal(boxParts.every(p => p.drawerIndex === 0 && p.position && p.orientation), true);
    const bottom = boxParts.find(p => p.name.endsWith('дно'));
    const wall = boxParts.find(p => p.name.endsWith('передняя стенка'));
    near(bottom.position.y, drawer.box.y);
    near(wall.position.y + wall.finishedHeight, topY);
    near(wall.position.z + wall.thickness, cabinet.depth);
    assertAssembly(parts);
    assert.deepEqual(validateProject(project).filter(w => w.level === 'error'), []);
    assert.deepEqual(project, before);
  }
});

test('outer boxes use the correct local base and reduced-depth opening with independent stack fronts', () => {
  const { project, cabinet } = fixture({ width: 1200, height: 1000, includeBack: false, plinth: 0 });
  const body = project.materials.find(m => m.id === cabinet.materialId);
  project.materials.push({ ...body, id: 'body30', thickness: 30 }); cabinet.materialId = 'body30';
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection('drawers'), id: 'raised-drawers', drawers: 1, plinthHeight: 180 },
    { ...createSection('drawers'), id: 'recessed-drawers', drawers: 2, depth: 400 }
  ] };
  for (const drawer of getExternalDrawerLayout(cabinet, project)) {
    const opening = getCabinetLayout(cabinet, project).sections.find(s => s.id === drawer.sectionId);
    assert.ok(drawer.box.y >= opening.y + 2);
    assert.ok(drawer.box.y + drawer.box.height + drawer.box.bottomThickness <= opening.y + opening.height - 2);
    near(drawer.box.z + drawer.box.depth, drawer.depth);
    near(drawer.box.height + drawer.box.bottomThickness, Math.min(drawer.y + drawer.height - 20, opening.y + opening.height - 2) - Math.max(drawer.y + 20, opening.y + 2));
  }
  assertAssembly(generateParts(project));
  assert.deepEqual(validateProject(project).filter(w => w.level === 'error'), []);
});

test('outer drawer constraints measure clipped physical boxes rather than oversized overlay fronts in an old bad opening', () => {
  const { project, cabinet } = fixture({ width: 800, height: 260 });
  const body = project.materials.find(m => m.id === cabinet.materialId);
  project.materials.push({ ...body, id: 'body50', thickness: 50 }); cabinet.materialId = 'body50';
  Object.assign(cabinet.layout, { front: 'drawers', drawers: 2 });
  assert.equal(getCabinetLayout(cabinet, project).sections[0].height, 60);
  const boxes = getExternalDrawerLayout(cabinet, project);
  assert.equal(boxes.every(drawer => drawer.height - 40 - drawer.box.bottomThickness > 0), true, 'the facade-only old formula would falsely pass');
  assert.equal(boxes.every(drawer => drawer.box.height === -1), true);
  assert.ok(validateProject(project).some(w => w.level === 'error' && /короб ящика не помещается/.test(w.message)));
  const before = structuredClone(project);
  const shrinking = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 255 }, project);
  assert.equal(shrinking.clamped, true); near(shrinking.cabinet.height, 260);
  const repair = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 265 }, project);
  assert.equal(repair.possible, true); assert.equal(repair.clamped, false);
  assert.equal(getExternalDrawerLayout(repair.cabinet, project).every(drawer => drawer.box.height > 1), true);
  assertAssembly(generateParts({ ...project, cabinets: [repair.cabinet] }));
  assert.deepEqual(validateProject({ ...project, cabinets: [repair.cabinet] }).filter(w => w.level === 'error'), []);
  assert.deepEqual(project, before);
});

test('every internal drawer box attaches to its own front with forty millimetres of rear allowance', () => {
  for (const openingMechanism of ['handle', 'push']) for (const back of ['global', 'solid', 'none']) {
    const { project, cabinet } = fixture({ includeBack: back === 'global' });
    Object.assign(cabinet.layout, { back, depth: 450, internalDrawerCount: 2, openingMechanism });
    const section = getCabinetLayout(cabinet, project).sections[0], b = cabinet.includeBack ? cabinet.backThickness : 0;
    for (const drawer of getInternalDrawerLayout(cabinet, project)) {
      near(drawer.box.z, b + section.rearOffset + 40);
      near(drawer.box.z + drawer.box.depth, b + drawer.depth);
      const front = generateParts(project).find(p => p.component === 'internal-drawer-front' && p.internalDrawerIndex === drawer.index);
      const wall = generateParts(project).find(p => p.name.endsWith('передняя стенка') && p.internalDrawerIndex === drawer.index);
      near(wall.position.z + wall.thickness, front.position.z);
    }
    assertAssembly(generateParts(project));
  }
});

test('both L back joints are complete butt joints with no side or near-boundary divider penetration', () => {
  for (const corner of ['back-left', 'back-right']) {
    const { project, cabinet } = fixture({ width: 1200, height: 2200, depth: 620, sidesToFloor: false, cutout: { corner, width: 300, depth: 180 } });
    let parts = generateParts(project), rear = parts.find(p => p.name === 'Задняя стенка выреза'), side = parts.find(p => p.name === 'Возвратная боковина выреза');
    assert.deepEqual([rear.finishedWidth, rear.position.x, rear.position.z], [318, corner === 'back-left' ? 0 : 882, 180]);
    assert.equal(side.edges.left, 0);
    const shortened = parts.find(p => p.name === (corner === 'back-left' ? 'Боковина левая' : 'Боковина правая'));
    assert.deepEqual([shortened.finishedWidth, shortened.position.z], [437, 183]);
    assertAssembly(parts);
    cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: corner === 'back-left' ? [282, 864] : [864, 282], children: [
      { ...createSection('open'), id: 'left' }, { ...createSection('open'), id: 'right' }
    ] };
    parts = generateParts(project);
    const divider = parts.find(p => p.name.startsWith('Вертикальная перегородка'));
    near(divider.position.z, 183);
    assertAssembly(parts);
    assert.equal(validateProject(project).filter(w => w.level === 'error').length, 0);
  }
});

test('internal L dividers clear the real return panel in both mirrors and retain full depth at true face contact', () => {
  for (const corner of ['back-left', 'back-right']) for (const crossing of [true, false]) {
    const { project, cabinet } = fixture({ width: 800, height: 860, depth: 580, cutout: { corner, width: 200, depth: 180 } });
    const left = corner === 'back-left';
    const shortOpening = crossing ? 182 : 200;
    const longOpening = 746 - shortOpening;
    cabinet.layout.interiorLayout = { id: 'inside-columns', kind: 'split', axis: 'vertical', sizes: left ? [shortOpening, longOpening] : [longOpening, shortOpening], children: [
      { ...createSection('open'), id: 'left-inside' }, { ...createSection('open'), id: 'right-inside' }
    ] };
    const parts = generateParts(project), divider = parts.find(p => p.role === 'interior-partition'), rearReturn = parts.find(p => p.name === 'Возвратная боковина выреза');
    assert.deepEqual([divider.position.y, divider.finishedHeight], [18, 724]);
    assert.equal(divider.position.x, left ? crossing ? 200 : 218 : crossing ? 582 : 564);
    assert.equal(divider.position.z, crossing ? 183 : 3);
    assert.equal(divider.finishedWidth, crossing ? 397 : 577);
    near(divider.position.z + divider.finishedWidth, 580);
    assert.equal(overlaps(divider, rearReturn), false);
    if (!crossing) near(left ? rearReturn.position.x + rearReturn.thickness : divider.position.x + divider.thickness, left ? divider.position.x : rearReturn.position.x);
    assertAssembly(parts);
    assert.deepEqual(validateProject(project).filter(issue => issue.level === 'error'), []);
  }
});

test('finished assembly, hardware quantities and priced edge lengths agree after cutting then banding', () => {
  const { project, cabinet } = fixture();
  cabinet.layout.internalDrawerCount = 2;
  project.materials.forEach(m => { m.pricePerSheet = 0; });
  project.settings.pricing = { handlePrice: 0, guideSetPrice: 0, hingePrice: 0, edgeBandPricePerMeter: 10 };
  const parts = generateParts(project), hardware = getProjectHardwareSchedule(project), quote = getProjectCostEstimate(project);
  assert.equal(quote.complete, true);
  const meters = parts.reduce((sum, p) => sum + getPartEdgeBanding(p).lengthMeters, 0);
  near(quote.total, Math.round(meters * 1000) / 100);
  const assembly = parts.map(p => [p.finishedWidth, p.finishedHeight, p.position, p.finishedOutline]);
  project.settings.deductEdge = false;
  assert.deepEqual(generateParts(project).map(p => [p.finishedWidth, p.finishedHeight, p.position, p.finishedOutline]), assembly);
  assert.deepEqual(getProjectHardwareSchedule(project), hardware);
  assert.equal(getProjectCostEstimate(project).total, quote.total);
  assertAssembly(parts);
});

test('dense ordinary and interior shelves subtract their own thickness and leave equal clear intervals', () => {
  for (const interior of [false, true]) {
    const { project, cabinet } = fixture({ height: 186 }); // clean opening50
    if (interior) cabinet.layout.interiorLayout = { ...createSection('open'), id: 'inside', shelves: 2 };
    else cabinet.layout.shelves = 2;
    const opening = interior ? getCabinetLayout(cabinet, project).internalSections[0] : getCabinetLayout(cabinet, project).sections[0];
    const parts = generateParts(project), shelves = parts.filter(p => /полка \d+$/.test(p.name)).sort((a, b) => a.position.y - b.position.y);
    assertAssembly(parts);
    const gaps = [shelves[0].position.y - opening.y, shelves[1].position.y - shelves[0].position.y - 18, opening.y + opening.height - shelves[1].position.y - 18];
    gaps.forEach(gap => near(gap, 14 / 3));
    const leaf = interior ? cabinet.layout.interiorLayout : cabinet.layout;
    leaf.shelves = 3;
    assert.ok(validateProject(project).some(w => w.level === 'error' && /недостаточно внутреннего пространства/.test(w.message)));
  }
});

test('legacy mixed fronts retain their geometry while shelves stay below the first external drawer', () => {
  const { project, cabinet } = fixture();
  delete cabinet.layout;
  Object.assign(cabinet, { doors: 2, drawers: 2, shelves: 5 });
  const before = getFrontLayout(cabinet, project);
  const firstDrawer = before.filter(f => f.kind === 'drawer').sort((a, b) => a.y - b.y)[0];
  const shelves = generateParts(project).filter(p => p.name.startsWith('Полка'));
  assert.equal(shelves.length, 5);
  assert.equal(shelves.every(p => p.position.y + p.thickness < firstDrawer.y), true);
  assertAssembly(generateParts(project));
  assert.deepEqual(getFrontLayout(cabinet, project), before);
});

test('shelf capacity guards use actual stock thickness and allow old bad openings to improve without becoming worse', () => {
  for (const interior of [false, true]) {
    const { project, cabinet } = fixture({ height: 220 });
    if (interior) cabinet.layout.interiorLayout = { ...createSection('open'), id: 'inside', shelves: 3 };
    else cabinet.layout.shelves = 3;
    let result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 150 }, project);
    assert.equal(result.possible, true); assert.equal(result.clamped, true);
    near(result.cabinet.height, 190.001); // P100 + two actual18 mm panels + three18 mm shelves
    assert.equal(validateProject({ ...project, cabinets: [result.cabinet] }).filter(w => w.level === 'error').length, 0);
    project.materials.find(m => m.id === cabinet.materialId).thickness = 25;
    cabinet.height = 260;
    result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 150 }, project);
    near(result.cabinet.height, 225.001); // P100 + two25 + three25
    cabinet.height = 220; // imported baseline with only70 clear mm for75 mm of shelves
    result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 200 }, project);
    assert.equal(result.clamped, true); near(result.cabinet.height, 220);
    result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 222 }, project);
    assert.equal(result.clamped, false); near(result.cabinet.height, 222); // improves existing deficit by2
  }
  const { project, cabinet } = fixture({ height: 220 });
  delete cabinet.layout; Object.assign(cabinet, { doors: 2, drawers: 0, shelves: 3 });
  const result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 150 }, project);
  near(result.cabinet.height, 190.001);
  assert.equal(validateProject({ ...project, cabinets: [result.cabinet] }).filter(w => w.level === 'error').length, 0);
});

test('local L backs, floor openings and raised neighbouring bottoms have no overlapping finished panels', () => {
  for (const corner of ['back-left', 'back-right']) for (const includeBack of [true, false]) {
    const { project, cabinet } = fixture({ width: 1400, height: 2400, depth: 700, cutout: { corner, width: 300, depth: 180 }, includeBack });
    const portal = { ...createSection('open'), id: 'portal', floor: 'open', back: 'solid' };
    const storage = { ...createSection('doors'), id: 'storage', plinthHeight: 180, back: 'solid', interiorLayout: { id: 'interior', kind: 'split', axis: 'horizontal', sizes: [1, 1], children: [
      { ...createSection('open'), id: 'shelves', shelves: 3 }, { ...createSection('drawers'), id: 'drawers', drawers: 2 }
    ] } };
    cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: corner === 'back-left' ? [portal, storage] : [storage, portal] };
    const parts = generateParts(project);
    assertAssembly(parts);
    assert.equal(validateProject(project).filter(w => w.level === 'error').length, 0);
    cabinet.cutout.depth = 640; // deeper than the ordinary 65 mm plinth setback
    assertAssembly(generateParts(project));
    const plinth = generateParts(project).find(p => p.role === 'plinth');
    assert.equal(plinth.position.z, 640 + (includeBack ? 3 : 0));
    assert.ok(plinth.position.z + plinth.thickness <= cabinet.depth);
  }
});

test('rear braces cannot silently intersect a shelf or a drawer box and numeric guards stop before these collisions', () => {
  const { project, cabinet } = fixture({ includeBack: false });
  Object.assign(cabinet.layout, { front: 'open', shelves: 1, back: 'braces', rearBraces: [{ id: 'brace', y: 100, height: 100 }] });
  const proposed = structuredClone(cabinet);
  proposed.layout.rearBraces[0].y = 350;
  assert.ok(validateProject({ ...project, cabinets: [proposed] }).some(w => w.level === 'error' && /перемычка пересекает панель/.test(w.message)));
  assert.equal(constrainCabinetEdit(cabinet, proposed, project).possible, false);
  project.materials.push({ ...project.materials.find(m => m.id === cabinet.materialId), id: 'thick-rail', thickness: 60 });
  Object.assign(cabinet.layout, { front: 'drawers', shelves: 0, back: 'braces', rearBraces: [{ id: 'deep-rail', y: 100, height: 100, materialId: 'thick-rail' }] });
  assert.ok(validateProject(project).some(w => w.level === 'error' && /перемычка пересекает короб ящика/.test(w.message)));
});
