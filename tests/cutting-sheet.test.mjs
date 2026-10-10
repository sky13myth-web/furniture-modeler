import test from 'node:test';
import assert from 'node:assert/strict';
import { createCuttingSheetSvg, createCuttingSheetPrintPages } from '../src/cutting-sheet.js';
import { createDefaultProject, createSection } from '../src/engine.js';
import { checkFactoryProject } from '../src/factory-export.js';

test('rotated L cut diagrams use the exact optimiser contour and shared global part code', () => {
  const part = { id: 'l-part', name: 'Крышка', cabinetName: 'Шкаф', width: 1164, height: 616,
    outline: [{ x: 200, y: 0 }, { x: 1164, y: 0 }, { x: 1164, y: 616 }, { x: 0, y: 616 }, { x: 0, y: 220 }, { x: 200, y: 220 }] };
  const placement = { partId: part.id, x: 10, y: 30, width: 616, height: 1164, rotated: true,
    outline: [{ x: 616, y: 200 }, { x: 616, y: 1164 }, { x: 0, y: 1164 }, { x: 0, y: 0 }, { x: 396, y: 0 }, { x: 396, y: 200 }] };
  const sheet = { width: 2100, height: 2800, placements: [placement] }, parts = [{ id: 'earlier-part' }, part];
  const svg = createCuttingSheetSvg(sheet, parts);
  assert.match(svg, /data-production-part="P0002"/);
  assert.match(svg, /points="626,230 626,1194 10,1194 10,30 406,30 406,230"/);
  const legacy = { ...placement }; delete legacy.outline;
  assert.equal(createCuttingSheetSvg({ ...sheet, placements: [legacy] }, parts), svg);
  assert.ok(svg.includes('P0002 · Шкаф · Крышка')); assert.doesNotMatch(svg, />1<\/text>/);
});

test('grain axes and numeric precision survive a print sheet without interpreting names as markup', () => {
  const part = { id: 'p', name: '<shelf>', cabinetName: 'Cabinet', grain: true };
  const sheet = { width: 2100, height: 2800, placements: [{ partId: 'p', x: 10, y: 10, width: 599.125, height: 860.5 }] };
  const svg = createCuttingSheetSvg(sheet, [part], { language: 'en' });
  assert.match(svg, /data-grain-axis="B"/); assert.match(svg, /599\.125 × 860\.5/);
  assert.match(svg, /&lt;shelf&gt;/); assert.doesNotMatch(svg, /<shelf>/);
});

function inside(x, y, polygon) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

test('deep mirrored L notches keep the complete B-axis arrow and both labels on actual material without changing the cut contour', () => {
  for (const corner of ['back-left', 'back-right']) {
    const project = createDefaultProject('en'), cabinet = project.cabinets[0];
    Object.assign(cabinet, { width: 947.625, height: 1431.875, depth: 657.25, plinth: 113.5, edgeBand: .75, sidesToFloor: false,
      materialId: 'mdf-oak', frontMaterialId: 'mdf-oak', layout: { ...createSection('open'), id: 'deep-opening', shelves: 1 }, cutout: { corner, width: 251.875, depth: 560 } });
    const result = checkFactoryProject(project);
    assert.equal(result.valid, true);
    const roof = result.parts.find(part => part.name === 'Крышка'), sourceSheet = result.cutting.sheets.find(sheet => sheet.placements.some(placement => placement.partId === roof.id));
    const placement = sourceSheet.placements.find(placement => placement.partId === roof.id), sheet = { ...sourceSheet, placements: [placement] }, before = structuredClone({ sheet, parts: result.parts });
    const svg = createCuttingSheetSvg(sheet, result.parts, { language: 'en' });
    const path = svg.match(/<path data-grain-axis="B" d="([^"]+)"/)[1];
    const points = [...path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(([, x, y]) => ({ x: Number(x) - placement.x, y: Number(y) - placement.y }));
    assert.equal(points.length, 5);
    assert.equal(points[0].x, points[1].x, 'the B axis remains vertical along stock-sheet height');
    for (const point of points) assert.ok(inside(point.x, point.y, placement.outline), `${corner}: arrow vertex ${point.x},${point.y} stays in material`);
    const texts = [...svg.matchAll(/<text x="([^"]+)" y="([^"]+)"[^>]*>/g)];
    assert.equal(texts.length, 2);
    for (const [, x, y] of texts) assert.ok(inside(Number(x) - placement.x, Number(y) - placement.y, placement.outline), `${corner}: the P code and size caption stay in material`);
    const contour = placement.outline.map(point => `${Math.round((placement.x + point.x) * 1000) / 1000},${Math.round((placement.y + point.y) * 1000) / 1000}`).join(' ');
    assert.ok(svg.includes(`data-cut-contour="true" points="${contour}"`));
    assert.deepEqual({ sheet, parts: result.parts }, before);
  }
});

test('print layouts identify narrow strips through readable leaders and a fixed A4 legend', () => {
  const parts = [{ id: 'earlier' }, { id: 'strip', name: 'Цокольная планка', cabinetName: 'Шкаф', width: 900, height: 18, grain: false }];
  const sheet = { width: 2100, height: 2800, materialName: 'MDF', thickness: 18, placements: [{ partId: 'strip', x: 10, y: 10, width: 900, height: 18 }] };
  const before = structuredClone({ parts, sheet });
  const [svg] = createCuttingSheetPrintPages(sheet, parts, { language: 'en', documentInfo: { id: 'AT-TEST', date: '2026-10-10' } });
  assert.match(svg, /width="297mm" height="210mm" viewBox="0 0 1120 792"/);
  assert.match(svg, /data-label-leader="P0002"/);
  assert.match(svg, /data-print-legend-part="P0002"/);
  assert.match(svg, />900 × 18<\/text>/);
  assert.match(svg, /AT-TEST/); assert.match(svg, /2026-10-10/);
  assert.match(svg, /Do not measure the image/); assert.match(svg, /Dimensions are nominal/);
  assert.ok([...svg.matchAll(/font-size="([\d.]+)"/g)].every(([, size]) => Number(size) * 297 / 1120 >= 3.5));
  assert.doesNotMatch(svg, /data-map-label="P0002"/, 'a strip cannot receive a label that exceeds its physical area');
  assert.deepEqual({ parts, sheet }, before);
});

test('dense print layouts repeat the stock map while every identified legend part appears exactly once', () => {
  const parts = Array.from({ length: 37 }, (_, index) => ({ id: `strip-${index}`, name: `Strip ${index}`, width: 200, height: 20 }));
  const sheet = { width: 2100, height: 2800, materialName: 'MDF', thickness: 18,
    placements: parts.map((part, index) => ({ partId: part.id, x: 10, y: 10 + index * 24, width: part.width, height: part.height })) };
  const pages = createCuttingSheetPrintPages(sheet, parts, { language: 'tr', documentInfo: { id: 'AT-DENSE', date: '2026-10-10' } });
  assert.equal(pages.length, 3);
  const legendCodes = pages.flatMap(svg => [...svg.matchAll(/data-print-legend-part="([^"]+)"/g)].map(([, code]) => code));
  assert.equal(legendCodes.length, parts.length); assert.equal(new Set(legendCodes).size, parts.length);
  for (const [index, svg] of pages.entries()) {
    assert.match(svg, new RegExp(`data-page="${index + 1}" data-page-count="3"`));
    assert.match(svg, new RegExp(`Sayfa: ${index + 1}/3`));
    assert.equal([...svg.matchAll(/data-production-part="P\d+"/g)].length, parts.length, 'each page retains the full stock map');
    assert.ok([...svg.matchAll(/font-size="([\d.]+)"/g)].every(([, size]) => Number(size) >= 14));
  }
});
