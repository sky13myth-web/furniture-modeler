import test from 'node:test';
import assert from 'node:assert/strict';
import { exportBaseName } from '../src/export-filename.js';
import files from '../desktop/file-save.cjs';

test('valid project titles produce names accepted by the Windows export bridge', () => {
  for (const value of ['CON', 'NUL', 'aux.csv', 'COM1', 'lpt9.example', '.', '..', '   ', ' Проект: кухня/спальня ', 'Dolap 1.', 'Yıldız Şкаф', 'x'.repeat(200)]) {
    const name = exportBaseName(value);
    for (const suffix of ['.json', '-factory.zip', '-kesim-listesi.xlsx']) assert.notEqual(files.validateExportFile({name: name + suffix, data: 'x'}).status, 'error', value + suffix);
  }
  assert.equal(exportBaseName('Dolap 1'), 'Dolap 1');
  assert.equal(exportBaseName('CON'), 'project-CON');
});
