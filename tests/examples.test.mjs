import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, getCabinetLayout, generateParts, validateProject } from '../src/engine.js';
import { createLaundryExample, createInteriorExample, createRodsExample } from '../src/examples.js';
import { checkFactoryProject } from '../src/factory-export.js';
import { checkImport } from '../src/project-io.js';

test('every built-in example in every creation language is valid for actual stock cutting and factory handoff', () => {
  for (const language of ['ru', 'tr', 'en']) for (const make of [createDefaultProject, createLaundryExample, createInteriorExample, createRodsExample]) {
    const project = make(language), before = structuredClone(project);
    assert.doesNotThrow(() => checkImport(project), `${make.name}/${language}: import schema`);
    assert.deepEqual(validateProject(project).filter(issue => issue.level === 'error'), [], `${make.name}/${language}: cabinet geometry`);
    const factory = checkFactoryProject(project);
    assert.equal(factory.valid, true, `${make.name}/${language}: ${JSON.stringify(factory.issues)}`);
    assert.equal(factory.cutting.unplaced.length, 0);
    assert.equal(factory.parts.every(part => part.thickness === project.materials.find(stock => stock.id === part.materialId)?.thickness), true);
    assert.deepEqual(project, before);
  }
});

test('laundry rear rails fit only their floor opening and clear the machine and surrounding dividers', () => {
  const project = createLaundryExample('ru'), cabinet = project.cabinets[0];
  const layout = getCabinetLayout(cabinet, project), floor = layout.sections.find(section => section.id === 'laundry-floor');
  assert.deepEqual(cabinet.rearBraces, []);
  assert.deepEqual([floor.x, floor.y, floor.width, floor.height, floor.backMode], [336, -100, 928, 1486, 'braces']);
  const parts = generateParts(project), rails = parts.filter(part => part.role === 'brace');
  assert.equal(rails.length, 2);
  assert.deepEqual(rails.map(rail => [rail.braceId, rail.sectionId, rail.position, rail.finishedWidth, rail.finishedHeight, rail.thickness]), [
    ['laundry-brace-upper', 'laundry-floor', { x: 336, y: 1236, z: 0 }, 928, 100, 18],
    ['laundry-brace-lower', 'laundry-floor', { x: 336, y: 200, z: 0 }, 928, 100, 18]
  ]);
  const machineRear = floor.depth - floor.node.appliance.depth;
  for (const rail of rails) {
    assert.ok(rail.position.x >= floor.x);
    assert.ok(rail.position.x + rail.finishedWidth <= floor.x + floor.width);
    assert.ok(rail.position.y >= floor.y);
    assert.ok(rail.position.y + rail.finishedHeight <= floor.y + floor.height);
    assert.ok(rail.position.z + rail.thickness < machineRear, 'rails retain the explicit 50 mm rear appliance allowance');
  }
  assert.equal(rails[0].position.y + cabinet.plinth + rails[0].finishedHeight, 1436);
  assert.equal(floor.y + cabinet.plinth + floor.height - 1436, 50);
  assert.equal(parts.find(part => part.pullOutShelf).sectionId, 'laundry-shelf');
  assert.equal(layout.sections.filter(section => section.node.front === 'doors').length, 3);

  // The old demonstration rails really crossed both column dividers.
  floor.node.back = 'none'; delete floor.node.rearBraces;
  cabinet.rearBraces = [{ id: 'old-upper', y: 2000, height: 100 }, { id: 'old-lower', y: 300, height: 100 }];
  assert.equal(validateProject(project).filter(issue => issue.level === 'error' && /задняя перемычка пересекает панель/.test(issue.message)).length, 2);
  assert.equal(checkFactoryProject(project).valid, false);
});
