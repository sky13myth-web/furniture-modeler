import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, createSection, generateParts } from '../src/engine.js';
import { createDrawingSvg, createPartSvg, generateDrawingHTML, FurnitureViewport } from '../src/renderer.js';
import { productionPartCode } from '../src/production-id.js';
import { printNumber, translatePrintText } from '../src/print-i18n.js';

test('production part codes remain global when printing one cabinet and match individual part SVGs', () => {
  const project = createDefaultProject('tr'), first = project.cabinets[0], second = structuredClone(first);
  second.id = 'cabinet-2'; second.name = 'Second cabinet'; second.x = 2000;
  project.cabinets.push(second);
  const parts = generateParts(project), index = parts.findIndex(part => part.cabinetId === second.id), secondPart = parts[index];
  assert.equal(productionPartCode(0), 'P0001');
  assert.equal(productionPartCode(index), 'P0025');
  assert.throws(() => productionPartCode(-1), RangeError);
  const html = generateDrawingHTML(project, { cabinetId: second.id, language: 'en' });
  assert.match(html, /<td>P0025<\/td>/);
  assert.doesNotMatch(html, /<td>P0001<\/td>/);
  const svg = createPartSvg(secondPart, project, { language: 'en' });
  assert.match(svg, /data-production-part-code="P0025"/);
  assert.match(svg, /<title>P0025 · Second cabinet/);
  const explicit = createPartSvg(secondPart, project, { language: 'en', partCode: 'P0025' });
  assert.equal(explicit, svg, 'batch exports can pass the same precomputed production code');
});

test('grain direction is explicit along B on individual SVGs and in each production table row', () => {
  const project = createDefaultProject('tr'), parts = generateParts(project), grained = parts.find(part => part.grain), plain = parts.find(part => !part.grain);
  for (const language of ['ru', 'tr', 'en']) {
    const svg = createPartSvg(grained, project, { language });
    assert.match(svg, /data-grain-axis="B"/);
    assert.ok(svg.includes(translatePrintText('Текстура: B — вдоль высоты детали', language)));
    assert.doesNotMatch(createPartSvg(plain, project, { language }), /data-grain-axis|along part height|parça yüksekliği boyunca/);
    const html = generateDrawingHTML(project, { cabinetId: project.cabinets[0].id, language });
    assert.ok(html.includes(`<th>${translatePrintText('Ось текстуры', language)}</th>`));
    const rows = [...html.matchAll(/<tr><td>(P\d+)<\/td>([\s\S]*?)<\/tr>/g)];
    assert.equal(rows.length, parts.length);
    for (const [ , code, cells ] of rows) {
      const index = Number(code.slice(1)) - 1, values = [...cells.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(cell => cell[1]);
      assert.equal(values[4], parts[index].grain ? 'B' : '—', `${code}: the grain column follows actual stock direction`);
    }
  }
});

test('decimal cabinet dimensions remain consistent in all orthographic views and the live canvas', () => {
  const project = createDefaultProject('tr'), cabinet = project.cabinets[0];
  Object.assign(cabinet, { width: 900.4, height: 2200.6, depth: 620.2 });
  for (const language of ['ru', 'tr', 'en']) for (const [view, values] of [['front', [900.4, 2200.6]], ['right', [620.2, 2200.6]], ['top', [900.4, 620.2]]]) {
    const svg = createDrawingSvg(project, view, { cabinetId: cabinet.id, language });
    const labels = [...svg.matchAll(/font-size="12" fill="#35433d">([^<]+)<\/text>/g)].map(match => match[1]);
    for (const value of values) assert.ok(labels.includes(printNumber(value, language)), `${view}/${language}: ${value} mm is not rounded to a whole millimetre`);
  }
  const drawn = [], context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }), fillText: text => drawn.push(text) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 900, height: 700, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
  const viewport = new FurnitureViewport(canvas);
  try { viewport.language = 'en'; viewport.setProject(project, cabinet.id); viewport.setOptions({ room: false, focusCabinet: true, dimensions: true }); viewport.setView('front');
    assert.ok(drawn.includes('900.4')); assert.ok(drawn.includes('2,200.6'));
  } finally { viewport.destroy(); }
});

test('a grain marker on the individual part drawing stays inside either deep L cut blank', () => {
  const inside = (x, y, outline) => {
    let result = false;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
      const a = outline[i], b = outline[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  for (const corner of ['back-left', 'back-right']) {
    const project = createDefaultProject('en'), cabinet = project.cabinets[0];
    Object.assign(cabinet, { width: 947.625, height: 1431.875, depth: 657.25, plinth: 113.5, edgeBand: .75, sidesToFloor: false,
      materialId: 'mdf-oak', frontMaterialId: 'mdf-oak', layout: { ...createSection('open'), id: 'deep-opening', shelves: 1 }, cutout: { corner, width: 251.875, depth: 560 } });
    const roof = generateParts(project).find(part => part.name === 'Крышка'), before = structuredClone({ project, roof }), svg = createPartSvg(roof, project, { language: 'en' });
    const path = svg.match(/data-grain-axis="B">[\s\S]*?<path d="([^"]+)"/)[1], scale = Math.min(800 / roof.width, 430 / roof.height);
    const points = [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(([, x, y]) => ({ x: (Number(x) - 500) / scale + roof.width / 2, y: (Number(y) - 320) / scale + roof.height / 2 }));
    assert.equal(points.length, 8);
    assert.equal(points[0].x, points[1].x);
    assert.ok(points.every(point => inside(point.x, point.y, roof.outline)), 'shaft and both arrowheads lie in actual unremoved material');
    assert.deepEqual({ project, roof }, before);
  }
});
