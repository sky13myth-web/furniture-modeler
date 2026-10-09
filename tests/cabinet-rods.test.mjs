import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, getRodLayout, getRodCollisions, findFreeRodPosition, generateParts, getFrontLayout, validateProject } from '../src/engine.js';
import { buildRodLayout, rodIntersectsPart, rodIntersectsBox } from '../src/cabinet-rods.js';
import { checkImport, validateRodsSchema } from '../src/project-io.js';
import { constrainCabinetEdit, resizeConstrainedInteriorSection } from '../src/appliance-constraints.js';
import { getHardwareSchedule, getProjectHardwareSchedule } from '../src/hardware.js';

function fixture() {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 2200, depth: 620, layout: { ...createSection('open'), id: 'wardrobe' } });
  return { project, cabinet };
}
const rail = changes => ({ id: 'rail', y: 1500, frontInset: 300, ...changes });
const errors = project => validateProject(project).filter(item => item.level === 'error');
const near = (a, b) => assert.ok(Math.abs(a - b) < .002, `${a} != ${b}`);

test('auto rods use clear width minus two end gaps and are hardware rather than MDF parts', () => {
  const { project, cabinet } = fixture(), parts = generateParts(project);
  cabinet.layout.rods = [rail()];
  const before = structuredClone(project), [rod] = getRodLayout(cabinet, project);
  assert.deepEqual([rod.x, rod.y, rod.z, rod.length, rod.diameter, rod.holders], [20, 1518, 320, 860, 25, 2]);
  assert.deepEqual(rod.position, { x: 20, y: 1518, z: 320 });
  assert.deepEqual(rod.end, { x: 880, y: 1518, z: 320 });
  assert.equal(rod.autoLength, true); assert.equal(rod.sectionId, 'wardrobe');
  assert.deepEqual(generateParts(project), parts);
  assert.deepEqual(getRodCollisions(cabinet, project), []); assert.deepEqual(errors(project), []);
  assert.deepEqual(project, before);
});

test('manual lengths stay centred and axes follow local plinth, open floor and local rear plane', () => {
  const { project, cabinet } = fixture();
  Object.assign(cabinet, { includeBack: false, backThickness: 8, backMaterialId: 'hdf-back' });
  Object.assign(cabinet.layout, { plinthHeight: 180, back: 'solid', rods: [rail({ length: 500, y: 300, frontInset: 100, diameter: 30 })] });
  let [rod] = getRodLayout(cabinet, project);
  assert.deepEqual([rod.x, rod.y, rod.z, rod.length, rod.autoLength, rod.opening.rearOffset], [200, 398, 520, 500, false, 8]);
  assert.equal(cabinet.plinth + rod.y, 498);
  cabinet.layout.floor = 'open';
  [rod] = getRodLayout(cabinet, project);
  assert.equal(rod.y, 200); assert.equal(cabinet.plinth + rod.y, 300);
  assert.deepEqual(errors(project), []);
});

test('inside high doors an upper open compartment can carry a rod above independent drawers', () => {
  const { project, cabinet } = fixture();
  cabinet.layout.front = 'doors'; cabinet.layout.doors = 2;
  cabinet.layout.interiorLayout = { id: 'inside', kind: 'split', axis: 'horizontal', sizes: [1300, 746], children: [
    { id: 'hanging', kind: 'section', front: 'open', rods: [rail({ y: 1000 })] },
    { id: 'drawers', kind: 'section', front: 'drawers', drawers: 2 }
  ] };
  const fronts = getFrontLayout(cabinet, project), [rod] = getRodLayout(cabinet, project);
  assert.equal(rod.sectionId, 'wardrobe'); assert.equal(rod.interiorSectionId, 'hanging');
  assert.equal(rod.y, 1782);
  assert.deepEqual(errors(project), []); assert.deepEqual(getRodCollisions(cabinet, project), []);
  assert.deepEqual(getFrontLayout(cabinet, project), fronts);
  const schedule = getHardwareSchedule(cabinet, project);
  assert.deepEqual(schedule.rows.filter(row => row.kind === 'rod').map(row => [row.sectionId, row.interiorSectionId, row.length]), [['wardrobe', 'hanging', 860]]);
  const position = findFreeRodPosition(cabinet, project, 'hanging'); assert.ok(position);
  assert.equal(findFreeRodPosition(cabinet, project, 'wardrobe'), null);
});

test('same rod ID in distinct side-by-side leaves keeps each section width and metadata independent', () => {
  const { project, cabinet } = fixture();
  cabinet.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [1, 1], children: [
    { ...createSection('open'), id: 'left', rods: [rail()] }, { ...createSection('doors'), id: 'right', rods: [rail()] }
  ] };
  const rods = getRodLayout(cabinet, project);
  assert.deepEqual(rods.map(rod => [rod.sectionId, rod.x, rod.length]), [['left', 20, 419], ['right', 461, 419]]);
  assert.equal(new Set(rods.map(rod => rod.id)).size, 2);
  assert.deepEqual(errors(project), []);
});

test('schema is bounded and strict while optional auto length and diameter remain backward compatible', () => {
  assert.equal(validateRodsSchema(undefined), undefined);
  validateRodsSchema([rail({ length: null }), rail({ id: 'second', length: 300, diameter: 40 })]);
  for (const bad of [[rail({ y: -1 })], [rail({ frontInset: undefined })], [rail({ length: 0 })], [rail({ diameter: '25' })], [rail({ diameter: 0 })], [rail(), rail()], Array.from({ length: 13 }, (_, i) => rail({ id: `r${i}` }))]) assert.throws(() => validateRodsSchema(bad));
  const { project, cabinet } = fixture(); cabinet.layout.rods = [rail()];
  project.settings.pricing = { rodPricePerMeter: 0, rodHolderPrice: 1e9 };
  assert.equal(checkImport(project), project);
  assert.deepEqual(checkImport(JSON.parse(JSON.stringify(project))), project);
  for (const key of ['rodPricePerMeter', 'rodHolderPrice']) for (const bad of [-1, Infinity, '3', 1e9 + 1]) {
    const altered = structuredClone(project); altered.settings.pricing[key] = bad; assert.throws(() => checkImport(altered));
  }
});

test('full cylinder bounds reject short upper/lower/front/rear clearance or an excessive manual length', () => {
  for (const change of [{ y: 1 }, { y: 2060 }, { frontInset: 1 }, { frontInset: 615 }, { length: 863 }]) {
    const { project, cabinet } = fixture(); cabinet.layout.rods = [rail(change)];
    assert.ok(errors(project).some(item => item.message.includes('штанга не помещается')));
  }
});

test('real shelves and rear braces collide with cylinders, and separated rods do not', () => {
  const { project, cabinet } = fixture(); cabinet.layout.shelves = 1;
  const section = getCabinetLayout(cabinet, project).sections[0];
  cabinet.layout.rods = [rail({ y: section.height / 2 + 9 })];
  assert.ok(getRodCollisions(cabinet, project).some(item => item.kind === 'panel'));
  assert.ok(errors(project).some(item => item.message.includes('пересекается с панелью')));
  cabinet.layout.rods[0].y = 300;
  assert.deepEqual(errors(project), []);
  Object.assign(cabinet, { includeBack: false });
  Object.assign(cabinet.layout, { shelves: 0, back: 'braces', rearBraces: [{ id: 'brace', y: 280, height: 80 }], rods: [rail({ y: 300, frontInset: 602 })] });
  assert.ok(getRodCollisions(cabinet, project).some(item => item.kind === 'panel'));
  cabinet.layout.rods = [rail({ y: 300 }), rail({ id: 'nearby', y: 320 })];
  assert.ok(getRodCollisions(cabinet, project).some(item => item.kind === 'rod'));
  cabinet.layout.rods[1].y = 325;
  assert.equal(getRodCollisions(cabinet, project).some(item => item.kind === 'rod'), false, 'tangent cylinders do not overlap');
});

test('drawers, machines and inactive outer rods receive explicit conflicts instead of disappearing', () => {
  const { project, cabinet } = fixture(); cabinet.layout.front = 'drawers'; cabinet.layout.drawers = 2; cabinet.layout.rods = [rail({ y: 300 })];
  assert.ok(errors(project).some(item => item.message.includes('штанги в секции')));
  assert.ok(getRodCollisions(cabinet, project).some(item => item.kind === 'drawer'));
  cabinet.layout.front = 'open'; cabinet.layout.appliance = { type: 'custom', width: 600, height: 850, depth: 500 };
  assert.ok(getRodCollisions(cabinet, project).some(item => item.kind === 'appliance'));
  assert.equal(findFreeRodPosition(cabinet, project, 'wardrobe'), null);
  delete cabinet.layout.appliance; cabinet.layout.front = 'doors';
  cabinet.layout.interiorLayout = { id: 'inside', kind: 'section', front: 'open' };
  assert.ok(errors(project).some(item => item.message.includes('штанги в секции')));
});

test('finished shaped panels exclude an empty notch and circular sections avoid bounding-box false positives', () => {
  const rod = { x: 0, y: 10, z: 30, length: 80, diameter: 10 };
  const part = { position: { x: 0, y: 0, z: 0 }, orientation: 'horizontal', thickness: 20, width: 100, height: 100,
    finishedOutline: [{ x: 80, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 50 }, { x: 80, y: 50 }] };
  assert.equal(rodIntersectsPart(rod, part), false);
  assert.equal(rodIntersectsPart({ ...rod, z: 70 }, part), true);
  assert.equal(rodIntersectsBox({ x: 0, y: 0, z: 0, length: 100, diameter: 20 }, { x: 10, y: 8, z: 8, width: 10, height: 10, depth: 10 }), false);
});

test('free starter position avoids a shelf at the proposed initial height and preserves all inputs', () => {
  const { project, cabinet } = fixture(); cabinet.layout.shelves = 1;
  cabinet.height = 436; // opening300: H−150 coincides with shelf bottom150
  const before = structuredClone(project), position = findFreeRodPosition(cabinet, project, 'wardrobe');
  assert.ok(position); assert.notEqual(position.y, 150);
  assert.deepEqual(project, before);
  cabinet.layout.rods = [rail(position)]; assert.deepEqual(errors(project), []);
  const impossible = { sections: [{ id: 'short', node: { rods: [rail()] }, x: 0, y: 0, width: 0, height: 0, depth: 0 }] };
  assert.equal(buildRodLayout(impossible).length, 1, 'invalid source remains observable for validation');
});

test('global resize clamps at a manual rod length, height and rear offset without mutating the project', () => {
  const { project, cabinet } = fixture(); cabinet.layout.rods = [rail({ length: 700 })];
  const before = structuredClone(project);
  let result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), width: 600 }, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, true); near(result.cabinet.width, 740);
  assert.deepEqual(errors({ ...project, cabinets: [result.cabinet] }), []);
  result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), height: 1400 }, project);
  assert.equal(result.clamped, true); near(result.cabinet.height, 1648.5);
  result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), depth: 250 }, project);
  assert.equal(result.clamped, true); near(result.cabinet.depth, 315.5);
  assert.deepEqual(project, before);
});

test('a resize stops before a moving shelf reaches a fixed-height rod, using actual cylinder tangency', () => {
  const { project, cabinet } = fixture(); cabinet.layout.shelves = 1; cabinet.layout.rods = [rail()];
  const proposed = { ...structuredClone(cabinet), height: 3100 };
  assert.ok(getRodCollisions(proposed, project).length);
  const result = constrainCabinetEdit(cabinet, proposed, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, true);
  near(result.cabinet.height, 3093.002);
  assert.deepEqual(getRodCollisions(result.cabinet, project), []);
});

test('internal opening resize protects its rod while unrelated doors and drawer contents survive', () => {
  const { project, cabinet } = fixture(); cabinet.layout.front = 'doors';
  cabinet.layout.interiorLayout = { id: 'inside', kind: 'split', axis: 'horizontal', sizes: [1300, 746], children: [
    { id: 'hanging', kind: 'section', front: 'open', rods: [rail({ y: 1000 })] },
    { id: 'drawers', kind: 'section', front: 'drawers', drawers: 2 }
  ] };
  const before = structuredClone(project), fronts = getFrontLayout(cabinet, project);
  const result = resizeConstrainedInteriorSection(cabinet, 'wardrobe', 'hanging', 'horizontal', 100, project);
  assert.equal(result.clamped, true); assert.equal(result.possible, true);
  near(getCabinetLayout(result.cabinet, project).internalSections.find(section => section.id === 'hanging').height, 1012.5);
  assert.deepEqual(getFrontLayout(result.cabinet, project), fronts);
  assert.deepEqual(errors({ ...project, cabinets: [result.cabinet] }), []);
  assert.deepEqual(project, before);
});

test('an automatic rod follows a narrower opening and a second starter stays clear of the first rod', () => {
  const { project, cabinet } = fixture();
  const position = findFreeRodPosition(cabinet, project, 'wardrobe');
  cabinet.layout.rods = [rail(position)];
  const another = findFreeRodPosition(cabinet, project, 'wardrobe');
  assert.ok(another); assert.notEqual(another.y, position.y);
  cabinet.layout.rods.push(rail({ ...another, id: 'second' }));
  assert.deepEqual(errors(project), []);
  const result = constrainCabinetEdit(cabinet, { ...structuredClone(cabinet), width: 600 }, project);
  assert.equal(result.clamped, false);
  assert.deepEqual(getRodLayout(result.cabinet, project).map(rod => rod.length), [560, 560]);
});

test('the hardware schedule adds rod length and exactly two holders while guides stay unchanged', () => {
  const { project, cabinet } = fixture(); cabinet.layout.front = 'doors'; cabinet.layout.rods = [rail()];
  const schedule = getHardwareSchedule(cabinet, project);
  assert.deepEqual(schedule.totals, { handles: 2, guideSets: 0, hinges: 10, rods: 1, rodHolders: 2, rodLengthMeters: .86 });
  assert.deepEqual(schedule.rows.filter(row => row.kind === 'rod').map(row => [row.quantity, row.unit, row.length, row.lengthMeters]), [[1, 'pcs', 860, .86]]);
  assert.equal(schedule.rows.find(row => row.kind === 'rod-holder').quantity, 2);
  const second = structuredClone(cabinet); second.id = 'other'; second.x = 2000; second.layout.id = 'other-section'; second.layout.rods[0].length = 500;
  project.cabinets.push(second);
  const totals = getProjectHardwareSchedule(project).totals;
  assert.deepEqual([totals.rods, totals.rodHolders, totals.guideSets], [2, 4, 0]); near(totals.rodLengthMeters, 1.36);
});
