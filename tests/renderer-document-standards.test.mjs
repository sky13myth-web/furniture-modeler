import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, generateParts } from '../src/engine.js';
import { createDrawingSvg, createPartSvg, generateDrawingHTML, generateCabinet3DHTML, generateRoom3DHTML } from '../src/renderer.js';
import { getDocumentInfo, printDocumentText, documentMetadataLine } from '../src/print-document.js';

test('all physical drawing sheets share a content identity and contiguous page numbers, including full SVG sheets', () => {
  const project = createDefaultProject('en'), before = structuredClone(project), cabinetId = project.cabinets[0].id;
  for (const language of ['ru', 'tr', 'en']) for (const compact of [true, false]) {
    const html = generateDrawingHTML(project, { cabinetId, language, compact });
    const sheets = [...html.matchAll(/<section\b[^>]*class="sheet(?: [^"]*)?"[^>]*data-document-page="(\d+)" data-document-page-count="(\d+)"/g)];
    assert.ok(sheets.length > 0);
    for (let index = 0; index < sheets.length; index++) {
      assert.equal(Number(sheets[index][1]), index + 1);
      assert.equal(Number(sheets[index][2]), sheets.length);
      assert.ok(html.includes(documentMetadataLine(getDocumentInfo(project), { language, page: index + 1, pageCount: sheets.length })));
    }
    assert.ok(html.includes(printDocumentText('nominalTolerances', language)));
    assert.ok(html.includes(printDocumentText('notToScale', language)));
  }
  assert.deepEqual(project, before);
});

test('compact labels retain a comfortable nominal print font instead of squeezing tall paired doors into six views', () => {
  const project = createDefaultProject('en'), cabinetId = project.cabinets[0].id;
  const html = generateDrawingHTML(project, { cabinetId, language: 'en' });
  assert.deepEqual(html.match(/data-projections="\d"/g), ['data-projections="2"', 'data-projections="2"']);
  for (const view of ['front','interior']) assert.match(html, new RegExp(`data-drawing-view="${view}" data-annotation-page="1"`));
  for (const [svg] of html.matchAll(/<svg[^>]*data-compact-view="[^"]+"[\s\S]*?<\/svg>/g)) {
    const fontSizes = [...svg.matchAll(/font-size="([\d.]+)"/g)].map(match => Number(match[1]));
    assert.ok(fontSizes.every(size => size >= 14));
    // A4: 170 mm grid height, 676-unit panel; em >= 3.5 mm. Font em
    // is deliberately not described as the actual height of the capitals.
    assert.ok(Math.min(138.5 / 530, 170 / 676) * Math.min(...fontSizes) >= 3.5);
  }
});

test('cutting detail identifies physical edges and its own view without altering any panel coordinates', () => {
  const project = createDefaultProject('en'), parts = generateParts(project), before = structuredClone(parts);
  const expected = { horizontal: ['View from above', 'rear to front'], 'vertical-depth': ['View from the right', 'front to rear'], 'vertical-width': ['View from the front', 'top to bottom'] };
  for (const [orientation, words] of Object.entries(expected)) {
    const part = parts.find(candidate => candidate.orientation === orientation), svg = createPartSvg(part, project, { language: 'en' });
    for (const word of words) assert.ok(svg.includes(word));
    for (const edge of ['top', 'bottom', 'left', 'right']) assert.ok(svg.includes(`data-physical-edge="${edge}"`));
    assert.ok(svg.includes('different orientations'));
    assert.ok(svg.includes(getDocumentInfo(project).id));
    assert.ok(svg.includes(printDocumentText('notToScale', 'en')));
  }
  assert.deepEqual(parts, before);
});

test('banding is readable in monochrome and unbanded back panels remain unmarked', () => {
  const project = createDefaultProject('en'), parts = generateParts(project), facade = parts.find(part => /Дверь 1$/.test(part.name)), back = parts.find(part => part.component === 'back');
  const svg = createPartSvg(facade, project, { language: 'en' });
  assert.deepEqual([...svg.matchAll(/data-edge-band-code="([^"]+)"/g)].map(match => match[1]).sort(), ['E1', 'E2', 'E3', 'E4']);
  assert.equal((svg.match(/data-edge-band-monochrome=/g) ?? []).length, 4);
  assert.ok(svg.includes('Double line'));
  const plain = createPartSvg(back, project, { language: 'en' });
  assert.doesNotMatch(plain, /data-edge-band-code|data-edge-band-monochrome/);
});

test('standalone cabinet and room illustrations cannot be mistaken for dimensioned manufacturing sheets', () => {
  const project = createDefaultProject('en'), imageDataUrl = 'data:image/png;base64,aGVsbG8=';
  for (const language of ['ru', 'tr', 'en']) {
    const documents = [generateCabinet3DHTML(project, { cabinetId: project.cabinets[0].id, imageDataUrl, language }), generateRoom3DHTML(project, { imageDataUrl, language })];
    for (const html of documents) {
      assert.ok(html.includes(printDocumentText('illustration', language)));
      assert.ok(html.includes(printDocumentText('notToScale', language)));
      assert.ok(html.includes(printDocumentText('nominalTolerances', language)));
      assert.ok(html.includes(documentMetadataLine(getDocumentInfo(project), { language })));
    }
    const projection = createDrawingSvg(project, 'front', { cabinetId: project.cabinets[0].id, language });
    assert.ok(projection.includes(printDocumentText('notToScale', language)));
  }
});
