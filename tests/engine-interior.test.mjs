import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getFrontLayout, getInternalDrawerLayout, generateParts, getSectionMountingAxes, validateProject, optimizeCutting } from '../src/engine.js';
import { resizeInteriorDivider } from '../src/cabinet-interior.js';
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

test('internal panels follow local rear offset and a local raised bottom, and reject full-opening shelves', () => {
  const { project, c } = fixture();
  Object.assign(c, { plinth: 0, includeBack: false, backThickness: 8, backMaterialId: 'hdf-back' });
  Object.assign(c.layout, { plinthHeight: 100, back: 'solid', interiorLayout: { id: 'inner-open', kind: 'section', front: 'open', shelves: 1, pullOutShelf: true, depth: 500 } });
  let layout = getCabinetLayout(c, project), inner = layout.internalSections[0];
  assert.deepEqual([inner.y, inner.height, inner.depth, inner.rearOffset, inner.usableDepth], [118, 2064, 500, 8, 492]);
  const parts = generateParts(project), shelf = parts.find(p => p.component === 'interior-shelf'), pull = parts.find(p => p.pullOutShelf);
  assert.equal(shelf.position.z, 8); assert.equal(shelf.finishedHeight, 472);
  assert.deepEqual([pull.position.y, pull.position.z, pull.finishedHeight, pull.interiorSectionId], [123, 28, 452, 'inner-open']);
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
  assert.ok(sections[1].height > 152); assert.ok(sections[1].height < 152.01);
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
