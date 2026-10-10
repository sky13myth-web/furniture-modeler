import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createCabinet, createSection, generateParts } from '../src/engine.js';
import { FACTORY_COLUMNS, checkFactoryProject, generateFactoryCSV, generateFactoryXLSX, generateWorkshopCSV, getWorkshopTable, createPartDxf, buildFactoryFiles, generateFactoryZip } from '../src/factory-export.js';
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
function dxfEntities(text) {
  const pairs = dxfPairs(text), start = pairs.findIndex(([group, value]) => group === 2 && value === 'ENTITIES'), entities = [];
  for (let at = start + 1; at < pairs.length && pairs[at][1] !== 'ENDSEC'; at++) {
    if (pairs[at][0] !== 0) continue;
    let end = at + 1; while (end < pairs.length && pairs[end][0] !== 0) end++;
    entities.push(pairs.slice(at, end)); at = end - 1;
  }
  return entities;
}

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

test('the factory kit contains each cabinet detail document with its sections, fronts and global production codes', () => {
  const project = shelfProject(), first = project.cabinets[0];
  Object.assign(first.layout, { front: 'doors', doors: 2, shelves: 1 });
  const second = createCabinet('base', project, { width: 700, height: 860, name: 'Second cabinet' });
  second.layout = { kind: 'split', id: 'second-split', axis: 'horizontal', sizes: [1, 2], children: [
    { ...createSection('open'), id: 'second-top', shelves: 1 },
    { ...createSection('drawers'), id: 'second-bottom', drawers: 2 }
  ] };
  project.cabinets.push(second);
  const files = buildFactoryFiles(project, { language: 'en' }), rows = table(files.find(file => file.path === 'cut-list.csv').content);
  assert.ok(files.some(file => file.path === 'assembly.html'), 'the project overview remains available');
  const details = files.filter(file => /^assembly\/cabinet-\d+\.html$/.test(file.path));
  assert.equal(details.length, 2);
  for (const [index, doc] of details.entries()) {
    const ownIds = rows.filter(row => row.SOURCE_PART_ID.startsWith(project.cabinets[index].id + '-part-')).map(row => row.PART_ID);
    const otherIds = rows.filter(row => !ownIds.includes(row.PART_ID)).map(row => row.PART_ID);
    assert.ok(ownIds.length > 0);
    assert.match(doc.content, /data-schedule-kind="openings"/);
    assert.match(doc.content, /data-schedule-kind="fronts"/);
    assert.match(doc.content, /data-drawing-view="interior"/);
    for (const code of ownIds) assert.ok(doc.content.includes(`<td>${code}</td>`), `${doc.path} preserves ${code}`);
    for (const code of otherIds) assert.ok(!doc.content.includes(`<td>${code}</td>`), `${doc.path} excludes the other cabinet's ${code}`);
  }
  const notes = files.find(file => file.path === 'README.txt').content;
  assert.match(notes, /assembly\/cabinet-xxx\.html/);
  assert.match(notes, /separate package/); assert.doesNotMatch(notes, /Drilling patterns and hardware-specific joints are not modelled/);
  const info = table(files.find(file => file.path === 'document-set.csv').content)[0];
  assert.match(info.DOCUMENT_SET_ID, /^AT-[A-F\d]{16}$/); assert.match(info.ISSUE_DATE_ISTANBUL, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(notes, new RegExp(info.DOCUMENT_SET_ID));
  const maps = files.filter(file => /^cutting\/sheet-[\d-]+\.svg$/.test(file.path));
  assert.ok(maps.length > 0);
  assert.ok(maps.every(map => map.content.includes(info.DOCUMENT_SET_ID) && map.content.includes('data-print-cutting="true"')));
  const reference = files.find(file => file.path === 'cutting-reference.html').content;
  assert.doesNotMatch(reference, /grid-template-columns:1fr 1fr/);
  assert.equal((reference.match(/<section class="sheet">/g) || []).length, maps.length);
});

test('a single-cabinet kit keeps global IDs, original cabinet numbering, scoped assemblies and shared revision identity', () => {
  const project = shelfProject();
  const second = createCabinet('base', project, { width: 700, height: 860, name: 'Dolap iki' }); project.cabinets.push(second);
  const before = structuredClone(project), options = { language: 'en', cabinetId: second.id };
  const full = buildFactoryFiles(project, { language: 'en' }), scoped = buildFactoryFiles(project, options);
  const fullRows = table(full.find(file => file.path === 'cut-list.csv').content), rows = table(scoped.find(file => file.path === 'cut-list.csv').content);
  const expectedRows = fullRows.filter(row => row.SOURCE_PART_ID.startsWith(second.id + '-part-'));
  assert.deepEqual(rows, expectedRows);
  assert.ok(Number(rows[0].PART_ID.slice(1)) > 1, 'a selected second cabinet must not start again at P0001');
  assert.equal(generateFactoryCSV(project, options), scoped.find(file => file.path === 'cut-list.csv').content);
  const result = checkFactoryProject(project, options);
  assert.equal(result.valid, true); assert.equal(result.parts.length, fullRows.length);
  assert.equal(result.selectedParts.length, rows.length); assert.equal(result.selectedCabinet.id, second.id);
  assert.ok(result.cutting.sheets.flatMap(sheet => sheet.placements).every(placement => result.selectedParts.some(part => part.id === placement.partId)));
  assert.deepEqual(scoped.filter(file => /^assembly\/cabinet-/.test(file.path)).map(file => file.path), ['assembly/cabinet-002.html']);
  const assembly = scoped.find(file => file.path === 'assembly.html').content;
  assert.match(assembly, /data-schedule-kind="openings"/); assert.match(assembly, /data-schedule-kind="fronts"/);
  for (const row of rows) {
    const code = row.PART_ID;
    assert.ok(scoped.some(file => file.path === `parts/${code}.svg`));
    assert.ok(scoped.some(file => file.path === `dxf/${code}.dxf`));
    assert.ok(assembly.includes(`<td>${code}</td>`));
    assert.equal(scoped.find(file => file.path === `dxf/${code}.dxf`).content, full.find(file => file.path === `dxf/${code}.dxf`).content);
  }
  for (const row of fullRows.filter(row => !expectedRows.includes(row))) assert.ok(!assembly.includes(`<td>${row.PART_ID}</td>`));
  const cuttingSvgs = scoped.filter(file => file.path.startsWith('cutting/'));
  const mapIds = cuttingSvgs.flatMap(file => [...file.content.matchAll(/data-print-legend-part="([^"]+)"/g)].map(([, code]) => code));
  assert.deepEqual([...new Set(mapIds)].sort(), rows.map(row => row.PART_ID).sort());
  const info = table(scoped.find(file => file.path === 'document-set.csv').content)[0], fullInfo = table(full.find(file => file.path === 'document-set.csv').content)[0];
  assert.equal(info.DOCUMENT_SET_ID, fullInfo.DOCUMENT_SET_ID);
  assert.deepEqual([info.EXPORT_SCOPE, info.CABINET_ID, info.CABINET, info.CABINET_NUMBER], ['SINGLE_CABINET', second.id, second.name, '2']);
  const readme = scoped.find(file => file.path === 'README.txt').content;
  assert.match(readme, /Single cabinet package: Dolap iki · No 2/);
  assert.match(readme, /detailed assembly of the selected cabinet/);
  assert.deepEqual(project, before);
});

test('cabinet validation ignores another cabinet defect while retaining shared settings and unknown-scope errors', () => {
  const project = shelfProject(), second = createCabinet('base', project, { width: 700, height: 860 }); project.cabinets.push(second);
  project.cabinets[0].backThickness = 8;
  assert.equal(checkFactoryProject(project).valid, false);
  const target = checkFactoryProject(project, { cabinetId: second.id });
  assert.equal(target.valid, true); assert.ok(target.selectedParts.every(part => part.cabinetId === second.id));
  assert.doesNotThrow(() => generateFactoryZip(project, { cabinetId: second.id }));
  assert.equal(checkFactoryProject(project, { cabinetId: project.cabinets[0].id }).valid, false);
  project.settings.kerf = -1;
  assert.throws(() => checkFactoryProject(project, { cabinetId: second.id }), /ширина пропила/, 'shared invalid cutting settings cannot be ignored');
  project.settings.kerf = 3;
  const missing = checkFactoryProject(project, { cabinetId: 'not-found' });
  assert.equal(missing.valid, false); assert.ok(missing.issues.some(issue => issue.message === 'Шкаф не найден.'));
  assert.throws(() => generateFactoryCSV(project, { cabinetId: 'not-found' }), /Исправьте ошибки/);
});

test('a scoped cabinet keeps its collision error in either project order without renumbering parts', () => {
  const project = shelfProject(), first = project.cabinets[0], second = createCabinet('base', project, { width: 700, height: 860 });
  second.x = first.x + first.width - 100; second.z = first.z;
  project.cabinets.push(second);
  for (const order of [[first, second], [second, first]]) {
    project.cabinets = order;
    const before = structuredClone(project), parts = generateParts(project);
    assert.equal(checkFactoryProject(project).valid, false);
    for (const cabinet of order) {
      const result = checkFactoryProject(project, { cabinetId: cabinet.id });
      assert.equal(result.valid, false);
      assert.ok(result.issues.some(issue => issue.level === 'error' && issue.cabinetId === cabinet.id && issue.message.includes('пересекается')));
      for (const part of result.selectedParts) assert.equal(result.partCodes.get(part.id), `P${String(parts.findIndex(item => item.id === part.id) + 1).padStart(4, '0')}`);
      assert.throws(() => generateFactoryCSV(project, { cabinetId: cabinet.id }), /Исправьте ошибки/);
    }
    assert.deepEqual(project, before);
  }
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

test('sheet DXFs preserve exact raw contours, global IDs, stock groups and kerf-separated placements in either scope', () => {
  const rounded = value => Math.round(value * 1000) / 1000;
  const field = (entity, group) => entity.find(([key]) => key === group)?.[1];
  for (const corner of ['back-left', 'back-right']) {
    const project = shelfProject(), first = project.cabinets[0];
    project.room = { width: 10000, depth: 8000, height: 4000, wallThickness: 100, outline: [{ x: 0, z: 0 }, { x: 10000, z: 0 }, { x: 10000, z: 8000 }, { x: 0, z: 8000 }], windows: [] };
    Object.assign(first, { width: 947.625, height: 1431.875, depth: 657.25, x: 1500, z: 1500, materialId: 'mdf-oak', edgeBand: 1.5, cutout: { corner, width: 251.875, depth: 220.625 } });
    project.materials.push({ ...project.materials.find(stock => stock.id === 'mdf-white'), id: 'custom-Özel-25', name: 'Özel 25 mm', thickness: 25 });
    const second = createCabinet('tall', project, { width: 1020.543, height: 1900.123, depth: 700.457 });
    Object.assign(second, { x: 5000, z: 3000, materialId: 'custom-Özel-25', frontMaterialId: 'custom-Özel-25', edgeBand: 2, layout: { ...createSection('open'), id: 'sheet-second', shelves: 1 }, cutout: { corner: corner === 'back-left' ? 'back-right' : 'back-left', width: 350.432, depth: 240.199 } });
    project.cabinets.push(second); project.settings.deductEdge = false;
    const before = structuredClone(project), full = buildFactoryFiles(project, { language: 'en' }), fullRows = table(full.find(file => file.path === 'cut-list.csv').content);
    for (const cabinetId of [null, second.id]) {
      const files = buildFactoryFiles(project, { cabinetId, language: 'en' }), result = checkFactoryProject(project, { cabinetId });
      const rows = table(files.find(file => file.path === 'cut-list.csv').content), layout = files.find(file => file.path === 'dxf/sheets-all.dxf').content;
      assert.doesNotMatch(layout, /[^\x00-\x7f]/, 'portable ASCII DXF retains Unicode material IDs in escaped metadata');
      const pairs = dxfPairs(layout), entities = dxfEntities(layout), polygons = entities.filter(entity => entity[0][1] === 'LWPOLYLINE' && /_PART_/.test(field(entity,8)));
      assert.deepEqual(pairs[pairs.findIndex(([group,value]) => group === 9 && value === '$INSUNITS')+1],[70,'4']);
      assert.equal(result.cutting.method,'guillotine'); assert.equal(result.cutting.valid,true);
      assert.equal(polygons.length,result.cutting.placedParts); assert.equal(polygons.length,rows.length);
      assert.equal(entities.filter(entity=>entity[0][1]==='LWPOLYLINE'&&/_STOCK$/.test(field(entity,8))).length,result.cutting.sheets.length);
      const labels = entities.filter(entity=>entity[0][1]==='TEXT');
      assert.deepEqual(labels.map(entity=>field(entity,1)).filter(value=>/^P\d+$/.test(value)).sort(),rows.map(row=>row.PART_ID).sort());
      for (const label of labels) { assert.equal(field(label,72),'1'); assert.equal(field(label,73),'2'); }
      let offset = 0;
      for (const [index,sheet] of result.cutting.sheets.entries()) {
        const sheetCode = `S${String(index+1).padStart(3,'0')}`, minimal = buildFactoryFiles(project,{cabinetId,language:'en',dxfOnly:true});
        const single = dxfEntities(files.find(file=>file.path===`dxf/sheets/sheet-${String(index+1).padStart(3,'0')}.dxf`).content);
        const stock = project.materials.find(stock=>stock.id===sheet.materialId);
        assert.equal(sheet.thickness,stock.thickness); assert.equal(sheet.kerf,project.settings.kerf);
        const metadata = JSON.parse(pairs.find(([group,value])=>group===999&&value.startsWith(`${sheetCode} SHEET_JSON `))[1].split(' SHEET_JSON ')[1]);
        assert.deepEqual([metadata.materialId,metadata.thickness,metadata.width,metadata.height,metadata.offsetX],[sheet.materialId,sheet.thickness,sheet.width,sheet.height,offset]);
        for (const placement of sheet.placements) {
          const part = result.selectedParts.find(part=>part.id===placement.partId), code = result.partCodes.get(part.id), layer = `${sheetCode}_PART_${code}`;
          assert.equal(placement.partCode,code); assert.equal(part.materialId,sheet.materialId); assert.equal(part.thickness,sheet.thickness);
          const raw = part.outline??[{x:0,y:0},{x:part.width,y:0},{x:part.width,y:part.height},{x:0,y:part.height}];
          const rotated = part.outline ? raw.map(point=>placement.rotated?{x:part.height-point.y,y:point.x}:point) : [{x:0,y:0},{x:placement.width,y:0},{x:placement.width,y:placement.height},{x:0,y:placement.height}];
          const polygon = polygons.find(entity=>field(entity,8)===layer), singlePolygon=single.find(entity=>field(entity,8)===layer);
          assert.equal(field(polygon,70),'1'); assert.equal(Number(field(polygon,90)),raw.length);
          assert.deepEqual(polygon.filter(([group])=>group===10).map(([,value])=>Number(value)),rotated.map(point=>rounded(offset+placement.x+point.x)));
          assert.deepEqual(polygon.filter(([group])=>group===20).map(([,value])=>Number(value)),rotated.map(point=>rounded(sheet.height-placement.y-point.y)));
          assert.deepEqual(singlePolygon.filter(([group])=>group===10).map(([,value])=>Number(value)),rotated.map(point=>rounded(placement.x+point.x)));
          assert.equal(files.find(file=>file.path===`dxf/${code}.dxf`).content,full.find(file=>file.path===`dxf/${code}.dxf`).content,'scoping never alters the manufacturing contour');
          assert.ok(placement.x>=sheet.margin-.00001&&placement.y>=sheet.margin-.00001);
          assert.ok(placement.x+placement.width<=sheet.width-sheet.margin+.00001&&placement.y+placement.height<=sheet.height-sheet.margin+.00001);
        }
        for (let a=0;a<sheet.placements.length;a++) for(let b=a+1;b<sheet.placements.length;b++) {
          const p=sheet.placements[a],q=sheet.placements[b], k=sheet.kerf-.00001;
          assert.ok(p.x+p.width+k<=q.x||q.x+q.width+k<=p.x||p.y+p.height+k<=q.y||q.y+q.height+k<=p.y,'raw bounding blanks have the configured kerf gap');
        }
        assert.equal(minimal.find(file=>file.path==='dxf/sheets-all.dxf').content,layout);
        offset += sheet.width+100;
      }
      const expectedShaped=result.selectedParts.filter(part=>part.outline).length;
      assert.equal(entities.filter(entity=>entity[0][1]==='LWPOLYLINE'&&/_BLANK_/.test(field(entity,8))).length,expectedShaped);
      if(cabinetId!==null) { assert.deepEqual(rows,fullRows.filter(row=>row.SOURCE_PART_ID.startsWith(second.id+'-part-'))); assert.ok(rows.every(row=>row.PART_ID!=='P0001')); }
      assert.match(files.find(file=>file.path==='README.txt').content,/operator-reviewed sequence, not a CNC or G-code program/);
    }
    assert.deepEqual(project,before);
  }
});

test('separate saw-pass CSV, DXF and printable instructions share the exact numbered parent-region plan', () => {
  const project=shelfProject(); project.settings.kerf=3.001; project.settings.margin=10.001;
  const before=structuredClone(project), result=checkFactoryProject(project), files=buildFactoryFiles(project,{language:'en'});
  const cuts=table(files.find(file=>file.path==='cuts/cut-sequence.csv').content), layout=table(files.find(file=>file.path==='sheet-layout.csv').content), info=getWorkshopTable(project,{language:'en'}).documentInfo;
  const combined=dxfEntities(files.find(file=>file.path==='cuts/cuts-all.dxf').content), field=(entity,key)=>entity.find(([group])=>group===key)?.[1], rounded=value=>Math.round(value*1e9)/1e9;
  assert.equal(cuts.length,result.cutting.sheets.reduce((sum,sheet)=>sum+sheet.cuts.length,0));
  const regions=table(files.find(file=>file.path==='cuts/regions.csv').content);
  assert.equal(regions.length,result.cutting.sheets.reduce((sum,sheet)=>sum+sheet.regions.length,0));
  assert.equal(layout.length,result.cutting.placedParts); assert.ok([...cuts,...layout].every(row=>row.DOCUMENT_ID===info.id));
  let offset=0;
  for(const [index,sheet] of result.cutting.sheets.entries()) {
    const code=`S${String(index+1).padStart(3,'0')}`, single=dxfEntities(files.find(file=>file.path===`cuts/sheet-${String(index+1).padStart(3,'0')}-cuts.dxf`).content);
    for(const cut of sheet.cuts) {
      const row=cuts.find(row=>row.SHEET_ID===code&&Number(row.SEQUENCE)===cut.sequence), layer=`${code}_C${String(cut.sequence).padStart(3,'0')}_${cut.kind==='trim'?'TRIM':'CUT'}`, line=combined.find(entity=>entity[0][1]==='LINE'&&field(entity,8)===layer), local=single.find(entity=>entity[0][1]==='LINE'&&field(entity,8)===layer);
      assert.ok(row&&line&&local); assert.equal(row.CUT_ID,cut.id); assert.equal(row.PARENT_REGION_ID,cut.parentRegionId); assert.equal(row.RESULT_REGION_IDS,cut.resultRegionIds.join('|')); assert.equal(row.CUT_KIND,cut.kind);
      const parent=sheet.regions.find(region=>region.id===cut.parentRegionId), low=['left','top'].includes(cut.retainedEdge), axis=cut.axis==='x'?'x':'y',size=cut.axis==='x'?'width':'height',center=cut.axis==='x'?cut.x1:cut.y1;
      assert.deepEqual([row.PARENT_X_MM,row.PARENT_Y_MM,row.PARENT_WIDTH_MM,row.PARENT_LENGTH_MM,row.BLADE_CENTER_OFFSET_MM,row.RETAINED_SIZE_MM].map(Number),[parent.x,parent.y,parent.width,parent.height,center-parent[axis],Math.max(0,low?center-cut.kerf/2-parent[axis]:parent[axis]+parent[size]-center-cut.kerf/2)].map(rounded));
      assert.equal(row.COORDINATE_BASIS,'STOCK_TOP_LEFT_X_RIGHT_Y_DOWN_BLADE_CENTERLINE');
      assert.deepEqual([row.START_X_MM,row.START_Y_MM,row.END_X_MM,row.END_Y_MM,row.SAW_KERF_MM].map(Number),[cut.x1,cut.y1,cut.x2,cut.y2,cut.kerf].map(rounded));
      assert.deepEqual([10,20,11,21].map(key=>Number(field(line,key))),[offset+cut.x1,sheet.height-cut.y1,offset+cut.x2,sheet.height-cut.y2].map(rounded));
      assert.deepEqual([10,20,11,21].map(key=>Number(field(local,key))),[cut.x1,sheet.height-cut.y1,cut.x2,sheet.height-cut.y2].map(rounded));
    }
    for(const placement of sheet.placements) {
      const row=layout.find(row=>row.SHEET_ID===code&&row.SOURCE_PART_ID===placement.partId), part=result.selectedParts.find(part=>part.id===placement.partId);
      assert.deepEqual([row.X_MM,row.Y_MM,row.PLACED_WIDTH_MM,row.PLACED_LENGTH_MM,row.RAW_WIDTH_A_MM,row.RAW_LENGTH_B_MM].map(Number),[placement.x,placement.y,placement.width,placement.height,part.width,part.height].map(rounded));
      assert.equal(row.PART_ID,result.partCodes.get(part.id)); assert.equal(Number(row.ROTATED_90),Number(placement.rotated));
    }
    offset+=sheet.width+100;
  }
  assert.equal(combined.filter(entity=>entity[0][1]==='LINE').length,cuts.length);
  const html=files.find(file=>file.path==='cuts/cut-sequence.html').content;
  assert.equal((html.match(/data-cut-id=/g)??[]).length,cuts.length); assert.match(html,/blade centerline/); assert.match(html,/not a machine control program/);
  assert.deepEqual(project,before);
});

test('thin margin overhang preserves negative numeric blade coordinates while untrusted text stays CSV-safe', () => {
  const project=shelfProject(); project.settings.kerf=3.001; project.settings.margin=.001;
  project.cabinets[0].name='=SUM(1;2)';
  const result=checkFactoryProject(project),files=buildFactoryFiles(project,{language:'en'}),cuts=table(files.find(file=>file.path==='cuts/cut-sequence.csv').content);
  assert.equal(result.valid,true);
  assert.ok(cuts.some(row=>Number(row.START_X_MM)<0||Number(row.START_Y_MM)<0));
  for(const row of cuts) for(const key of ['START_X_MM','START_Y_MM','END_X_MM','END_Y_MM','PARENT_X_MM','PARENT_Y_MM','BLADE_CENTER_OFFSET_MM','RETAINED_SIZE_MM']) assert.ok(Number.isFinite(Number(row[key])),`${key} is directly numeric, even when the blade overhangs`);
  const first=result.cutting.sheets[0].cuts[0];
  assert.equal(Number(cuts[0].START_X_MM),first.x1);
  assert.ok(table(files.find(file=>file.path==='cut-list.csv').content).every(row=>row.CABINET.startsWith("'=")));
});

test('the readable workshop table and CSV retain numeric raw sizes, bands, materials and global IDs with localized headers', () => {
  const project = shelfProject(), second = createCabinet('base', project, { width: 700, height: 860, name: 'Second; "cabinet"' }); project.cabinets.push(second);
  project.settings.deductEdge = false;
  const before = structuredClone(project);
  const expectedHeaders = { tr: ['Parça kodu', 'Kalınlık (mm)', 'Ham kesim boy B (mm), bant düşülmüş', 'E1 Sol bant (mm)'], ru: ['Код детали', 'Толщина (мм)', 'Распил длина B (мм), кромка вычтена', 'E1 Слева кромка (мм)'], en: ['Part code', 'Thickness (mm)', 'Raw cut length B (mm), bands deducted', 'E1 Left band (mm)'] };
  const fields = ['CUT_WIDTH_MM', 'CUT_LENGTH_MM', 'QUANTITY', 'PART_ID', 'DESCRIPTION', 'CABINET', 'MATERIAL', 'DECOR_CODE', 'THICKNESS_MM', 'INFO_EDGE_LENGTH_1_MM', 'INFO_EDGE_LENGTH_2_MM', 'INFO_EDGE_WIDTH_1_MM', 'INFO_EDGE_WIDTH_2_MM', 'GRAIN_AXIS', 'ROTATABLE', 'SHAPE', 'FINISHED_WIDTH_MM', 'FINISHED_LENGTH_MM', 'DXF_FILE'];
  const numericColumns = [0,1,2,8,9,10,11,12,16,17];
  for (const language of ['tr', 'ru', 'en']) for (const cabinetId of [null, second.id]) {
    const options = { language, cabinetId }, machine = table(generateFactoryCSV(project, options)), human = getWorkshopTable(project, options), text = generateWorkshopCSV(project, options), [headers, ...rows] = parseCsv(text);
    assert.equal(text[0], '\ufeff'); assert.deepEqual(headers, human.columns); assert.equal(headers.length, 19);
    for (const header of expectedHeaders[language]) assert.ok(headers.includes(header));
    assert.equal(rows.length, machine.length); assert.equal(human.rows.length, rows.length);
    assert.match(human.documentInfo.id, /^AT-[A-F\d]{16}$/); assert.equal(human.language, language);
    for (let row = 0; row < rows.length; row++) {
      const original = machine.find(part => part.PART_ID === rows[row][3]);
      for (let column of [0,1,2,3,4,5,6,7,8,9,10,11,12,16,17,18]) assert.equal(rows[row][column], String(original[fields[column]]));
      for (const column of numericColumns) { assert.equal(typeof human.rows[row][column], 'number'); assert.equal(human.rows[row][column], Number(original[fields[column]])); }
      assert.equal(human.rows[row][3], original.PART_ID); assert.equal(rows[row][18], original.DXF_FILE);
    }
    assert.ok(human.groups.length >= 2);
    assert.deepEqual(human.groups.flatMap(group => group.rows.map(row=>row[3])).sort(), machine.map(row=>row.PART_ID).sort());
    for (const group of human.groups) {
      const stock = project.materials.find(stock => stock.id === group.materialId);
      assert.equal(group.materialName,machine.find(row=>row.PART_ID===group.rows[0][3]).MATERIAL);
      assert.equal(group.decorCode,stock.decorCode??''); assert.equal(group.thickness,stock.thickness);
      assert.equal(group.sheetWidth,stock.sheetWidth); assert.equal(group.sheetHeight,stock.sheetHeight);
      assert.equal(group.columns.length,12); assert.deepEqual(group.columns.slice(0,2),human.columns.slice(0,2));
      assert.ok(!group.columns.includes(human.columns[6])&&!group.columns.includes(human.columns[8]), 'material and gauge are in the group header');
      for (const grouped of group.rows) {
        const original=human.rows.find(row=>row[3]===grouped[3]);
        assert.deepEqual(grouped,[...original.slice(0,6),...original.slice(9,14),original[15]],'compact material table preserves dimensions, IDs, bands, grain and shape');
      }
    }
    const files = buildFactoryFiles(project, options);
    assert.equal(files.find(file => file.path === 'kesim-listesi.csv').content, text);
    const excel = generateFactoryXLSX(project, options);
    assert.ok(excel instanceof Uint8Array); assert.equal(new DataView(excel.buffer).getUint32(0, true), 0x04034b50);
    assert.deepEqual(files.find(file => file.path === 'kesim-listesi.xlsx').content, excel);
    if (cabinetId !== null) assert.ok(rows.every(row=>row[3] !== 'P0001'));
  }
  assert.deepEqual(project, before);
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
  assert.ok(minimal.every(file => ['cut-list.csv','sheet-layout.csv','README.txt'].includes(file.path) || file.path.startsWith('dxf/') || file.path.startsWith('cuts/')));
  assert.doesNotMatch(minimalNotes, /parts\/|materials\.csv|assembly\.html/);
});
