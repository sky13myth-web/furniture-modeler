import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, getCabinetLayout, convertLegacyLayout, splitSection, validateProject } from '../src/engine.js';

test('splitSection horizontally preserves tall refrigerator niche without breaking appliance', () => {
  const project = createDefaultProject('ru');
  const cabinet = createCabinet('tall', project, { width: 736, height: 2200, depth: 650 });
  cabinet.layout ??= convertLegacyLayout(cabinet);
  project.cabinets = [cabinet];

  const section = getCabinetLayout(cabinet, project).sections[0];
  const node = cabinet.layout;
  node.floor = 'open';
  node.back = 'none';
  node.appliance = {
    type: 'fridge-builtin',
    label: 'Холодильник (встраиваемый)',
    width: 600,
    height: 1770,
    depth: 550,
    useClearances: true,
    clearances: { side: 25, top: 30, rear: 50 }
  };

  const ok = splitSection(cabinet, section.id, 'horizontal', project);
  assert.equal(ok, true, 'splitSection should succeed');

  const geomAfter = getCabinetLayout(cabinet, project);
  assert.equal(geomAfter.sections.length, 2, 'Should now have 2 sections');

  const fridgeSection = geomAfter.sections.find(s => s.node.appliance);
  assert.ok(fridgeSection, 'One section should contain the refrigerator');
  assert.ok(fridgeSection.height >= 1800, `Fridge section height (${fridgeSection.height}) must be >= 1800 mm`);

  const otherSection = geomAfter.sections.find(s => !s.node.appliance);
  assert.ok(otherSection, 'The other section should be for storage/mezzanine');
  assert.ok(otherSection.height >= 200, `Upper section height (${otherSection.height}) should be a reasonable small section`);

  const validationErrors = validateProject(project).filter(w => w.level === 'error');
  assert.equal(validationErrors.length, 0, 'No validation errors should occur after split');
});

test('splitSection vertically preserves appliance width without breaking appliance', () => {
  const project = createDefaultProject('ru');
  const cabinet = createCabinet('tall', project, { width: 900, height: 2200, depth: 650 });
  cabinet.layout ??= convertLegacyLayout(cabinet);
  project.cabinets = [cabinet];

  const section = getCabinetLayout(cabinet, project).sections[0];
  const node = cabinet.layout;
  node.appliance = {
    type: 'fridge-builtin',
    label: 'Холодильник (встраиваемый)',
    width: 600,
    height: 1770,
    depth: 550,
    useClearances: true,
    clearances: { side: 25, top: 30, rear: 50 }
  };

  const ok = splitSection(cabinet, section.id, 'vertical', project);
  assert.equal(ok, true, 'splitSection vertical should succeed');

  const geomAfter = getCabinetLayout(cabinet, project);
  assert.equal(geomAfter.sections.length, 2, 'Should now have 2 sections');

  const fridgeSection = geomAfter.sections.find(s => s.node.appliance);
  assert.ok(fridgeSection, 'One section should contain the refrigerator');
  assert.ok(fridgeSection.width >= 650, `Fridge section width (${fridgeSection.width}) must be >= 650 mm`);

  const otherSection = geomAfter.sections.find(s => !s.node.appliance);
  assert.ok(otherSection, 'The other section should be a small section');
  assert.ok(otherSection.width >= 100, `Other section width (${otherSection.width}) should be >= 100 mm`);

  const validationErrors = validateProject(project).filter(w => w.level === 'error');
  assert.equal(validationErrors.length, 0, 'No validation errors should occur after vertical split');
});
