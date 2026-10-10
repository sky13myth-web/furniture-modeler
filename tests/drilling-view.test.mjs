import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet } from '../src/engine.js';
import { getDrillingDrawingSet } from '../src/drilling-view.js';
import { buildDrillingFiles } from '../src/drilling-export.js';

test('screen drilling is identical to exported maps and retains global part codes for a selected cabinet', () => {
  const project = createDefaultProject('ru');
  const other = createCabinet('base', project, { name: 'Second', materialId: project.cabinets[0].materialId, x: 2500, z: 1000 });
  project.cabinets.push(other);
  project.settings.drilling = { enabled: true };
  const set = getDrillingDrawingSet(project, { cabinetId: other.id, language: 'en' });
  assert.equal(set.valid, true);
  assert.ok(set.drawings.length);
  assert.ok(set.drawings.every(item => item.part.cabinetId === other.id));
  assert.notEqual(set.drawings[0].part.partCode, 'P0001');
  const maps = buildDrillingFiles(project, { cabinetId: other.id, language: 'en' }).filter(file => file.path.startsWith('maps/'));
  assert.deepEqual(set.drawings.flatMap(item => item.pages.map(page => page.svg)), maps.map(file => file.content));
  assert.match(set.html, /lang="en"/);
});

test('disabled or invalid drilling is not presented as a production drawing', () => {
  const project = createDefaultProject();
  const disabled = getDrillingDrawingSet(project, { cabinetId: project.cabinets[0].id });
  assert.equal(disabled.valid, false);
  assert.deepEqual(disabled.drawings, []);
  project.settings.drilling = { enabled: true, pilotDiameter: 8 };
  const invalid = getDrillingDrawingSet(project, { cabinetId: project.cabinets[0].id });
  assert.equal(invalid.valid, false);
  assert.deepEqual(invalid.drawings, []);
  assert.equal(invalid.html, null);
});
