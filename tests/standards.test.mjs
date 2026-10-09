import test from 'node:test';
import assert from 'node:assert/strict';
import { THIN_BACK_PRESET, MATERIAL_PRESETS } from '../src/standards.js';
import { createDefaultProject, createCabinet } from '../src/engine.js';
import { defaultName } from '../src/i18n.js';

test('requested hardboard back is a separate unbranded 3 mm material, without a factory availability claim', () => {
  assert.equal(THIN_BACK_PRESET.id, 'thin-back-3');
  assert.equal(THIN_BACK_PRESET.thickness, 3);
  assert.equal(THIN_BACK_PRESET.name, 'Sert lif levha · arkalık · 3 mm');
  assert.equal(THIN_BACK_PRESET.type, 'Sert lif levha');
  assert.equal(THIN_BACK_PRESET.edgeBand, 0);
  assert.equal(THIN_BACK_PRESET.manufacturer, undefined);
  assert.equal(THIN_BACK_PRESET.sourceUrl, undefined);
  assert.equal(MATERIAL_PRESETS.some(material => material.id === THIN_BACK_PRESET.id), false);
  assert.ok(MATERIAL_PRESETS.every(material => material.manufacturer === 'Yıldız Entegre'));
});

test('new cabinets use localized hardboard 3 mm backs while drawer bottoms and explicitly selected stocks retain their gauge', () => {
  for (const language of ['ru', 'tr', 'en']) {
    const project = createDefaultProject(language);
    const stock = project.materials.find(material => material.id === THIN_BACK_PRESET.id);
    assert.equal(stock.name, defaultName('thinBack', language));
    assert.equal(stock.type, defaultName('thinBackType', language));
    for (const cabinet of [project.cabinets[0], ...['base', 'wall', 'tall'].map(type => createCabinet(type, project))]) {
      assert.equal(cabinet.backMaterialId, stock.id);
      assert.equal(cabinet.backThickness, 3);
      assert.equal(project.materials.find(material => material.id === cabinet.drawerBottomMaterialId)?.thickness, 8);
    }
    const manualStock = project.materials.find(material => material.thickness === 8);
    const manualCabinet = project.cabinets[0];
    manualCabinet.backMaterialId = manualStock.id;
    manualCabinet.backThickness = 8;
    const original = structuredClone(project);
    const newCabinet = createCabinet('base', project);
    assert.equal(newCabinet.backThickness, 3);
    assert.deepEqual(project, original, 'creating a new default cabinet never rewrites an existing manually chosen back');
    assert.equal(manualCabinet.backMaterialId, manualStock.id);
    assert.equal(manualCabinet.backThickness, 8);
  }
});
