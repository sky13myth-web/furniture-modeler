import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createDefaultProject, createSection, generateParts, getPartEdgeBanding, getEdgeBandingSummary, optimizeCutting, validateProject } from '../src/engine.js';
import { setPartEdgeBanding, getPartEdgeBandingOverride } from '../src/part-edge-banding.js';
import { checkImport } from '../src/project-io.js';
import { checkFactoryProject, generateFactoryCSV, createPartDxf } from '../src/factory-export.js';
import { generateDrillingPlan } from '../src/drilling.js';
import { inspectCabinetPart } from '../src/part-inspection.js';
import { getProjectCostEstimate } from '../src/pricing.js';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < .002, `${actual} != ${expected}`);
const leaf = (id, overrides = {}) => ({ ...createSection('open'), id, ...overrides });
function fixture(overrides = {}) {
  const project = createDefaultProject('tr'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 2200, depth: 623, x: 450, z: 10,
    layout: leaf('opening', { shelves: 1 }), ...overrides });
  return { project, cabinet };
}
const byKey = (project, key) => generateParts(project).find(part => part.edgeBandKey === key);
const shelf = project => generateParts(project).find(part => part.name.endsWith('полка 1'));

test('one panel manual edges change its cut blank and totals while every other panel and finished geometry stay exact', () => {
  const { project, cabinet } = fixture(), before = generateParts(project), target = shelf(project);
  const total = getEdgeBandingSummary(before).lengthMm;
  assert.deepEqual(target.defaultEdges, { top: 0, bottom: 1, left: 0, right: 0 });
  assert.equal(setPartEdgeBanding(project, target.id, { top: .8, bottom: 1.4, left: .5, right: 1.3 }), true);
  const changed = generateParts(project), selected = byKey(project, target.edgeBandKey);
  assert.deepEqual(selected.edges, { top: .8, bottom: 1.4, left: .5, right: 1.3 });
  assert.deepEqual(selected.defaultEdges, target.defaultEdges);
  near(selected.width, target.finishedWidth - 1.8); near(selected.height, target.finishedHeight - 2.2);
  assert.deepEqual([selected.finishedWidth, selected.finishedHeight, selected.thickness, selected.position], [target.finishedWidth, target.finishedHeight, target.thickness, target.position]);
  assert.deepEqual(changed.filter(part => part.id !== target.id), before.filter(part => part.id !== target.id));
  near(getPartEdgeBanding(selected).lengthMm, 2 * (target.finishedWidth + target.finishedHeight));
  near(getEdgeBandingSummary(changed).lengthMm, total - target.finishedWidth + 2 * (target.finishedWidth + target.finishedHeight));
  assert.equal(Object.keys(cabinet.partEdgeBanding).length, 1);
  const frozen = structuredClone(project); Object.freeze(frozen.cabinets[0].partEdgeBanding); Object.freeze(frozen.cabinets[0]);
  assert.deepEqual(generateParts(frozen), changed);
});

test('body and return side top bands are automatic, dividers stay unbanded at the top, and a manual top-off survives JSON', () => {
  const { project, cabinet } = fixture({ cutout: { corner: 'back-left', width: 300, depth: 180 } });
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [leaf('left'), leaf('right')] };
  const parts = generateParts(project), sides = parts.filter(part => part.name.startsWith('Боковина ') || part.name === 'Возвратная боковина выреза');
  assert.equal(sides.length, 3);
  for (const part of sides) {
    assert.equal(part.defaultEdges.top, 1); assert.equal(part.edges.top, 1);
    near(part.height, part.finishedHeight - 1); near(part.width, part.finishedWidth - part.edges.left - part.edges.right);
  }
  assert.ok(parts.filter(part => part.partitionId).every(part => part.defaultEdges.top === 0));
  const selected = sides[0]; setPartEdgeBanding(project, selected.id, { top: 0 });
  const restored = checkImport(JSON.parse(JSON.stringify(project))), part = byKey(restored, selected.edgeBandKey);
  assert.equal(part.edges.top, 0); assert.equal(part.defaultEdges.top, 1); assert.equal(part.height, part.finishedHeight);
  assert.ok(generateParts(restored).filter(other => other.edgeBandKey !== selected.edgeBandKey && sides.some(side => side.edgeBandKey === other.edgeBandKey)).every(other => other.edges.top === 1));
  setPartEdgeBanding(restored, part.id, null); assert.equal(byKey(restored, part.edgeBandKey).edges.top, 1);
});

test('partial edits retain resolved other edges and reset restores current contact-based defaults without an override', () => {
  const { project, cabinet } = fixture(), plinth = generateParts(project).find(part => part.role === 'plinth');
  assert.equal(plinth.defaultEdges.left, 0); assert.equal(plinth.defaultEdges.right, 0);
  setPartEdgeBanding(project, plinth.id, { left: 2 });
  assert.deepEqual(getPartEdgeBandingOverride(project, plinth.id), { top: 1, bottom: 0, left: 2, right: 0 });
  setPartEdgeBanding(project, plinth.id, { top: 0 });
  assert.deepEqual(getPartEdgeBandingOverride(project, plinth.id), { top: 0, bottom: 0, left: 2, right: 0 });
  const returned = getPartEdgeBandingOverride(project, plinth.id); returned.left = 3;
  assert.equal(getPartEdgeBandingOverride(project, plinth.id).left, 2);
  cabinet.sidesToFloor = false;
  const current = byKey(project, plinth.edgeBandKey);
  // If the physical plinth changes to a different span, no old override is migrated.
  assert.equal(current, undefined);
  const newPlinth = generateParts(project).find(part => part.role === 'plinth');
  setPartEdgeBanding(project, newPlinth.id, { left: 0 });
  assert.deepEqual(byKey(project, newPlinth.edgeBandKey).edges, { top: 1, bottom: 0, left: 0, right: 1 });
  setPartEdgeBanding(project, newPlinth.id, null);
  assert.deepEqual(byKey(project, newPlinth.edgeBandKey).edges, byKey(project, newPlinth.edgeBandKey).defaultEdges);
  const originalKey = plinth.edgeBandKey;
  cabinet.sidesToFloor = true;
  assert.equal(byKey(project, originalKey).edges.left, 2);
  setPartEdgeBanding(project, byKey(project, originalKey).id, null);
  assert.equal(cabinet.partEdgeBanding, undefined);
  assert.equal(getPartEdgeBandingOverride(project, plinth.id), null);
});

test('JSON save/import and the actual cabinet clone retain local overrides while resizing/renaming/reordering do not change ownership', () => {
  const { project, cabinet } = fixture(), target = shelf(project);
  setPartEdgeBanding(project, target.id, { bottom: 0, top: 2 });
  const restored = JSON.parse(JSON.stringify(project)); assert.equal(checkImport(restored), restored);
  assert.deepEqual(generateParts(restored), generateParts(project));
  cabinet.name = 'Renamed cabinet'; cabinet.layout.name = 'Renamed opening · arbitrary name';
  cabinet.width += 140; cabinet.height += 100; cabinet.depth += 30; cabinet.rotation = 90;
  cabinet.x = 1000; cabinet.z = 1000;
  assert.deepEqual(byKey(project, target.edgeBandKey).edges, { top: 2, bottom: 0, left: 0, right: 0 });
  const copy = structuredClone(cabinet); copy.id = 'copy'; copy.x = 2400; project.cabinets.unshift(copy);
  const targets = generateParts(project).filter(part => part.edgeBandKey === target.edgeBandKey);
  assert.equal(targets.length, 2); assert.ok(targets.every(part => part.edges.top === 2));
  setPartEdgeBanding(project, targets[0].id, { top: 0 });
  assert.equal(generateParts(project).find(part => part.cabinetId === cabinet.id && part.edgeBandKey === target.edgeBandKey).edges.top, 2);
});

test('adding earlier shelves or deleting a different section cannot migrate a source sequence override', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1, 1], children: [leaf('a'), leaf('b', { shelves: 1 }), leaf('c', { shelves: 1 })] };
  const target = generateParts(project).find(part => part.sectionId === 'b' && part.name.endsWith('полка 1'));
  setPartEdgeBanding(project, target.id, { bottom: 0, left: 2 });
  cabinet.layout.children[0].shelves = 3;
  const shifted = byKey(project, target.edgeBandKey);
  assert.notEqual(shifted.id, target.id); assert.equal(shifted.edges.left, 2);
  assert.ok(generateParts(project).filter(part => part.sectionId !== 'b').every(part => part.edges.left === part.defaultEdges.left));
  cabinet.layout.children.splice(1, 1); cabinet.layout.sizes.splice(1, 1);
  assert.equal(byKey(project, target.edgeBandKey), undefined);
  assert.ok(generateParts(project).every(part => JSON.stringify(part.edges) === JSON.stringify(part.defaultEdges)));
});

test('outer and inner split boundaries are identified by both neighbouring child IDs rather than divider number', () => {
  for (const internal of [false, true]) {
    const { project, cabinet } = fixture();
    const tree = { id: 'many-columns', kind: 'split', axis: 'vertical', sizes: [1, 1, 1, 1], children: ['a', 'b', 'c', 'd'].map(id => leaf(id)) };
    if (internal) cabinet.layout.interiorLayout = tree; else cabinet.layout = tree;
    const target = generateParts(project).find(part => part.partitionBeforeChildId === 'c' && part.partitionAfterChildId === 'd');
    setPartEdgeBanding(project, target.id, { left: 0, right: 1.5 });
    tree.children.splice(0, 1); tree.sizes.splice(0, 1);
    const current = byKey(project, target.edgeBandKey);
    assert.ok(current); assert.notEqual(current.partitionId, target.partitionId);
    assert.equal(current.edges.right, 1.5);
    assert.ok(generateParts(project).filter(part => part.partitionId && part.edgeBandKey !== target.edgeBandKey).every(part => part.edges.right === part.defaultEdges.right));
    tree.children.splice(1, 1); tree.sizes.splice(1, 1);
    assert.equal(byKey(project, target.edgeBandKey), undefined);
    assert.ok(generateParts(project).every(part => part.edges.right === part.defaultEdges.right));
  }
});

test('drawer box panel identities survive unrelated shelf changes and do not leak across drawers or their six different panels', () => {
  for (const internal of [false, true]) {
    const { project, cabinet } = fixture();
    cabinet.layout = { id: 'stack', kind: 'split', axis: 'horizontal', sizes: [1, 2], children: [leaf('upper'), leaf('drawers', internal ? { front: 'doors', doors: 2, interiorLayout: leaf('inside', { front: 'drawers', drawers: 2 }) } : { front: 'drawers', drawers: 2 })] };
    const role = internal ? 'internal-drawer-box' : 'external-drawer-box';
    const target = generateParts(project).find(part => part.role === role && (part.drawerIndex ?? part.internalDrawerIndex) === 1 && part.name.endsWith('дно'));
    setPartEdgeBanding(project, target.id, { bottom: 1.2 });
    cabinet.layout.children[0].shelves = 2;
    assert.equal(byKey(project, target.edgeBandKey).edges.bottom, 1.2);
    assert.ok(generateParts(project).filter(part => part.edgeBandKey !== target.edgeBandKey).every(part => JSON.stringify(part.edges) === JSON.stringify(part.defaultEdges)));
  }
});

test('later inner drawer openings keep local panel overrides when an earlier opening adds, removes or reorders drawers', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = leaf('outer', { front: 'doors', doors: 2, shelves: 0, interiorLayout: {
    id: 'inner-columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [leaf('earlier', { front: 'drawers', drawers: 2 }), leaf('later', { front: 'drawers', drawers: 2 })]
  } });
  const target = generateParts(project).find(part => part.interiorSectionId === 'later' && part.bandingDrawerIndex === 1 && part.name.endsWith('дно'));
  assert.equal(target.internalDrawerIndex, 3);
  setPartEdgeBanding(project, target.id, { bottom: 1.2 });
  const [earlier, later] = cabinet.layout.interiorLayout.children;
  for (const count of [3, 1, 4]) {
    earlier.drawers = count;
    const changed = byKey(project, target.edgeBandKey);
    assert.ok(changed); assert.equal(changed.internalDrawerIndex, count + 1); assert.equal(changed.bandingDrawerIndex, 1);
    assert.equal(changed.edges.bottom, 1.2);
    assert.ok(generateParts(project).filter(part => part.edgeBandKey !== target.edgeBandKey).every(part => JSON.stringify(part.edges) === JSON.stringify(part.defaultEdges)));
  }
  cabinet.layout.interiorLayout.children = [later, earlier];
  assert.equal(byKey(project, target.edgeBandKey).internalDrawerIndex, 1);
  assert.equal(byKey(project, target.edgeBandKey).edges.bottom, 1.2);
});

test('L brace main/notch segments and three local plinth spans have distinct structural keys', () => {
  const { project, cabinet } = fixture({ includeBack: false, cutout: { corner: 'back-right', width: 300, depth: 180 }, rearBraces: [{ id: 'brace', y: 800, height: 100 }] });
  const braces = generateParts(project).filter(part => part.role === 'brace');
  assert.equal(braces.length, 2); assert.notEqual(braces[0].edgeBandKey, braces[1].edgeBandKey);
  const target = braces.find(part => part.bandingSegment === 'notch');
  setPartEdgeBanding(project, target.id, { bottom: 0, left: 2 });
  cabinet.rearBraces.unshift({ id: 'earlier', y: 1500, height: 100 });
  assert.equal(byKey(project, target.edgeBandKey).edges.left, 2);
  assert.ok(generateParts(project).filter(part => part.braceId === 'earlier' || part.braceId === 'brace' && part.bandingSegment === 'main').every(part => part.edges.left === 0));
  delete cabinet.cutout;
  assert.equal(byKey(project, target.edgeBandKey), undefined);
  assert.ok(generateParts(project).filter(part => part.role === 'brace').every(part => part.edges.left === 0));
  cabinet.layout = { id: 'three', kind: 'split', axis: 'vertical', sizes: [1, 1, 1], children: ['p-a', 'p-b', 'p-c'].map((id, index) => leaf(id, { plinthHeight: 100 + index * 50 })) };
  const plinths = generateParts(project).filter(part => part.role === 'plinth');
  assert.equal(plinths.length, 3); assert.equal(new Set(plinths.map(part => part.edgeBandKey)).size, 3);
  setPartEdgeBanding(project, plinths[1].id, { top: 0 });
  assert.deepEqual(generateParts(project).filter(part => part.role === 'plinth').map(part => part.edges.top), [1, 0, 1]);
});

test('manual L exterior bands retain the finished notch and count only the existing outer edge segments', () => {
  for (const corner of ['back-left', 'back-right']) {
    const { project } = fixture({ cutout: { corner, width: 300, depth: 180 } }), target = shelf(project);
    assert.equal(target.finishedOutline.length, 6);
    setPartEdgeBanding(project, target.id, { top: 2, bottom: 0, left: 1, right: 1 });
    const part = byKey(project, target.edgeBandKey), band = getPartEdgeBanding(part);
    assert.deepEqual(part.finishedOutline, target.finishedOutline); assert.deepEqual(part.position, target.position);
    assert.equal(part.finishedWidth - part.width, 2); assert.equal(part.finishedHeight - part.height, 2);
    const rearSegments = part.finishedOutline.reduce((sum, a, i) => { const b = part.finishedOutline[(i + 1) % part.finishedOutline.length]; return a.y === 0 && b.y === 0 ? sum + Math.abs(a.x - b.x) : sum; }, 0);
    near(band.edges.top.lengthMm, rearSegments); assert.equal(band.edges.bottom.lengthMm, 0);
    assert.equal(part.outline.length, 6);
  }
});

test('cutting, factory CSV/DXF and inspection raw dimensions all use the same one-time deduction', () => {
  const { project } = fixture(), target = shelf(project);
  setPartEdgeBanding(project, target.id, { top: .5, bottom: 2, left: 1, right: .8 });
  const parts = generateParts(project), part = parts.find(part => part.id === target.id), factory = checkFactoryProject(project);
  assert.equal(factory.valid, true, JSON.stringify(factory.issues));
  const packed = optimizeCutting(parts, project.materials, project.settings).sheets.flatMap(sheet => sheet.placements).find(item => item.partId === target.id);
  assert.deepEqual([packed.width, packed.height].sort((a, b) => a - b), [part.width, part.height].sort((a, b) => a - b));
  const csv = generateFactoryCSV(project, { language: 'en' }), row = csv.split('\r\n').find(line => line.includes(`"${target.id}"`));
  assert.ok(row.includes(`"${part.height}";"${part.width}";"${part.finishedHeight}";"${part.finishedWidth}"`));
  assert.ok(row.includes('"1";"0.8";"0.5";"2"'));
  assert.match(createPartDxf(part, { partId: 'PTEST' }), new RegExp(`10\\r?\\n${part.width}\\r?\\n`));
  const info = inspectCabinetPart(project, part.id);
  assert.deepEqual(info.dimensions.raw, { width: part.width, height: part.height, thickness: part.thickness });
  project.settings.deductEdge = false;
  const preserved = structuredClone(project), production = checkFactoryProject(project).parts.find(item => item.id === part.id);
  assert.equal(production.width, part.width); assert.equal(production.height, part.height);
  assert.equal(inspectCabinetPart(project, part.id).dimensions.raw.width, part.width);
  assert.deepEqual(project, preserved);
});

test('manual physical rear/bottom bands shift drilling datums once and preserve matched screw axes', () => {
  const { project } = fixture({ layout: leaf('opening', { shelves: 0 }) });
  project.settings.drilling = { enabled: true, countersinkDepth: null };
  const original = generateDrillingPlan(project), side = original.parts.find(part => part.name === 'Боковина левая');
  setPartEdgeBanding(project, side.id, { right: 2, bottom: 1.5 });
  const plan = generateDrillingPlan(project), changed = plan.parts.find(part => part.id === side.id);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.deepEqual(changed.rawOrigin, { a: 2, b: 1.5 });
  near(changed.width, side.width - 2); near(changed.height, side.height - 1.5);
  const old = original.holes.filter(hole => hole.partId === side.id), current = plan.holes.filter(hole => hole.partId === side.id);
  assert.equal(current.length, old.length);
  assert.deepEqual(changed.position, side.position); assert.equal(changed.finishedWidth, side.finishedWidth);
  for (const hole of current) for (const axis of ['x', 'y', 'z']) {
    near(hole.worldEntry[axis], changed.drillingWorldOrigin[axis] + changed.drillingBasis.a[axis] * hole.a + changed.drillingBasis.b[axis] * hole.b + changed.drillingBasis.t[axis] * hole.thicknessCoordinate);
  }
  for (const group of Map.groupBy(plan.holes, hole => hole.pairId).values()) {
    const through = group.find(hole => hole.kind === 'clearance'), pilot = group.find(hole => hole.kind === 'pilot');
    for (const axis of ['x', 'y', 'z']) near(through.worldEntry[axis] + through.direction[axis] * through.depth, pilot.worldEntry[axis]);
  }
});

test('edge cost follows the edited finished perimeter and resetting removes the manual cost difference', () => {
  const { project } = fixture(), target = shelf(project);
  project.materials.forEach(material => { material.pricePerSheet = 0; });
  project.settings.pricing = { handlePrice: 0, guideSetPrice: 0, hingePrice: 0, edgeBandPricePerMeter: 100, rodPricePerMeter: 0, rodHolderPrice: 0, rearScrewPrice: 0, rearNailPrice: 0 };
  const initial = getProjectCostEstimate(project);
  assert.equal(initial.complete, true);
  setPartEdgeBanding(project, target.id, { bottom: 0 });
  near(initial.total - getProjectCostEstimate(project).total, target.finishedWidth / 10);
  setPartEdgeBanding(project, target.id, null);
  assert.equal(getProjectCostEstimate(project).total, initial.total);
});

test('invalid edits and malformed imported maps are rejected without changing the project', () => {
  const { project } = fixture(), target = shelf(project), before = structuredClone(project);
  for (const patch of [undefined, {}, [], '1', { top: '1' }, { top: NaN }, { top: Infinity }, { top: -1 }, { top: 3.1 }, { inner: 1 }]) {
    assert.throws(() => setPartEdgeBanding(project, target.id, patch), /Кромк/); assert.deepEqual(project, before);
  }
  assert.throws(() => setPartEdgeBanding(project, 'missing', { bottom: 0 }), /Деталь не найдена/);
  assert.equal(getPartEdgeBandingOverride(project, 'missing'), null);
  const tiny = fixture({ cutout: { corner: 'back-left', width: 300, depth: 3.5 } });
  const small = generateParts(tiny.project).find(part => part.name === 'Возвратная боковина выреза'), snapshot = structuredClone(tiny.project);
  assert.throws(() => setPartEdgeBanding(tiny.project, small.id, { left: .4, right: .4 }), /превышает/); assert.deepEqual(tiny.project, snapshot);
  setPartEdgeBanding(project, target.id, { bottom: 0 });
  const key = target.edgeBandKey;
  for (const map of [null, [], 'map', { 'cabinet-1-part-7': { top: 1, bottom: 0, left: 0, right: 0 } }, { [key]: { bottom: 0 } }, { [key]: { top: 4, bottom: 0, left: 0, right: 0 } }, { [key]: { top: 0, bottom: 0, left: 0, right: 0, unknown: 1 } }]) {
    const imported = structuredClone(project); imported.cabinets[0].partEdgeBanding = map;
    assert.throws(() => checkImport(imported), /Кромк/);
    assert.ok(validateProject(imported).some(issue => issue.level === 'error' && issue.message.includes('Кромк')));
  }
});

test('all shipped construction examples expose unique local keys without changing source ordinals or default edges', () => {
  for (const name of ['wardrobe', 'laundry', 'internal-drawers', 'interior-compartments', 'clothes-rods']) {
    const file = JSON.parse(fs.readFileSync(new URL(`../examples/${name}.atolye.json`, import.meta.url))), project = file.project ?? file;
    const before = structuredClone(project), parts = generateParts(project);
    for (const cabinet of project.cabinets) {
      const local = parts.filter(part => part.cabinetId === cabinet.id);
      assert.equal(new Set(local.map(part => part.edgeBandKey)).size, local.length, name);
      assert.ok(local.every(part => JSON.stringify(part.edges) === JSON.stringify(part.defaultEdges)));
    }
    assert.deepEqual(project, before);
  }
});
