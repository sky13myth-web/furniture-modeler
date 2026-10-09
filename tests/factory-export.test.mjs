import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, generateParts } from '../src/engine.js';
import { FACTORY_COLUMNS, checkFactoryProject, generateFactoryCSV, createPartDxf, buildFactoryFiles, generateFactoryZip } from '../src/factory-export.js';
import { crc32 } from '../src/zip-store.js';

// A CSV reader independent of the writer; exercises escaped separators/quotes
// and embedded line breaks as an actual importer would.
function parseCsv(text) {
  const rows = [], row = []; let cell = '', quoted = false;
  text = text.replace(/^\ufeff/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (!quoted && char === ';') { row.push(cell); cell = ''; }
    else if (!quoted && char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push([...row]); row.length = 0; cell = ''; }
    else cell += char;
  }
  return rows;
}
function shelfProject() {
  const project = createDefaultProject('tr'), cabinet = project.cabinets[0]; project.cabinets = [cabinet];
  Object.assign(cabinet, { width: 900, height: 1000, depth: 623, plinth: 100, edgeBand: 1, layout: { id: 'shelf', kind: 'section', front: 'open', shelves: 1 } });
  return project;
}
const table = text => { const [header, ...rows] = parseCsv(text); return rows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index]]))); };
function dxfPairs(text) { const lines = text.trim().split(/\r?\n/); return lines.reduce((pairs, line, index) => { if (!(index % 2)) pairs.push([Number(line), lines[index + 1]]); return pairs; }, []); }

test('factory CSV contains only uniform part records, exact cut and finished dimensions and informational edge fields', () => {
  const project = shelfProject(), before = structuredClone(project), text = generateFactoryCSV(project), rows = table(text);
  const shelf = rows.find(row => row.DESCRIPTION.includes('raf 1'));
  assert.equal(text[0], '\ufeff'); assert.match(text, /\r\n/);
  assert.deepEqual(parseCsv(text)[0], FACTORY_COLUMNS);
  assert.ok(parseCsv(text).every(row => row.length === FACTORY_COLUMNS.length));
  assert.equal(rows.length, generateParts(project).length);
  assert.deepEqual([shelf.CUT_WIDTH_MM, shelf.CUT_LENGTH_MM, shelf.FINISHED_WIDTH_MM, shelf.FINISHED_LENGTH_MM], ['860', '599', '860', '600']);
  assert.deepEqual([shelf.INFO_EDGE_LENGTH_1_MM, shelf.INFO_EDGE_LENGTH_2_MM, shelf.INFO_EDGE_WIDTH_1_MM, shelf.INFO_EDGE_WIDTH_2_MM], ['0', '0', '0', '1']);
  assert.equal(shelf.INFO_EDGE_METERS, '0.86'); assert.equal(shelf.QUANTITY, '1');
  assert.equal(shelf.DIMENSION_BASIS, 'CUT_BLANK_EDGE_ALREADY_DEDUCTED');
  assert.equal(shelf.EDGE_DESCRIPTION, 'Ön 1 mm');
  assert.doesNotMatch(text, /[А-Яа-яЁё]/);
  assert.deepEqual(project, before);
});

test('old false deduction is normalised only in the manufacturing draft and grain follows sheet LENGTH/B', () => {
  const project = shelfProject(); project.settings.deductEdge = false;
  project.cabinets[0].materialId = 'mdf-oak'; const before = structuredClone(project);
  let rows = table(generateFactoryCSV(project)), shelf = rows.find(row => row.DESCRIPTION.includes('raf 1'));
  assert.equal(shelf.CUT_LENGTH_MM, '599'); assert.equal(shelf.GRAIN_AXIS, 'LENGTH'); assert.equal(shelf.ROTATABLE, '0');
  assert.deepEqual(project, before);
  project.cabinets[0].materialId = 'mdf-white'; project.settings.allowRotate = false;
  assert.ok(table(generateFactoryCSV(project)).every(row => row.ROTATABLE === '0'));
});

test('one shared production code connects factory CSV, part SVG, DXF paths and the assembly table across cabinets', () => {
  const project = createDefaultProject('tr'), files = buildFactoryFiles(project), rows = table(files.find(file => file.path === 'cut-list.csv').content), parts = generateParts(project);
  const assembly = files.find(file => file.path === 'assembly.html').content;
  for (const [index, row] of rows.entries()) {
    assert.equal(row.SOURCE_PART_ID, parts[index].id);
    assert.equal(row.PART_ID, `P${String(index + 1).padStart(4, '0')}`);
    assert.equal(row.DXF_FILE, `dxf/${row.PART_ID}.dxf`);
    assert.ok(files.some(file => file.path === row.DXF_FILE));
    const drawing = files.find(file => file.path === `parts/${row.PART_ID}.svg`).content;
    assert.ok(drawing.includes(row.PART_ID)); assert.ok(assembly.includes(`<td>${row.PART_ID}</td>`));
  }
  const stocks = table(files.find(file => file.path === 'materials.csv').content);
  assert.ok(rows.every(row => stocks.some(stock => stock.MATERIAL_CODE === row.MATERIAL_CODE && stock.THICKNESS_MM === row.THICKNESS_MM)));
});

test('DXF has a single closed CUT polyline in millimetres, actual L cut geometry and no dimension/tool entities', () => {
  const part = { width: 998, height: 599, outline: [{ x: 299, y: 0 }, { x: 998, y: 0 }, { x: 998, y: 599 }, { x: 0, y: 599 }, { x: 0, y: 219 }, { x: 299, y: 219 }] };
  const pairs = dxfPairs(createPartDxf(part, { code: 'P0001' }));
  const variable = pairs.findIndex(([group, value]) => group === 9 && value === '$INSUNITS'); assert.deepEqual(pairs[variable + 1], [70, '4']);
  const polyline = pairs.findIndex(([group, value]) => group === 0 && value === 'LWPOLYLINE');
  assert.equal(pairs.filter(([group, value]) => group === 0 && value === 'LWPOLYLINE').length, 1);
  const entity = pairs.slice(polyline, pairs.findIndex(([group, value], index) => index > polyline && group === 0 && value === 'ENDSEC'));
  assert.ok(entity.some(([group, value]) => group === 70 && value === '1')); assert.ok(entity.some(([group, value]) => group === 90 && value === '6'));
  assert.deepEqual(entity.filter(([group]) => group === 10).map(([, value]) => Number(value)), [299, 998, 998, 0, 0, 299]);
  assert.deepEqual(entity.filter(([group]) => group === 20).map(([, value]) => Number(value)), [599, 599, 0, 0, 380, 380]);
  assert.doesNotMatch(createPartDxf(part), /\r\n(?:LINE|TEXT|DIMENSION|CIRCLE|ARC)\r\n/);
  assert.throws(() => createPartDxf({ width: 10, height: 10, outline: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }] }), /contour/);
});

test('factory export refuses invalid projects, wrong selected gauges and oversize blanks instead of omitting parts', () => {
  const project = shelfProject(); project.cabinets[0].backThickness = 8;
  const result = checkFactoryProject(project);
  assert.equal(result.valid, false); assert.ok(result.issues.some(issue => issue.level === 'error' && issue.message.includes('Толщина детали не совпадает')));
  assert.throws(() => generateFactoryCSV(project), /Исправьте ошибки/);
  project.cabinets[0].backThickness = 3; project.materials.find(material => material.id === 'mdf-white').sheetWidth = 100;
  assert.equal(checkFactoryProject(project).valid, false);
  assert.throws(() => generateFactoryZip(project), /Исправьте ошибки/);
  project.cabinets = []; assert.equal(checkFactoryProject(project).valid, false);
});

test('CSV escaping preserves descriptions and prevents spreadsheet formula execution without changing geometry', () => {
  const project = shelfProject(); project.cabinets[0].name = '=SUM(1;2) "test"\nline';
  const rows = table(generateFactoryCSV(project, { language: 'en' }));
  assert.ok(rows.every(row => row.CABINET === '\'=SUM(1;2) "test"\nline'));
  assert.ok(rows.every(row => Number(row.CUT_LENGTH_MM) > 0));
});

test('the offline ZIP has portable signatures, a central directory, accurate counts and known CRC-32', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const project = shelfProject(), files = buildFactoryFiles(project), bytes = generateFactoryZip(project), view = new DataView(bytes.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50); const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50); assert.equal(view.getUint16(end + 8, true), files.length);
  const central = view.getUint32(end + 16, true); assert.equal(view.getUint32(central, true), 0x02014b50);
  assert.equal(view.getUint32(end + 12, true), end - central);
  assert.ok(new TextDecoder().decode(bytes).includes('CUT_BLANK_EDGE_ALREADY_DEDUCTED'));
  const notes = files.find(file => file.path === 'README.txt').content;
  assert.match(notes, /ZATEN DÜŞÜLMÜŞTÜR/); assert.match(notes, /FINISHED_LENGTH_MM/); assert.match(notes, /598/);
  const minimal = buildFactoryFiles(project, { dxfOnly: true }), minimalNotes = minimal.find(file => file.path === 'README.txt').content;
  assert.ok(minimal.every(file => file.path === 'cut-list.csv' || file.path === 'README.txt' || file.path.startsWith('dxf/')));
  assert.doesNotMatch(minimalNotes, /parts\/|materials\.csv|assembly\.html/);
});
