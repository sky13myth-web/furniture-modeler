import test from 'node:test';
import assert from 'node:assert/strict';
import { getDocumentInfo, documentMetadataLine, printDocumentText } from '../src/print-document.js';

test('document identity follows manufacturing project content regardless of key order or issue time', () => {
  const first = getDocumentInfo({ name: 'Dolap', cabinets: [{ width: 900, height: 2200 }], settings: { printLanguage: 'tr' } }, { issuedAt: '2026-10-09T10:00:00Z' });
  const reordered = getDocumentInfo({ settings: { printLanguage: 'tr' }, cabinets: [{ height: 2200, width: 900 }], name: 'Dolap' }, { issuedAt: '2026-10-10T10:00:00Z' });
  assert.equal(first.id, reordered.id);
  assert.notEqual(first.date, reordered.date);
  assert.notEqual(first.id, getDocumentInfo({ name: 'Dolap', cabinets: [{ width: 901, height: 2200 }], settings: { printLanguage: 'tr' } }).id);
  assert.match(first.id, /^AT-[A-F0-9]{16}$/);
});

test('camera and selection state do not change a manufacturing revision or mutate the original project', () => {
  const project = { room: { width: 4200, zoom: 2, camera: { x: 100 } }, selectedCabinetId: 'a', settings: { roomZoom: 3, kerf: 3 } };
  const copy = structuredClone(project), id = getDocumentInfo(project).id;
  assert.deepEqual(project, copy);
  project.room.zoom = 5; project.room.camera = { x: 500 }; project.settings.roomZoom = 10; project.selectedCabinetId = 'b';
  assert.equal(getDocumentInfo(project).id, id);
  project.settings.kerf = 4;
  assert.notEqual(getDocumentInfo(project).id, id);
});

test('document date uses Turkey time even across a UTC midnight boundary', () => {
  assert.equal(getDocumentInfo({}, { issuedAt: '2026-10-09T22:30:00Z' }).date, '2026-10-10');
  assert.throws(() => getDocumentInfo({}, { issuedAt: 'not a date' }), /Invalid document/);
});

test('retired integer drilling setting does not change document identity or mutate a legacy project', () => {
  const project = { settings: { drilling: { enabled: true, endOffset: 50 } } };
  const id = getDocumentInfo(project).id;
  for (const integerSpacing of [true, false]) {
    const legacy = structuredClone(project);
    legacy.settings.drilling.integerSpacing = integerSpacing;
    const before = structuredClone(legacy);
    assert.equal(getDocumentInfo(legacy).id, id);
    assert.deepEqual(legacy, before);
  }
  project.settings.drilling.endOffset = 51;
  assert.notEqual(getDocumentInfo(project).id, id);
});

test('every supported document language has a sheet identity and independent reading notes', () => {
  for (const language of ['ru', 'tr', 'en']) {
    const line = documentMetadataLine({ id: 'AT-123', date: '2026-10-10' }, { language, page: 2, pageCount: 4 });
    assert.match(line, /AT-123/); assert.match(line, /2026-10-10/); assert.match(line, /2\/4/);
    for (const key of ['notToScale', 'nominalTolerances', 'illustration']) assert.notEqual(printDocumentText(key, language), key);
    if (language !== 'ru') assert.doesNotMatch(line + printDocumentText('notToScale', language), /[А-Яа-яЁё]/);
  }
});
