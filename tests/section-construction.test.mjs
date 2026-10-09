import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, getCabinetLayout, generateParts, getSectionMountingAxes, validateProject, splitSection } from '../src/engine.js';
import { constrainCabinetEdit } from '../src/appliance-constraints.js';

function fixture() {
  const project = createDefaultProject('ru'), c = project.cabinets[0];
  Object.assign(c, { width: 1218, height: 2400, depth: 700, plinth: 0, includeBack: false, sidesToFloor: true, backThickness: 8, backMaterialId: 'hdf-back' });
  c.layout = { id: 'columns', kind: 'split', axis: 'vertical', sizes: [582, 582], children: [
    { ...createSection('open'), id: 'laundry', floor: 'open', back: 'none' },
    { ...createSection('doors'), id: 'door', plinthHeight: 100, back: 'none' }
  ] };
  return { project, c };
}
const errors = p => validateProject(p).filter(item => item.level === 'error');

test('a side plinth raises only its own bottom and doors while the laundry column remains floor open', () => {
  const { project, c } = fixture();
  const layout = getCabinetLayout(c, project), [left, right] = layout.sections;
  assert.deepEqual([left.y, left.height, left.effectivePlinth, left.floorExtra], [0, 2382, 0, 18]);
  assert.deepEqual([right.y, right.height, right.effectivePlinth, right.floorExtra], [118, 2264, 100, -100]);
  assert.deepEqual([right.frontY, right.frontHeight], [102, 2296]);
  const parts = generateParts(project), bottom = parts.find(p => p.role === 'bottom'), plinth = parts.find(p => p.role === 'plinth');
  assert.equal(bottom.sectionId, 'door');
  assert.deepEqual([bottom.position.x, bottom.position.y, bottom.finishedWidth], [618, 100, 582]);
  assert.deepEqual([plinth.position.y, plinth.finishedHeight, plinth.sectionId], [0, 90, 'door']);
  assert.equal(parts.find(p => p.name.startsWith('Вертикальная перегородка')).position.y, 0);
  const axes = getSectionMountingAxes(c, project);
  assert.equal(axes.find(a => a.id === 'laundry').bottom, null);
  assert.equal(axes.find(a => a.id === 'door').bottom, 109);
  assert.deepEqual(errors(project), []);
});

test('local plinth coordinates remain body relative under an inherited global plinth and floor mode wins', () => {
  const { project, c } = fixture(); c.plinth = 100;
  let [left, right] = getCabinetLayout(c, project).sections;
  assert.equal(left.y, -100); assert.equal(right.y, 18);
  assert.equal(generateParts(project).find(p => p.role === 'bottom').position.y, 0);
  c.layout.children[1].plinthHeight = 50;
  right = getCabinetLayout(c, project).sections[1];
  assert.equal(right.y, -32); assert.equal(right.floorExtra, 50);
  c.layout.children[1].floor = 'open';
  right = getCabinetLayout(c, project).sections[1];
  assert.equal(right.y, -100); assert.equal(right.effectivePlinth, 0);
  assert.equal(generateParts(project).filter(p => p.role === 'bottom' || p.role === 'plinth').length, 0);
});

test('raising a local plinth clamps to the appliance minimum without changing the other column', () => {
  const { project, c } = fixture();
  const right = c.layout.children[1]; Object.assign(right, { front: 'open', appliance: { type: 'custom', label: 'Машина', width: 500, height: 2100, depth: 600 } });
  const proposal = structuredClone(c); proposal.layout.children[1].plinthHeight = 500;
  const result = constrainCabinetEdit(c, proposal, project);
  assert.equal(result.possible, true); assert.equal(result.clamped, true);
  assert.ok(Math.abs(result.cabinet.layout.children[1].plinthHeight - 264) < .01);
  assert.equal(getCabinetLayout(result.cabinet, project).sections[0].height, 2382);
  assert.deepEqual(c.layout.children[1].plinthHeight, 100);
});

test('a horizontal split transfers the local plinth only to its lower child', () => {
  const { project, c } = fixture();
  assert.equal(splitSection(c, 'door', 'horizontal'), true);
  const children = c.layout.children[1].children;
  assert.equal(children[0].plinthHeight, undefined); assert.equal(children[1].plinthHeight, 100);
  const lower = getCabinetLayout(c, project).sections.find(s => s.id === children[1].id);
  assert.equal(lower.y, 118);
});

test('full back ignores local omissions and local rails, retaining legacy global rails', () => {
  const { project, c } = fixture(); c.includeBack = true;
  Object.assign(c.layout.children[1], { back: 'braces', rearBraces: [{ id: 'local', y: 9000, height: 100 }] });
  // Semantic out-of-opening geometry is ignored by the full rear wall;
  // schema bounds are deliberately respected in real saved projects.
  c.layout.children[1].rearBraces[0].y = 2300;
  c.rearBraces = [{ id: 'legacy', y: 2000, height: 100 }];
  const parts = generateParts(project);
  assert.equal(parts.filter(p => p.role === 'back').length, 1);
  assert.deepEqual(parts.filter(p => p.role === 'brace').map(p => p.braceId), ['legacy']);
  assert.equal(getCabinetLayout(c, project).sections[1].backMode, 'global');
  assert.deepEqual(errors(project), []);
});

test('a local solid back has opening bounds and reduces only that opening usable depth', () => {
  const { project, c } = fixture();
  const right = c.layout.children[1]; right.back = 'solid'; right.shelves = 1;
  const [left, section] = getCabinetLayout(c, project).sections;
  assert.equal(left.usableDepth, 700); assert.equal(section.usableDepth, 692);
  const parts = generateParts(project), rear = parts.find(p => p.role === 'section-back');
  assert.deepEqual([rear.position.x, rear.position.y, rear.finishedWidth, rear.finishedHeight], [618, 118, 582, 2264]);
  const shelf = parts.find(p => p.sectionId === 'door' && p.name.includes('полка'));
  assert.equal(shelf.position.z, 8); assert.equal(shelf.finishedHeight, 672);
  assert.deepEqual(errors(project), []);
});

test('local rails stay inside their own opening, use actual opening bottom and detect collisions', () => {
  const { project, c } = fixture(); const right = c.layout.children[1];
  Object.assign(right, { back: 'braces', rearBraces: [{ id: 'rail', y: 20, height: 100 }] });
  const rail = generateParts(project).find(p => p.role === 'brace');
  assert.deepEqual([rail.position.x, rail.position.y, rail.position.z, rail.finishedWidth, rail.sectionId, rail.braceBaseY], [618, 138, 0, 582, 'door', 118]);
  assert.equal(getCabinetLayout(c, project).sections[1].usableDepth, 700);
  right.rearBraces.push({ id: 'coincident', y: 40, height: 100 });
  assert.ok(errors(project).some(e => e.message.includes('перемычки пересекаются')));
  right.rearBraces = [{ id: 'rail', y: 0, height: 100 }];
  Object.assign(right, { front: 'open', appliance: { type: 'custom', label: 'Машина', width: 500, height: 900, depth: 690 } });
  assert.ok(errors(project).some(e => e.message.includes('перемычка пересекает технику')));
  right.rearBraces[0].y = 1000;
  assert.deepEqual(errors(project), []);
  right.rearBraces[0].y = 2250;
  assert.ok(errors(project).some(e => e.message.includes('перемычка выходит за высоту секции')));
});

test('every positive section plinth retains its own bottom when the global bottom checkbox is off', () => {
  const { project, c } = fixture(); c.includeBottom = false;
  const sections = getCabinetLayout(c, project).sections, parts = generateParts(project);
  assert.deepEqual(sections.map(s => [s.id, s.hasBottom, s.y]), [['laundry', false, 0], ['door', true, 118]]);
  const bottoms = parts.filter(p => p.role === 'bottom');
  assert.equal(bottoms.length, 1);
  assert.deepEqual([bottoms[0].sectionId, bottoms[0].position.x, bottoms[0].position.y, bottoms[0].finishedWidth], ['door', 618, 100, 582]);
  assert.equal(getSectionMountingAxes(c, project).find(a => a.id === 'door').bottom, 109);
  assert.deepEqual(errors(project), []);
  c.layout.children[1].plinthHeight = 0;
  assert.equal(generateParts(project).some(p => p.role === 'bottom'), false);
  assert.equal(getCabinetLayout(c, project).sections[1].y, 0);
});

test('a positive inherited plinth also retains a bottom and floor-open still overrides it', () => {
  const { project, c } = fixture(); c.includeBottom = false; c.plinth = 100;
  delete c.layout.children[1].plinthHeight;
  let right = getCabinetLayout(c, project).sections[1];
  assert.equal(right.hasBottom, true); assert.equal(right.y, 18);
  const bottom = generateParts(project).find(p => p.role === 'bottom');
  assert.equal(bottom.position.y, 0);
  c.layout.children[1].floor = 'open';
  right = getCabinetLayout(c, project).sections[1];
  assert.equal(right.hasBottom, false); assert.equal(right.y, -100);
  assert.equal(generateParts(project).some(p => p.role === 'bottom' || p.role === 'plinth'), false);
});

test('physical lower dividers follow unequal section bases while their editing nodes stay nominal', () => {
  const { project, c } = fixture(); c.plinth = 100; c.width = 1818;
  c.layout = { id: 'three-columns', kind: 'split', axis: 'vertical', sizes: [1, 1, 1], children: [
    { ...createSection('open'), id: 'floor', floor: 'open' },
    { ...createSection('doors'), id: 'zero-plinth', plinthHeight: 0 },
    { ...createSection('doors'), id: 'raised', plinthHeight: 180 }
  ] };
  const layout = getCabinetLayout(c, project);
  assert.deepEqual(layout.sections.map(s => s.y), [-100, -82, 98]);
  assert.deepEqual(layout.partitions.map(p => p.y), [-100, -82]);
  assert.equal(layout.nodes.find(n => n.id === 'zero-plinth').y, 18);
  const parts = generateParts(project), divider = parts.filter(p => p.partitionId && p.orientation === 'vertical-depth')[1];
  assert.deepEqual([divider.position.y, divider.finishedHeight], [-82, 2364]);
  const middleBottom = parts.find(p => p.role === 'bottom' && p.sectionId === 'zero-plinth');
  assert.equal(middleBottom.position.y + middleBottom.thickness, divider.position.y);
  assert.equal(middleBottom.position.x + middleBottom.finishedWidth, divider.position.x + divider.thickness);
  assert.deepEqual(errors(project), []);
});
