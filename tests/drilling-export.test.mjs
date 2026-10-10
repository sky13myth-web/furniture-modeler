import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject } from '../src/engine.js';
import { generateFactoryCSV } from '../src/factory-export.js';
import { generateDrillingPlan } from '../src/drilling.js';
import { DRILLING_COLUMNS, checkDrillingExport, generateDrillingCSV, buildDrillingFiles, generateDrillingZip, createDrillingPartSvg, layoutDrillingCallouts } from '../src/drilling-export.js';
import { crc32 } from '../src/zip-store.js';

function projectForDrilling(language = 'tr') {
  const project = createDefaultProject(language), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900, height: 1000, depth: 620, includeBack: false, layout: { id: 'open', kind: 'section', front: 'open', shelves: 1 } });
  project.settings.drilling = { enabled: true };
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
    const holes = plan.holes.filter(hole => hole.partId === part.id); if (!holes.length) continue;
    const svg = createDrillingPartSvg(part, holes, { language: 'en' });
    assert.match(svg, /In the cabinet:/); assert.match(svg, /T=0/); assert.match(svg, /data-grain-axis="B"/);
    const marker = svg.match(/<path\b[^>]*data-grain-axis="B"[^>]*\/>/)[0];
    assert.match(marker, /M 960 215 L 960 430/); // drawing max X ≤ 905
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
    const holes = plan.holes.filter(hole => hole.partId === part.id); if (!holes.length) continue;
    const svg = createDrillingPartSvg(part, holes, { language: 'en' }), scale = Math.min(820 / part.width, 300 / part.height), dx = 85 + (820 - part.width * scale) / 2, dy = 185 + (300 - part.height * scale) / 2;
    assert.equal(Number(attr(svg, 'data-raw-origin-a-mm')), part.rawOrigin.a); assert.equal(Number(attr(svg, 'data-raw-origin-b-mm')), part.rawOrigin.b);
    assert.match(svg, /A=0, B=0/); assert.match(svg, /Axis directions in the assembled project/); assert.match(svg, /Entry surface/);
    const circles = [...svg.matchAll(/<circle\b[^>]*data-operation-id="([^"]+)"[^>]*\/>/g)]; assert.equal(circles.length, holes.length);
    for (const [markup, id] of circles) {
      const hole = holes.find(operation => operation.id === id);
      assert.equal(Number(attr(markup, 'data-a-mm')), hole.a); assert.equal(Number(attr(markup, 'data-b-mm')), hole.b); assert.equal(attr(markup, 'data-face'), hole.face);
      assert.ok(Math.abs(Number(attr(markup, 'cx')) - (dx + hole.a * scale)) <= .00051); assert.ok(Math.abs(Number(attr(markup, 'cy')) - (dy + hole.b * scale)) <= .00051);
      assert.equal(attr(markup, 'class'), hole.kind === 'pilot' ? 'edge-hole' : 'face-hole');
    }
  }
});

test('a separate package contains all operations exactly once in paged maps and no cutting/CNC entities', () => {
  const project = createDefaultProject('tr'); project.settings.drilling = { enabled: true };
  const plan = generateDrillingPlan(project), files = buildDrillingFiles(project), maps = files.filter(file => file.path.startsWith('maps/'));
  assert.ok(maps.length > 0); assert.ok(maps.every(file => file.path.endsWith('.svg')));
  const drawn = maps.flatMap(file => [...file.content.matchAll(/data-operation-id="([^"]+)"/g)].map(match => match[1]));
  assert.deepEqual(drawn.sort(), plan.holes.map(hole => hole.id).sort()); assert.equal(new Set(drawn).size, plan.holes.length);
  assert.ok(maps.every(file => [...file.content.matchAll(/data-operation-id=/g)].length <= 14));
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
      const scale = Number(attr(svg, 'data-diagram-scale')), panel = { x: Number(attr(svg, 'data-diagram-x')), y: Number(attr(svg, 'data-diagram-y')), width: part.width * scale, height: part.height * scale };
      const boxes = [...svg.matchAll(/<g\b[^>]*data-label-id="([^"]+)"[^>]*>/g)].map(([markup, id]) => ({ id, x: Number(attr(markup, 'data-label-x')), y: Number(attr(markup, 'data-label-y')), width: Number(attr(markup, 'data-label-width')), height: Number(attr(markup, 'data-label-height')) }));
      assert.ok(boxes.some(box => box.id === 'origin')); assert.ok(boxes.some(box => box.id === 'axes'));
      for (const [index, box] of boxes.entries()) {
        assert.ok(box.x >= 0 && box.x + box.width <= 1000 && box.y >= 161 && box.y + box.height < 500);
        assert.ok(!overlap(box, panel), `${file.path}: ${box.id} must not cover the contour`);
        for (const other of boxes.slice(index + 1)) assert.ok(!overlap(box, other), `${file.path}: ${box.id} overlaps ${other.id}`);
        if (box.id.startsWith('G')) {
          assert.equal([...svg.matchAll(new RegExp(`data-callout-for="${box.id}"`, 'g'))].length, 1);
          assert.ok(svg.includes(`<text x="120"`) && svg.includes(`>${box.id}</text>`), 'callout identifiers remain available in the operation table');
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
