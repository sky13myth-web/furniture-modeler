import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, generateParts, getPartEdgeBanding, getEdgeBandingSummary } from '../src/engine.js';
import { FurnitureViewport, createPartSvg, describePartEdges, generateDrawingHTML } from '../src/renderer.js';

function shelfProject() {
  const project = createDefaultProject('ru'), cabinet = project.cabinets[0];
  project.settings.deductEdge = true;
  Object.assign(cabinet, { width: 900, height: 2200, depth: 620, x: 100, y: 30, z: 500, rotation: 0, plinth: 100, edgeBand: 1, backThickness: 3,
    layout: { id: 'edge-section', kind: 'section', front: 'open', shelves: 1 } });
  return project;
}

const markedEdges = svg => [...svg.matchAll(/<path data-edge-band="([^"]+)" data-edge-thickness-mm="([^"]+)" d="M([^ ]+) L([^"]+)"/g)]
  .map(([, side, thickness, start, end]) => ({ side, thickness: Number(thickness), start: start.split(',').map(Number), end: end.split(',').map(Number) }));

test('a normal shelf highlights its one front edge and distinguishes cut blank from finished size', () => {
  const project = shelfProject(), shelf = generateParts(project).find(part => /полка 1$/i.test(part.name));
  assert.deepEqual(shelf.edges, { top: 0, bottom: 1, left: 0, right: 0 });
  assert.equal(getPartEdgeBanding(shelf).lengthMm, shelf.finishedWidth);
  assert.equal(shelf.finishedHeight - shelf.height, 1);
  const svg = createPartSvg(shelf, project, { language: 'ru' });
  assert.deepEqual(markedEdges(svg).map(edge => edge.side), ['bottom']);
  assert.equal(markedEdges(svg)[0].start[1], markedEdges(svg)[0].end[1]);
  assert.match(svg, /Кромить торцы: Спереди 1 мм/);
  assert.match(svg, /Оклеиваемые торцы выделены цветом\./);
  assert.match(svg, /Заготовка без кромки: 860 × 596 мм/);
  assert.match(svg, /Готовый размер с кромкой: 860 × 597 мм/);
  assert.match(svg, /width="297mm" height="210mm" viewBox="0 0 1120 792"/);
  const html = generateDrawingHTML(project, { cabinetId: project.cabinets[0].id, language: 'ru' });
  assert.match(html, /<td>Спереди 1 мм<\/td>/);
});

test('a back panel has no band marks while a facade has its four actual edges', () => {
  const project = shelfProject(), cabinet = project.cabinets[0];
  cabinet.layout = { id: 'doors', kind: 'section', front: 'doors', doors: 2, shelves: 0 };
  const parts = generateParts(project), back = parts.find(part => part.component === 'back'), door = parts.find(part => /Дверь 1$/.test(part.name));
  const noEdges = createPartSvg(back, project);
  assert.equal(markedEdges(noEdges).length, 0);
  assert.match(noEdges, /Кромить торцы: —/);
  assert.doesNotMatch(noEdges, /Оклеиваемые торцы выделены цветом|data-part-finished-size/);
  const facade = createPartSvg(door, project);
  assert.deepEqual(markedEdges(facade).map(edge => edge.side), ['top', 'bottom', 'left', 'right']);
  assert.equal(door.finishedWidth - door.width, 2);
  assert.equal(door.finishedHeight - door.height, 2);
  assert.equal(describePartEdges(door), 'Сверху 1 мм; Снизу 1 мм; Слева 1 мм; Справа 1 мм');
});

test('physical edge descriptions follow production orientation and are localized without view labels', () => {
  const part = { width: 600, height: 400, edges: { top: 1, bottom: 2, left: 1, right: 0 } };
  assert.equal(describePartEdges({ ...part, orientation: 'horizontal' }, { language: 'en' }), 'Back 1 mm; Front 2 mm; Left 1 mm');
  assert.equal(describePartEdges({ ...part, orientation: 'vertical-depth' }, { language: 'tr' }), 'Üst 1 mm; Alt 2 mm; Ön 1 mm');
  assert.equal(describePartEdges({ ...part, orientation: 'vertical-width' }, { language: 'ru' }), 'Сверху 1 мм; Снизу 2 мм; Слева 1 мм');
  for (const language of ['tr', 'en']) {
    const svg = createPartSvg({ ...part, orientation: 'horizontal' }, { materials: [] }, { language });
    assert.doesNotMatch(svg, /[А-Яа-яЁё]/);
    assert.doesNotMatch(svg, /Front view|Back view|Ön görünüş|Arka görünüş/);
  }
});

test('L blanks mark only their real outer segments and retain finished perimeter totals after edge deduction', () => {
  const finishedOutline = [{ x: 300, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }, { x: 0, y: 200 }, { x: 300, y: 200 }];
  const part = { id: 'l-panel', width: 998, height: 598, finishedWidth: 1000, finishedHeight: 600, thickness: 18, materialId: 'white', orientation: 'horizontal',
    edges: { top: 1, bottom: 1, left: 1, right: 1 }, finishedOutline,
    outline: [{ x: 299, y: 0 }, { x: 998, y: 0 }, { x: 998, y: 598 }, { x: 0, y: 598 }, { x: 0, y: 199 }, { x: 299, y: 199 }] };
  const bands = getPartEdgeBanding(part), svg = createPartSvg(part, { materials: [] }), marked = markedEdges(svg);
  assert.deepEqual(Object.values(bands.edges).map(edge => edge.lengthMm), [700, 1000, 400, 600]);
  assert.equal(getEdgeBandingSummary([part]).lengthMm, 2700);
  assert.equal(marked.length, 4, 'the two inner notch edges are not automatically banded');
  // The projection scale is controlled by blank height (430 / 598).
  const scale = Math.min(800 / part.width, 430 / part.height);
  const point = ({ x, y }) => [Math.round((500 + (x - part.width / 2) * scale) * 100) / 100, Math.round((320 + (y - part.height / 2) * scale) * 100) / 100];
  assert.deepEqual(marked.find(edge => edge.side === 'top').start, point(part.outline[0]));
  assert.deepEqual(marked.find(edge => edge.side === 'left').end, point(part.outline[4]));
  assert.match(svg, /Заготовка без кромки: 998 × 598 мм/);
  assert.match(svg.replace(/[\u00a0\u202f]/g, ' '), /Готовый размер с кромкой: 1 000 × 600 мм/);
  const noOuterTop = { ...part, edges: { top: 1 }, finishedOutline: [{ x: 300, y: 200 }, { x: 1000, y: 200 }, { x: 1000, y: 600 }, { x: 300, y: 600 }] };
  assert.equal(describePartEdges(noOuterTop), '—', 'an absent bounding edge is excluded from the description');
  assert.equal(markedEdges(createPartSvg(noOuterTop, { materials: [] })).length, 0);
});

test('3D L-panels use the finished contour while the manufacturing SVG uses the smaller cut blank', () => {
  const project = shelfProject(), cabinet = project.cabinets[0];
  cabinet.cutout = { corner: 'back-left', width: 200, depth: 220 };
  cabinet.layout.shelves = 0;
  const top = generateParts(project).find(part => part.name === 'Крышка'), before = structuredClone(project);
  assert.notDeepEqual(top.finishedOutline, top.outline);
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop() {} }), measureText: text => ({ width: String(text).length * 6 }) }, { get: (target, key) => key in target ? target[key] : () => {} });
  const canvas = { style: {}, getContext: () => context, getBoundingClientRect: () => ({ width: 900, height: 700, left: 0, top: 0 }), setAttribute() {}, addEventListener() {}, removeEventListener() {} };
  const viewport = new FurnitureViewport(canvas);
  try {
    viewport.setProject(project, cabinet.id);
    viewport.setOptions({ focusCabinet: true, room: false });
    viewport.setView('top');
    const cap = viewport.hits.find(face => face.partId === top.id && face.points.length === top.finishedOutline.length);
    assert.ok(cap);
    const geometry = cap.points.map(p => [p[0] - cabinet.x - top.position.x, p[2] - cabinet.z - top.position.z]);
    assert.deepEqual(geometry, top.finishedOutline.map(p => [p.x, p.y]));
    assert.equal(Math.max(...geometry.map(p => p[1])), top.finishedHeight);
    const cut = createPartSvg(top, project);
    assert.match(cut, /data-part-cut-outline="true"/);
    assert.match(cut, /data-part-finished-size="true"/);
  } finally { viewport.destroy(); }
  assert.deepEqual(project, before);
});
