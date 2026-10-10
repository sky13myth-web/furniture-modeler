import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheetCutPlan } from '../src/sheet-cut-plan.js';
import { createDefaultProject, generateParts, getProjectStats, optimizeCutting } from '../src/engine.js';

const EPS = 1e-6;
const stock = { id: 'stock', name: 'Test MDF', sheetWidth: 1000, sheetHeight: 1000 };
const panel = (id, width, height, extra = {}) => ({ id, name: id, width, height, thickness: 18, materialId: 'stock', ...extra });
const close = (a, b, message) => assert.ok(Math.abs(a - b) < EPS, `${message ?? ''}: ${a} ≠ ${b}`);
const bounds = r => [r.x, r.y, r.width, r.height];
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Independently replay the physical saw cuts, using only centreline + kerf. */
function proveExecutable(plan, sources, materials) {
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const seen = [];
  for (const sheet of plan.sheets) {
    const stockSource = materials.find(item => item.id === sheet.materialId);
    assert.equal(sheet.width, Number(stockSource.sheetWidth));
    assert.equal(sheet.height, Number(stockSource.sheetHeight));
    const regionMap = new Map(sheet.regions.map(region => [region.id, region]));
    const active = new Map([[sheet.rootRegionId, { x: 0, y: 0, width: sheet.width, height: sheet.height }]]);
    let removedArea = 0;
    for (const [index, cut] of sheet.cuts.entries()) {
      assert.equal(cut.sequence, index + 1);
      assert.equal(cut.id, cut.cutId);
      const parent = active.get(cut.parentRegionId);
      assert.ok(parent, `${cut.id}: parent must already be detached and never cut twice`);
      active.delete(cut.parentRegionId);
      const vertical = cut.axis === 'x';
      assert.ok(vertical || cut.axis === 'y');
      close(vertical ? cut.x1 : cut.y1, vertical ? cut.x2 : cut.y2, 'straight cut');
      close(vertical ? cut.y1 : cut.x1, vertical ? parent.y : parent.x, 'full parent span start');
      close(vertical ? cut.y2 : cut.x2, vertical ? parent.y + parent.height : parent.x + parent.width, 'full parent span end');
      const coordinate = vertical ? 'x' : 'y', dimension = vertical ? 'width' : 'height';
      const start = (vertical ? cut.x1 : cut.y1) - cut.kerf / 2, end = start + cut.kerf;
      const low = parent[coordinate], high = low + parent[dimension];
      const expected = [];
      if (Math.min(start, high) - low > 1e-7) expected.push({ ...parent, [dimension]: Math.min(start, high) - low });
      if (high - Math.max(end, low) > 1e-7) expected.push({ ...parent, [coordinate]: Math.max(end, low), [dimension]: high - Math.max(end, low) });
      assert.equal(cut.resultRegionIds.length, expected.length, 'all residual regions explicitly accounted');
      let childrenArea = 0;
      for (const [childIndex, id] of cut.resultRegionIds.entries()) {
        const child = regionMap.get(id), geometry = expected[childIndex];
        assert.equal(child.parentRegionId, cut.parentRegionId);
        bounds(child).forEach((value, dimensionIndex) => close(value, bounds(geometry)[dimensionIndex], 'actual detached child'));
        active.set(id, geometry); childrenArea += geometry.width * geometry.height;
      }
      const removed = parent.width * parent.height - childrenArea;
      close(cut.actualKerfBand.width * cut.actualKerfBand.height, removed, 'real stock consumed by kerf');
      removedArea += removed;
      const fullBand = vertical ? { x: start, y: parent.y, width: cut.kerf, height: parent.height } : { x: parent.x, y: start, width: parent.width, height: cut.kerf };
      bounds(cut.kerfBand).forEach((value, i) => close(value, bounds(fullBand)[i], 'physical blade band'));
      for (const placement of sheet.placements) assert.ok(overlapArea(fullBand, placement) < EPS, `${cut.id} must never consume finished blank ${placement.partId}`);
    }
    for (const placement of sheet.placements) {
      const raw = sourceMap.get(placement.partId), geometry = active.get(placement.regionId);
      assert.ok(geometry, 'each blank is an intact terminal physical region');
      assert.equal(regionMap.get(placement.regionId).state, 'part');
      bounds(placement).forEach((value, i) => close(value, bounds(geometry)[i], 'placement matches detached blank'));
      assert.equal(placement.width, placement.rotated ? Number(raw.height) : Number(raw.width));
      assert.equal(placement.height, placement.rotated ? Number(raw.width) : Number(raw.height));
      assert.equal(placement.thickness, Number(raw.thickness));
      assert.equal(sheet.thickness, placement.thickness);
      assert.equal(placement.materialId, sheet.materialId);
      assert.ok(!raw.grain || !placement.rotated, 'grain stays along stock B/y');
      assert.ok(placement.x >= sheet.margin - EPS && placement.y >= sheet.margin - EPS);
      assert.ok(placement.x + placement.width <= sheet.width - sheet.margin + EPS && placement.y + placement.height <= sheet.height - sheet.margin + EPS);
      seen.push(`${placement.partId}#${placement.instanceIndex}`);
    }
    for (const [id] of active) assert.ok(['part', 'free', 'waste'].includes(regionMap.get(id).state));
    close([...active.values()].reduce((sum, leaf) => sum + leaf.width * leaf.height, 0) + removedArea, sheet.width * sheet.height, 'stock area conservation');
    close(sheet.kerfArea, removedArea);
    close(sheet.blankArea + sheet.residualArea + sheet.trimWasteArea + sheet.kerfArea, sheet.width * sheet.height, 'all stock destinations');
    const treeLeaves = [];
    const visit = node => { if (node.children) node.children.forEach(visit); else treeLeaves.push(node.id); };
    visit(sheet.tree);
    assert.deepEqual(treeLeaves.sort(), [...active.keys()].sort(), 'tree represents the actual sequence');
  }
  assert.equal(new Set(seen).size, seen.length, 'every source occurrence is cut exactly once');
  return seen;
}

test('full usable blank needs only the four real margin trims, with blade centreline and waste accounted', () => {
  const sources = [panel('full', 980, 980)];
  const plan = createSheetCutPlan(sources, [stock], { margin: 10, kerf: 3 });
  assert.equal(plan.method, 'guillotine'); assert.equal(plan.guillotine, true); assert.equal(plan.valid, true);
  assert.equal(plan.sheets[0].cuts.length, 4);
  assert.deepEqual(plan.sheets[0].cuts.map(cut => cut.stage), ['trim-left', 'trim-right', 'trim-top', 'trim-bottom']);
  assert.equal(plan.sheets[0].cuts[0].x1, 8.5);
  assert.equal(plan.sheets[0].cuts[1].x1, 991.5);
  assert.deepEqual(proveExecutable(plan, sources, [stock]), ['full#1']);
});

test('guillotine partitions isolate all raw rectangles through full-span sequential cuts, preserving exact fractional kerf', () => {
  const sources = [panel('a', 470.123456, 470.654321), panel('b', 470, 470), panel('c', 470, 470), panel('d', 470, 470), panel('e', 153.789, 307.987), panel('f', 400, 210), panel('g', 280, 210)];
  const snapshot = JSON.stringify({ sources, stock });
  const plan = createSheetCutPlan(sources, [stock], { margin: 10.123456, kerf: 3.987654, allowRotate: true });
  assert.equal(plan.unplaced.length, 0);
  assert.equal(proveExecutable(plan, sources, [stock]).length, sources.length);
  assert.equal(JSON.stringify({ sources, stock }), snapshot);
  assert.deepEqual(plan, createSheetCutPlan(sources, [stock], { margin: 10.123456, kerf: 3.987654, allowRotate: true }));
});

test('zero margin and full stock require no fictional cut or kerf deduction', () => {
  const sources = [panel('full', 1000, 1000)];
  const plan = createSheetCutPlan(sources, [stock], { margin: 0, kerf: 3 });
  assert.equal(plan.sheets[0].cuts.length, 0); assert.equal(plan.kerfArea, 0); assert.equal(plan.wasteArea, 0);
  proveExecutable(plan, sources, [stock]);
});

test('trim thinner than the saw blade and a tiny last offcut allow physical overhang without touching any blank', () => {
  const smallStock = { ...stock, sheetWidth: 100, sheetHeight: 100 };
  const sources = [panel('almost-full', 97, 97)];
  const plan = createSheetCutPlan(sources, [smallStock], { margin: 1, kerf: 3 });
  assert.equal(plan.sheets[0].cuts[0].x1, -0.5);
  assert.ok(plan.sheets[0].cuts.some(cut => cut.kerfBand.x + cut.kerfBand.width > 99));
  assert.equal(plan.sheets[0].placements[0].width, 97);
  proveExecutable(plan, sources, [smallStock]);
});

test('integer quantities all receive an actual blank and stable global code, including rejected occurrences', () => {
  const sources = [panel('multiple', 490, 490, { quantity: 5 }), panel('too-large', 2000, 2000, { quantity: 2 })];
  const codes = new Map([['multiple', 'P0042'], ['too-large', 'P0043']]);
  const plan = createSheetCutPlan(sources, [stock], { margin: 10, kerf: 3 }, { partCodes: codes });
  assert.equal(plan.sourcePartCount, 2); assert.equal(plan.totalParts, 7); assert.equal(plan.placedParts, 5); assert.equal(plan.unplaced.length, 2); assert.equal(plan.valid, false);
  assert.deepEqual(proveExecutable(plan, sources, [stock]).sort(), Array.from({ length: 5 }, (_, index) => `multiple#${index + 1}`).sort());
  assert.ok(plan.sheets.flatMap(sheet => sheet.placements).every(placement => placement.partCode === 'P0042' && placement.quantity === 1));
  assert.deepEqual(plan.unplaced.map(item => item.instanceIndex), [1, 2]);
  assert.ok(plan.unplaced.every(item => item.partCode === 'P0043'));
});

test('grain and disabled rotation remain constraints; separate materials and gauges never share one leaf', () => {
  const rectangleStock = { ...stock, sheetWidth: 500, sheetHeight: 1000 };
  const source = [panel('rotate', 800, 400), panel('grain', 800, 400, { grain: true })];
  const plan = createSheetCutPlan(source, [rectangleStock], { margin: 10, kerf: 3 });
  assert.equal(plan.sheets[0].placements[0].rotated, true); assert.equal(plan.unplaced[0].partId, 'grain');
  proveExecutable(plan, source, [rectangleStock]);
  assert.equal(createSheetCutPlan([source[0]], [rectangleStock], { allowRotate: false }).unplaced.length, 1);
  const mixed = [panel('a', 100, 100), panel('b', 100, 100, { thickness: 16 }), panel('c', 100, 100, { materialId: 'other' })];
  const stocks = [stock, { ...stock, id: 'other' }];
  const result = createSheetCutPlan(mixed, stocks);
  assert.deepEqual(result.sheets.map(sheet => [sheet.materialId, sheet.thickness]), [['stock', 18], ['stock', 16], ['other', 18]]);
  proveExecutable(result, mixed, stocks);
});

test('L contours rotate exactly inside their isolated bounding blank and explicitly require secondary contour machining', () => {
  const outline = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 200 }, { x: 700, y: 200 }, { x: 700, y: 400 }, { x: 0, y: 400 }];
  const sources = [panel('L', 800, 400, { outline, area: 300000 })], stocks = [{ ...stock, sheetWidth: 500 }];
  const plan = createSheetCutPlan(sources, stocks, { margin: 10, kerf: 3 });
  const placement = plan.sheets[0].placements[0];
  assert.equal(placement.rotated, true);
  assert.deepEqual(placement.outline, outline.map(point => ({ x: 400 - point.y, y: point.x })));
  assert.equal(placement.requiresContourMachining, true);
  assert.equal(plan.warnings[0].code, 'secondary-contour');
  assert.equal(plan.sheets[0].usedArea, 300000); assert.equal(plan.sheets[0].secondaryWasteArea, 20000);
  proveExecutable(plan, sources, stocks);
});

test('larger deterministic mixed pieces have executable plans even when thin leftovers consume only part of a kerf', () => {
  const sources = Array.from({ length: 120 }, (_, index) => panel(`p${index}`, 81.137 + (index * 113) % 410, 93.891 + (index * 79) % 440, { grain: index % 4 === 0 }));
  for (const settings of [{ margin: 15, kerf: 4 }, { margin: 0, kerf: 0 }, { margin: 0.5, kerf: 6.25 }]) {
    const plan = createSheetCutPlan(sources, [stock], settings);
    assert.equal(plan.valid, true);
    assert.equal(proveExecutable(plan, sources, [stock]).length, sources.length);
  }
});

test('UI statistics, stock costing and factory-facing optimizer use one identical plan without changing furniture dimensions', () => {
  const project = createDefaultProject(), parts = generateParts(project), snapshot = JSON.stringify({ project, parts });
  const direct = createSheetCutPlan(parts, project.materials, project.settings);
  assert.deepEqual(optimizeCutting(parts, project.materials, project.settings), direct);
  assert.deepEqual(getProjectStats(project).cutting, direct);
  assert.equal(direct.valid, true);
  assert.equal(proveExecutable(direct, parts, project.materials).length, parts.length);
  assert.equal(JSON.stringify({ project, parts }), snapshot, 'nesting changes no finished/mating construction data');
});

test('bad stock, missing materials, dimensions and fractional counts cannot yield a pretend executable blank', () => {
  const sources = [panel('negative', -2, 20), panel('missing', 20, 20, { materialId: 'missing' }), panel('fractional-count', 20, 20, { quantity: 1.5 }), panel('valid-but-no-stock', 20, 20)];
  const plan = createSheetCutPlan(sources, [{ ...stock, sheetWidth: 0 }]);
  assert.equal(plan.valid, false); assert.equal(plan.sheets.length, 0); assert.equal(plan.unplaced.length, 4); assert.equal(plan.errors.length, 4);
  assert.equal(plan.placedParts, 0);
});
