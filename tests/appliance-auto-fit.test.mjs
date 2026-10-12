import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, getCabinetLayout, convertLegacyLayout, getApplianceFit } from '../src/engine.js';
import { adjustCabinetToFitAppliance } from '../src/quick-fix.js';

test('adjustCabinetToFitAppliance expands cabinet dimensions to eliminate appliance deficits', () => {
  const project = createDefaultProject('ru');
  const cabinet = createCabinet('base', project, { width: 631, height: 2200, depth: 600 });
  cabinet.layout ??= convertLegacyLayout(cabinet);
  project.cabinets = [cabinet];

  const geomBefore = getCabinetLayout(cabinet, project);
  const sectionBefore = geomBefore.sections[0];

  const appliance = {
    type: 'washer',
    label: 'Стиральная машина',
    width: 650,
    height: 875,
    depth: 650,
    useClearances: false,
    clearances: { side: 0, top: 0, rear: 0 }
  };

  const fitBefore = getApplianceFit(sectionBefore, appliance);
  assert.ok(fitBefore.deficits.width > 0, 'Should have width deficit before');
  assert.ok(fitBefore.deficits.depth > 0, 'Should have depth deficit before');

  const changed = adjustCabinetToFitAppliance(cabinet, sectionBefore.id, appliance, project);
  assert.equal(changed, true, 'Should report changes made');

  const geomAfter = getCabinetLayout(cabinet, project);
  const sectionAfter = geomAfter.sections[0];
  const fitAfter = getApplianceFit(sectionAfter, appliance);

  assert.equal(fitAfter.deficits.width, 0, 'Width deficit should be zero');
  assert.equal(fitAfter.deficits.height, 0, 'Height deficit should be zero');
  assert.equal(fitAfter.deficits.depth, 0, 'Depth deficit should be zero');
});
