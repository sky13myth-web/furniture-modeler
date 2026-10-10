import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, createSection, getMaterialUsage, deleteMaterial, validateProject } from '../src/engine.js';
import { checkImport } from '../src/project-io.js';
import { translateText } from '../src/i18n.js';

test('getMaterialUsage correctly identifies which cabinets and parts use a material', () => {
  const project = createDefaultProject('ru');
  const customMat = {
    id: 'custom-mdf',
    name: 'Кастомный МДФ',
    type: 'MDF',
    color: '#888888',
    thickness: 18,
    sheetWidth: 2800,
    sheetHeight: 2070,
    grain: false
  };
  project.materials.push(customMat);

  // Unused
  assert.deepEqual(getMaterialUsage(project, 'custom-mdf'), []);

  // Used as cabinet body
  const cabinet1 = project.cabinets[0];
  cabinet1.materialId = 'custom-mdf';
  let usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.equal(usage[0].cabinetId, cabinet1.id);
  assert.ok(usage[0].roles.includes('materialId'));

  // Used as front material
  cabinet1.materialId = 'mdf-white';
  cabinet1.frontMaterialId = 'custom-mdf';
  usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].roles.includes('frontMaterialId'));

  // Used as back material
  cabinet1.frontMaterialId = 'mdf-white';
  cabinet1.backMaterialId = 'custom-mdf';
  usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].roles.includes('backMaterialId'));

  // Used as drawer material
  cabinet1.backMaterialId = 'thin-back-3';
  cabinet1.drawerMaterialId = 'custom-mdf';
  usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].roles.includes('drawerMaterialId'));

  // Used as drawer bottom material
  cabinet1.drawerMaterialId = 'mdf-white';
  cabinet1.drawerBottomMaterialId = 'custom-mdf';
  usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].roles.includes('drawerBottomMaterialId'));

  // Used in cabinet rear braces
  cabinet1.drawerBottomMaterialId = 'thin-back-3';
  cabinet1.rearBraces = [{ id: 'b1', y: 100, height: 80, materialId: 'custom-mdf' }];
  usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].roles.includes('rearBraces'));

  // Used in section rear braces
  cabinet1.rearBraces = [];
  cabinet1.layout = createSection('open');
  cabinet1.layout.rearBraces = [{ id: 'sb1', y: 50, height: 80, materialId: 'custom-mdf' }];
  usage = getMaterialUsage(project, 'custom-mdf');
  assert.equal(usage.length, 1);
  assert.ok(usage[0].roles.includes('sectionRearBraces'));
});

test('deleteMaterial successfully deletes an unused material and preserves project integrity', () => {
  const project = createDefaultProject('ru');
  const customMat = {
    id: 'extra-material',
    name: 'Дополнительный материал',
    type: 'MDF',
    color: '#123456',
    thickness: 16,
    sheetWidth: 2800,
    sheetHeight: 2070,
    grain: false
  };
  project.materials.push(customMat);
  assert.ok(project.materials.some(m => m.id === 'extra-material'));

  // Deletion of unused material
  const result = deleteMaterial(project, 'extra-material');
  assert.equal(result, true);
  assert.ok(!project.materials.some(m => m.id === 'extra-material'));

  // Valid project schema and geometry
  assert.doesNotThrow(() => checkImport(project));
  const warnings = validateProject(project);
  assert.equal(warnings.filter(w => w.level === 'error').length, 0);

  // Deleting non-existent ID returns false
  assert.equal(deleteMaterial(project, 'non-existent'), false);
});

test('deleteMaterial refuses to delete when material is in use without replacement', () => {
  const project = createDefaultProject('ru');
  const cabinet = project.cabinets[0];
  const matId = cabinet.materialId;

  assert.throws(
    () => deleteMaterial(project, matId),
    /Материал используется в шкафах/
  );
  // Material remains untouched
  assert.ok(project.materials.some(m => m.id === matId));
});

test('deleteMaterial replaces in-use material across all cabinet parts when replacementId is provided', () => {
  const project = createDefaultProject('ru');
  // 'mdf-oak' is already in default project materials
  assert.ok(project.materials.some(m => m.id === 'mdf-oak'));

  const cabinet = project.cabinets[0];
  cabinet.materialId = 'mdf-white';
  cabinet.frontMaterialId = 'mdf-white';
  cabinet.backMaterialId = 'mdf-white';
  cabinet.drawerMaterialId = 'mdf-white';
  cabinet.drawerBottomMaterialId = 'mdf-white';
  cabinet.rearBraces = [{ id: 'rb-1', y: 150, height: 80, materialId: 'mdf-white' }];
  cabinet.layout = createSection('open');
  cabinet.layout.rearBraces = [{ id: 'srb-1', y: 100, height: 80, materialId: 'mdf-white' }];

  // Attempting with invalid replacement
  assert.throws(
    () => deleteMaterial(project, 'mdf-white', 'non-existent-replacement'),
    /Материал для замены не найден/
  );
  assert.throws(
    () => deleteMaterial(project, 'mdf-white', 'mdf-white'),
    /Материал для замены не найден/
  );

  // Perform valid replacement and deletion
  const deleted = deleteMaterial(project, 'mdf-white', 'mdf-oak');
  assert.equal(deleted, true);

  // 'mdf-white' should be completely removed from project.materials
  assert.ok(!project.materials.some(m => m.id === 'mdf-white'));

  // Cabinet references updated to 'mdf-oak'
  assert.equal(cabinet.materialId, 'mdf-oak');
  assert.equal(cabinet.frontMaterialId, 'mdf-oak');
  assert.equal(cabinet.backMaterialId, 'mdf-oak');
  assert.equal(cabinet.backThickness, 18);
  assert.equal(cabinet.drawerMaterialId, 'mdf-oak');
  assert.equal(cabinet.drawerBottomMaterialId, 'mdf-oak');
  assert.equal(cabinet.drawerBottomThickness, 18);
  assert.equal(cabinet.rearBraces[0].materialId, 'mdf-oak');
  assert.equal(cabinet.layout.rearBraces[0].materialId, 'mdf-oak');

  // No references to 'mdf-white' remain
  assert.deepEqual(getMaterialUsage(project, 'mdf-white'), []);

  // Project passes all checks
  assert.doesNotThrow(() => checkImport(project));
  const warnings = validateProject(project);
  assert.equal(warnings.filter(w => w.level === 'error').length, 0);
});

test('deleteMaterial refuses to delete the only remaining material', () => {
  const project = createDefaultProject('ru');
  project.cabinets = []; // no cabinets using any material
  project.materials = [project.materials[0]]; // leave only one

  assert.throws(
    () => deleteMaterial(project, project.materials[0].id),
    /В проекте должен оставаться хотя бы один материал/
  );
  assert.equal(project.materials.length, 1);
});

test('translations for material deletion and replacement exist in all supported languages', () => {
  assert.equal(translateText('Удалить материал', 'ru'), 'Удалить материал');
  assert.equal(translateText('Удалить материал', 'tr'), 'Malzemeyi sil');
  assert.equal(translateText('Удалить материал', 'en'), 'Delete material');

  assert.equal(translateText('Замена материала', 'tr'), 'Malzeme değişimi');
  assert.equal(translateText('Замена материала', 'en'), 'Replace material');

  assert.equal(translateText('Заменить на материал', 'tr'), 'Şununla değiştir');
  assert.equal(translateText('Заменить на материал', 'en'), 'Replace with material');

  assert.equal(translateText('Заменить и удалить', 'tr'), 'Değiştir ve sil');
  assert.equal(translateText('Заменить и удалить', 'en'), 'Replace and delete');

  assert.equal(translateText('В проекте должен оставаться хотя бы один материал.', 'en'), 'The project must keep at least one sheet material.');
  assert.equal(translateText('Материал используется в шкафах', 'en'), 'Material is used in cabinets');
  assert.equal(translateText('Отмена', 'tr'), 'İptal');
  assert.equal(translateText('Отмена', 'en'), 'Cancel');
});
