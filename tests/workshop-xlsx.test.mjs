import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkshopXlsx } from '../src/workshop-xlsx.js';
import { createDefaultProject, generateParts } from '../src/engine.js';
import { getWorkshopTable, generateFactoryXLSX } from '../src/factory-export.js';
import { crc32 } from '../src/zip-store.js';

function readZip(bytes) {
  const files = new Map(), decoder = new TextDecoder(), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    assert.equal(view.getUint16(offset + 8, true), 0);
    const length = view.getUint32(offset + 18, true), nameLength = view.getUint16(offset + 26, true), extraLength = view.getUint16(offset + 28, true);
    const path = decoder.decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const begin = offset + 30 + nameLength + extraLength, data = bytes.slice(begin, begin + length);
    assert.equal(crc32(data), view.getUint32(offset + 14, true));
    files.set(path, decoder.decode(data)); offset = begin + length;
  }
  return files;
}
const values = source => [...source.matchAll(/<c r="([A-Z]+\d+)"[^>]*>(.*?)<\/c>/gs)].map(([, ref, body]) => [ref, body.match(/<v>(.*?)<\/v>/)?.[1] ?? body.match(/<t[^>]*>(.*?)<\/t>/s)?.[1]]);

test('material worksheets lead with numeric unbanded width and length and contain each production part once', () => {
  const project = createDefaultProject('tr'), before = structuredClone(project), table = getWorkshopTable(project), files = readZip(generateFactoryXLSX(project));
  const workbook = files.get('xl/workbook.xml');
  assert.equal((workbook.match(/<sheet name=/g) || []).length, table.groups.length + (table.sheets?.length || 0));
  const seen = [];
  for (let index = 0; index < table.groups.length; index++) {
    const group = table.groups[index], sheet = files.get(`xl/worksheets/sheet${index + 1}.xml`), cells = new Map(values(sheet));
    assert.ok(cells.get('A1').includes(group.materialName));
    assert.ok(cells.get('A1').includes(String(group.thickness)));
    assert.equal(cells.get('A5'), group.columns[0]); assert.equal(cells.get('B5'), group.columns[1]);
    assert.match(sheet, /xSplit="2" ySplit="5" topLeftCell="C6"/);
    assert.match(sheet, new RegExp(`autoFilter ref="A5:L${group.rows.length + 5}"`));
    for (let row = 0; row < group.rows.length; row++) {
      assert.equal(Number(cells.get(`A${row + 6}`)), group.rows[row][0]);
      assert.equal(Number(cells.get(`B${row + 6}`)), group.rows[row][1]);
      seen.push(cells.get(`D${row + 6}`));
    }
  }
  assert.equal(seen.length, generateParts(project).length);
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(project, before);
});

test('worksheet names are legal and unique, custom text remains text and every sheet has matching relationships', () => {
  const base = { materialName: '=Danger; "line"', thickness: 18, sheetWidth: 2100, sheetHeight: 2800, columns: ['Width', 'Length', 'Quantity', 'P', 'Name'], rows: [[599.5, 899.125, 1, 'P0001', '=SUM(1,2)']] };
  const files = readZip(createWorkshopXlsx({ language: 'en', documentInfo: { id: 'AT-test', date: '2026-10-10' }, groups: [{ ...base, name: 'a/b:Very long material name for a worksheet 18' }, { ...base, name: 'a/b:Very long material name for a worksheet 18' }], sheets: [{ name: 'Cuts', columns: ['Cut', 'Kerf'], rows: [['C01', 3]], kind: 'cuts' }] }));
  const names = [...files.get('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1]);
  assert.equal(names.length, 3); assert.equal(new Set(names).size, names.length);
  for (const name of names) { assert.ok(name.length <= 31); assert.doesNotMatch(name, /[\[\]:*?/\\]/); }
  for (let index = 1; index <= 3; index++) {
    assert.ok(files.has(`xl/worksheets/sheet${index}.xml`));
    assert.ok(files.get('xl/_rels/workbook.xml.rels').includes(`Target="worksheets/sheet${index}.xml"`));
    assert.ok(files.get('[Content_Types].xml').includes(`/xl/worksheets/sheet${index}.xml`));
  }
  assert.match(files.get('xl/worksheets/sheet1.xml'), /<c r="E6"[^>]*t="inlineStr"[^>]*>.*=SUM\(1,2\)/s);
  assert.doesNotMatch(files.get('xl/worksheets/sheet1.xml'), /<f>/);
  assert.match(files.get('xl/worksheets/sheet1.xml'), /<c r="A6" s="5"><v>599\.5<\/v>/);
  assert.match(files.get('xl/worksheets/sheet3.xml'), /<v>3<\/v>/);
  assert.match(files.get('[Content_Types].xml'), /Extension="rels" ContentType="application\/vnd.openxmlformats-package.relationships\+xml"/);
});

test('writer rejects ragged tables and nonfinite cut dimensions before producing a workbook', () => {
  assert.throws(() => createWorkshopXlsx({ columns: ['W', 'L'], rows: [[5]] }), /Invalid workshop table/);
  assert.throws(() => createWorkshopXlsx({ columns: ['W'], rows: [[Infinity]] }), /Invalid workshop dimension/);
});
