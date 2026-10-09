import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, getCabinetLayout, getInternalDrawerLayout, generateParts, validateProject, findLayoutNode } from '../src/engine.js';
import { constrainCabinetEdit, getApplianceRequirements, resizeApplianceSection, resizeApplianceDivider, setApplianceSectionDepth } from '../src/appliance-constraints.js';

const project = { materials: [{ id: 'body', thickness: 18 }, { id: 'back', thickness: 8 }] };
const machine = overrides => ({ type: 'washer', label: 'Моя техника', width: 600, height: 850, depth: 600, useClearances: true, clearances: { side: 25, top: 25, rear: 50 }, ...overrides });
const leaf = (id, overrides = {}) => ({ id, kind: 'section', front: 'open', doors: 0, drawers: 0, shelves: 0, depth: null, floor: 'inherit', back: 'none', ...overrides });
const split = (id, axis, sizes, children) => ({ id, kind: 'split', axis, sizes, children });
const cabinet = overrides => ({ id: 'cabinet', width: 800, height: 2200, depth: 800, plinth: 100, materialId: 'body', backMaterialId: 'back', includeBack: false, includeBottom: true, layout: leaf('machine', { floor: 'open', appliance: machine() }), ...overrides });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `Expected ${expected}, received ${actual}`);
const opening = (c, id) => getCabinetLayout(c, project).sections.find(s => s.id === id);

test('requirements use enabled clearances and preserve user data', () => {
  const c = cabinet(), before = structuredClone(c), requirements = getApplianceRequirements(c, project);
  assert.deepEqual(requirements[0].required, { width: 650, height: 875, depth: 650 });
  assert.deepEqual(requirements[0].available, { width: 764, height: 2182, depth: 800 });
  assert.equal(requirements[0].floorOpen, true);
  requirements[0].appliance.label = 'changed';
  assert.deepEqual(c, before);
  c.layout.appliance.useClearances = false;
  assert.deepEqual(getApplianceRequirements(c, project)[0].required, { width: 600, height: 850, depth: 600 });
});

test('whole cabinet width is clamped to machine plus two side clearances and real panels', () => {
  const c = cabinet(), proposed = { ...structuredClone(c), width: 500 }, previous = structuredClone(c);
  const result = constrainCabinetEdit(c, proposed, project);
  assert.equal(result.possible, true);
  assert.equal(result.clamped, true);
  assert.equal(result.fits, true);
  assert.equal(result.reason, 'Размер ограничен конструкцией, техникой и монтажными зазорами.');
  near(result.cabinet.width, 686);
  near(opening(result.cabinet, 'machine').width, 650);
  assert.deepEqual(c, previous);
  assert.equal(proposed.width, 500);
  assert.equal(result.diagnostics[0].axis, 'width');
});

test('floor opening height clamps at appliance top allowance plus roof, independently of plinth', () => {
  const c = cabinet(), result = constrainCabinetEdit(c, { ...structuredClone(c), height: 700 }, project);
  near(result.cabinet.height, 893);
  near(opening(result.cabinet, 'machine').height, 875);
  assert.equal(result.fits, true);
  const closed = cabinet({ layout: leaf('machine', { appliance: machine() }) });
  near(constrainCabinetEdit(closed, { ...structuredClone(closed), height: 700 }, project).cabinet.height, 1011);
});

test('body and section depth account for actual back gauge and a rear cutout', () => {
  const c = cabinet({ includeBack: true, cutout: { corner: 'back-left', width: 100, depth: 80 } });
  const result = constrainCabinetEdit(c, { ...structuredClone(c), depth: 500 }, project);
  near(result.cabinet.depth, 738);
  near(opening(result.cabinet, 'machine').usableDepth, 650);
  assert.equal(result.fits, true);
  const sectionResult = setApplianceSectionDepth(c, 'machine', 500, project);
  near(findLayoutNode(sectionResult.cabinet.layout, 'machine').depth, 730);
  near(opening(sectionResult.cabinet, 'machine').usableDepth, 650);
  assert.equal(c.layout.depth, null);
});

test('requests below the engine opening minimum clamp before adjacent resize', () => {
  const c = cabinet({ width: 1500, layout: split('columns', 'vertical', [1, 1], [leaf('machine', { appliance: machine() }), leaf('storage')]) });
  const result = resizeApplianceSection(c, 'machine', 'vertical', 1, project);
  assert.equal(result.possible, true);
  assert.equal(result.clamped, true);
  near(opening(result.cabinet, 'machine').width, 650);
  near(opening(result.cabinet, 'storage').width, 796);
  assert.equal(result.cabinet.width, c.width);
  assert.deepEqual(c.layout.sizes, [1, 1]);
});

test('expanding one opening stops before it makes a neighboring appliance too narrow', () => {
  const c = cabinet({ width: 1500, layout: split('columns', 'vertical', [1, 1], [leaf('storage'), leaf('machine', { appliance: machine() })]) });
  const result = resizeApplianceSection(c, 'storage', 'vertical', 1400, project);
  assert.equal(result.clamped, true);
  near(opening(result.cabinet, 'storage').width, 796);
  near(opening(result.cabinet, 'machine').width, 650);
  assert.equal(result.fits, true);
});

test('divider drag obeys both appliance envelopes and does not move a far opening', () => {
  const c = cabinet({ width: 2400, layout: split('columns', 'vertical', [800, 800, 728], [leaf('left', { appliance: machine() }), leaf('middle', { appliance: machine() }), leaf('far')]) });
  const originalFar = opening(c, 'far');
  const result = resizeApplianceDivider(c, 'columns-divider-0', 'vertical', 1200, project);
  near(opening(result.cabinet, 'middle').width, 650);
  near(opening(result.cabinet, 'left').width, 950);
  near(opening(result.cabinet, 'far').width, originalFar.width);
  near(opening(result.cabinet, 'far').x, originalFar.x);
  assert.equal(result.fits, true);
});

test('horizontal resizing subtracts floorExtra only once and protects the floor appliance', () => {
  const c = cabinet({ height: 2200, layout: split('rows', 'horizontal', [1000, 1046], [leaf('upper'), leaf('machine', { floor: 'open', appliance: machine() })]) });
  const result = resizeApplianceSection(c, 'machine', 'horizontal', 100, project);
  near(opening(result.cabinet, 'machine').height, 875);
  near(opening(result.cabinet, 'upper').height, 1289);
  assert.equal(result.fits, true);
  assert.equal(result.cabinet.height, c.height);
});

test('generic proposed divider weights clamp while preserving normalized geometry', () => {
  const c = cabinet({ width: 1500, layout: split('columns', 'vertical', [1, 1], [leaf('storage'), leaf('machine', { appliance: machine() })]) });
  const proposed = structuredClone(c); proposed.layout.sizes = [1200, 246];
  const result = constrainCabinetEdit(c, proposed, project);
  near(opening(result.cabinet, 'machine').width, 650);
  near(opening(result.cabinet, 'storage').width, 796);
  assert.equal(result.clamped, true);
  assert.equal(result.fits, true);
  assert.deepEqual(proposed.layout.sizes, [1200, 246]);
});

test('an already invalid imported niche may improve but no axis deficit may grow', () => {
  const c = cabinet({ width: 620, height: 800, depth: 590 });
  const improved = constrainCabinetEdit(c, { ...structuredClone(c), width: 660 }, project);
  assert.equal(improved.possible, true);
  assert.equal(improved.clamped, false);
  assert.equal(improved.fits, false);
  assert.equal(improved.cabinet.width, 660);
  const worse = constrainCabinetEdit(c, { ...structuredClone(c), width: 500 }, project);
  assert.equal(worse.possible, true);
  assert.equal(worse.clamped, true);
  near(worse.cabinet.width, c.width);
  assert.equal(worse.fits, false);
  const repaired = constrainCabinetEdit(c, { ...structuredClone(c), width: 700, height: 1000, depth: 700 }, project);
  assert.equal(repaired.fits, true);
  assert.equal(repaired.clamped, false);
});

test('a sole section resize enlarges the matching cabinet dimension', () => {
  const c = cabinet(), result = resizeApplianceSection(c, 'machine', 'vertical', 100, project);
  near(result.cabinet.width, 686);
  near(opening(result.cabinet, 'machine').width, 650);
  assert.equal(result.possible, true);
  assert.equal(result.clamped, true);
  const larger = resizeApplianceSection(c, 'machine', 'horizontal', 2400, project);
  near(larger.cabinet.height, 2418);
  near(opening(larger.cabinet, 'machine').height, 2400);
});

test('a cabinet without an appliance passes a valid numeric edit unchanged', () => {
  const c = cabinet({ layout: leaf('storage') }), proposed = { ...structuredClone(c), width: 500 };
  const result = constrainCabinetEdit(c, proposed, project);
  assert.deepEqual(result.cabinet, proposed);
  assert.notEqual(result.cabinet, proposed);
  assert.equal(result.clamped, false);
  assert.equal(result.fits, true);
  assert.equal(result.requirements.length, 0);
});

test('nonfinite input and an unknown divider reject safely without mutating the original', () => {
  const c = cabinet(), before = structuredClone(c);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(constrainCabinetEdit(c, { ...structuredClone(c), width: value }, project).possible, false);
    assert.equal(resizeApplianceSection(c, 'machine', 'vertical', value, project).possible, false);
    assert.equal(setApplianceSectionDepth(c, 'machine', value, project).possible, false);
  }
  assert.equal(resizeApplianceDivider(c, 'missing', 'vertical', 500, project).possible, false);
  assert.deepEqual(c, before);
});

test('an unsafe structural change is rejected instead of silently distorting a new tree', () => {
  const c = cabinet(), proposed = structuredClone(c);
  proposed.layout = split('new-columns', 'vertical', [1, 1], [leaf('new-machine', { appliance: machine() }), leaf('new-storage')]);
  const result = constrainCabinetEdit(c, proposed, project);
  assert.equal(result.possible, false);
  assert.equal(result.clamped, true);
  assert.deepEqual(result.cabinet, c);
});

test('material gauge edits compare appliance fit against the original project materials', () => {
  const c = cabinet({ width: 686 }), before = structuredClone(project), after = structuredClone(project);
  after.materials.find(m => m.id === 'body').thickness = 25;
  const result = constrainCabinetEdit(c, structuredClone(c), after, { baselineProject: before });
  assert.equal(result.possible, false);
  assert.equal(result.clamped, true);
  assert.equal(result.diagnostics[0].axis, 'width');
  near(result.diagnostics[0].deficit, 14);
  assert.deepEqual(result.cabinet, c);
  assert.equal(before.materials[0].thickness, 18);
  assert.equal(after.materials[0].thickness, 25);
  const enlarged = constrainCabinetEdit(c, { ...structuredClone(c), width: 700 }, after, { baselineProject: before });
  assert.equal(enlarged.possible, true);
  assert.equal(enlarged.clamped, false);
  assert.equal(enlarged.fits, true);
});

test('a thicker replacement back cannot acquire a hidden legacy depth deficit', () => {
  const c = cabinet({ depth: 658, includeBack: true }), after = structuredClone(project);
  after.materials.find(m => m.id === 'back').thickness = 18;
  const result = constrainCabinetEdit(c, structuredClone(c), after, { baselineProject: project });
  assert.equal(result.possible, false);
  assert.equal(result.diagnostics[0].axis, 'depth');
  near(result.diagnostics[0].deficit, 10);
});

test('extreme default divider movement clamps before its neighbor drawer boxes become invalid', () => {
  const p = createDefaultProject(), c = p.cabinets[0], before = structuredClone(c);
  const result = resizeApplianceDivider(c, 'section-top', 'horizontal', 100000, p);
  assert.equal(result.possible, true);
  assert.equal(result.clamped, true);
  assert.equal(result.fits, true);
  assert.equal(result.reason, 'Размер ограничен конструкцией, техникой и монтажными зазорами.');
  assert.ok(getCabinetLayout(result.cabinet, p).sections.every(s => s.width >= 50 && s.height >= 50 && s.depth >= 50));
  const errors = validateProject({ ...p, cabinets: [result.cabinet] }).filter(item => item.level === 'error');
  assert.deepEqual(errors, []);
  const parts = generateParts({ ...p, cabinets: [result.cabinet] });
  assert.equal(parts.length, generateParts(p).length, 'no invalid drawer panels silently disappear');
  assert.ok(parts.every(part => part.width > 0 && part.height > 0 && part.thickness > 0));
  assert.deepEqual(c, before);
});

test('whole cabinet reductions clamp to construction minima even without an appliance', () => {
  const c = cabinet({ layout: leaf('storage') });
  const width = constrainCabinetEdit(c, { ...structuredClone(c), width: 20 }, project);
  near(width.cabinet.width, 86);
  assert.ok(opening(width.cabinet, 'storage').width >= 50);
  assert.equal(width.clamped, true);
  const height = constrainCabinetEdit(c, { ...structuredClone(c), height: 100 }, project);
  near(height.cabinet.height, 186);
  assert.ok(opening(height.cabinet, 'storage').height >= 50);
  const depth = constrainCabinetEdit(c, { ...structuredClone(c), depth: 1 }, project);
  near(depth.cabinet.depth, 50);
  assert.ok(opening(depth.cabinet, 'storage').depth >= 50);
  for (const result of [width, height, depth]) assert.equal(result.fits, true);
});

test('an empty adjacent opening never stops at the engine 49.999 mm tolerance', () => {
  const c = cabinet({ width: 1000, layout: split('columns', 'vertical', [1, 1], [leaf('left'), leaf('right')]) });
  const result = resizeApplianceDivider(c, 'columns-divider-0', 'vertical', 10000, project);
  assert.equal(result.possible, true);
  assert.equal(result.clamped, true);
  assert.ok(opening(result.cabinet, 'right').width >= 50);
  near(opening(result.cabinet, 'right').width, 50);
});

test('internal drawer fronts and boxes survive height clamping with no omitted panels', () => {
  const p = createDefaultProject(), c = { ...p.cabinets[0], width: 800, height: 2200, depth: 800, plinth: 100, layout: leaf('internal', { front: 'doors', doors: 2, internalDrawerCount: 2, internalDrawerHingeGap: 20 }) };
  const result = resizeApplianceSection(c, 'internal', 'horizontal', 1, p);
  assert.equal(result.possible, true);
  assert.equal(result.clamped, true);
  assert.equal(result.fits, true);
  assert.ok(getInternalDrawerLayout(result.cabinet, p).every(front => front.width > 0 && front.height > 0 && front.box.height > 0 && front.box.width > 2 * front.box.panelThickness && front.box.depth > 2 * front.box.panelThickness));
  assert.deepEqual(validateProject({ ...p, cabinets: [result.cabinet] }).filter(item => item.level === 'error'), []);
  assert.equal(generateParts({ ...p, cabinets: [result.cabinet] }).length, generateParts({ ...p, cabinets: [c] }).length);
});

test('pull-out shelf minimums constrain opening width and usable depth', () => {
  const c = cabinet({ layout: leaf('pull-out', { pullOutShelf: true }) });
  const width = resizeApplianceSection(c, 'pull-out', 'vertical', 1, project);
  near(opening(width.cabinet, 'pull-out').width, 76);
  const depth = setApplianceSectionDepth(c, 'pull-out', 1, project);
  near(opening(depth.cabinet, 'pull-out').usableDepth, 90);
  assert.equal(width.fits, true);
  assert.equal(depth.fits, true);
});

test('edge deductions retain strictly positive drawer blanks at the clamp boundary', () => {
  const p = createDefaultProject(); p.settings.deductEdge = true;
  const c = p.cabinets[0], result = resizeApplianceDivider(c, 'section-top', 'horizontal', 100000, p);
  assert.equal(result.fits, true);
  const parts = generateParts({ ...p, cabinets: [result.cabinet] });
  assert.equal(parts.length, generateParts(p).length);
  assert.ok(parts.every(part => part.width > 0 && part.height > 0));
});

test('an existing bad drawer opening can improve and be renamed without preserving worse deficits', () => {
  const p = createDefaultProject(), c = p.cabinets[0];
  c.layout.sizes = [1330, 50, 648];
  const beforeHeight = getCabinetLayout(c, p).sections.find(s => s.id === 'section-middle').height;
  const repaired = resizeApplianceSection(c, 'section-middle', 'horizontal', 120, p);
  assert.equal(repaired.clamped, false);
  assert.equal(repaired.fits, true);
  const worse = resizeApplianceSection(c, 'section-middle', 'horizontal', 1, p);
  assert.equal(worse.clamped, true);
  near(getCabinetLayout(worse.cabinet, p).sections.find(s => s.id === 'section-middle').height, beforeHeight);
  const renamed = constrainCabinetEdit(c, { ...structuredClone(c), name: 'Другое имя' }, p);
  assert.equal(renamed.possible, true);
  assert.equal(renamed.clamped, false);
  assert.equal(renamed.cabinet.name, 'Другое имя');
});
