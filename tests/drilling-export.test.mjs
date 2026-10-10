import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { generateFactoryCSV } from '../src/factory-export.js';
import { generateDrillingPlan } from '../src/drilling.js';
import { DRILLING_COLUMNS, checkDrillingExport, generateDrillingCSV, buildDrillingFiles, generateDrillingZip, createDrillingPartSvg, layoutDrillingCallouts } from '../src/drilling-export.js';
import { crc32 } from '../src/zip-store.js';
import { getDocumentInfo } from '../src/print-document.js';

function projectForDrilling(language = 'tr') {
  const project = createDefaultProject(language), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 1000, depth: 620, includeBack: false, layout: { id: 'open', kind: 'section', front: 'open', shelves: 1 } });
  project.settings.drilling = { enabled: true };
  return project;
}

test('two-screw exports identify the exact-count setting and retain paired global records in every language',()=>{
  for(const language of ['ru','tr','en']) {
    const project=projectForDrilling(language);project.settings.drilling.screwsPerJoint=2;
    const plan=generateDrillingPlan(project);assert.equal(plan.valid,true);assert.ok(plan.joints.every(j=>j.pairIds.length===2));
    const files=buildDrillingFiles(project,{language}),settings=table(files.find(f=>f.path==='settings.csv').content),readme=files.find(f=>f.path==='README.txt').content;
    assert.equal(settings.find(row=>row.PARAMETER==='screwsPerJoint')?.VALUE,'2');assert.match(readme,/SCREWS_PER_JOINT=2/);
    const message={ru:'2 винта на стык',tr:'Bağlantı başına 2 vida',en:'2 screws per joint'}[language];
    const maps=files.filter(f=>f.path.startsWith('maps/'));
    assert.ok(maps.length);assert.ok(maps.every(f=>f.content.includes(message)));
    assert.deepEqual(table(files.find(f=>f.path==='drilling.csv').content).map(row=>row.OPERATION_ID),plan.holes.map(h=>h.id));
    if(language!=='ru')assert.doesNotMatch(readme,/[А-Яа-яЁё]/);
  }
});
function projectWithTwoCabinets() {
  const project = projectForDrilling('en'), first = project.cabinets[0];
  Object.assign(first, { name: 'First cabinet', x: 20, z: 20 });
  const second = structuredClone(first);
  Object.assign(second, { id: 'cabinet-2', name: 'Second cabinet', x: 1300 });
  second.layout.id = 'open-2'; project.cabinets.push(second);
  return project;
}
// Actual importer: quotes, newlines and separators are parsed independently.
function parseCsv(text) {
  const rows = [], row = []; let cell = '', quoted = false;
  text = text.replace(/^\ufeff/, '');
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (!quoted && character === ';') { row.push(cell); cell = ''; }
    else if (!quoted && character === '\n') { row.push(cell.replace(/\r$/, '')); rows.push([...row]); row.length = 0; cell = ''; }
    else cell += character;
  }
  return rows;
}
const table = text => { const [header, ...rows] = parseCsv(text); return rows.map(row => Object.fromEntries(header.map((key, index) => [key, row[index]]))); };
const attr = (markup, name) => markup.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

test('standalone drilling CSV shares global cutting IDs and contains exact raw entry and vector coordinates', () => {
  const project = projectForDrilling(), before = structuredClone(project), plan = generateDrillingPlan(project), text = generateDrillingCSV(project), rows = table(text), cutRows = table(generateFactoryCSV(project));
  assert.equal(text[0], '\ufeff'); assert.match(text, /\r\n/); assert.deepEqual(parseCsv(text)[0], DRILLING_COLUMNS);
  assert.ok(parseCsv(text).every(row => row.length === DRILLING_COLUMNS.length)); assert.equal(rows.length, plan.holes.length); assert.ok(rows.length > 0);
  for (const [index, row] of rows.entries()) {
    const hole = plan.holes[index], panel = plan.parts.find(part => part.id === hole.partId), cut = cutRows.find(part => part.PART_ID === row.PART_ID);
    assert.equal(row.SOURCE_PART_ID, cut.SOURCE_PART_ID); assert.equal(row.SOURCE_PART_ID, panel.id);
    assert.equal(row.OPERATION_ID, hole.id); assert.equal(row.JOINT_ID, hole.pairId); assert.equal(row.FACE, hole.face);
    assert.equal(Number(row.A_MM), hole.a); assert.equal(Number(row.B_MM), hole.b); assert.equal(Number(row.THICKNESS_COORD_MM), hole.thicknessCoordinate);
    for (const axis of ['x', 'y', 'z']) { assert.equal(Number(row[`WORLD_ENTRY_${axis.toUpperCase()}_MM`]), hole.worldEntry[axis]); assert.equal(Number(row[`DIRECTION_${axis.toUpperCase()}`]), hole.direction[axis]); }
    assert.equal(Number(row.RAW_A_SIZE_MM), panel.width); assert.equal(Number(row.RAW_B_SIZE_MM), panel.height);
    assert.equal(row.DIMENSION_BASIS, 'RAW_BLANK_EDGE_ALREADY_DEDUCTED');
    assert.equal(row.PANEL_ORIENTATION, panel.orientation); assert.ok(row.PANEL_AXES.length > 30); assert.ok(row.ENTRY_FACE_REFERENCE.length > 4);
  }
  assert.deepEqual(project, before); assert.doesNotMatch(text, /[А-Яа-яЁё]/);
});

test('arbitrary room rotations retain precise numeric drilling directions instead of reducing them to three decimals', () => {
  const project = projectForDrilling(); project.cabinets[0].rotation = 37;
  const plan = generateDrillingPlan(project), rows = table(generateDrillingCSV(project));
  assert.ok(rows.some(row => /^-?0\.\d{4,}$/.test(row.DIRECTION_X)));
  for (const [index, row] of rows.entries()) for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs(Number(row[`DIRECTION_${axis.toUpperCase()}`]) - plan.holes[index].direction[axis]) < 1e-11);
});

test('L-notch entry edges are identified by drilling direction and actual coordinates, rather than falsely called A=0', () => {
  const project = projectForDrilling(); project.cabinets[0].cutout = { corner: 'back-left', width: 300, depth: 220 };
  const plan = generateDrillingPlan(project), rows = table(generateDrillingCSV(project, { language: 'en' }));
  const inner = plan.holes.find(hole => hole.kind === 'pilot' && hole.face === 'edge-a-min' && hole.a > 1);
  assert.ok(inner, 'an inner notch has a receiving edge away from the bounding-box origin');
  const row = rows.find(operation => operation.OPERATION_ID === inner.id);
  assert.equal(row.ENTRY_FACE_REFERENCE, 'Edge, drilling A+'); assert.equal(Number(row.A_MM), inner.a);
  const part = plan.parts.find(panel => panel.id === inner.partId), svg = createDrillingPartSvg(part, [inner], { language: 'en' });
  assert.match(svg, /Edge, drilling A\+/); assert.doesNotMatch(svg, /Edge A=0/);
  const readme = buildDrillingFiles(project, { language: 'en' }).find(file => file.path === 'README.txt').content;
  assert.match(readme, /inner notch edge/); assert.match(readme, /orientation may differ from a cut-only drawing/);
});

test('grain is marked along B outside the cut contour and every map identifies its physical cabinet faces', () => {
  const project = projectForDrilling(); project.cabinets[0].materialId = 'mdf-oak';
  const plan = generateDrillingPlan(project);
  for (const part of plan.parts) {
    const holes = plan.holes.filter(hole => hole.partId === part.id).slice(0, 6); if (!holes.length) continue;
    const svg = createDrillingPartSvg(part, holes, { language: 'en' });
    assert.match(svg, /In the cabinet:/); assert.match(svg, /T=0/); assert.match(svg, /data-grain-axis="B"/);
    const marker = svg.match(/<path\b[^>]*data-grain-axis="B"[^>]*\/>/)[0];
    const top = Number(attr(svg, 'data-diagram-top'));
    assert.match(marker, new RegExp(`M 960 ${top + 30} L 960 ${top + 245}`)); // drawing max X ≤ 905
  }
});

test('signed numeric direction cells remain parseable numbers while descriptions are formula-neutralised', () => {
  const project = projectForDrilling('en'); project.cabinets[0].name = '=SUM(1;2) "test"\nline';
  const rows = table(generateDrillingCSV(project, { language: 'en' }));
  assert.ok(rows.every(row => row.CABINET === '\'=SUM(1;2) "test"\nline'));
  assert.ok(rows.some(row => row.DIRECTION_X === '-1'));
  for (const row of rows) for (const axis of ['A', 'B', 'T']) assert.ok(Number.isFinite(Number(row[`LOCAL_DIRECTION_${axis}`])));
  assert.ok(rows.every(row => !row.DIRECTION_X.startsWith("'") && !row.DIRECTION_Y.startsWith("'") && !row.DIRECTION_Z.startsWith("'")));
});

test('unset head-seat depth is explicitly blank, never silently exported as zero, and workshop settings are included', () => {
  const project = projectForDrilling(), rows = table(generateDrillingCSV(project)), headSeats = rows.filter(row => row.OPERATION === 'countersink');
  assert.ok(headSeats.length > 0); assert.ok(headSeats.every(row => row.DEPTH_MM === '' && row.REQUIRES_SETUP === '1'));
  assert.ok(rows.filter(row => row.OPERATION !== 'countersink').every(row => Number(row.DEPTH_MM) > 0 && row.REQUIRES_SETUP === '0'));
  const files = buildDrillingFiles(project), readme = files.find(file => file.path === 'README.txt').content, settings = table(files.find(file => file.path === 'settings.csv').content);
  assert.match(readme, /Boş DEPTH_MM/); assert.match(readme, /CNC programı/); assert.ok(settings.some(row => row.PARAMETER === 'countersinkDepth' && row.VALUE === 'UNSET'));
  project.settings.drilling.countersinkDepth = 2;
  assert.ok(table(generateDrillingCSV(project)).filter(row => row.OPERATION === 'countersink').every(row => row.DEPTH_MM === '2' && row.REQUIRES_SETUP === '0'));
});

test('disabled, impossible bores and invalid manufacturing drafts are blocked', () => {
  const project = projectForDrilling(); project.settings.drilling.enabled = false;
  assert.equal(checkDrillingExport(project).valid, false); assert.throws(() => generateDrillingCSV(project, { language: 'en' }), /Enable carcass drilling/);
  project.settings.drilling.enabled = true; project.settings.drilling.pilotDiameter = 8;
  assert.equal(checkDrillingExport(project).valid, false); assert.throws(() => generateDrillingZip(project, { language: 'en' }), /Correct project/);
  project.settings.drilling.pilotDiameter = 5; project.cabinets[0].includeBack = true; project.cabinets[0].backThickness = 8;
  assert.equal(checkDrillingExport(project).valid, false); assert.throws(() => generateDrillingCSV(project, { language: 'en' }), /Correct project/);
});

test('SVG operation markers use the physical raw frame without mirroring and distinguish edge bores from faces', () => {
  const project = projectForDrilling(), plan = generateDrillingPlan(project);
  for (const part of plan.parts) {
    const holes = plan.holes.filter(hole => hole.partId === part.id).slice(0, 6); if (!holes.length) continue;
    const svg = createDrillingPartSvg(part, holes, { language: 'en' }), scale = Math.min(820 / part.width, 300 / part.height), dx = 85 + (820 - part.width * scale) / 2, dy = Number(attr(svg, 'data-diagram-top')) + (300 - part.height * scale) / 2;
    assert.equal(Number(attr(svg, 'data-raw-origin-a-mm')), part.rawOrigin.a); assert.equal(Number(attr(svg, 'data-raw-origin-b-mm')), part.rawOrigin.b);
    assert.match(svg, /0,0 is marked on the map/); assert.match(svg, /Outer edges:/); assert.match(svg, /Entry surface/);
    const circles = [...svg.matchAll(/<circle\b[^>]*data-operation-id="([^"]+)"[^>]*\/>/g)]; assert.equal(circles.length, holes.length);
    for (const [markup, id] of circles) {
      const hole = holes.find(operation => operation.id === id);
      assert.equal(Number(attr(markup, 'data-a-mm')), hole.a); assert.equal(Number(attr(markup, 'data-b-mm')), hole.b); assert.equal(attr(markup, 'data-face'), hole.face);
      assert.ok(Math.abs(Number(attr(markup, 'cx')) - (dx + hole.a * scale)) <= .00051); assert.ok(Math.abs(Number(attr(markup, 'cy')) - (dy + hole.b * scale)) <= .00051);
      assert.equal(attr(markup, 'class'), hole.kind === 'pilot' ? 'edge-hole' : 'face-hole');
    }
  }
});

test('a separate package draws every part operation on its first sheet and lists all coordinates once across tables', () => {
  const project = createDefaultProject('tr'); project.settings.drilling = { enabled: true };
  const plan = generateDrillingPlan(project), files = buildDrillingFiles(project), maps = files.filter(file => file.path.startsWith('maps/'));
  assert.ok(maps.length > 0); assert.ok(maps.every(file => file.path.endsWith('.svg')));
  const drawn = maps.flatMap(file => [...file.content.matchAll(/data-operation-id="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual(drawn.sort(), plan.holes.map(hole => hole.id).sort()); assert.equal(new Set(drawn).size, plan.holes.length);
  const listed = maps.flatMap(file => [...file.content.matchAll(/data-table-operation-id="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual(listed.sort(), plan.holes.map(hole => hole.id).sort());
  for (const part of plan.parts.filter(part => plan.holes.some(hole => hole.partId === part.id))) {
    const pages = maps.filter(file => attr(file.content, 'data-part-id') === part.id);
    assert.equal(attr(pages[0].content, 'data-map-role'), 'diagram');
    assert.deepEqual([...pages[0].content.matchAll(/data-operation-id="([^"]+)"/g)].map(match => match[1]).sort(), plan.holes.filter(hole=>hole.partId===part.id).map(hole=>hole.id).sort());
    for (const page of pages.slice(1)) {
      assert.equal(attr(page.content, 'data-map-role'), 'table');
      assert.doesNotMatch(page.content, /data-operation-id=|data-drilling-contour=|<circle|<path/);
    }
  }
  const manifest = table(files.find(file => file.path === 'parts.csv').content);
  assert.equal(manifest.reduce((sum, row) => sum + Number(row.OPERATION_COUNT), 0), plan.holes.length);
  assert.ok(files.every(file => !file.path.endsWith('.dxf') && !file.path.startsWith('dxf/') && file.path !== 'cut-list.csv'));
  assert.ok(files.every(file => !/[А-Яа-яЁё]/.test(file.content)));
  const bytes = generateDrillingZip(project), view = new DataView(bytes.buffer); assert.equal(view.getUint32(0, true), 0x04034b50);
  let offset = 0, entries = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), nameSize = view.getUint16(offset + 26, true), extraSize = view.getUint16(offset + 28, true), start = offset + 30 + nameSize + extraSize;
    assert.equal(crc32(bytes.subarray(start, start + size)), view.getUint32(offset + 14, true)); offset = start + size; entries++;
  }
  assert.equal(entries, files.length); assert.equal(view.getUint32(offset, true), 0x02014b50);
});

test('tall narrow and wide shallow panels have separated outside callouts and reserved origin/axis labels', () => {
  const projects = [createDefaultProject('tr'), projectForDrilling()];
  Object.assign(projects[1].cabinets[0], { width: 2700, height: 800, depth: 300 });
  let sawTall = false, sawWide = false;
  const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const project of projects) {
    project.settings.drilling = { enabled: true };
    const plan = generateDrillingPlan(project), maps = buildDrillingFiles(project).filter(file => file.path.startsWith('maps/'));
    for (const file of maps) {
      const svg = file.content, part = plan.parts.find(panel => panel.id === attr(svg, 'data-part-id'));
      sawTall ||= part.height / part.width > 3; sawWide ||= part.width / part.height > 5;
      if (attr(svg, 'data-map-role') === 'table') { assert.doesNotMatch(svg, /data-label-id=/); continue; }
      const scale = Number(attr(svg, 'data-diagram-scale')), panel = { x: Number(attr(svg, 'data-diagram-x')), y: Number(attr(svg, 'data-diagram-y')), width: part.width * scale, height: part.height * scale };
      const boxes = [...svg.matchAll(/<g\b[^>]*data-label-id="([^"]+)"[^>]*>/g)].map(([markup, id]) => ({ id, x: Number(attr(markup, 'data-label-x')), y: Number(attr(markup, 'data-label-y')), width: Number(attr(markup, 'data-label-width')), height: Number(attr(markup, 'data-label-height')) }));
      assert.ok(boxes.some(box => box.id === 'origin')); assert.ok(boxes.some(box => box.id === 'axes'));
      for (const [index, box] of boxes.entries()) {
        const top = Number(attr(svg, 'data-diagram-top'));
        assert.ok(box.x >= 0 && box.x + box.width <= 1000 && box.y >= top - 24 && box.y + box.height <= top + 301);
        assert.ok(!overlap(box, panel), `${file.path}: ${box.id} must not cover the contour`);
        for (const other of boxes.slice(index + 1)) assert.ok(!overlap(box, other), `${file.path}: ${box.id} overlaps ${other.id}`);
        if (box.id.startsWith('G')) {
          assert.equal([...svg.matchAll(new RegExp(`data-callout-for="${box.id}"`, 'g'))].length, 1);
          assert.ok(maps.some(map => map.content.includes(`<text x="225"`) && map.content.includes(`>${box.id}</text>`)), 'callout identifiers remain available in the complete operation table');
        }
      }
    }
  }
  assert.ok(sawTall && sawWide, 'regression witnesses must include both actual narrow side and wide horizontal parts');
});

test('fourteen labels at an identical projected height remain readable with deterministic leader assignments', () => {
  const points = Array.from({ length: 14 }, (_, index) => ({ id: `G${String(index + 1).padStart(2, '0')}`, x: 450 + index / 10, y: 190 }));
  const labels = layoutDrillingCallouts(points);
  assert.deepEqual(labels, layoutDrillingCallouts([...points].reverse()));
  assert.deepEqual(labels.map(label => label.id).sort(), points.map(point => point.id).sort());
  for (const side of ['left', 'right']) {
    const column = labels.filter(label => label.side === side);
    assert.equal(column.length, 7);
    for (const [index, label] of column.entries()) {
      assert.equal(label.x, points.find(point => point.id === label.id).x); assert.equal(label.y, 190);
      assert.ok(label.labelY >= 199 && label.labelY + label.labelHeight <= 486);
      if (index) assert.ok(label.labelY - column[index - 1].labelY >= 26);
    }
  }
});

test('each printed map independently identifies its document, material, fastener and operation types in all three languages', () => {
  for (const language of ['ru', 'tr', 'en']) {
    const project = projectForDrilling(language), issuedAt = '2026-10-09T22:30:00Z', info = getDocumentInfo(project, { issuedAt });
    const files = buildDrillingFiles(project, { language, issuedAt }), maps = files.filter(file => file.path.startsWith('maps/'));
    const plan = generateDrillingPlan(project), manifest = table(files.find(file => file.path === 'document-info.csv').content)[0];
    assert.equal(info.date, '2026-10-10', 'issue date uses Turkey rather than the UTC calendar day');
    assert.equal(manifest.DOCUMENT_ID, info.id); assert.equal(manifest.ISSUE_DATE, info.date);
    assert.equal(Number(manifest.SCREW_COUNT), new Set(plan.holes.map(hole => hole.pairId)).size);
    assert.equal(Number(manifest.OPERATION_COUNT), plan.holes.length);
    for (const map of maps) {
      assert.equal(attr(map.content, 'data-document-id'), info.id); assert.equal(attr(map.content, 'data-document-date'), info.date);
      assert.ok(map.content.includes('7 × 50 mm')); assert.ok(map.content.includes('Yıldız MDFLAM'));
      const tableRows = [...map.content.matchAll(/<g\b[^>]*data-table-operation-id="([^"]+)"[^>]*data-operation-kind="([^"]+)"[^>]*>/g)];
      const holeIds = [...map.content.matchAll(/data-operation-id="([^"]+)"/g)].map(match => match[1]);
      if (attr(map.content,'data-map-role') === 'diagram') {
        const partId=attr(map.content,'data-part-id');
        assert.deepEqual(holeIds.sort(),plan.holes.filter(hole=>hole.partId===partId).map(hole=>hole.id).sort());
      } else assert.deepEqual(holeIds,[]);
      for (const row of tableRows) assert.equal(row[2], plan.holes.find(hole => hole.id === row[1]).kind);
      assert.match(map.content, /data-physical-edge-captions="true"/);
    }
    const html = files.find(file => file.path === 'drilling-reference.html').content;
    assert.match(html, /class="cover"/); assert.match(html, /\.cover\{break-after:page/);
    assert.ok(html.includes(info.id)); assert.ok(html.includes('7 × 50 mm'));
    assert.doesNotMatch(html, /max-height:/, 'a fixed height limit must never shrink text to fit');
    if (language !== 'ru') assert.ok(files.every(file => !/[А-Яа-яЁё]/.test(file.content)));
  }
});

test('full-part G markers stay stable on continuation tables and dense overview diagrams retain every hole', () => {
  for (const language of ['ru','tr','en']) for (const maxSpacing of [300,20]) {
    const project=projectForDrilling(language);
    project.settings.drilling={enabled:true,maxSpacing,integerSpacing:true};
    const plan=generateDrillingPlan(project),files=buildDrillingFiles(project,{language}),maps=files.filter(file=>file.path.startsWith('maps/'));
    assert.equal(plan.valid,true);
    for(const part of plan.parts.filter(part=>plan.holes.some(hole=>hole.partId===part.id))){
      const pages=maps.filter(file=>attr(file.content,'data-part-id')===part.id),overview=pages[0].content;
      const markerByHole=new Map([...overview.matchAll(/<circle\b[^>]*>/g)].map(([tag])=>[attr(tag,'data-operation-id'),attr(tag,'data-marker-id')]));
      const holes=plan.holes.filter(hole=>hole.partId===part.id);
      assert.equal(markerByHole.size,holes.length);
      const expectedGroups=new Map();
      for(const hole of holes){const key=`${hole.a}:${hole.b}`;if(!expectedGroups.has(key))expectedGroups.set(key,`G${String(expectedGroups.size+1).padStart(2,'0')}`);assert.equal(markerByHole.get(hole.id),expectedGroups.get(key));}
      const listed=[];
      for(const page of pages){
        const svg=page.content;
        assert.ok(Number(attr(svg,'data-paper-height-mm'))<=267);
        assert.ok(Number(attr(svg,'data-font-em-mm'))>=3.5);
        assert.equal(attr(svg,'data-integer-spacing'),undefined);
        for(const [tag] of svg.matchAll(/<g\b[^>]*data-table-operation-id="[^"]+"[^>]*>/g)){
          const id=attr(tag,'data-table-operation-id');listed.push(id);assert.equal(attr(tag,'data-marker-id'),markerByHole.get(id));
        }
      }
      assert.deepEqual(listed.sort(),holes.map(hole=>hole.id).sort());
      if(expectedGroups.size>22){assert.equal(attr(overview,'data-marker-mode'),'coordinates');assert.doesNotMatch(overview,/data-callout-for=/);}
      else assert.equal([...overview.matchAll(/data-label-id="G/g)].length,expectedGroups.size);
    }
    const settings=table(files.find(file=>file.path==='settings.csv').content);
    assert.equal(settings.find(row=>row.PARAMETER==='integerSpacing'),undefined);
    assert.doesNotMatch(files.find(file=>file.path==='README.txt').content,/INTEGER_SPACING=/);
  }
});

test('retired integer-spacing flags do not affect coordinates or appear in any export', () => {
  for (const language of ['ru','tr','en']) {
    const project=projectForDrilling(language),exact=buildDrillingFiles(project,{language});
    for (const integerSpacing of [true,false]) {
      project.settings.drilling.integerSpacing=integerSpacing;
      const files=buildDrillingFiles(project,{language});
      assert.deepEqual(files.map(file=>file.path),exact.map(file=>file.path));
      // The original unnormalised project is still a different source revision;
      // geometry, operations and every other exported byte stay identical.
      const geometryContent=content=>content.replaceAll(/AT-[A-F0-9]{16}/g,'QA-DOCUMENT');
      for (const [index,file] of files.entries()) assert.equal(geometryContent(file.content),geometryContent(exact[index].content),file.path);
      assert.ok(files.every(file=>!(/integerSpacing|INTEGER_SPACING|data-integer-spacing|вниз до целых|aşağıya tam mm|whole mm, rounded down/.test(file.content))));
    }
  }
});

test('long identities wrap, all A4 maps retain a comfortable physical font size, and nominal dimensions do not imply an ISO tolerance class', () => {
  const project = createDefaultProject('en');
  project.settings.drilling = { enabled: true }; project.name = 'W'.repeat(100); project.cabinets[0].name = 'W'.repeat(120);
  project.materials.find(material => material.id === project.cabinets[0].materialId).name = 'W'.repeat(120);
  const maps = buildDrillingFiles(project, { language: 'en' }).filter(file => file.path.startsWith('maps/'));
  assert.ok(maps.length > 0);
  for (const map of maps) {
    const svg = map.content, width = Number(attr(svg, 'data-paper-width-mm')), height = Number(attr(svg, 'data-paper-height-mm'));
    assert.equal(width, 190); assert.ok(height <= 267);
    assert.ok(Number(attr(svg, 'data-font-em-mm')) >= 3.5);
    assert.match(svg, /width="190mm"/); assert.match(svg, /font-size:19px/); assert.doesNotMatch(svg, /font-size:13px/);
    assert.ok([...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].every(match => [...match[1].replace(/&[^;]+;/g, '#')].length <= 70));
    assert.match(svg, /Do not measure the image/); assert.match(svg, /Dimensions are nominal/); assert.doesNotMatch(svg, /ISO\s*2768|±\s*0\./);
  }
});

test('declared viewing face agrees with the physical handedness of A/right and B/down without mirroring coordinates', () => {
  const project = projectForDrilling('en'), plan = generateDrillingPlan(project);
  const original = plan.parts[0], fakeWidthPanel = { ...original, orientation: 'vertical-width', drillingBasis: { a: { x: 1, y: 0, z: 0 }, b: { x: 0, y: 1, z: 0 }, t: { x: 0, y: 0, z: 1 } } };
  for (const part of [...plan.parts, fakeWidthPanel]) {
    const holes = plan.holes.filter(hole => hole.partId === part.id).slice(0, 6); if (!holes.length) continue;
    const svg = createDrillingPartSvg(part, holes, { language: 'en' });
    const { a, b, t } = part.drillingBasis;
    const crossDotT = (a.y * b.z - a.z * b.y) * t.x + (a.z * b.x - a.x * b.z) * t.y + (a.x * b.y - a.y * b.x) * t.z;
    assert.equal(Number(attr(svg, 'data-view-from-t-mm')), crossDotT < 0 ? part.thickness : 0);
  }
});

test('exporting the second cabinet preserves every project-wide production, operation and screw identifier', () => {
  const project = projectWithTwoCabinets(), cabinetId = project.cabinets[1].id;
  const full = checkDrillingExport(project), scoped = checkDrillingExport(project, { cabinetId });
  assert.equal(full.valid, true); assert.equal(scoped.valid, true);
  assert.deepEqual(scoped.plan.holes, full.plan.holes.filter(hole => hole.cabinetId === cabinetId));
  assert.deepEqual(scoped.plan.parts, full.plan.parts.filter(part => part.cabinetId === cabinetId));
  assert.deepEqual(scoped.plan.joints, full.plan.joints.filter(joint => full.plan.parts.find(part => part.id === joint.partId).cabinetId === cabinetId));
  assert.notEqual(scoped.plan.parts[0].partCode, 'P0001', 'a cabinet export never starts a new production numbering sequence');
  const fullRows = table(generateDrillingCSV(project, { language: 'en' })), scopedRows = table(generateDrillingCSV(project, { language: 'en', cabinetId }));
  const ids = new Set(scoped.plan.holes.map(hole => hole.id));
  assert.deepEqual(scopedRows, fullRows.filter(row => ids.has(row.OPERATION_ID)));
  const cutRows = table(generateFactoryCSV(project, { language: 'en', cabinetId }));
  for (const row of scopedRows) assert.equal(cutRows.find(cut => cut.SOURCE_PART_ID === row.SOURCE_PART_ID).PART_ID, row.PART_ID);
});

test('a geometrically invalid neighbour does not block an independently valid cabinet, but global settings and the selected errors do', () => {
  const project = projectWithTwoCabinets(), bad = project.cabinets[0], good = project.cabinets[1]; bad.depth = 60;
  const full = checkDrillingExport(project), scoped = checkDrillingExport(project, { cabinetId: good.id });
  assert.equal(full.valid, false); assert.ok(full.plan.errors.length > 0, 'the neighbouring cabinet really has unsupported drilling');
  assert.equal(scoped.valid, true); assert.equal(scoped.errors.length, 0);
  assert.ok(scoped.plan.parts.every(part => part.cabinetId === good.id));
  assert.ok(table(generateDrillingCSV(project, { cabinetId: good.id })).every(row => row.CABINET === good.name));
  assert.equal(checkDrillingExport(project, { cabinetId: bad.id }).valid, false);
  assert.throws(() => generateDrillingZip(project, { cabinetId: bad.id }), /Correct|Исправьте|Düzelt|düzelt/);
  assert.equal(checkDrillingExport(project, { cabinetId: 'missing-cabinet' }).valid, false);
  project.settings.drilling.pilotDiameter = 8;
  assert.equal(checkDrillingExport(project, { cabinetId: good.id }).valid, false, 'an invalid shared screw profile is never hidden by cabinet selection');
});

test('the common archive contains self-contained per-cabinet maps and a navigable index while retaining its original top-level files', () => {
  const project = projectWithTwoCabinets(), issuedAt = '2026-10-10T10:00:00Z';
  const files = buildDrillingFiles(project, { language: 'en', issuedAt }), plan = checkDrillingExport(project).plan;
  for (const path of ['drilling.csv', 'parts.csv', 'settings.csv', 'README.txt', 'drilling-reference.html', 'cabinets.csv', 'cabinets/index.html']) assert.ok(files.some(file => file.path === path));
  const cabinetRows = table(files.find(file => file.path === 'cabinets.csv').content);
  assert.equal(cabinetRows.length, 2);
  for (const [index, row] of cabinetRows.entries()) {
    const cabinet = project.cabinets[index], holes = plan.holes.filter(hole => hole.cabinetId === cabinet.id), reference = files.find(file => file.path === row.REFERENCE_HTML);
    assert.equal(row.CABINET_ID, cabinet.id); assert.equal(Number(row.OPERATION_COUNT), holes.length);
    assert.equal(Number(row.SCREW_COUNT), new Set(holes.map(hole => hole.pairId)).size);
    assert.ok(reference); assert.match(reference.content, /<svg/);
    assert.deepEqual([...reference.content.matchAll(/data-operation-id="([^"]+)"/g)].map(match => match[1]).sort(), holes.map(hole => hole.id).sort());
    assert.ok(reference.content.includes(cabinet.name));
    assert.doesNotMatch(reference.content, /<iframe|<script|<img/, 'each cabinet map is a standalone printable document');
    assert.ok(files.find(file => file.path === 'cabinets/index.html').content.includes(row.REFERENCE_HTML.slice('cabinets/'.length)));
  }
  const selected = buildDrillingFiles(project, { language: 'en', issuedAt, cabinetId: project.cabinets[1].id });
  assert.equal(table(selected.find(file => file.path === 'cabinets.csv').content).length, 1);
  assert.ok(selected.some(file => file.path === 'cabinets/cabinet-002/drilling.html'));
  assert.ok(!selected.some(file => file.path === 'cabinets/cabinet-001/drilling.html'));
  const info = table(selected.find(file => file.path === 'document-info.csv').content)[0];
  assert.equal(info.SELECTED_CABINET_ID, project.cabinets[1].id);
  assert.equal(info.DOCUMENT_ID, table(files.find(file => file.path === 'document-info.csv').content)[0].DOCUMENT_ID, 'cabinet handoff and whole-project handoff retain the same project revision identity');
});
