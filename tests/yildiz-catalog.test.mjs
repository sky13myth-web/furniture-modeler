import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_PRESETS, DEFAULT_MATERIAL_PRESETS, THIN_BACK_PRESET } from '../src/standards.js';
import { createDefaultProject } from '../src/engine.js';
import { localizeMaterialPreset } from '../src/i18n.js';
import { translateMaterialName } from '../src/print-i18n.js';

test('Yıldız Entegre complete catalogue is available in presets', () => {
  assert.ok(MATERIAL_PRESETS.length > 200, `Catalogue contains over 200 decors, got ${MATERIAL_PRESETS.length}`);
  assert.equal(DEFAULT_MATERIAL_PRESETS.length, 7);

  // Every preset belongs to Yıldız Entegre and has a valid decorCode and sourceUrl
  for (const preset of MATERIAL_PRESETS) {
    assert.equal(preset.manufacturer, 'Yıldız Entegre');
    assert.ok(preset.decorCode, `Preset ${preset.id} has decorCode`);
    assert.ok(preset.sourceUrl?.startsWith('https://www.yildizentegre.com/'), `Preset ${preset.id} has valid Yıldız Entegre URL`);
    assert.ok(preset.sheetWidth === 2100 || preset.sheetWidth === 1220, `Preset ${preset.id} has standard sheet width: ${preset.sheetWidth}`);
    assert.equal(preset.sheetHeight, 2800, `Preset ${preset.id} has standard sheet height 2800`);
    assert.ok(preset.thickness > 0);
  }

  // Ensure unique IDs
  const ids = new Set();
  for (const preset of MATERIAL_PRESETS) {
    assert.ok(!ids.has(preset.id), `Duplicate ID in presets: ${preset.id}`);
    ids.add(preset.id);
  }
});

test('default project starts with core materials only and stays well under limits', () => {
  for (const language of ['ru', 'tr', 'en']) {
    const project = createDefaultProject(language);
    // 7 default factory presets + 1 hardboard back = 8 materials
    assert.equal(project.materials.length, 8);
    assert.ok(project.materials.some(m => m.id === THIN_BACK_PRESET.id));
    assert.ok(project.materials.some(m => m.id === 'mdf-white'));
    assert.ok(project.materials.some(m => m.id === 'mdf-oak'));
    assert.ok(project.materials.some(m => m.id === 'mdf-sage'));
    assert.ok(project.materials.some(m => m.id === 'hdf-back'));
  }
});

test('every catalogue preset localizes in RU, TR and EN without Cyrillic in foreign text', () => {
  for (const preset of MATERIAL_PRESETS) {
    for (const language of ['ru', 'tr', 'en']) {
      const localized = localizeMaterialPreset(preset, language);
      assert.ok(localized.name.includes(preset.decorCode));
      assert.ok(localized.name.endsWith(`${preset.thickness} ${language === 'ru' ? 'мм' : 'mm'}`));
      if (language !== 'ru') {
        assert.doesNotMatch(localized.name, /[А-Яа-яЁё]/u);
        assert.doesNotMatch(localized.type, /[А-Яа-яЁё]/u);
      }
      assert.equal(translateMaterialName(localized.name, language), localized.name);
    }
  }
});
