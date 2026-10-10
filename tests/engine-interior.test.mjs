import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getFrontLayout, getInternalDrawerLayout, generateParts, getSectionMountingAxes, validateProject, optimizeCutting } from '../src/engine.js';
import { resizeInteriorDivider } from '../src/cabinet-interior.js';
import { createInteriorFromSection } from '../src/cabinet-interior.js';
import { getRodLayout } from '../src/engine.js';
import { checkImport } from '../src/project-io.js';
import { constrainCabinetEdit, resizeConstrainedInteriorSection, resizeConstrainedInteriorDivider } from '../src/appliance-constraints.js';

function fixture() {
  const project = createDefaultProject('ru'), c = project.cabinets[0];
  Object.assign(c, { width: 900, height: 2200, depth: 620 });
  c.layout = { ...createSection('doors'), id: 'outer', internalDrawerHingeGap: 20 };
  return { project, c };
}
function interior() {
  return { id: 'inner', kind: 'split', axis: 'horizontal', sizes: [1400, 646], children: [
    { id: 'storage', kind: 'section', front: 'open', shelves: 2, depth: null },
    { id: 'bottom-drawers', kind: 'section', front: 'drawers', drawers: 3, shelves: 0, depth: null }
  ] };
}
const errors = p => validateProject(p).filter(item => item.level === 'error');

test('removing outer doors retains inner shelves, rods, partitions and drawers with no hinge side allowance', () => {
  const { project, c } = fixture(); c.layout.interiorLayout = interior();
  c.layout.interiorLayout.children[0].shelves = 0;
  c.layout.interiorLayout.children[0].rods = [{ id: 'hanging', y: 1000, frontInset: 300 }];
  const before = getCabinetLayout(c, project), rods = getRodLayout(c, project), drawers = getInternalDrawerLayout(c, project), parts = generateParts(project);
  const proposed = structuredClone(c); proposed.layout.front = 'open';
  const result = constrainCabinetEdit(c, proposed, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, false);
  const next = result.cabinet, after = getCabinetLayout(next, project);
  assert.deepEqual(after.internalSections.map(s => [s.id, s.x, s.y, s.width, s.height]), before.internalSections.map(s => [s.id, s.x, s.y, s.width, s.height]));
  assert.deepEqual(after.internalPartitions, before.internalPartitions);
  assert.deepEqual(getRodLayout(next, project), rods);
  assert.equal(getFrontLayout(next, project).length, 0);
  assert.deepEqual(getInternalDrawerLayout(next, project).map((d, i) => [d.box.width - drawers[i].box.width, d.width - drawers[i].width, d.hingeGap]), [[40, 40, 0], [40, 40, 0], [40, 40, 0]]);
  assert.equal(generateParts({ ...project, cabinets: [next] }).length, parts.length - 2);
  assert.deepEqual(errors({ ...project, cabinets: [next] }), []);
  assert.equal(checkImport({ ...project, cabinets: [next] }).cabinets[0], next);
});

test('legacy internal drawers also remain after removing doors and their optional data roundtrips', () => {
  const { project, c } = fixture(); c.layout.internalDrawerCount = 2;
  const closed = getInternalDrawerLayout(c, project);
  c.layout.front = 'open';
  const open = getInternalDrawerLayout(c, project);
  assert.equal(open.length, 2); assert.equal(open[0].box.width - closed[0].box.width, 40);
  assert.equal(open[0].hingeGap, 0); assert.equal(generateParts(project).filter(p => p.internalDrawerIndex !== undefined).length, 12);
  assert.deepEqual(errors(project), []);
  assert.deepEqual(checkImport(JSON.parse(JSON.stringify(project))), project);
});

test('explicit interior conversion keeps the physical upper rods and separates a legacy lower drawer stack', () => {
  const { project, c } = fixture(); c.layout.internalDrawerCount = 2;
  c.layout.rods = [{ id: 'upper', y: 2040, frontInset: 300, diameter: 25 }];
  assert.deepEqual(errors(project), []);
  const section = getCabinetLayout(c, project).sections[0], before = structuredClone(project), rods = getRodLayout(c, project);
  const tree = createInteriorFromSection(section, 18); assert.ok(tree);
  assert.equal(tree.children[0].front, 'open'); assert.equal(tree.children[1].drawers, 2);
  const proposed = structuredClone(c); proposed.layout.interiorLayout = tree; delete proposed.layout.rods; delete proposed.layout.internalDrawerCount;
  const result = constrainCabinetEdit(c, proposed, project);
  assert.equal(result.possible, true); assert.deepEqual(errors({ ...project, cabinets: [result.cabinet] }), []);
  const convertedRod = getRodLayout(result.cabinet, project)[0];
  assert.deepEqual([convertedRod.x, convertedRod.y, convertedRod.z, convertedRod.length], [rods[0].x, rods[0].y, rods[0].z, rods[0].length]);
  assert.ok(convertedRod.interiorSectionId); assert.equal(getInternalDrawerLayout(result.cabinet, project).length, 2);
  assert.deepEqual(project, before);
  const unsafe = { ...section, node: { ...section.node, rods: [{ id: 'low', y: 15, frontInset: 600, diameter: 20 }] } };
  assert.equal(createInteriorFromSection(unsafe, 18), null);
});

test('interior conversion of a plain opening preserves rods, shelves and pull-out metadata without migration by import', () => {
  const { project, c } = fixture(); Object.assign(c.layout, { front: 'open', shelves: 1, pullOutShelf: true, rods: [{ id: 'rod', y: 1500, frontInset: 300 }] });
  const section = getCabinetLayout(c, project).sections[0], before = structuredClone(section.node), tree = createInteriorFromSection(section, 18);
  assert.equal(tree.front, 'open'); assert.equal(tree.shelves, 1); assert.equal(tree.pullOutShelf, true); assert.deepEqual(tree.rods, before.rods);
  tree.rods[0].y = 1; assert.deepEqual(section.node, before);
  assert.equal(createInteriorFromSection({ ...section, node: { ...section.node, interiorLayout: tree } }), null);
});

test('an imported interior drawer leaf without an explicit count uses the schema default of two', () => {
  const { project, c } = fixture();
  c.layout.interiorLayout = { id: 'inner-drawers', kind: 'section', front: 'drawers', shelves: 0 };
  const drawers = getInternalDrawerLayout(c, project);
  assert.equal(drawers.length, 2);
  assert.deepEqual(drawers.map(d => d.interiorSectionId), ['inner-drawers', 'inner-drawers']);
  assert.equal(generateParts(project).filter(p => p.internalDrawerIndex !== undefined).length, 12);
  assert.deepEqual(errors(project), []);
});

test('one tall pair of outer doors retains dimensions around independent storage and lower internal drawers', () => {
  const { project, c } = fixture();
  const fronts = getFrontLayout(c, project), previousParts = generateParts(project);
  c.layout.interiorLayout = interior(); c.layout.internalDrawerCount = 12;
  const layout = getCabinetLayout(c, project);
  assert.equal(layout.sections.length, 1); assert.equal(layout.partitions.length, 0);
  assert.deepEqual(layout.internalSections.map(s => [s.id, s.y, s.height]), [['storage', 682, 1400], ['bottom-drawers', 18, 646]]);
  assert.equal(layout.internalPartitions[0].parentSectionId, 'outer');
  assert.deepEqual(getFrontLayout(c, project), fronts);
  const drawers = getInternalDrawerLayout(c, project);
  assert.equal(drawers.length, 3);
  assert.equal(drawers.every(d => d.sectionId === 'outer' && d.interiorSectionId === 'bottom-drawers' && d.y >= 18 && d.y + d.height <= 664), true);
  const parts = generateParts(project);
  assert.equal(parts.length, previousParts.length + 21);
  assert.equal(parts.filter(p => p.internalDrawerIndex !== undefined).length, 18);
  assert.equal(parts.filter(p => p.component === 'interior-partition').length, 1);
  assert.equal(parts.filter(p => p.component === 'interior-shelf').length, 2);
  assert.equal(parts.filter(p => p.internalDrawerIndex !== undefined).every(p => p.interiorSectionId === 'bottom-drawers' && p.position && p.sectionId === 'outer'), true);
  assert.deepEqual(errors(project), []);
  const cutting = optimizeCutting(parts, project.materials, project.settings);
  assert.equal(cutting.unplaced.length, 0); assert.equal(cutting.totalParts, parts.length);
  const axis = getSectionMountingAxes(c, project).find(a => a.id === 'bottom-drawers');
  assert.deepEqual([axis.bottom, axis.top, axis.height], [109, 773, 664]);
});

test('side-by-side internal drawer columns share a sequential outer index and apply hinge clearance only at the outer edges', () => {
  const { project, c } = fixture();
  c.layout.interiorLayout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { id: 'left-drawers', kind: 'section', front: 'drawers', drawers: 2, shelves: 0 },
    { id: 'right-drawers', kind: 'section', front: 'drawers', drawers: 2, shelves: 0 }
  ] };
  const drawers = getInternalDrawerLayout(c, project);
  assert.deepEqual(drawers.map(d => [d.index, d.sectionId, d.interiorSectionId, d.width, d.box.width]), [[0, 'outer', 'left-drawers', 399, 377], [1, 'outer', 'left-drawers', 399, 377], [2, 'outer', 'right-drawers', 399, 377], [3, 'outer', 'right-drawers', 399, 377]]);
  assert.equal(drawers[0].x, 40); assert.equal(drawers[2].x, 461);
  assert.deepEqual(errors(project), []);
});

test('an internal divider edit clamps at real drawer box minima while keeping the outer doors unchanged', () => {
  const { project, c } = fixture(); c.layout.interiorLayout = interior();
  const outer = getCabinetLayout(c, project).sections[0], proposed = structuredClone(c), fronts = getFrontLayout(c, project);
  proposed.layout.interiorLayout = resizeInteriorDivider(outer, 'inner-divider-0', 'horizontal', 1900, 18);
  assert.ok(proposed.layout.interiorLayout);
  assert.ok(errors({ ...project, cabinets: [proposed] }).some(e => e.message.includes('внутренний ящик')));
  const result = constrainCabinetEdit(c, proposed, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, true);
  assert.ok(getCabinetLayout(result.cabinet, project).internalSections[1].height > 202);
  assert.deepEqual(errors({ ...project, cabinets: [result.cabinet] }), []);
  assert.equal(generateParts({ ...project, cabinets: [result.cabinet] }).filter(p => p.internalDrawerIndex !== undefined).length, 18);
  assert.deepEqual(getFrontLayout(result.cabinet, project), fronts);
  assert.equal(c.layout.interiorLayout.sizes[0], 1400);
});

test('internal panels follow the shared rear reservation and a local raised bottom, and reject full-opening shelves', () => {
  const { project, c } = fixture();
  Object.assign(c, { plinth: 0, includeBack: false, backThickness: 8, backMaterialId: 'hdf-back' });
  Object.assign(c.layout, { plinthHeight: 100, back: 'solid', interiorLayout: { id: 'inner-open', kind: 'section', front: 'open', shelves: 1, pullOutShelf: true, depth: 500 } });
  let layout = getCabinetLayout(c, project), inner = layout.internalSections[0];
  assert.deepEqual([inner.y, inner.height, inner.depth, inner.rearOffset, inner.usableDepth], [118, 2064, 500, 0, 500]);
  const parts = generateParts(project), shelf = parts.find(p => p.component === 'interior-shelf'), pull = parts.find(p => p.pullOutShelf);
  assert.equal(shelf.position.z, 8); assert.equal(shelf.finishedHeight, 480);
  assert.deepEqual([pull.position.y, pull.position.z, pull.finishedHeight, pull.interiorSectionId], [123, 28, 460, 'inner-open']);
  assert.deepEqual(errors(project), []);
  c.layout.shelves = 1;
  assert.ok(errors(project).some(e => e.message.includes('пересекают внутреннее наполнение')));
});

test('interior explicit depths and unusable drawer sections participate in validation and numeric constraints', () => {
  const { project, c } = fixture(); c.layout.interiorLayout = interior();
  c.layout.interiorLayout.children[1].depth = 700;
  assert.ok(errors(project).some(e => e.message.includes('глубина секции')));
  c.layout.interiorLayout.children[1].depth = null;
  const proposal = structuredClone(c); proposal.depth = 40;
  const result = constrainCabinetEdit(c, proposal, project);
  assert.equal(result.clamped, true);
  assert.deepEqual(errors({ ...project, cabinets: [result.cabinet] }), []);
});

test('extreme internal section requests stop at 50 mm while preserving the third opening and all inputs', () => {
  const { project, c } = fixture();
  c.layout.interiorLayout = { id: 'three-columns', kind: 'split', axis: 'vertical', sizes: [1, 1, 1], children: ['first', 'second', 'third'].map(id => ({ id, kind: 'section', front: 'open', shelves: 0 })) };
  const before = structuredClone(project), result = resizeConstrainedInteriorSection(c, 'outer', 'first', 'vertical', -100000, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, true); assert.equal(result.fits, true);
  const sections = getCabinetLayout(result.cabinet, project).internalSections;
  assert.ok(Math.abs(sections[0].width - 50) < .00001);
  assert.ok(Math.abs(sections[1].width - 502) < .00001);
  assert.equal(sections[2].width, 276); assert.equal(sections[2].x, 606);
  assert.deepEqual(project, before);
  result.cabinet.layout.interiorLayout.children[0].name = 'Detached result';
  assert.deepEqual(project, before);
});

test('an extreme internal divider request uses its before-child size and stops at the neighboring box minimum', () => {
  const { project, c } = fixture();
  c.layout.interiorLayout = { id: 'three-rows', kind: 'split', axis: 'horizontal', sizes: [1000, 700, 328], children: [
    { id: 'top', kind: 'section', front: 'open', shelves: 1 },
    { id: 'middle', kind: 'section', front: 'drawers', drawers: 2, shelves: 0 },
    { id: 'bottom', kind: 'section', front: 'open', shelves: 0 }
  ] };
  const before = structuredClone(project), fronts = getFrontLayout(c, project);
  const result = resizeConstrainedInteriorDivider(c, 'outer', 'three-rows-divider-0', 'horizontal', 100000, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, true); assert.equal(result.fits, true);
  const sections = getCabinetLayout(result.cabinet, project).internalSections;
  // Two applied upper bands need 2 mm more than the previous unedged blanks.
  assert.ok(sections[1].height > 154); assert.ok(sections[1].height < 154.01);
  assert.equal(sections[2].height, 328); assert.ok(Math.abs(sections[2].y - 18) < 1e-10);
  assert.deepEqual(errors({ ...project, cabinets: [result.cabinet] }), []);
  assert.equal(generateParts({ ...project, cabinets: [result.cabinet] }).filter(p => p.internalDrawerIndex !== undefined).length, 12);
  assert.deepEqual(getFrontLayout(result.cabinet, project), fronts);
  assert.deepEqual(project, before);
  const beforeChildAlias = resizeConstrainedInteriorDivider(c, 'outer', 'top', 'horizontal', 100000, project);
  assert.deepEqual(beforeChildAlias.cabinet, result.cabinet);
});

test('a valid interior size passes unchanged and unknown targets reject without mutation', () => {
  const { project, c } = fixture(); c.layout.interiorLayout = interior();
  const before = structuredClone(project), result = resizeConstrainedInteriorSection(c, 'outer', 'storage', 'horizontal', 1300, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, false);
  assert.equal(getCabinetLayout(result.cabinet, project).internalSections[0].height, 1300);
  for (const args of [['missing-parent', 'storage', 'horizontal', 100], ['outer', 'missing-leaf', 'horizontal', 100], ['outer', 'storage', 'invalid', 100], ['outer', 'storage', 'horizontal', NaN]]) {
    const rejected = resizeConstrainedInteriorSection(c, ...args, project);
    assert.equal(rejected.possible, false); assert.deepEqual(rejected.cabinet, c);
  }
  assert.equal(resizeConstrainedInteriorDivider(c, 'outer', 'inner-divider-0', 'vertical', 100, project).possible, false);
  assert.deepEqual(project, before);
});
